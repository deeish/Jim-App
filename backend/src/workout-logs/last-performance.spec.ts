import {
  bestCompletedSetByWeight,
  fetchLastEntriesForExercises,
  isTrackableExerciseId,
  pickLastEntriesForExercises,
  RECENT_LOGS_WINDOW,
  LogWithEntries,
} from './last-performance';
import { PrismaService } from '../prisma/prisma.service';

const set = (
  setNumber: number,
  reps: number,
  weight: number | null,
  completed = true,
) => ({ setNumber, reps, weight, completed });

const log = (
  id: string,
  startedAt: string,
  entries: LogWithEntries['entries'],
): LogWithEntries => ({ id, startedAt: new Date(startedAt), entries });

describe('isTrackableExerciseId', () => {
  it('accepts library ids', () => {
    expect(isTrackableExerciseId('bench_press')).toBe(true);
  });

  it.each(['', null, undefined, 'manual'])('rejects %p', (id) => {
    expect(isTrackableExerciseId(id as string | null | undefined)).toBe(false);
  });

  it.each(['draft_abc', 'applied_abc', 'generated_abc', 'Draft_ABC'])(
    'rejects synthetic prefix %s',
    (id) => {
      expect(isTrackableExerciseId(id)).toBe(false);
    },
  );
});

describe('pickLastEntriesForExercises', () => {
  it('returns the most recent entry per exercise with sets sorted by setNumber', () => {
    const logs = [
      log('log-new', '2026-07-10T10:00:00Z', [
        {
          exerciseId: 'bench_press',
          completedSets: [set(2, 8, 135), set(1, 8, 135), set(3, 6, 140)],
        },
      ]),
      log('log-old', '2026-07-03T10:00:00Z', [
        { exerciseId: 'bench_press', completedSets: [set(1, 5, 155)] },
      ]),
    ];
    const result = pickLastEntriesForExercises(logs, ['bench_press']);
    expect(result.get('bench_press')).toEqual({
      workoutLogId: 'log-new',
      performedAt: new Date('2026-07-10T10:00:00Z'),
      sets: [
        { setNumber: 1, reps: 8, weight: 135 },
        { setNumber: 2, reps: 8, weight: 135 },
        { setNumber: 3, reps: 6, weight: 140 },
      ],
    });
  });

  it('excludes uncompleted sets', () => {
    const logs = [
      log('log-1', '2026-07-10T10:00:00Z', [
        {
          exerciseId: 'back_squat',
          completedSets: [set(1, 5, 185), set(2, 5, 185, false)],
        },
      ]),
    ];
    const result = pickLastEntriesForExercises(logs, ['back_squat']);
    expect(result.get('back_squat')?.sets).toEqual([
      { setNumber: 1, reps: 5, weight: 185 },
    ]);
  });

  it('falls through to an older log when the newest entry has no completed sets', () => {
    const logs = [
      log('log-new', '2026-07-10T10:00:00Z', [
        { exerciseId: 'deadlift', completedSets: [set(1, 5, 225, false)] },
      ]),
      log('log-old', '2026-07-03T10:00:00Z', [
        { exerciseId: 'deadlift', completedSets: [set(1, 5, 205)] },
      ]),
    ];
    const result = pickLastEntriesForExercises(logs, ['deadlift']);
    expect(result.get('deadlift')?.workoutLogId).toBe('log-old');
  });

  it('omits ids with no logged history and tolerates duplicate requested ids', () => {
    const logs = [
      log('log-1', '2026-07-10T10:00:00Z', [
        { exerciseId: 'bench_press', completedSets: [set(1, 8, 135)] },
      ]),
    ];
    const result = pickLastEntriesForExercises(logs, [
      'bench_press',
      'bench_press',
      'never_logged',
    ]);
    expect(result.size).toBe(1);
    expect(result.has('never_logged')).toBe(false);
  });

  it('preserves null weights on bodyweight sets', () => {
    const logs = [
      log('log-1', '2026-07-10T10:00:00Z', [
        { exerciseId: 'push_up', completedSets: [set(1, 12, null)] },
      ]),
    ];
    const result = pickLastEntriesForExercises(logs, ['push_up']);
    expect(result.get('push_up')?.sets).toEqual([
      { setNumber: 1, reps: 12, weight: null },
    ]);
  });
});

describe('bestCompletedSetByWeight', () => {
  it('picks the heaviest set with its reps', () => {
    expect(
      bestCompletedSetByWeight([
        { setNumber: 1, reps: 8, weight: 135 },
        { setNumber: 2, reps: 6, weight: 140 },
        { setNumber: 3, reps: 10, weight: 120 },
      ]),
    ).toEqual({ weight: 140, reps: 6 });
  });

  it('keeps the earlier set on a weight tie', () => {
    expect(
      bestCompletedSetByWeight([
        { setNumber: 1, reps: 8, weight: 135 },
        { setNumber: 2, reps: 6, weight: 135 },
      ]),
    ).toEqual({ weight: 135, reps: 8 });
  });

  it('omits weight for bodyweight performances', () => {
    expect(
      bestCompletedSetByWeight([
        { setNumber: 1, reps: 12, weight: null },
        { setNumber: 2, reps: 10, weight: 0 },
      ]),
    ).toEqual({ weight: undefined, reps: 12 });
  });

  it('returns null for empty input', () => {
    expect(bestCompletedSetByWeight([])).toBeNull();
  });
});

describe('fetchLastEntriesForExercises', () => {
  it('queries the recent-log window newest-first', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([
        log('log-1', '2026-07-10T10:00:00Z', [
          { exerciseId: 'bench_press', completedSets: [set(1, 8, 135)] },
        ]),
      ]);
    const prisma = { workoutLog: { findMany } } as unknown as PrismaService;
    const result = await fetchLastEntriesForExercises(prisma, 'user-1', [
      'bench_press',
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { startedAt: 'desc' },
      take: RECENT_LOGS_WINDOW,
      include: { entries: { include: { completedSets: true } } },
    });
    expect(result.get('bench_press')?.workoutLogId).toBe('log-1');
  });

  it('skips the query entirely for an empty id list', async () => {
    const findMany = jest.fn();
    const prisma = { workoutLog: { findMany } } as unknown as PrismaService;
    const result = await fetchLastEntriesForExercises(prisma, 'user-1', []);
    expect(findMany).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });
});
