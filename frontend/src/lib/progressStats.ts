import type { WorkoutStats, WorkoutStatsSession } from '../types/workout';
import { formatLocalYmd, getWeekStartMonday, parseLocalYmd } from './planCalendar';

/**
 * Turns the raw session list from `GET /workout-logs/stats` into the numbers
 * the Progress screen shows.
 *
 * **Everything here buckets by the device's local day and week, never UTC.**
 * The server deliberately returns raw instants and does no bucketing: it has no
 * idea what timezone the phone is in, and a streak computed from UTC days would
 * quietly disagree with the History calendar the user is looking at. This
 * codebase has already been bitten by that once — see the scar-tissue comment
 * in `body-weight.service.ts`. `CalendarScreen` groups logs the same way, via
 * the same `formatLocalYmd`, so the two can't drift.
 *
 * Totals are re-derived from the session list rather than read from the
 * server's `totals` block, so a total can never disagree with the day and week
 * buckets computed beside it.
 */

/** Weeks of history the trend renders. Enough to show a habit, still readable. */
export const TREND_WEEKS = 12;

export interface ProgressWeek {
  /** Local Monday, `YYYY-MM-DD`. */
  weekStartYmd: string;
  sessionCount: number;
  totalSets: number;
  volumeLb: number;
}

export interface ProgressSummary {
  sessionCount: number;
  totalSets: number;
  totalTimeSeconds: number;
  totalVolumeLb: number;
  /**
   * Whether any session recorded weighted work. Every volume claim is gated on
   * this: bodyweight-only users and generated plans that ship no weight both
   * total zero, and "0 lb" reads as a broken screen rather than an honest one.
   */
  hasWeightedWork: boolean;
  /** Consecutive local weeks with at least one session. */
  weekStreak: number;
  /** Longest such run anywhere in the window. */
  bestWeekStreak: number;
  sessionsThisWeek: number;
  /** Oldest to newest, with untrained weeks included as zeroes. */
  weeklyTrend: ProgressWeek[];
}

const EMPTY_SUMMARY: Omit<ProgressSummary, 'weeklyTrend'> = {
  sessionCount: 0,
  totalSets: 0,
  totalTimeSeconds: 0,
  totalVolumeLb: 0,
  hasWeightedWork: false,
  weekStreak: 0,
  bestWeekStreak: 0,
  sessionsThisWeek: 0,
};

/**
 * Local day a session belongs to.
 *
 * Identical to how `CalendarScreen` keys its logs (`formatLocalYmd` over the
 * same `startedAt` field), which is what guarantees Progress and History can
 * never disagree about which day a session happened on.
 */
export function sessionLocalDay(session: WorkoutStatsSession): string | null {
  const started = new Date(session.startedAt);
  if (Number.isNaN(started.getTime())) return null;
  return formatLocalYmd(started);
}

/** Local Monday of the week a session belongs to. */
export function sessionLocalWeek(session: WorkoutStatsSession): string | null {
  const started = new Date(session.startedAt);
  if (Number.isNaN(started.getTime())) return null;
  return formatLocalYmd(getWeekStartMonday(started));
}

/** Re-normalises to local midnight, so the walk survives DST boundaries. */
function shiftWeeks(monday: Date, deltaWeeks: number): Date {
  const copy = new Date(monday);
  copy.setDate(copy.getDate() + deltaWeeks * 7);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Consecutive weeks trained, counting back from now.
 *
 * A week rather than a day streak on purpose: the app writes plans with
 * deliberate rest days, so a consecutive-*day* streak breaks every week by
 * design and reads as failure to someone who trained exactly as prescribed.
 *
 * The current week not having a session yet does **not** break the streak — it
 * is still in progress and the user may simply not have trained yet. Only once
 * a whole week passes untrained does the streak reset.
 */
export function weekStreak(weekKeys: Set<string>, now: Date): number {
  let cursor = getWeekStartMonday(now);
  if (!weekKeys.has(formatLocalYmd(cursor))) {
    cursor = shiftWeeks(cursor, -1);
    if (!weekKeys.has(formatLocalYmd(cursor))) return 0;
  }
  let streak = 0;
  while (weekKeys.has(formatLocalYmd(cursor))) {
    streak += 1;
    cursor = shiftWeeks(cursor, -1);
  }
  return streak;
}

/**
 * Longest run of consecutive trained weeks in the data. Walks week by week
 * rather than differencing timestamps, since a DST week is not 7×24h.
 */
export function longestWeekStreak(weekKeys: Set<string>): number {
  if (weekKeys.size === 0) return 0;
  // `YYYY-MM-DD` sorts lexicographically in chronological order.
  const sorted = [...weekKeys].sort();
  const last = parseLocalYmd(sorted[sorted.length - 1]).getTime();
  let cursor = parseLocalYmd(sorted[0]);
  let best = 0;
  let run = 0;
  while (cursor.getTime() <= last) {
    if (weekKeys.has(formatLocalYmd(cursor))) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
    cursor = shiftWeeks(cursor, 1);
  }
  return best;
}

/**
 * The last `weeks` weeks ending with the current one, oldest first.
 *
 * Untrained weeks are emitted as zeroes rather than omitted: a trend that
 * silently drops the weeks someone missed would draw an unbroken habit that
 * never happened.
 */
export function buildWeeklyTrend(
  sessions: WorkoutStatsSession[],
  now: Date,
  weeks: number = TREND_WEEKS,
): ProgressWeek[] {
  const byWeek = new Map<string, ProgressWeek>();
  for (const session of sessions) {
    const key = sessionLocalWeek(session);
    if (!key) continue;
    const bucket = byWeek.get(key) ?? {
      weekStartYmd: key,
      sessionCount: 0,
      totalSets: 0,
      volumeLb: 0,
    };
    bucket.sessionCount += 1;
    bucket.totalSets += session.totalSets ?? 0;
    bucket.volumeLb += session.totalVolume ?? 0;
    byWeek.set(key, bucket);
  }

  const trend: ProgressWeek[] = [];
  let cursor = shiftWeeks(getWeekStartMonday(now), -(weeks - 1));
  for (let i = 0; i < weeks; i += 1) {
    const key = formatLocalYmd(cursor);
    trend.push(
      byWeek.get(key) ?? {
        weekStartYmd: key,
        sessionCount: 0,
        totalSets: 0,
        volumeLb: 0,
      },
    );
    cursor = shiftWeeks(cursor, 1);
  }
  return trend;
}

/** Everything the Progress screen renders, from one pass over the sessions. */
export function summarizeProgress(
  stats: WorkoutStats | null | undefined,
  now: Date,
): ProgressSummary {
  const sessions = stats?.sessions ?? [];
  if (sessions.length === 0) {
    return { ...EMPTY_SUMMARY, weeklyTrend: buildWeeklyTrend([], now) };
  }

  const weeks = new Set<string>();
  let totalSets = 0;
  let totalTimeSeconds = 0;
  let totalVolumeLb = 0;
  let hasWeightedWork = false;

  for (const session of sessions) {
    const week = sessionLocalWeek(session);
    if (week) weeks.add(week);
    totalSets += session.totalSets ?? 0;
    totalTimeSeconds += session.totalTimeSeconds ?? 0;
    const volume = session.totalVolume ?? 0;
    totalVolumeLb += volume;
    if (volume > 0) hasWeightedWork = true;
  }

  const thisWeek = formatLocalYmd(getWeekStartMonday(now));
  return {
    sessionCount: sessions.length,
    totalSets,
    totalTimeSeconds,
    totalVolumeLb,
    hasWeightedWork,
    weekStreak: weekStreak(weeks, now),
    bestWeekStreak: longestWeekStreak(weeks),
    sessionsThisWeek: sessions.filter((s) => sessionLocalWeek(s) === thisWeek)
      .length,
    weeklyTrend: buildWeeklyTrend(sessions, now),
  };
}

/** Total training time, e.g. `12h 30m` or `45m`. Zero renders as `0m`. */
export function formatTotalDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  let hours = Math.floor(safe / 3600);
  let minutes = Math.round((safe % 3600) / 60);
  // Rounding can push minutes to 60; carry it into the hour before choosing a
  // shape, or 3599s renders as "60m" instead of "1h".
  if (minutes === 60) {
    hours += 1;
    minutes = 0;
  }
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

// Hand-rolled instead of `toLocaleDateString`: Hermes on some Android builds
// ships without full Intl, where the format options are silently ignored and a
// full date string lands in an 11pt axis label. Same rationale as the grouping
// note in `weightDisplay.ts`.
const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** Week label for the trend axis, e.g. `Jul 27`. */
export function formatWeekLabel(weekStartYmd: string): string {
  const date = parseLocalYmd(weekStartYmd);
  if (Number.isNaN(date.getTime())) return '';
  return `${SHORT_MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
}
