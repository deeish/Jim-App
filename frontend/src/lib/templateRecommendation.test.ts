import { goalBucket, recommendTemplate } from './templateRecommendation';
import type { PlanTemplateCard } from '../services/templateService';

function card(overrides: Partial<PlanTemplateCard>): PlanTemplateCard {
  return {
    id: 'x',
    name: 'X',
    tagline: '',
    goal: 'strength',
    goalId: 'strength',
    split: 'Upper/Lower',
    splitId: 'upper_lower',
    daysPerWeek: 4,
    weeksCount: 8,
    experienceLevel: 'intermediate',
    defaultWeekdays: [],
    muscleFocus: [],
    sessionMinutes: { min: 45, max: 60 },
    ...overrides,
  } as PlanTemplateCard;
}

const STRENGTH = card({ id: 'strength-ul', goalId: 'strength', daysPerWeek: 4 });
const FAT_LOSS = card({ id: 'fatloss-fb', goalId: 'fat_loss', daysPerWeek: 3, experienceLevel: 'beginner' });
const HYBRID = card({ id: 'hybrid-ppl', goalId: 'balanced', daysPerWeek: 6, experienceLevel: 'advanced' });
const CATALOG = [STRENGTH, FAT_LOSS, HYBRID];

describe('goalBucket', () => {
  it('maps strength-family goals to the strength bucket', () => {
    expect(goalBucket('Strength')).toBe('strength');
    expect(goalBucket('Hypertrophy')).toBe('strength');
  });

  it('maps fat loss directly', () => {
    expect(goalBucket('Fat loss')).toBe('fat_loss');
  });

  it('maps everything else (and no answer) to balanced', () => {
    expect(goalBucket('General fitness')).toBe('balanced');
    expect(goalBucket('Endurance')).toBe('balanced');
    expect(goalBucket(null)).toBe('balanced');
    expect(goalBucket(undefined)).toBe('balanced');
  });
});

describe('recommendTemplate', () => {
  it('returns null for an empty catalog', () => {
    expect(recommendTemplate([], { goal: 'Strength', daysPerWeek: 4 })).toBeNull();
  });

  it('picks by goal bucket for each onboarding goal', () => {
    expect(recommendTemplate(CATALOG, { goal: 'Strength', daysPerWeek: 4 })?.id).toBe('strength-ul');
    expect(recommendTemplate(CATALOG, { goal: 'Hypertrophy', daysPerWeek: 4 })?.id).toBe('strength-ul');
    expect(recommendTemplate(CATALOG, { goal: 'Fat loss', daysPerWeek: 3 })?.id).toBe('fatloss-fb');
    expect(recommendTemplate(CATALOG, { goal: 'Endurance', daysPerWeek: 6 })?.id).toBe('hybrid-ppl');
    expect(recommendTemplate(CATALOG, { goal: 'General fitness', daysPerWeek: 3 })?.id).toBe('hybrid-ppl');
  });

  it('goal match beats day-count proximity', () => {
    // A 3-day user with a strength goal still gets the 4-day strength program,
    // not the 3-day fat-loss one.
    expect(recommendTemplate(CATALOG, { goal: 'Strength', daysPerWeek: 3 })?.id).toBe('strength-ul');
  });

  it('breaks same-bucket ties by day count, then experience', () => {
    const threeDay = card({ id: 'strength-3d', goalId: 'strength', daysPerWeek: 3 });
    expect(
      recommendTemplate([STRENGTH, threeDay], { goal: 'Strength', daysPerWeek: 3 })?.id,
    ).toBe('strength-3d');

    const beginnerFourDay = card({ id: 'strength-4d-beg', goalId: 'strength', daysPerWeek: 4, experienceLevel: 'beginner' });
    expect(
      recommendTemplate([STRENGTH, beginnerFourDay], {
        goal: 'Strength',
        daysPerWeek: 4,
        experience: 'Beginner',
      })?.id,
    ).toBe('strength-4d-beg');
  });

  it('any day count inside supportedDaysPerWeek counts as a full match', () => {
    const adjustable = card({
      id: 'hybrid-adjustable',
      goalId: 'balanced',
      daysPerWeek: 6,
      supportedDaysPerWeek: { min: 3, max: 6 },
    });
    const strict = card({ id: 'hybrid-strict', goalId: 'balanced', daysPerWeek: 5 });
    // 4 days: inside the adjustable range (distance 0) vs 1 off for the
    // strict 5-day — the adjustable wins even though its authored count is
    // further away.
    expect(
      recommendTemplate([strict, adjustable], { goal: 'General fitness', daysPerWeek: 4 })?.id,
    ).toBe('hybrid-adjustable');
  });

  it('within overlapping ranges, prefers the program authored at the user count', () => {
    const ppl = card({
      id: 'ppl-6',
      goalId: 'strength',
      daysPerWeek: 6,
      supportedDaysPerWeek: { min: 3, max: 6 },
    });
    const ul = card({
      id: 'ul-4',
      goalId: 'strength',
      daysPerWeek: 4,
      supportedDaysPerWeek: { min: 2, max: 5 },
    });
    // 4 days fits both ranges; the program written AT 4 days wins.
    expect(recommendTemplate([ppl, ul], { goal: 'Strength', daysPerWeek: 4 })?.id).toBe('ul-4');
    // 6 days only fits the PPL range.
    expect(recommendTemplate([ppl, ul], { goal: 'Strength', daysPerWeek: 6 })?.id).toBe('ppl-6');
  });
});
