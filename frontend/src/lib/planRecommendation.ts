/**
 * Plan recommendation engine: Pattern Template system + scoring.
 * Plan style = intensity/emphasis. Split = how lifting days are structured.
 */

// ---- 0) Locked concepts ----
// Inputs: goal, planStyle, selectedDays (→ daysPerWeek), durationTarget or durationRange, splitPreference, location
// Outputs: recommendedSplit, recommendedPattern, alternativeSplit?, alternativePattern?, reasonText, reasonBullets?, suggestedDaySchedules[] (when no days selected)

// ---- 1A) Day types (canonical labels) ----
export type LiftDayType =
  | 'FULL'
  | 'UPPER'
  | 'LOWER'
  | 'PUSH'
  | 'PULL'
  | 'LEGS'
  | 'CHEST'
  | 'BACK'
  | 'SHOULDERS'
  | 'ARMS'
  | 'SHOULDERS_ARMS';
export type CardioDayType = 'CARDIO_STEADY' | 'CARDIO_INTERVALS';
export type RecoveryDayType = 'REST' | 'MOBILITY';
export type OtherDayType = 'WEAKPOINTS';
export type DayType = LiftDayType | CardioDayType | RecoveryDayType | OtherDayType;

export const DAY_TYPE_LABELS: Record<string, string> = {
  FULL: 'Full Body',
  UPPER: 'Upper',
  LOWER: 'Lower',
  PUSH: 'Push',
  PULL: 'Pull',
  LEGS: 'Legs',
  CHEST: 'Chest',
  BACK: 'Back',
  SHOULDERS: 'Shoulders',
  ARMS: 'Arms',
  SHOULDERS_ARMS: 'Shoulders & Arms',
  CARDIO_STEADY: 'Easy cardio (Zone 2)',
  CARDIO_INTERVALS: 'Cardio (intervals)',
  REST: 'Rest / Mobility',
  MOBILITY: 'Rest / Mobility',
  WEAKPOINTS: 'Accessories',
};

// ---- 1B) Pattern templates ----
export type SplitFamily = 'full body' | 'upper-lower' | 'ppl' | 'body part';
export type DurationClass = 'SHORT' | 'MED' | 'LONG';
export type RecoveryRiskProfile = 'low' | 'med' | 'high';

const LIFT_DAY_TYPES: DayType[] = ['FULL', 'UPPER', 'LOWER', 'PUSH', 'PULL', 'LEGS', 'CHEST', 'BACK', 'SHOULDERS', 'ARMS', 'SHOULDERS_ARMS', 'WEAKPOINTS'];
const CARDIO_DAY_TYPES: DayType[] = ['CARDIO_STEADY', 'CARDIO_INTERVALS'];
const RECOVERY_DAY_TYPES: DayType[] = ['REST', 'MOBILITY'];

export interface PatternTemplate {
  id: string;
  splitFamily: SplitFamily;
  dayTypes: DayType[];
  minDaysPerWeek: number;
  maxDaysPerWeek: number;
  minRecommendedDuration: number; // min minutes; templates below this get score penalty or alternative-only
  recoveryRiskProfile: RecoveryRiskProfile;
  goalCompatibility: ('strength' | 'endurance' | 'fat loss' | 'balanced')[];
  styleCompatibility: (
    | 'steady_cardio'
    | 'intervals'
    | 'circuit'
    | 'heavy_strength'
    | 'more_muscle'
    | 'base'
    | 'interval_focus'
    | 'mixed_endurance'
    | 'even_split'
    | 'strength_bias'
    | 'muscle_bias'
    | 'conditioning'
  )[];
  /** Human-readable weekly structure name, e.g. "Upper/Lower + Cardio/Recovery" (used on card for 6–7d). */
  structureName?: string;
  /** Optional display labels per day (same length as dayTypes); short, scannable for weekly pattern. */
  dayLabels?: string[];
  /** Short lifting descriptor for breakdown line, e.g. "Full-body circuit", "Upper/Lower" (7d card). */
  shortLiftingLabel?: string;
}

export const PATTERN_TEMPLATES: PatternTemplate[] = [
  // Full Body
  { id: 'fb_2', splitFamily: 'full body', dayTypes: ['FULL', 'FULL'], minDaysPerWeek: 2, maxDaysPerWeek: 2, minRecommendedDuration: 30, recoveryRiskProfile: 'low', goalCompatibility: ['strength', 'fat loss', 'endurance', 'balanced'], styleCompatibility: ['steady_cardio', 'intervals', 'circuit', 'heavy_strength', 'base', 'interval_focus', 'mixed_endurance', 'even_split'] },
  { id: 'fb_3', splitFamily: 'full body', dayTypes: ['FULL', 'FULL', 'FULL'], minDaysPerWeek: 3, maxDaysPerWeek: 3, minRecommendedDuration: 30, recoveryRiskProfile: 'low', goalCompatibility: ['strength', 'fat loss', 'endurance', 'balanced'], styleCompatibility: ['steady_cardio', 'intervals', 'circuit', 'heavy_strength', 'base', 'interval_focus', 'mixed_endurance', 'even_split', 'strength_bias'] },
  { id: 'fb_4', splitFamily: 'full body', dayTypes: ['FULL', 'FULL', 'FULL', 'FULL'], minDaysPerWeek: 4, maxDaysPerWeek: 4, minRecommendedDuration: 45, recoveryRiskProfile: 'med', goalCompatibility: ['fat loss', 'endurance', 'balanced'], styleCompatibility: ['circuit', 'steady_cardio', 'intervals'] },
  // Upper/Lower
  { id: 'ul_4', splitFamily: 'upper-lower', dayTypes: ['UPPER', 'LOWER', 'UPPER', 'LOWER'], minDaysPerWeek: 4, maxDaysPerWeek: 4, minRecommendedDuration: 30, recoveryRiskProfile: 'low', goalCompatibility: ['strength', 'fat loss', 'endurance', 'balanced'], styleCompatibility: ['steady_cardio', 'intervals', 'circuit', 'heavy_strength', 'more_muscle', 'even_split', 'strength_bias', 'muscle_bias', 'base', 'mixed_endurance'] },
  { id: 'ul_5_cardio', splitFamily: 'upper-lower', dayTypes: ['UPPER', 'LOWER', 'CARDIO_STEADY', 'UPPER', 'LOWER'], minDaysPerWeek: 5, maxDaysPerWeek: 5, minRecommendedDuration: 30, recoveryRiskProfile: 'low', goalCompatibility: ['fat loss', 'endurance', 'balanced'], styleCompatibility: ['steady_cardio', 'mixed_endurance', 'base', 'interval_focus'] },
  { id: 'ul_5_weak', splitFamily: 'upper-lower', dayTypes: ['UPPER', 'LOWER', 'WEAKPOINTS', 'UPPER', 'LOWER'], minDaysPerWeek: 5, maxDaysPerWeek: 5, minRecommendedDuration: 35, recoveryRiskProfile: 'med', goalCompatibility: ['balanced', 'strength'], styleCompatibility: ['more_muscle', 'muscle_bias', 'even_split'] },
  { id: 'ul_6', splitFamily: 'upper-lower', dayTypes: ['UPPER', 'LOWER', 'UPPER', 'LOWER', 'UPPER', 'LOWER'], minDaysPerWeek: 6, maxDaysPerWeek: 6, minRecommendedDuration: 40, recoveryRiskProfile: 'high', goalCompatibility: ['strength', 'balanced'], styleCompatibility: ['heavy_strength', 'more_muscle'] },
  // Push/Pull/Legs
  { id: 'ppl_3', splitFamily: 'ppl', dayTypes: ['PUSH', 'PULL', 'LEGS'], minDaysPerWeek: 3, maxDaysPerWeek: 3, minRecommendedDuration: 45, recoveryRiskProfile: 'low', goalCompatibility: ['strength', 'balanced'], styleCompatibility: ['heavy_strength', 'more_muscle', 'strength_bias'] },
  { id: 'ppl_5', splitFamily: 'ppl', dayTypes: ['PUSH', 'PULL', 'LEGS', 'PUSH', 'PULL'], minDaysPerWeek: 5, maxDaysPerWeek: 5, minRecommendedDuration: 45, recoveryRiskProfile: 'med', goalCompatibility: ['strength', 'fat loss', 'balanced'], styleCompatibility: ['heavy_strength', 'more_muscle', 'muscle_bias', 'even_split'] },
  { id: 'ppl_6', splitFamily: 'ppl', dayTypes: ['PUSH', 'PULL', 'LEGS', 'PUSH', 'PULL', 'LEGS'], minDaysPerWeek: 6, maxDaysPerWeek: 6, minRecommendedDuration: 45, recoveryRiskProfile: 'med', goalCompatibility: ['strength', 'balanced'], styleCompatibility: ['more_muscle', 'muscle_bias', 'heavy_strength'] },
  // Body Part Days
  { id: 'bp_4', splitFamily: 'body part', dayTypes: ['CHEST', 'BACK', 'LEGS', 'SHOULDERS_ARMS'], minDaysPerWeek: 4, maxDaysPerWeek: 4, minRecommendedDuration: 45, recoveryRiskProfile: 'low', goalCompatibility: ['fat loss', 'balanced'], styleCompatibility: ['circuit', 'more_muscle', 'muscle_bias'] },
  { id: 'bp_5', splitFamily: 'body part', dayTypes: ['CHEST', 'BACK', 'LEGS', 'SHOULDERS', 'ARMS'], minDaysPerWeek: 5, maxDaysPerWeek: 5, minRecommendedDuration: 45, recoveryRiskProfile: 'low', goalCompatibility: ['balanced', 'fat loss'], styleCompatibility: ['more_muscle', 'muscle_bias', 'even_split'] },
  // ---- 7-day templates (by goal + plan style) ----
  // Fat loss – Steady cardio + lifting
  { id: 'fb7_fat_steady', splitFamily: 'full body', dayTypes: ['FULL', 'CARDIO_STEADY', 'FULL', 'CARDIO_STEADY', 'FULL', 'CARDIO_STEADY', 'REST'], minDaysPerWeek: 7, maxDaysPerWeek: 7, minRecommendedDuration: 30, recoveryRiskProfile: 'low', goalCompatibility: ['fat loss'], styleCompatibility: ['steady_cardio'], structureName: 'Full Body + Cardio Days (3–4 lift / 3–4 cardio)', dayLabels: ['Full body', 'Easy cardio', 'Full body', 'Easy cardio', 'Full body', 'Easy cardio', 'Rest'], shortLiftingLabel: 'Full-body' },
  // Fat loss – Intervals + lifting
  { id: 'ul7_fat_intervals', splitFamily: 'upper-lower', dayTypes: ['UPPER', 'CARDIO_INTERVALS', 'LOWER', 'CARDIO_STEADY', 'UPPER', 'LOWER', 'REST'], minDaysPerWeek: 7, maxDaysPerWeek: 7, minRecommendedDuration: 30, recoveryRiskProfile: 'low', goalCompatibility: ['fat loss'], styleCompatibility: ['intervals'], structureName: 'Upper/Lower + 2 Interval Days + 1 Recovery (4 lift / 2 interval / 1 recovery)', dayLabels: ['Upper', 'Intervals', 'Lower', 'Easy cardio', 'Upper', 'Lower', 'Rest'], shortLiftingLabel: 'Upper/Lower' },
  // Fat loss – Circuit-style
  { id: 'fb7_fat_circuit', splitFamily: 'full body', dayTypes: ['FULL', 'CARDIO_STEADY', 'FULL', 'CARDIO_STEADY', 'FULL', 'FULL', 'REST'], minDaysPerWeek: 7, maxDaysPerWeek: 7, minRecommendedDuration: 30, recoveryRiskProfile: 'med', goalCompatibility: ['fat loss'], styleCompatibility: ['circuit'], structureName: 'Full Body Circuit + Cardio/Recovery (4 circuit / 2 zone 2 / 1 recovery)', dayLabels: ['Circuit', 'Easy cardio', 'Circuit', 'Easy cardio', 'Circuit', 'Light circuit', 'Rest'], shortLiftingLabel: 'Full-body circuit' },
  // Strength – Heavy strength focus
  { id: 'ul7_str_heavy', splitFamily: 'upper-lower', dayTypes: ['UPPER', 'CARDIO_STEADY', 'LOWER', 'MOBILITY', 'UPPER', 'LOWER', 'REST'], minDaysPerWeek: 7, maxDaysPerWeek: 7, minRecommendedDuration: 30, recoveryRiskProfile: 'low', goalCompatibility: ['strength'], styleCompatibility: ['heavy_strength'], structureName: 'Upper/Lower + Recovery Days (4 lift / 2 recovery cardio / 1 mobility)', dayLabels: ['Upper', 'Easy cardio', 'Lower', 'Rest', 'Upper', 'Lower', 'Rest'], shortLiftingLabel: 'Upper/Lower' },
  // Strength – Strength + muscle focus
  { id: 'ul7_str_muscle', splitFamily: 'upper-lower', dayTypes: ['UPPER', 'LOWER', 'WEAKPOINTS', 'REST', 'UPPER', 'LOWER', 'REST'], minDaysPerWeek: 7, maxDaysPerWeek: 7, minRecommendedDuration: 35, recoveryRiskProfile: 'low', goalCompatibility: ['strength'], styleCompatibility: ['strength_bias'], structureName: 'Upper/Lower + 1 Accessory Day + 2 Recovery (5 lift-ish / 2 recovery)', dayLabels: ['Upper', 'Lower', 'Accessories', 'Rest', 'Upper', 'Lower', 'Rest'], shortLiftingLabel: 'Upper/Lower' },
  // Strength – Strength + cardio
  { id: 'ul7_str_cond', splitFamily: 'upper-lower', dayTypes: ['UPPER', 'CARDIO_INTERVALS', 'LOWER', 'REST', 'UPPER', 'CARDIO_INTERVALS', 'LOWER'], minDaysPerWeek: 7, maxDaysPerWeek: 7, minRecommendedDuration: 30, recoveryRiskProfile: 'low', goalCompatibility: ['strength'], styleCompatibility: ['conditioning'], structureName: 'Upper/Lower + 2 Conditioning Days + 1 Recovery (4 lift / 2 conditioning / 1 recovery)', dayLabels: ['Upper', 'Conditioning', 'Lower', 'Rest', 'Upper', 'Conditioning', 'Lower'], shortLiftingLabel: 'Upper/Lower' },
  // Endurance – Base building
  { id: 'base7_end_base', splitFamily: 'full body', dayTypes: ['CARDIO_STEADY', 'CARDIO_STEADY', 'FULL', 'CARDIO_STEADY', 'CARDIO_STEADY', 'CARDIO_STEADY', 'REST'], minDaysPerWeek: 7, maxDaysPerWeek: 7, minRecommendedDuration: 30, recoveryRiskProfile: 'low', goalCompatibility: ['endurance'], styleCompatibility: ['base'], structureName: 'Base + Strength Support (5 base / 1 strength / 1 recovery)', dayLabels: ['Base', 'Base', 'Strength support', 'Base', 'Base', 'Base', 'Rest'], shortLiftingLabel: 'Base + strength support' },
  // Endurance – Speed/interval focus
  { id: 'base7_end_intervals', splitFamily: 'full body', dayTypes: ['CARDIO_STEADY', 'CARDIO_INTERVALS', 'CARDIO_STEADY', 'CARDIO_INTERVALS', 'FULL', 'CARDIO_STEADY', 'REST'], minDaysPerWeek: 7, maxDaysPerWeek: 7, minRecommendedDuration: 30, recoveryRiskProfile: 'low', goalCompatibility: ['endurance'], styleCompatibility: ['interval_focus'], structureName: '2 Hard + Base + Strength Support (3–4 base / 2 hard / 1 strength / 0–1 recovery)', dayLabels: ['Base', 'Intervals', 'Base', 'Tempo', 'Strength support', 'Base', 'Rest'], shortLiftingLabel: 'Base + strength support' },
  // Endurance – Balanced
  { id: 'base7_end_mixed', splitFamily: 'full body', dayTypes: ['CARDIO_STEADY', 'CARDIO_INTERVALS', 'CARDIO_STEADY', 'CARDIO_STEADY', 'CARDIO_STEADY', 'CARDIO_STEADY', 'REST'], minDaysPerWeek: 7, maxDaysPerWeek: 7, minRecommendedDuration: 30, recoveryRiskProfile: 'low', goalCompatibility: ['endurance'], styleCompatibility: ['mixed_endurance'], structureName: '1 Hard + 1 Moderate + Base (4 base / 1 intervals / 1 tempo / 1 recovery)', dayLabels: ['Base', 'Intervals', 'Base', 'Tempo', 'Base', 'Base', 'Rest'], shortLiftingLabel: 'Base' },
  // Balanced – Balanced
  { id: 'ul7_bal_even', splitFamily: 'upper-lower', dayTypes: ['UPPER', 'CARDIO_STEADY', 'LOWER', 'CARDIO_STEADY', 'UPPER', 'LOWER', 'REST'], minDaysPerWeek: 7, maxDaysPerWeek: 7, minRecommendedDuration: 30, recoveryRiskProfile: 'low', goalCompatibility: ['balanced'], styleCompatibility: ['even_split'], structureName: 'Upper/Lower + 2 Cardio/Recovery (4 lift / 2 cardio / 1 recovery)', dayLabels: ['Upper', 'Easy cardio', 'Lower', 'Easy cardio', 'Upper', 'Lower', 'Rest'], shortLiftingLabel: 'Upper/Lower' },
  // Balanced – More strength
  { id: 'ul7_bal_str', splitFamily: 'upper-lower', dayTypes: ['UPPER', 'CARDIO_STEADY', 'LOWER', 'MOBILITY', 'UPPER', 'LOWER', 'REST'], minDaysPerWeek: 7, maxDaysPerWeek: 7, minRecommendedDuration: 30, recoveryRiskProfile: 'low', goalCompatibility: ['balanced'], styleCompatibility: ['strength_bias'], structureName: 'Upper/Lower + Recovery (4 lift / 3 recovery/mobility)', dayLabels: ['Upper', 'Rest', 'Lower', 'Rest', 'Upper', 'Lower', 'Rest'], shortLiftingLabel: 'Upper/Lower' },
  // Balanced – More muscle (body part + light days)
  { id: 'bp7_bal_muscle', splitFamily: 'body part', dayTypes: ['CHEST', 'BACK', 'LEGS', 'SHOULDERS', 'ARMS', 'CARDIO_STEADY', 'REST'], minDaysPerWeek: 7, maxDaysPerWeek: 7, minRecommendedDuration: 30, recoveryRiskProfile: 'low', goalCompatibility: ['balanced'], styleCompatibility: ['muscle_bias'], structureName: 'Body Part Days + 2 light days (5 body-part / 1 cardio / 1 recovery)', dayLabels: ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Easy cardio', 'Rest'], shortLiftingLabel: 'Body part' },
];

// ---- 2) User context (normalized from inputs) ----
export type Goal = 'fat loss' | 'strength' | 'endurance' | 'hybrid';
export type PlanStyle =
  | 'lift_zone2' | 'lift_intervals' | 'circuit_leaning'
  | 'heavy_compounds' | 'powerbuilding' | 'strength_conditioning'
  | 'base_building' | 'intervals_focus' | 'mixed_endurance'
  | 'even_split' | 'strength_bias' | 'muscle_bias';

export interface UserContext {
  goal: Goal | null;
  planStyle: PlanStyle | null;
  daysPerWeek: number;
  selectedWeekdays: string[];
  durationMin: number;
  durationMax: number;
  durationTarget: number | null; // if preset (min===max and in [30,45,60,75])
  durationClass: DurationClass;
  userSelectedSplit: SplitFamily | 'ai decide' | 'custom' | null;
  // Derived for scoring
  consecutiveRuns: number[]; // e.g. [2, 2] = two runs of 2 consecutive days
  hasRestGaps: boolean;
  weekendIncluded: boolean;
  cardioEmphasis: 'none' | 'low' | 'moderate' | 'high';
  liftingEmphasis: 'moderate' | 'high';
  strengthBias: 'low' | 'medium' | 'high';
  hypertrophyBias: 'low' | 'medium' | 'high';
  densityBias: 'low' | 'high';
  recoveryNeed: 'low' | 'medium' | 'high';
}

const WEEKDAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function getDurationClass(min: number, max: number): DurationClass {
  const mid = (min + max) / 2;
  if (mid <= 35) return 'SHORT';
  if (mid <= 55) return 'MED';
  return 'LONG';
}

export function normalizeContext(params: {
  goal: Goal | null;
  planStyle: PlanStyle | null;
  trainingDays: string[];
  timePerSession: { min: number; max: number };
  trainingSplitPreference: string | null;
}): UserContext {
  const { goal, planStyle, trainingDays, timePerSession, trainingSplitPreference } = params;
  const daysPerWeek = trainingDays.length;
  const durationMin = timePerSession.min;
  const durationMax = timePerSession.max;
  const durationTarget =
    durationMin === durationMax && [30, 45, 60, 75].includes(durationMin) ? durationMin : null;
  const durationClass = getDurationClass(durationMin, durationMax);

  const selectedWeekdays = [...trainingDays].sort(
    (a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b)
  );

  const indices = selectedWeekdays.map((d) => WEEKDAY_ORDER.indexOf(d));
  const consecutiveRuns: number[] = [];
  let run = 1;
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === indices[i - 1] + 1) run++;
    else {
      if (run > 0) consecutiveRuns.push(run);
      run = 1;
    }
  }
  if (run > 0) consecutiveRuns.push(run);

  const hasRestGaps = consecutiveRuns.some((r) => r < daysPerWeek) || consecutiveRuns.length > 1;
  const weekendIncluded =
    selectedWeekdays.includes('Saturday') || selectedWeekdays.includes('Sunday');

  let cardioEmphasis: UserContext['cardioEmphasis'] = 'none';
  let liftingEmphasis: UserContext['liftingEmphasis'] = 'moderate';
  let strengthBias: UserContext['strengthBias'] = 'low';
  let hypertrophyBias: UserContext['hypertrophyBias'] = 'low';
  let densityBias: UserContext['densityBias'] = 'low';
  let recoveryNeed: UserContext['recoveryNeed'] = 'low';

  if (goal === 'fat loss') {
    cardioEmphasis = planStyle === 'lift_zone2' ? 'high' : planStyle === 'lift_intervals' ? 'moderate' : 'low';
    liftingEmphasis = 'high';
    densityBias = planStyle === 'circuit_leaning' ? 'high' : 'low';
    recoveryNeed = planStyle === 'lift_intervals' ? 'medium' : 'low';
  } else if (goal === 'strength') {
    liftingEmphasis = 'high';
    strengthBias = planStyle === 'heavy_compounds' ? 'high' : planStyle === 'powerbuilding' ? 'medium' : 'low';
    hypertrophyBias = planStyle === 'powerbuilding' ? 'medium' : 'low';
    recoveryNeed = planStyle === 'heavy_compounds' ? 'high' : 'medium';
  } else if (goal === 'endurance') {
    cardioEmphasis = 'high';
    liftingEmphasis = 'moderate';
    recoveryNeed = planStyle === 'intervals_focus' ? 'high' : 'medium';
  } else if (goal === 'hybrid') {
    cardioEmphasis = 'low';
    liftingEmphasis = 'high';
    strengthBias = planStyle === 'strength_bias' ? 'high' : 'medium';
    hypertrophyBias = planStyle === 'muscle_bias' ? 'high' : 'medium';
    recoveryNeed = 'medium';
  }

  const userSelectedSplit =
    trainingSplitPreference === 'ai decide' || trainingSplitPreference === 'custom' || !trainingSplitPreference
      ? null
      : (trainingSplitPreference as UserContext['userSelectedSplit']);

  return {
    goal,
    planStyle,
    daysPerWeek,
    selectedWeekdays,
    durationMin,
    durationMax,
    durationTarget,
    durationClass,
    userSelectedSplit,
    consecutiveRuns,
    hasRestGaps,
    weekendIncluded,
    cardioEmphasis,
    liftingEmphasis,
    strengthBias,
    hypertrophyBias,
    densityBias,
    recoveryNeed,
  };
}

// ---- 3) Filter candidates ----
function goalToTag(goal: Goal): PatternTemplate['goalCompatibility'][0] {
  if (goal === 'hybrid') return 'balanced';
  return goal;
}

function planStyleToTags(planStyle: PlanStyle | null): PatternTemplate['styleCompatibility'] {
  if (!planStyle) return [];
  const m: Record<PlanStyle, PatternTemplate['styleCompatibility'][0]> = {
    lift_zone2: 'steady_cardio',
    lift_intervals: 'intervals',
    circuit_leaning: 'circuit',
    heavy_compounds: 'heavy_strength',
    powerbuilding: 'strength_bias',
    strength_conditioning: 'conditioning',
    base_building: 'base',
    intervals_focus: 'interval_focus',
    mixed_endurance: 'mixed_endurance',
    even_split: 'even_split',
    strength_bias: 'strength_bias',
    muscle_bias: 'muscle_bias',
  };
  const t = m[planStyle];
  return t ? [t] : [];
}

function hardFilter(
  template: PatternTemplate,
  ctx: UserContext
): { pass: boolean; warning?: string } {
  if (ctx.daysPerWeek < template.minDaysPerWeek || ctx.daysPerWeek > template.maxDaysPerWeek)
    return { pass: false };
  if (ctx.durationClass === 'SHORT' && template.minRecommendedDuration > 35) {
    const warning =
      template.splitFamily === 'ppl'
        ? 'Push/Pull/Legs usually works best with 45+ min sessions.'
        : 'Works best with 45+ min sessions.';
    return { pass: true, warning };
  }
  return { pass: true };
}

// ---- 4) Score candidate ----
interface ScoreBreakdown {
  goalFit: number;
  styleFit: number;
  timeFit: number;
  scheduleFit: number;
  simplicity: number;
  total: number;
  penalty?: number;
}

function countLowerLegs(dayTypes: DayType[]): number {
  return dayTypes.filter((d) => d === 'LOWER' || d === 'LEGS').length;
}

function scoreCandidate(
  template: PatternTemplate,
  ctx: UserContext,
  warning?: string
): ScoreBreakdown {
  let goalFit = 0;
  let styleFit = 0;
  let timeFit = 0;
  let scheduleFit = 0;
  let simplicity = 0;
  let penalty = 0;

  const goal = ctx.goal;
  const goalTag = goal ? goalToTag(goal) : null;
  const styleTags = planStyleToTags(ctx.planStyle);

  const goalTagForLookup = goalTag ?? null;
  if (goal && goalTagForLookup && template.goalCompatibility.includes(goalTagForLookup)) {
    type GoalTag = PatternTemplate['goalCompatibility'][number];
    const goalScores: Record<SplitFamily, Record<GoalTag, number>> = {
      'full body': { strength: 32, 'fat loss': 35, endurance: 40, balanced: 30 },
      'upper-lower': { strength: 40, 'fat loss': 38, endurance: 34, balanced: 38 },
      ppl: { strength: 28, 'fat loss': 28, endurance: 22, balanced: 36 },
      'body part': { strength: 18, 'fat loss': 22, endurance: 15, balanced: 28 },
    };
    const fam = template.splitFamily;
    goalFit = goalScores[fam]?.[goalTagForLookup] ?? 20;
    if (template.dayTypes.length === 6 && fam === 'ppl') goalFit = Math.min(goalFit + 4, 40);
    if (template.dayTypes.length === 4 && fam === 'upper-lower') goalFit = Math.min(goalFit + 2, 40);
  }

  styleTags.forEach((tag) => {
    if (template.styleCompatibility.includes(tag)) {
      if (tag === 'steady_cardio' && template.dayTypes.includes('CARDIO_STEADY')) styleFit += 25;
      else if (tag === 'intervals' && (template.dayTypes.includes('CARDIO_INTERVALS') || template.dayTypes.some((d) => d === 'REST'))) styleFit += 25;
      else if (tag === 'circuit' && template.splitFamily === 'full body') styleFit += 25;
      else if (tag === 'heavy_strength' && (template.splitFamily === 'upper-lower' || (template.splitFamily === 'full body' && template.dayTypes.length <= 4))) styleFit += 20;
      else if (tag === 'more_muscle' && (template.splitFamily === 'ppl' || template.splitFamily === 'body part')) styleFit += 18;
      else if (tag === 'conditioning' && template.dayTypes.includes('CARDIO_INTERVALS') && template.splitFamily === 'upper-lower') styleFit += 22;
      else if (tag === 'strength_bias' && (template.splitFamily === 'upper-lower' || template.splitFamily === 'full body')) styleFit += 18;
      else styleFit += 15;
    }
  });
  if (styleFit === 0 && styleTags.length > 0) styleFit = 10;
  styleFit = Math.min(25, styleFit);

  const dc = ctx.durationClass;
  const fam = template.splitFamily;
  if (dc === 'SHORT') {
    timeFit = fam === 'full body' ? 15 : fam === 'upper-lower' ? 12 : fam === 'ppl' ? 6 : 5;
  } else if (dc === 'MED') {
    timeFit = fam === 'upper-lower' ? 15 : fam === 'full body' ? 12 : fam === 'ppl' ? 12 : 10;
  } else {
    timeFit = fam === 'ppl' || fam === 'body part' ? 15 : fam === 'upper-lower' ? 12 : 10;
  }
  if (warning) timeFit = Math.max(0, timeFit - 5);

  const lowerLegCount = countLowerLegs(template.dayTypes);
  const maxConsecutive = ctx.consecutiveRuns.length ? Math.max(...ctx.consecutiveRuns) : 0;
  if (lowerLegCount >= 2 && maxConsecutive >= 3) scheduleFit -= 10;
  else if (ctx.hasRestGaps && (fam === 'upper-lower' || fam === 'full body')) scheduleFit += 10;
  if (goal === 'endurance' && template.dayTypes.some((d) => d === 'CARDIO_STEADY' || d === 'CARDIO_INTERVALS')) scheduleFit += 10;
  if (goal === 'endurance' && !template.dayTypes.some((d) => d === 'CARDIO_STEADY' || d === 'CARDIO_INTERVALS')) scheduleFit -= 5;
  scheduleFit = Math.max(0, Math.min(15, scheduleFit + 8));

  if (ctx.durationClass === 'SHORT' || goal === 'fat loss' || goal === 'endurance') {
    if (fam === 'full body' || fam === 'upper-lower') simplicity += 5;
    else simplicity += 2;
  } else if (goal === 'hybrid' && ctx.planStyle === 'muscle_bias' && ctx.daysPerWeek >= 5 && fam === 'ppl') {
    simplicity += 5;
  }
  simplicity = Math.min(5, simplicity);

  const total = goalFit + styleFit + timeFit + scheduleFit + simplicity - (warning ? 3 : 0);
  return {
    goalFit,
    styleFit,
    timeFit,
    scheduleFit,
    simplicity,
    total: Math.max(0, total),
    penalty: warning ? 3 : undefined,
  };
}

// ---- 5) Choose recommended + alternative + reason ----
export type ReasonTag = 'steady_cardio' | 'heavy_strength' | 'more_muscle' | 'schedule_fit' | null;

/** Count lift / cardio / recovery days from pattern (for card display). */
export function countDayTypes(dayTypes: DayType[]): { lift: number; cardio: number; recovery: number } {
  let lift = 0, cardio = 0, recovery = 0;
  for (const d of dayTypes) {
    if (LIFT_DAY_TYPES.includes(d)) lift++;
    else if (CARDIO_DAY_TYPES.includes(d)) cardio++;
    else if (RECOVERY_DAY_TYPES.includes(d)) recovery++;
  }
  return { lift, cardio, recovery };
}

export interface RecommendationResult {
  recommendedSplit: SplitFamily;
  recommendedPattern: DayType[];
  recommendedTemplateId: string;
  /** e.g. "Upper/Lower + Cardio/Recovery" (when template has structureName; else derived from split). */
  recommendedStructureName: string;
  /** Short lifting line for breakdown, e.g. "Full-body circuit", "Upper/Lower" (7d card). */
  recommendedLiftingLabel?: string;
  /** Optional display labels per day for preview (7d templates). */
  recommendedDayLabels?: string[];
  alternativeSplit: SplitFamily | null;
  alternativePattern: DayType[] | null;
  alternativeTemplateId: string | null;
  alternativeStructureName: string | null;
  alternativeDayLabels?: string[] | null;
  /** Lift days / Cardio days / Recovery days for card (e.g. 4 / 2 / 1). */
  liftDays: number;
  cardioDays: number;
  recoveryDays: number;
  reasonText: string;
  reasonTag: ReasonTag; // short tag for tests (which scoring contributor drove the reason)
  reasonBullets: string[];
  suggestedDaySchedules: string[][]; // only when no days selected (Mode A)
  warning?: string;
  recoverySuggestion?: string; // e.g. "For easier recovery, consider Mon/Tue/Thu/Fri." when bad sequencing
}

const SUGGESTED_4D_OPTIONS: string[][] = [
  ['Monday', 'Tuesday', 'Thursday', 'Friday'],
  ['Monday', 'Wednesday', 'Friday', 'Saturday'],
  ['Tuesday', 'Thursday', 'Saturday', 'Sunday'],
];
const SUGGESTED_3D_OPTIONS: string[][] = [
  ['Monday', 'Wednesday', 'Friday'],
  ['Tuesday', 'Thursday', 'Saturday'],
  ['Monday', 'Wednesday', 'Saturday'],
];
const SUGGESTED_5D_OPTIONS: string[][] = [
  ['Monday', 'Tuesday', 'Wednesday', 'Friday', 'Saturday'],
  ['Monday', 'Tuesday', 'Thursday', 'Friday', 'Saturday'],
];
const SUGGESTED_7D_OPTIONS: string[][] = [
  ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
];

function buildReasonText(
  ctx: UserContext,
  template: PatternTemplate,
  breakdown: ScoreBreakdown
): string {
  const parts: string[] = [];
  const d = ctx.daysPerWeek;
  const dc =
    ctx.durationClass === 'SHORT' ? 'short' : ctx.durationClass === 'MED' ? 'medium-length' : 'longer';
  const goalLabel = ctx.goal === 'hybrid' ? 'balanced training' : ctx.goal ?? 'your goal';
  parts.push(`Best fit for ${d} day${d !== 1 ? 's' : ''}/week and ${dc} workouts while prioritizing ${goalLabel}.`);
  if (ctx.goal === 'fat loss' && ctx.planStyle === 'lift_zone2' && template.dayTypes.some((d) => d === 'CARDIO_STEADY'))
    parts.push('Includes steady cardio spacing for recovery.');
  else if (ctx.goal === 'strength' && ctx.planStyle === 'heavy_compounds' && template.splitFamily === 'upper-lower')
    parts.push('Spaces heavy lower-body days for recovery.');
  else if (ctx.goal === 'hybrid' && ctx.planStyle === 'muscle_bias' && template.splitFamily === 'ppl')
    parts.push('Distributes weekly volume across more sessions.');
  else if (breakdown.scheduleFit >= 12 && ctx.hasRestGaps)
    parts.push('Fits your chosen days with good recovery spacing.');
  return parts.join(' ');
}

function buildReasonBullets(ctx: UserContext, template: PatternTemplate): string[] {
  const bullets: string[] = [];
  const goalTag = ctx.goal ? goalToTag(ctx.goal) : 'balanced';
  if (template.goalCompatibility.includes(goalTag)) {
    bullets.push(`Matches your ${ctx.goal === 'hybrid' ? 'balanced' : ctx.goal} goal.`);
  }
  if (ctx.durationClass !== 'SHORT' && (template.splitFamily === 'ppl' || template.splitFamily === 'body part')) {
    bullets.push('Enough time per session for this split.');
  }
  if (ctx.hasRestGaps && template.recoveryRiskProfile === 'low') {
    bullets.push('Recovery-friendly with your day selection.');
  }
  return bullets.slice(0, 2);
}

export function getRecommendation(ctx: UserContext): RecommendationResult | null {
  if (!ctx.goal || ctx.daysPerWeek < 1) return null;

  const candidates = PATTERN_TEMPLATES.filter((t) => {
    const { pass } = hardFilter(t, ctx);
    return pass && t.minDaysPerWeek <= ctx.daysPerWeek && t.maxDaysPerWeek >= ctx.daysPerWeek;
  });

  const withScores: { template: PatternTemplate; breakdown: ScoreBreakdown; warning?: string }[] = [];
  candidates.forEach((t) => {
    const { pass, warning } = hardFilter(t, ctx);
    if (!pass) return;
    const breakdown = scoreCandidate(t, ctx, warning);
    withScores.push({ template: t, breakdown, warning });
  });

  if (withScores.length === 0) {
    const fallback = PATTERN_TEMPLATES.find(
      (t) =>
        t.minDaysPerWeek <= ctx.daysPerWeek &&
        t.maxDaysPerWeek >= ctx.daysPerWeek &&
        (!ctx.userSelectedSplit || t.splitFamily === ctx.userSelectedSplit)
    );
    if (!fallback) return null;
    const breakdown = scoreCandidate(fallback, ctx);
    withScores.push({ template: fallback, breakdown });
  }

  withScores.sort((a, b) => b.breakdown.total - a.breakdown.total);
  const recommended = withScores[0];
  if (!recommended) return null;

  let alternative: (typeof withScores)[0] | null = null;
  for (let i = 1; i < withScores.length; i++) {
    if (withScores[i].template.splitFamily !== recommended.template.splitFamily) {
      alternative = withScores[i];
      break;
    }
  }

  const suggestedDaySchedules =
    ctx.selectedWeekdays.length === 0
      ? ctx.daysPerWeek === 4
        ? SUGGESTED_4D_OPTIONS
        : ctx.daysPerWeek === 3
          ? SUGGESTED_3D_OPTIONS
          : ctx.daysPerWeek === 5
            ? SUGGESTED_5D_OPTIONS
            : ctx.daysPerWeek === 7
              ? SUGGESTED_7D_OPTIONS
              : []
      : [];

  const reasonText = buildReasonText(ctx, recommended.template, recommended.breakdown);
  const reasonBullets = buildReasonBullets(ctx, recommended.template);

  let reasonTag: ReasonTag = null;
  if (ctx.goal === 'fat loss' && ctx.planStyle === 'lift_zone2' && recommended.template.dayTypes.some((d) => d === 'CARDIO_STEADY'))
    reasonTag = 'steady_cardio';
  else if (ctx.goal === 'strength' && ctx.planStyle === 'heavy_compounds' && recommended.template.splitFamily === 'upper-lower')
    reasonTag = 'heavy_strength';
  else if (ctx.goal === 'hybrid' && ctx.planStyle === 'muscle_bias' && recommended.template.splitFamily === 'ppl')
    reasonTag = 'more_muscle';
  else if (recommended.breakdown.scheduleFit >= 12 && ctx.hasRestGaps)
    reasonTag = 'schedule_fit';

  const recCounts = countDayTypes(recommended.template.dayTypes);
  const altCounts = alternative ? countDayTypes(alternative.template.dayTypes) : null;
  const lowerLegCount = countLowerLegs(recommended.template.dayTypes);
  const maxConsecutive = ctx.consecutiveRuns.length ? Math.max(...ctx.consecutiveRuns) : 0;
  const suggestedForRecovery =
    ctx.daysPerWeek === 4
      ? SUGGESTED_4D_OPTIONS[0]
      : ctx.daysPerWeek === 3
        ? SUGGESTED_3D_OPTIONS[0]
        : ctx.daysPerWeek === 5
          ? SUGGESTED_5D_OPTIONS[0]
          : ctx.daysPerWeek === 7
            ? SUGGESTED_7D_OPTIONS[0]
            : null;
  const selectedMatchesSuggested =
    suggestedForRecovery &&
    ctx.selectedWeekdays.length === suggestedForRecovery.length &&
    ctx.selectedWeekdays.every((d, i) => d === suggestedForRecovery![i]);
  const recoverySuggestion =
    ctx.selectedWeekdays.length > 0 &&
    lowerLegCount >= 2 &&
    maxConsecutive >= 2 &&
    suggestedForRecovery &&
    !selectedMatchesSuggested
      ? `For easier recovery, consider ${suggestedForRecovery.map((d) => d.slice(0, 3)).join('/')}.`
      : undefined;

  return {
    recommendedSplit: recommended.template.splitFamily,
    recommendedPattern: recommended.template.dayTypes,
    recommendedTemplateId: recommended.template.id,
    recommendedStructureName: recommended.template.structureName ?? splitFamilyToLabel(recommended.template.splitFamily),
    recommendedLiftingLabel: recommended.template.shortLiftingLabel ?? undefined,
    recommendedDayLabels: recommended.template.dayLabels ?? undefined,
    alternativeSplit: alternative ? alternative.template.splitFamily : null,
    alternativePattern: alternative ? alternative.template.dayTypes : null,
    alternativeTemplateId: alternative ? alternative.template.id : null,
    alternativeStructureName: alternative ? (alternative.template.structureName ?? splitFamilyToLabel(alternative.template.splitFamily)) : null,
    alternativeDayLabels: alternative?.template.dayLabels,
    liftDays: recCounts.lift,
    cardioDays: recCounts.cardio,
    recoveryDays: recCounts.recovery,
    reasonText,
    reasonTag,
    reasonBullets,
    suggestedDaySchedules,
    warning: recommended.warning,
    recoverySuggestion,
  };
}

// ---- 6) Map template to selected weekdays (preview string) ----
export function mapPatternToWeekdays(dayTypes: DayType[], weekdays: string[], dayLabels?: string[]): string {
  if (dayTypes.length === 0 || weekdays.length === 0) return '';
  const labels = dayLabels && dayLabels.length === dayTypes.length
    ? dayLabels
    : dayTypes.map((d) => DAY_TYPE_LABELS[d] ?? d);
  const len = Math.min(labels.length, weekdays.length);
  return Array.from({ length: len }, (_, i) => `${weekdays[i].slice(0, 3)} ${labels[i]}`).join(' • ');
}

export function splitFamilyToLabel(fam: SplitFamily): string {
  return fam === 'full body' ? 'Full Body' : fam === 'upper-lower' ? 'Upper/Lower' : fam === 'ppl' ? 'Push/Pull/Legs' : 'Body Part Days';
}

// ---- 9) Golden scenarios (do not break) ----
export const GOLDEN_SCENARIOS: Array<{
  name: string;
  context: Partial<UserContext> & { goal: Goal; planStyle: PlanStyle; daysPerWeek: number; selectedWeekdays: string[]; durationMin: number; durationMax: number };
  expectedRecommendedSplit: SplitFamily;
}> = [
  {
    name: 'Strength + Heavy + 4d + 30 min + Mon/Tue/Thu/Fri',
    context: {
      goal: 'strength',
      planStyle: 'heavy_compounds',
      daysPerWeek: 4,
      selectedWeekdays: ['Monday', 'Tuesday', 'Thursday', 'Friday'],
      durationMin: 30,
      durationMax: 30,
      durationTarget: 30,
      durationClass: 'SHORT',
      userSelectedSplit: null,
      consecutiveRuns: [2, 2],
      hasRestGaps: true,
      weekendIncluded: false,
      cardioEmphasis: 'none',
      liftingEmphasis: 'high',
      strengthBias: 'high',
      hypertrophyBias: 'low',
      densityBias: 'low',
      recoveryNeed: 'high',
    },
    expectedRecommendedSplit: 'upper-lower',
  },
  {
    name: 'Fat loss + Steady + 4d + 30 min',
    context: {
      goal: 'fat loss',
      planStyle: 'lift_zone2',
      daysPerWeek: 4,
      selectedWeekdays: ['Monday', 'Tuesday', 'Thursday', 'Friday'],
      durationMin: 30,
      durationMax: 30,
      durationClass: 'SHORT',
      userSelectedSplit: null,
      cardioEmphasis: 'high',
      liftingEmphasis: 'high',
      strengthBias: 'low',
      hypertrophyBias: 'low',
      densityBias: 'low',
      recoveryNeed: 'low',
    },
    expectedRecommendedSplit: 'upper-lower',
  },
  {
    name: 'Balanced + More muscle + 5d + 60 min',
    context: {
      goal: 'hybrid',
      planStyle: 'muscle_bias',
      daysPerWeek: 5,
      selectedWeekdays: ['Monday', 'Tuesday', 'Wednesday', 'Friday', 'Saturday'],
      durationMin: 60,
      durationMax: 60,
      durationClass: 'LONG',
      userSelectedSplit: null,
      cardioEmphasis: 'low',
      liftingEmphasis: 'high',
      strengthBias: 'medium',
      hypertrophyBias: 'high',
      densityBias: 'low',
      recoveryNeed: 'medium',
    },
    expectedRecommendedSplit: 'ppl',
  },
  {
    name: 'Endurance + Base + 5d + 30–45 min',
    context: {
      goal: 'endurance',
      planStyle: 'base_building',
      daysPerWeek: 5,
      selectedWeekdays: ['Monday', 'Tuesday', 'Thursday', 'Friday', 'Saturday'],
      durationMin: 30,
      durationMax: 45,
      durationClass: 'MED',
      userSelectedSplit: null,
      cardioEmphasis: 'high',
      liftingEmphasis: 'moderate',
      strengthBias: 'low',
      hypertrophyBias: 'low',
      densityBias: 'low',
      recoveryNeed: 'medium',
    },
    expectedRecommendedSplit: 'upper-lower',
  },
];

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

/** Run golden scenarios and return pass/fail (for tests or internal telemetry). */
export function runGoldenScenarios(): Array<{ name: string; pass: boolean; expected: SplitFamily; got: SplitFamily | null }> {
  return GOLDEN_SCENARIOS.map((s) => {
    const ctx: UserContext = { ...DEFAULT_CTX, ...s.context };
    const result = getRecommendation(ctx);
    const got = result?.recommendedSplit ?? null;
    return {
      name: s.name,
      pass: got === s.expectedRecommendedSplit,
      expected: s.expectedRecommendedSplit,
      got,
    };
  });
}
