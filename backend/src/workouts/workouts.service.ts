import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkoutDto } from './dto/create-workout.dto';
import { GenerateWorkoutDto } from './dto/generate-workout.dto';
import { WorkoutGeneratorService } from './workout-generator.service';
import { Prisma } from '@prisma/client';

type WorkoutWithExercises = Prisma.WorkoutGetPayload<{
  include: { exercises: true };
}>;

@Injectable()
export class WorkoutsService {
  constructor(
    private prisma: PrismaService,
    private workoutGeneratorService: WorkoutGeneratorService,
  ) {}

  async create(
    createWorkoutDto: CreateWorkoutDto,
    userId: string,
  ): Promise<WorkoutWithExercises> {
    return this.prisma.workout.create({
      data: {
        name: createWorkoutDto.name,
        day: createWorkoutDto.day,
        userId,
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
      },
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

  async findWeekly(userId: string): Promise<WorkoutWithExercises[]> {
    const currentPlan = await this.prisma.workoutPlan.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    if (currentPlan) {
      const planWorkouts = await this.prisma.workout.findMany({
        where: { workoutPlanId: currentPlan.id },
        include: { exercises: true },
        orderBy: { day: 'asc' },
      });
      if (planWorkouts.length > 0) return planWorkouts;
    }
    return this.prisma.workout.findMany({
      where: { userId },
      include: { exercises: true },
      orderBy: { day: 'asc' },
    });
  }

  async findOne(id: string, userId: string): Promise<WorkoutWithExercises> {
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
    const { workoutPlan, ...rest } = workout;
    return { ...rest, workoutPlan: undefined } as WorkoutWithExercises;
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
    const generatedWorkout =
      await this.workoutGeneratorService.generateWorkout(generateWorkoutDto);
    return this.create(generatedWorkout, userId);
  }
}
