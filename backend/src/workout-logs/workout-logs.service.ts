import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkoutsService } from '../workouts/workouts.service';
import { CreateWorkoutLogDto } from './dto/create-workout-log.dto';
import {
  fetchLastEntriesForExercises,
  isTrackableExerciseId,
} from './last-performance';
import {
  fetchExerciseHistory,
  fetchPersonalBests,
  fetchPersonalBestsDetailed,
  fetchSessionSummaries,
  resolveHistorySessions,
  resolveStatsMonths,
  resolveStatsRangeStart,
  summarizeSessions,
} from './progress-stats';

/** Bound on ids per exercise-keyed lookup (a workout has far fewer). */
const MAX_LAST_PERFORMANCE_IDS = 50;

/**
 * Hard ceiling on one `findAll` response. Six sessions a week for a year is
 * about 312, so a real month, quarter or year view never reaches this; it
 * exists so a hand-crafted decade-wide window cannot pull the whole table.
 */
export const WORKOUT_LOG_PAGE_MAX = 750;

@Injectable()
export class WorkoutLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workoutsService: WorkoutsService,
  ) {}

  async create(dto: CreateWorkoutLogDto, userId: string) {
    // Throws NotFoundException if the workout doesn't exist or the user can't access it
    // (direct ownership, or via the plan the workout belongs to).
    await this.workoutsService.findOne(dto.workoutId, userId);

    const startedAt = new Date(dto.startedAt);
    const completedAt = dto.completedAt
      ? new Date(dto.completedAt)
      : new Date();

    const log = await this.prisma.workoutLog.create({
      data: {
        userId,
        workoutId: dto.workoutId,
        startedAt,
        completedAt,
        totalTimeSeconds: dto.totalTimeSeconds ?? undefined,
        totalSets: dto.totalSets ?? undefined,
        totalVolume: dto.totalVolume ?? undefined,
        overallNotes: dto.overallNotes ?? undefined,
        entries: {
          create: dto.entries.map((entry) => ({
            exerciseId: entry.exerciseId ?? 'manual',
            name: entry.name,
            orderIndex: entry.orderIndex,
            notes: entry.notes ?? undefined,
            completedSets: {
              create: entry.sets
                .filter((s) => s.completed)
                .map((s) => ({
                  setNumber: s.setNumber,
                  reps: s.reps,
                  weight: s.weight ?? undefined,
                  rpe: s.rpe ?? undefined,
                  completed: true,
                  notes: s.notes ?? undefined,
                })),
            },
          })),
        },
      },
      include: {
        entries: {
          include: { completedSets: true },
        },
        workout: true,
      },
    });
    return log;
  }

  /**
   * Logged sessions, newest first, WITH every entry and completed set inline.
   *
   * ⚠ That include is why this has to be bounded. One row here drags the whole
   * session's sets along, so an unbounded call returns a user's entire training
   * history set by set — fine at seven logs, a multi-megabyte response and a
   * slow query after a year of training. Every caller happens to pass a window
   * today (two months, one 120 days), but the endpoint took none: a plain
   * `GET /api/workout-logs` asked for everything, which is a latent outage
   * sitting behind a route anyone with a token can reach.
   *
   * So an uncapped request now defaults to a year and is capped besides — the
   * same shape `BodyWeightService.findAll` already uses for the same reason.
   * A caller that genuinely wants more must ask for it by window.
   */
  async findAll(userId: string, params?: { from?: string; to?: string }) {
    const where: { userId: string; startedAt?: { gte?: Date; lte?: Date } } = {
      userId,
    };
    if (params?.from || params?.to) {
      where.startedAt = {};
      if (params.from) where.startedAt.gte = new Date(params.from);
      if (params.to) {
        const to = new Date(params.to);
        to.setHours(23, 59, 59, 999);
        where.startedAt.lte = to;
      }
    } else {
      const defaultFrom = new Date();
      defaultFrom.setFullYear(defaultFrom.getFullYear() - 1);
      where.startedAt = { gte: defaultFrom };
    }
    const logs = await this.prisma.workoutLog.findMany({
      where,
      include: {
        workout: true,
        entries: { include: { completedSets: true } },
      },
      orderBy: { startedAt: 'desc' },
      // A backstop for a window someone asks for that is itself enormous.
      // Six a week for a year is ~312, so this cannot truncate a real month
      // or quarter view — it only refuses to serve a decade in one response.
      take: WORKOUT_LOG_PAGE_MAX,
    });
    return logs;
  }

  /**
   * Most recent logged entry (completed sets, lb) per requested library
   * exercise id. Ids with no history are omitted from the result.
   */
  async getLastPerformanceForExercises(userId: string, exerciseIds: string[]) {
    const ids = Array.from(
      new Set(exerciseIds.filter(isTrackableExerciseId)),
    ).slice(0, MAX_LAST_PERFORMANCE_IDS);
    const performances = await fetchLastEntriesForExercises(
      this.prisma,
      userId,
      ids,
    );
    return { results: Object.fromEntries(performances) };
  }

  /**
   * Session-level history for the progress screens.
   *
   * Returns raw `startedAt` instants and lets the client bucket them into its
   * own local days/weeks — the History calendar already groups this way, and
   * bucketing here would use UTC days and disagree with it.
   */
  async getStats(userId: string, months?: number) {
    const resolvedMonths = resolveStatsMonths(months);
    const rangeStart = resolveStatsRangeStart(resolvedMonths, new Date());
    const sessions = await fetchSessionSummaries(
      this.prisma,
      userId,
      rangeStart,
    );
    return {
      months: resolvedMonths,
      rangeStart: rangeStart.toISOString(),
      totals: summarizeSessions(sessions),
      sessions,
    };
  }

  /**
   * One exercise's recent sessions, plus its all-time best.
   *
   * The best comes from the unbounded aggregate rather than from the returned
   * sessions: reducing it over a bounded list would report a recent best as a
   * lifetime record, which is the same mistake the personal-bests read exists
   * to avoid. An untrackable id (placeholder or the `'manual'` fallback) yields
   * an empty history rather than an error, so callers can ask unconditionally.
   */
  async getExerciseHistory(userId: string, exerciseId: string, limit?: number) {
    const id = exerciseId.trim();
    if (!isTrackableExerciseId(id)) {
      return { exerciseId: id, best: null, sessions: [] };
    }
    const sessions = await fetchExerciseHistory(
      this.prisma,
      userId,
      id,
      resolveHistorySessions(limit),
    );
    const bests = await fetchPersonalBests(this.prisma, userId, [id]);
    return { exerciseId: id, best: bests.get(id) ?? null, sessions };
  }

  /**
   * Heaviest set ever per requested exercise, over all history. Ids with no
   * weighted history are omitted (an unweighted set sets no load PR).
   */
  async getPersonalBests(userId: string, exerciseIds: string[]) {
    const ids = Array.from(
      new Set(exerciseIds.filter(isTrackableExerciseId)),
    ).slice(0, MAX_LAST_PERFORMANCE_IDS);
    const { byWeight, byE1rm } = await fetchPersonalBestsDetailed(
      this.prisma,
      userId,
      ids,
    );
    // ⚠ `results` keeps its exact meaning — the heaviest bar ever moved — so
    // every shipped build carries on reading it unchanged. `e1rm` is additive:
    // the strongest set ever performed, which is a different record and the
    // one that makes 185x5 -> 175x12 visible as the progress it is.
    return {
      results: Object.fromEntries(byWeight),
      e1rm: Object.fromEntries(byE1rm),
    };
  }

  async findOne(id: string, userId: string) {
    const log = await this.prisma.workoutLog.findFirst({
      where: { id, userId },
      include: {
        workout: true,
        entries: { include: { completedSets: true } },
      },
    });
    if (!log) {
      throw new NotFoundException(`Workout log with ID ${id} not found`);
    }
    return log;
  }
}
