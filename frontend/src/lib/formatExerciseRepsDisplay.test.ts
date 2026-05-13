import { formatExerciseRepsDisplay } from './formatExerciseRepsDisplay';

describe('formatExerciseRepsDisplay (cardio modality without DB muscle metadata)', () => {
  it('treats treadmill names + duration seconds like preview/card catalog rows', () => {
    expect(formatExerciseRepsDisplay('Treadmill Walk (Easy / Zone 2)', 600, 'balanced')).toBe(
      '10 min',
    );
  });
});
