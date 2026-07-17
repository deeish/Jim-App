import { Test, TestingModule } from '@nestjs/testing';
import { WorkoutLogsService } from './workout-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkoutsService } from '../workouts/workouts.service';

describe('WorkoutLogsService', () => {
  let service: WorkoutLogsService;
  const prismaMock = {
    workoutLog: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkoutLogsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: WorkoutsService, useValue: {} },
      ],
    }).compile();
    service = module.get(WorkoutLogsService);
  });

  describe('getLastPerformanceForExercises', () => {
    it('scans the recent-log window newest-first', async () => {
      (prismaMock.workoutLog.findMany as jest.Mock).mockResolvedValue([]);
      await service.getLastPerformanceForExercises('u1', ['bench_press']);
      const arg = (prismaMock.workoutLog.findMany as jest.Mock).mock
        .calls[0][0];
      expect(arg.where).toEqual({ userId: 'u1' });
      expect(arg.orderBy).toEqual({ startedAt: 'desc' });
      expect(arg.take).toBe(30);
      expect(arg.include).toEqual({
        entries: { include: { completedSets: true } },
      });
    });

    it('returns the most recent entry per exercise in a results envelope', async () => {
      (prismaMock.workoutLog.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'log-1',
          startedAt: new Date('2026-07-10T10:00:00Z'),
          entries: [
            {
              exerciseId: 'bench_press',
              completedSets: [
                { setNumber: 1, reps: 8, weight: 135, completed: true },
              ],
            },
          ],
        },
      ]);
      const out = await service.getLastPerformanceForExercises('u1', [
        'bench_press',
        'never_logged',
      ]);
      expect(out).toEqual({
        results: {
          bench_press: {
            workoutLogId: 'log-1',
            performedAt: new Date('2026-07-10T10:00:00Z'),
            sets: [{ setNumber: 1, reps: 8, weight: 135 }],
          },
        },
      });
    });

    it('skips the query when every requested id is untrackable', async () => {
      const out = await service.getLastPerformanceForExercises('u1', [
        'manual',
        'draft_abc',
        'applied_abc',
        'generated_abc',
        '',
      ]);
      expect(prismaMock.workoutLog.findMany).not.toHaveBeenCalled();
      expect(out).toEqual({ results: {} });
    });

    it('dedupes ids and caps the lookup at 50', async () => {
      const ids = Array.from({ length: 60 }, (_, i) => `ex${i}`);
      (prismaMock.workoutLog.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'log-1',
          startedAt: new Date('2026-07-10T10:00:00Z'),
          entries: [
            {
              // Past the cap after dedupe -> must not be looked up.
              exerciseId: 'ex55',
              completedSets: [
                { setNumber: 1, reps: 8, weight: 100, completed: true },
              ],
            },
            {
              exerciseId: 'ex0',
              completedSets: [
                { setNumber: 1, reps: 8, weight: 45, completed: true },
              ],
            },
          ],
        },
      ]);
      const out = await service.getLastPerformanceForExercises('u1', [
        ...ids,
        ...ids,
      ]);
      expect(prismaMock.workoutLog.findMany).toHaveBeenCalledTimes(1);
      expect(out.results.ex0).toBeDefined();
      expect(out.results.ex55).toBeUndefined();
    });
  });
});
