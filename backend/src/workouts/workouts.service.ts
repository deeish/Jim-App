import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkoutDto } from './dto/create-workout.dto';
import { GenerateWorkoutDto } from './dto/generate-workout.dto';
import { WorkoutGeneratorService } from './workout-generator.service';
import { Prisma } from '@prisma/client';

type WorkoutWithExercises = Prisma.WorkoutGetPayload<{
  include: { exercises: true };
}>;

/** Prisma client type includes SavedWorkout after `prisma generate`. Cast used until then. */
type PrismaWithSaved = PrismaService & {
  savedWorkout: {
    findUnique: (args: { where: { userId_workoutId: { userId: string; workoutId: string } } }) => Promise<unknown>;
    findMany: (args: { where: { userId: string }; orderBy?: { createdAt: 'desc' }; select: { workoutId: true } }) => Promise<{ workoutId: string }[]>;
    upsert: (args: { where: { userId_workoutId: { userId: string; workoutId: string } }; create: { userId: string; workoutId: string }; update: object }) => Promise<unknown>;
    deleteMany: (args: { where: { userId: string; workoutId: string } }) => Promise<unknown>;
  };
};

@Injectable()
export class WorkoutsService {
  constructor(
    private prisma: PrismaService,
    private workoutGeneratorService: WorkoutGeneratorService,
  ) {}

  private get db(): PrismaWithSaved {
    return this.prisma as PrismaWithSaved;
  }

  /** True once Prisma client has been regenerated (e.g. npx prisma generate) with SavedWorkout model. */
  private get hasSavedWorkout(): boolean {
    return typeof (this.prisma as any).savedWorkout !== 'undefined';
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
    return this.prisma.workout.create({
      data: {
        name: pw.title,
        day: pw.dayOfWeek,
        estimatedDuration: pw.durationMinutes,
        focus: pw.detailLine ?? undefined,
        workoutPlanId: pw.workoutPlanId,
        planWorkoutId: pw.id,
        userId,
        exercises: {
          create: pw.exercises.map((e, i) => ({
            name: e.name ?? 'Exercise',
            sets: e.sets,
            reps: e.reps,
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
      },
    });

    if (!workout) {
      throw new NotFoundException(`Workout with ID ${id} not found`);
    }
    const owned =
      workout.userId === userId ||
      (workout.workoutPlanId && workout.workoutPlan?.userId === userId);
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
    const { workoutPlan, ...rest } = workout;
    return { ...rest, workoutPlan: undefined, saved } as WorkoutWithExercises & {
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
      .sort(
        (a, b) =>
          (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
      );
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
    await this.findOne(id, userId);

    // If exercises are being updated, delete existing ones first
    if (updateWorkoutDto.exercises) {
      await this.prisma.workout.update({
        where: { id },
        data: { exercises: { deleteMany: {} } },
      });
    }

    return this.prisma.workout.update({
      where: { id },
      data: {
        ...(updateWorkoutDto.name && { name: updateWorkoutDto.name }),
        ...(updateWorkoutDto.day !== undefined && {
          day: updateWorkoutDto.day,
        }),
        ...(updateWorkoutDto.exercises && {
          exercises: {
            create: updateWorkoutDto.exercises.map((e, i) => ({
              name: e.name,
              sets: e.sets,
              reps: e.reps,
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

  /** Returns generated workout (name, reasoning, exercises) without saving. For plan preview. */
  async previewGenerate(
    generateWorkoutDto: GenerateWorkoutDto,
  ): Promise<CreateWorkoutDto> {
    return this.workoutGeneratorService.generateWorkout(generateWorkoutDto);
  }
}
