import { adjustNextWeekFromCheckIn, type CheckIn } from './checkin-adjustment';
import { CheckInDto } from './dto/check-in.dto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
  private readonly logger = new Logger(WorkoutLogsService.name);

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
        ...(dto.checkIn
          ? {
              effort: dto.checkIn.effort,
              soreness: dto.checkIn.soreness,
              jointPain: dto.checkIn.jointPain,
            }
          : {}),
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
    if (!dto.checkIn) return log;
    const adjustment = await this.applyCheckIn(log.id, dto.checkIn);
    return { ...log, adjustment };
  }

  /**
   * Post-session check-in (Tier 4a): stores the three answers and, once,
   * moves the same day next week by one step (checkin-adjustment.ts).
   */
  async checkIn(id: string, dto: CheckInDto, userId: string) {
    const existing = await this.prisma.workoutLog.findFirst({
      where: { id, userId },
      select: { id: true, checkInAppliedAt: true },
    });
    if (!existing) {
      throw new NotFoundException(`Workout log with ID ${id} not found`);
    }
    await this.prisma.workoutLog.update({
      where: { id },
      data: {
        effort: dto.effort,
        soreness: dto.soreness,
        jointPain: dto.jointPain,
      },
    });
    const adjustment = existing.checkInAppliedAt
      ? { applied: false, summary: null, reason: 'already_applied' as const }
      : await this.applyCheckIn(id, dto);
    return { id, adjustment };
  }

  private async applyCheckIn(
    logId: string,
    checkIn: CheckIn,
  ): Promise<{
    applied: boolean;
    summary: string | null;
    reason?:
      | 'no_plan_day'
      | 'no_next_week'
      | 'nothing_to_move'
      | 'already_applied';
  }> {
    const log = await this.prisma.workoutLog.findUnique({
      where: { id: logId },
      select: { workout: { select: { planWorkoutId: true } } },
    });
    const planWorkoutId = log?.workout?.planWorkoutId;
    if (!planWorkoutId)
      return { applied: false, summary: null, reason: 'no_plan_day' };
    const day = await this.prisma.planWorkout.findUnique({
      where: { id: planWorkoutId },
      select: {
        workoutPlanId: true,
        weekNumber: true,
        dayOfWeek: true,
        orderInDay: true,
      },
    });
    if (!day) return { applied: false, summary: null, reason: 'no_plan_day' };
    const next = await this.prisma.planWorkout.findFirst({
      where: {
        workoutPlanId: day.workoutPlanId,
        weekNumber: day.weekNumber + 1,
        dayOfWeek: day.dayOfWeek,
        orderInDay: day.orderInDay,
      },
      include: { exercises: true },
    });
    if (!next) return { applied: false, summary: null, reason: 'no_next_week' };
    const adjustment = adjustNextWeekFromCheckIn(
      next.exercises.map((e) => ({
        id: e.id,
        name: e.name ?? 'Exercise',
        sets: e.sets,
        orderIndex: e.orderIndex,
        prescriptionType: e.prescriptionType,
        targetRir: e.targetRir,
        notes: e.notes,
      })),
      checkIn,
      day.dayOfWeek,
    );
    if (!adjustment.direction) {
      return { applied: false, summary: null, reason: 'nothing_to_move' };
    }
    await this.prisma.$transaction([
      ...adjustment.updates.map((u) =>
        this.prisma.planExercise.update({
          where: { id: u.id },
          data: {
            ...(u.sets != null ? { sets: u.sets } : {}),
            ...(u.targetRir != null ? { targetRir: u.targetRir } : {}),
            ...(u.notes != null ? { notes: u.notes } : {}),
          },
        }),
      ),
      this.prisma.workoutLog.update({
        where: { id: logId },
        data: { checkInAppliedAt: new Date() },
      }),
    ]);
    this.logger.log(
      JSON.stringify({
        event: 'check_in_applied',
        direction: adjustment.direction,
        rows: adjustment.updates.length,
        weekday: day.dayOfWeek,
        nextWeek: day.weekNumber + 1,
      }),
    );
    return { applied: true, summary: adjustment.summary };
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
