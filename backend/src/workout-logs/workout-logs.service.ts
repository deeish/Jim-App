import {
  adjustNextWeekFromCheckIn,
  checkInDirection,
  type CheckIn,
} from './checkin-adjustment';
import {
  deloadRow,
  rowIsDeloaded,
  stepLiftFromLog,
  TRIGGERED_DELOAD_NOTE,
  type LiftStep,
  type LoggedSet,
} from './lift-progression';
import {
  isPlateaued,
  PLATEAU_MAX_AGE_DAYS,
  PLATEAU_SESSIONS,
} from '../plans/load-from-history';
import { CheckInDto } from './dto/check-in.dto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkoutsService } from '../workouts/workouts.service';
import { CreateWorkoutLogDto } from './dto/create-workout-log.dto';
import { UpdateWorkoutLogSetsDto } from './dto/update-workout-log-sets.dto';
import {
  fetchLastEntriesForExercises,
  fetchRecentEntriesForExercises,
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
    const adjustment = await this.applyCheckIn(log.id, dto.checkIn, userId);
    return { ...log, adjustment };
  }

  /**
   * Post-session check-in (Tier 4a): stores the three answers and, once,
   * moves the same day next week by one step (checkin-adjustment.ts).
   */
  /**
   * Replace a logged session's sets with corrected ones (GitHub #57: a set
   * checked with the wrong number could not be changed once the workout was
   * complete). The entries are recreated from the list, the same shape the
   * create takes, and the set and volume totals are recomputed from them;
   * timings, notes and the check-in are untouched. Ownership is the log's.
   */
  async updateSets(id: string, dto: UpdateWorkoutLogSetsDto, userId: string) {
    const existing = await this.prisma.workoutLog.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`Workout log with ID ${id} not found`);
    }
    let totalSets = 0;
    let totalVolume = 0;
    const entries = dto.entries.map((entry) => ({
      exerciseId: entry.exerciseId ?? 'manual',
      name: entry.name,
      orderIndex: entry.orderIndex,
      notes: entry.notes ?? undefined,
      completedSets: {
        create: entry.sets
          .filter((s) => s.completed)
          .map((s) => {
            totalSets += 1;
            if (s.weight != null) totalVolume += s.weight * s.reps;
            return {
              setNumber: s.setNumber,
              reps: s.reps,
              weight: s.weight ?? undefined,
              rpe: s.rpe ?? undefined,
              completed: true,
              notes: s.notes ?? undefined,
            };
          }),
      },
    }));
    return this.prisma.$transaction(async (tx) => {
      await tx.workoutLogEntry.deleteMany({ where: { workoutLogId: id } });
      return tx.workoutLog.update({
        where: { id },
        data: {
          totalSets,
          totalVolume: Math.round(totalVolume),
          entries: { create: entries },
        },
        include: {
          entries: { include: { completedSets: true } },
          workout: true,
        },
      });
    });
  }

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
      : await this.applyCheckIn(id, dto, userId);
    return { id, adjustment };
  }

  /**
   * After a session is logged and checked in, the same day next week is
   * rewritten from it (Tier 4a sets, Tier 7 the ledger):
   *
   * 1. sets from the check-in (`checkin-adjustment.ts`);
   * 2. load and rep target per lift from the logged sets
   *    (`lift-progression.ts`), following the load the user actually used;
   * 3. a lighter week on trigger: two eased check-ins on the same day type
   *    in a row, or a main lift stalled over its last three logs. The
   *    trigger rewrites every day of the coming week once; a week already
   *    shaped by a deload is not touched by the ledger.
   *
   * Only the next week moves. Weeks further out stay as the projection
   * until their predecessor is logged.
   */
  private async applyCheckIn(
    logId: string,
    checkIn: CheckIn,
    userId: string,
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
      select: {
        workout: { select: { planWorkoutId: true } },
        entries: {
          select: {
            exerciseId: true,
            completedSets: {
              select: { reps: true, weight: true, completed: true, rpe: true },
            },
          },
        },
      },
    });
    const planWorkoutId = log?.workout?.planWorkoutId;
    if (!log || !planWorkoutId)
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
      include: { exercises: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!next) return { applied: false, summary: null, reason: 'no_next_week' };

    const loggedById = new Map<string, LoggedSet[]>();
    for (const e of log.entries) {
      if (!e.exerciseId) continue;
      const sets = (e.completedSets ?? [])
        .filter((c) => c.completed !== false && c.reps > 0)
        .map((c) => ({ reps: c.reps, weight: c.weight, rpe: c.rpe }));
      if (!sets.length) continue;
      loggedById.set(e.exerciseId, [
        ...(loggedById.get(e.exerciseId) ?? []),
        ...sets,
      ]);
    }
    const mainRow = next.exercises.find(
      (e) => (e.prescriptionType ?? 'reps') !== 'time' && e.sets > 0,
    );

    // 3. The trigger, decided first: a deload week supersedes the other two.
    const nextWeekDeloaded = next.exercises.some((e) => rowIsDeloaded(e.notes));
    const trigger = nextWeekDeloaded
      ? null
      : await this.deloadTrigger({
          userId,
          workoutPlanId: day.workoutPlanId,
          weekNumber: day.weekNumber,
          dayOfWeek: day.dayOfWeek,
          orderInDay: day.orderInDay,
          checkIn,
          mainExerciseId: mainRow?.exerciseId,
        });
    if (trigger) {
      const week = await this.prisma.planWorkout.findMany({
        where: {
          workoutPlanId: day.workoutPlanId,
          weekNumber: day.weekNumber + 1,
        },
        include: { exercises: true },
      });
      const mirrors = await this.mirrorRowsForDays(
        userId,
        week.map((w) => w.id),
      );
      const updates = week.flatMap((w) =>
        w.exercises.flatMap((e) => {
          const eased = deloadRow({
            id: e.id,
            exerciseId: e.exerciseId,
            name: e.name ?? 'Exercise',
            sets: e.sets,
            reps: e.reps,
            repsMin: e.repsMin,
            repsMax: e.repsMax,
            targetRir: e.targetRir,
            weight: e.weight,
            prescriptionType: e.prescriptionType,
            notes: e.notes,
          });
          const base = (e.notes ?? '').trim();
          const notes = base
            ? `${base} ${TRIGGERED_DELOAD_NOTE}`
            : TRIGGERED_DELOAD_NOTE;
          // Workout rows carry no effort target.
          const { targetRir: _rir, ...mirrored } = eased;
          void _rir;
          return [
            this.prisma.planExercise.update({
              where: { id: e.id },
              data: { ...eased, notes },
            }),
            ...(mirrors.get(`${w.id}|${e.exerciseId}`) ?? []).map((id) =>
              this.prisma.workoutExercise.update({
                where: { id },
                data: { ...mirrored, notes },
              }),
            ),
          ];
        }),
      );
      await this.prisma.$transaction([
        ...updates,
        this.prisma.workoutLog.update({
          where: { id: logId },
          data: { checkInAppliedAt: new Date() },
        }),
      ]);
      this.logger.log(
        JSON.stringify({
          event: 'deload_triggered',
          reason: trigger,
          week: day.weekNumber + 1,
          rows: updates.length,
        }),
      );
      return {
        applied: true,
        summary:
          trigger === 'plateau'
            ? `Week ${day.weekNumber + 1} is a lighter week: ${mainRow?.name ?? 'your main lift'} has stalled three sessions running. Sets, reps and weight ease; build back after.`
            : `Week ${day.weekNumber + 1} is a lighter week: two hard weeks in a row. Sets, reps and weight ease; build back after.`,
      };
    }

    // 1. Sets from the check-in.
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
    const setUpdateById = new Map(adjustment.updates.map((u) => [u.id, u]));

    // 2. The ledger, on top of the set adjustment's notes.
    const steps: LiftStep[] = [];
    if (!nextWeekDeloaded) {
      for (const e of next.exercises) {
        const logged = loggedById.get(e.exerciseId);
        if (!logged) continue;
        const setUpdate = setUpdateById.get(e.id);
        const step = stepLiftFromLog(
          {
            id: e.id,
            exerciseId: e.exerciseId,
            name: e.name ?? 'Exercise',
            sets: e.sets,
            reps: e.reps,
            repsMin: e.repsMin,
            repsMax: e.repsMax,
            targetRir: setUpdate?.targetRir ?? e.targetRir,
            weight: e.weight,
            prescriptionType: e.prescriptionType,
            notes: setUpdate?.notes ?? e.notes,
          },
          logged,
          checkIn,
        );
        if (step) steps.push(step);
      }
    }
    const stepById = new Map(steps.map((st) => [st.id, st]));

    const rowIds = new Set([...setUpdateById.keys(), ...stepById.keys()]);
    if (rowIds.size === 0) {
      return { applied: false, summary: null, reason: 'nothing_to_move' };
    }
    // A day the user already opened has its own workout rows; they get the
    // same change, or the screen would still show the forecast.
    const mirrors = await this.mirrorRowsForDays(userId, [next.id]);
    const exerciseIdOf = new Map(
      next.exercises.map((e) => [e.id, e.exerciseId]),
    );
    const updates = [...rowIds].flatMap((id) => {
      const u = setUpdateById.get(id);
      const st = stepById.get(id);
      const data = {
        ...(u?.sets != null ? { sets: u.sets } : {}),
        ...(st?.weight != null ? { weight: st.weight } : {}),
        ...(st ? { reps: st.reps } : {}),
        ...(st
          ? { notes: st.notes }
          : u?.notes != null
            ? { notes: u.notes }
            : {}),
      };
      return [
        this.prisma.planExercise.update({
          where: { id },
          data: {
            ...data,
            ...(u?.targetRir != null ? { targetRir: u.targetRir } : {}),
          },
        }),
        ...(mirrors.get(`${next.id}|${exerciseIdOf.get(id)}`) ?? []).map(
          (wid) =>
            this.prisma.workoutExercise.update({ where: { id: wid }, data }),
        ),
      ];
    });
    await this.prisma.$transaction([
      ...updates,
      this.prisma.workoutLog.update({
        where: { id: logId },
        data: { checkInAppliedAt: new Date() },
      }),
    ]);
    this.logger.log(
      JSON.stringify({
        event: 'check_in_applied',
        direction: adjustment.direction,
        setRows: adjustment.updates.length,
        ledgerRows: steps.length,
        ledger: steps.map((st) => `${st.name}:${st.kind}`),
        weekday: day.dayOfWeek,
        nextWeek: day.weekNumber + 1,
      }),
    );
    const parts: string[] = [];
    if (adjustment.summary) parts.push(adjustment.summary);
    if (steps.length) {
      const shown = steps.slice(0, 3).map((st) => st.summary);
      const more = steps.length - shown.length;
      parts.push(
        `Next ${day.dayOfWeek}: ${shown.join(', ')}${more > 0 ? `, and ${more} more` : ''}.`,
      );
    }
    return { applied: true, summary: parts.join(' ') };
  }

  /**
   * The materialized workout rows for these plan days, keyed
   * `planWorkoutId|exerciseId`, so a plan-row change reaches a day the user
   * has already opened.
   */
  private async mirrorRowsForDays(
    userId: string,
    planWorkoutIds: string[],
  ): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (planWorkoutIds.length === 0) return out;
    const workouts = await this.prisma.workout.findMany({
      where: { userId, planWorkoutId: { in: planWorkoutIds } },
      select: {
        planWorkoutId: true,
        exercises: { select: { id: true, exerciseId: true } },
      },
    });
    for (const w of workouts) {
      for (const e of w.exercises) {
        if (!e.exerciseId || !w.planWorkoutId) continue;
        const key = `${w.planWorkoutId}|${e.exerciseId}`;
        out.set(key, [...(out.get(key) ?? []), e.id]);
      }
    }
    return out;
  }

  /**
   * Why the coming week should be lighter, or null: two eased check-ins on
   * this day type in a row, or a stalled main lift (three logs at the same
   * top load without a rep gained, none older than three months).
   */
  private async deloadTrigger(args: {
    userId: string;
    workoutPlanId: string;
    weekNumber: number;
    dayOfWeek: string;
    orderInDay: number;
    checkIn: CheckIn;
    mainExerciseId?: string;
  }): Promise<'two_hard_weeks' | 'plateau' | null> {
    if (checkInDirection(args.checkIn) === 'ease' && args.weekNumber > 1) {
      const prev = await this.prisma.planWorkout.findFirst({
        where: {
          workoutPlanId: args.workoutPlanId,
          weekNumber: args.weekNumber - 1,
          dayOfWeek: args.dayOfWeek,
          orderInDay: args.orderInDay,
        },
        select: {
          workouts: {
            where: { userId: args.userId },
            select: {
              workoutLogs: {
                orderBy: { startedAt: 'desc' },
                take: 1,
                select: { effort: true, soreness: true, jointPain: true },
              },
            },
          },
        },
      });
      const last = prev?.workouts.flatMap((w) => w.workoutLogs)[0];
      if (
        last?.effort != null &&
        checkInDirection({
          effort: last.effort as 1 | 2 | 3,
          soreness: (last.soreness ?? 0) as 0 | 1 | 2,
          jointPain: (last.jointPain ?? 0) as 0 | 1 | 2,
        }) === 'ease'
      ) {
        return 'two_hard_weeks';
      }
    }
    if (args.mainExerciseId && isTrackableExerciseId(args.mainExerciseId)) {
      const history = await fetchRecentEntriesForExercises(
        this.prisma,
        args.userId,
        [args.mainExerciseId],
        PLATEAU_SESSIONS,
      );
      const recent = (history.get(args.mainExerciseId) ?? []).filter(
        (p) =>
          Date.now() - p.performedAt.getTime() <
          PLATEAU_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
      );
      if (isPlateaued(recent)) return 'plateau';
    }
    return null;
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
