import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBodyWeightEntryDto } from './dto/create-body-weight-entry.dto';

@Injectable()
export class BodyWeightService {
  private readonly logger = new Logger(BodyWeightService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Record a weigh-in. The AuthGuard upserts the user, so the FK is always satisfied. */
  async create(userId: string, dto: CreateBodyWeightEntryDto) {
    const loggedAt = dto.loggedAt ? new Date(dto.loggedAt) : new Date();
    // One weigh-in per calendar day: a new entry on the same day replaces the
    // earlier one, so the trend stays one point per day.
    const dayStart = new Date(
      Date.UTC(
        loggedAt.getUTCFullYear(),
        loggedAt.getUTCMonth(),
        loggedAt.getUTCDate(),
      ),
    );
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    // Clear the day then insert atomically, so a mid-operation failure can never
    // leave the day with its old entry deleted and no replacement.
    const [, created] = await this.prisma.$transaction([
      this.prisma.bodyWeightEntry.deleteMany({
        where: { userId, loggedAt: { gte: dayStart, lt: dayEnd } },
      }),
      this.prisma.bodyWeightEntry.create({
        data: {
          userId,
          weightLb: dto.weightLb,
          loggedAt,
          note: dto.note?.trim() || null,
        },
      }),
    ]);
    return created;
  }

  /** Weigh-ins newest first; pass a positive limit to cap the result set. */
  async findAll(userId: string, opts?: { limit?: number }) {
    const take =
      opts?.limit && opts.limit > 0 ? Math.min(opts.limit, 1000) : undefined;
    return this.prisma.bodyWeightEntry.findMany({
      where: { userId },
      orderBy: { loggedAt: 'desc' },
      take,
    });
  }

  async remove(userId: string, id: string): Promise<{ deleted: true }> {
    const existing = await this.prisma.bodyWeightEntry.findUnique({
      where: { id },
    });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Weigh-in not found');
    }
    await this.prisma.bodyWeightEntry.delete({ where: { id } });
    return { deleted: true };
  }
}
