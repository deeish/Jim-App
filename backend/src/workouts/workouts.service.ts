import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkoutDto } from './dto/create-workout.dto';
import { GenerateWorkoutDto } from './dto/generate-workout.dto';
import { QuickSessionDto } from './dto/quick-session.dto';
import { WorkoutGeneratorService } from './workout-generator.service';
import { ExercisesService } from '../exercises/exercises.service';
import { buildQuickSession, type QuickMuscle } from './quick-session-builder';
import { resolveRegenFocus } from './regenerate-focus.util';
import { Prisma } from '@prisma/client';

type WorkoutWithExercises = Prisma.WorkoutGetPayload<{
  include: { exercises: true };
}>;

/**
 * When exercises change, rewrite focus/detailLine so the "N exercises" prefix matches the list.
 * Drops any prior "M exercises" segments so UI never shows two counts.
 */
function focusDetailLineAfterExerciseChange(
  previousFocus: string | null | undefined,
  exerciseCount: number,
): string {
  const remainder = (previousFocus ?? '')
    .split(/\s*[·•]\s*/)
    .map((s) => s.trim())
    .filter((s) => s && !/^\d+\s*exercises?$/i.test(s))
    .join(' • ');
  if (exerciseCount <= 0) {
    return remainder || previousFocus?.trim() || '';
  }
  return remainder
    ? `${exerciseCount} exercises • ${remainder}`
    : `${exerciseCount} exercises`;
}

/** Prisma client type includes SavedWorkout after `prisma generate`. Cast used until then. */
type PrismaWithSaved = PrismaService & {
  savedWorkout: {
    findUnique: (args: {
      where: { userId_workoutId: { userId: string; workoutId: string } };
    }) => Promise<unknown>;
    findMany: (args: {
      where: { userId: string };
      orderBy?: { createdAt: 'desc' };
      select: { workoutId: true };
    }) => Promise<{ workoutId: string }[]>;
    upsert: (args: {
      where: { userId_workoutId: { userId: string; workoutId: string } };
      create: { userId: string; workoutId: string };
      update: object;
    }) => Promise<unknown>;
    deleteMany: (args: {
      where: { userId: string; workoutId: string };
    }) => Promise<unknown>;
  };
};

@Injectable()
export class WorkoutsService {
  constructor(
    private prisma: PrismaService,
    private workoutGeneratorService: WorkoutGeneratorService,
    private exercisesService: ExercisesService,
  ) {}

  /**
   * The Quick Workout builder — deterministic catalog assembly for an
   * arbitrary muscle selection (see quick-session-builder.ts). No LLM, no
   * AI throttling: instant and free. The seed rotates day-to-day so two
   * "Pull" quick sessions in one week differ, while retries within a day
   * stay stable.
   */
  buildQuickSession(dto: QuickSessionDto) {
    const now = new Date();
    const dayOfYear = Math.floor(
      (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) /
        86_400_000,
    );
    return buildQuickSession({
      muscles: dto.muscles as QuickMuscle[],
      candidates: this.exercisesService.search({}),
      goal: dto.goal,
      difficulty: dto.experience,
      equipment: dto.equipment?.length ? dto.equipment : undefined,
      limitations: dto.limitations,
      excludeIds: dto.excludeIds,
      seed: dayOfYear,
    });
  }

  private get db(): PrismaWithSaved {
    return this.prisma as PrismaWithSaved;
  }

  /** True once Prisma client has been regenerated (e.g. npx prisma generate) with SavedWorkout model. */
  private get hasSavedWorkout(): boolean {
    return typeof (this.prisma as any).savedWorkout !== 'undefined';
  }

  /** Keep plan_workout.plan_exercises aligned with workout_exercises when the workout is linked to a plan slot. */
  private async syncPlanSlotExercisesFromWorkoutExercises(
    planWorkoutId: string,
    exercises: WorkoutWithExercises['exercises'],
  ): Promise<void> {
    await this.prisma.planExercise.deleteMany({ where: { planWorkoutId } });
    if (exercises.length === 0) return;
    await this.prisma.planExercise.createMany({
      data: exercises.map((e, i) => ({
        planWorkoutId,
        exerciseId:
          (e.exerciseId && String(e.exerciseId).trim()) ||
          `workout_${planWorkoutId.replace(/-/g, '').slice(0, 12)}_${i}`,
        name: e.name,
        sets: e.sets,
        reps: e.reps,
        repsMin: e.repsMin ?? null,
        repsMax: e.repsMax ?? null,
        durationSeconds: e.durationSeconds ?? null,
        prescriptionType: e.prescriptionType ?? null,
        weight: e.weight ?? null,
        notes: e.notes ?? null,
        orderIndex: e.orderIndex ?? i,
      })),
    });
  }

  async create(
    createWorkoutDto: CreateWorkoutDto,
    userId: string,
  ): Promise<WorkoutWithExercises> {
    const data = {
      name: createWorkoutDto.name,
      day: createWorkoutDto.day,
      userId,
      reasoning: createWorkoutDto.reasoning ?? undefined,
      warmUp: createWorkoutDto.warmUp ?? undefined,
      coolDown: createWorkoutDto.coolDown ?? undefined,
      exercises: {
        create: createWorkoutDto.exercises.map((e, i) => ({
          name: e.name,
          sets: e.sets,
          reps: e.reps,
          repsMin: e.repsMin ?? null,
          repsMax: e.repsMax ?? null,
          durationSeconds: e.durationSeconds ?? null,
          prescriptionType: e.prescriptionType ?? null,
          weight: e.weight,
          notes: e.notes,
          exerciseId: e.exerciseId ?? undefined,
          orderIndex: e.orderIndex ?? i,
        })),
      },
    } as Prisma.WorkoutUncheckedCreateInput;
    return this.prisma.workout.create({
      data,
      include: {
        exercises: true,
      },
    });
  }

  async findAll(userId: string): Promise<WorkoutWithExercises[]> {
    return this.prisma.workout.findMany({
      where: { userId },
      include: {
        exercises: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Ensure a saved Workout exists for this plan slot (from plan_exercises), or return an existing one.
   * Used when the Plan screen shows a slot that was never auto-materialized into workouts.
   */
  async materializeFromPlanSlot(
    planWorkoutId: string,
    userId: string,
  ): Promise<WorkoutWithExercises> {
    const pw = await this.prisma.planWorkout.findUnique({
      where: { id: planWorkoutId },
      include: {
        workoutPlan: true,
        exercises: { orderBy: { orderIndex: 'asc' } },
      },
    });
    if (!pw?.workoutPlan || pw.workoutPlan.userId !== userId) {
      throw new NotFoundException('Plan slot not found');
    }
    const existing = await this.prisma.workout.findFirst({
      where: { planWorkoutId, userId },
      include: { exercises: true },
    });
    if (existing) {
      return existing;
    }
    if (!pw.exercises.length) {
      throw new BadRequestException(
        'This session has no exercises yet. Apply a generated plan again or add exercises from the library.',
      );
    }
    try {
      return await this.prisma.workout.create({
        data: {
          name: pw.title,
          day: pw.dayOfWeek,
          estimatedDuration: pw.durationMinutes,
          focus: pw.detailLine ?? undefined,
          workoutPlanId: pw.workoutPlanId,
          planWorkoutId: pw.id,
          userId,
          exercises: {
            // Carry the full prescription: this map used to keep only the
            // scalar `reps`, so a lazily materialized workout was born flat
            // and the next edit's plan sync copied the flattening back over
            // the slot's real ranges (mirror of ensureWorkoutFromPlanSlot-
            // Exercises in plans.service, which always carried them).
            create: pw.exercises.map((e, i) => ({
              name: e.name ?? 'Exercise',
              sets: e.sets,
              reps: e.reps,
              repsMin: e.repsMin ?? null,
              repsMax: e.repsMax ?? null,
              durationSeconds: e.durationSeconds ?? null,
              prescriptionType: e.prescriptionType ?? null,
              weight: e.weight ?? undefined,
              notes: e.notes ?? undefined,
              exerciseId:
                e.exerciseId && !e.exerciseId.startsWith('generated_')
                  ? e.exerciseId
                  : undefined,
              orderIndex: e.orderIndex ?? i,
            })),
          },
        },
        include: { exercises: true },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        // Concurrent request already created this workout — return the existing one
        const created = await this.prisma.workout.findFirst({
          where: { planWorkoutId: pw.id, userId },
          include: { exercises: true },
        });
        if (created) return created;
      }
      throw err;
    }
  }

  /** Weekly workouts from the current plan only. Used for "Today's Workout" on Workout tab — if no plan or no workout for a day, that day shows nothing. */
  async findWeekly(userId: string): Promise<WorkoutWithExercises[]> {
    const currentPlan = await this.prisma.workoutPlan.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    if (!currentPlan) return [];
    const planWorkouts = await this.prisma.workout.findMany({
      where: { workoutPlanId: currentPlan.id },
      include: { exercises: true },
      orderBy: { day: 'asc' },
    });
    return planWorkouts;
  }

  async findOne(
    id: string,
    userId: string,
  ): Promise<WorkoutWithExercises & { saved?: boolean }> {
    const workout = await this.prisma.workout.findUnique({
      where: { id },
      include: {
        exercises: true,
        workoutPlan: true,
        planWorkout: { include: { workoutPlan: true } },
      },
    });

    if (!workout) {
      throw new NotFoundException(`Workout with ID ${id} not found`);
    }
    const owned =
      workout.userId === userId ||
      (workout.workoutPlanId && workout.workoutPlan?.userId === userId) ||
      workout.planWorkout?.workoutPlan?.userId === userId;
    if (!owned) {
      throw new NotFoundException(`Workout with ID ${id} not found`);
    }
    let saved = false;
    if (this.hasSavedWorkout) {
      const row = await this.db.savedWorkout.findUnique({
        where: { userId_workoutId: { userId, workoutId: id } },
      });
      saved = !!row;
    }
    // Strip nested relations from API response (ownership already checked above).
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- only keeping ...rest
    const { workoutPlan, planWorkout, ...rest } = workout;
    return {
      ...rest,
      workoutPlan: undefined,
      saved,
    } as WorkoutWithExercises & {
      saved?: boolean;
    };
  }

  /** Ids of workouts the user has saved (for quick "is saved?" checks). */
  async getSavedWorkoutIds(userId: string): Promise<string[]> {
    if (!this.hasSavedWorkout) return [];
    const rows = await this.db.savedWorkout.findMany({
      where: { userId },
      select: { workoutId: true },
    });
    return rows.map((r) => r.workoutId);
  }

  /** Full list of saved workouts with exercises, newest first. */
  async findSavedWorkouts(userId: string): Promise<WorkoutWithExercises[]> {
    if (!this.hasSavedWorkout) return [];
    const saved = await this.db.savedWorkout.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { workoutId: true },
    });
    const ids = saved.map((s) => s.workoutId);
    if (ids.length === 0) return [];
    const workouts = await this.prisma.workout.findMany({
      where: { id: { in: ids } },
      include: { exercises: true },
    });
    const order = new Map<string, number>(ids.map((id, i) => [id, i]));
    return workouts
      .slice()
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  /** Save a workout to the user's "Saved" list. User must have access (own or via plan). */
  async saveWorkout(workoutId: string, userId: string): Promise<void> {
    await this.findOne(workoutId, userId);
    if (!this.hasSavedWorkout) return;
    await this.db.savedWorkout.upsert({
      where: { userId_workoutId: { userId, workoutId } },
      create: { userId, workoutId },
      update: {},
    });
  }

  /** Remove a workout from the user's Saved list. */
  async unsaveWorkout(workoutId: string, userId: string): Promise<void> {
    if (!this.hasSavedWorkout) return;
    await this.db.savedWorkout.deleteMany({
      where: { userId, workoutId },
    });
  }

  async update(
    id: string,
    updateWorkoutDto: Partial<CreateWorkoutDto>,
    userId: string,
  ): Promise<WorkoutWithExercises> {
    const before = await this.findOne(id, userId);

    // If exercises are being updated, delete existing ones first
    if (updateWorkoutDto.exercises) {
      await this.prisma.workout.update({
        where: { id },
        data: { exercises: { deleteMany: {} } },
      });
    }

    const newPlanDetail =
      updateWorkoutDto.exercises !== undefined && before.planWorkoutId
        ? focusDetailLineAfterExerciseChange(
            before.focus,
            updateWorkoutDto.exercises.length,
          )
        : undefined;

    const updated = await this.prisma.workout.update({
      where: { id },
      data: {
        ...(updateWorkoutDto.name && { name: updateWorkoutDto.name }),
        ...(updateWorkoutDto.day !== undefined && {
          day: updateWorkoutDto.day,
        }),
        ...(newPlanDetail !== undefined && { focus: newPlanDetail }),
        ...(updateWorkoutDto.exercises && {
          exercises: {
            // Full prescription fidelity: this delete-and-recreate used to keep
            // only the scalar `reps`, silently flattening every range in the
            // workout (and, via the plan sync below, in the plan) on any edit.
            create: updateWorkoutDto.exercises.map((e, i) => ({
              name: e.name,
              sets: e.sets,
              reps: e.reps,
              repsMin: e.repsMin ?? null,
              repsMax: e.repsMax ?? null,
              durationSeconds: e.durationSeconds ?? null,
              prescriptionType: e.prescriptionType ?? null,
              weight: e.weight,
              notes: e.notes,
              exerciseId: e.exerciseId ?? undefined,
              orderIndex: e.orderIndex ?? i,
            })),
          },
        }),
      },
      include: {
        exercises: true,
      },
    });

    if (updateWorkoutDto.exercises !== undefined && before.planWorkoutId) {
      await this.syncPlanSlotExercisesFromWorkoutExercises(
        before.planWorkoutId,
        updated.exercises,
      );
      if (newPlanDetail !== undefined) {
        await this.prisma.planWorkout.update({
          where: { id: before.planWorkoutId },
          data: { detailLine: newPlanDetail },
        });
      }
    }

    return this.findOne(id, userId);
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.findOne(id, userId);
    await this.prisma.workout.delete({
      where: { id },
    });
  }

  async generate(
    generateWorkoutDto: GenerateWorkoutDto,
    userId: string,
  ): Promise<WorkoutWithExercises> {
    const dtoWithUser = { ...generateWorkoutDto, userId };
    const generatedWorkout =
      await this.workoutGeneratorService.generateWorkout(dtoWithUser);
    return this.create(generatedWorkout, userId);
  }

  /**
   * Replace this workout's exercises (and warm-up / reasoning / cool-down) using the AI generator,
   * using the same day, title/focus, duration, and excluding current library moves for variety.
   * Updates the same DB row; plan slot exercises stay in sync when plan-linked.
   */
  async regenerateWorkout(
    id: string,
    userId: string,
  ): Promise<WorkoutWithExercises & { saved?: boolean }> {
    const existing = await this.findOne(id, userId);
    if (!existing.exercises?.length) {
      throw new BadRequestException(
        'Add at least one exercise before regenerating, or use Add from library.',
      );
    }
    // The `focus` column is a display detail line ("45 min · Strength · 5 exercises")
    // for plan-linked workouts — the day title carries the real focus (Push/Pull/Legs).
    // Deriving from the detail line collapsed regeneration to a full-body pool.
    const focusLabel = resolveRegenFocus(existing.name, existing.focus);
    const excludeIds = existing.exercises
      .map((e) => e.exerciseId)
      .filter(
        (x): x is string => !!x && x.length > 0 && !x.startsWith('generated_'),
      );
    const dto: GenerateWorkoutDto = {
      day: existing.day ?? undefined,
      userId,
      preferences: {
        focus: focusLabel,
        programDayFocus: existing.name,
        duration: existing.estimatedDuration ?? 45,
        ...(excludeIds.length > 0 ? { excludeExerciseIds: excludeIds } : {}),
      },
    };
    const generated = await this.workoutGeneratorService.generateWorkout(dto);
    const nameToUse = existing.planWorkoutId ? existing.name : generated.name;
    const newFocus = focusDetailLineAfterExerciseChange(
      existing.focus,
      generated.exercises.length,
    );

    await this.prisma.workoutExercise.deleteMany({ where: { workoutId: id } });
    const updated = await this.prisma.workout.update({
      where: { id },
      data: {
        name: nameToUse,
        reasoning: generated.reasoning ?? null,
        warmUp: generated.warmUp ?? null,
        coolDown: generated.coolDown ?? null,
        focus: newFocus,
        exercises: {
          create: generated.exercises.map((e, i) => ({
            name: e.name,
            sets: e.sets,
            reps: e.reps,
            weight: e.weight ?? undefined,
            notes: e.notes ?? undefined,
            exerciseId: e.exerciseId ?? undefined,
            orderIndex: e.orderIndex ?? i,
          })),
        },
      },
      include: { exercises: true },
    });

    if (existing.planWorkoutId) {
      await this.syncPlanSlotExercisesFromWorkoutExercises(
        existing.planWorkoutId,
        updated.exercises,
      );
      await this.prisma.planWorkout.update({
        where: { id: existing.planWorkoutId },
        data: { detailLine: newFocus },
      });
    }

    return this.findOne(id, userId);
  }

  /** Returns generated workout (name, reasoning, exercises) without saving. For plan preview. */
  async previewGenerate(
    generateWorkoutDto: GenerateWorkoutDto,
    userId: string,
  ): Promise<CreateWorkoutDto> {
    // The caller's id OVERWRITES anything in the body — the same thing
    // `generate` has always done, and the line whose absence here meant a
    // preview could be personalised from someone else's training history.
    return this.workoutGeneratorService.generateWorkout({
      ...generateWorkoutDto,
      userId,
    });
  }
}
