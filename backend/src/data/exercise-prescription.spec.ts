import {
  inferPrescriptionTypeFromExerciseName,
  inferPrescriptionTypeFromRawExercise,
} from './exercise-prescription';

describe('inferPrescriptionTypeFromRawExercise (cardio gate)', () => {
  it('returns "time" when primaryMuscleGroup is Cardio (post-transform name)', () => {
    expect(
      inferPrescriptionTypeFromRawExercise({
        name: 'Stationary Bike',
        primaryMuscleGroup: 'Cardio',
      }),
    ).toBe('time');
  });

  it('returns "time" when raw primaryMuscleGroupId starts with "cardio"', () => {
    expect(
      inferPrescriptionTypeFromRawExercise({
        name: 'Echo Bike',
        primaryMuscleGroupId: 'cardio_endurance',
      }),
    ).toBe('time');
  });

  it('still respects an explicit prescriptionType="reps" on a cardio row', () => {
    expect(
      inferPrescriptionTypeFromRawExercise({
        name: 'Burpees',
        primaryMuscleGroup: 'Cardio',
        prescriptionType: 'reps',
      }),
    ).toBe('reps');
  });

  it('returns "reps" for a typical strength row with no cardio signals', () => {
    expect(
      inferPrescriptionTypeFromRawExercise({
        name: 'Flat Barbell Bench Press',
        primaryMuscleGroup: 'Chest',
      }),
    ).toBe('reps');
  });

  it('still flags hold-style names as time even when primary is not Cardio', () => {
    expect(
      inferPrescriptionTypeFromRawExercise({
        name: 'Forearm Plank',
        primaryMuscleGroup: 'Core',
      }),
    ).toBe('time');
  });

  it('flags "… static hold" style isometrics as time (no time metadata on the row)', () => {
    expect(
      inferPrescriptionTypeFromRawExercise({
        name: 'Barbell Static Hold',
        primaryMuscleGroup: 'Back',
      }),
    ).toBe('time');
  });
});

describe('inferPrescriptionTypeFromExerciseName (name-only fallback)', () => {
  it('returns "time" for plank and dead hang', () => {
    expect(inferPrescriptionTypeFromExerciseName('Forearm Plank')).toBe('time');
    expect(inferPrescriptionTypeFromExerciseName('Dead Hang')).toBe('time');
  });

  it('returns "reps" for compound presses and rows', () => {
    expect(inferPrescriptionTypeFromExerciseName('Barbell Row')).toBe('reps');
    expect(inferPrescriptionTypeFromExerciseName('Bench Press')).toBe('reps');
  });
});
