/**
 * PROTOTYPE — session state + LIVE DATA for the Calendar tab.
 *
 * The Calendar tab replaced the Plan and Train tabs, so this store now also
 * adapts the user's REAL generated plan into the calendar's shapes:
 *
 *   - `ensureLiveCalendarData()` fetches the active plan once per session and
 *     lazily resolves each exercise's muscle/equipment from the catalog
 *     (plan rows persist no muscle metadata — only `exerciseId` + name +
 *     prescription). Until catalog metadata lands, a name heuristic colours
 *     the exercise; cells re-render as lookups resolve.
 *   - `plannedDayForDate()` maps any date onto the plan via its
 *     `weekAnchorMonday` (program week = whole weeks since the anchor).
 *     When there is no plan (or no backend — the web demo), the sample split
 *     from planCalendarPrototype keeps every view populated.
 *   - `ensureLogsForMonth()` + `isDayCompleted()` back the month grid's
 *     gold-sealed (completed) days: a real completed workout log on that
 *     LOCAL day, or every set of every exercise logged in this session.
 *
 * Persistence: day edits rebuild the plan slot on the server; completed and
 * partial sessions POST real workout logs; in-progress set logs are
 * crash-safe via an AsyncStorage snapshot.
 */

import {
  WEEKDAYS,
  addDays,
  fromIso,
  mondayOf,
  toIso,
  weekdayIndex,
  type PlannedDay,
  type PlannedExercise,
  type PrototypeMuscle,
} from './planCalendarPrototype';
import {
  addPlanSlot,
  getCurrentPlanWithWeekly,
  removePlanSlot,
  type ApiPlan,
  type ApiPlanExercise,
  type ApiPlanWorkout,
  type PlanSlot,
  type PlanSlotExercise,
} from '../services/planService';
import {
  createWorkout,
  getWorkoutLogs,
  materializePlanSlotWorkout,
} from '../services/workoutService';
import { getExerciseById, type Exercise as CatalogExercise } from '../services/exerciseService';
import type { Workout } from '../types/workout';
import { api } from '../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type SetLog = { reps: string; weight: string };

/** Key = one exercise slot on one date. */
function slotKey(dateIso: string, exerciseIndex: number): string {
  return `${dateIso}#${exerciseIndex}`;
}

const replacements = new Map<string, PlannedExercise>();
/** dateIso → exercises appended after the day's base list ("+ Add Exercise"). */
const additions = new Map<string, PlannedExercise[]>();
const setLogs = new Map<string, SetLog[]>();
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

/** Screens subscribe to re-render on any replace/log/live update. */
export function subscribePlanCalendar(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ---------------------------------------------------------------------------
// Crash-safe session state: logged sets survive an app restart
// ---------------------------------------------------------------------------

/** First-set timestamp per date, so the synced log has an honest startedAt. */
const dayStartTimes = new Map<string, string>();
/** Days whose completed log has been (or is being) written to the backend. */
const syncedDays = new Set<string>();
/** Detects a DIFFERENT plan arriving (apply/regenerate) vs a refetch of the
 *  same one — only the former invalidates session overlays. Persisted, so a
 *  cold start doesn't read as a new plan and wipe hydrated logs. */
let lastSeenPlanId: string | null = null;

/** Device-scoped (not per-account) — acceptable for now; sets are keyed by
 *  date+slot and pruned after 14 days. */
const SESSION_STORAGE_KEY = 'jim_calendar_session_v1';

const sessionHydrated: Promise<void> = (async () => {
  try {
    const raw = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as {
      setLogs?: Record<string, SetLog[]>;
      dayStartTimes?: Record<string, string>;
      syncedDays?: string[];
      lastSeenPlanId?: string | null;
    };
    const cutoff = toIso(addDays(new Date(), -14));
    for (const [k, v] of Object.entries(data.setLogs ?? {})) {
      if (k.slice(0, 10) >= cutoff && !setLogs.has(k)) setLogs.set(k, v);
    }
    for (const [k, v] of Object.entries(data.dayStartTimes ?? {})) {
      if (k >= cutoff && !dayStartTimes.has(k)) dayStartTimes.set(k, v);
    }
    for (const d of data.syncedDays ?? []) {
      if (d >= cutoff) syncedDays.add(d);
    }
    // Without this, every cold start looks like a NEW plan and wipes the
    // freshly hydrated logs.
    if (lastSeenPlanId == null) lastSeenPlanId = data.lastSeenPlanId ?? null;
    emit();
  } catch {
    // Corrupt/missing snapshot: start clean.
  }
})();

let sessionSaveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSessionSave(): void {
  if (sessionSaveTimer) clearTimeout(sessionSaveTimer);
  sessionSaveTimer = setTimeout(() => {
    // Never write before hydration finishes, or a fast first set could be
    // clobbered by the old snapshot.
    void sessionHydrated.then(() =>
      AsyncStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          setLogs: Object.fromEntries(setLogs),
          dayStartTimes: Object.fromEntries(dayStartTimes),
          syncedDays: [...syncedDays],
          lastSeenPlanId,
        }),
      ).catch(() => {}),
    );
  }, 300);
}

// ---------------------------------------------------------------------------
// Live plan
// ---------------------------------------------------------------------------

type LiveStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

let liveStatus: LiveStatus = 'idle';
let livePlan: ApiPlan | null = null;
/** Materialized Workout rows for the plan (slot ↔ workout via planWorkoutId). */
let liveWorkouts: Workout[] = [];
/** One-time landing redirect to the plan's first populated week. */
let anchorAutoJumpConsumed = false;
let lastFetchMs = 0;
/** exerciseId → resolved catalog metadata. */
const exerciseMeta = new Map<string, { muscle: PrototypeMuscle; equipment: string }>();
const pendingMetaIds = new Set<string>();
/** LOCAL days with a completed workout log. */
const completedLogDays = new Set<string>();
/** 'YYYY-M' month keys whose logs were already fetched. */
const fetchedLogMonths = new Set<string>();

/** The real active plan, once loaded (null in sample/offline mode). */
export function getLivePlan(): ApiPlan | null {
  return liveStatus === 'ready' ? livePlan : null;
}

/**
 * Fetch the active plan once per session. Safe to call from every calendar
 * screen mount; failures (no backend, offline) leave the sample data active.
 */
export function ensureLiveCalendarData(): void {
  if (liveStatus !== 'idle') return;
  liveStatus = 'loading';
  void (async () => {
    try {
      // The new-plan check below compares against the persisted plan id.
      await sessionHydrated;
      const { plan, weeklyWorkouts } = await getCurrentPlanWithWeekly();
      livePlan = plan;
      liveWorkouts = weeklyWorkouts ?? [];
      liveStatus = 'ready';
      lastFetchMs = Date.now();
      // A DIFFERENT plan arriving (first load, template applied, regenerated)
      // re-bases every day, so index-keyed session overlays would land on the
      // wrong slots. A refetch of the same plan keeps them.
      if (plan && plan.id !== lastSeenPlanId) {
        replacements.clear();
        additions.clear();
        setLogs.clear();
        scheduleSessionSave();
        // A new plan also deserves the week-1 landing jump again.
        anchorAutoJumpConsumed = false;
      }
      lastSeenPlanId = plan?.id ?? lastSeenPlanId;
      emit();
      if (plan) void loadExerciseMeta(plan);
    } catch {
      liveStatus = 'unavailable';
      lastFetchMs = Date.now();
      emit();
    }
  })();
}

/**
 * Focus-time refetch (throttled): the calendar must notice a plan applied or
 * regenerated elsewhere in the app during this session. `force` skips the
 * throttle — the post-apply landing (the 'PlanList' alias) uses it, since a
 * template can be applied within seconds of the first fetch.
 */
export function refreshLiveCalendarData(force = false): void {
  if (liveStatus === 'loading' || liveStatus === 'idle') {
    ensureLiveCalendarData();
    return;
  }
  if (!force && Date.now() - lastFetchMs < 10_000) return;
  liveStatus = 'idle';
  ensureLiveCalendarData();
}

/** Resolve muscle/equipment for every exercise id the plan references. */
async function loadExerciseMeta(plan: ApiPlan): Promise<void> {
  const ids = new Set<string>();
  for (const pw of plan.planWorkouts ?? []) {
    for (const ex of pw.exercises ?? []) {
      if (ex.exerciseId) ids.add(ex.exerciseId);
    }
  }
  const missing = [...ids].filter((id) => !exerciseMeta.has(id) && !pendingMetaIds.has(id));
  const BATCH = 8;
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    batch.forEach((id) => pendingMetaIds.add(id));
    await Promise.all(
      batch.map(async (id) => {
        try {
          const ex = await getExerciseById(id);
          exerciseMeta.set(id, {
            muscle: muscleFromCatalog(ex.primaryMuscleGroup, ex.subMuscles, ex.name),
            equipment: formatEquipment(ex.equipment),
          });
        } catch {
          // Heuristic colouring stays for this id.
        } finally {
          pendingMetaIds.delete(id);
        }
      }),
    );
    emit();
  }
}

/** Fetch completed-workout logs covering a displayed month (grid range). */
export function ensureLogsForMonth(monthDate: Date): void {
  const key = `${monthDate.getFullYear()}-${monthDate.getMonth()}`;
  if (fetchedLogMonths.has(key)) return;
  fetchedLogMonths.add(key);
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const last = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  void getWorkoutLogs({
    from: toIso(mondayOf(first)),
    to: toIso(addDays(mondayOf(last), 6)),
  })
    .then((logs) => {
      let changed = false;
      for (const log of logs) {
        if (log.completedAt == null) continue;
        const day = toIso(new Date(log.startedAt));
        if (!completedLogDays.has(day)) {
          completedLogDays.add(day);
          changed = true;
        }
      }
      if (changed) emit();
    })
    .catch(() => {
      fetchedLogMonths.delete(key);
    });
}

// ---------------------------------------------------------------------------
// Real plan → calendar-day mapping
// ---------------------------------------------------------------------------

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Anchor Monday of program week 1 (local). Legacy anchorless plans treat the
 *  current week as week 1. */
function planAnchorMonday(plan: ApiPlan): Date {
  const raw = plan.weekAnchorMonday;
  if (raw) return mondayOf(fromIso(String(raw).slice(0, 10)));
  return mondayOf(new Date());
}

/** Some plans store week numbers 0-based; normalize to 1-based. */
function weekNumberOffset(plan: ApiPlan): number {
  const nums = (plan.planWorkouts ?? []).map((pw) => pw.weekNumber);
  return nums.length > 0 && Math.min(...nums) === 0 ? 1 : 0;
}

/** The plan's slots for a LOCAL date (empty on rest/out-of-program days). */
function liveSlotsForDate(dateIso: string): ApiPlanWorkout[] {
  if (liveStatus !== 'ready' || !livePlan?.planWorkouts?.length) return [];
  const date = fromIso(dateIso);
  const weekday = WEEKDAYS[weekdayIndex(date)];
  const anchor = planAnchorMonday(livePlan);
  const programWeek =
    Math.round((mondayOf(date).getTime() - anchor.getTime()) / WEEK_MS) + 1;
  const offset = weekNumberOffset(livePlan);
  return livePlan.planWorkouts
    .filter((pw) => pw.weekNumber + offset === programWeek && pw.dayOfWeek === weekday)
    .sort((a, b) => a.orderInDay - b.orderInDay);
}

function liveDayForDate(dateIso: string): PlannedDay | null {
  if (liveStatus !== 'ready' || !livePlan?.planWorkouts?.length) return null;
  const weekday = WEEKDAYS[weekdayIndex(fromIso(dateIso))];
  const slots = liveSlotsForDate(dateIso);
  if (slots.length === 0) return { weekday, title: 'Rest Day', exercises: [] };
  const exercises = slots.flatMap((slot) =>
    (slot.exercises ?? [])
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((ex) => toPlannedExercise(ex, slot)),
  );
  const title = slots.map((s) => s.title).filter(Boolean).join(' + ') || 'Workout';
  return { weekday, title, exercises };
}

function toPlannedExercise(ex: ApiPlanExercise, slot: ApiPlanWorkout): PlannedExercise {
  const meta = ex.exerciseId ? exerciseMeta.get(ex.exerciseId) : undefined;
  const isCardio = slot.type === 'cardio';
  const name = ex.name ?? 'Exercise';
  return {
    name,
    exerciseId: ex.exerciseId ?? undefined,
    muscle: meta?.muscle ?? guessMuscleFromName(name, isCardio),
    sets: ex.sets > 0 ? ex.sets : 1,
    reps: formatRepsDisplay(ex),
    weight: ex.weight != null && ex.weight > 0 ? `${ex.weight} lb` : 'Bodyweight',
    rest: isCardio ? '—' : restHeuristic(name, ex.sets),
    equipment: meta?.equipment ?? '—',
    note: ex.notes ?? '',
  };
}

/**
 * Rest guidance by movement class (generation-time restSeconds isn't
 * persisted): heavy compounds breathe longest, isolation work shortest.
 */
function restHeuristic(name: string, sets: number): string {
  const n = name.toLowerCase();
  if (/(squat|deadlift|bench|overhead press|barbell row|pull-up|pullup|hip thrust|lunge|clean|snatch|leg press)/.test(n)) {
    return sets >= 4 ? '3:00' : '2:30';
  }
  if (/(curl|raise|fly|pushdown|push-down|extension|crunch|plank|calf|face pull|kickback|shrug|rotation)/.test(n)) {
    return '1:30';
  }
  return '2:00';
}

function formatRepsDisplay(ex: ApiPlanExercise): string {
  if (ex.prescriptionType === 'time' || (ex.durationSeconds ?? 0) > 0) {
    const s = ex.durationSeconds ?? 0;
    if (s >= 60) return `${Math.round(s / 60)} min`;
    return `${s} sec`;
  }
  if (ex.repsMin != null && ex.repsMax != null && ex.repsMax > ex.repsMin) {
    return `${ex.repsMin}–${ex.repsMax}`;
  }
  return `${ex.reps}`;
}

function formatEquipment(equipment: string[] | undefined): string {
  if (!equipment?.length) return '—';
  return equipment
    .map((e) => e.charAt(0).toUpperCase() + e.slice(1))
    .join(' + ');
}

/** Catalog group/subMuscles → the calendar's 12-muscle palette. */
export function muscleFromCatalog(
  group: string | undefined,
  subMuscles: string[] | undefined,
  name: string,
): PrototypeMuscle {
  const g = (group ?? '').toLowerCase();
  const subs = (subMuscles ?? []).join(' ').toLowerCase();
  if (g === 'chest') return 'Chest';
  if (g === 'back') return 'Back';
  if (g === 'shoulders') return 'Shoulders';
  if (g === 'core' || g === 'abs') return 'Core';
  if (g === 'cardio') return 'Cardio';
  if (g === 'arms') {
    if (subs.includes('tricep')) return 'Triceps';
    if (subs.includes('forearm')) return 'Forearms';
    return 'Biceps';
  }
  if (g === 'legs') {
    if (subs.includes('quad')) return 'Quads';
    if (subs.includes('hamstring')) return 'Hamstrings';
    if (subs.includes('glute')) return 'Glutes';
    if (subs.includes('calf') || subs.includes('calves')) return 'Calves';
    return 'Quads';
  }
  return guessMuscleFromName(name, false);
}

/** Name-keyword fallback while catalog metadata is loading (order matters). */
function guessMuscleFromName(name: string, isCardio: boolean): PrototypeMuscle {
  if (isCardio) return 'Cardio';
  const n = name.toLowerCase();
  if (/(run|jog|treadmill|bike|cycl|rower|rowing machine|elliptical|stair|sprint|jump rope|burpee|interval|cardio)/.test(n)) return 'Cardio';
  if (/(calf|calves)/.test(n)) return 'Calves';
  if (/(leg curl|hamstring|deadlift|rdl|good morning|nordic)/.test(n)) return 'Hamstrings';
  if (/(hip thrust|glute|kickback)/.test(n)) return 'Glutes';
  if (/(squat|leg press|leg extension|lunge|step-up|step up|pistol)/.test(n)) return 'Quads';
  if (/(crunch|plank|sit-up|situp|ab wheel|abs|dead bug|russian twist|hanging knee|hanging leg|pallof)/.test(n)) return 'Core';
  if (/(wrist|forearm|carry|grip|dead hang)/.test(n)) return 'Forearms';
  if (/curl/.test(n)) return 'Biceps';
  if (/(pushdown|push-down|skull|tricep|close-grip|dip)/.test(n)) return 'Triceps';
  if (/(row|pull-up|pullup|pulldown|pull-down|pullover|chin-up|chinup|lat |shrug)/.test(n)) return 'Back';
  if (/(lateral raise|front raise|rear delt|face pull|shoulder|overhead press|arnold|military|delt)/.test(n)) return 'Shoulders';
  if (/(bench|push-up|pushup|chest|fly|press)/.test(n)) return 'Chest';
  return 'Chest';
}

// ---------------------------------------------------------------------------
// The calendar's day API (live plan when present, sample split otherwise)
// ---------------------------------------------------------------------------

/**
 * What the calendar is showing:
 *  - 'live'    — the user's real plan
 *  - 'empty'   — signed in, backend fine, but NO active plan
 *  - 'offline' — backend unreachable: the calendar renders open days
 *  - 'loading' — first fetch still in flight
 */
export type CalendarDataMode = 'live' | 'empty' | 'offline' | 'loading';

export function calendarDataMode(): CalendarDataMode {
  if (liveStatus === 'ready') return livePlan ? 'live' : 'empty';
  if (liveStatus === 'unavailable') return 'offline';
  return 'loading';
}

function baseDayForDate(dateIso: string): PlannedDay {
  const live = liveDayForDate(dateIso);
  if (live) return live;
  return { weekday: WEEKDAYS[weekdayIndex(fromIso(dateIso))], title: 'Rest Day', exercises: [] };
}

// ---------------------------------------------------------------------------
// Program-week context ("Week N of M", the pre-anchor dead zone)
// ---------------------------------------------------------------------------

export type ProgramWeekInfo =
  | { state: 'in'; week: number; totalWeeks: number; planName: string }
  | { state: 'before'; startsMondayIso: string; planName: string }
  | { state: 'after'; totalWeeks: number; planName: string };

/** Where a calendar week sits inside the live plan (null in non-live modes). */
export function programWeekInfoFor(weekMondayIso: string): ProgramWeekInfo | null {
  if (liveStatus !== 'ready' || !livePlan?.planWorkouts?.length) return null;
  const anchor = planAnchorMonday(livePlan);
  const offset = weekNumberOffset(livePlan);
  const totalWeeks = Math.max(
    ...livePlan.planWorkouts.map((pw) => pw.weekNumber + offset),
    1,
  );
  const week =
    Math.round((fromIso(weekMondayIso).getTime() - anchor.getTime()) / WEEK_MS) + 1;
  const planName = livePlan.name ?? 'My Plan';
  if (week < 1) return { state: 'before', startsMondayIso: toIso(anchor), planName };
  if (week > totalWeeks) return { state: 'after', totalWeeks, planName };
  return { state: 'in', week, totalWeeks, planName };
}

/**
 * The dead-first-week fix: when the tab lands on the CURRENT week but the
 * plan's week 1 starts on a future Monday (a template applied midweek), the
 * landing week is empty and reads as "my plan didn't save". Returns the
 * anchor Monday to jump to — once per session, and only while the current
 * week is genuinely pre-program.
 */
export function consumeAnchorAutoJump(): string | null {
  if (anchorAutoJumpConsumed) return null;
  if (liveStatus !== 'ready' || !livePlan?.planWorkouts?.length) return null;
  const anchor = planAnchorMonday(livePlan);
  if (anchor.getTime() <= mondayOf(new Date()).getTime()) return null;
  anchorAutoJumpConsumed = true;
  return toIso(anchor);
}

/** The day's plan — real when a plan is loaded, sample otherwise — with
 *  session replacements applied and added exercises appended. */
export function plannedDayForDate(dateIso: string): PlannedDay {
  const base = baseDayForDate(dateIso);
  const added = additions.get(dateIso) ?? [];
  let exercises = base.exercises;
  if (replacements.size > 0) {
    exercises = exercises.map((ex, i) => replacements.get(slotKey(dateIso, i)) ?? ex);
  }
  if (added.length > 0) {
    exercises = [...exercises, ...added];
    // Exercises added onto a rest day turn it into a session.
    if (base.exercises.length === 0) {
      return { ...base, title: 'Custom Workout', exercises };
    }
  }
  return { ...base, exercises };
}

/**
 * Build a calendar exercise from a CATALOG row (the replace/add picker).
 * A replacement inherits the outgoing slot's prescription — same role in the
 * workout — except the weight, which only carries over when the new exercise
 * is actually loadable (a barbell weight on a bodyweight move reads as a bug).
 * Additions get sensible defaults instead.
 */
export function plannedExerciseFromCatalog(
  catalog: CatalogExercise,
  inherit: PlannedExercise | null,
): PlannedExercise {
  const muscle = muscleFromCatalog(
    catalog.primaryMuscleGroup,
    catalog.subMuscles,
    catalog.name,
  );
  const isCardio = muscle === 'Cardio';
  const equipmentText = (catalog.equipment ?? []).join(' ').toLowerCase();
  const bodyweightOnly =
    (catalog.equipment ?? []).length === 0 || equipmentText.includes('bodyweight');
  const inheritedWeight =
    inherit && inherit.weight !== 'Bodyweight' && inherit.weight !== '—'
      ? inherit.weight
      : null;
  return {
    name: catalog.name,
    exerciseId: catalog.id,
    muscle,
    sets: inherit?.sets ?? (isCardio ? 1 : 3),
    reps: inherit?.reps ?? (isCardio ? '10 min' : '8–12'),
    weight: bodyweightOnly ? 'Bodyweight' : inheritedWeight ?? '—',
    rest: inherit?.rest ?? (isCardio ? '—' : '2:00'),
    equipment: formatEquipment(catalog.equipment),
    note: '',
  };
}

/** Gold-sealed on the month grid: a completed log that LOCAL day, or (demo
 *  mode) every set of every exercise logged this session. */
export function isDayCompleted(dateIso: string): boolean {
  if (completedLogDays.has(dateIso)) return true;
  const day = plannedDayForDate(dateIso);
  if (day.exercises.length === 0) return false;
  return day.exercises.every(
    (ex, i) => (setLogs.get(slotKey(dateIso, i))?.length ?? 0) >= ex.sets,
  );
}

export function replaceExercise(
  dateIso: string,
  exerciseIndex: number,
  replacement: PlannedExercise,
): void {
  const baseLen = baseDayForDate(dateIso).exercises.length;
  if (exerciseIndex >= baseLen) {
    // Replacing an ADDED exercise: edit the additions list in place (the
    // replacements map only overlays base-slot indexes).
    const arr = [...(additions.get(dateIso) ?? [])];
    const ai = exerciseIndex - baseLen;
    if (ai < 0 || ai >= arr.length) return;
    arr[ai] = replacement;
    additions.set(dateIso, arr);
  } else {
    replacements.set(slotKey(dateIso, exerciseIndex), replacement);
  }
  // A different exercise: any sets logged against the old one no longer apply.
  setLogs.delete(slotKey(dateIso, exerciseIndex));
  scheduleSessionSave();
  queuePersistDayEdits(dateIso);
  emit();
}

/** "+ Add Exercise" — appended after the day's base list (works on rest days
 *  too, which become a Custom Workout). */
export function addExerciseToDay(dateIso: string, exercise: PlannedExercise): void {
  additions.set(dateIso, [...(additions.get(dateIso) ?? []), exercise]);
  queuePersistDayEdits(dateIso);
  emit();
}

// ---------------------------------------------------------------------------
// Persisting day edits into the plan itself
// ---------------------------------------------------------------------------

/** Serialize plan writes — two quick edits must not interleave add/remove. */
let persistChain: Promise<void> = Promise.resolve();

function queuePersistDayEdits(dateIso: string): void {
  if (liveStatus !== 'ready' || !livePlan) return;
  persistChain = persistChain.then(() => persistDayEdits(dateIso)).catch(() => {});
}

/** A display exercise back into a plan-slot row (null = not persistable). */
function toSlotExerciseRow(ex: PlannedExercise, orderIndex: number): PlanSlotExercise | null {
  if (!ex.exerciseId) return null;
  const row: PlanSlotExercise = {
    exerciseId: ex.exerciseId,
    name: ex.name,
    sets: ex.sets,
    reps: 1,
    orderIndex,
  };
  const time = ex.reps.match(/^(\d+)\s*(min|sec)$/i);
  if (time) {
    row.durationSeconds = Number(time[1]) * (time[2].toLowerCase() === 'min' ? 60 : 1);
    row.prescriptionType = 'time';
  } else {
    const range = ex.reps.match(/^(\d+)[–-](\d+)$/);
    if (range) {
      row.repsMin = Number(range[1]);
      row.repsMax = Number(range[2]);
      row.reps = Number(range[2]);
    } else {
      row.reps = Math.max(1, Number(ex.reps) || 1);
    }
  }
  const w = ex.weight.match(/^([\d.]+)\s*lb$/i);
  if (w) row.weight = Number(w[1]);
  return row;
}

/**
 * Write the day's replaces/adds into the plan: rebuild the day's slot with
 * the edited exercise list (add the new slot, then remove the old — worst
 * case a transient duplicate, never a lost day), or create a slot for a
 * custom rest-day session. On success the server plan becomes the base and
 * the session overlays for that day are cleared; on failure they simply
 * stay session-local. Multi-slot days keep session-only edits (rare).
 */
async function persistDayEdits(dateIso: string): Promise<void> {
  if (liveStatus !== 'ready' || !livePlan) return;
  const planId = livePlan.id;
  const slots = liveSlotsForDate(dateIso);
  if (slots.length > 1) return;
  const day = plannedDayForDate(dateIso);
  const rows: PlanSlotExercise[] = [];
  for (let i = 0; i < day.exercises.length; i++) {
    const row = toSlotExerciseRow(day.exercises[i], i);
    if (!row) return; // an un-catalogued row: keep everything session-local
    rows.push(row);
  }
  if (rows.length === 0) return;
  try {
    const date = fromIso(dateIso);
    const anchor = planAnchorMonday(livePlan);
    const programWeek =
      Math.round((mondayOf(date).getTime() - anchor.getTime()) / WEEK_MS) + 1;
    const offset = weekNumberOffset(livePlan);
    const old = slots[0];
    const slot: PlanSlot = old
      ? {
          weekNumber: old.weekNumber,
          dayOfWeek: old.dayOfWeek,
          title: old.title,
          detailLine: old.detailLine ?? undefined,
          type: old.type,
          durationMinutes: old.durationMinutes,
          intensity: old.intensity ?? undefined,
          orderInDay: old.orderInDay,
          exercises: rows,
        }
      : {
          weekNumber: Math.max(1, programWeek - offset),
          dayOfWeek: WEEKDAYS[weekdayIndex(date)],
          title: day.title,
          type: 'strength',
          durationMinutes: Math.max(15, rows.length * 8),
          exercises: rows,
        };
    let plan = await addPlanSlot(planId, slot);
    if (old) plan = await removePlanSlot(planId, old.id);
    // Server is now canonical for this day — drop the local overlays (they
    // would double-apply the additions on top of the rebuilt slot).
    for (let i = 0; i < day.exercises.length; i++) {
      replacements.delete(slotKey(dateIso, i));
    }
    additions.delete(dateIso);
    livePlan = plan;
    lastSeenPlanId = plan.id;
    emit();
    void loadExerciseMeta(plan);
  } catch (err) {
    console.warn('[calendar] failed to persist day edits:', err);
  }
}

export function getSetLogs(dateIso: string, exerciseIndex: number): SetLog[] {
  return setLogs.get(slotKey(dateIso, exerciseIndex)) ?? [];
}

export function logSet(dateIso: string, exerciseIndex: number, log: SetLog): void {
  const key = slotKey(dateIso, exerciseIndex);
  if (!dayStartTimes.has(dateIso)) {
    dayStartTimes.set(dateIso, new Date().toISOString());
  }
  setLogs.set(key, [...(setLogs.get(key) ?? []), log]);
  scheduleSessionSave();
  // The day's last set: persist the whole session as a real workout log.
  if (isDayFullyLogged(dateIso)) void syncDayCompletion(dateIso);
  emit();
}

// ---------------------------------------------------------------------------
// Backend persistence of completed calendar sessions
// ---------------------------------------------------------------------------

function isDayFullyLogged(dateIso: string): boolean {
  const day = plannedDayForDate(dateIso);
  if (day.exercises.length === 0) return false;
  return day.exercises.every(
    (ex, i) => (setLogs.get(slotKey(dateIso, i))?.length ?? 0) >= ex.sets,
  );
}

/** '5–8' → 8, '12' → 12, '10 min' → 0 (time work carries no rep count). */
function repsNumber(reps: string): number {
  const nums = reps.match(/\d+/g);
  if (!nums || /min|sec/i.test(reps)) return 0;
  return Number(nums[nums.length - 1]) || 0;
}

/** '185 lb' → 185; 'Bodyweight' / '—' → undefined. */
function weightLb(weight: string): number | undefined {
  const m = weight.match(/[\d.]+/);
  return m ? Number(m[0]) : undefined;
}

/**
 * POST the finished day as a real workout log, so History, Progress, streaks
 * and the month's completion seals all count it. Live-plan days log against
 * the slot's materialized Workout row (created idempotently on demand); a
 * custom rest-day session mints an ad-hoc Workout first. Sample/offline days
 * stay local. Failures stay local too — the in-session completion seal still
 * shows, and nothing retries this session (write-once endpoint; no dupes).
 */
async function syncDayCompletion(dateIso: string): Promise<void> {
  if (liveStatus !== 'ready' || !livePlan) return;
  if (syncedDays.has(dateIso)) return;
  syncedDays.add(dateIso);
  scheduleSessionSave();
  try {
    const day = plannedDayForDate(dateIso);
    const slots = liveSlotsForDate(dateIso);
    let workoutId: string | undefined;
    if (slots.length > 0) {
      const slot = slots[0];
      const linked = liveWorkouts.find((w) => w.planWorkoutId === slot.id);
      if (linked?.id) {
        workoutId = linked.id;
      } else {
        const materialized = await materializePlanSlotWorkout(slot.id);
        liveWorkouts = [...liveWorkouts, materialized];
        workoutId = materialized.id;
      }
    } else {
      // Custom session on a rest day: mint an ad-hoc Workout to log against.
      const created = await createWorkout({
        name: day.title,
        day: day.weekday,
        exercises: day.exercises.map((ex, i) => ({
          name: ex.name,
          sets: ex.sets,
          reps: Math.max(1, repsNumber(ex.reps)),
          weight: weightLb(ex.weight),
          exerciseId: ex.exerciseId,
          orderIndex: i,
        })),
      });
      workoutId = created.id;
    }
    if (!workoutId) return;

    // Date the log to the day being logged: sets checked "for Monday" while
    // it's still Thursday must not land in Thursday's history. Today's
    // sessions keep their true first-set timestamp.
    const actualStart = dayStartTimes.get(dateIso) ?? new Date().toISOString();
    const elapsedMs = Math.max(0, Date.now() - Date.parse(actualStart));
    const isToday = dateIso === toIso(new Date());
    const startedAt = isToday
      ? actualStart
      : new Date(fromIso(dateIso).getTime() + 12 * 60 * 60 * 1000).toISOString();
    const completedAt = new Date(Date.parse(startedAt) + elapsedMs).toISOString();
    let totalSets = 0;
    let totalVolume = 0;
    // Only exercises with at least one logged set — this is what makes a
    // PARTIAL finish log exactly what was done.
    const entries = day.exercises.flatMap((ex, i) => {
      const logs = setLogs.get(slotKey(dateIso, i)) ?? [];
      if (logs.length === 0) return [];
      totalSets += logs.length;
      return [{
        name: ex.name,
        ...(ex.exerciseId ? { exerciseId: ex.exerciseId } : null),
        orderIndex: i,
        sets: logs.map((l, si) => {
          const reps = repsNumber(l.reps);
          const weight = weightLb(l.weight);
          if (weight != null) totalVolume += weight * reps;
          return { setNumber: si + 1, reps, ...(weight != null ? { weight } : null), completed: true };
        }),
      }];
    });
    if (entries.length === 0) {
      syncedDays.delete(dateIso);
      return;
    }
    await api.post('/workout-logs', {
      workoutId,
      startedAt,
      completedAt,
      totalTimeSeconds: Math.max(
        0,
        Math.round((Date.parse(completedAt) - Date.parse(startedAt)) / 1000),
      ),
      totalSets,
      totalVolume: Math.round(totalVolume),
      entries,
    });
    completedLogDays.add(dateIso);
    emit();
  } catch (err) {
    // Keep the local completion; the seal still shows for this session.
    syncedDays.delete(dateIso);
    scheduleSessionSave();
    console.warn('[calendar] failed to persist workout log:', err);
  }
}

/** Clear one exercise's logged sets so the deck can be re-run. */
export function resetSetLogs(dateIso: string, exerciseIndex: number): void {
  setLogs.delete(slotKey(dateIso, exerciseIndex));
  scheduleSessionSave();
  emit();
}

/** Ending a session early: log whatever was completed so far as the day's
 *  workout log (History/Progress/seals count it like a finished session). */
export function finishDaySession(dateIso: string): void {
  void syncDayCompletion(dateIso);
}

/** The day has a workout log — synced from this device (persisted, so it
 *  survives a restart before any history fetch) or fetched from history. */
export function isDayLogged(dateIso: string): boolean {
  return completedLogDays.has(dateIso) || syncedDays.has(dateIso);
}

/** Any sets logged locally for this date. When true, the local record is
 *  authoritative for a logged day: sets it lacks were genuinely skipped. */
export function dayHasLocalLogs(dateIso: string): boolean {
  for (const [k, v] of setLogs) {
    if (v.length > 0 && k.startsWith(`${dateIso}#`)) return true;
  }
  return false;
}

/**
 * An unfinished session on a day: some sets logged, nothing submitted yet.
 * Powers Home's "Resume workout" card. Counts straight off the log map so it
 * works even before the plan fetch lands (logs hydrate independently).
 */
export function inProgressSession(
  dateIso: string,
): { title: string; loggedSets: number; totalSets: number } | null {
  let logged = 0;
  for (const [k, v] of setLogs) {
    if (k.startsWith(`${dateIso}#`)) logged += v.length;
  }
  if (logged === 0 || isDayLogged(dateIso)) return null;
  const day = plannedDayForDate(dateIso);
  const total = day.exercises.reduce((sum, ex) => sum + ex.sets, 0);
  const complete =
    day.exercises.length > 0 &&
    day.exercises.every(
      (ex, i) => (setLogs.get(slotKey(dateIso, i))?.length ?? 0) >= ex.sets,
    );
  if (complete) return null;
  return {
    title: day.exercises.length > 0 ? day.title : 'Workout in progress',
    loggedSets: logged,
    totalSets: Math.max(total, logged),
  };
}
