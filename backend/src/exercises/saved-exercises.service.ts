import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SavedExercisesService {
  constructor(private readonly prisma: PrismaService) {}

  async getSavedExerciseIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.savedExercise.findMany({
      where: { userId },
      select: { exerciseId: true },
    });
    const ids = rows.map((r) => r.exerciseId);
    if (process.env.NODE_ENV !== 'production') {
      console.log('[SavedExercisesService] getSavedExerciseIds', userId, '->', ids.length, 'ids');
    }
    return ids;
  }

  async saveExercise(userId: string, exerciseId: string): Promise<void> {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[SavedExercisesService] saveExercise', userId, exerciseId);
    }
    await this.prisma.savedExercise.upsert({
      where: { userId_exerciseId: { userId, exerciseId } },
      create: { userId, exerciseId },
      update: {},
    });
  }

  async unsaveExercise(userId: string, exerciseId: string): Promise<void> {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[SavedExercisesService] unsaveExercise', userId, exerciseId);
    }
    await this.prisma.savedExercise.deleteMany({ where: { userId, exerciseId } });
  }
}
