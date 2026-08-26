import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export type AccountDeletionResult = {
  /** False if `SUPABASE_SERVICE_ROLE_KEY` was not set or admin delete failed. */
  supabaseAuthDeleted: boolean;
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Sync the client-held display name / avatar id onto the User row. */
  async updateProfile(
    userId: string,
    fields: { name?: string; avatarId?: string },
  ): Promise<{ ok: true }> {
    const data: { name?: string; avatarId?: string } = {};
    if (fields.name !== undefined) data.name = fields.name.trim() || undefined;
    if (fields.avatarId !== undefined) data.avatarId = fields.avatarId;
    if (Object.keys(data).length > 0) {
      await this.prisma.user.update({ where: { id: userId }, data });
    }
    return { ok: true };
  }

  /** Full GDPR-style JSON export of app-persisted data for the user. */
  async exportUserData(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        workoutPlans: {
          include: {
            planWorkouts: {
              include: { exercises: true },
              orderBy: [
                { weekNumber: 'asc' },
                { dayOfWeek: 'asc' },
                { orderInDay: 'asc' },
              ],
            },
          },
        },
        workouts: {
          include: {
            exercises: { orderBy: { orderIndex: 'asc' } },
          },
          orderBy: { createdAt: 'desc' },
        },
        workoutLogs: {
          include: {
            entries: {
              include: {
                completedSets: { orderBy: { setNumber: 'asc' } },
              },
              orderBy: { orderIndex: 'asc' },
            },
            workout: true,
          },
          orderBy: { startedAt: 'desc' },
        },
        savedWorkouts: {
          include: {
            workout: {
              include: { exercises: { orderBy: { orderIndex: 'asc' } } },
            },
          },
        },
        savedExercises: { orderBy: { createdAt: 'desc' } },
        bodyWeightEntries: { orderBy: { loggedAt: 'desc' } },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      exportVersion: 1 as const,
      exportedAt: new Date().toISOString(),
      user,
    };
  }

  /**
   * Deletes all app data for the user, then removes the Supabase Auth user when
   * `SUPABASE_SERVICE_ROLE_KEY` is configured (required for a complete account deletion).
   */
  async deleteUserAccount(userId: string): Promise<AccountDeletionResult> {
    await this.prisma.$transaction(async (tx) => {
      await tx.workoutPlan.deleteMany({ where: { userId } });
      await tx.workout.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    });

    const supabaseAuthDeleted =
      await this.deleteSupabaseAuthUserIfConfigured(userId);

    return { supabaseAuthDeleted };
  }

  private async deleteSupabaseAuthUserIfConfigured(
    userId: string,
  ): Promise<boolean> {
    const baseUrl = this.config
      .get<string>('SUPABASE_URL')
      ?.replace(/\/+$/, '');
    const serviceRole = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    if (!baseUrl || !serviceRole?.trim()) {
      this.logger.warn(
        'SUPABASE_SERVICE_ROLE_KEY not set — database data was removed but the Auth user may still exist. Set the service role key on the server for full account deletion.',
      );
      return false;
    }

    const url = `${baseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`;
    try {
      const res = await fetch(url, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${serviceRole}`,
          apikey: serviceRole,
        },
      });
      if (res.ok || res.status === 404) {
        return true;
      }
      const text = await res.text().catch(() => '');
      this.logger.error(
        `Supabase admin delete failed: HTTP ${res.status} ${text}`,
      );
      return false;
    } catch (e) {
      this.logger.error('Supabase admin delete request failed', e);
      return false;
    }
  }
}
