import { formatExerciseRepsDisplay, formatRepRange } from './formatExerciseRepsDisplay';

describe('formatExerciseRepsDisplay (cardio modality without DB muscle metadata)', () => {
  it('treats treadmill names + duration seconds like preview/card catalog rows', () => {
    expect(formatExerciseRepsDisplay('Treadmill Walk (Easy / Zone 2)', 600, 'balanced')).toBe(
      '10 min',
    );
  });
});

describe('formatRepRange (stored role-aware range)', () => {
  it('renders a min–max range', () => {
    expect(formatRepRange(8, 12)).toBe('8–12');
  });

  it('collapses to a single number when min === max', () => {
    expect(formatRepRange(5, 5)).toBe('5');
  });

  it('uses min alone when max is missing', () => {
    expect(formatRepRange(6, undefined)).toBe('6');
  });

  it('returns null when there is no usable range (legacy rows fall back)', () => {
    expect(formatRepRange(undefined, undefined)).toBeNull();
    expect(formatRepRange(null, 12)).toBeNull();
  });

  it('never inverts a backwards range', () => {
    expect(formatRepRange(12, 8)).toBe('12');
  });
});
