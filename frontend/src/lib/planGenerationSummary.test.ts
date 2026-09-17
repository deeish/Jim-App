import {
  coachCheckDetailLines,
  coachCheckHeadline,
  linesForPlanGenerationSnapshot,
  mesoHintForGenerateSessions,
  MESO_HINT_MAX_LENGTH,
} from './planGenerationSummary';
import type { PlanInputs } from '../types/plan';

const base: PlanInputs = {
  goal: 'strength',
  selectedWeekdays: ['Monday', 'Thursday'],
  daysPerWeek: 2,
  durationMode: 'range',
  durationMin: 45,
  durationMax: 60,
  planStyleId: 'heavy_compounds',
  splitPreference: 'upper_lower',
  useRecommended: false,
  customSplit: null,
  location: 'gym',
  weeksCount: 1,
  detailLevel: 'detailed',
  progressionStyle: 'build',
  durationOverrides: null,
  hardDayLimits: { enabled: false, maxHardDaysPerWeek: 3, maxHardDaysInARow: 2 },
  injuriesAvoid: { bodyAreas: [], movementsOrEquipment: [] },
  currentActivityLevel: null,
  preferredExercises: [],
  experienceLevel: 'intermediate',
  equipmentTags: ['barbell', 'dumbbells'],
};

describe('planGenerationSummary', () => {
  it('includes goal, split, equipment, and AI note', () => {
    const lines = linesForPlanGenerationSnapshot(base);
    expect(lines.some((l) => l.startsWith('Goal:'))).toBe(true);
    expect(lines.some((l) => l.includes('Upper / lower'))).toBe(true);
    expect(lines.some((l) => l.includes('Barbell'))).toBe(true);
    expect(lines.some((l) => l.includes('Gemini'))).toBe(true);
  });

  it('mentions beginner coach cues when experience is beginner', () => {
    const lines = linesForPlanGenerationSnapshot({
      ...base,
      experienceLevel: 'beginner',
    });
    expect(lines.some((l) => l.includes('Beginner') && l.includes('notes'))).toBe(
      true,
    );
  });

  it('mesoHint stays within max length', () => {
    const hint = mesoHintForGenerateSessions({ ...base, weeksCount: 12 });
    expect(hint).toBeDefined();
    expect(hint!.length).toBeLessThanOrEqual(MESO_HINT_MAX_LENGTH);
  });

  it('mesoHint reflects build+deload progression', () => {
    const hint = mesoHintForGenerateSessions({
      ...base,
      progressionStyle: 'build_deload',
      weeksCount: 1,
    });
    expect(hint?.toLowerCase()).toMatch(/deload|recovery/i);
  });

});

describe('builtByLine', () => {
  it('says so when the rules built the week, and defaults to the AI wording', () => {
    const { builtByLine } = require('./planGenerationSummary');
    expect(builtByLine('rules')).toMatch(/rules this time/);
    expect(builtByLine('mixed')).toMatch(/some weeks/);
    expect(builtByLine('ai')).toMatch(/Gemini/);
    expect(builtByLine(undefined)).toMatch(/Gemini/);
  });
});

describe('coachCheckHeadline / coachCheckDetailLines', () => {
  const report = {
    weekIndex: 1,
    sessionCount: 4,
    effortCoverage: 1,
    band: { min: 10, max: 20 },
    volumeByMuscle: {
      Chest: { direct: 12, weighted: 14, exposures: 2 },
      Shoulders: { direct: 6, weighted: 8.5, exposures: 2 },
      Core: { direct: 0, weighted: 0, exposures: 0 },
      Arms: { direct: 0, weighted: 6, exposures: 0 },
    },
    findings: [
      { code: 'volume_low', severity: 'warn' as const, message: 'Shoulders: 8.5 weekly sets, under the 10 most intermediate lifters need to progress.' },
      { code: 'rest_accessory_long', severity: 'info' as const, message: 'Curl rests 120 seconds; 60 to 90 is enough.' },
    ],
  };

  it('is one sentence: balanced, or the first real note with a count of the rest', () => {
    expect(coachCheckHeadline(undefined)).toBeNull();
    expect(coachCheckHeadline({ ...report, findings: [] })).toMatch(/^Coach check: a balanced week/);
    expect(coachCheckHeadline(report)).toBe(
      'Coach check: Shoulders: 8.5 weekly sets, under the 10 most intermediate lifters need to progress.',
    );
    expect(
      coachCheckHeadline({ ...report, findings: [report.findings[0], report.findings[0], report.findings[1]] }),
    ).toMatch(/\(1 more note\)$/);
  });

  it('lists every note, then sets per muscle against the band, heaviest first, untrained muscles left out', () => {
    const lines = coachCheckDetailLines(report);
    expect(lines[0]).toMatch(/^Shoulders: 8.5 weekly sets/);
    expect(lines[1]).toMatch(/^Curl rests/);
    expect(lines[2]).toBe('Sets per muscle this week (aim 10-20):');
    expect(lines[3]).toBe('Chest: 14 sets over 2 days');
    expect(lines[4]).toBe('Shoulders: 8.5 sets over 2 days');
    expect(lines[5]).toBe('Arms: 6 sets as a helper on other lifts');
    expect(lines).toHaveLength(6);
  });
});

