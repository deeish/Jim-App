import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UsersService', () => {
  let service: UsersService;
  const prismaMock = {
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        workoutPlan: { deleteMany: jest.fn() },
        workout: { deleteMany: jest.fn() },
        user: { delete: jest.fn() },
      }),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it('exportUserData throws when user missing', async () => {
    (prismaMock.user.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.exportUserData('u1')).rejects.toThrow(
      'User not found',
    );
  });

  it('exportUserData returns bundle with version', async () => {
    (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u1',
      email: 'a@b.c',
      workoutPlans: [],
      workouts: [],
      workoutLogs: [],
      savedWorkouts: [],
      savedExercises: [],
    });
    const out = await service.exportUserData('u1');
    expect(out.exportVersion).toBe(1);
    expect(out.user.id).toBe('u1');
  });
});
