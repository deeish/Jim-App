import { PrismaService } from '../prisma/prisma.service';

/**
 * Shared progress/stats helpers over workout logs.
 *
 * Same shape as `last-performance.ts`: plain functions, no Nest provider, so
 * callers don't need a module dependency to reuse them.
 *
 * Two deliberate constraints, both load-bearing (see
 * `docs/plans/2026-07-27-progress-and-history.md` §3.3 and §3.7):
 *
 * 1. **This module never buckets by calendar day.** It returns raw `startedAt`
 *    instants and lets the client group them in the device's local timezone,
 *    which is what the History calendar already does. Bucketing server-side
 *    would use UTC days and disagree with the calendar the user is looking at.
 * 2. **Personal bests do not reuse the last-performance window.** That helper
 *    scans `RECENT_LOGS_WINDOW` (30) logs — roughly seven weeks at four
 *    sessions a week. A "best" reduced over it is a recent best, not a personal
 *    best, and would celebrate a PR the user beat months ago.
 */

/** Default history depth for the stats read, in months. */
export const STATS_DEFAULT_MONTHS = 12;

/** Upper bound a client may request, so the range stays a bound. */
export const STATS_MAX_MONTHS = 60;

/** Narrow projection for a logged session — no entries, no sets. */
export interface SessionSummary {
  id: string;
  /** Raw instant; the client buckets this into its own local day. */
  startedAt: Date;
  completedAt: Date | null;
  totalTimeSeconds: number | null;
  totalSets: number | null;
  /** Canonical pounds. Null/0 whenever the session logged no weighted sets. */
  totalVolume: number | null;
  workoutName: string | null;
}

export interface StatsTotals {
  sessionCount: number;
  totalSets: number;
  totalTimeSeconds: number;
  totalVolumeLb: number;
  /**
   * Sessions that recorded any weighted volume. Lets the client hide
   * volume UI entirely rather than render a wall of zeroes for a
   * bodyweight-only user, or one who never types a weight in.
   */
  sessionsWithVolume: number;
}

export interface PersonalBest {
  /** Canonical pounds; always > 0 (unweighted sets never set a best). */
  weightLb: number;
  /** Reps performed at that weight. */
  reps: number;
  performedAt: Date;
}

/** Minimal entry shape the personal-best reducer needs. */
export interface EntryWithSets {
  exerciseId: string;
  workoutLog: { startedAt: Date };
  completedSets: Array<{ weight: number | null; reps: number }>;
}

/**
 * Clamps a requested month depth into the supported range.
 *
 * Over HTTP an out-of-range value never reaches here — `StatsQueryDto` bounds
 * `months` and the global pipe rejects it with a 400, which is the clearer
 * contract for a client bug. This clamp is defence in depth for direct callers.
 */
export function resolveStatsMonths(months: number | undefined): number {
  if (months == null || !Number.isFinite(months)) return STATS_DEFAULT_MONTHS;
  const whole = Math.floor(months);
  if (whole < 1) return 1;
  if (whole > STATS_MAX_MONTHS) return STATS_MAX_MONTHS;
  return whole;
}

/**
 * Start of the rolling window. Deliberately a *date range*, not a log-count
 * cap: a count bound silently truncates any streak longer than the window and
 * would cap the headline number without saying so.
 *
 * When the source day doesn't exist in the target month, the start clamps to
 * that month's last day: Mar 31 − 1 lands on Feb 28/29, Jul 31 − 1 on Jun 30,
 * Feb 29 − 12 on Feb 28. Bare `setMonth` instead overflows into the *next*
 * month — from Mar 31 it calls "one month back" Mar 3, silently dropping
 * Feb 28 – Mar 2 from the window.
 */
export function resolveStatsRangeStart(months: number, now: Date): Date {
  const start = new Date(now.getTime());
  const dayOfMonth = start.getDate();
  // Walk months from the 1st so the arithmetic can't overflow, then restore
  // the day clamped to what the target month actually has.
  start.setDate(1);
  start.setMonth(start.getMonth() - resolveStatsMonths(months));
  const lastDayOfTarget = new Date(
    start.getFullYear(),
    start.getMonth() + 1,
    0,
  ).getDate();
  start.setDate(Math.min(dayOfMonth, lastDayOfTarget));
  return start;
}

/** Totals across the returned sessions. Null numeric columns count as zero. */
export function summarizeSessions(sessions: SessionSummary[]): StatsTotals {
  return sessions.reduce<StatsTotals>(
    (acc, s) => {
      acc.sessionCount += 1;
      acc.totalSets += s.totalSets ?? 0;
      acc.totalTimeSeconds += s.totalTimeSeconds ?? 0;
      const volume = s.totalVolume ?? 0;
      acc.totalVolumeLb += volume;
      if (volume > 0) acc.sessionsWithVolume += 1;
      return acc;
    },
    {
      sessionCount: 0,
      totalSets: 0,
      totalTimeSeconds: 0,
      totalVolumeLb: 0,
      sessionsWithVolume: 0,
    },
  );
}

/**
 * Heaviest set ever recorded per exercise.
 *
 * Only weighted sets qualify — an unweighted set has no meaningful load PR, so
 * a bodyweight-only exercise is omitted from the result entirely rather than
 * reported as a 0 lb best. Ties on weight prefer more reps, then the earlier
 * date, so the returned weight/reps/date always describe one real set.
 */
export function bestWeightedSetPerExercise(
  entries: EntryWithSets[],
): Map<string, PersonalBest> {
  const result = new Map<string, PersonalBest>();
  for (const entry of entries) {
    const performedAt = entry.workoutLog.startedAt;
    for (const set of entry.completedSets) {
      const weight = set.weight ?? 0;
      if (weight <= 0) continue;
      const current = result.get(entry.exerciseId);
      if (
        !current ||
        isBetterBest({ weight, reps: set.reps, performedAt }, current)
      ) {
        result.set(entry.exerciseId, {
          weightLb: weight,
          reps: set.reps,
          performedAt,
        });
      }
    }
  }
  return result;
}

function isBetterBest(
  candidate: { weight: number; reps: number; performedAt: Date },
  current: PersonalBest,
): boolean {
  if (candidate.weight !== current.weightLb) {
    return candidate.weight > current.weightLb;
  }
  if (candidate.reps !== current.reps) return candidate.reps > current.reps;
  return candidate.performedAt.getTime() < current.performedAt.getTime();
}

/**
 * Sessions in the window, newest first.
 *
 * Narrow `select` on purpose: `findAll` eagerly includes
 * `entries -> completedSets`, which is fine for a week or a month but would
 * pull every set of every workout across a year of history.
 */
export async function fetchSessionSummaries(
  prisma: PrismaService,
  userId: string,
  rangeStart: Date,
): Promise<SessionSummary[]> {
  const rows = await prisma.workoutLog.findMany({
    where: { userId, startedAt: { gte: rangeStart } },
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      startedAt: true,
      completedAt: true,
      totalTimeSeconds: true,
      totalSets: true,
      totalVolume: true,
      workout: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    totalTimeSeconds: r.totalTimeSeconds,
    totalSets: r.totalSets,
    totalVolume: r.totalVolume,
    workoutName: r.workout?.name ?? null,
  }));
}

/** How many sessions of one exercise the history read returns by default. */
export const EXERCISE_HISTORY_DEFAULT_SESSIONS = 12;

/** Upper bound a client may request, so the read stays bounded. */
export const EXERCISE_HISTORY_MAX_SESSIONS = 50;

export interface ExerciseHistorySet {
  setNumber: number;
  reps: number;
  /** Canonical pounds; null for bodyweight sets. */
  weight: number | null;
}

export interface ExerciseHistorySession {
  workoutLogId: string;
  performedAt: Date;
  /** Completed sets only, ordered by setNumber. Never empty. */
  sets: ExerciseHistorySet[];
}

/** Clamps a requested session count into the supported range. */
export function resolveHistorySessions(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit)) {
    return EXERCISE_HISTORY_DEFAULT_SESSIONS;
  }
  const whole = Math.floor(limit);
  if (whole < 1) return 1;
  if (whole > EXERCISE_HISTORY_MAX_SESSIONS)
    return EXERCISE_HISTORY_MAX_SESSIONS;
  return whole;
}

/**
 * The user's most recent sessions for one exercise, newest first.
 *
 * Bounded by **session count for this exercise**, not by a window of recent
 * logs: someone who trains this lift once a month would fall straight out of a
 * 30-log window and see an empty history despite years of it.
 *
 * Two queries on purpose. The log writes one entry per exercise *slot*, so a
 * lift performed twice in one workout — an opener plus a back-off block —
 * yields two rows sharing a `workoutLogId`. A `take` on entry rows would hand
 * that user half the sessions they asked for, and a cut landing mid-pair would
 * return a session missing rows, understating its top set and volume. Instead
 * the first query picks the `limit` most recent logs containing the exercise;
 * the second fetches every matching row of those logs. Callers that present
 * sessions should still merge rows on `workoutLogId`.
 *
 * Entries with no completed sets are excluded **in the queries**, not
 * afterwards. An exercise the user started but logged no set for is still
 * written as an entry — only skipped ones are left out — so it must neither
 * burn one of the `limit` session slots (log query) nor ride in beside a real
 * slot as an empty `sets` row (entry query).
 */
export async function fetchExerciseHistory(
  prisma: PrismaService,
  userId: string,
  exerciseId: string,
  limit: number,
): Promise<ExerciseHistorySession[]> {
  const logs = await prisma.workoutLog.findMany({
    where: {
      userId,
      entries: {
        some: { exerciseId, completedSets: { some: { completed: true } } },
      },
    },
    orderBy: { startedAt: 'desc' },
    take: limit,
    select: { id: true },
  });
  if (logs.length === 0) return [];

  const entries = await prisma.workoutLogEntry.findMany({
    where: {
      exerciseId,
      workoutLogId: { in: logs.map((log) => log.id) },
      // Redundant with the id list, which is already user-scoped; kept so a
      // bug in the log query above can never leak another user's rows.
      workoutLog: { userId },
      completedSets: { some: { completed: true } },
    },
    orderBy: { workoutLog: { startedAt: 'desc' } },
    select: {
      workoutLogId: true,
      workoutLog: { select: { startedAt: true } },
      completedSets: {
        where: { completed: true },
        orderBy: { setNumber: 'asc' },
        select: { setNumber: true, reps: true, weight: true },
      },
    },
  });

  return entries.map((entry) => ({
    workoutLogId: entry.workoutLogId,
    performedAt: entry.workoutLog.startedAt,
    sets: entry.completedSets.map((s) => ({
      setNumber: s.setNumber,
      reps: s.reps,
      weight: s.weight,
    })),
  }));
}

/**
 * Every weighted set the user has logged for these exercises — unbounded by
 * log count on purpose (see the module note). Rows are three small columns
 * each; only the reduced maxima leave this process.
 */
export async function fetchPersonalBests(
  prisma: PrismaService,
  userId: string,
  exerciseIds: string[],
): Promise<Map<string, PersonalBest>> {
  if (exerciseIds.length === 0) return new Map();
  const entries = await prisma.workoutLogEntry.findMany({
    where: { exerciseId: { in: exerciseIds }, workoutLog: { userId } },
    select: {
      exerciseId: true,
      workoutLog: { select: { startedAt: true } },
      completedSets: {
        where: { completed: true },
        select: { weight: true, reps: true },
      },
    },
  });
  return bestWeightedSetPerExercise(entries);
}
