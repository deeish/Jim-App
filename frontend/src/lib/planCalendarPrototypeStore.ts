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
  isWithinRescueWindow,
  mondayOf,
  todayIso,
  toIso,
  upcomingDatesFrom,
  weekdayIndex,
  type PlannedDay,
  type PlannedExercise,
  type PrototypeMuscle,
} from './planCalendarPrototype';
import {
  addPlanSlot,
  getCurrentPlanWithWeekly,
  movePlanSlot,
  removePlanSlot,
  type ApiPlan,
  type ApiPlanExercise,
  type ApiPlanWorkout,
  type PlanSlot,
  type PlanSlotExercise,
} from '../services/planService';
import {
  createWorkout,
  getLastPerformance,
  getPersonalBests,
  getWorkoutLogs,
  getWorkoutStats,
  materializePlanSlotWorkout,
  saveWorkout,
  type QuickSession,
} from '../services/workoutService';
import { getExerciseById, type Exercise as CatalogExercise } from '../services/exerciseService';
import type {
  LastPerformanceMap,
  PersonalBestMap,
  Workout,
  WorkoutLog,
  WorkoutStatsSession,
} from '../types/workout';
import {
  parseRepsCount as repsNumber,
  parseWeightLb as weightLb,
} from './sessionCelebration';
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
/** dateIso → BASE indexes removed from the day ("Remove Exercise"). */
const removals = new Map<string, Set<number>>();
/** dateIso → title for a session-local custom day (quick workouts without a
 *  plan would otherwise all read "Custom Workout"). */
const customDayTitles = new Map<string, string>();
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
/** Days whose synced log was REOPENED by a quick session landing on them —
 *  isDayLogged goes false again (deck unlocks, "Session logged." banner
 *  hides) and the next completion syncs a SECOND log for the date. Cleared
 *  when that sync succeeds. The month/week seal (isDayCompleted) is NOT
 *  affected: the original workout still happened. */
const reopenedDays = new Set<string>();
/** dateIso → per-exercise-index set counts already covered by a synced log.
 *  syncDayCompletion subtracts these so a reopened day's second log carries
 *  only the NEW work — never a double-count of the morning session. */
const syncedSetCounts = new Map<string, number[]>();
/** Missed days the user dismissed via "Skip this workout" (dates, not slots —
 *  the plan itself is never touched, so repeating weeks keep the workout). */
const skippedDays = new Set<string>();
/** Provenance of moves, one record per moved SLOT (latest move wins). The
 *  MOVE itself is server-persisted; these only power the explanatory
 *  captions ("Moved to Wed ›" / "moved from Mon"), so losing them on a new
 *  device degrades gracefully to a plain schedule. Slot-keyed — never
 *  date-keyed: the labels are derived from the slot's LIVE position, so a
 *  workout moved twice (or moved back) always reads correctly. */
type MovedRecord = { slotId: string; fromIso: string; title: string };
let movedRecords: MovedRecord[] = [];
const MOVED_RECORDS_CAP = 60;
/** Detects a DIFFERENT plan arriving (apply/regenerate) vs a refetch of the
 *  same one — only the former invalidates session overlays. Persisted, so a
 *  cold start doesn't read as a new plan and wipe hydrated logs. */
let lastSeenPlanId: string | null = null;
/** Whose plan the in-memory history caches belong to. In-memory only: a cold
 *  start rebuilds them from scratch anyway, and persisting it would not make
 *  the (device-scoped, deliberately so) set-log snapshot per-account. */
let lastSeenUserId: string | null = null;

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
      reopenedDays?: string[];
      syncedSetCounts?: Record<string, number[]>;
      skippedDates?: string[];
      movedRecords?: Array<{ slotId: string; fromIso: string; title: string }>;
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
    for (const d of data.reopenedDays ?? []) {
      if (d >= cutoff) reopenedDays.add(d);
    }
    for (const [k, v] of Object.entries(data.syncedSetCounts ?? {})) {
      if (k >= cutoff && !syncedSetCounts.has(k)) syncedSetCounts.set(k, v);
    }
    for (const d of data.skippedDates ?? []) {
      if (d >= cutoff) skippedDays.add(d);
    }
    if (movedRecords.length === 0) {
      movedRecords = (data.movedRecords ?? []).filter((r) => r.fromIso >= cutoff);
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
          reopenedDays: [...reopenedDays],
          syncedSetCounts: Object.fromEntries(syncedSetCounts),
          skippedDates: [...skippedDays],
          movedRecords,
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
/** The FULL stored logs per local date — entries, sets and timings, not just
 *  "this day is sealed". `GET /workout-logs` already returns all of it in the
 *  month fetch the calendar makes anyway, so keeping it costs nothing and is
 *  the only record of a session this device didn't train (another phone, a
 *  reinstall, or older than the 14-day set-log window). Backs "Review
 *  session" on those days. A reopened day holds more than one. */
const loggedSessions = new Map<string, WorkoutLog[]>();

function recordLoggedSession(dateIso: string, log: WorkoutLog): void {
  const existing = loggedSessions.get(dateIso) ?? [];
  if (existing.some((l) => l.id === log.id)) return;
  loggedSessions.set(dateIso, [...existing, log]);
}

/** The stored workout logs for a date (empty when none are known here). */
export function loggedSessionsFor(dateIso: string): WorkoutLog[] {
  return loggedSessions.get(dateIso) ?? [];
}

/**
 * There is enough here to draw the day's session receipt: this device's own
 * set logs, or a stored log fetched from history. Gates the day view's
 * "Review session" door — a sealed date with neither would open an empty page.
 */
export function canReviewDay(dateIso: string): boolean {
  return dayHasLocalLogs(dateIso) || loggedSessions.has(dateIso);
}

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
        removals.clear();
        setLogs.clear();
        // Skip/move records describe dates of the OLD plan's schedule.
        skippedDays.clear();
        movedRecords = [];
        scheduleSessionSave();
        // A new plan also deserves the week-1 landing jump again.
        anchorAutoJumpConsumed = false;
      }
      // A different ACCOUNT on this device (sign out → sign in) inherits the
      // module-level history caches, which no plan change clears: the seals,
      // the "already fetched" month marks that suppress the correcting
      // refetch, the primed baselines, and the stored session receipts behind
      // "Review session". Keyed on the account, not the plan, so a user
      // applying a new template keeps their own history on screen.
      //
      // ⚠ Only on a genuine SWITCH (`lastSeenUserId` already set). On first
      // load there is nothing stale to drop, and clearing would be a live
      // hazard: the logs fetch starts before this one (it has no
      // `sessionHydrated` await to clear first), so it routinely lands first
      // and its seals would be thrown away here.
      if (lastSeenUserId && plan?.userId && plan.userId !== lastSeenUserId) {
        // Screens fetch logs from a mount effect, never on focus, so a clear
        // alone would leave whatever is on screen sealless until the user
        // navigates. Re-request the months the old account had loaded.
        const staleMonths = [...fetchedLogMonths];
        completedLogDays.clear();
        fetchedLogMonths.clear();
        loggedSessions.clear();
        celebrationBaselineCache.clear();
        for (const key of staleMonths) {
          const [year, monthIndex] = key.split('-').map(Number);
          if (Number.isFinite(year) && Number.isFinite(monthIndex)) {
            ensureLogsForMonth(new Date(year, monthIndex, 1));
          }
        }
      }
      lastSeenUserId = plan?.userId ?? lastSeenUserId;
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
        // Keep the entries, not just the date: this response is the only
        // record of sessions this device never held (see loggedSessions).
        if (!loggedSessions.get(day)?.some((l) => l.id === log.id)) {
          recordLoggedSession(day, log);
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
  // An unloaded slot is only "Bodyweight" when the movement actually is (same
  // rule as plannedExerciseFromCatalog) — an unweighted barbell slot reads '—'
  // until a weight exists. No meta yet keeps the bodyweight default.
  const bodyweightOnly =
    meta == null || meta.equipment === '—' || /bodyweight/i.test(meta.equipment);
  return {
    name,
    exerciseId: ex.exerciseId ?? undefined,
    muscle: meta?.muscle ?? guessMuscleFromName(name, isCardio),
    sets: ex.sets > 0 ? ex.sets : 1,
    reps: formatRepsDisplay(ex),
    weight:
      ex.weight != null && ex.weight > 0
        ? `${ex.weight} lb`
        : bodyweightOnly
          ? 'Bodyweight'
          : '—',
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
 *  session replacements applied, removed exercises dropped, and added
 *  exercises appended. */
export function plannedDayForDate(dateIso: string): PlannedDay {
  const base = baseDayForDate(dateIso);
  const added = additions.get(dateIso) ?? [];
  const removed = removals.get(dateIso);
  let exercises = base.exercises;
  if (replacements.size > 0) {
    // Replacements overlay BASE indexes — apply them before removal filtering.
    exercises = exercises.map((ex, i) => replacements.get(slotKey(dateIso, i)) ?? ex);
  }
  if (removed && removed.size > 0) {
    exercises = exercises.filter((_, i) => !removed.has(i));
  }
  if (added.length > 0) {
    exercises = [...exercises, ...added];
    // Exercises added onto a rest day turn it into a session.
    if (base.exercises.length === 0) {
      return {
        ...base,
        title: customDayTitles.get(dateIso) ?? 'Custom Workout',
        exercises,
      };
    }
  }
  // Every exercise removed: the day reads as rest until the slot deletion
  // persists (after which it IS a rest day from the server too).
  if (exercises.length === 0 && base.exercises.length > 0) {
    return { ...base, title: 'Rest Day', exercises };
  }
  return { ...base, exercises };
}

/**
 * What the REST of dateIso's week trains: the exercises planned on its other
 * six days (with replacements/removals/additions applied). The replace/add
 * pickers send this so the recommendation brain keeps the week varied —
 * Thursday's rail never tops out with Monday's lift.
 */
export function weekExerciseContext(dateIso: string): {
  ids: string[];
  names: string[];
} {
  const monday = mondayOf(fromIso(dateIso));
  const ids = new Set<string>();
  const names = new Set<string>();
  for (let i = 0; i < 7; i++) {
    const iso = toIso(addDays(monday, i));
    if (iso === dateIso) continue;
    for (const ex of plannedDayForDate(iso).exercises) {
      if (ex.exerciseId) ids.add(ex.exerciseId);
      names.add(ex.name);
    }
  }
  return { ids: [...ids], names: [...names] };
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

// ---------------------------------------------------------------------------
// Missed-day rescue: skip records + server-backed moves
// ---------------------------------------------------------------------------

/** The user dismissed this missed day ("Skip this workout"). */
export function isDaySkipped(dateIso: string): boolean {
  return skippedDays.has(dateIso);
}

/** The LOCAL date a slot currently maps to (the anchor math in reverse). */
function currentIsoOfSlot(slot: ApiPlanWorkout): string | null {
  if (!livePlan) return null;
  const weekdayIdx = WEEKDAYS.indexOf(slot.dayOfWeek as (typeof WEEKDAYS)[number]);
  if (weekdayIdx < 0) return null;
  const offset = weekNumberOffset(livePlan);
  const anchor = planAnchorMonday(livePlan);
  return toIso(addDays(anchor, (slot.weekNumber + offset - 1) * 7 + weekdayIdx));
}

/** Where this day's workout went ("Moved to Wed ›"), derived from the moved
 *  slot's LIVE position — a workout moved twice points at its real home, and
 *  one moved back home clears the label entirely. */
export function dayMovedTo(dateIso: string): { toIso: string; title: string } | null {
  for (let i = movedRecords.length - 1; i >= 0; i--) {
    const rec = movedRecords[i];
    if (rec.fromIso !== dateIso) continue;
    const slot = slotById(rec.slotId);
    if (!slot) continue;
    const currentIso = currentIsoOfSlot(slot);
    if (currentIso == null || currentIso === dateIso) continue;
    return { toIso: currentIso, title: rec.title };
  }
  return null;
}

/** The source date of a workout currently ON this day ("moved from Mon"). */
export function dayMovedFrom(dateIso: string): string | null {
  for (let i = movedRecords.length - 1; i >= 0; i--) {
    const rec = movedRecords[i];
    if (rec.fromIso === dateIso) continue;
    const slot = slotById(rec.slotId);
    if (slot && currentIsoOfSlot(slot) === dateIso) return rec.fromIso;
  }
  return null;
}

/**
 * A day gets the rescue affordances (amber pill, day-view banner, sheet) only
 * when EVERY gate passes:
 *  - live plan (nothing to persist against otherwise);
 *  - a past day within the 7-day rescue window (older = quiet history);
 *  - not completed/logged, not already skipped or moved;
 *  - no locally logged sets — moving a day would strand its date-keyed set
 *    logs, so an in-progress day keeps the plain "Missed" label instead;
 *  - actually has exercises (rest days can't be missed).
 */
export function canRescueDay(dateIso: string): boolean {
  if (calendarDataMode() !== 'live') return false;
  if (!isWithinRescueWindow(dateIso, todayIso())) return false;
  if (skippedDays.has(dateIso)) return false;
  if (isDayCompleted(dateIso) || isDayLogged(dateIso)) return false;
  if (dayHasLocalLogs(dateIso)) return false;
  // A moved-away day has no slots left, so the exercises check covers it.
  return plannedDayForDate(dateIso).exercises.length > 0;
}

/** Mark a day skipped — dismissing a missed day, or declaring ahead of time
 *  that a planned day won't happen. Local-only — the plan is never touched,
 *  and the workout stays visible (logging it anyway simply wins). */
export function skipDay(dateIso: string): void {
  skippedDays.add(dateIso);
  scheduleSessionSave();
  emit();
}

/** Undo a skip: the day counts as planned again (a past day's missed-rescue
 *  affordances come back with it). */
export function unskipDay(dateIso: string): void {
  skippedDays.delete(dateIso);
  scheduleSessionSave();
  emit();
}

/**
 * One staged relocation: slot `slotId` (currently mapped to `fromIso`) will
 * land on `targetIso`. Chains build an array of these; NOTHING touches the
 * server until commitMoves applies the whole array — cancel = no change.
 */
export type PendingMove = {
  slotId: string;
  fromIso: string;
  targetIso: string;
  title: string;
};

function slotById(id: string): ApiPlanWorkout | undefined {
  return livePlan?.planWorkouts?.find((pw) => pw.id === id);
}

/**
 * The slots a date holds under a STAGED layout: live slots, minus everything
 * a pending move takes away, minus in-hand slots (`excludeSlotIds` — the
 * session currently being placed), plus everything pending moves bring in.
 * Deep make-room chains render every picker against this, never raw server
 * state.
 */
function stagedSlotsForDate(
  dateIso: string,
  pending: PendingMove[],
  excludeSlotIds: string[],
): ApiPlanWorkout[] {
  const movedAway = new Set(pending.map((p) => p.slotId));
  const excluded = new Set(excludeSlotIds);
  const staying = liveSlotsForDate(dateIso).filter(
    (s) => !movedAway.has(s.id) && !excluded.has(s.id),
  );
  const incoming = pending
    .filter((p) => p.targetIso === dateIso)
    .map((p) => slotById(p.slotId))
    .filter((s): s is ApiPlanWorkout => s != null);
  return [...staying, ...incoming];
}

export type StagedSession = {
  slotId: string;
  title: string;
  muscles: PrototypeMuscle[];
};

/** The sessions on a date under a staged layout (which-workout step, room stage). */
export function stagedSessionsForDate(
  dateIso: string,
  pending: PendingMove[] = [],
  excludeSlotIds: string[] = [],
): StagedSession[] {
  return stagedSlotsForDate(dateIso, pending, excludeSlotIds).map((slot) => {
    const seen = new Set<PrototypeMuscle>();
    for (const ex of slot.exercises ?? []) {
      seen.add(toPlannedExercise(ex, slot).muscle);
    }
    return { slotId: slot.id, title: slot.title || 'Workout', muscles: [...seen] };
  });
}

export type MoveTargetState =
  | 'open' // nothing scheduled — the natural landing spot
  | 'occupied' // has a session; picking it opens the make-room step
  | 'logged' // already logged (only possible for today) — blocked
  | 'beyond'; // past the program's final week — blocked (see commitMoves)

export type MoveTarget = {
  dateIso: string;
  /** The day's staged content ('Rest day' when empty). */
  title: string;
  sessions: StagedSession[];
  state: MoveTargetState;
};

/**
 * The move picker's rows: today plus the next six days, rendered against the
 * STAGED layout (`pending` + in-hand `excludeSlotIds`).
 *  - 'logged' days are blocked — the day's workout log is write-once, so a
 *    workout moved onto it could never be logged (the closed-session grid).
 *  - Days past the program's last week are blocked: placing a slot there
 *    would grow max(weekNumber) and silently turn an 8-week program into a
 *    9-week one everywhere "Week N of M" renders.
 */
export function moveTargetsForDay(
  pending: PendingMove[] = [],
  excludeSlotIds: string[] = [],
): MoveTarget[] {
  return upcomingDatesFrom(todayIso()).map((dateIso) => {
    const sessions = stagedSessionsForDate(dateIso, pending, excludeSlotIds);
    const weekInfo = programWeekInfoFor(toIso(mondayOf(fromIso(dateIso))));
    let state: MoveTargetState;
    if (weekInfo?.state === 'after') state = 'beyond';
    else if (isDayCompleted(dateIso) || isDayLogged(dateIso)) state = 'logged';
    else if (sessions.length > 0) state = 'occupied';
    else state = 'open';
    return {
      dateIso,
      title: sessions.map((s) => s.title).join(' + ') || 'Rest day',
      sessions,
      state,
    };
  });
}

/**
 * A today-or-future day whose workout can be picked up (the long-press door).
 * Logged/completed days can't move (write-once log); a day with locally
 * logged sets can't either — moving it would strand its date-keyed set logs.
 */
export function canMoveDay(dateIso: string): boolean {
  if (calendarDataMode() !== 'live') return false;
  if (dateIso < todayIso()) return false;
  if (isDayCompleted(dateIso) || isDayLogged(dateIso)) return false;
  if (dayHasLocalLogs(dateIso)) return false;
  return liveSlotsForDate(dateIso).length > 0;
}

/**
 * Can the make-room "Swap days" option land the displaced workout HERE?
 * The vacated day must be a legal home: today or future, not logged, and
 * empty under the staged layout (a multi-session source that only sent one
 * workout away is NOT empty — swapping into it would create a new double).
 * A missed-rescue source is in the past, so swap disappears there for free.
 */
export function canReceiveSwap(dateIso: string, pending: PendingMove[]): boolean {
  if (dateIso < todayIso()) return false;
  if (isDayCompleted(dateIso) || isDayLogged(dateIso)) return false;
  const weekInfo = programWeekInfoFor(toIso(mondayOf(fromIso(dateIso))));
  if (weekInfo?.state === 'after') return false;
  return stagedSlotsForDate(dateIso, pending, []).length === 0;
}

/**
 * Apply a resolved chain of moves — the ONLY place schedule changes hit the
 * server. Each slot's (dayOfWeek, weekNumber) changes via the move endpoint,
 * so week cards, month dots, day views, Home's today card and slot-linked
 * logging all follow automatically.
 *
 * Edge handling:
 *  - Sequential application; a mid-chain failure force-refetches the plan so
 *    the UI resyncs to server truth (and the caller shows the error).
 *  - `weekNumber` is sent only when the slot's program week actually
 *    changes. Targets are all today..+6, never behind a slot's own week, so
 *    the stored number stays ≥ 1 for 0-based plans (the DTO rejects 0).
 *  - orderInDay: staying slots keep theirs; incomers append after them in
 *    chain order (a swap's incomer lands on an emptied day at max+1 —
 *    harmless, order only sorts within the day).
 *  - Index-keyed session overlays on EVERY touched date are dropped — the
 *    merged exercise list they indexed into no longer exists. persistDayEdits
 *    persists real edits into slots long before this runs in the normal case.
 */
export async function commitMoves(pending: PendingMove[]): Promise<void> {
  if (liveStatus !== 'ready' || !livePlan) {
    throw new Error('No active plan loaded');
  }
  if (pending.length === 0) return;
  const planId = livePlan.id;
  const anchor = planAnchorMonday(livePlan);
  const offset = weekNumberOffset(livePlan);
  const programWeekOf = (iso: string) =>
    Math.round((mondayOf(fromIso(iso)).getTime() - anchor.getTime()) / WEEK_MS) + 1;
  const movingIds = new Set(pending.map((p) => p.slotId));
  const nextOrder = new Map<string, number>();
  const orderFor = (dateIso: string): number => {
    if (!nextOrder.has(dateIso)) {
      const stayers = liveSlotsForDate(dateIso).filter((s) => !movingIds.has(s.id));
      nextOrder.set(
        dateIso,
        stayers.length > 0 ? Math.max(...stayers.map((s) => s.orderInDay)) + 1 : 0,
      );
    }
    const order = nextOrder.get(dateIso)!;
    nextOrder.set(dateIso, order + 1);
    return order;
  };

  try {
    let plan = livePlan;
    for (const move of pending) {
      const slot = plan.planWorkouts?.find((pw) => pw.id === move.slotId);
      if (!slot) throw new Error('Slot no longer exists');
      const targetWeek = programWeekOf(move.targetIso);
      const weekChanged = slot.weekNumber + offset !== targetWeek;
      plan = await movePlanSlot(planId, move.slotId, {
        dayOfWeek: WEEKDAYS[weekdayIndex(fromIso(move.targetIso))],
        ...(weekChanged ? { weekNumber: targetWeek - offset } : {}),
        orderInDay: orderFor(move.targetIso),
      });
    }
    livePlan = plan;
  } catch (err) {
    refreshLiveCalendarData(true);
    throw err;
  }

  const touched = new Set(pending.flatMap((p) => [p.fromIso, p.targetIso]));
  for (const key of [...replacements.keys()]) {
    if (touched.has(key.slice(0, 10))) replacements.delete(key);
  }
  for (const dateIso of touched) {
    additions.delete(dateIso);
    removals.delete(dateIso);
  }
  // One provenance record per slot, keeping its ORIGIN: a workout chained
  // through several days still reads "moved from" its true home, and its
  // old day still points at wherever it lives now (labels derive from the
  // slot's live position). A slot moved back home self-clears both labels.
  const known = new Set(movedRecords.map((r) => r.slotId));
  movedRecords = [
    ...movedRecords,
    ...pending
      .filter((p) => !known.has(p.slotId))
      .map((p) => ({ slotId: p.slotId, fromIso: p.fromIso, title: p.title })),
  ].slice(-MOVED_RECORDS_CAP);
  // A day that just RECEIVED a workout isn't skipped any more — the mark
  // described whatever used to be there.
  for (const p of pending) skippedDays.delete(p.targetIso);
  scheduleSessionSave();
  emit();
}

/** How a Quick Workout lands when today already has a session: 'replace'
 *  swaps the day's plan for the new session (the default — two full sessions
 *  merged into one 11-exercise day is never what "give me a push day" means);
 *  'add' keeps the existing workout and appends (the deliberate two-a-day). */
export type QuickSessionLanding = 'replace' | 'add';

/** Drop every session-local overlay for a date whose exercises are being
 *  replaced wholesale — edits, additions, removals, title, and the
 *  index-keyed set logs that would otherwise attach to the NEW session's
 *  rows at the same positions. */
function clearDayOverlays(dateIso: string): void {
  for (const key of [...replacements.keys()]) {
    if (key.startsWith(`${dateIso}#`)) replacements.delete(key);
  }
  for (const key of [...setLogs.keys()]) {
    if (key.startsWith(`${dateIso}#`)) setLogs.delete(key);
  }
  additions.delete(dateIso);
  removals.delete(dateIso);
  customDayTitles.delete(dateIso);
  // The replacement session times from ITS first set, and its log must not
  // subtract counts that belonged to the removed exercises.
  dayStartTimes.delete(dateIso);
  syncedSetCounts.delete(dateIso);
}

/** A quick session just landed on a day that already has a synced/fetched
 *  workout log: reopen it. The deck unlocks for the new work, the next
 *  completion syncs a SECOND log, and the per-index counts snapshot makes
 *  that log a pure delta (an added session never re-logs the morning's
 *  sets; a replaced day starts from zero because its logs were cleared). */
function reopenLoggedDay(dateIso: string): void {
  reopenedDays.add(dateIso);
  syncedDays.delete(dateIso);
  dayStartTimes.delete(dateIso);
  // The primed baselines describe the FIRST session and were captured while
  // the day already read as logged, so they carry preLog: false and would
  // silence the second session's claims. Dropping them makes the next prime
  // re-read the day as open — and the refreshed records (which now include
  // the morning's work) are exactly what this session has to beat.
  celebrationBaselineCache.delete(dateIso);
  const day = plannedDayForDate(dateIso);
  const counts = day.exercises.map(
    (_, i) => setLogs.get(slotKey(dateIso, i))?.length ?? 0,
  );
  if (counts.some((c) => c > 0)) syncedSetCounts.set(dateIso, counts);
  else syncedSetCounts.delete(dateIso);
  scheduleSessionSave();
}

/**
 * Land a Quick Workout session on TODAY.
 *
 * With a live plan inside its program: a REAL slot is added for today
 * (persisted, movable via Make Room, loggable via the materialize path).
 * Otherwise — no plan, or today past the program's end / before its anchor —
 * the session uses the same session-local custom-day path "+ Add Exercise"
 * uses, so logging mints the ad-hoc workout. (Out-of-program persistence is
 * deliberately avoided: a slot beyond max(weekNumber) would silently grow
 * "Week N of M", and a pre-anchor slot cannot exist below weekNumber 1.)
 */
export async function addQuickSessionToday(
  session: QuickSession,
  landing: QuickSessionLanding = 'replace',
): Promise<string> {
  const today = todayIso();
  const todayMondayIso = toIso(mondayOf(fromIso(today)));
  const weekInfo =
    liveStatus === 'ready' && livePlan ? programWeekInfoFor(todayMondayIso) : null;
  // Raw log check (not isDayLogged — that already discounts reopened days):
  // landing on a day with a synced log must reopen it either way, or the new
  // session arrives with a closed deck and a sync guard that swallows it.
  const wasLogged = completedLogDays.has(today) || syncedDays.has(today);

  if (livePlan && weekInfo?.state === 'in') {
    const anchor = planAnchorMonday(livePlan);
    const offset = weekNumberOffset(livePlan);
    const programWeek =
      Math.round((mondayOf(fromIso(today)).getTime() - anchor.getTime()) / WEEK_MS) + 1;
    const existing = liveSlotsForDate(today);
    const replacing = landing === 'replace' && existing.length > 0;
    const slot: PlanSlot = {
      weekNumber: Math.max(1, programWeek - offset),
      dayOfWeek: WEEKDAYS[weekdayIndex(fromIso(today))],
      title: session.title,
      type: session.type,
      durationMinutes: session.durationMinutes,
      orderInDay:
        !replacing && existing.length > 0
          ? Math.max(...existing.map((s) => s.orderInDay)) + 1
          : 0,
      exercises: session.exercises.map((ex, i) => ({
        exerciseId: ex.exerciseId,
        name: ex.name,
        sets: ex.sets,
        reps: Math.max(1, ex.reps),
        ...(ex.repsMax > ex.repsMin
          ? { repsMin: ex.repsMin, repsMax: ex.repsMax }
          : null),
        orderIndex: i,
        ...(ex.prescriptionType === 'time'
          ? {
              prescriptionType: 'time' as const,
              durationSeconds: ex.durationSeconds ?? 600,
            }
          : null),
      })),
    };
    // Add first, then remove — the same crash-safe order persistDayEdits
    // uses, so a failure mid-way leaves the day over-full, never empty.
    let plan = await addPlanSlot(livePlan.id, slot);
    if (replacing) {
      for (const old of existing) {
        plan = await removePlanSlot(livePlan.id, old.id);
      }
      // The replaced day's session-local edits described exercises that no
      // longer exist — without this they'd re-apply onto the new session.
      clearDayOverlays(today);
    }
    livePlan = plan;
    lastSeenPlanId = plan.id;
    if (wasLogged) reopenLoggedDay(today);
    // Building a session for today is the opposite of skipping it.
    if (skippedDays.delete(today)) scheduleSessionSave();
    emit();
    void loadExerciseMeta(plan);
    return today;
  }

  if (landing === 'replace') {
    // Session-local day: replacing simply drops what "+ Add Exercise" or an
    // earlier quick session stacked onto today (base is empty out-of-plan).
    clearDayOverlays(today);
  }
  customDayTitles.set(today, session.title);
  for (const ex of session.exercises) {
    additions.set(today, [
      ...(additions.get(today) ?? []),
      {
        name: ex.name,
        exerciseId: ex.exerciseId,
        muscle: ex.muscle as PrototypeMuscle,
        sets: ex.sets,
        reps:
          ex.prescriptionType === 'time'
            ? `${Math.max(1, Math.round((ex.durationSeconds ?? 600) / 60))} min`
            : ex.repsMax > ex.repsMin
              ? `${ex.repsMin}–${ex.repsMax}`
              : `${ex.reps}`,
        weight: '—',
        rest: ex.prescriptionType === 'time' ? '—' : restHeuristic(ex.name, ex.sets),
        equipment: '—',
        note: '',
      },
    ]);
  }
  if (wasLogged) reopenLoggedDay(today);
  if (skippedDays.delete(today)) scheduleSessionSave();
  emit();
  return today;
}

/** Move EVERY session of a date (the missed-day "Do it today" and the
 *  workout-screen "training this now" nudge). A thin commitMoves wrapper. */
export async function moveMissedDay(sourceIso: string, targetIso: string): Promise<void> {
  const sourceSlots = liveSlotsForDate(sourceIso);
  if (sourceSlots.length === 0) {
    throw new Error('Nothing scheduled on that day');
  }
  const title = plannedDayForDate(sourceIso).title;
  await commitMoves(
    sourceSlots.map((slot) => ({
      slotId: slot.id,
      fromIso: sourceIso,
      targetIso,
      title,
    })),
  );
}

/** Map a DISPLAYED exercise index (what screens hold) back onto the day's
 *  composition: a surviving base slot, or an entry in the additions list.
 *  With removals in play the two no longer line up one-to-one. */
function resolveDayIndex(
  dateIso: string,
  exerciseIndex: number,
): { kind: 'base'; baseIndex: number } | { kind: 'added'; addedIndex: number } | null {
  const baseLen = baseDayForDate(dateIso).exercises.length;
  const removed = removals.get(dateIso);
  const surviving: number[] = [];
  for (let i = 0; i < baseLen; i++) {
    if (!removed?.has(i)) surviving.push(i);
  }
  if (exerciseIndex < surviving.length) {
    return { kind: 'base', baseIndex: surviving[exerciseIndex] };
  }
  const addedIndex = exerciseIndex - surviving.length;
  if (addedIndex < (additions.get(dateIso)?.length ?? 0)) {
    return { kind: 'added', addedIndex };
  }
  return null;
}

export function replaceExercise(
  dateIso: string,
  exerciseIndex: number,
  replacement: PlannedExercise,
): void {
  const target = resolveDayIndex(dateIso, exerciseIndex);
  if (!target) return;
  if (target.kind === 'added') {
    // Replacing an ADDED exercise: edit the additions list in place (the
    // replacements map only overlays base-slot indexes).
    const arr = [...(additions.get(dateIso) ?? [])];
    arr[target.addedIndex] = replacement;
    additions.set(dateIso, arr);
  } else {
    replacements.set(slotKey(dateIso, target.baseIndex), replacement);
  }
  // A different exercise: any sets logged against the old one no longer apply.
  setLogs.delete(slotKey(dateIso, exerciseIndex));
  scheduleSessionSave();
  queuePersistDayEdits(dateIso);
  emit();
}

/** "Remove Exercise" — drops one exercise from the day (a base slot joins the
 *  removals overlay; an added one leaves the additions list). Persists like
 *  replace/add: the day's slot is rebuilt without it. */
export function removeExerciseFromDay(dateIso: string, exerciseIndex: number): void {
  const target = resolveDayIndex(dateIso, exerciseIndex);
  if (!target) return;
  const mergedLen = plannedDayForDate(dateIso).exercises.length;
  if (target.kind === 'added') {
    const arr = [...(additions.get(dateIso) ?? [])];
    arr.splice(target.addedIndex, 1);
    if (arr.length > 0) additions.set(dateIso, arr);
    else additions.delete(dateIso);
  } else {
    const set = removals.get(dateIso) ?? new Set<number>();
    set.add(target.baseIndex);
    removals.set(dateIso, set);
    // Its replacement overlay (if any) no longer applies either.
    replacements.delete(slotKey(dateIso, target.baseIndex));
  }
  // Set logs are keyed by DISPLAYED index: drop the removed exercise's logs
  // and shift every later exercise's logs down one so they stay attached.
  setLogs.delete(slotKey(dateIso, exerciseIndex));
  for (let i = exerciseIndex + 1; i < mergedLen; i++) {
    const logs = setLogs.get(slotKey(dateIso, i));
    setLogs.delete(slotKey(dateIso, i));
    if (logs) setLogs.set(slotKey(dateIso, i - 1), logs);
  }
  scheduleSessionSave();
  queuePersistDayEdits(dateIso);
  // Removing the last unlogged exercise can complete the day — but the log
  // still waits for the explicit "Complete Workout" press (the button shows
  // whenever any set is logged, so the door is already on screen).
  emit();
}

/** "+ Add Exercise" — appended after the day's base list (works on rest days
 *  too, which become a Custom Workout). */
export function addExerciseToDay(dateIso: string, exercise: PlannedExercise): void {
  addExercisesToDay(dateIso, [exercise]);
}

/** Multi-add from the picker: one append + ONE queued slot rebuild, instead of
 *  a rebuild per exercise. */
export function addExercisesToDay(dateIso: string, exercises: PlannedExercise[]): void {
  if (exercises.length === 0) return;
  additions.set(dateIso, [...(additions.get(dateIso) ?? []), ...exercises]);
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
 * Write the day's replaces/removes/adds into the plan: rebuild the day's slot
 * with the edited exercise list (add the new slot, then remove the old —
 * worst case a transient duplicate, never a lost day), create a slot for a
 * custom rest-day session, or delete the slot outright when every exercise
 * was removed. On success the server plan becomes the base and the session
 * overlays for that day are cleared; on failure they simply stay
 * session-local. Multi-slot days keep session-only edits (rare).
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
  if (rows.length === 0 && !slots[0]) return;
  try {
    const date = fromIso(dateIso);
    const anchor = planAnchorMonday(livePlan);
    const programWeek =
      Math.round((mondayOf(date).getTime() - anchor.getTime()) / WEEK_MS) + 1;
    const offset = weekNumberOffset(livePlan);
    const old = slots[0];
    let plan: ApiPlan;
    if (rows.length === 0) {
      // Every exercise was removed — the slot itself goes, so the day
      // becomes a genuine rest day (never an empty workout).
      plan = await removePlanSlot(planId, old.id);
    } else {
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
      plan = await addPlanSlot(planId, slot);
      if (old) plan = await removePlanSlot(planId, old.id);
    }
    // Server is now canonical for this day — drop the local overlays (they
    // would double-apply the additions on top of the rebuilt slot).
    for (const key of [...replacements.keys()]) {
      if (key.startsWith(`${dateIso}#`)) replacements.delete(key);
    }
    additions.delete(dateIso);
    removals.delete(dateIso);
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
  // Deliberately NO auto-sync on the day's last set: the explicit "Complete
  // Workout" button is the only door to the log POST, so adding one more
  // exercise after the planned list stays possible right up to that press.
  emit();
}

// ---------------------------------------------------------------------------
// Backend persistence of completed calendar sessions
// ---------------------------------------------------------------------------

/** Every planned exercise has all its sets checked. Gates the deck's
 *  "Complete Workout" button — the day view's shows from the first logged set. */
export function isDayFullyLogged(dateIso: string): boolean {
  const day = plannedDayForDate(dateIso);
  if (day.exercises.length === 0) return false;
  return day.exercises.every(
    (ex, i) => (setLogs.get(slotKey(dateIso, i))?.length ?? 0) >= ex.sets,
  );
}

/** First-set timestamp of the day's live session — the celebration screen's
 *  duration source. Null once the 14-day prune drops it or before any set. */
export function sessionStartIso(dateIso: string): string | null {
  return dayStartTimes.get(dateIso) ?? null;
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
    // PARTIAL finish log exactly what was done. Sets a previous log for this
    // date already covered (a reopened day's morning session) are skipped,
    // so the second log is a pure delta.
    const already = syncedSetCounts.get(dateIso) ?? [];
    const entries = day.exercises.flatMap((ex, i) => {
      const logs = (setLogs.get(slotKey(dateIso, i)) ?? []).slice(
        already[i] ?? 0,
      );
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
    const saved = await api.post<WorkoutLog>('/workout-logs', {
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
    // Keep what came back: the month fetch ran BEFORE this POST, so without
    // it a recap of the session just finished has no stored duration to read.
    if (saved.data?.id) recordLoggedSession(dateIso, saved.data);
    // The day is sealed again; a LATER quick session re-runs the reopen
    // flow, and the refreshed counts make its log the next pure delta.
    reopenedDays.delete(dateIso);
    syncedSetCounts.set(
      dateIso,
      day.exercises.map(
        (_, i) => setLogs.get(slotKey(dateIso, i))?.length ?? 0,
      ),
    );
    scheduleSessionSave();
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
 *  survives a restart before any history fetch) or fetched from history.
 *  A REOPENED day (quick session landed after the log) reads unlogged again
 *  so its new session is trainable; the seal (isDayCompleted) is unaffected. */
export function isDayLogged(dateIso: string): boolean {
  return (
    (completedLogDays.has(dateIso) || syncedDays.has(dateIso)) &&
    !reopenedDays.has(dateIso)
  );
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
 *
 * A FULLY-logged day still counts as in progress until "Complete Workout" is
 * pressed — the log only POSTs from that button now, so resume surfaces must
 * keep pointing at the day until it is genuinely submitted.
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
  return {
    title: day.exercises.length > 0 ? day.title : 'Workout in progress',
    loggedSets: logged,
    totalSets: Math.max(total, logged),
  };
}

// ---------------------------------------------------------------------------
// Celebration baselines + "Save this workout"
// ---------------------------------------------------------------------------

export type CelebrationBaselines = {
  lastPerformance: LastPerformanceMap;
  personalBests: PersonalBestMap;
  statsSessions: WorkoutStatsSession[];
  /**
   * These were captured while the day was still UNLOGGED, so they describe
   * what the session had to beat. False when the day was already logged when
   * they were fetched — a recap of an old day — and then no claim drawn from
   * them can be trusted: `lastPerformance` is the user's MOST RECENT session,
   * which for a past day was performed AFTER the one being reviewed. Comparing
   * against it manufactures "beat last time" out of a later, lighter workout.
   */
  preLog: boolean;
};

const celebrationBaselineCache = new Map<string, CelebrationBaselines>();
const celebrationBaselinePromises = new Map<string, Promise<void>>();

/**
 * Fetch the "what did this beat" baselines for a day's celebration: last
 * performance + all-time personal bests for the day's exercises, and the
 * stats sessions the streak counts. MUST resolve before the day's workout log
 * POSTs — once the log lands, the new lift IS the server-side record and
 * every claim silently vanishes (the trap the legacy WorkoutSession
 * documents). The day view primes this on mount; the Complete Workout
 * handler awaits it again (a no-op when already cached) before syncing.
 */
export function primeCelebrationBaselines(dateIso: string): Promise<void> {
  if (celebrationBaselineCache.has(dateIso)) return Promise.resolve();
  const pending = celebrationBaselinePromises.get(dateIso);
  if (pending) return pending;
  if (liveStatus !== 'ready') return Promise.resolve();
  // Read BEFORE the fetch: a day still unlogged here is one whose baselines
  // predate its own session, and only those can carry claims. A reopened day
  // reads unlogged, which is right — its second session genuinely has the
  // morning's work to beat.
  const preLog = !isDayLogged(dateIso);
  const ids = [
    ...new Set(
      plannedDayForDate(dateIso)
        .exercises.map((ex) => ex.exerciseId)
        .filter((id): id is string => !!id),
    ),
  ];
  const p = (async () => {
    const [lastPerformance, personalBests, stats] = await Promise.all([
      getLastPerformance(ids).catch(() => ({}) as LastPerformanceMap),
      getPersonalBests(ids).catch(() => ({}) as PersonalBestMap),
      getWorkoutStats().catch(() => null),
    ]);
    celebrationBaselineCache.set(dateIso, {
      lastPerformance,
      personalBests,
      statsSessions: stats?.sessions ?? [],
      preLog,
    });
    emit();
  })().finally(() => celebrationBaselinePromises.delete(dateIso));
  celebrationBaselinePromises.set(dateIso, p);
  return p;
}

/** The primed baselines for a day, or null while the fetch is in flight
 *  (subscribers re-render when it lands). */
export function celebrationBaselines(dateIso: string): CelebrationBaselines | null {
  return celebrationBaselineCache.get(dateIso) ?? null;
}

/**
 * "Save this workout" on the celebration screen: mint a real Workout row and
 * bookmark it, so the session lands in Saved workouts to run again. Saves the
 * day's PRESCRIPTIONS (sets × planned reps/bands) rather than the logged
 * delta — a cut-short session still saves the full session shape. Same
 * payload grammar as syncDayCompletion's rest-day path.
 */
export async function saveDayAsWorkout(dateIso: string): Promise<void> {
  const day = plannedDayForDate(dateIso);
  if (day.exercises.length === 0) throw new Error('Nothing to save');
  const created = await createWorkout({
    name: day.title,
    day: day.weekday,
    exercises: day.exercises.map((ex, i) => {
      const range = ex.reps.match(/(\d+)\s*[–-]\s*(\d+)/);
      return {
        name: ex.name,
        sets: ex.sets,
        reps: Math.max(1, repsNumber(ex.reps)),
        ...(range ? { repsMin: Number(range[1]), repsMax: Number(range[2]) } : null),
        weight: weightLb(ex.weight),
        exerciseId: ex.exerciseId,
        orderIndex: i,
      };
    }),
  });
  if (created.id) await saveWorkout(created.id);
}
