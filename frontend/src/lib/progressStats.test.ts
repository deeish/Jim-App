import {
  TREND_WEEKS,
  buildWeeklyTrend,
  formatTotalDuration,
  longestWeekStreak,
  sessionLocalDay,
  sessionLocalWeek,
  summarizeProgress,
  weekStreak,
} from './progressStats';
import { formatLocalYmd, getWeekStartMonday } from './planCalendar';
import type { WorkoutStats, WorkoutStatsSession } from '../types/workout';

/**
 * Dates are built from LOCAL components throughout, so every assertion holds in
 * any timezone the test machine happens to run in — the same approach
 * `planCalendar.test.ts` uses.
 */
const session = (
  startedAt: Date,
  extra: Partial<WorkoutStatsSession> = {},
): WorkoutStatsSession => ({
  id: `log-${startedAt.getTime()}-${Math.random()}`,
  startedAt: startedAt.toISOString(),
  completedAt: null,
  totalTimeSeconds: 2700,
  totalSets: 12,
  totalVolume: 5000,
  workoutName: 'Full Body',
  ...extra,
});

const statsOf = (sessions: WorkoutStatsSession[]): WorkoutStats => ({
  months: 12,
  rangeStart: new Date(2025, 0, 1).toISOString(),
  totals: {
    sessionCount: sessions.length,
    totalSets: 0,
    totalTimeSeconds: 0,
    totalVolumeLb: 0,
    sessionsWithVolume: 0,
  },
  sessions,
});

/** Monday 2026-07-27, midday local. */
const MONDAY = new Date(2026, 6, 27, 12, 0, 0);
const mondayKey = formatLocalYmd(MONDAY);

describe('local day and week bucketing', () => {
  // The trap: an evening session west of UTC lands on the *next* UTC day. It
  // must still be reported on the day the user actually trained.
  it('buckets a late-evening session on its local day, not its UTC day', () => {
    const lateLocal = new Date(2026, 6, 26, 20, 0, 0);
    const s = session(lateLocal);
    expect(sessionLocalDay(s)).toBe('2026-07-26');
    // Proves the ISO round-trip is what is being interpreted, not the Date.
    expect(s.startedAt).toBe(lateLocal.toISOString());
  });

  it('buckets a session just before midnight on that day', () => {
    expect(sessionLocalDay(session(new Date(2026, 6, 26, 23, 59, 0)))).toBe(
      '2026-07-26',
    );
  });

  it('puts Sunday in the week that began the previous Monday', () => {
    // Sunday 2026-08-02 belongs to the week starting Monday 2026-07-27.
    expect(sessionLocalWeek(session(new Date(2026, 7, 2, 9, 0, 0)))).toBe(
      '2026-07-27',
    );
    expect(sessionLocalWeek(session(MONDAY))).toBe('2026-07-27');
  });

  it('returns null for an unparseable instant rather than throwing', () => {
    const bad = session(MONDAY, { startedAt: 'not-a-date' });
    expect(sessionLocalDay(bad)).toBeNull();
    expect(sessionLocalWeek(bad)).toBeNull();
  });
});

describe('summarizeProgress', () => {
  it('counts two sessions in one day as one active day', () => {
    const summary = summarizeProgress(
      statsOf([
        session(new Date(2026, 6, 27, 7, 0, 0)),
        session(new Date(2026, 6, 27, 18, 0, 0)),
      ]),
      MONDAY,
    );
    expect(summary.sessionCount).toBe(2);
    expect(summary.activeDays).toBe(1);
    expect(summary.sessionsThisWeek).toBe(2);
  });

  it('sums sets, time and volume across sessions', () => {
    const summary = summarizeProgress(
      statsOf([
        session(MONDAY, { totalSets: 10, totalTimeSeconds: 1800, totalVolume: 4000 }),
        session(MONDAY, { totalSets: 5, totalTimeSeconds: 900, totalVolume: 1000 }),
      ]),
      MONDAY,
    );
    expect(summary.totalSets).toBe(15);
    expect(summary.totalTimeSeconds).toBe(2700);
    expect(summary.totalVolumeLb).toBe(5000);
    expect(summary.hasWeightedWork).toBe(true);
  });

  it('reports no weighted work for a bodyweight-only user', () => {
    const summary = summarizeProgress(
      statsOf([
        session(MONDAY, { totalVolume: 0 }),
        session(new Date(2026, 6, 28, 9, 0, 0), { totalVolume: null }),
      ]),
      MONDAY,
    );
    expect(summary.hasWeightedWork).toBe(false);
    expect(summary.totalVolumeLb).toBe(0);
    // The session still counts — these are the metrics the screen leads with.
    expect(summary.sessionCount).toBe(2);
    expect(summary.activeDays).toBe(2);
  });

  it('treats null set and time columns as zero', () => {
    const summary = summarizeProgress(
      statsOf([session(MONDAY, { totalSets: null, totalTimeSeconds: null })]),
      MONDAY,
    );
    expect(summary.totalSets).toBe(0);
    expect(summary.totalTimeSeconds).toBe(0);
  });

  it('returns an all-zero summary with a full empty trend for a new user', () => {
    const summary = summarizeProgress(statsOf([]), MONDAY);
    expect(summary.sessionCount).toBe(0);
    expect(summary.weekStreak).toBe(0);
    expect(summary.hasWeightedWork).toBe(false);
    expect(summary.weeklyTrend).toHaveLength(TREND_WEEKS);
    expect(summary.weeklyTrend.every((w) => w.sessionCount === 0)).toBe(true);
  });

  it('handles a null stats payload, e.g. a failed fetch', () => {
    expect(summarizeProgress(null, MONDAY).sessionCount).toBe(0);
  });
});

describe('weekStreak', () => {
  const weeksBack = (n: number) => {
    const d = getWeekStartMonday(MONDAY);
    d.setDate(d.getDate() - n * 7);
    return formatLocalYmd(d);
  };

  it('counts consecutive trained weeks back from now', () => {
    const keys = new Set([weeksBack(0), weeksBack(1), weeksBack(2)]);
    expect(weekStreak(keys, MONDAY)).toBe(3);
  });

  // The current week is still in progress; not having trained yet is not a
  // broken streak.
  it('does not break the streak when this week has no session yet', () => {
    const keys = new Set([weeksBack(1), weeksBack(2)]);
    expect(weekStreak(keys, MONDAY)).toBe(2);
  });

  it('resets once a whole week passes untrained', () => {
    const keys = new Set([weeksBack(2), weeksBack(3)]);
    expect(weekStreak(keys, MONDAY)).toBe(0);
  });

  it('is zero with no history at all', () => {
    expect(weekStreak(new Set(), MONDAY)).toBe(0);
  });

  // A count-bounded window would silently cap a long streak; this is why the
  // stats read is bounded by date instead.
  it('reports a streak longer than the old 30-log window', () => {
    const keys = new Set(
      Array.from({ length: 40 }, (_, i) => weeksBack(i)),
    );
    expect(weekStreak(keys, MONDAY)).toBe(40);
  });

  it('keeps counting after a plan has ended, since it reads logs not plans', () => {
    // No plan involved anywhere in the input — only logged weeks.
    const keys = new Set([weeksBack(0), weeksBack(1)]);
    expect(weekStreak(keys, MONDAY)).toBe(2);
  });

  it('finds the longest run even when it is not the current one', () => {
    const keys = new Set([
      weeksBack(0),
      weeksBack(2),
      weeksBack(3),
      weeksBack(4),
      weeksBack(5),
    ]);
    expect(weekStreak(keys, MONDAY)).toBe(1);
    expect(longestWeekStreak(keys)).toBe(4);
  });

  it('has no longest run without data', () => {
    expect(longestWeekStreak(new Set())).toBe(0);
  });
});

describe('buildWeeklyTrend', () => {
  it('returns the window oldest first, ending with the current week', () => {
    const trend = buildWeeklyTrend([session(MONDAY)], MONDAY);
    expect(trend).toHaveLength(TREND_WEEKS);
    expect(trend[trend.length - 1].weekStartYmd).toBe(mondayKey);
    expect(trend[trend.length - 1].sessionCount).toBe(1);
  });

  // Dropping untrained weeks would draw an unbroken habit that never happened.
  it('includes untrained weeks as zeroes rather than omitting them', () => {
    const threeWeeksAgo = new Date(2026, 6, 6, 12, 0, 0);
    const trend = buildWeeklyTrend([session(MONDAY), session(threeWeeksAgo)], MONDAY, 4);
    expect(trend.map((w) => w.sessionCount)).toEqual([1, 0, 0, 1]);
  });

  it('aggregates sets and volume per week', () => {
    const trend = buildWeeklyTrend(
      [
        session(MONDAY, { totalSets: 10, totalVolume: 1000 }),
        session(new Date(2026, 6, 29, 12, 0, 0), { totalSets: 5, totalVolume: 500 }),
      ],
      MONDAY,
      2,
    );
    const current = trend[trend.length - 1];
    expect(current.sessionCount).toBe(2);
    expect(current.totalSets).toBe(15);
    expect(current.volumeLb).toBe(1500);
  });

  it('leaves sessions older than the window out of the trend', () => {
    const longAgo = new Date(2025, 0, 6, 12, 0, 0);
    const trend = buildWeeklyTrend([session(longAgo)], MONDAY, 4);
    expect(trend.every((w) => w.sessionCount === 0)).toBe(true);
  });
});

describe('formatTotalDuration', () => {
  it('shows minutes under an hour', () => {
    expect(formatTotalDuration(45 * 60)).toBe('45m');
    expect(formatTotalDuration(0)).toBe('0m');
  });

  it('shows hours and minutes', () => {
    expect(formatTotalDuration(12 * 3600 + 30 * 60)).toBe('12h 30m');
  });

  it('drops a zero minute part', () => {
    expect(formatTotalDuration(3 * 3600)).toBe('3h');
  });

  it('rolls a rounded-up 60 minutes into the hour', () => {
    expect(formatTotalDuration(3 * 3600 + 3599)).toBe('4h');
  });

  it('never renders a negative duration', () => {
    expect(formatTotalDuration(-10)).toBe('0m');
  });
});
