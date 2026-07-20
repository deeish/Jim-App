import {
  applyLastPerformancePrefill,
  formatLastTimeLine,
  lastTopWeightLb,
} from './lastPerformanceDisplay';
import type {
  ExerciseSession,
  LastExercisePerformance,
} from '../types/workout';

const perf = (
  sets: Array<{ setNumber: number; reps: number; weight: number | null }>,
  performedAt = '2026-07-10T12:00:00.000Z',
): LastExercisePerformance => ({
  workoutLogId: 'log-1',
  performedAt,
  sets,
});

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const JUL10 = dateLabel('2026-07-10T12:00:00.000Z');

describe('formatLastTimeLine', () => {
  it('formats weighted sets as reps×weight in lb', () => {
    const line = formatLastTimeLine(
      perf([
        { setNumber: 1, reps: 8, weight: 135 },
        { setNumber: 2, reps: 8, weight: 135 },
        { setNumber: 3, reps: 6, weight: 140 },
      ]),
      'lb',
      false,
    );
    expect(line).toBe(`Last time (${JUL10}): 8×135 lb, 8×135 lb, 6×140 lb`);
  });

  it('converts to kg for kg users', () => {
    const line = formatLastTimeLine(
      perf([{ setNumber: 1, reps: 5, weight: 220.46226218 }]),
      'kg',
      false,
    );
    expect(line).toBe(`Last time (${JUL10}): 5×100 kg`);
  });

  it('shows a dash for unweighted sets mixed into a weighted performance', () => {
    const line = formatLastTimeLine(
      perf([
        { setNumber: 1, reps: 8, weight: 135 },
        { setNumber: 2, reps: 12, weight: null },
      ]),
      'lb',
      false,
    );
    expect(line).toBe(`Last time (${JUL10}): 8×135 lb, 12×—`);
  });

  it('formats all-bodyweight performances as plain reps', () => {
    const line = formatLastTimeLine(
      perf([
        { setNumber: 1, reps: 8, weight: null },
        { setNumber: 2, reps: 9, weight: 0 },
        { setNumber: 3, reps: 10, weight: null },
      ]),
      'lb',
      false,
    );
    expect(line).toBe(`Last time (${JUL10}): 8, 9, 10 reps`);
  });

  it('formats time-based rows as durations, keeping load when present', () => {
    const line = formatLastTimeLine(
      perf([
        { setNumber: 1, reps: 45, weight: 50 },
        { setNumber: 2, reps: 120, weight: null },
      ]),
      'lb',
      true,
    );
    expect(line).toBe(`Last time (${JUL10}): 45s @ 50 lb, 2 min`);
  });

  it('suppresses implausible durations on time rows (legacy cardio rep counts)', () => {
    expect(
      formatLastTimeLine(perf([{ setNumber: 1, reps: 1, weight: null }]), 'lb', true),
    ).toBeNull();
    expect(
      formatLastTimeLine(
        perf([
          { setNumber: 1, reps: 10, weight: null },
          { setNumber: 2, reps: 45, weight: null },
        ]),
        'lb',
        true,
      ),
    ).toBe(`Last time (${JUL10}): 45s`);
  });

  it('returns null for missing or empty performances and bad dates', () => {
    expect(formatLastTimeLine(undefined, 'lb', false)).toBeNull();
    expect(formatLastTimeLine(perf([]), 'lb', false)).toBeNull();
    expect(
      formatLastTimeLine(
        perf([{ setNumber: 1, reps: 8, weight: 100 }], 'not-a-date'),
        'lb',
        false,
      ),
    ).toBeNull();
  });
});

describe('lastTopWeightLb', () => {
  it('returns the heaviest completed weight', () => {
    expect(
      lastTopWeightLb(
        perf([
          { setNumber: 1, reps: 8, weight: 135 },
          { setNumber: 2, reps: 6, weight: 140 },
        ]),
      ),
    ).toBe(140);
  });

  it('returns null when no set carries weight', () => {
    expect(
      lastTopWeightLb(perf([{ setNumber: 1, reps: 12, weight: null }])),
    ).toBeNull();
    expect(lastTopWeightLb(undefined)).toBeNull();
  });
});

describe('applyLastPerformancePrefill', () => {
  const makeSession = (
    overrides: Partial<ExerciseSession['exercise']> = {},
    sets?: ExerciseSession['completedSets'],
    skipped = false,
  ): ExerciseSession => ({
    exerciseIndex: 0,
    exercise: {
      name: 'Bench Press',
      sets: 2,
      reps: 8,
      exerciseId: 'bench_press',
      ...overrides,
    },
    completedSets: sets ?? [
      { setNumber: 1, reps: 8, completed: false },
      { setNumber: 2, reps: 8, completed: false },
    ],
    skipped,
  });

  const benchPerf = {
    bench_press: perf([{ setNumber: 1, reps: 8, weight: 135 }]),
  };

  it('fills unweighted incomplete sets with the last top weight', () => {
    const out = applyLastPerformancePrefill([makeSession()], benchPerf);
    expect(out[0].completedSets.map((s) => s.weight)).toEqual([135, 135]);
  });

  it('leaves completed and already-edited sets alone', () => {
    const out = applyLastPerformancePrefill(
      [
        makeSession({}, [
          { setNumber: 1, reps: 8, weight: 100, completed: true },
          { setNumber: 2, reps: 8, weight: 125, completed: false },
          { setNumber: 3, reps: 8, completed: false },
        ]),
      ],
      benchPerf,
    );
    expect(out[0].completedSets.map((s) => s.weight)).toEqual([100, 125, 135]);
  });

  it('skips weighted prescriptions, time rows, skipped and unlinkable exercises', () => {
    const sessions = [
      makeSession({ weight: 95 }),
      makeSession({ name: 'Front Plank', exerciseId: 'front_plank' }),
      makeSession({}, undefined, true),
      makeSession({ exerciseId: 'draft_123' }),
      makeSession({ exerciseId: undefined }),
    ];
    const map = {
      ...benchPerf,
      front_plank: perf([{ setNumber: 1, reps: 45, weight: 10 }]),
      draft_123: perf([{ setNumber: 1, reps: 8, weight: 50 }]),
    };
    const out = applyLastPerformancePrefill(sessions, map);
    expect(out).toBe(sessions);
  });

  it('skips exercises without history or with bodyweight-only history', () => {
    const sessions = [
      makeSession({ exerciseId: 'never_logged' }),
      makeSession({ exerciseId: 'push_up', name: 'Push-Up' }),
    ];
    const out = applyLastPerformancePrefill(sessions, {
      push_up: perf([{ setNumber: 1, reps: 12, weight: null }]),
    });
    expect(out).toBe(sessions);
  });

  it('returns the same reference when nothing changes', () => {
    const sessions = [
      makeSession({}, [{ setNumber: 1, reps: 8, weight: 125, completed: false }]),
    ];
    expect(applyLastPerformancePrefill(sessions, benchPerf)).toBe(sessions);
  });
});
