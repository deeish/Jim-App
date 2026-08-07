import { formatPlanDisplayName } from './planDisplayName';

describe('formatPlanDisplayName', () => {
  it('reduces generated machine names to the goal — the only part that cannot rot', () => {
    // "4 days a week" would lie as soon as the user edits the plan; the day
    // list below the title is the live truth, so the title claims nothing.
    expect(formatPlanDisplayName('Strength · 4d/wk · 1 wk')).toBe('Strength Plan');
    expect(formatPlanDisplayName('Hypertrophy · 3d/wk · 4 wks')).toBe('Hypertrophy Plan');
  });

  it('drops goal parentheticals', () => {
    expect(formatPlanDisplayName('Balanced (Strength + Cardio) · 5d/wk · 2 wks')).toBe(
      'Balanced Plan',
    );
  });

  it('rewrites the manual-create date default', () => {
    expect(formatPlanDisplayName('Plan 8/6/2026')).toBe('My Plan');
    expect(formatPlanDisplayName('Plan 12/31/26')).toBe('My Plan');
  });

  it('passes template and user-chosen names through verbatim', () => {
    expect(formatPlanDisplayName('Strength · Upper/Lower')).toBe('Strength · Upper/Lower');
    expect(formatPlanDisplayName('Summer Cut')).toBe('Summer Cut');
    // A user name that happens to end in "plan" is not doubled.
    expect(formatPlanDisplayName('My strength plan')).toBe('My strength plan');
  });

  it('falls back for missing names', () => {
    expect(formatPlanDisplayName(null)).toBe('My Plan');
    expect(formatPlanDisplayName('  ')).toBe('My Plan');
  });
});
