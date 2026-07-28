import {
  E1RM_MAX_REPS,
  bestEstimateOfSession,
  estimateOneRepMax,
  formatHistoryDate,
  summarizeExerciseHistory,
  summarizeSession,
  type ExerciseHistory,
  type HistorySession,
  type HistorySet,
} from './exerciseHistory';

const set = (
  setNumber: number,
  reps: number,
  weight: number | null,
): HistorySet => ({ setNumber, reps, weight });

const session = (
  performedAt: string,
  sets: HistorySet[],
  workoutLogId = `log-${performedAt}`,
): HistorySession => ({ workoutLogId, performedAt, sets });

const history = (
  sessions: HistorySession[],
  best: ExerciseHistory['best'] = null,
): ExerciseHistory => ({ exerciseId: 'bench_press', best, sessions });

describe('estimateOneRepMax', () => {
  it('applies Epley for multi-rep sets', () => {
    // 100 x 5 -> 100 * (1 + 5/30) = 116.67 -> 117
    expect(estimateOneRepMax(100, 5)).toBe(117);
    // 225 x 3 -> 225 * 1.1 = 247.5 -> 248
    expect(estimateOneRepMax(225, 3)).toBe(248);
  });

  // Epley would return w * 1.033 at one rep, claiming more than was lifted.
  it('reports a single rep as the weight itself', () => {
    expect(estimateOneRepMax(315, 1)).toBe(315);
  });

  it('suppresses estimates past the rep cap', () => {
    expect(estimateOneRepMax(100, E1RM_MAX_REPS)).not.toBeNull();
    expect(estimateOneRepMax(100, E1RM_MAX_REPS + 1)).toBeNull();
    expect(estimateOneRepMax(100, 30)).toBeNull();
  });

  it('has nothing to project from an unweighted set', () => {
    expect(estimateOneRepMax(null, 8)).toBeNull();
    expect(estimateOneRepMax(0, 8)).toBeNull();
    expect(estimateOneRepMax(undefined, 8)).toBeNull();
  });

  it('rejects nonsensical rep counts', () => {
    expect(estimateOneRepMax(100, 0)).toBeNull();
    expect(estimateOneRepMax(100, -3)).toBeNull();
    expect(estimateOneRepMax(100, Number.NaN)).toBeNull();
  });
});

describe('bestEstimateOfSession', () => {
  // A lighter set taken for more reps can project a higher max, and is the
  // better evidence — so the estimate is taken across all sets.
  it('takes the best estimate across sets, not just the heaviest', () => {
    const sets = [set(1, 1, 200), set(2, 8, 175)];
    // 200x1 -> 200; 175x8 -> 175 * 1.2667 = 221.7 -> 222
    expect(bestEstimateOfSession(sets)).toBe(222);
  });

  it('ignores sets that cannot produce an estimate', () => {
    expect(bestEstimateOfSession([set(1, 20, 100), set(2, 5, 100)])).toBe(117);
  });

  it('is null for a fully unweighted session', () => {
    expect(bestEstimateOfSession([set(1, 12, null), set(2, 10, null)])).toBeNull();
  });
});

describe('summarizeSession', () => {
  it('picks the heaviest set, preferring more reps on a tie', () => {
    const summary = summarizeSession(
      session('2026-07-27T10:00:00.000Z', [
        set(1, 5, 135),
        set(2, 8, 135),
        set(3, 3, 120),
      ]),
    );
    expect(summary.topSet).toEqual({ weightLb: 135, reps: 8 });
  });

  it('counts sets, reps and volume', () => {
    const summary = summarizeSession(
      session('2026-07-27T10:00:00.000Z', [set(1, 5, 100), set(2, 5, 100)]),
    );
    expect(summary.setCount).toBe(2);
    expect(summary.totalReps).toBe(10);
    expect(summary.volumeLb).toBe(1000);
  });

  it('keeps reps but no load for a bodyweight session', () => {
    const summary = summarizeSession(
      session('2026-07-27T10:00:00.000Z', [set(1, 12, null), set(2, 10, null)]),
    );
    expect(summary.topSet).toBeNull();
    expect(summary.e1rmLb).toBeNull();
    expect(summary.volumeLb).toBe(0);
    expect(summary.totalReps).toBe(22);
  });
});

describe('summarizeExerciseHistory', () => {
  it('keeps sessions newest first but runs the trend forward in time', () => {
    const summary = summarizeExerciseHistory(
      history([
        session('2026-07-27T10:00:00.000Z', [set(1, 5, 140)]),
        session('2026-07-20T10:00:00.000Z', [set(1, 5, 135)]),
        session('2026-07-13T10:00:00.000Z', [set(1, 5, 130)]),
      ]),
    );
    expect(summary.sessions[0].performedAt).toBe('2026-07-27T10:00:00.000Z');
    expect(summary.e1rmTrend.map((p) => p.e1rmLb)).toEqual([152, 158, 163]);
  });

  it('reports no weighted work for a bodyweight-only lift', () => {
    const summary = summarizeExerciseHistory(
      history([session('2026-07-27T10:00:00.000Z', [set(1, 15, null)])]),
    );
    expect(summary.hasWeightedWork).toBe(false);
    expect(summary.e1rmTrend).toEqual([]);
    // The session itself still counts; only the load claims are withheld.
    expect(summary.sessions).toHaveLength(1);
    expect(summary.sessions[0].totalReps).toBe(15);
  });

  it('leaves sessions with no estimate out of the trend but not the list', () => {
    const summary = summarizeExerciseHistory(
      history([
        session('2026-07-27T10:00:00.000Z', [set(1, 20, 60)]),
        session('2026-07-20T10:00:00.000Z', [set(1, 5, 135)]),
      ]),
    );
    expect(summary.sessions).toHaveLength(2);
    expect(summary.e1rmTrend).toHaveLength(1);
  });

  // The headline must never undercut a set the user demonstrably lifted. The
  // all-time best usually predates the returned window, so taking the estimate
  // from the trend alone would print "best est. 1RM 171 lb" directly beside
  // "best set 3×225 lb".
  it('never reports an estimated max below the all-time best set', () => {
    const summary = summarizeExerciseHistory(
      history(
        [
          session('2026-07-27T10:00:00.000Z', [set(1, 8, 135)]),
          session('2026-07-20T10:00:00.000Z', [set(1, 8, 135)]),
        ],
        { weightLb: 225, reps: 3, performedAt: '2026-01-09T10:00:00.000Z' },
      ),
    );
    // Trend peak alone would be 171; the record projects to 248.
    expect(summary.e1rmTrend.every((p) => p.e1rmLb === 171)).toBe(true);
    expect(summary.e1rmBestLb).toBe(248);
  });

  it('falls back to the trend when the record is too high-rep to project', () => {
    const summary = summarizeExerciseHistory(
      history([session('2026-07-27T10:00:00.000Z', [set(1, 5, 100)])], {
        weightLb: 60,
        reps: 25,
        performedAt: '2026-01-09T10:00:00.000Z',
      }),
    );
    expect(summary.e1rmBestLb).toBe(117);
  });

  it('has no estimate at all for a bodyweight-only lift', () => {
    const summary = summarizeExerciseHistory(
      history([session('2026-07-27T10:00:00.000Z', [set(1, 15, null)])]),
    );
    expect(summary.e1rmBestLb).toBeNull();
  });

  it('carries the all-time best straight through', () => {
    const best = { weightLb: 225, reps: 3, performedAt: '2026-01-09T10:00:00.000Z' };
    expect(summarizeExerciseHistory(history([], best)).best).toEqual(best);
  });

  it('handles a null payload, e.g. a failed fetch', () => {
    const summary = summarizeExerciseHistory(null);
    expect(summary.sessions).toEqual([]);
    expect(summary.best).toBeNull();
    expect(summary.hasWeightedWork).toBe(false);
  });
});

describe('formatHistoryDate', () => {
  it('formats a short month and day', () => {
    const iso = new Date(2026, 6, 27, 12, 0, 0).toISOString();
    expect(formatHistoryDate(iso)).toBe('Jul 27');
  });

  it('returns empty for an unparseable instant', () => {
    expect(formatHistoryDate('not-a-date')).toBe('');
  });
});
