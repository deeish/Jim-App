import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkoutLogDto } from './dto/create-workout-log.dto';

@Injectable()
export class WorkoutLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateWorkoutLogDto, userId: string) {

    const workout = await this.prisma.workout.findUnique({
      where: { id: dto.workoutId },
    });
    if (!workout) {
      throw new NotFoundException(`Workout with ID ${dto.workoutId} not found`);
    }

    const startedAt = new Date(dto.startedAt);
    const completedAt = dto.completedAt ? new Date(dto.completedAt) : new Date();

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
    }
    const logs = await this.prisma.workoutLog.findMany({
      where,
      include: {
        workout: true,
        entries: { include: { completedSets: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
    return logs;
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
