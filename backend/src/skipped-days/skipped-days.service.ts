import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Server-persisted "skipped day" marks. A skip is a deliberate rest: it syncs
 * across the user's devices and reads as REST (never a miss) to their crew.
 * Every operation is idempotent — skips are toggled from gesture-y UI.
 */
@Injectable()
export class SkippedDaysService {
  constructor(private readonly prisma: PrismaService) {}

  private assertDateIso(dateIso: string): void {
    if (!DATE_ISO.test(dateIso)) {
      throw new BadRequestException('dateIso must be YYYY-MM-DD');
    }
  }

  async list(userId: string, from?: string, to?: string): Promise<string[]> {
    if (from) this.assertDateIso(from);
    if (to) this.assertDateIso(to);
    const rows = await this.prisma.skippedDay.findMany({
      where: {
        userId,
        ...(from || to
          ? {
              dateIso: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      select: { dateIso: true },
      orderBy: { dateIso: 'asc' },
    });
    return rows.map((r) => r.dateIso);
  }

  async skip(userId: string, dateIso: string): Promise<void> {
    this.assertDateIso(dateIso);
    try {
      await this.prisma.skippedDay.create({ data: { userId, dateIso } });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return; // already skipped — idempotent
      }
      throw err;
    }
  }

  async unskip(userId: string, dateIso: string): Promise<void> {
    this.assertDateIso(dateIso);
    await this.prisma.skippedDay.deleteMany({ where: { userId, dateIso } });
  }

  /** Applying a new plan invalidates FUTURE skips (they described the old
   *  schedule); the past keeps its history. */
  async clearFrom(userId: string, fromIso: string): Promise<void> {
    this.assertDateIso(fromIso);
    await this.prisma.skippedDay.deleteMany({
      where: { userId, dateIso: { gte: fromIso } },
    });
  }
}
