import {
  bestWeightedSetOfSession,
  collectSessionAchievements,
  formatAchievementDetail,
  formatAchievementLabel,
  summarizeSessionTotals,
} from './sessionAchievements';
import type {
  Exercise,
  ExerciseSession,
  LastExercisePerformance,
  LastPerformanceMap,
  PersonalBest,
  PersonalBestMap,
} from '../types/workout';

const exercise = (name: string, exerciseId?: string): Exercise => ({
  name,
  sets: 3,
  reps: 8,
  exerciseId,
});

const session = (
  name: string,
  exerciseId: string | undefined,
  sets: Array<{ reps: number; weight?: number; completed?: boolean }>,
  opts: { skipped?: boolean } = {},
): ExerciseSession => ({
  exerciseIndex: 0,
  exercise: exercise(name, exerciseId),
  skipped: opts.skipped,
  completedSets: sets.map((s, i) => ({
    setNumber: i + 1,
    reps: s.reps,
    weight: s.weight,
    completed: s.completed ?? true,
  })),
});

const perf = (
  sets: Array<{ reps: number; weight: number | null }>,
): LastExercisePerformance => ({
  workoutLogId: 'log-1',
  performedAt: '2026-07-20T12:00:00.000Z',
  sets: sets.map((s, i) => ({ setNumber: i + 1, reps: s.reps, weight: s.weight })),
});

const record = (weightLb: number, reps = 5): PersonalBest => ({
  weightLb,
  reps,
  performedAt: '2026-01-05T12:00:00.000Z',
});

const NO_LAST: LastPerformanceMap = {};
const NO_BESTS: PersonalBestMap = {};

describe('bestWeightedSetOfSession', () => {
  it('picks the heaviest completed set', () => {
    const es = session('Bench Press', 'ex-bench', [
      { reps: 8, weight: 135 },
      { reps: 6, weight: 155 },
      { reps: 8, weight: 145 },
    ]);
    expect(bestWeightedSetOfSession(es)).toEqual({ weightLb: 155, reps: 6 });
  });

  it('breaks ties on weight by preferring more reps', () => {
    const es = session('Bench Press', 'ex-bench', [
      { reps: 5, weight: 135 },
      { reps: 9, weight: 135 },
      { reps: 7, weight: 135 },
    ]);
    expect(bestWeightedSetOfSession(es)).toEqual({ weightLb: 135, reps: 9 });
  });

  it('ignores sets that were never completed', () => {
    const es = session('Bench Press', 'ex-bench', [
      { reps: 8, weight: 135 },
      { reps: 1, weight: 500, completed: false },
    ]);
    expect(bestWeightedSetOfSession(es)).toEqual({ weightLb: 135, reps: 8 });
  });

  it('returns null for a bodyweight exercise', () => {
    const es = session('Push-up', 'ex-pushup', [{ reps: 20 }, { reps: 18 }]);
    expect(bestWeightedSetOfSession(es)).toBeNull();
  });
});

describe('summarizeSessionTotals', () => {
  it('counts completed sets, exercises and volume', () => {
    const totals = summarizeSessionTotals([
      session('Bench Press', 'ex-bench', [
        { reps: 8, weight: 100 },
        { reps: 8, weight: 100 },
      ]),
      session('Row', 'ex-row', [{ reps: 10, weight: 50 }]),
    ]);
    expect(totals).toEqual({
      completedSets: 3,
      exercisesWorked: 2,
      volumeLb: 2100,
      hasWeightedWork: true,
    });
  });

  it('excludes skipped exercises entirely', () => {
    const totals = summarizeSessionTotals([
      session('Bench Press', 'ex-bench', [{ reps: 8, weight: 100 }]),
      session('Row', 'ex-row', [{ reps: 10, weight: 500 }], { skipped: true }),
    ]);
    expect(totals.completedSets).toBe(1);
    expect(totals.exercisesWorked).toBe(1);
    expect(totals.volumeLb).toBe(800);
  });

  it('excludes sets the user never completed', () => {
    const totals = summarizeSessionTotals([
      session('Bench Press', 'ex-bench', [
        { reps: 8, weight: 100 },
        { reps: 8, weight: 100, completed: false },
      ]),
    ]);
    expect(totals.completedSets).toBe(1);
    expect(totals.volumeLb).toBe(800);
  });

  it('reports no weighted work for a bodyweight-only session', () => {
    const totals = summarizeSessionTotals([
      session('Push-up', 'ex-pushup', [{ reps: 20 }, { reps: 15 }]),
      session('Plank', 'ex-plank', [{ reps: 60 }]),
    ]);
    expect(totals.hasWeightedWork).toBe(false);
    expect(totals.volumeLb).toBe(0);
    // The session still happened — these are the numbers the screen leads with.
    expect(totals.completedSets).toBe(3);
    expect(totals.exercisesWorked).toBe(2);
  });

  it('does not count an exercise with zero completed sets as worked', () => {
    const totals = summarizeSessionTotals([
      session('Bench Press', 'ex-bench', [{ reps: 8, weight: 100 }]),
      session('Row', 'ex-row', [{ reps: 10, weight: 50, completed: false }]),
    ]);
    expect(totals.exercisesWorked).toBe(1);
    expect(totals.completedSets).toBe(1);
  });
});

describe('collectSessionAchievements', () => {
  it('celebrates a personal best when the all-time record is broken', () => {
    const found = collectSessionAchievements(
      [session('Bench Press', 'ex-bench', [{ reps: 5, weight: 145 }])],
      { 'ex-bench': perf([{ reps: 5, weight: 140 }]) },
      { 'ex-bench': record(140) },
    );
    expect(found).toEqual([
      {
        exerciseId: 'ex-bench',
        exerciseName: 'Bench Press',
        kind: 'personal-best',
        weightLb: 145,
        reps: 5,
        previousLb: 140,
        gainLb: 5,
      },
    ]);
  });

  // The finding this whole design turns on: the last-performance map only
  // covers the 30 most recent logs, so beating it says nothing about an
  // all-time record. Someone who benched 225 six months ago and hits 140 today
  // must never be told they set a PR.
  it('does not call a lift a personal best just because it beat last time', () => {
    const found = collectSessionAchievements(
      [session('Bench Press', 'ex-bench', [{ reps: 5, weight: 140 }])],
      { 'ex-bench': perf([{ reps: 5, weight: 135 }]) },
      { 'ex-bench': record(225) },
    );
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe('beat-last-time');
    expect(found[0].previousLb).toBe(135);
  });

  it('claims nothing when there is no prior weighted history to beat', () => {
    const found = collectSessionAchievements(
      [session('Bench Press', 'ex-bench', [{ reps: 5, weight: 315 }])],
      NO_LAST,
      NO_BESTS,
    );
    expect(found).toEqual([]);
  });

  it('does not celebrate matching a record', () => {
    const found = collectSessionAchievements(
      [session('Bench Press', 'ex-bench', [{ reps: 8, weight: 140 }])],
      { 'ex-bench': perf([{ reps: 5, weight: 140 }]) },
      { 'ex-bench': record(140, 5) },
    );
    expect(found).toEqual([]);
  });

  it('reports a broken record once, not also as beating last time', () => {
    const found = collectSessionAchievements(
      [session('Bench Press', 'ex-bench', [{ reps: 3, weight: 200 }])],
      { 'ex-bench': perf([{ reps: 5, weight: 150 }]) },
      { 'ex-bench': record(185) },
    );
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe('personal-best');
    expect(found[0].previousLb).toBe(185);
  });

  it('ignores skipped exercises', () => {
    const found = collectSessionAchievements(
      [
        session('Bench Press', 'ex-bench', [{ reps: 5, weight: 145 }], {
          skipped: true,
        }),
      ],
      { 'ex-bench': perf([{ reps: 5, weight: 100 }]) },
      { 'ex-bench': record(140) },
    );
    expect(found).toEqual([]);
  });

  it('ignores bodyweight work, which sets no load record', () => {
    const found = collectSessionAchievements(
      [session('Push-up', 'ex-pushup', [{ reps: 40 }])],
      { 'ex-pushup': perf([{ reps: 20, weight: null }]) },
      NO_BESTS,
    );
    expect(found).toEqual([]);
  });

  it('ignores exercises with no library id', () => {
    const found = collectSessionAchievements(
      [session('Some hand-added lift', undefined, [{ reps: 5, weight: 200 }])],
      NO_LAST,
      NO_BESTS,
    );
    expect(found).toEqual([]);
  });

  // Placeholder ids are filtered server-side, so they are simply absent from
  // both maps — and a claim always needs a prior number, which is what keeps
  // them out of the highlight list.
  it('ignores generated placeholder ids, which carry no history', () => {
    const found = collectSessionAchievements(
      [session('Generated Row', 'generated_abc_1', [{ reps: 5, weight: 200 }])],
      NO_LAST,
      NO_BESTS,
    );
    expect(found).toEqual([]);
  });

  it('puts personal bests first, then the biggest gains', () => {
    const found = collectSessionAchievements(
      [
        session('Row', 'ex-row', [{ reps: 8, weight: 110 }]),
        session('Squat', 'ex-squat', [{ reps: 5, weight: 250 }]),
        session('Curl', 'ex-curl', [{ reps: 10, weight: 45 }]),
      ],
      {
        'ex-row': perf([{ reps: 8, weight: 100 }]),
        'ex-squat': perf([{ reps: 5, weight: 225 }]),
        'ex-curl': perf([{ reps: 10, weight: 40 }]),
      },
      {
        // Row beat last time but not its record; squat and curl set records.
        'ex-row': record(135),
        'ex-squat': record(245),
        'ex-curl': record(35),
      },
    );
    // Row has the largest raw gain but is the smaller claim, so it ranks last.
    expect(
      found.map((a) => [a.exerciseName, a.kind, a.gainLb]),
    ).toEqual([
      ['Curl', 'personal-best', 10],
      ['Squat', 'personal-best', 5],
      ['Row', 'beat-last-time', 10],
    ]);
  });

  it('keeps workout order when gains tie', () => {
    const found = collectSessionAchievements(
      [
        session('Squat', 'ex-squat', [{ reps: 5, weight: 250 }]),
        session('Curl', 'ex-curl', [{ reps: 10, weight: 45 }]),
      ],
      NO_LAST,
      { 'ex-squat': record(245), 'ex-curl': record(40) },
    );
    expect(found.map((a) => a.exerciseName)).toEqual(['Squat', 'Curl']);
  });
});

describe('achievement formatting', () => {
  const achievement = collectSessionAchievements(
    [session('Bench Press', 'ex-bench', [{ reps: 5, weight: 140 }])],
    NO_LAST,
    { 'ex-bench': record(135) },
  )[0];

  it('labels each kind plainly', () => {
    expect(formatAchievementLabel('personal-best')).toBe('Personal best');
    expect(formatAchievementLabel('beat-last-time')).toBe('Beat last time');
  });

  it('shows what was lifted and what it beat', () => {
    expect(formatAchievementDetail(achievement, 'lb')).toBe(
      '5×140 lb · up from 135 lb',
    );
  });

  it('converts to kg for kg users', () => {
    expect(formatAchievementDetail(achievement, 'kg')).toBe(
      '5×64 kg · up from 61 kg',
    );
  });
});
