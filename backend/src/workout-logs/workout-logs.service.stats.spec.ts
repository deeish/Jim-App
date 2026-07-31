import { Test, TestingModule } from '@nestjs/testing';
import { WorkoutLogsService } from './workout-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkoutsService } from '../workouts/workouts.service';
import { STATS_DEFAULT_MONTHS, STATS_MAX_MONTHS } from './progress-stats';

describe('WorkoutLogsService progress reads', () => {
  let service: WorkoutLogsService;
  const prismaMock = {
    workoutLog: { findMany: jest.fn() },
    workoutLogEntry: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.workoutLog.findMany.mockResolvedValue([]);
    prismaMock.workoutLogEntry.findMany.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkoutLogsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: WorkoutsService, useValue: {} },
      ],
    }).compile();
    service = module.get(WorkoutLogsService);
  });

  const statsArg = () => prismaMock.workoutLog.findMany.mock.calls[0][0];
  const bestsArg = () => prismaMock.workoutLogEntry.findMany.mock.calls[0][0];

  describe('getStats', () => {
    it('scopes to the user and a startedAt range, newest first', async () => {
      await service.getStats('u1');
      const arg = statsArg();
      expect(arg.where.userId).toBe('u1');
      expect(arg.where.startedAt.gte).toBeInstanceOf(Date);
      expect(arg.orderBy).toEqual({ startedAt: 'desc' });
    });

    // Guard for the "don't reuse findAll" rule: findAll eagerly includes
    // entries -> completedSets, which across a year of history would pull
    // every set of every workout.
    it('uses a narrow projection with no entries or sets', async () => {
      await service.getStats('u1');
      const arg = statsArg();
      expect(arg.include).toBeUndefined();
      expect(arg.select).toBeDefined();
      expect(arg.select.entries).toBeUndefined();
      expect(arg.select.completedSets).toBeUndefined();
      expect(arg.select.workout).toEqual({ select: { name: true } });
    });

    // Guard for the streak-truncation rule: the window is a date range, so a
    // streak longer than any log count still reports its true length.
    it('bounds by date range only, never by log count', async () => {
      await service.getStats('u1');
      expect(statsArg().take).toBeUndefined();
    });

    // Service-level clamp only. Over HTTP an out-of-range `months` is rejected
    // with a 400 by StatsQueryDto before it gets here (verified live) — don't
    // "fix" the DTO to match this; the two layers differ on purpose.
    it('defaults the window and clamps a direct caller', async () => {
      expect((await service.getStats('u1')).months).toBe(STATS_DEFAULT_MONTHS);
      expect((await service.getStats('u1', 999)).months).toBe(STATS_MAX_MONTHS);
      expect((await service.getStats('u1', 0)).months).toBe(1);
    });

    it('returns a zeroed envelope for a user with no history', async () => {
      const res = await service.getStats('u1');
      expect(res.sessions).toEqual([]);
      expect(res.totals.sessionCount).toBe(0);
      expect(res.rangeStart).toEqual(expect.any(String));
    });

    // Two sessions on one calendar day is legitimate; nothing here collapses
    // them, and the client buckets by its own local day.
    it('returns every session on a day rather than collapsing them', async () => {
      prismaMock.workoutLog.findMany.mockResolvedValue([
        {
          id: 'log-2',
          startedAt: new Date('2026-07-27T23:30:00Z'),
          completedAt: new Date('2026-07-28T00:10:00Z'),
          totalTimeSeconds: 2400,
          totalSets: 12,
          totalVolume: 6000,
          workout: { name: 'Evening' },
        },
        {
          id: 'log-1',
          startedAt: new Date('2026-07-27T14:00:00Z'),
          completedAt: new Date('2026-07-27T15:00:00Z'),
          totalTimeSeconds: 3600,
          totalSets: 20,
          totalVolume: 12000,
          workout: { name: 'Morning' },
        },
      ]);
      const res = await service.getStats('u1');
      expect(res.sessions).toHaveLength(2);
      expect(res.totals.sessionCount).toBe(2);
      expect(res.totals.totalSets).toBe(32);
      // Raw instants survive — no server-side day bucketing.
      expect(res.sessions[0].startedAt).toEqual(
        new Date('2026-07-27T23:30:00Z'),
      );
    });

    // A user whose program window has ended still has history; stats must not
    // depend on an active plan the way the home week-dots helper does.
    it('does not consult any plan', async () => {
      prismaMock.workoutLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          startedAt: new Date('2026-02-01T10:00:00Z'),
          completedAt: null,
          totalTimeSeconds: null,
          totalSets: 8,
          totalVolume: null,
          workout: { name: 'Ad-hoc session' },
        },
      ]);
      const res = await service.getStats('u1');
      expect(res.totals.sessionCount).toBe(1);
      expect(res.sessions[0].workoutName).toBe('Ad-hoc session');
      expect(res.totals.sessionsWithVolume).toBe(0);
    });
  });

  describe('getExerciseHistory', () => {
    // Two queries: the log-id query picks which sessions, the entry query
    // fetches their rows. `logIdArg` inspects the first, `entryArg` the second
    // — tests that reach the entry query must first give the log-id query
    // something to return.
    const logIdArg = () => prismaMock.workoutLog.findMany.mock.calls[0][0];
    const entryArg = () => prismaMock.workoutLogEntry.findMany.mock.calls[0][0];

    it('scopes to the user and exercise, newest session first', async () => {
      prismaMock.workoutLog.findMany.mockResolvedValue([{ id: 'log-1' }]);
      await service.getExerciseHistory('u1', 'bench_press');
      const logArg = logIdArg();
      expect(logArg.where.userId).toBe('u1');
      expect(logArg.where.entries.some.exerciseId).toBe('bench_press');
      expect(logArg.orderBy).toEqual({ startedAt: 'desc' });
      const arg = entryArg();
      expect(arg.where.exerciseId).toBe('bench_press');
      expect(arg.where.workoutLog).toEqual({ userId: 'u1' });
      expect(arg.orderBy).toEqual({ workoutLog: { startedAt: 'desc' } });
    });

    it('returns only completed sets, in set order', async () => {
      prismaMock.workoutLog.findMany.mockResolvedValue([{ id: 'log-1' }]);
      const arg = await service
        .getExerciseHistory('u1', 'bench_press')
        .then(() => entryArg());
      expect(arg.select.completedSets.where).toEqual({ completed: true });
      expect(arg.select.completedSets.orderBy).toEqual({ setNumber: 'asc' });
    });

    // Bounded by sessions of THIS lift, not by a window of recent logs: a lift
    // trained monthly would fall out of a 30-log window entirely. And the
    // bound sits on distinct logs, never on entry rows — a lift performed in
    // two slots of one workout writes two rows per session, so a `take` on
    // rows would silently halve the history or cut a session mid-pair.
    it('bounds by session count for this exercise, not entry rows', async () => {
      prismaMock.workoutLog.findMany.mockResolvedValue([{ id: 'log-1' }]);
      await service.getExerciseHistory('u1', 'bench_press', 5);
      expect(logIdArg().take).toBe(5);
      const arg = entryArg();
      expect(arg.take).toBeUndefined();
      expect(arg.where.workoutLogId).toEqual({ in: ['log-1'] });
    });

    it('clamps an absurd limit rather than trusting it', async () => {
      await service.getExerciseHistory('u1', 'bench_press', 100000);
      expect(logIdArg().take).toBe(50);
    });

    // Excluded in the queries rather than afterwards. An exercise the user
    // started but logged no set for is still written as an entry (only skipped
    // ones are left out): on the log-id query it must not burn one of the
    // `limit` session slots, and on the entry query it must not ride in beside
    // a real slot as an empty `sets` row.
    it('excludes entries with no completed sets in the queries themselves', async () => {
      prismaMock.workoutLog.findMany.mockResolvedValue([{ id: 'log-1' }]);
      await service.getExerciseHistory('u1', 'bench_press');
      expect(logIdArg().where.entries.some.completedSets).toEqual({
        some: { completed: true },
      });
      expect(entryArg().where.completedSets).toEqual({
        some: { completed: true },
      });
    });

    // Asking unconditionally must be safe: the caller should not have to know
    // whether an id is a placeholder before requesting its history.
    it('returns an empty history for untrackable ids without querying', async () => {
      for (const id of ['manual', 'generated_abc_1', 'draft_x', 'applied_y']) {
        jest.clearAllMocks();
        const res = await service.getExerciseHistory('u1', id);
        expect(prismaMock.workoutLog.findMany).not.toHaveBeenCalled();
        expect(prismaMock.workoutLogEntry.findMany).not.toHaveBeenCalled();
        expect(res).toEqual({ exerciseId: id, best: null, sessions: [] });
      }
    });

    it('trims the requested id', async () => {
      await service.getExerciseHistory('u1', '  bench_press  ');
      expect(logIdArg().where.entries.some.exerciseId).toBe('bench_press');
    });
  });

  describe('getPersonalBests', () => {
    it('drops untrackable ids and de-duplicates', async () => {
      await service.getPersonalBests('u1', [
        'bench_press',
        'bench_press',
        'manual',
        'generated_abc_1',
        'draft_x',
        'applied_y',
      ]);
      expect(bestsArg().where.exerciseId.in).toEqual(['bench_press']);
    });

    it('scopes to the requesting user through the log relation', async () => {
      await service.getPersonalBests('u1', ['bench_press']);
      expect(bestsArg().where.workoutLog).toEqual({ userId: 'u1' });
    });

    // The whole point of a separate read: a personal best reduced over a
    // bounded recent window is a recent best, not a personal best.
    it('is unbounded by log count', async () => {
      await service.getPersonalBests('u1', ['bench_press']);
      expect(bestsArg().take).toBeUndefined();
    });

    it('selects only what the reducer needs and only completed sets', async () => {
      await service.getPersonalBests('u1', ['bench_press']);
      const arg = bestsArg();
      expect(arg.select.completedSets.where).toEqual({ completed: true });
      expect(arg.select.completedSets.select).toEqual({
        weight: true,
        reps: true,
      });
    });

    it('skips the query entirely when nothing trackable remains', async () => {
      const res = await service.getPersonalBests('u1', ['manual']);
      expect(prismaMock.workoutLogEntry.findMany).not.toHaveBeenCalled();
      expect(res).toEqual({ results: {} });
    });

    it('returns a keyed results envelope', async () => {
      prismaMock.workoutLogEntry.findMany.mockResolvedValue([
        {
          exerciseId: 'bench_press',
          workoutLog: { startedAt: new Date('2026-01-05T10:00:00Z') },
          completedSets: [
            { weight: 185, reps: 5 },
            { weight: 225, reps: 3 },
          ],
        },
      ]);
      const res = await service.getPersonalBests('u1', ['bench_press']);
      expect(res.results.bench_press).toEqual({
        weightLb: 225,
        reps: 3,
        performedAt: new Date('2026-01-05T10:00:00Z'),
      });
    });
  });
});
