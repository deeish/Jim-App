import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BodyWeightService } from './body-weight.service';
import { PrismaService } from '../prisma/prisma.service';

describe('BodyWeightService', () => {
  let service: BodyWeightService;
  const prismaMock = {
    bodyWeightEntry: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    // Mirror Prisma's array-form $transaction: run the prepared ops together.
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
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

  it('create defaults loggedAt to now and trims the note', async () => {
    (prismaMock.bodyWeightEntry.create as jest.Mock).mockResolvedValue({
      id: 'w1',
    });
    await service.create('u1', { weightLb: 180.4, note: '  morning  ' });
    const arg = (prismaMock.bodyWeightEntry.create as jest.Mock).mock
      .calls[0][0];
    expect(arg.data.userId).toBe('u1');
    expect(arg.data.weightLb).toBe(180.4);
    expect(arg.data.note).toBe('morning');
    expect(arg.data.loggedAt).toBeInstanceOf(Date);
  });

  it('create stores null when the note is empty', async () => {
    (prismaMock.bodyWeightEntry.create as jest.Mock).mockResolvedValue({});
    await service.create('u1', { weightLb: 180, note: '   ' });
    const arg = (prismaMock.bodyWeightEntry.create as jest.Mock).mock
      .calls[0][0];
    expect(arg.data.note).toBeNull();
  });

  it('create replaces any existing weigh-in on the same day', async () => {
    (prismaMock.bodyWeightEntry.create as jest.Mock).mockResolvedValue({});
    await service.create('u1', {
      weightLb: 182,
      loggedAt: '2026-06-29T15:30:00.000Z',
    });
    const delArg = (prismaMock.bodyWeightEntry.deleteMany as jest.Mock).mock
      .calls[0][0];
    expect(delArg.where.userId).toBe('u1');
    expect(delArg.where.loggedAt.gte.toISOString()).toBe(
      '2026-06-29T00:00:00.000Z',
    );
    expect(delArg.where.loggedAt.lt.toISOString()).toBe(
      '2026-06-30T00:00:00.000Z',
    );
    // delete-then-create ordering
    const delOrder = (prismaMock.bodyWeightEntry.deleteMany as jest.Mock).mock
      .invocationCallOrder[0];
    const createOrder = (prismaMock.bodyWeightEntry.create as jest.Mock).mock
      .invocationCallOrder[0];
    expect(delOrder).toBeLessThan(createOrder);
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
