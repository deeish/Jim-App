import {
  exerciseUsesTimeDisplay,
  formatRestSecondsForPreview,
  isTimeHoldExerciseName,
} from './exercisePrescription';

describe('exerciseUsesTimeDisplay (cardio fallback)', () => {
  it('returns true when prescriptionType is "time"', () => {
    expect(exerciseUsesTimeDisplay('time', 'Custom Drill')).toBe(true);
  });

  it('returns true for primaryMuscleGroup="Cardio" even without prescriptionType', () => {
    expect(exerciseUsesTimeDisplay(undefined, 'Treadmill Walk', 'Cardio')).toBe(
      true,
    );
  });

  it('detects treadmill-style modality names without catalog muscle metadata', () => {
    expect(
      exerciseUsesTimeDisplay(undefined, 'Treadmill Walk (Easy / Zone 2)', undefined),
    ).toBe(true);
  });

  it('returns false for a typical strength row (no cardio, not a hold)', () => {
    expect(exerciseUsesTimeDisplay(undefined, 'Bench Press', 'Chest')).toBe(
      false,
    );
  });

  it('still flags plank by name even when no prescriptionType is given', () => {
    expect(exerciseUsesTimeDisplay(undefined, 'Forearm Plank')).toBe(true);
  });
});

describe('isTimeHoldExerciseName', () => {
  it('matches dead hang and side plank, not a row variant', () => {
    expect(isTimeHoldExerciseName('Dead Hang')).toBe(true);
    expect(isTimeHoldExerciseName('Side Plank')).toBe(true);
    expect(isTimeHoldExerciseName('Side Plank Row')).toBe(false);
  });

  it('treats plank-HYBRID rep movements as reps, base planks as timed (backend parity)', () => {
    for (const name of [
      'Side Plank Clamshell',
      'Side Plank Hip Abduction',
      'Side Plank Hip Dip',
      'Plank Shoulder Tap',
      'Side Plank Knee Tuck',
      'High Plank Bird Dog',
      'Side Plank with Top-Leg Raise',
      'Plank Up-Down',
      'Walkout to Plank',
    ]) {
      expect(isTimeHoldExerciseName(name)).toBe(false);
    }
    for (const name of [
      'Front Plank',
      'Copenhagen Knee Plank',
      'RKC Plank',
      'Weighted Plank',
      'Star Side Plank',
    ]) {
      expect(isTimeHoldExerciseName(name)).toBe(true);
    }
  });
});

describe('formatRestSecondsForPreview', () => {
  it('renders sub-minute as "Ns"', () => {
    expect(formatRestSecondsForPreview(45)).toBe('45s');
  });

  it('renders exact minutes as "N min"', () => {
    expect(formatRestSecondsForPreview(60)).toBe('1 min');
    expect(formatRestSecondsForPreview(120)).toBe('2 min');
  });

  it('renders mixed minute+second as "Nm Ms"', () => {
    expect(formatRestSecondsForPreview(90)).toBe('1m 30s');
    expect(formatRestSecondsForPreview(150)).toBe('2m 30s');
  });

  it('handles zero / negative as "0s"', () => {
    expect(formatRestSecondsForPreview(0)).toBe('0s');
    expect(formatRestSecondsForPreview(-10)).toBe('0s');
  });
});
