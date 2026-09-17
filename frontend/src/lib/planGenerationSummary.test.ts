import {
  linesForPlanGenerationSnapshot,
  linesLegacyFormNotInAiRequest,
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

  it('legacy-not-sent lines mention caps and formats', () => {
    const lines = linesLegacyFormNotInAiRequest();
    expect(lines.length).toBeGreaterThanOrEqual(3);
    const joined = lines.join(' ').toLowerCase();
    expect(joined).toMatch(/time cap|per-day/);
    expect(joined).toMatch(/format|superset|interval/);
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
