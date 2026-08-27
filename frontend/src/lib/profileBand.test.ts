import type { WorkoutLog } from '../types/workout';
import type { BodyWeightEntry } from '../services/bodyWeightService';
import {
  mostTrainedExercises,
  monthLabel,
  overallWeightDelta,
  pickBestLifts,
  resolveProfileBand,
  weeklyWeightSeries,
  weighInDelta30,
  weighInsWithin,
} from './profileBand';

const NOW = new Date(2026, 3, 6, 12, 0, 0); // Monday Apr 6, 2026 (local)

describe('resolveProfileBand', () => {
  const base = {
    secondaryGoal: null,
    hasLiftRecords: true,
    weighInsLast30: 0,
    hasAnyWeighIn: true,
  } as const;

  it('rule 1: lift goals lead with lifts, weight collapses to a row', () => {
    for (const goal of ['Strength', 'Hypertrophy'] as const) {
      expect(resolveProfileBand({ ...base, goal })).toEqual({
        lead: 'lifts',
        second: 'weightRow',
        caption: 'trainingSince',
      });
    }
  });

  it('rule 1: fat loss leads with the weight card, lifts demote to a strip', () => {
    expect(resolveProfileBand({ ...base, goal: 'Fat loss' })).toEqual({
      lead: 'weight',
      second: 'liftsStrip',
      caption: 'weightDelta',
    });
  });

  it('rule 1: neutral goals defer to behavior, tie goes to lifts', () => {
    expect(resolveProfileBand({ ...base, goal: 'General fitness' }).lead).toBe('lifts');
    expect(
      resolveProfileBand({ ...base, goal: 'Endurance', weighInsLast30: 2 }).lead,
    ).toBe('weight');
  });

  it('rule 2: a fat-loss secondary goal adds the weight card under the lifts', () => {
    expect(
      resolveProfileBand({ ...base, goal: 'Hypertrophy', secondaryGoal: 'Fat loss' }),
    ).toEqual({ lead: 'lifts', second: 'weightCard', caption: 'trainingSince' });
  });

  it('rule 3: recent weigh-ins promote the weight card even for a lifter', () => {
    expect(
      resolveProfileBand({ ...base, goal: 'Strength', weighInsLast30: 2 }).second,
    ).toBe('weightCard');
  });

  it('rule 4: no weigh-ins ever means never a weight card', () => {
    expect(
      resolveProfileBand({ ...base, goal: 'Fat loss', hasAnyWeighIn: false }),
    ).toEqual({ lead: 'lifts', second: 'weightRow', caption: 'trainingSince' });
    expect(
      resolveProfileBand({
        ...base,
        goal: 'Strength',
        weighInsLast30: 3,
        hasAnyWeighIn: false,
      }).second,
    ).toBe('weightRow');
  });

  it('rule 4: no lift records means no lifts module in any form', () => {
    expect(
      resolveProfileBand({ ...base, goal: 'Fat loss', hasLiftRecords: false }),
    ).toEqual({ lead: 'weight', second: null, caption: 'weightDelta' });
    // Lifter with no records but an active weight habit still gets real content.
    expect(
      resolveProfileBand({
        ...base,
        goal: 'Strength',
        hasLiftRecords: false,
        weighInsLast30: 1,
      }).lead,
    ).toBe('weight');
  });

  it('degrades to just the row when there is no data at all', () => {
    expect(
      resolveProfileBand({
        goal: 'Hypertrophy',
        secondaryGoal: null,
        hasLiftRecords: false,
        weighInsLast30: 0,
        hasAnyWeighIn: false,
      }),
    ).toEqual({ lead: null, second: 'weightRow', caption: 'trainingSince' });
  });
});

describe('mostTrainedExercises / pickBestLifts', () => {
  const log = (startedAt: string, entries: Array<[string | null, string | null, number]>): WorkoutLog =>
    ({
      id: startedAt,
      workoutId: 'w',
      startedAt,
      completedAt: startedAt,
      totalTimeSeconds: null,
      totalSets: null,
      totalVolume: null,
      overallNotes: null,
      workout: { id: 'w', name: 'W', exercises: [] } as never,
      entries: entries.map(([exerciseId, name, sets], i) => ({
        id: `${startedAt}-${i}`,
        exerciseId: exerciseId as string,
        name,
        orderIndex: i,
        notes: null,
        completedSets: Array.from({ length: sets }, (_, s) => ({
          setNumber: s + 1,
          reps: 8,
          weight: 100,
          completed: true,
        })),
      })),
    }) as WorkoutLog;

  it('ranks by session count, then total sets, and keeps the newest name', () => {
    const ranked = mostTrainedExercises([
      log('2026-04-01T10:00:00.000Z', [['bench', 'Bench Press (old)', 3], ['row', 'Barbell Row', 3]]),
      log('2026-04-03T10:00:00.000Z', [['bench', 'Bench Press', 4]]),
      log('2026-04-05T10:00:00.000Z', [['squat', 'Back Squat', 5]]),
    ]);
    expect(ranked.map((r) => r.exerciseId)).toEqual(['bench', 'squat', 'row']);
    expect(ranked[0]).toEqual({ exerciseId: 'bench', name: 'Bench Press', sessions: 2 });
  });

  it('skips untrackable ids and counts one session per log', () => {
    const ranked = mostTrainedExercises([
      log('2026-04-01T10:00:00.000Z', [
        ['manual', 'Mystery', 3],
        ['', null, 3],
        ['bench', 'Bench Press', 2],
        ['bench', 'Bench Press', 2],
      ]),
    ]);
    expect(ranked).toEqual([{ exerciseId: 'bench', name: 'Bench Press', sessions: 1 }]);
  });

  it('pickBestLifts drops movements with no weighted record', () => {
    const ranked = [
      { exerciseId: 'pullup', name: 'Pull-Up', sessions: 9 },
      { exerciseId: 'bench', name: 'Bench Press', sessions: 5 },
      { exerciseId: 'squat', name: 'Back Squat', sessions: 4 },
    ];
    const bests = {
      bench: { weightLb: 185, reps: 5, performedAt: '2026-03-01T10:00:00.000Z' },
      squat: { weightLb: 225, reps: 4, performedAt: '2026-03-02T10:00:00.000Z' },
    };
    expect(pickBestLifts(ranked, bests, 3).map((l) => l.exerciseId)).toEqual([
      'bench',
      'squat',
    ]);
  });
});

describe('body weight math', () => {
  const entry = (loggedAt: string, weightLb: number): BodyWeightEntry => ({
    id: loggedAt,
    weightLb,
    loggedAt,
    dayKey: loggedAt.slice(0, 10),
    note: null,
    createdAt: loggedAt,
  });

  const entries = [
    entry('2026-01-05T10:00:00.000Z', 178.5),
    entry('2026-03-20T10:00:00.000Z', 174),
    entry('2026-04-05T10:00:00.000Z', 172.5),
  ];

  it('counts weigh-ins inside a window', () => {
    expect(weighInsWithin(entries, 30, NOW)).toBe(2);
    expect(weighInsWithin(entries, 7, NOW)).toBe(1);
  });

  it('30-day delta needs two points in the window, regardless of input order', () => {
    expect(weighInDelta30([...entries].reverse(), NOW)).toBeCloseTo(-1.5);
    expect(weighInDelta30(entries.slice(2), NOW)).toBeNull();
    expect(weighInDelta30([], NOW)).toBeNull();
  });

  it('overall delta runs newest minus first-ever with the journey start', () => {
    expect(overallWeightDelta([...entries].reverse())).toEqual({
      deltaLb: -6,
      sinceIso: '2026-01-05T10:00:00.000Z',
    });
    expect(overallWeightDelta(entries.slice(0, 1))).toBeNull();
  });

  it('weekly series carries the last known weight forward and leads with nulls', () => {
    const series = weeklyWeightSeries(entries, 4, NOW);
    expect(series).toHaveLength(4);
    expect(series[0]).toBe(178.5); // mid-March: January entry carried forward
    expect(series[2]).toBe(174); // after Mar 20
    expect(series[3]).toBe(172.5); // this week
    expect(weeklyWeightSeries([], 4, NOW)).toEqual([null, null, null, null]);
  });
});

describe('monthLabel', () => {
  it('names the month, adding the year only when it differs', () => {
    expect(monthLabel('2026-03-20T10:00:00.000Z', NOW)).toBe('March');
    expect(monthLabel('2025-11-02T10:00:00.000Z', NOW)).toBe('November 2025');
    expect(monthLabel('garbage', NOW)).toBe('');
  });
});
