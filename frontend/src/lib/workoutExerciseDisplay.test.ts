import { formatExercisePrescriptionBulleted, formatExercisePrescriptionCompact } from './workoutExerciseDisplay';

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
