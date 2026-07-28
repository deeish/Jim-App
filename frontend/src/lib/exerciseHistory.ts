import type { PersonalBest } from '../types/workout';

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
  totalReps: number;
  volumeLb: number;
}

export interface ExerciseHistorySummary {
  best: PersonalBest | null;
  /** Newest first, as returned. */
  sessions: HistorySessionSummary[];
  /** Any session recorded a weighted set. Gates every load-based claim. */
  hasWeightedWork: boolean;
  /** Oldest to newest, only sessions that produced an estimate. */
  e1rmTrend: Array<{ performedAt: string; e1rmLb: number }>;
  /**
   * Best estimate across everything visible, **including the all-time best
   * set**, which usually predates the returned sessions.
   *
   * Taking this from the trend alone would let the headline contradict itself:
   * a user whose record is 225×3 but who has trained lighter since would be
   * told their estimated max is below a weight they have demonstrably lifted.
   */
  e1rmBestLb: number | null;
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

export function summarizeSession(session: HistorySession): HistorySessionSummary {
  let totalReps = 0;
  let volumeLb = 0;
  for (const set of session.sets) {
    totalReps += set.reps || 0;
    const weightLb = set.weight ?? 0;
    if (weightLb > 0) volumeLb += (set.reps || 0) * weightLb;
  }
  return {
    workoutLogId: session.workoutLogId,
    performedAt: session.performedAt,
    topSet: topWeightedSet(session.sets),
    e1rmLb: bestEstimateOfSession(session.sets),
    setCount: session.sets.length,
    totalReps,
    volumeLb,
  };
}

/** Everything the ExerciseDetail history section renders. */
export function summarizeExerciseHistory(
  history: ExerciseHistory | null | undefined,
): ExerciseHistorySummary {
  const sessions = (history?.sessions ?? []).map(summarizeSession);
  const best = history?.best ?? null;
  // Reversed because the response is newest first but a trend reads forward.
  const e1rmTrend = sessions
    .filter((s) => s.e1rmLb != null)
    .map((s) => ({ performedAt: s.performedAt, e1rmLb: s.e1rmLb as number }))
    .reverse();

  const trendPeak = e1rmTrend.reduce((max, p) => Math.max(max, p.e1rmLb), 0);
  const fromBestSet = best
    ? (estimateOneRepMax(best.weightLb, best.reps) ?? 0)
    : 0;
  const e1rmBest = Math.max(trendPeak, fromBestSet);

  return {
    best,
    sessions,
    hasWeightedWork: sessions.some((s) => s.topSet != null) || best != null,
    e1rmTrend,
    e1rmBestLb: e1rmBest > 0 ? e1rmBest : null,
  };
}

/** Short date for a history row, e.g. `Jul 27`. */
export function formatHistoryDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
