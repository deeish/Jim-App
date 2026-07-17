import {
  formatSuggestionLine,
  isLowerBodyExercise,
  suggestNextTarget,
  SuggestNextTargetInput,
} from './nextTargetSuggestion';
import { kgToLb, roundLb } from './weightDisplay';

const base = (
  overrides: Partial<SuggestNextTargetInput>,
): SuggestNextTargetInput => ({
  lastSets: [],
  reps: 8,
  isTimeBased: false,
  isLowerBody: false,
  unit: 'lb',
  ...overrides,
});

describe('suggestNextTarget', () => {
  it('returns null for time-based rows and empty history', () => {
    expect(
      suggestNextTarget(
        base({ isTimeBased: true, lastSets: [{ reps: 45, weight: 50 }] }),
      ),
    ).toBeNull();
    expect(suggestNextTarget(base({ lastSets: [] }))).toBeNull();
  });

  it('returns null for an invalid rep floor', () => {
    expect(
      suggestNextTarget(base({ reps: 0, lastSets: [{ reps: 8, weight: 100 }] })),
    ).toBeNull();
  });

  it('suggests adding a rep for bodyweight history', () => {
    expect(
      suggestNextTarget(
        base({
          lastSets: [
            { reps: 8, weight: null },
            { reps: 10, weight: 0 },
          ],
        }),
      ),
    ).toEqual({
      kind: 'add_rep',
      weightLb: null,
      fromWeightLb: null,
      targetReps: 11,
    });
  });

  it('adds 5 lb for upper body when every working set hits the rep ceiling', () => {
    expect(
      suggestNextTarget(
        base({
          repsMin: 6,
          repsMax: 10,
          reps: 6,
          lastSets: [
            { reps: 10, weight: 135 },
            { reps: 10, weight: 135 },
          ],
        }),
      ),
    ).toEqual({
      kind: 'increase_weight',
      weightLb: 140,
      fromWeightLb: 135,
      targetReps: 6,
    });
  });

  it('adds 10 lb for lower body', () => {
    const out = suggestNextTarget(
      base({
        repsMin: 5,
        repsMax: 8,
        reps: 5,
        isLowerBody: true,
        lastSets: [{ reps: 8, weight: 225 }],
      }),
    );
    expect(out?.weightLb).toBe(235);
  });

  it('uses 2.5 kg / 5 kg increments for kg users', () => {
    const upper = suggestNextTarget(
      base({
        unit: 'kg',
        repsMin: 6,
        repsMax: 10,
        reps: 6,
        lastSets: [{ reps: 10, weight: kgToLb(100) }],
      }),
    );
    expect(upper?.weightLb).toBe(roundLb(kgToLb(100) + kgToLb(2.5)));
    const lower = suggestNextTarget(
      base({
        unit: 'kg',
        isLowerBody: true,
        repsMin: 6,
        repsMax: 10,
        reps: 6,
        lastSets: [{ reps: 10, weight: kgToLb(100) }],
      }),
    );
    expect(lower?.weightLb).toBe(roundLb(kgToLb(100) + kgToLb(5)));
  });

  it('ignores lighter back-off sets when judging progression', () => {
    expect(
      suggestNextTarget(
        base({
          repsMin: 6,
          repsMax: 10,
          reps: 6,
          lastSets: [
            { reps: 10, weight: 135 },
            { reps: 15, weight: 95 },
          ],
        }),
      )?.kind,
    ).toBe('increase_weight');
  });

  it('suggests a deload when a working set fell 3+ reps under the floor', () => {
    expect(
      suggestNextTarget(
        base({
          repsMin: 8,
          repsMax: 12,
          reps: 8,
          lastSets: [
            { reps: 8, weight: 135 },
            { reps: 4, weight: 135 },
          ],
        }),
      ),
    ).toEqual({
      kind: 'reduce_weight',
      weightLb: 120,
      fromWeightLb: 135,
      targetReps: 8,
    });
  });

  it('falls back to hold when a deload would round to nothing', () => {
    expect(
      suggestNextTarget(
        base({
          repsMin: 8,
          repsMax: 12,
          reps: 8,
          lastSets: [{ reps: 4, weight: 5 }],
        }),
      )?.kind,
    ).toBe('hold');
  });

  it('holds the weight when reps dipped just under the floor', () => {
    expect(
      suggestNextTarget(
        base({
          repsMin: 8,
          repsMax: 12,
          reps: 8,
          lastSets: [
            { reps: 8, weight: 135 },
            { reps: 7, weight: 135 },
          ],
        }),
      ),
    ).toEqual({
      kind: 'hold',
      weightLb: 135,
      fromWeightLb: 135,
      targetReps: 8,
    });
  });

  it('suggests one more rep inside the band, capped at the ceiling', () => {
    expect(
      suggestNextTarget(
        base({
          repsMin: 6,
          repsMax: 10,
          reps: 6,
          lastSets: [
            { reps: 8, weight: 135 },
            { reps: 7, weight: 135 },
          ],
        }),
      ),
    ).toEqual({
      kind: 'add_rep',
      weightLb: 135,
      fromWeightLb: 135,
      targetReps: 9,
    });
  });

  it('treats a legacy single-number prescription as a one-rep band', () => {
    expect(
      suggestNextTarget(
        base({ reps: 8, lastSets: [{ reps: 8, weight: 135 }] }),
      )?.kind,
    ).toBe('increase_weight');
  });
});

describe('isLowerBodyExercise', () => {
  it('trusts the muscle group when present', () => {
    expect(isLowerBodyExercise('Legs', 'Anything')).toBe(true);
    expect(isLowerBodyExercise('legs', 'Anything')).toBe(true);
    expect(isLowerBodyExercise('Chest', 'Bench Press')).toBe(false);
  });

  it('falls back to name heuristics when the group is missing', () => {
    expect(isLowerBodyExercise(undefined, 'Barbell Back Squat')).toBe(true);
    expect(isLowerBodyExercise(undefined, 'Romanian Deadlift')).toBe(true);
    expect(isLowerBodyExercise(undefined, 'Leg Press')).toBe(true);
    expect(isLowerBodyExercise(undefined, 'Walking Lunge')).toBe(true);
    expect(isLowerBodyExercise(undefined, 'Bench Press')).toBe(false);
    expect(isLowerBodyExercise(undefined, 'Lat Pulldown')).toBe(false);
  });
});

describe('formatSuggestionLine', () => {
  it('formats each suggestion kind in lb', () => {
    expect(
      formatSuggestionLine(
        {
          kind: 'increase_weight',
          weightLb: 140,
          fromWeightLb: 135,
          targetReps: 6,
        },
        'lb',
      ),
    ).toBe('Next: 140 lb × 6 (up 5 lb)');
    expect(
      formatSuggestionLine(
        {
          kind: 'reduce_weight',
          weightLb: 120,
          fromWeightLb: 135,
          targetReps: 8,
        },
        'lb',
      ),
    ).toBe('Next: 120 lb × 8 (deload)');
    expect(
      formatSuggestionLine(
        { kind: 'hold', weightLb: 135, fromWeightLb: 135, targetReps: 8 },
        'lb',
      ),
    ).toBe('Next: hold 135 lb, build to 8');
    expect(
      formatSuggestionLine(
        { kind: 'add_rep', weightLb: 135, fromWeightLb: 135, targetReps: 9 },
        'lb',
      ),
    ).toBe('Next: 135 lb × 9 (add a rep)');
    expect(
      formatSuggestionLine(
        { kind: 'add_rep', weightLb: null, fromWeightLb: null, targetReps: 11 },
        'lb',
      ),
    ).toBe('Next: aim 11 reps');
  });

  it('keeps half-kilo precision for kg users', () => {
    expect(
      formatSuggestionLine(
        {
          kind: 'increase_weight',
          weightLb: roundLb(kgToLb(102.5)),
          fromWeightLb: kgToLb(100),
          targetReps: 6,
        },
        'kg',
      ),
    ).toBe('Next: 102.5 kg × 6 (up 2.5 kg)');
  });

  it('returns null for a null suggestion', () => {
    expect(formatSuggestionLine(null, 'lb')).toBeNull();
  });
});
