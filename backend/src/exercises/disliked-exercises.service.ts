import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Exercises a user never wants to see (2026-09-17). The mirror of
 * SavedExercisesService. The list is applied on the server, not in the
 * prompt: every catalog pool pull runs inside
 * `runWithExcludedExerciseIds`, so the model never sees a disliked lift,
 * no repair or swap can bring one back, and the replacement picker skips
 * them too. A disliked lift is a preference, not an injury: the
 * "working around" tags stay the way to gate by joint.
 */
@Injectable()
export class DislikedExercisesService {
  private readonly logger = new Logger(DislikedExercisesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getDislikedExerciseIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.dislikedExercise.findMany({
      where: { userId },
      select: { exerciseId: true },
    });
    return rows.map((r) => r.exerciseId);
  }

  async dislikeExercise(userId: string, exerciseId: string): Promise<void> {
    this.logger.debug(`dislikeExercise ${userId} ${exerciseId}`);
    await this.prisma.dislikedExercise.upsert({
      where: { userId_exerciseId: { userId, exerciseId } },
      create: { userId, exerciseId },
      update: {},
    });
  }

  async undislikeExercise(userId: string, exerciseId: string): Promise<void> {
    this.logger.debug(`undislikeExercise ${userId} ${exerciseId}`);
    await this.prisma.dislikedExercise.deleteMany({
      where: { userId, exerciseId },
    });
  }
}
