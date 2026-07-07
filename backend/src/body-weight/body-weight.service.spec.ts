import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BodyWeightService } from './body-weight.service';
import { PrismaService } from '../prisma/prisma.service';

describe('BodyWeightService', () => {
  let service: BodyWeightService;
  const prismaMock = {
    bodyWeightEntry: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BodyWeightService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = module.get(BodyWeightService);
  });

  it('create defaults loggedAt to now, derives a UTC dayKey, and trims the note', async () => {
    (prismaMock.bodyWeightEntry.upsert as jest.Mock).mockResolvedValue({
      id: 'w1',
    });
    await service.create('u1', { weightLb: 180.4, note: '  morning  ' });
    const arg = (prismaMock.bodyWeightEntry.upsert as jest.Mock).mock
      .calls[0][0];
    expect(arg.create.userId).toBe('u1');
    expect(arg.create.weightLb).toBe(180.4);
    expect(arg.create.note).toBe('morning');
    expect(arg.create.loggedAt).toBeInstanceOf(Date);
    expect(arg.create.dayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(arg.where.userId_dayKey.dayKey).toBe(arg.create.dayKey);
  });

  it('create stores null when the note is empty', async () => {
    (prismaMock.bodyWeightEntry.upsert as jest.Mock).mockResolvedValue({});
    await service.create('u1', { weightLb: 180, note: '   ' });
    const arg = (prismaMock.bodyWeightEntry.upsert as jest.Mock).mock
      .calls[0][0];
    expect(arg.create.note).toBeNull();
    expect(arg.update.note).toBeNull();
  });

  it("create keys the day by the client's local date, not the UTC date", async () => {
    (prismaMock.bodyWeightEntry.upsert as jest.Mock).mockResolvedValue({});
    // 9:30pm June 29 in New York is already June 30 in UTC — the entry must
    // still belong to (and replace) June 29.
    await service.create('u1', {
      weightLb: 182,
      loggedAt: '2026-06-30T01:30:00.000Z',
      dayKey: '2026-06-29',
    });
    const arg = (prismaMock.bodyWeightEntry.upsert as jest.Mock).mock
      .calls[0][0];
    expect(arg.where.userId_dayKey).toEqual({
      userId: 'u1',
      dayKey: '2026-06-29',
    });
    expect(arg.create.dayKey).toBe('2026-06-29');
    // A same-day re-log overwrites via the update branch.
    expect(arg.update.weightLb).toBe(182);
    expect(arg.update.loggedAt.toISOString()).toBe('2026-06-30T01:30:00.000Z');
  });

  it('create falls back to the UTC day when the client sends no dayKey', async () => {
    (prismaMock.bodyWeightEntry.upsert as jest.Mock).mockResolvedValue({});
    await service.create('u1', {
      weightLb: 182,
      loggedAt: '2026-06-29T15:30:00.000Z',
    });
    const arg = (prismaMock.bodyWeightEntry.upsert as jest.Mock).mock
      .calls[0][0];
    expect(arg.where.userId_dayKey.dayKey).toBe('2026-06-29');
  });

  it('findAll orders newest-first and caps the limit', async () => {
    (prismaMock.bodyWeightEntry.findMany as jest.Mock).mockResolvedValue([]);
    await service.findAll('u1', { limit: 99999 });
    const arg = (prismaMock.bodyWeightEntry.findMany as jest.Mock).mock
      .calls[0][0];
    expect(arg.where).toEqual({ userId: 'u1' });
    expect(arg.orderBy).toEqual({ loggedAt: 'desc' });
    expect(arg.take).toBe(1000);
  });

  it('findAll bounds uncapped requests to a year of entries', async () => {
    (prismaMock.bodyWeightEntry.findMany as jest.Mock).mockResolvedValue([]);
    await service.findAll('u1');
    const arg = (prismaMock.bodyWeightEntry.findMany as jest.Mock).mock
      .calls[0][0];
    expect(arg.take).toBe(365);
  });

  it('remove rejects an entry the user does not own', async () => {
    (prismaMock.bodyWeightEntry.findUnique as jest.Mock).mockResolvedValue({
      id: 'w1',
      userId: 'someone-else',
    });
    await expect(service.remove('u1', 'w1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prismaMock.bodyWeightEntry.delete).not.toHaveBeenCalled();
  });

  it('remove deletes an owned entry', async () => {
    (prismaMock.bodyWeightEntry.findUnique as jest.Mock).mockResolvedValue({
      id: 'w1',
      userId: 'u1',
    });
    const out = await service.remove('u1', 'w1');
    expect(prismaMock.bodyWeightEntry.delete).toHaveBeenCalledWith({
      where: { id: 'w1' },
    });
    expect(out).toEqual({ deleted: true });
  });
});
