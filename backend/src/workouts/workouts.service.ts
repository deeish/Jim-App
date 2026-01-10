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

  async create(createWorkoutDto: CreateWorkoutDto): Promise<WorkoutWithExercises> {
    return this.prisma.workout.create({
      data: {
        name: createWorkoutDto.name,
        day: createWorkoutDto.day,
        exercises: {
          create: createWorkoutDto.exercises,
        },
      },
      include: {
        exercises: true,
      },
    });
  }

  async findAll(): Promise<WorkoutWithExercises[]> {
    return this.prisma.workout.findMany({
      include: {
        exercises: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findWeekly(): Promise<WorkoutWithExercises[]> {
    return this.prisma.workout.findMany({
      include: {
        exercises: true,
      },
      orderBy: {
        day: 'asc',
      },
    });
  }

  async findOne(id: string): Promise<WorkoutWithExercises> {
    const workout = await this.prisma.workout.findUnique({
      where: { id },
      include: {
        exercises: true,
      },
    });

    if (!workout) {
      throw new NotFoundException(`Workout with ID ${id} not found`);
    }
    return workout;
  }

  async update(id: string, updateWorkoutDto: Partial<CreateWorkoutDto>): Promise<WorkoutWithExercises> {
    // Check if workout exists
    await this.findOne(id);

    // If exercises are being updated, delete existing ones first
    if (updateWorkoutDto.exercises) {
      await this.prisma.exercise.deleteMany({
        where: { workoutId: id },
      });
    }

    return this.prisma.workout.update({
      where: { id },
      data: {
        ...(updateWorkoutDto.name && { name: updateWorkoutDto.name }),
        ...(updateWorkoutDto.day !== undefined && { day: updateWorkoutDto.day }),
        ...(updateWorkoutDto.exercises && {
          exercises: {
            create: updateWorkoutDto.exercises,
          },
        }),
      },
      include: {
        exercises: true,
      },
    });
  }

  async remove(id: string): Promise<void> {
    const result = await this.prisma.workout.delete({
      where: { id },
    }).catch(() => {
      throw new NotFoundException(`Workout with ID ${id} not found`);
    });
  }

  async generate(generateWorkoutDto: GenerateWorkoutDto): Promise<WorkoutWithExercises> {
    // Use the workout generator service to create a workout
    const generatedWorkout = await this.workoutGeneratorService.generateWorkout(
      generateWorkoutDto,
    );

    // Save the generated workout to the database
    return this.create(generatedWorkout);
  }
}
