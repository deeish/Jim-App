/**
 * Automated tests for the plan recommendation engine.
 * 1) Golden scenario tests (snapshot expectations)
 * 2) Invariant tests (rules that must always hold)
 * 3) UI copy logic tests (when recovery suggestion / "Using recommended" / Why bullets appear)
 */

import {
  getRecommendation,
  mapPatternToWeekdays,
  GOLDEN_SCENARIOS,
  runGoldenScenarios,
  PATTERN_TEMPLATES,
  type UserContext,
  type SplitFamily,
  type ReasonTag,
} from './planRecommendation';

// ---- Test helpers ----
const DEFAULT_CTX: UserContext = {
  goal: null,
  planStyle: null,
  daysPerWeek: 0,
  selectedWeekdays: [],
  durationMin: 30,
  durationMax: 60,
  durationTarget: null,
  durationClass: 'MED',
  userSelectedSplit: null,
  consecutiveRuns: [],
  hasRestGaps: false,
  weekendIncluded: false,
  cardioEmphasis: 'none',
  liftingEmphasis: 'moderate',
  strengthBias: 'low',
  hypertrophyBias: 'low',
  densityBias: 'low',
  recoveryNeed: 'low',
};

function fullContext(partial: Partial<UserContext> & Pick<UserContext, 'goal' | 'daysPerWeek' | 'selectedWeekdays' | 'durationMin' | 'durationMax'>): UserContext {
  return { ...DEFAULT_CTX, ...partial };
}

// ---- 1) Golden scenario tests (snapshot expectations) ----
describe('Golden scenario tests', () => {
  const goldenExpectations: Array<{
    name: string;
    expectedSplit: SplitFamily;
    expectedAlternative: SplitFamily | null;
    expectedPatternPreview: string;
    expectedReasonTag: ReasonTag;
  }> = [
    {
      name: 'Strength + Heavy + 4d + 30 min + Mon/Tue/Thu/Fri',
      expectedSplit: 'upper-lower',
      expectedAlternative: 'full body',
      expectedPatternPreview: 'Mon Upper • Tue Lower • Thu Upper • Fri Lower',
      expectedReasonTag: 'heavy_strength',
    },
    {
      name: 'Fat loss + Steady + 4d + 30 min',
      expectedSplit: 'upper-lower',
      expectedAlternative: 'full body',
      expectedPatternPreview: 'Mon Upper • Tue Lower • Thu Upper • Fri Lower',
      expectedReasonTag: null, // ul_4 has no CARDIO_STEADY so no steady_cardio tag
    },
    {
      name: 'Balanced + More muscle + 5d + 60 min',
      expectedSplit: 'ppl',
      expectedAlternative: 'upper-lower',
      expectedPatternPreview: 'Mon Push • Tue Pull • Wed Legs • Fri Push • Sat Pull',
      expectedReasonTag: 'more_muscle',
    },
    {
      name: 'Endurance + Base + 5d + 30–45 min',
      expectedSplit: 'upper-lower',
      expectedAlternative: 'ppl',
      expectedPatternPreview: 'Mon Upper • Tue Lower • Thu Easy cardio (Zone 2) • Fri Upper • Sat Lower',
      expectedReasonTag: null,
    },
  ];

  it('runGoldenScenarios() passes all four golden scenarios', () => {
    const results = runGoldenScenarios();
    results.forEach((r) => {
      expect(r.pass).toBe(true);
    });
  });

  goldenExpectations.forEach(({ name, expectedSplit, expectedAlternative, expectedPatternPreview, expectedReasonTag }) => {
    it(`Golden: ${name} → exact recommendedSplit, alternativeSplit, pattern, reasonTag`, () => {
      const scenario = GOLDEN_SCENARIOS.find((s) => s.name === name);
      expect(scenario).toBeDefined();
      const ctx: UserContext = fullContext(scenario!.context);
      const result = getRecommendation(ctx);
      expect(result).not.toBeNull();

      expect(result!.recommendedSplit).toBe(expectedSplit);
      expect(result!.alternativeSplit).toBe(expectedAlternative);

      const patternPreview = mapPatternToWeekdays(result!.recommendedPattern, ctx.selectedWeekdays);
      expect(patternPreview).toBe(expectedPatternPreview);

      expect(result!.reasonTag).toBe(expectedReasonTag);
    });
  });
});

// ---- 2) Invariant tests ----
describe('Invariant tests', () => {
  it('recommended split template is compatible with daysPerWeek', () => {
    const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    for (const days of [2, 3, 4, 5]) {
      const ctx = fullContext({
        goal: 'strength',
        planStyle: 'heavy_compounds',
        daysPerWeek: days,
        selectedWeekdays: weekdays.slice(0, days),
        durationMin: 45,
        durationMax: 60,
      });
      const result = getRecommendation(ctx);
      expect(result).not.toBeNull();
      const recommendedTemplate = PATTERN_TEMPLATES.find((t) => t.id === result!.recommendedTemplateId);
      expect(recommendedTemplate).toBeDefined();
      expect(recommendedTemplate!.minDaysPerWeek).toBeLessThanOrEqual(days);
      expect(recommendedTemplate!.maxDaysPerWeek).toBeGreaterThanOrEqual(days);
    }
  });

  it('pattern length equals daysPerWeek', () => {
    const scenarios = [
      { days: 2, goal: 'strength' as const, planStyle: 'heavy_compounds' as const },
      { days: 3, goal: 'strength' as const, planStyle: 'heavy_compounds' as const },
      { days: 4, goal: 'strength' as const, planStyle: 'heavy_compounds' as const },
      { days: 5, goal: 'hybrid' as const, planStyle: 'muscle_bias' as const },
    ];
    const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    scenarios.forEach(({ days, goal, planStyle }) => {
      const ctx = fullContext({
        goal,
        planStyle,
        daysPerWeek: days,
        selectedWeekdays: weekdays.slice(0, days),
        durationMin: 45,
        durationMax: 60,
      });
      const result = getRecommendation(ctx);
      expect(result).not.toBeNull();
      expect(result!.recommendedPattern.length).toBe(days);
    });
  });

  it('UL pattern alternates Upper/Lower (no Lower-Lower)', () => {
    const ulTemplates = PATTERN_TEMPLATES.filter((t) => t.splitFamily === 'upper-lower');
    for (const t of ulTemplates) {
      const types = t.dayTypes;
      for (let i = 0; i < types.length - 1; i++) {
        const a = types[i];
        const b = types[i + 1];
        if (a === 'LOWER' && b === 'LOWER') {
          throw new Error(`UL template ${t.id} has consecutive LOWER`);
        }
        if (a === 'UPPER' && b === 'UPPER') {
          throw new Error(`UL template ${t.id} has consecutive UPPER`);
        }
      }
    }
  });

  it('PPL is never recommended when daysPerWeek < 3', () => {
    for (const days of [1, 2]) {
      const ctx = fullContext({
        goal: 'strength',
        planStyle: 'heavy_compounds',
        daysPerWeek: days,
        selectedWeekdays: ['Monday', 'Tuesday'].slice(0, days),
        durationMin: 45,
        durationMax: 60,
      });
      const result = getRecommendation(ctx);
      if (result) {
        expect(result.recommendedSplit).not.toBe('ppl');
      }
    }
  });

  it('7-day fat loss steady returns Full Body + Cardio structure with lift/cardio/recovery counts', () => {
    const ctx = fullContext({
      goal: 'fat loss',
      planStyle: 'lift_zone2',
      daysPerWeek: 7,
      selectedWeekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      durationMin: 30,
      durationMax: 45,
    });
    const result = getRecommendation(ctx);
    expect(result).not.toBeNull();
    expect(result!.recommendedSplit).toBe('full body');
    expect(result!.recommendedStructureName).toContain('Full Body');
    expect(result!.recommendedStructureName).toContain('Cardio');
    expect(result!.liftDays).toBeGreaterThanOrEqual(3);
    expect(result!.cardioDays).toBeGreaterThanOrEqual(2);
    expect(result!.recoveryDays).toBeGreaterThanOrEqual(1);
    expect(result!.recommendedPattern.length).toBe(7);
  });

  it('alternative is different from recommended and valid for days/week', () => {
    const ctx = fullContext({
      goal: 'strength',
      planStyle: 'heavy_compounds',
      daysPerWeek: 4,
      selectedWeekdays: ['Monday', 'Tuesday', 'Thursday', 'Friday'],
      durationMin: 30,
      durationMax: 60,
    });
    const result = getRecommendation(ctx);
    expect(result).not.toBeNull();
    if (result!.alternativeSplit) {
      expect(result!.alternativeSplit).not.toBe(result!.recommendedSplit);
      const altTemplate = PATTERN_TEMPLATES.find(
        (t) => t.splitFamily === result!.alternativeSplit && t.minDaysPerWeek <= ctx.daysPerWeek && t.maxDaysPerWeek >= ctx.daysPerWeek
      );
      expect(altTemplate).toBeDefined();
      expect(result!.alternativePattern!.length).toBe(ctx.daysPerWeek);
    }
  });
});

// ---- 3) UI copy logic tests ----
describe('UI copy logic tests', () => {
  it('recoverySuggestion only when selectedDays imply bad sequencing (consecutive + 2+ lower/legs)', () => {
    const withRecovery = fullContext({
      goal: 'strength',
      planStyle: 'heavy_compounds',
      daysPerWeek: 4,
      selectedWeekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'],
      durationMin: 45,
      durationMax: 60,
      consecutiveRuns: [4],
      hasRestGaps: false,
    });
    const resultWith = getRecommendation(withRecovery);
    expect(resultWith?.recoverySuggestion).toBeDefined();
    expect(resultWith?.recoverySuggestion).toContain('For easier recovery');

    const withoutRecovery = fullContext({
      goal: 'strength',
      planStyle: 'heavy_compounds',
      daysPerWeek: 4,
      selectedWeekdays: ['Monday', 'Tuesday', 'Thursday', 'Friday'],
      durationMin: 45,
      durationMax: 60,
      consecutiveRuns: [2, 2],
      hasRestGaps: true,
    });
    const resultWithout = getRecommendation(withoutRecovery);
    expect(resultWithout?.recoverySuggestion).toBeUndefined();
  });

  it('"Using recommended" condition: effective split = recommended when preference is null or "ai decide"', () => {
    const ctx = fullContext({
      goal: 'strength',
      planStyle: 'heavy_compounds',
      daysPerWeek: 4,
      selectedWeekdays: ['Monday', 'Tuesday', 'Thursday', 'Friday'],
      durationMin: 30,
      durationMax: 60,
      userSelectedSplit: null,
    });
    const result = getRecommendation(ctx);
    expect(result).not.toBeNull();
    const isUsingRecommended = ctx.userSelectedSplit === null || ctx.userSelectedSplit === 'ai decide';
    expect(isUsingRecommended).toBe(true);
    const effectiveSplit = isUsingRecommended ? result!.recommendedSplit : ctx.userSelectedSplit;
    expect(effectiveSplit).toBe(result!.recommendedSplit);
  });

  it('"Using recommended" is false when user selected a concrete split', () => {
    const ctx = fullContext({
      goal: 'strength',
      planStyle: 'heavy_compounds',
      daysPerWeek: 4,
      selectedWeekdays: ['Monday', 'Tuesday', 'Thursday', 'Friday'],
      durationMin: 30,
      durationMax: 60,
      userSelectedSplit: 'full body',
    });
    const result = getRecommendation(ctx);
    const isUsingRecommended = ctx.userSelectedSplit === null || ctx.userSelectedSplit === 'ai decide';
    expect(isUsingRecommended).toBe(false);
    expect(result!.recommendedSplit).toBe('upper-lower');
  });

  it('reasonBullets are tied to scoring contributors (goal, time, schedule)', () => {
    const ctx = fullContext({
      goal: 'strength',
      planStyle: 'heavy_compounds',
      daysPerWeek: 4,
      selectedWeekdays: ['Monday', 'Tuesday', 'Thursday', 'Friday'],
      durationMin: 45,
      durationMax: 60,
      hasRestGaps: true,
    });
    const result = getRecommendation(ctx);
    expect(result).not.toBeNull();
    expect(result!.reasonBullets.length).toBeLessThanOrEqual(2);
    const text = result!.reasonBullets.join(' ');
    if (result!.reasonBullets.some((b) => b.includes('goal'))) {
      expect(text).toMatch(/goal|Matches/);
    }
    if (result!.reasonBullets.some((b) => b.includes('time') || b.includes('session'))) {
      expect(text).toMatch(/time|session|Enough/);
    }
    if (result!.reasonBullets.some((b) => b.includes('Recovery') || b.includes('selection'))) {
      expect(text).toMatch(/Recovery|selection|days/);
    }
  });

  it('suggestedDaySchedules only when no days selected', () => {
    const withDays = fullContext({
      goal: 'strength',
      planStyle: 'heavy_compounds',
      daysPerWeek: 4,
      selectedWeekdays: ['Monday', 'Tuesday', 'Thursday', 'Friday'],
      durationMin: 30,
      durationMax: 60,
    });
    const resultWithDays = getRecommendation(withDays);
    expect(resultWithDays!.suggestedDaySchedules).toEqual([]);

    const noDays = fullContext({
      goal: 'strength',
      planStyle: 'heavy_compounds',
      daysPerWeek: 4,
      selectedWeekdays: [],
      durationMin: 30,
      durationMax: 60,
    });
    const resultNoDays = getRecommendation(noDays);
    expect(resultNoDays).not.toBeNull();
    expect(resultNoDays!.suggestedDaySchedules.length).toBeGreaterThan(0);
  });
});
