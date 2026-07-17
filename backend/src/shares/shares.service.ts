import {
  BadRequestException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  PlanExercise,
  PlanWorkout,
  Prisma,
  Share,
  ShareRedemption,
  User,
  Workout,
  WorkoutExercise,
  WorkoutPlan,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlansService } from '../plans/plans.service';
import type {
  CreatePlanDto,
  PlanSlotDto,
  PlanSlotExerciseDto,
} from '../plans/dto/create-plan.dto';
import { CreateShareDto } from './dto/create-share.dto';
import { generateShareCode, normalizeShareCode } from './share-code';

const SHARE_TTL_DAYS = 30;
const CODE_CREATE_ATTEMPTS = 5;

/** dayOfWeek is a name column; DB sorts it alphabetically (Friday < Monday). */
const DAY_ORDER: Record<string, number> = {
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
  Saturday: 5,
  Sunday: 6,
};

const INVALID_CODE_MESSAGE = "That code doesn't look right.";
const NOT_FOUND_MESSAGE = 'Share code not found.';
const EXPIRED_MESSAGE =
  'This share code has expired. Ask your gym buddy for a new one.';
const GONE_MESSAGE = 'What was shared here is no longer available.';
const EMPTY_MESSAGE = "There's nothing to share yet.";
const OWN_SHARE_MESSAGE = 'This is your own share code.';

type ShareKind = 'plan' | 'workout';

type PlanTree = WorkoutPlan & {
  planWorkouts: (PlanWorkout & { exercises: PlanExercise[] })[];
  workouts: (Workout & { exercises: WorkoutExercise[] })[];
};

type WorkoutTree = Workout & { exercises: WorkoutExercise[] };

type LoadedShare = Share & {
  owner: User;
  redemptions: ShareRedemption[];
  plan: PlanTree | null;
  workout: WorkoutTree | null;
};

export type SharePreviewExercise = {
  name: string | null;
  sets: number;
  reps: number;
  repsMin: number | null;
  repsMax: number | null;
  durationSeconds: number | null;
  prescriptionType: string | null;
  weight: number | null;
  notes: string | null;
};

export type SharePreviewResponse = {
  kind: ShareKind;
  sharedByName: string;
  expiresAt: Date;
  isOwnShare: boolean;
  alreadyRedeemed: boolean;
  redeemedPlanId?: string;
  redeemedWorkoutId?: string;
  recipientActivePlanName?: string | null;
  plan?: {
    name: string;
    weekCount: number;
    slots: Array<{
      weekNumber: number;
      dayOfWeek: string;
      title: string;
      detailLine: string | null;
      type: string;
      durationMinutes: number;
      intensity: string | null;
      exerciseCount: number;
      exercises: SharePreviewExercise[];
    }>;
  };
  workout?: {
    name: string;
    day: string | null;
    estimatedDuration: number | null;
    focus: string | null;
    exercises: SharePreviewExercise[];
  };
};

export type AcceptShareResponse = {
  kind: ShareKind;
  planId?: string;
  workoutId?: string;
  alreadyRedeemed: boolean;
};

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'P2002'
  );
}

@Injectable()
export class SharesService {
  private readonly logger = new Logger(SharesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly plansService: PlansService,
  ) {}

  async createShare(
    dto: CreateShareDto,
    userId: string,
  ): Promise<{ code: string; expiresAt: Date }> {
    await this.assertShareableTarget(dto.kind, dto.targetId, userId);
    const senderName = dto.senderName?.trim() || undefined;

    const targetWhere =
      dto.kind === 'plan'
        ? { planId: dto.targetId }
        : { workoutId: dto.targetId };

    const existing = await this.prisma.share.findFirst({
      where: {
        ownerUserId: userId,
        kind: dto.kind,
        ...targetWhere,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      if (senderName && senderName !== existing.senderName) {
        await this.prisma.share.update({
          where: { id: existing.id },
          data: { senderName },
        });
      }
      return { code: existing.code, expiresAt: existing.expiresAt };
    }

    const expiresAt = new Date(
      Date.now() + SHARE_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    let lastError: unknown;
    for (let attempt = 0; attempt < CODE_CREATE_ATTEMPTS; attempt++) {
      try {
        const share = await this.prisma.share.create({
          data: {
            code: generateShareCode(),
            kind: dto.kind,
            ownerUserId: userId,
            senderName,
            ...targetWhere,
            expiresAt,
          },
        });
        return { code: share.code, expiresAt: share.expiresAt };
      } catch (err) {
        // Retry only on a code collision (astronomically rare); rethrow the rest.
        if (!isUniqueViolation(err)) throw err;
        lastError = err;
      }
    }
    throw lastError;
  }

  async getByCode(
    rawCode: string,
    userId: string,
  ): Promise<SharePreviewResponse> {
    const share = await this.loadLiveShare(rawCode, userId);
    const kind = share.kind as ShareKind;

    const redeemed = await this.findLiveRedemption(share, userId);

    const base: SharePreviewResponse = {
      kind,
      sharedByName: this.sharedByName(share),
      expiresAt: share.expiresAt,
      isOwnShare: share.ownerUserId === userId,
      alreadyRedeemed: redeemed !== null,
      redeemedPlanId: redeemed?.clonedPlanId ?? undefined,
      redeemedWorkoutId: redeemed?.clonedWorkoutId ?? undefined,
    };

    if (kind === 'plan') {
      const plan = share.plan as PlanTree;
      const current = await this.plansService.getCurrent(userId);
      return {
        ...base,
        recipientActivePlanName: current?.name ?? null,
        plan: {
          name: plan.name,
          weekCount: plan.planWorkouts.reduce(
            (max, pw) => Math.max(max, pw.weekNumber),
            0,
          ),
          slots: this.sortSlotsForDisplay(plan.planWorkouts).map((pw) => {
            const exercises = this.effectiveSlotExercises(pw, plan.workouts);
            return {
              weekNumber: pw.weekNumber,
              dayOfWeek: pw.dayOfWeek,
              title: pw.title,
              detailLine: pw.detailLine,
              type: pw.type,
              durationMinutes: pw.durationMinutes,
              intensity: pw.intensity,
              exerciseCount: exercises.length,
              exercises: exercises.map((e) => this.toPreviewExercise(e)),
            };
          }),
        },
      };
    }

    const workout = share.workout as WorkoutTree;
    return {
      ...base,
      workout: {
        name: workout.name,
        day: workout.day,
        estimatedDuration: workout.estimatedDuration,
        focus: workout.focus,
        exercises: [...workout.exercises]
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((e) => this.toPreviewExercise(e)),
      },
    };
  }

  async accept(rawCode: string, userId: string): Promise<AcceptShareResponse> {
    const share = await this.loadLiveShare(rawCode, userId);
    const kind = share.kind as ShareKind;
    if (share.ownerUserId === userId) {
      throw new BadRequestException(OWN_SHARE_MESSAGE);
    }

    const existingRedemption = share.redemptions[0] ?? null;
    const live = await this.findLiveRedemption(share, userId);
    if (live) {
      return {
        kind,
        planId: live.clonedPlanId ?? undefined,
        workoutId: live.clonedWorkoutId ?? undefined,
        alreadyRedeemed: true,
      };
    }

    if (kind === 'plan') {
      return this.acceptPlan(share, userId, existingRedemption);
    }
    return this.acceptWorkout(share, userId, existingRedemption);
  }

  // -------------------------------------------------------------------------
  // Accept paths
  // -------------------------------------------------------------------------

  private async acceptPlan(
    share: LoadedShare,
    userId: string,
    existingRedemption: ShareRedemption | null,
  ): Promise<AcceptShareResponse> {
    const dto = this.buildCreatePlanDto(share.plan as PlanTree);
    // Reuses the normal plan-apply path: deactivates the recipient's current
    // plan, deep-creates the tree, materializes Workout rows. LLM-free for any
    // slot with source content (plan_exercises, or the materialized-workout
    // backfill below); only a legacy slot that is empty everywhere falls back
    // to PlansService's generator fill.
    const created = await this.plansService.create(dto, userId);

    try {
      if (existingRedemption) {
        await this.prisma.shareRedemption.update({
          where: { id: existingRedemption.id },
          data: { clonedPlanId: created.id, clonedWorkoutId: null },
        });
      } else {
        await this.prisma.shareRedemption.create({
          data: { shareId: share.id, userId, clonedPlanId: created.id },
        });
      }
    } catch (err) {
      if (!isUniqueViolation(err)) {
        // The clone succeeded and is already the active plan; failing the
        // request over redemption bookkeeping would report an error for a
        // swap that happened. Idempotency degrades (a re-accept re-clones).
        this.logger.warn(
          `share redemption write failed after plan clone ${created.id}: ${String(err)}`,
        );
        return { kind: 'plan', planId: created.id, alreadyRedeemed: false };
      }
      // Double-accept race: another request redeemed first. Our clone also
      // deactivated the winner's clone, so remove ours and re-activate theirs
      // in ONE transaction — a mid-heal crash must never leave the recipient
      // with zero active plans.
      const winner = await this.prisma.shareRedemption.findUnique({
        where: { shareId_userId: { shareId: share.id, userId } },
      });
      if (!winner?.clonedPlanId) throw err;
      await this.prisma.$transaction([
        this.prisma.workout.deleteMany({
          where: { workoutPlanId: created.id, userId },
        }),
        this.prisma.workoutPlan.delete({ where: { id: created.id } }),
        this.prisma.workoutPlan.updateMany({
          where: { id: winner.clonedPlanId, userId },
          data: { isActive: true },
        }),
      ]);
      return {
        kind: 'plan',
        planId: winner.clonedPlanId,
        alreadyRedeemed: true,
      };
    }

    return { kind: 'plan', planId: created.id, alreadyRedeemed: false };
  }

  private async acceptWorkout(
    share: LoadedShare,
    userId: string,
    existingRedemption: ShareRedemption | null,
  ): Promise<AcceptShareResponse> {
    const source = share.workout as WorkoutTree;
    try {
      const cloneId = await this.prisma.$transaction(async (tx) => {
        const clone = await tx.workout.create({
          data: {
            name: source.name,
            day: source.day,
            estimatedDuration: source.estimatedDuration,
            focus: source.focus,
            reasoning: source.reasoning,
            warmUp: source.warmUp,
            coolDown: source.coolDown,
            userId,
            exercises: {
              create: [...source.exercises]
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .map((e, i) => ({
                  exerciseId: e.exerciseId,
                  name: e.name,
                  sets: e.sets,
                  reps: e.reps,
                  repsMin: e.repsMin,
                  repsMax: e.repsMax,
                  durationSeconds: e.durationSeconds,
                  prescriptionType: e.prescriptionType,
                  weight: e.weight,
                  notes: e.notes,
                  orderIndex: i,
                })),
            },
          } as Prisma.WorkoutUncheckedCreateInput,
        });
        // Auto-save so the clone is visible in Saved Workouts right away.
        await tx.savedWorkout.create({
          data: { userId, workoutId: clone.id },
        });
        if (existingRedemption) {
          await tx.shareRedemption.update({
            where: { id: existingRedemption.id },
            data: { clonedWorkoutId: clone.id, clonedPlanId: null },
          });
        } else {
          await tx.shareRedemption.create({
            data: { shareId: share.id, userId, clonedWorkoutId: clone.id },
          });
        }
        return clone.id;
      });
      return { kind: 'workout', workoutId: cloneId, alreadyRedeemed: false };
    } catch (err) {
      // Double-accept race: the whole transaction rolled back; return the winner.
      if (!isUniqueViolation(err)) throw err;
      const winner = await this.prisma.shareRedemption.findUnique({
        where: { shareId_userId: { shareId: share.id, userId } },
      });
      if (!winner?.clonedWorkoutId) throw err;
      return {
        kind: 'workout',
        workoutId: winner.clonedWorkoutId,
        alreadyRedeemed: true,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Loading + validation
  // -------------------------------------------------------------------------

  private async loadLiveShare(
    rawCode: string,
    userId: string,
  ): Promise<LoadedShare> {
    const code = normalizeShareCode(rawCode ?? '');
    if (!code) throw new BadRequestException(INVALID_CODE_MESSAGE);

    const share = (await this.prisma.share.findUnique({
      where: { code },
      include: {
        owner: true,
        redemptions: { where: { userId } },
        plan: {
          include: {
            planWorkouts: {
              orderBy: [
                { weekNumber: 'asc' },
                { dayOfWeek: 'asc' },
                { orderInDay: 'asc' },
              ],
              include: { exercises: { orderBy: { orderIndex: 'asc' } } },
            },
            // Materialized workout rows back-fill slots whose plan_exercises
            // were never written (keeps accept LLM-free).
            workouts: { include: { exercises: true } },
          },
        },
        workout: {
          include: { exercises: { orderBy: { orderIndex: 'asc' } } },
        },
      },
    })) as LoadedShare | null;

    if (!share) throw new NotFoundException(NOT_FOUND_MESSAGE);
    if (share.revokedAt || share.expiresAt <= new Date()) {
      throw new GoneException(EXPIRED_MESSAGE);
    }
    const target = share.kind === 'plan' ? share.plan : share.workout;
    if (!target) throw new GoneException(GONE_MESSAGE);
    return share;
  }

  /** The caller's redemption, only when its clone still exists. */
  private async findLiveRedemption(
    share: LoadedShare,
    userId: string,
  ): Promise<ShareRedemption | null> {
    const redemption = share.redemptions[0];
    if (!redemption) return null;
    if (redemption.clonedPlanId) {
      const plan = await this.prisma.workoutPlan.findUnique({
        where: { id: redemption.clonedPlanId },
        select: { id: true, userId: true },
      });
      if (plan && plan.userId === userId) return redemption;
    }
    if (redemption.clonedWorkoutId) {
      const workout = await this.prisma.workout.findUnique({
        where: { id: redemption.clonedWorkoutId },
        select: { id: true, userId: true },
      });
      if (workout && workout.userId === userId) return redemption;
    }
    return null;
  }

  private async assertShareableTarget(
    kind: ShareKind,
    targetId: string,
    userId: string,
  ): Promise<void> {
    if (kind === 'plan') {
      const plan = await this.prisma.workoutPlan.findUnique({
        where: { id: targetId },
        include: { planWorkouts: { select: { id: true } } },
      });
      if (!plan || plan.userId !== userId) {
        throw new NotFoundException(`Plan with ID ${targetId} not found`);
      }
      if (plan.planWorkouts.length === 0) {
        throw new BadRequestException(EMPTY_MESSAGE);
      }
      return;
    }

    const workout = await this.prisma.workout.findUnique({
      where: { id: targetId },
      include: {
        exercises: { select: { id: true } },
        workoutPlan: { select: { userId: true } },
        planWorkout: {
          select: { workoutPlan: { select: { userId: true } } },
        },
      },
    });
    // Multi-path ownership, mirroring WorkoutsService.findOne: materialized
    // rows can have a null userId and be owned via their plan links.
    const owned =
      !!workout &&
      (workout.userId === userId ||
        workout.workoutPlan?.userId === userId ||
        workout.planWorkout?.workoutPlan?.userId === userId);
    if (!owned) {
      throw new NotFoundException(`Workout with ID ${targetId} not found`);
    }
    if (workout.exercises.length === 0) {
      throw new BadRequestException(EMPTY_MESSAGE);
    }
  }

  // -------------------------------------------------------------------------
  // Mapping
  // -------------------------------------------------------------------------

  private sharedByName(share: LoadedShare): string {
    const emailLocal = share.owner.email?.split('@')[0]?.trim();
    return (
      share.senderName?.trim() ||
      share.owner.name?.trim() ||
      emailLocal ||
      'A friend'
    );
  }

  /** Preview order: week, then real weekday order (Monday first), then slot order. */
  private sortSlotsForDisplay<T extends PlanWorkout>(slots: T[]): T[] {
    return [...slots].sort(
      (a, b) =>
        a.weekNumber - b.weekNumber ||
        (DAY_ORDER[a.dayOfWeek] ?? 7) - (DAY_ORDER[b.dayOfWeek] ?? 7) ||
        a.orderInDay - b.orderInDay,
    );
  }

  /**
   * Exercises this slot will carry after cloning: its plan_exercises, or —
   * when a slot was never backfilled — the exercises of its materialized
   * Workout row. An empty result means the slot clones empty (rare, legacy).
   */
  private effectiveSlotExercises(
    pw: PlanWorkout & { exercises: PlanExercise[] },
    workouts: (Workout & { exercises: WorkoutExercise[] })[],
  ): Array<PlanExercise | WorkoutExercise> {
    if (pw.exercises.length > 0) return pw.exercises;
    const materialized = workouts.find((w) => w.planWorkoutId === pw.id);
    if (!materialized) return [];
    return [...materialized.exercises].sort(
      (a, b) => a.orderIndex - b.orderIndex,
    );
  }

  private toPreviewExercise(
    e: PlanExercise | WorkoutExercise,
  ): SharePreviewExercise {
    return {
      name: e.name,
      sets: e.sets,
      reps: e.reps,
      repsMin: e.repsMin,
      repsMax: e.repsMax,
      durationSeconds: e.durationSeconds,
      prescriptionType: e.prescriptionType,
      weight: e.weight,
      notes: e.notes,
    };
  }

  private buildCreatePlanDto(plan: PlanTree): CreatePlanDto {
    const slots: PlanSlotDto[] = plan.planWorkouts.map((pw) => {
      const exercises = this.effectiveSlotExercises(pw, plan.workouts).map(
        (e): PlanSlotExerciseDto => ({
          // Blank ids fall back to PlansService.create's `applied_...` synth id.
          exerciseId: e.exerciseId ?? '',
          name: e.name ?? undefined,
          sets: e.sets,
          reps: e.reps,
          repsMin: e.repsMin ?? undefined,
          repsMax: e.repsMax ?? undefined,
          durationSeconds: e.durationSeconds ?? undefined,
          prescriptionType:
            e.prescriptionType === 'reps' ||
            e.prescriptionType === 'time' ||
            e.prescriptionType === 'distance'
              ? e.prescriptionType
              : undefined,
          weight: e.weight ?? undefined,
          notes: e.notes ?? undefined,
          orderIndex: e.orderIndex,
        }),
      );
      return {
        weekNumber: pw.weekNumber,
        dayOfWeek: pw.dayOfWeek,
        title: pw.title,
        detailLine: pw.detailLine ?? undefined,
        type: pw.type,
        durationMinutes: pw.durationMinutes,
        intensity: pw.intensity ?? undefined,
        orderInDay: pw.orderInDay,
        exercises: exercises.length ? exercises : undefined,
      };
    });

    return {
      // Recipient gets their own copy: same name, fresh anchor, activated by
      // PlansService.create exactly like applying a generated preview.
      name: plan.name,
      slots,
    };
  }
}
