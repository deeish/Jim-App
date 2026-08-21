import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Per-exercise slice of the user's real logged history. */
export interface LoggedExerciseStat {
  /** How many logged sessions included this exercise. */
  count: number;
  /** When it was last logged. */
  lastAt: Date;
}

/** exerciseId -> logged stats. Empty map = anonymous user or no history. */
export type UserTrainingHistory = Map<string, LoggedExerciseStat>;

/**
 * Mines the user's WorkoutLog entries into a per-exercise familiarity map for
 * the replace/add recommendation brain: which catalog exercises they have
 * actually trained, how often, and how recently. One grouped query per
 * suggestions request (the picker opens once per swap).
 */
@Injectable()
export class UserTrainingHistoryService {
  private readonly logger = new Logger(UserTrainingHistoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Never throws: recommendation ranking must degrade to context-blind, not
   * fail, when the DB is unavailable.
   */
  async historyFor(userId: string): Promise<UserTrainingHistory> {
    try {
      const rows = await this.prisma.workoutLogEntry.groupBy({
        by: ['exerciseId'],
        where: { workoutLog: { userId } },
        _count: { exerciseId: true },
        _max: { createdAt: true },
      });
      const history: UserTrainingHistory = new Map();
      for (const row of rows) {
        if (!row.exerciseId || !row._max.createdAt) continue;
        history.set(row.exerciseId, {
          count: row._count.exerciseId,
          lastAt: row._max.createdAt,
        });
      }
      return history;
    } catch (err) {
      this.logger.warn(
        `historyFor(${userId}) failed, ranking without history: ${String(err)}`,
      );
      return new Map();
    }
  }
}
