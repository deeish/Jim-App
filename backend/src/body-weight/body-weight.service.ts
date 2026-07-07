import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBodyWeightEntryDto } from './dto/create-body-weight-entry.dto';

@Injectable()
export class BodyWeightService {
  constructor(private readonly prisma: PrismaService) {}

  /** Record a weigh-in. The AuthGuard upserts the user, so the FK is always satisfied. */
  async create(userId: string, dto: CreateBodyWeightEntryDto) {
    const loggedAt = dto.loggedAt ? new Date(dto.loggedAt) : new Date();
    // One weigh-in per calendar day, keyed by the *user's* local day (sent by
    // the client) — bucketing by UTC day made a US evening entry replace the
    // previous local day's. UTC-day fallback covers clients that omit it.
    const dayKey = dto.dayKey ?? loggedAt.toISOString().slice(0, 10);
    const data = {
      weightLb: dto.weightLb,
      loggedAt,
      note: dto.note?.trim() || null,
    };
    return this.prisma.bodyWeightEntry.upsert({
      where: { userId_dayKey: { userId, dayKey } },
      create: { userId, dayKey, ...data },
      update: data,
    });
  }

  /**
   * Weigh-ins newest first; pass a positive limit to cap the result set.
   * Uncapped requests default to a year so the payload stays bounded as
   * history grows.
   */
  async findAll(userId: string, opts?: { limit?: number }) {
    const take =
      opts?.limit && opts.limit > 0 ? Math.min(opts.limit, 1000) : 365;
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
