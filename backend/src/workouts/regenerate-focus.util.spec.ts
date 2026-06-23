import { isRecognizedFocus, resolveRegenFocus } from './regenerate-focus.util';

describe('isRecognizedFocus', () => {
  it('accepts the real persisted plan titles', () => {
    // Actual titles from planPipeline strengthTitlesFromNormalizedSplitId +
    // the "Upper 1 / Upper 2" numbering for repeated splits in a week.
    expect(isRecognizedFocus('Push')).toBe(true);
    expect(isRecognizedFocus('Pull')).toBe(true);
    expect(isRecognizedFocus('Legs')).toBe(true);
    expect(isRecognizedFocus('Upper')).toBe(true);
    expect(isRecognizedFocus('Lower')).toBe(true);
    expect(isRecognizedFocus('Upper 1')).toBe(true);
    expect(isRecognizedFocus('Lower 2')).toBe(true);
    expect(isRecognizedFocus('Full Body')).toBe(true);
  });

  it('rejects display detail lines and empty values', () => {
    expect(isRecognizedFocus('45 min · Strength · 5 exercises')).toBe(false);
    expect(isRecognizedFocus('30 min · Cardio · 4 exercises')).toBe(true); // cardio is a real focus
    expect(isRecognizedFocus('')).toBe(false);
    expect(isRecognizedFocus(null)).toBe(false);
    expect(isRecognizedFocus(undefined)).toBe(false);
  });
});

describe('resolveRegenFocus', () => {
  it('uses the day title, not the detail-line focus column (push-day bug)', () => {
    // Regression: plan-linked workouts store the detail line in `focus`; the title is
    // the real focus. Previously this returned the detail line → full-body pool.
    expect(resolveRegenFocus('Push', '45 min · Strength · 5 exercises')).toBe(
      'Push',
    );
    // Numbered repeats (e.g. two upper days in a week) still resolve.
    expect(
      resolveRegenFocus('Upper 2', '50 min · Strength · 6 exercises'),
    ).toBe('Upper 2');
  });

  it('falls back to focus column when title is not a recognized focus', () => {
    expect(resolveRegenFocus('My Custom Session', 'Legs')).toBe('Legs');
  });

  it('handles standalone workouts where focus is null', () => {
    expect(resolveRegenFocus('Pull', null)).toBe('Pull');
  });

  it('returns the title even when nothing is a recognized focus', () => {
    expect(resolveRegenFocus('Leg Day Killer', null)).toBe('Leg Day Killer');
  });

  it('defaults to full body when there is nothing usable', () => {
    expect(resolveRegenFocus('', '')).toBe('full body');
    expect(resolveRegenFocus(null, undefined)).toBe('full body');
  });
});
