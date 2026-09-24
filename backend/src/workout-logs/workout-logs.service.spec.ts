import { Test, TestingModule } from '@nestjs/testing';
import {
  WORKOUT_LOG_PAGE_MAX,
  WorkoutLogsService,
} from './workout-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkoutsService } from '../workouts/workouts.service';
import { ExercisesService } from '../exercises/exercises.service';

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
        { provide: ExercisesService, useValue: {} },
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

describe('WorkoutLogsService findAll bounds', () => {
  let service: WorkoutLogsService;
  let prismaMock: {
    workoutLog: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prismaMock = { workoutLog: { findMany: jest.fn().mockResolvedValue([]) } };
    const moduleRef = await Test.createTestingModule({
      providers: [
        WorkoutLogsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: WorkoutsService, useValue: {} },
        { provide: ExercisesService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(WorkoutLogsService);
  });

  const arg = () => prismaMock.workoutLog.findMany.mock.calls[0][0];

  it('caps every response, however wide the window', () => {
    // The include drags every entry and completed set along, so one row is
    // never one row — an unbounded call is a multi-megabyte response.
    void service.findAll('u1', { from: '2000-01-01', to: '2030-01-01' });
    expect(arg().take).toBe(WORKOUT_LOG_PAGE_MAX);
  });

  it('defaults an unwindowed request to the last year', () => {
    // `GET /api/workout-logs` with no params used to mean "everything".
    void service.findAll('u1');
    const gte = arg().where.startedAt.gte as Date;
    const yearAgo = new Date();
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    expect(Math.abs(gte.getTime() - yearAgo.getTime())).toBeLessThan(60_000);
  });

  it('leaves an explicit window alone', () => {
    void service.findAll('u1', { from: '2026-08-01', to: '2026-08-31' });
    const w = arg().where.startedAt;
    expect(w.gte).toEqual(new Date('2026-08-01'));
    expect(w.lte.getHours()).toBe(23); // end-of-day inclusive
  });

  describe('updateSets (#57: correcting a logged session)', () => {
    let svc: WorkoutLogsService;
    const p = {
      workoutLog: { findFirst: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(),
    };
    beforeEach(async () => {
      jest.clearAllMocks();
      const moduleRef = await Test.createTestingModule({
        providers: [
          WorkoutLogsService,
          { provide: PrismaService, useValue: p },
          { provide: WorkoutsService, useValue: {} },
          { provide: ExercisesService, useValue: {} },
        ],
      }).compile();
      svc = moduleRef.get(WorkoutLogsService);
    });
    const dto = {
      entries: [
        {
          exerciseId: 'flat_barbell_bench_press',
          name: 'Flat Barbell Bench Press',
          orderIndex: 0,
          sets: [
            { setNumber: 1, reps: 8, weight: 135, completed: true },
            { setNumber: 2, reps: 10, weight: 135, completed: true },
            { setNumber: 3, reps: 6, weight: 145, completed: false },
          ],
        },
        {
          name: 'Dead Hang',
          orderIndex: 1,
          sets: [{ setNumber: 1, reps: 45, completed: true }],
        },
      ],
    };

    it('refuses a log the user does not own', async () => {
      p.workoutLog.findFirst.mockResolvedValue(null);
      await expect(svc.updateSets('log-1', dto, 'u1')).rejects.toThrow(
        'Workout log with ID log-1 not found',
      );
      expect(p.$transaction).not.toHaveBeenCalled();
    });

    it('replaces the entries and recomputes the totals from the completed sets', async () => {
      p.workoutLog.findFirst.mockResolvedValue({ id: 'log-1' });
      const tx = {
        workoutLogEntry: {
          deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
        workoutLog: { update: jest.fn().mockResolvedValue({ id: 'log-1' }) },
      };
      p.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) =>
        fn(tx),
      );
      const out = await svc.updateSets('log-1', dto, 'u1');
      expect(out).toEqual({ id: 'log-1' });
      expect(tx.workoutLogEntry.deleteMany).toHaveBeenCalledWith({
        where: { workoutLogId: 'log-1' },
      });
      const update = tx.workoutLog.update.mock.calls[0][0];
      // 8×135 + 10×135 = 2430; the uncompleted third set and the bodyweight hang add nothing
      expect(update.data.totalSets).toBe(3);
      expect(update.data.totalVolume).toBe(2430);
      const created = update.data.entries.create;
      expect(created[0].exerciseId).toBe('flat_barbell_bench_press');
      expect(created[0].completedSets.create).toHaveLength(2);
      expect(created[1].exerciseId).toBe('manual');
      expect(created[1].completedSets.create[0]).toMatchObject({
        reps: 45,
        completed: true,
      });
      expect(update.include).toEqual({
        entries: { include: { completedSets: true } },
        workout: true,
      });
    });
  });
});
