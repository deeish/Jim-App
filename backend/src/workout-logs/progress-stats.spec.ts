import type { PrismaService } from '../prisma/prisma.service';
import {
  bestWeightedSetPerExercise,
  fetchExerciseHistory,
  resolveHistorySessions,
  resolveStatsMonths,
  resolveStatsRangeStart,
  summarizeSessions,
  EXERCISE_HISTORY_DEFAULT_SESSIONS,
  EXERCISE_HISTORY_MAX_SESSIONS,
  STATS_DEFAULT_MONTHS,
  STATS_MAX_MONTHS,
  type EntryWithSets,
  type SessionSummary,
} from './progress-stats';

function session(over: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 'log-1',
    startedAt: new Date('2026-07-20T18:00:00Z'),
    completedAt: new Date('2026-07-20T19:00:00Z'),
    totalTimeSeconds: 3600,
    totalSets: 20,
    totalVolume: 12000,
    workoutName: 'Upper',
    ...over,
  };
}

function entry(
  exerciseId: string,
  startedAt: string,
  sets: Array<{ weight: number | null; reps: number }>,
): EntryWithSets {
  return {
    exerciseId,
    workoutLog: { startedAt: new Date(startedAt) },
    completedSets: sets,
  };
}

describe('resolveHistorySessions', () => {
  it('defaults when omitted or not a number', () => {
    expect(resolveHistorySessions(undefined)).toBe(
      EXERCISE_HISTORY_DEFAULT_SESSIONS,
    );
    expect(resolveHistorySessions(Number.NaN)).toBe(
      EXERCISE_HISTORY_DEFAULT_SESSIONS,
    );
  });

  it('clamps to the supported range', () => {
    expect(resolveHistorySessions(0)).toBe(1);
    expect(resolveHistorySessions(-5)).toBe(1);
    expect(resolveHistorySessions(9999)).toBe(EXERCISE_HISTORY_MAX_SESSIONS);
  });

  it('floors fractional requests', () => {
    expect(resolveHistorySessions(7.9)).toBe(7);
  });
});

describe('resolveStatsMonths', () => {
  it('defaults when omitted or not a number', () => {
    expect(resolveStatsMonths(undefined)).toBe(STATS_DEFAULT_MONTHS);
    expect(resolveStatsMonths(Number.NaN)).toBe(STATS_DEFAULT_MONTHS);
  });

  it('clamps to the supported range', () => {
    expect(resolveStatsMonths(0)).toBe(1);
    expect(resolveStatsMonths(-5)).toBe(1);
    expect(resolveStatsMonths(STATS_MAX_MONTHS + 100)).toBe(STATS_MAX_MONTHS);
  });

  it('floors fractional input', () => {
    expect(resolveStatsMonths(3.9)).toBe(3);
  });
});

describe('resolveStatsRangeStart', () => {
  it('walks back whole months from now', () => {
    const start = resolveStatsRangeStart(12, new Date('2026-07-15T12:00:00Z'));
    expect(start.getFullYear()).toBe(2025);
    expect(start.getMonth()).toBe(6); // July, zero-based
  });

  it('clamps the depth it is given', () => {
    const now = new Date('2026-07-15T12:00:00Z');
    const capped = resolveStatsRangeStart(STATS_MAX_MONTHS + 100, now);
    const atMax = resolveStatsRangeStart(STATS_MAX_MONTHS, now);
    expect(capped.getTime()).toBe(atMax.getTime());
  });

  // Month-end starts, where bare setMonth overflows: from Mar 31 it would
  // call "one month back" Mar 3, silently excluding Feb 28 – Mar 2 from the
  // window. Local-time constructors here so the local getters below can't
  // straddle a UTC day boundary on some CI timezone.
  it('clamps to the end of a shorter target month', () => {
    const start = resolveStatsRangeStart(1, new Date(2026, 2, 31, 12, 0, 0));
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(1); // February, zero-based
    expect(start.getDate()).toBe(28);
    expect(start.getHours()).toBe(12); // clock time survives the clamp
  });

  it('lands on Jun 30 walking back one month from Jul 31', () => {
    const start = resolveStatsRangeStart(1, new Date(2026, 6, 31, 12, 0, 0));
    expect(start.getMonth()).toBe(5); // June, zero-based
    expect(start.getDate()).toBe(30);
  });

  it('clamps a leap day landing on a non-leap February', () => {
    const start = resolveStatsRangeStart(12, new Date(2028, 1, 29, 12, 0, 0));
    expect(start.getFullYear()).toBe(2027);
    expect(start.getMonth()).toBe(1); // February, zero-based
    expect(start.getDate()).toBe(28);
  });

  it('keeps a month-end day the target month does have', () => {
    // Mar 31 back two months: January has a 31st, so nothing clamps.
    const start = resolveStatsRangeStart(2, new Date(2026, 2, 31, 12, 0, 0));
    expect(start.getMonth()).toBe(0); // January, zero-based
    expect(start.getDate()).toBe(31);
  });
});

describe('summarizeSessions', () => {
  it('sums the window and counts sessions', () => {
    const totals = summarizeSessions([
      session({ totalSets: 20, totalTimeSeconds: 3600, totalVolume: 12000 }),
      session({
        id: 'log-2',
        totalSets: 15,
        totalTimeSeconds: 1800,
        totalVolume: 8000,
      }),
    ]);
    expect(totals.sessionCount).toBe(2);
    expect(totals.totalSets).toBe(35);
    expect(totals.totalTimeSeconds).toBe(5400);
    expect(totals.totalVolumeLb).toBe(20000);
    expect(totals.sessionsWithVolume).toBe(2);
  });

  it('treats null numeric columns as zero', () => {
    const totals = summarizeSessions([
      session({ totalSets: null, totalTimeSeconds: null, totalVolume: null }),
    ]);
    expect(totals.sessionCount).toBe(1);
    expect(totals.totalSets).toBe(0);
    expect(totals.totalVolumeLb).toBe(0);
  });

  // The bodyweight-only / never-types-a-weight user: the client uses this to
  // hide volume UI rather than render a wall of zeroes.
  it('does not count zero-volume sessions as having volume', () => {
    const totals = summarizeSessions([
      session({ totalVolume: 0 }),
      session({ id: 'log-2', totalVolume: null }),
      session({ id: 'log-3', totalVolume: 500 }),
    ]);
    expect(totals.sessionCount).toBe(3);
    expect(totals.sessionsWithVolume).toBe(1);
  });

  it('returns a zeroed envelope for a user with no sessions', () => {
    expect(summarizeSessions([])).toEqual({
      sessionCount: 0,
      totalSets: 0,
      totalTimeSeconds: 0,
      totalVolumeLb: 0,
      sessionsWithVolume: 0,
    });
  });
});

describe('bestWeightedSetPerExercise', () => {
  // The regression this whole helper exists for: a best reduced over a recent
  // window would miss the older, heavier set and celebrate a false PR.
  it('finds the heaviest set even when it is the oldest of many', () => {
    const entries: EntryWithSets[] = [
      entry('bench', '2026-01-05T10:00:00Z', [{ weight: 225, reps: 3 }]),
      ...Array.from({ length: 40 }, (_, i) =>
        entry('bench', `2026-0${(i % 6) + 2}-10T10:00:00Z`, [
          { weight: 200, reps: 5 },
        ]),
      ),
    ];
    const best = bestWeightedSetPerExercise(entries).get('bench');
    expect(best?.weightLb).toBe(225);
    expect(best?.reps).toBe(3);
    expect(best?.performedAt).toEqual(new Date('2026-01-05T10:00:00Z'));
  });

  // An unweighted set sets no load PR — the exercise is omitted rather than
  // reported as a 0 lb best.
  it('omits exercises whose sets are all unweighted', () => {
    const result = bestWeightedSetPerExercise([
      entry('push_up', '2026-07-10T10:00:00Z', [
        { weight: null, reps: 20 },
        { weight: 0, reps: 15 },
      ]),
    ]);
    expect(result.has('push_up')).toBe(false);
    expect(result.size).toBe(0);
  });

  it('ignores unweighted sets but keeps weighted ones on the same exercise', () => {
    const best = bestWeightedSetPerExercise([
      entry('dip', '2026-07-10T10:00:00Z', [
        { weight: null, reps: 12 },
        { weight: 45, reps: 8 },
      ]),
    ]).get('dip');
    expect(best).toEqual({
      weightLb: 45,
      reps: 8,
      performedAt: new Date('2026-07-10T10:00:00Z'),
    });
  });

  it('breaks a weight tie on more reps', () => {
    const best = bestWeightedSetPerExercise([
      entry('squat', '2026-07-10T10:00:00Z', [{ weight: 315, reps: 3 }]),
      entry('squat', '2026-07-17T10:00:00Z', [{ weight: 315, reps: 5 }]),
    ]).get('squat');
    expect(best?.reps).toBe(5);
    expect(best?.performedAt).toEqual(new Date('2026-07-17T10:00:00Z'));
  });

  it('breaks a weight+reps tie on the earlier date', () => {
    const best = bestWeightedSetPerExercise([
      entry('row', '2026-07-17T10:00:00Z', [{ weight: 135, reps: 8 }]),
      entry('row', '2026-03-02T10:00:00Z', [{ weight: 135, reps: 8 }]),
    ]).get('row');
    expect(best?.performedAt).toEqual(new Date('2026-03-02T10:00:00Z'));
  });

  it('keys bests per exercise', () => {
    const result = bestWeightedSetPerExercise([
      entry('bench', '2026-07-10T10:00:00Z', [{ weight: 185, reps: 5 }]),
      entry('squat', '2026-07-10T10:00:00Z', [{ weight: 275, reps: 5 }]),
    ]);
    expect(result.get('bench')?.weightLb).toBe(185);
    expect(result.get('squat')?.weightLb).toBe(275);
  });

  it('returns an empty map for no entries', () => {
    expect(bestWeightedSetPerExercise([]).size).toBe(0);
  });
});

function historyRow(
  workoutLogId: string,
  startedAt: string,
  sets: Array<{ setNumber: number; reps: number; weight: number | null }>,
) {
  return {
    workoutLogId,
    workoutLog: { startedAt: new Date(startedAt) },
    completedSets: sets,
  };
}

describe('fetchExerciseHistory', () => {
  const prisma = {
    workoutLog: { findMany: jest.fn() },
    workoutLogEntry: { findMany: jest.fn() },
  };
  const asPrisma = prisma as unknown as PrismaService;
  const logQueryArg = () => prisma.workoutLog.findMany.mock.calls[0][0];
  const entryQueryArg = () => prisma.workoutLogEntry.findMany.mock.calls[0][0];

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.workoutLog.findMany.mockResolvedValue([]);
    prisma.workoutLogEntry.findMany.mockResolvedValue([]);
  });

  // The log writes one entry per exercise SLOT, so an opener + back-off user
  // has two rows per session. `limit` bounds distinct sessions — a `take` on
  // entry rows would hand that user half the sessions they asked for.
  it('returns `limit` complete sessions for a duplicate-slot user', async () => {
    prisma.workoutLog.findMany.mockResolvedValue([
      { id: 'log-2' },
      { id: 'log-1' },
    ]);
    prisma.workoutLogEntry.findMany.mockResolvedValue([
      historyRow('log-2', '2026-07-20T18:00:00Z', [
        { setNumber: 1, reps: 5, weight: 185 },
      ]),
      historyRow('log-2', '2026-07-20T18:00:00Z', [
        { setNumber: 1, reps: 10, weight: 135 },
      ]),
      historyRow('log-1', '2026-07-13T18:00:00Z', [
        { setNumber: 1, reps: 5, weight: 180 },
      ]),
      historyRow('log-1', '2026-07-13T18:00:00Z', [
        { setNumber: 1, reps: 10, weight: 130 },
      ]),
    ]);
    const sessions = await fetchExerciseHistory(asPrisma, 'u1', 'bench', 2);
    // All four rows survive: two distinct sessions, each with both slots.
    expect(sessions).toHaveLength(4);
    expect(new Set(sessions.map((s) => s.workoutLogId))).toEqual(
      new Set(['log-2', 'log-1']),
    );
    // The bound sits on the log query; the entry query is deliberately
    // untaken and targets exactly the chosen sessions.
    expect(logQueryArg().take).toBe(2);
    expect(entryQueryArg().take).toBeUndefined();
    expect(entryQueryArg().where.workoutLogId).toEqual({
      in: ['log-2', 'log-1'],
    });
  });

  // The old single-query shape's worst case: a row cut landing between a
  // session's two slots returned that session incomplete, understating its
  // top set and volume and bending the oldest trend bar.
  it('never splits the boundary session mid-pair', async () => {
    prisma.workoutLog.findMany.mockResolvedValue([{ id: 'log-9' }]);
    prisma.workoutLogEntry.findMany.mockResolvedValue([
      historyRow('log-9', '2026-07-20T18:00:00Z', [
        { setNumber: 1, reps: 3, weight: 225 },
      ]),
      historyRow('log-9', '2026-07-20T18:00:00Z', [
        { setNumber: 1, reps: 8, weight: 185 },
      ]),
    ]);
    const sessions = await fetchExerciseHistory(asPrisma, 'u1', 'bench', 1);
    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => s.sets[0].weight)).toEqual([225, 185]);
  });

  it('maps single-slot sessions unchanged, newest first', async () => {
    prisma.workoutLog.findMany.mockResolvedValue([
      { id: 'log-2' },
      { id: 'log-1' },
    ]);
    prisma.workoutLogEntry.findMany.mockResolvedValue([
      historyRow('log-2', '2026-07-20T18:00:00Z', [
        { setNumber: 1, reps: 5, weight: 185 },
        { setNumber: 2, reps: 5, weight: 185 },
      ]),
      historyRow('log-1', '2026-07-13T18:00:00Z', [
        { setNumber: 1, reps: 20, weight: null },
      ]),
    ]);
    const sessions = await fetchExerciseHistory(asPrisma, 'u1', 'bench', 12);
    expect(sessions).toEqual([
      {
        workoutLogId: 'log-2',
        performedAt: new Date('2026-07-20T18:00:00Z'),
        sets: [
          { setNumber: 1, reps: 5, weight: 185 },
          { setNumber: 2, reps: 5, weight: 185 },
        ],
      },
      {
        workoutLogId: 'log-1',
        performedAt: new Date('2026-07-13T18:00:00Z'),
        sets: [{ setNumber: 1, reps: 20, weight: null }],
      },
    ]);
  });

  it('skips the entry query when no session contains the exercise', async () => {
    const sessions = await fetchExerciseHistory(asPrisma, 'u1', 'bench', 12);
    expect(sessions).toEqual([]);
    expect(prisma.workoutLogEntry.findMany).not.toHaveBeenCalled();
    // The session filter carries the completed-set requirement, so a session
    // of started-but-unlogged entries cannot burn one of the `limit` slots.
    expect(logQueryArg().where).toEqual({
      userId: 'u1',
      entries: {
        some: {
          exerciseId: 'bench',
          completedSets: { some: { completed: true } },
        },
      },
    });
  });
});
