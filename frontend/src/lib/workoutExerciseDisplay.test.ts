import {
  formatExercisePrescriptionBulleted,
  formatExercisePrescriptionCompact,
  formatPlanTargetRepDisplay,
} from './workoutExerciseDisplay';

describe('workoutExerciseDisplay (cardio seconds persisted without muscle metadata)', () => {
  const treadmillRow = {
    name: 'Treadmill Walk (Easy / Zone 2)',
    sets: 1,
    reps: 600,
    primaryMuscleGroup: undefined as string | undefined,
    prescriptionType: undefined as undefined,
  };

  it('compact row shows minutes for machine cardio finisher', () => {
    expect(formatExercisePrescriptionCompact(treadmillRow, 'balanced')).toBe('1 × 10 min');
  });

  it('bulleted detail matches preview-style duration wording', () => {
    expect(formatExercisePrescriptionBulleted({ ...treadmillRow, weight: undefined }, 'balanced', 'lb')).toBe(
      '1 set · 10 min',
    );
  });
});

describe('workoutExerciseDisplay (stored rep range == preview == live)', () => {
  const benchRow = {
    name: 'Barbell Bench Press',
    sets: 4,
    reps: 8,
    repsMin: 8,
    repsMax: 12,
    primaryMuscleGroup: 'Chest',
    prescriptionType: 'reps' as const,
  };

  it('compact row shows the stored range, not the working scalar', () => {
    expect(formatExercisePrescriptionCompact(benchRow, 'balanced')).toBe('4 × 8–12');
  });

  it('plan target header shows the stored range', () => {
    expect(formatPlanTargetRepDisplay(benchRow, 'balanced')).toBe('8–12');
  });

  it('bulleted detail appends "reps" to the range', () => {
    expect(
      formatExercisePrescriptionBulleted({ ...benchRow, weight: undefined }, 'balanced', 'lb'),
    ).toBe('4 sets · 8–12 reps');
  });

  it('falls back to the single value when no range is stored (legacy rows)', () => {
    const legacy = { name: 'Some Lift', sets: 3, reps: 10, primaryMuscleGroup: 'Back' };
    expect(formatExercisePrescriptionCompact(legacy, 'balanced')).toBe('3 × 10');
    expect(formatPlanTargetRepDisplay(legacy, 'balanced')).toBe('10');
  });
});

describe('workoutExerciseDisplay (the preview draws the aim like the applied plan)', () => {
  const base = {
    name: 'Flat Barbell Bench Press',
    sets: 4,
    prescriptionType: 'reps' as const,
    primaryMuscleGroup: 'Chest',
    durationSeconds: undefined,
  };
  it('compact row appends the aim when the working reps sit inside the band', () => {
    expect(
      formatExercisePrescriptionCompact({ ...base, reps: 10, repsMin: 8, repsMax: 12 }, 'balanced'),
    ).toBe('4 × 8–12 · aim 10');
  });
  it('no aim at the bottom of the band, outside it, or without a band', () => {
    expect(
      formatExercisePrescriptionCompact({ ...base, reps: 8, repsMin: 8, repsMax: 12 }, 'balanced'),
    ).toBe('4 × 8–12');
    expect(
      formatExercisePrescriptionCompact({ ...base, reps: 15, repsMin: 8, repsMax: 12 }, 'balanced'),
    ).toBe('4 × 8–12');
    expect(
      formatExercisePrescriptionCompact({ ...base, reps: 10, repsMin: undefined, repsMax: undefined }, 'balanced'),
    ).toBe('4 × 10');
  });
});
