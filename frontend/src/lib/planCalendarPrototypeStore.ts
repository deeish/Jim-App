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
 *     crossed-out days: a real completed workout log on that LOCAL day, or —
 *     demo mode — every set of every exercise logged in this session.
 *
 * Replacements and set logs remain in-memory only; nothing here writes back
 * to the backend.
 */

import {
  WEEKDAYS,
  addDays,
  fromIso,
  mondayOf,
  planForDate,
  toIso,
  weekdayIndex,
  type PlannedDay,
  type PlannedExercise,
  type PrototypeMuscle,
} from './planCalendarPrototype';
import {
  getCurrentPlanWithWeekly,
  type ApiPlan,
  type ApiPlanExercise,
  type ApiPlanWorkout,
} from '../services/planService';
import { getWorkoutLogs } from '../services/workoutService';
import { getExerciseById } from '../services/exerciseService';

export type SetLog = { reps: string; weight: string };

/** Key = one exercise slot on one date. */
function slotKey(dateIso: string, exerciseIndex: number): string {
  return `${dateIso}#${exerciseIndex}`;
}

const replacements = new Map<string, PlannedExercise>();
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
// Live plan
// ---------------------------------------------------------------------------

type LiveStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

let liveStatus: LiveStatus = 'idle';
let livePlan: ApiPlan | null = null;
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
      const { plan } = await getCurrentPlanWithWeekly();
      livePlan = plan;
      liveStatus = 'ready';
      emit();
      if (plan) void loadExerciseMeta(plan);
    } catch {
      liveStatus = 'unavailable';
      emit();
    }
  })();
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

function liveDayForDate(dateIso: string): PlannedDay | null {
  if (liveStatus !== 'ready' || !livePlan?.planWorkouts?.length) return null;
  const date = fromIso(dateIso);
  const weekday = WEEKDAYS[weekdayIndex(date)];
  const anchor = planAnchorMonday(livePlan);
  const programWeek =
    Math.round((mondayOf(date).getTime() - anchor.getTime()) / WEEK_MS) + 1;
  const offset = weekNumberOffset(livePlan);
  const slots = livePlan.planWorkouts
    .filter((pw) => pw.weekNumber + offset === programWeek && pw.dayOfWeek === weekday)
    .sort((a, b) => a.orderInDay - b.orderInDay);
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
    muscle: meta?.muscle ?? guessMuscleFromName(name, isCardio),
    sets: ex.sets > 0 ? ex.sets : 1,
    reps: formatRepsDisplay(ex),
    weight: ex.weight != null && ex.weight > 0 ? `${ex.weight} lb` : 'Bodyweight',
    rest: isCardio ? '—' : ex.sets >= 4 ? '2:30' : '2:00',
    equipment: meta?.equipment ?? '—',
    note: ex.notes ?? '',
  };
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
function muscleFromCatalog(
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

/** The day's plan — real when a plan is loaded, sample otherwise — with any
 *  session replacements applied. */
export function plannedDayForDate(dateIso: string): PlannedDay {
  const base = liveDayForDate(dateIso) ?? planForDate(dateIso);
  if (replacements.size === 0) return base;
  const exercises = base.exercises.map(
    (ex, i) => replacements.get(slotKey(dateIso, i)) ?? ex,
  );
  return { ...base, exercises };
}

/** Crossed out on the month grid: a completed log that LOCAL day, or (demo
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
  replacements.set(slotKey(dateIso, exerciseIndex), replacement);
  // A different exercise: any sets logged against the old one no longer apply.
  setLogs.delete(slotKey(dateIso, exerciseIndex));
  emit();
}

export function getSetLogs(dateIso: string, exerciseIndex: number): SetLog[] {
  return setLogs.get(slotKey(dateIso, exerciseIndex)) ?? [];
}

export function logSet(dateIso: string, exerciseIndex: number, log: SetLog): void {
  const key = slotKey(dateIso, exerciseIndex);
  setLogs.set(key, [...(setLogs.get(key) ?? []), log]);
  emit();
}

/** Demo helper — clear one exercise's logged sets so the deck can be re-run. */
export function resetSetLogs(dateIso: string, exerciseIndex: number): void {
  setLogs.delete(slotKey(dateIso, exerciseIndex));
  emit();
}
