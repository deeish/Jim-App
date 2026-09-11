import {
  experienceFactLine,
  goalFactLine,
  matchingMomentLines,
  programsFitting,
  scheduleFitLine,
} from './onboardingPayoff';
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

const UL = card({ id: 'ul', name: 'Strength · Upper/Lower', supportedDaysPerWeek: { min: 2, max: 5 }, sessionMinutes: { min: 45, max: 75 } });
const PPL = card({ id: 'ppl', name: 'Hybrid · PPL', daysPerWeek: 6, supportedDaysPerWeek: { min: 3, max: 6 }, sessionMinutes: { min: 50, max: 70 } });
const FB = card({ id: 'fb', name: 'Beginner · Full Body', daysPerWeek: 3, supportedDaysPerWeek: { min: 2, max: 3 }, sessionMinutes: { min: 35, max: 55 } });
const CATALOG = [UL, PPL, FB];

describe('programsFitting', () => {
  it('needs both the day count and the session length to fit', () => {
    expect(programsFitting(CATALOG, { daysPerWeek: 4, sessionMinutes: 45 }).map((t) => t.id)).toEqual(['ul', 'ppl']);
    expect(programsFitting(CATALOG, { daysPerWeek: 2, sessionMinutes: 45 }).map((t) => t.id)).toEqual(['ul', 'fb']);
    expect(programsFitting(CATALOG, { daysPerWeek: 6, sessionMinutes: 30 }).map((t) => t.id)).toEqual([]);
  });

  it('allows one 15-minute step outside a program range', () => {
    expect(programsFitting([FB], { daysPerWeek: 3, sessionMinutes: 60 })).toHaveLength(1); // 55 + 15
    expect(programsFitting([FB], { daysPerWeek: 3, sessionMinutes: 75 })).toHaveLength(0);
  });

  it('falls back to the authored count when a card has no range', () => {
    const fixed = card({ id: 'fixed', daysPerWeek: 4, supportedDaysPerWeek: undefined });
    expect(programsFitting([fixed], { daysPerWeek: 4, sessionMinutes: 45 })).toHaveLength(1);
    expect(programsFitting([fixed], { daysPerWeek: 3, sessionMinutes: 45 })).toHaveLength(0);
  });
});

describe('scheduleFitLine', () => {
  it('is silent until the catalog has loaded', () => {
    expect(scheduleFitLine(null, { daysPerWeek: 4, sessionMinutes: 45 })).toBeNull();
  });

  it('counts the programs that fit, singular and plural', () => {
    expect(scheduleFitLine(CATALOG, { daysPerWeek: 4, sessionMinutes: 45 })).toBe(
      '2 coach-built programs fit 4 days × 45 min.',
    );
    expect(scheduleFitLine([FB], { daysPerWeek: 3, sessionMinutes: 45 })).toBe(
      '1 coach-built program fits 3 days × 45 min.',
    );
  });

  it('says so when nothing fits, and names the AI exit', () => {
    expect(scheduleFitLine(CATALOG, { daysPerWeek: 6, sessionMinutes: 30 })).toBe(
      'No coach-built program fits 6 days × 30 min exactly. AI can build one.',
    );
  });

  it('renders the top step as 75+', () => {
    expect(scheduleFitLine(CATALOG, { daysPerWeek: 4, sessionMinutes: 75 })).toContain('75+ min');
  });
});

describe('fact lines', () => {
  it('has a line for every goal and none for no goal', () => {
    for (const g of ['Strength', 'Hypertrophy', 'Fat loss', 'General fitness', 'Endurance'] as const) {
      expect(goalFactLine(g)).toMatch(/reps/);
    }
    expect(goalFactLine(null)).toBeNull();
  });

  it('tells a "not sure" user what actually happens', () => {
    expect(experienceFactLine('not-sure')).toBe("We'll start you easy. You can change this in Profile.");
    expect(experienceFactLine('Intermediate')).toMatch(/week to week/);
    expect(experienceFactLine(null)).toBeNull();
  });
});

describe('matchingMomentLines', () => {
  it('reports what was checked, what fit, and what was picked', () => {
    expect(matchingMomentLines(CATALOG, { daysPerWeek: 4, sessionMinutes: 45 }, UL)).toEqual([
      'Checked 3 coach-built programs',
      '2 fit 4 days × 45 min',
      'Picked Strength · Upper/Lower',
    ]);
  });

  it('is honest when nothing fit exactly', () => {
    expect(matchingMomentLines(CATALOG, { daysPerWeek: 6, sessionMinutes: 30 }, null)[2]).toBe(
      'None fit exactly — showing the closest',
    );
  });

  it('does not claim a pick that is not one of the fits', () => {
    // 6 days × 45 min fits only the PPL, but a strength goal makes the
    // recommender pick the Upper/Lower anyway (goal outranks schedule).
    expect(matchingMomentLines(CATALOG, { daysPerWeek: 6, sessionMinutes: 45 }, UL)).toEqual([
      'Checked 3 coach-built programs',
      '1 fit 6 days × 45 min',
      'None fit exactly — showing the closest',
    ]);
    expect(matchingMomentLines(CATALOG, { daysPerWeek: 6, sessionMinutes: 45 }, PPL)[2]).toBe(
      'Picked Hybrid · PPL',
    );
  });
});
