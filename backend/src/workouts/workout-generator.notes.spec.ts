import {
  BEGINNER_EXERCISE_NOTE_MAX_CHARS,
  normalizeExerciseNoteForOutput,
} from './workout-generator.service';

describe('normalizeExerciseNoteForOutput', () => {
  it('returns undefined when not wanted', () => {
    expect(normalizeExerciseNoteForOutput('hello', false)).toBeUndefined();
  });

  it('trims, collapses whitespace, and caps length for beginners', () => {
    const long = 'a'.repeat(BEGINNER_EXERCISE_NOTE_MAX_CHARS + 40);
    const out = normalizeExerciseNoteForOutput(`  foo \n bar  ${'x'.repeat(200)}`, true);
    expect(out!.length).toBe(BEGINNER_EXERCISE_NOTE_MAX_CHARS);
    expect(out!.startsWith('foo bar')).toBe(true);
  });
});
