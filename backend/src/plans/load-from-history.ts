import type {
  GeneratedSession,
  GeneratedSessionExercise,
} from './session-enrichment';
import type { GenerateSessionsDto } from './dto/generate-sessions.dto';
import type {
  LastExercisePerformance,
  LastPerformedSet,
} from '../workout-logs/last-performance';
import { coachRoleOf, isCardioRowMeta, type CoachMeta } from './coach-check';

/**
 * Loads from history (Tier 2d of the 2026-09-16 plan).
 *
 * Until now a generated plan never carried a working weight: the model was
 * not shown the user's logs and the prescription layer stamped sets, reps,
 * rest and an effort target but left `weight` empty. This pass closes that
 * gap from the user's own logs, deterministically:
 *
 * 1. Every logged set of a lift gives an estimated one-rep max (Epley,
 *    `w × (1 + reps / 30)`), on the same terms the client uses in
 *    `exerciseHistory.ts`: nothing above `E1RM_MAX_REPS` reps, a single rep
 *    is the weight itself, no estimate without a load. One difference: a
 *    logged working set is assumed to have been taken with
 *    `LOGGED_SET_ASSUMED_RIR` reps in reserve (the target this app
 *    prescribes), so its reps are counted as `reps + RIR`. Without that, a
 *    set of 10 at 100 lb would be read as a 10-rep max and the plan would
 *    hand back ~95 lb for the same 10 reps at 2 RIR: a regression from what
 *    the user just did.
 * 2. The row's load is the estimate inverted at the row's own target:
 *    `e1rm / (1 + (reps + targetRir) / 30)`, rounded to a plate. Because the
 *    week progression already moved reps and the effort target per phase,
 *    the load follows: a progression week (one rep fewer, one RIR less) is
 *    heavier, a deload week (+2 reps, +2 RIR) is lighter, from the same
 *    history.
 * 3. A main lift with no history gets, in the first week only, a calibration
 *    note: work up to one honest set at the target, log it, and the next
 *    plan (or the next week's rebuild) has a load to build from. Accessories
 *    without history stay unloaded on purpose: an isolation weight is found
 *    in a set, not prescribed from nothing.
 *
 * Bodyweight-only rows, time rows and cardio rows are never loaded. A weight
 * the model guessed is replaced when history exists (the model never saw
 * the logs) and left alone when it does not.
 *
 * All weights are canonical pounds, as stored on logged sets.
 */

/** Above this, a rep-max estimate stops meaning anything (mirrors the client). */
export const E1RM_MAX_REPS = 12;
/** Reps in reserve a logged working set is assumed to have had. */
export const LOGGED_SET_ASSUMED_RIR = 2;
/** Effort target used to invert the estimate when a row carries none. */
const DEFAULT_TARGET_RIR = 2;
/** When no set is inside the estimate's rep window, reuse the best set's load if its reps were this close. */
const REUSE_BEST_SET_REP_TOLERANCE = 4;

/** Rows lighter than this are not worth prescribing (a bar is 45 lb). */
const MIN_PRESCRIBED_LOAD_LB = 5;

/** Estimated one-rep max from the logged sets of one lift, or undefined without a loaded set in range. */
export function estimateOneRepMax(
  sets: ReadonlyArray<LastPerformedSet>,
): number | undefined {
  let best: number | undefined;
  for (const s of sets) {
    const w = s.weight ?? 0;
    if (w <= 0 || !Number.isFinite(w)) continue;
    if (s.reps < 1 || s.reps > E1RM_MAX_REPS) continue;
    const e1rm =
      s.reps === 1 ? w : w * (1 + (s.reps + LOGGED_SET_ASSUMED_RIR) / 30);
    if (best == null || e1rm > best) best = e1rm;
  }
  return best;
}

/** Nearest plate: 5 lb from 20 lb up (2.5 lb a side), 2.5 lb below. */
export function roundLoadLb(weight: number): number {
  const step = weight >= 20 ? 5 : 2.5;
  return Math.round(weight / step) * step;
}

/** The load at which `reps` with `targetRir` in reserve lands on the estimate. */
export function loadForTarget(
  e1rm: number,
  reps: number,
  targetRir: number,
): number {
  const effectiveReps = Math.max(1, reps) + Math.max(0, targetRir);
  return roundLoadLb(e1rm / (1 + effectiveReps / 30));
}

function isTimeOrCardio(
  ex: GeneratedSessionExercise,
  meta: CoachMeta | undefined,
): boolean {
  if (ex.prescriptionType === 'time') return true;
  if (ex.durationSeconds != null) return true;
  return isCardioRowMeta(meta, ex);
}

function isBodyweightOnly(meta: LoadExerciseMeta | undefined): boolean {
  const eq = meta?.primaryEquipment ?? meta?.equipment;
  if (!eq || eq.length === 0) return true;
  return eq.every((x) => /bodyweight/i.test(x));
}

/** Catalog fields this pass reads (subset of `TransformedExercise`). */
export type LoadExerciseMeta = CoachMeta & {
  equipment?: string[];
  primaryEquipment?: string[];
};

/** Working load for one row from one lift's history, or undefined. */
export function loadFromPerformance(
  row: Pick<GeneratedSessionExercise, 'reps' | 'repsMin' | 'targetRir'>,
  perf: LastExercisePerformance,
): number | undefined {
  const reps = row.repsMin ?? row.reps;
  const rir = row.targetRir ?? DEFAULT_TARGET_RIR;
  const e1rm = estimateOneRepMax(perf.sets);
  if (e1rm != null) {
    const load = loadForTarget(e1rm, reps, rir);
    return load >= MIN_PRESCRIBED_LOAD_LB ? load : undefined;
  }
  // Every logged set was above the estimate window (a 15-rep set, say).
  // Reuse its load when the plan asks for something close.
  let best: LastPerformedSet | undefined;
  for (const s of perf.sets) {
    if ((s.weight ?? 0) <= 0) continue;
    if (!best || (s.weight ?? 0) > (best.weight ?? 0)) best = s;
  }
  if (!best || best.weight == null) return undefined;
  if (Math.abs(best.reps - reps) > REUSE_BEST_SET_REP_TOLERANCE)
    return undefined;
  const load = roundLoadLb(best.weight);
  return load >= MIN_PRESCRIBED_LOAD_LB ? load : undefined;
}

/** The first-week note for a main lift with no logged history. */
export function calibrationNote(
  row: Pick<GeneratedSessionExercise, 'reps' | 'repsMin' | 'targetRir'>,
): string {
  const reps = row.repsMin ?? row.reps;
  const rir = row.targetRir ?? DEFAULT_TARGET_RIR;
  const left = rir <= 0 ? 'nothing' : rir === 1 ? '1 rep' : `${rir} reps`;
  return `Calibration: no logged history for this lift yet. Work up over 2-3 sets to one set of ${reps} with about ${left} left in the tank, log it, and your next plan builds its loads from it.`;
}

export type StampLoadsResult = {
  sessions: GeneratedSession[];
  /** Rows that received a working load from history. */
  loaded: number;
  /** First-week main lifts that received a calibration note. */
  calibrated: number;
  /** Distinct lifts with usable history. */
  liftsWithHistory: number;
};

export function stampLoadsFromHistory(args: {
  sessions: GeneratedSession[];
  specs: GenerateSessionsDto['sessions'];
  history: ReadonlyMap<string, LastExercisePerformance>;
  findMeta: (id: string) => LoadExerciseMeta | undefined;
}): StampLoadsResult {
  const { specs, history, findMeta } = args;
  const firstWeek = specs.length
    ? Math.min(...specs.map((s) => s.weekIndex))
    : 0;
  let loaded = 0;
  let calibrated = 0;
  const liftsUsed = new Set<string>();

  const sessions = args.sessions.map((session, i) => {
    const spec = specs[i];
    if (spec && spec.type !== 'strength') return session;
    let mainAssigned = false;
    let changed = false;
    const exercises = session.exercises.map((ex) => {
      const meta = ex.exerciseId ? findMeta(ex.exerciseId) : undefined;
      if (isTimeOrCardio(ex, meta)) return ex;
      const role = coachRoleOf(meta, ex, mainAssigned);
      if (role === 'main') mainAssigned = true;
      if (role === 'core' || role === 'hold') return ex;
      if (isBodyweightOnly(meta)) return ex;

      const perf = ex.exerciseId ? history.get(ex.exerciseId) : undefined;
      if (perf) {
        const load = loadFromPerformance(ex, perf);
        if (load != null) {
          liftsUsed.add(ex.exerciseId!);
          if (ex.weight === load) return ex;
          loaded += 1;
          changed = true;
          return { ...ex, weight: load };
        }
      }
      const weekIndex = spec?.weekIndex ?? session.weekIndex;
      if (
        role === 'main' &&
        ex.weight == null &&
        weekIndex === firstWeek &&
        !(ex.notes ?? '').includes('Calibration:')
      ) {
        calibrated += 1;
        changed = true;
        const note = calibrationNote(ex);
        return {
          ...ex,
          notes: ex.notes?.trim() ? `${ex.notes.trim()} ${note}` : note,
        };
      }
      return ex;
    });
    return changed ? { ...session, exercises } : session;
  });

  return {
    sessions,
    loaded,
    calibrated,
    liftsWithHistory: liftsUsed.size,
  };
}
