import {
  E1RM_MAX_REPS,
  bestEstimateOfSession,
  estimateOneRepMax,
  formatBestSetValue,
  formatHistoryDate,
  formatHistoryRowMain,
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
    expect(summary.totalDurationSeconds).toBe(0);
  });

  it('still estimates at the rep cap for rep-based work', () => {
    const summary = summarizeSession(
      session('2026-07-27T10:00:00.000Z', [set(1, E1RM_MAX_REPS, 100)]),
    );
    // 100 x 12 -> 100 * 1.4 = 140
    expect(summary.e1rmLb).toBe(140);
  });

  // Timed exercises store duration seconds in the reps field. A 45s carry
  // would otherwise read as a 45-rep set (past the cap by luck) and a 10s
  // hold as an easy 10-rep set (under it, projecting a max from time).
  it('never estimates a max for a timed session', () => {
    const summary = summarizeSession(
      session('2026-07-27T10:00:00.000Z', [set(1, 10, 100)]),
      true,
    );
    expect(summary.e1rmLb).toBeNull();
  });

  it('totals plausible seconds, not volume, for a timed session', () => {
    const summary = summarizeSession(
      session('2026-07-27T10:00:00.000Z', [set(1, 45, 70), set(2, 45, 70)]),
      true,
    );
    expect(summary.topSet).toEqual({ weightLb: 70, reps: 45 });
    expect(summary.totalDurationSeconds).toBe(90);
    // Seconds x pounds is not lifted volume.
    expect(summary.volumeLb).toBe(0);
  });

  // Legacy timed rows can carry a rep count (1, 10) in the reps field.
  it('ignores implausible stored durations in the timed total', () => {
    const summary = summarizeSession(
      session('2026-07-27T10:00:00.000Z', [set(1, 60, null), set(2, 1, null)]),
      true,
    );
    expect(summary.totalDurationSeconds).toBe(60);
    expect(summary.setCount).toBe(2);
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

  // Past the projection cap the record contributes no Epley estimate, but the
  // weight itself is still a fact: lifting 25 lb at any rep count proves a max
  // of at least 25 lb, so the headline can never dip below it.
  it('floors the estimate at the record weight when its reps are past the cap', () => {
    const summary = summarizeExerciseHistory(
      history([session('2026-07-27T10:00:00.000Z', [set(1, 10, 15)])], {
        weightLb: 25,
        reps: 15,
        performedAt: '2026-01-09T10:00:00.000Z',
      }),
    );
    // The trend alone peaks at 15 x 10 -> 20, below the 25 lb record.
    expect(summary.e1rmTrend.map((p) => p.e1rmLb)).toEqual([20]);
    expect(summary.e1rmBestLb).toBe(25);
  });

  it('lets the trend exceed a record too high-rep to project', () => {
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

  // A 10s 100 lb hold slips under the rep cap when read as reps, and Epley
  // would happily report "est. 133 lb" for holding a bar still.
  it('suppresses every estimate for a timed exercise', () => {
    const summary = summarizeExerciseHistory(
      history(
        [session('2026-07-27T10:00:00.000Z', [set(1, 10, 100)])],
        { weightLb: 100, reps: 10, performedAt: '2026-01-09T10:00:00.000Z' },
      ),
      true,
    );
    expect(summary.isTimeBased).toBe(true);
    expect(summary.sessions[0].e1rmLb).toBeNull();
    expect(summary.e1rmTrend).toEqual([]);
    expect(summary.e1rmBestLb).toBeNull();
    // The weighted hold still counts as load for the "Best set" headline.
    expect(summary.hasWeightedWork).toBe(true);
  });

  it('keeps the top set of a weighted carry without projecting from it', () => {
    const summary = summarizeExerciseHistory(
      history([session('2026-07-27T10:00:00.000Z', [set(1, 45, 70)])]),
      true,
    );
    expect(summary.sessions[0].topSet).toEqual({ weightLb: 70, reps: 45 });
    expect(summary.e1rmTrend).toEqual([]);
    expect(summary.e1rmBestLb).toBeNull();
  });

  // The log writes one entry per exercise slot, so a lift done twice in one
  // workout arrives as two rows sharing a workoutLogId — two rows under one
  // date, and a duplicate React key.
  it('collapses two entries from the same session into one row', () => {
    const summary = summarizeExerciseHistory(
      history([
        session('2026-07-27T10:00:00.000Z', [set(1, 5, 185)], 'log-1'),
        session('2026-07-27T10:00:00.000Z', [set(1, 12, 135)], 'log-1'),
      ]),
    );
    expect(summary.sessions).toHaveLength(1);
    // Both blocks count towards the session's totals.
    expect(summary.sessions[0].setCount).toBe(2);
    expect(summary.sessions[0].totalReps).toBe(17);
    expect(summary.sessions[0].topSet).toEqual({ weightLb: 185, reps: 5 });
    // 135x12 -> 189 beats 185x5 -> 216? No: 185*(1+5/30)=215.8->216 wins.
    expect(summary.sessions[0].e1rmLb).toBe(216);
  });

  it('keeps separate sessions separate', () => {
    const summary = summarizeExerciseHistory(
      history([
        session('2026-07-27T10:00:00.000Z', [set(1, 5, 185)], 'log-1'),
        session('2026-07-20T10:00:00.000Z', [set(1, 5, 180)], 'log-2'),
      ]),
    );
    expect(summary.sessions).toHaveLength(2);
    expect(summary.sessions[0].workoutLogId).toBe('log-1');
  });

  // performedAt is a client-supplied instant, so a double-save can stamp two
  // logs with the same one — the trend's render key has to be the log id.
  it('keys trend points by log id, which double-saves do not share', () => {
    const summary = summarizeExerciseHistory(
      history([
        session('2026-07-27T10:00:00.000Z', [set(1, 5, 100)], 'log-a'),
        session('2026-07-27T10:00:00.000Z', [set(1, 5, 105)], 'log-b'),
      ]),
    );
    expect(summary.e1rmTrend).toHaveLength(2);
    expect(summary.e1rmTrend.map((p) => p.workoutLogId).sort()).toEqual([
      'log-a',
      'log-b',
    ]);
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

describe('formatHistoryRowMain', () => {
  const summarize = (sets: HistorySet[], isTimeBased = false) =>
    summarizeSession(session('2026-07-27T10:00:00.000Z', sets), isTimeBased);

  it('shows the top set for weighted rep work', () => {
    expect(formatHistoryRowMain(summarize([set(1, 8, 135)]), 'lb', false)).toBe(
      '8×135 lb',
    );
  });

  it('shows sets and reps for bodyweight rep work', () => {
    expect(
      formatHistoryRowMain(
        summarize([set(1, 12, null), set(2, 10, null)]),
        'lb',
        false,
      ),
    ).toBe('2 sets · 22 reps');
  });

  it('renders a weighted carry as time at load, not reps', () => {
    expect(
      formatHistoryRowMain(summarize([set(1, 45, 70)], true), 'lb', true),
    ).toBe('45s @ 70 lb');
  });

  it('renders long durations in minutes', () => {
    expect(
      formatHistoryRowMain(summarize([set(1, 90, 70)], true), 'lb', true),
    ).toBe('1m 30s @ 70 lb');
  });

  // A 3x60s plank must never read as "3 sets · 180 reps".
  it('renders a bodyweight plank session as total time', () => {
    expect(
      formatHistoryRowMain(
        summarize([set(1, 60, null), set(2, 60, null), set(3, 60, null)], true),
        'lb',
        true,
      ),
    ).toBe('3 sets · 3 min');
  });

  // Legacy timed rows stored a rep count in the reps field; "10s" would be a
  // fiction, so only the load survives.
  it('drops an implausible stored duration and keeps the load', () => {
    expect(
      formatHistoryRowMain(summarize([set(1, 10, 100)], true), 'lb', true),
    ).toBe('100 lb');
  });

  it('falls back to the set count when no timed number is trustworthy', () => {
    expect(
      formatHistoryRowMain(
        summarize([set(1, 1, null), set(2, 10, null)], true),
        'lb',
        true,
      ),
    ).toBe('2 sets');
  });
});

describe('formatBestSetValue', () => {
  const best = (weightLb: number, reps: number) => ({
    weightLb,
    reps,
    performedAt: '2026-01-09T10:00:00.000Z',
  });

  it('shows reps at weight for rep work', () => {
    expect(formatBestSetValue(best(135, 8), 'lb', false)).toBe('8×135 lb');
  });

  it('shows time at load for timed work', () => {
    expect(formatBestSetValue(best(70, 45), 'lb', true)).toBe('45s @ 70 lb');
  });

  it('shows only the load for an implausible stored duration', () => {
    expect(formatBestSetValue(best(100, 10), 'lb', true)).toBe('100 lb');
  });
});

describe('formatHistoryDate', () => {
  // `now` pinned so the expectations survive the turn of a year.
  const now = new Date(2026, 6, 29);

  it('formats a short month and day within the current year', () => {
    const iso = new Date(2026, 6, 27, 12, 0, 0).toISOString();
    expect(formatHistoryDate(iso, now)).toBe('Jul 27');
  });

  // The list is bounded by session count, not age: a quarterly lift spans
  // years of rows, and "Jul 27" alone cannot say which one.
  it('appends the year outside the current one', () => {
    const iso = new Date(2025, 6, 27, 12, 0, 0).toISOString();
    expect(formatHistoryDate(iso, now)).toBe('Jul 27, 2025');
  });

  it('returns empty for an unparseable instant', () => {
    expect(formatHistoryDate('not-a-date')).toBe('');
  });
});
