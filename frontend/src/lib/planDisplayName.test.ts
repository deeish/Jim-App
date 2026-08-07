import { formatPlanDisplayName } from './planDisplayName';

describe('formatPlanDisplayName', () => {
  it('rewrites the generated machine pattern into people-speak', () => {
    expect(formatPlanDisplayName('Strength · 4d/wk · 1 wk')).toBe(
      'Strength · 4 days a week',
    );
    expect(formatPlanDisplayName('Hypertrophy · 3d/wk · 4 wks')).toBe(
      'Hypertrophy · 3 days a week',
    );
    // Goal labels can carry punctuation of their own.
    expect(formatPlanDisplayName('Balanced (Strength + Cardio) · 5d/wk · 2 wks')).toBe(
      'Balanced (Strength + Cardio) · 5 days a week',
    );
  });

  it('singularizes one training day', () => {
    expect(formatPlanDisplayName('Strength · 1d/wk · 1 wk')).toBe(
      'Strength · 1 day a week',
    );
  });

  it('passes template and custom names through verbatim', () => {
    expect(formatPlanDisplayName('Strength · Upper/Lower')).toBe('Strength · Upper/Lower');
    expect(formatPlanDisplayName('My summer block')).toBe('My summer block');
  });

  it('falls back for missing names', () => {
    expect(formatPlanDisplayName(null)).toBe('My Plan');
    expect(formatPlanDisplayName('  ')).toBe('My Plan');
  });
});
