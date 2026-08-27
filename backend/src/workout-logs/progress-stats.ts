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

/**
 * The best set an exercise has ever produced *by estimated one-rep max*.
 *
 * Deliberately SEPARATE from `PersonalBest` rather than replacing it. They
 * answer different questions and both are true: `PersonalBest` is the heaviest
 * bar you have ever moved, this is the strongest set you have ever performed.
 * Folding them together would silently change what the Profile's "best lifts"
 * has always meant.
 *
 * It exists because weight alone hides real progress. 185x5 then 175x12 is a
 * clear jump — 216 lb estimated to 245 — and a weight-ranked best calls the
 * second set nothing at all, because 175 < 185.
 */
export interface PersonalBestE1rm {
  /** Canonical pounds actually lifted on the set. */
  weightLb: number;
  reps: number;
  /** The estimate that won; always > 0. */
  e1rmLb: number;
  performedAt: Date;
}

/**
 * Above this a rep-max estimate stops meaning anything.
 * Mirrors `E1RM_MAX_REPS` in the frontend's `lib/exerciseHistory.ts` and in
 * `crews/crew-summary.util.ts` — three copies of one rule, and they must not
 * drift, or the same set is a record in one place and not in another.
 */
export const E1RM_MAX_REPS = 12;

/**
 * Epley, with the same two limits every other copy applies: suppressed past
 * the rep cap, and a single rep reported as the weight itself (Epley claims
 * `w x 1.033` at one rep, i.e. more than was lifted).
 *
 * ⚠ The rep cap is also what keeps TIMED work out. A weighted carry logs its
 * seconds in the reps field, so a 45-second loaded carry arrives here as 45
 * reps and is suppressed rather than projected into a fictional max.
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

/**
 * Best set per exercise ranked by ESTIMATED ONE-REP MAX.
 *
 * Same shape and same exclusions as `bestWeightedSetPerExercise` — unweighted
 * sets never qualify — but ties are settled by the heavier bar and then the
 * earlier date, so the returned set is always one real set, and the older
 * performance keeps the record rather than a later equal one stealing it.
 */
export function bestE1rmSetPerExercise(
  entries: EntryWithSets[],
): Map<string, PersonalBestE1rm> {
  const result = new Map<string, PersonalBestE1rm>();
  for (const entry of entries) {
    const performedAt = entry.workoutLog.startedAt;
    for (const set of entry.completedSets) {
      const e1rmLb = estimateOneRepMax(set.weight, set.reps);
      if (e1rmLb === null) continue;
      const candidate: PersonalBestE1rm = {
        weightLb: set.weight as number,
        reps: set.reps,
        e1rmLb,
        performedAt,
      };
      const current = result.get(entry.exerciseId);
      if (!current || isBetterE1rm(candidate, current)) {
        result.set(entry.exerciseId, candidate);
      }
    }
  }
  return result;
}

function isBetterE1rm(
  candidate: PersonalBestE1rm,
  current: PersonalBestE1rm,
): boolean {
  if (candidate.e1rmLb !== current.e1rmLb) {
    return candidate.e1rmLb > current.e1rmLb;
  }
  if (candidate.weightLb !== current.weightLb) {
    return candidate.weightLb > current.weightLb;
  }
  return candidate.performedAt.getTime() < current.performedAt.getTime();
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
async function fetchBestCandidateEntries(
  prisma: PrismaService,
  userId: string,
  exerciseIds: string[],
): Promise<EntryWithSets[]> {
  return prisma.workoutLogEntry.findMany({
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
}

export async function fetchPersonalBests(
  prisma: PrismaService,
  userId: string,
  exerciseIds: string[],
): Promise<Map<string, PersonalBest>> {
  if (exerciseIds.length === 0) return new Map();
  return bestWeightedSetPerExercise(
    await fetchBestCandidateEntries(prisma, userId, exerciseIds),
  );
}

/**
 * Both records from ONE read.
 *
 * The heaviest-bar best and the strongest-set best are reduced from exactly
 * the same rows, so asking the database twice would be pure waste — and the
 * two must be derived from the same snapshot anyway, or a set logged between
 * two queries could appear in one record and not the other.
 */
export async function fetchPersonalBestsDetailed(
  prisma: PrismaService,
  userId: string,
  exerciseIds: string[],
): Promise<{
  byWeight: Map<string, PersonalBest>;
  byE1rm: Map<string, PersonalBestE1rm>;
}> {
  if (exerciseIds.length === 0) {
    return { byWeight: new Map(), byE1rm: new Map() };
  }
  const entries = await fetchBestCandidateEntries(prisma, userId, exerciseIds);
  return {
    byWeight: bestWeightedSetPerExercise(entries),
    byE1rm: bestE1rmSetPerExercise(entries),
  };
}
