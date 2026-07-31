import { isLinkableLibraryExerciseId } from './exerciseNavigation';

describe('isLinkableLibraryExerciseId', () => {
  it('accepts real library ids', () => {
    expect(isLinkableLibraryExerciseId('flat_barbell_bench_press')).toBe(true);
    expect(isLinkableLibraryExerciseId('pull_up_pronated')).toBe(true);
  });

  it('rejects generator placeholders', () => {
    expect(isLinkableLibraryExerciseId('draft_abc')).toBe(false);
    expect(isLinkableLibraryExerciseId('applied_abc')).toBe(false);
    expect(isLinkableLibraryExerciseId('generated_pw123_0')).toBe(false);
    // The prefixes are matched case-insensitively.
    expect(isLinkableLibraryExerciseId('Generated_pw123_0')).toBe(false);
  });

  // 'manual' is the log service's fallback for an entry saved without a library
  // id. It has no detail page, so routing to it would open a dead screen.
  it("rejects the log service's 'manual' fallback", () => {
    expect(isLinkableLibraryExerciseId('manual')).toBe(false);
  });

  it('rejects empty, blank and absent ids', () => {
    expect(isLinkableLibraryExerciseId('')).toBe(false);
    expect(isLinkableLibraryExerciseId('   ')).toBe(false);
    expect(isLinkableLibraryExerciseId(null)).toBe(false);
    expect(isLinkableLibraryExerciseId(undefined)).toBe(false);
  });

  it('trims before judging', () => {
    expect(isLinkableLibraryExerciseId('  manual  ')).toBe(false);
    expect(isLinkableLibraryExerciseId('  squat  ')).toBe(true);
  });

  it('does not reject ids that merely contain a placeholder word', () => {
    // Only a prefix disqualifies, so a real lift named like one is still fine.
    expect(isLinkableLibraryExerciseId('manual_resistance_curl')).toBe(true);
    expect(isLinkableLibraryExerciseId('band_generated_pull')).toBe(true);
  });
});
