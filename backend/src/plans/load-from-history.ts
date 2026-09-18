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

/** Sessions to compare for a plateau, and the cut when one is found (Tier 4b). */
export const PLATEAU_SESSIONS = 3;
export const PLATEAU_DELOAD_FACTOR = 0.9;
export const PLATEAU_NOTE =
  'Deload on purpose: three sessions at the same weight without a rep gained. Drop about 10% this week and build back up.';

/**
 * A number from an old log is not this block's number (Tier 7 addendum,
 * 2026-09-17). Strength holds for three to four weeks off, drops after two
 * to three months and comes back fast once training resumes, so the load
 * is discounted by the age of the newest log for the lift, one band harsher
 * when the form says "currently sedentary"; past six months the history is
 * ignored and the calibration note runs. The ledger corrects within a week
 * either way; guessing low costs one easy session, guessing high costs a
 * missed week.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
export const STALE_BANDS: ReadonlyArray<{ maxDays: number; factor: number }> = [
  { maxDays: 42, factor: 1 },
  { maxDays: 90, factor: 0.925 },
  { maxDays: 180, factor: 0.85 },
];
/** Logs older than this do not count toward a plateau. */
export const PLATEAU_MAX_AGE_DAYS = 90;

/** 1 for fresh history, a discount for old, undefined when the history is too old to use. */
export function staleFactor(
  performedAt: Date,
  now: Date,
  activityLevel?: string,
): number | undefined {
  const days = Math.max(0, (now.getTime() - performedAt.getTime()) / DAY_MS);
  let band = STALE_BANDS.findIndex((b) => days < b.maxDays);
  if (band < 0) return undefined;
  if ((activityLevel ?? '').trim() === '0') band += 1;
  return band < STALE_BANDS.length ? STALE_BANDS[band]!.factor : undefined;
}

/** Heaviest loaded set of a session and the most reps done at that load. */
function topSet(
  perf: LastExercisePerformance,
): { weight: number; reps: number } | null {
  let best: { weight: number; reps: number } | null = null;
  for (const s of perf.sets) {
    const w = s.weight ?? 0;
    if (w <= 0) continue;
    if (!best || w > best.weight || (w === best.weight && s.reps > best.reps)) {
      best = { weight: w, reps: s.reps };
    }
  }
  return best;
}

/**
 * True when the last `PLATEAU_SESSIONS` sessions sat at the same top load
 * with no rep gained from the oldest to the newest: the double progression
 * has stalled and a deload is the next honest step. `history` is newest
 * first.
 */
export function isPlateaued(
  history: ReadonlyArray<LastExercisePerformance>,
): boolean {
  if (history.length < PLATEAU_SESSIONS) return false;
  const tops = history.slice(0, PLATEAU_SESSIONS).map(topSet);
  if (tops.some((t) => t == null)) return false;
  const [newest, ...rest] = tops as Array<{ weight: number; reps: number }>;
  const sameLoad = rest.every((t) => Math.abs(t.weight - newest.weight) < 2.5);
  if (!sameLoad) return false;
  const oldest = tops[PLATEAU_SESSIONS - 1]!;
  return newest.reps <= oldest.reps;
}

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
  /** First-week rows whose load was cut for a plateau. */
  deloaded: number;
  /** Distinct lifts with usable history. */
  liftsWithHistory: number;
};

export function stampLoadsFromHistory(args: {
  sessions: GeneratedSession[];
  specs: GenerateSessionsDto['sessions'];
  /** Per lift, the most recent sessions newest first (one is enough for a load; three for a plateau). */
  history: ReadonlyMap<
    string,
    LastExercisePerformance | LastExercisePerformance[]
  >;
  findMeta: (id: string) => LoadExerciseMeta | undefined;
  /**
   * The block's small weekly load step (progression-profile.ts): reps hold
   * across a build, so the same history would otherwise stamp the same load
   * every week. 1 when omitted.
   */
  loadFactorForWeek?: (weekIndex: number) => number;
  /** For the stale-history discount; defaults to the current time. */
  now?: Date;
  /** The form's "Training now" answer ('0' is sedentary). */
  activityLevel?: string;
}): StampLoadsResult {
  const { specs, findMeta, loadFactorForWeek } = args;
  const now = args.now ?? new Date();
  const history = new Map<string, LastExercisePerformance[]>();
  for (const [id, v] of args.history) {
    const list = Array.isArray(v) ? v : [v];
    if (list.length > 0) history.set(id, list);
  }
  let deloaded = 0;
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

      const recentAll = ex.exerciseId ? history.get(ex.exerciseId) : undefined;
      const perf = recentAll?.[0];
      const stale = perf
        ? staleFactor(perf.performedAt, now, args.activityLevel)
        : undefined;
      // Too old to be this block's number: fall through to the calibration note.
      const recent = perf && stale != null ? recentAll : undefined;
      if (perf && recent && stale != null) {
        let load = loadFromPerformance(ex, perf);
        if (load != null && stale !== 1) {
          load = Math.max(MIN_PRESCRIBED_LOAD_LB, roundLoadLb(load * stale));
        }
        if (load != null) {
          liftsUsed.add(ex.exerciseId!);
          // Only the first week deloads; later weeks progress from it through
          // the block's load step and, past the halfway point, its effort target.
          const weekIndex = spec?.weekIndex ?? session.weekIndex;
          const factor = loadFactorForWeek?.(weekIndex) ?? 1;
          if (factor !== 1) {
            load = Math.max(MIN_PRESCRIBED_LOAD_LB, roundLoadLb(load * factor));
          }
          const plateau =
            weekIndex === firstWeek &&
            isPlateaued(
              recent.filter(
                (p) =>
                  now.getTime() - p.performedAt.getTime() <
                  PLATEAU_MAX_AGE_DAYS * DAY_MS,
              ),
            );
          if (plateau) {
            load = Math.max(
              MIN_PRESCRIBED_LOAD_LB,
              roundLoadLb(load * PLATEAU_DELOAD_FACTOR),
            );
            deloaded += 1;
          }
          const notes = plateau
            ? (ex.notes ?? '').includes(PLATEAU_NOTE)
              ? ex.notes
              : ex.notes?.trim()
                ? `${ex.notes.trim()} ${PLATEAU_NOTE}`
                : PLATEAU_NOTE
            : ex.notes;
          if (ex.weight === load && notes === ex.notes) return ex;
          loaded += 1;
          changed = true;
          return {
            ...ex,
            weight: load,
            ...(notes !== ex.notes ? { notes } : {}),
          };
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
    deloaded,
    liftsWithHistory: liftsUsed.size,
  };
}
