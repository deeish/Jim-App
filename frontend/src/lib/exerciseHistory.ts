import type { PersonalBest } from '../types/workout';
import { WeightUnit, formatWeightCompactFromLb } from './weightDisplay';
import { formatRestSecondsForPreview } from './exercisePrescription';
import { MIN_PLAUSIBLE_DURATION_SECONDS } from './lastPerformanceDisplay';

/**
 * Per-exercise history: what the user has actually done with one lift.
 *
 * The estimated one-rep max is Epley — `weight × (1 + reps / 30)` — with two
 * deliberate limits:
 *
 * 1. **It is suppressed above `E1RM_MAX_REPS`.** Every rep-max formula is
 *    fitted to low-rep work and drifts badly past about a dozen reps, where it
 *    starts reporting maxima nobody could lift. Showing nothing is honest;
 *    showing a number that flatters the user is not.
 * 2. **A single rep is reported as the weight itself.** Epley returns
 *    `w × 1.033` at one rep, which would claim someone lifted more than they
 *    did. A one-rep set *is* a tested max.
 *
 * Unweighted work produces no estimate at all: there is no load to project.
 *
 * Time-based exercises (planks, carries, treadmill blocks) log their duration
 * **seconds in the reps field**. Summaries built with `isTimeBased` treat that
 * field as time: no rep-max is projected from it — a 10 second hold would
 * otherwise read as an easy 10-rep set and sail under the cap — and the
 * display helpers render it as a duration, never a rep count.
 */

/** Above this, a rep-max estimate stops meaning anything. */
export const E1RM_MAX_REPS = 12;

/** One completed set of a logged session. */
export interface HistorySet {
  setNumber: number;
  reps: number;
  /** Canonical pounds; null for bodyweight sets. */
  weight: number | null;
}

/** One session in which the exercise was performed. */
export interface HistorySession {
  workoutLogId: string;
  /** ISO instant. */
  performedAt: string;
  sets: HistorySet[];
}

/** `GET /workout-logs/exercise-history` response. */
export interface ExerciseHistory {
  exerciseId: string;
  /** All-time heaviest set, from the unbounded aggregate. */
  best: PersonalBest | null;
  /** Newest first. */
  sessions: HistorySession[];
}

export interface HistorySessionSummary {
  workoutLogId: string;
  performedAt: string;
  /** Heaviest weighted set, or null when the session was unweighted. */
  topSet: { weightLb: number; reps: number } | null;
  /** Best estimate across the session's sets; null when none qualifies. */
  e1rmLb: number | null;
  setCount: number;
  /** Raw sum of the reps field, which holds seconds for time-based work. */
  totalReps: number;
  /** Σ reps × weight; 0 for time-based work — seconds × pounds is not volume. */
  volumeLb: number;
  /** Plausible logged seconds for time-based work; 0 otherwise. */
  totalDurationSeconds: number;
}

export interface ExerciseHistorySummary {
  best: PersonalBest | null;
  /** Newest first, as returned. */
  sessions: HistorySessionSummary[];
  /** Any session recorded a weighted set. Gates every load-based claim. */
  hasWeightedWork: boolean;
  /**
   * Oldest to newest, only sessions that produced an estimate. `workoutLogId`
   * is the render key: `performedAt` is a client-supplied instant that two
   * logs can share (double-save).
   */
  e1rmTrend: Array<{ workoutLogId: string; performedAt: string; e1rmLb: number }>;
  /**
   * Best estimate across everything visible, **including the all-time best
   * set**, which usually predates the returned sessions.
   *
   * Taking this from the trend alone would let the headline contradict itself:
   * a user whose record is 225×3 but who has trained lighter since would be
   * told their estimated max is below a weight they have demonstrably lifted.
   * For the same reason the record's weight floors the figure even when its
   * rep count is past the projection cap: a weight lifted at any rep count
   * proves a max of at least that weight. Always null for time-based work.
   */
  e1rmBestLb: number | null;
  /** Echoed from the caller so consumers format the summary the same way. */
  isTimeBased: boolean;
}

/**
 * Estimated one-rep max in pounds, or null when no honest estimate exists.
 * Rounded to the pound — these are projections, not measurements.
 */
export function estimateOneRepMax(
  weightLb: number | null | undefined,
  reps: number,
): number | null {
  if (weightLb == null || weightLb <= 0) return null;
  if (!Number.isFinite(reps) || reps < 1) return null;
  if (reps > E1RM_MAX_REPS) return null;
  if (reps === 1) return Math.round(weightLb);
  return Math.round(weightLb * (1 + reps / 30));
}

/** Heaviest weighted set of a session; ties prefer more reps. */
function topWeightedSet(
  sets: HistorySet[],
): { weightLb: number; reps: number } | null {
  let best: { weightLb: number; reps: number } | null = null;
  for (const set of sets) {
    const weightLb = set.weight ?? 0;
    if (weightLb <= 0) continue;
    if (
      !best ||
      weightLb > best.weightLb ||
      (weightLb === best.weightLb && set.reps > best.reps)
    ) {
      best = { weightLb, reps: set.reps };
    }
  }
  return best;
}

/**
 * Best estimate across a session.
 *
 * Taken over every set rather than just the heaviest, because a lighter set for
 * many more reps can project a higher max — and that set is the better evidence
 * of what the user could lift.
 */
export function bestEstimateOfSession(sets: HistorySet[]): number | null {
  let best: number | null = null;
  for (const set of sets) {
    const estimate = estimateOneRepMax(set.weight, set.reps);
    if (estimate != null && (best == null || estimate > best)) best = estimate;
  }
  return best;
}

export function summarizeSession(
  session: HistorySession,
  isTimeBased = false,
): HistorySessionSummary {
  let totalReps = 0;
  let volumeLb = 0;
  let totalDurationSeconds = 0;
  for (const set of session.sets) {
    totalReps += set.reps || 0;
    const weightLb = set.weight ?? 0;
    if (!isTimeBased && weightLb > 0) volumeLb += (set.reps || 0) * weightLb;
    // Legacy timed rows can carry a rep count (1, 10) instead of seconds, so
    // only plausible durations accrue — same gate as formatLastTimeLine.
    if (isTimeBased && (set.reps || 0) >= MIN_PLAUSIBLE_DURATION_SECONDS) {
      totalDurationSeconds += set.reps;
    }
  }
  return {
    workoutLogId: session.workoutLogId,
    performedAt: session.performedAt,
    topSet: topWeightedSet(session.sets),
    // Seconds in the reps field would pass the rep cap and project a max from
    // time, so timed sessions get no estimate at all.
    e1rmLb: isTimeBased ? null : bestEstimateOfSession(session.sets),
    setCount: session.sets.length,
    totalReps,
    volumeLb,
    totalDurationSeconds,
  };
}

/**
 * Collapses rows that belong to the same logged session.
 *
 * The log writes one entry per exercise *slot*, so a lift performed twice in
 * one workout — an opener plus a back-off block, or one re-added from the
 * library — arrives as two rows sharing a `workoutLogId`. Rendered as-is that
 * is two rows under one date, and a duplicate React key.
 */
function mergeRowsBySession(rows: HistorySession[]): HistorySession[] {
  const bySession = new Map<string, HistorySession>();
  for (const row of rows) {
    const existing = bySession.get(row.workoutLogId);
    if (!existing) {
      bySession.set(row.workoutLogId, { ...row, sets: [...row.sets] });
    } else {
      existing.sets.push(...row.sets);
    }
  }
  // Map iteration is insertion order, so newest-first is preserved.
  return [...bySession.values()];
}

/** Everything the ExerciseDetail history section renders. */
export function summarizeExerciseHistory(
  history: ExerciseHistory | null | undefined,
  isTimeBased = false,
): ExerciseHistorySummary {
  const sessions = mergeRowsBySession(history?.sessions ?? []).map((row) =>
    summarizeSession(row, isTimeBased),
  );
  const best = history?.best ?? null;
  // Reversed because the response is newest first but a trend reads forward.
  const e1rmTrend = sessions
    .filter((s) => s.e1rmLb != null)
    .map((s) => ({
      workoutLogId: s.workoutLogId,
      performedAt: s.performedAt,
      e1rmLb: s.e1rmLb as number,
    }))
    .reverse();

  // Guarded even though the timed trend is already empty: the all-time best of
  // a short hold (10s at 100 lb) would still slip past the rep cap here.
  let e1rmBestLb: number | null = null;
  if (!isTimeBased) {
    const trendPeak = e1rmTrend.reduce((max, p) => Math.max(max, p.e1rmLb), 0);
    const fromBestSet = best
      ? (estimateOneRepMax(best.weightLb, best.reps) ?? 0)
      : 0;
    // The record weight is a floor, not a projection: past the rep cap Epley
    // contributes nothing, but the bar was still lifted.
    const e1rmBest = Math.max(trendPeak, fromBestSet, best?.weightLb ?? 0);
    e1rmBestLb = e1rmBest > 0 ? e1rmBest : null;
  }

  return {
    best,
    sessions,
    hasWeightedWork: sessions.some((s) => s.topSet != null) || best != null,
    e1rmTrend,
    e1rmBestLb,
    isTimeBased,
  };
}

/**
 * Value of the "Best set" stat, e.g. `8×135 lb` — or `45s @ 70 lb` for timed
 * work. A timed record holding an implausible duration (legacy rows stored a
 * rep count there) shows the load alone rather than a fictional "10s".
 */
export function formatBestSetValue(
  best: PersonalBest,
  unit: WeightUnit,
  isTimeBased: boolean,
): string {
  const weight = formatWeightCompactFromLb(best.weightLb, unit);
  if (!isTimeBased) return `${best.reps}×${weight}`;
  if (best.reps < MIN_PLAUSIBLE_DURATION_SECONDS) return weight;
  return `${formatRestSecondsForPreview(best.reps)} @ ${weight}`;
}

/**
 * Main column of a history row:
 *   weighted:          `8×135 lb`         (top set)
 *   bodyweight:        `3 sets · 24 reps`
 *   timed, weighted:   `45s @ 70 lb`      (top set)
 *   timed, bodyweight: `3 sets · 3 min`   (total logged time)
 * Implausible stored durations are dropped, same as `formatBestSetValue`.
 */
export function formatHistoryRowMain(
  summary: HistorySessionSummary,
  unit: WeightUnit,
  isTimeBased: boolean,
): string {
  const setsLabel = `${summary.setCount} ${summary.setCount === 1 ? 'set' : 'sets'}`;
  if (!isTimeBased) {
    return summary.topSet
      ? `${summary.topSet.reps}×${formatWeightCompactFromLb(summary.topSet.weightLb, unit)}`
      : `${setsLabel} · ${summary.totalReps} reps`;
  }
  if (summary.topSet) {
    const weight = formatWeightCompactFromLb(summary.topSet.weightLb, unit);
    if (summary.topSet.reps < MIN_PLAUSIBLE_DURATION_SECONDS) return weight;
    return `${formatRestSecondsForPreview(summary.topSet.reps)} @ ${weight}`;
  }
  return summary.totalDurationSeconds > 0
    ? `${setsLabel} · ${formatRestSecondsForPreview(summary.totalDurationSeconds)}`
    : setsLabel;
}

// Spelled out by hand: Hermes builds without full Intl ignore
// `toLocaleDateString` options (see `formatVolumeFromLb` in weightDisplay).
const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Short date for a history row: `Jul 27`, or `Jul 27, 2025` outside the
 * current year. The list is bounded by session count, not age, so a rarely
 * logged lift can span years of otherwise identical-looking dates.
 */
export function formatHistoryDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const label = `${SHORT_MONTHS[date.getMonth()]} ${date.getDate()}`;
  return date.getFullYear() === now.getFullYear()
    ? label
    : `${label}, ${date.getFullYear()}`;
}
