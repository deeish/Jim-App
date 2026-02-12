/**
 * Build canonical PlanInputs from Generate Plan form state.
 * Call this once when user taps "Generate Week 1 Preview"; use result downstream only.
 */

import type {
  PlanInputs,
  GoalId,
  SplitPreferenceId,
  LocationId,
  DetailLevelId,
  ProgressionStyleId,
  CustomSplitInput,
  DayTemplateSpec,
  DurationOverrides,
  HardDayLimitsInput,
  InjuriesAvoidInput,
  CurrentActivityLevelId,
  Weekday,
} from '../types/plan';

const BODY_AREAS = ['knees', 'shoulders', 'lower back'];

export interface FormStateForPlanInputs {
  goal: 'fat loss' | 'strength' | 'endurance' | 'hybrid' | null;
  programType: string | null;
  trainingDays: Weekday[];
  timePerSession: { min: number; max: number };
  primaryLocation: 'gym' | 'home' | null;
  weeks: number;
  workoutDetailLevel: 'simple' | 'detailed';
  progressionStyle: 'build' | 'build + deload' | 'maintain' | null;
  maxHardDaysInRow: number;
  maxHardDaysPerWeek: number;
  avoidList: string[];
  sessionCaps: {
    strength: { min: number; max: number };
    cardio: { min: number; max: number };
    recovery: { min: number; max: number };
  };
  useAdvancedDurationCaps?: boolean;
  trainingSplitPreference: string | null;
  customSplit: {
    name?: string;
    templates: { primaries: string[]; secondaries: string[] }[];
    rotationRule: 'repeat_weekly' | 'rotate_forward' | 'auto_balance';
    abs: string;
    cardio: string;
  } | null;
  currentActivityLevel?: string | null;
  preferredExercises?: string[];
}

export interface BuildPlanInputsOptions {
  form: FormStateForPlanInputs;
  effectiveSplitPreference: string | null;
  useRecommended: boolean;
}

function toGoalId(goal: FormStateForPlanInputs['goal']): GoalId {
  if (!goal) return 'balanced';
  if (goal === 'fat loss') return 'fat_loss';
  if (goal === 'hybrid') return 'balanced';
  return goal as GoalId;
}

function toSplitPreferenceId(
  pref: string | null,
  effective: string | null
): SplitPreferenceId {
  const p = effective ?? pref;
  if (!p) return 'auto';
  if (p === 'full body') return 'full_body';
  if (p === 'upper-lower') return 'upper_lower';
  if (p === 'ppl') return 'ppl';
  if (p === 'body part') return 'body_part_days';
  if (p === 'custom') return 'custom';
  return 'auto';
}

function toProgressionStyleId(
  style: FormStateForPlanInputs['progressionStyle']
): ProgressionStyleId | null {
  if (!style) return null;
  if (style === 'build + deload') return 'build_deload';
  return style as ProgressionStyleId;
}

function toCustomSplitInput(
  custom: FormStateForPlanInputs['customSplit']
): CustomSplitInput | null {
  if (!custom || !custom.templates.length) return null;
  const dayTemplates: DayTemplateSpec[] = custom.templates.map((t) => ({
    primaryGroups: t.primaries ?? [],
    secondaryGroups: t.secondaries ?? [],
  }));
  return {
    name: custom.name,
    dayTemplates,
    cycleMode: custom.rotationRule as CustomSplitInput['cycleMode'],
    absPreference: (custom.abs || 'none') as CustomSplitInput['absPreference'],
    cardioPreference: (custom.cardio || 'none') as CustomSplitInput['cardioPreference'],
  };
}

function toInjuriesAvoid(avoidList: string[]): InjuriesAvoidInput {
  const bodyAreas = avoidList.filter((a) => BODY_AREAS.includes(a));
  const movementsOrEquipment = avoidList.filter((a) => !BODY_AREAS.includes(a));
  return { bodyAreas, movementsOrEquipment };
}

/**
 * Build a single PlanInputs snapshot from current form state and effective choices.
 * Use this result as the only input for the generation pipeline and Preview.
 */
export function buildPlanInputs(options: BuildPlanInputsOptions): PlanInputs {
  const { form, effectiveSplitPreference, useRecommended } = options;
  const daysPerWeek = form.trainingDays.length;
  const durationMode =
    form.timePerSession.min === form.timePerSession.max ? 'fixed' : 'range';

  const planStyleId = form.programType || 'steady+lift';

  const location: LocationId =
    form.primaryLocation === 'gym' ? 'gym' : form.primaryLocation === 'home' ? 'home' : 'gym';

  const durationOverrides: PlanInputs['durationOverrides'] = form.useAdvancedDurationCaps
    ? {
        strengthMin: form.sessionCaps.strength.min,
        strengthMax: form.sessionCaps.strength.max,
        cardioMin: form.sessionCaps.cardio.min,
        cardioMax: form.sessionCaps.cardio.max,
        recoveryMin: form.sessionCaps.recovery.min,
        recoveryMax: form.sessionCaps.recovery.max,
      }
    : null;

  const hardDayLimits: HardDayLimitsInput = {
    enabled: form.maxHardDaysInRow === 1,
    maxHardDaysPerWeek: form.maxHardDaysPerWeek,
    maxHardDaysInARow: form.maxHardDaysInRow,
  };

  const injuriesAvoid = toInjuriesAvoid(form.avoidList);

  const currentActivityLevel: CurrentActivityLevelId | null =
    (form.currentActivityLevel as CurrentActivityLevelId) ?? null;

  return {
    goal: toGoalId(form.goal),
    selectedWeekdays: form.trainingDays,
    daysPerWeek,
    durationMode,
    durationMin: form.timePerSession.min,
    durationMax: form.timePerSession.max,
    planStyleId,
    splitPreference: toSplitPreferenceId(
      form.trainingSplitPreference,
      effectiveSplitPreference
    ),
    useRecommended,
    customSplit: toCustomSplitInput(form.customSplit),
    location,
    weeksCount: form.weeks,
    detailLevel: form.workoutDetailLevel as DetailLevelId,
    progressionStyle: toProgressionStyleId(form.progressionStyle),
    durationOverrides,
    hardDayLimits,
    injuriesAvoid,
    currentActivityLevel,
    preferredExercises: form.preferredExercises ?? [],
  };
}

/** Map PlanInputs back to form-like state for re-hydrating the Generate Plan form (Edit Inputs round-trip). */
export function planInputsToFormPatch(inputs: PlanInputs): Partial<{
  goal: 'fat loss' | 'strength' | 'endurance' | 'hybrid' | null;
  programType: string | null;
  trainingDays: Weekday[];
  timePerSession: { min: number; max: number };
  primaryLocation: 'gym' | 'home' | null;
  weeks: number;
  workoutDetailLevel: 'simple' | 'detailed';
  progressionStyle: 'build' | 'build + deload' | 'maintain' | null;
  maxHardDaysInRow: number;
  maxHardDaysPerWeek: number;
  avoidList: string[];
  sessionCaps: { strength: { min: number; max: number }; cardio: { min: number; max: number }; recovery: { min: number; max: number } };
  useAdvancedDurationCaps: boolean;
  trainingSplitPreference: string | null;
  customSplit: { name?: string; templates: { primaries: string[]; secondaries: string[] }[]; rotationRule: string; abs: string; cardio: string } | null;
  currentActivityLevel: string | null;
  preferredExercises: string[];
}> {
  const goal =
    inputs.goal === 'fat_loss'
      ? ('fat loss' as const)
      : inputs.goal === 'balanced'
        ? ('hybrid' as const)
        : (inputs.goal as 'strength' | 'endurance');
  const trainingSplitPreference =
    inputs.splitPreference === 'full_body'
      ? 'full body'
      : inputs.splitPreference === 'upper_lower'
        ? 'upper-lower'
        : inputs.splitPreference === 'ppl'
          ? 'ppl'
          : inputs.splitPreference === 'body_part_days'
            ? 'body part'
            : inputs.splitPreference === 'custom'
              ? 'custom'
              : 'ai decide';
  const primaryLocation = inputs.location === 'gym' ? 'gym' : inputs.location === 'home' ? 'home' : 'gym';
  const avoidList = [
    ...(inputs.injuriesAvoid?.bodyAreas ?? []),
    ...(inputs.injuriesAvoid?.movementsOrEquipment ?? []),
  ];
  const customSplit = inputs.customSplit
    ? {
        name: inputs.customSplit.name,
        templates: inputs.customSplit.dayTemplates.map((t) => ({
          primaries: t.primaryGroups ?? [],
          secondaries: t.secondaryGroups ?? [],
        })),
        rotationRule: inputs.customSplit.cycleMode,
        abs: inputs.customSplit.absPreference,
        cardio: inputs.customSplit.cardioPreference,
      }
    : null;
  const progressionStyle =
    inputs.progressionStyle === 'build_deload'
      ? ('build + deload' as const)
      : (inputs.progressionStyle as 'build' | 'maintain' | null);
  return {
    goal,
    programType: inputs.planStyleId || null,
    trainingDays: inputs.selectedWeekdays,
    timePerSession: { min: inputs.durationMin, max: inputs.durationMax },
    primaryLocation,
    weeks: inputs.weeksCount,
    workoutDetailLevel: inputs.detailLevel,
    progressionStyle,
    maxHardDaysInRow: inputs.hardDayLimits?.maxHardDaysInARow ?? 1,
    maxHardDaysPerWeek: inputs.hardDayLimits?.maxHardDaysPerWeek ?? 2,
    avoidList,
    sessionCaps: inputs.durationOverrides
      ? {
          strength: { min: inputs.durationOverrides.strengthMin, max: inputs.durationOverrides.strengthMax },
          cardio: { min: inputs.durationOverrides.cardioMin, max: inputs.durationOverrides.cardioMax },
          recovery: { min: inputs.durationOverrides.recoveryMin, max: inputs.durationOverrides.recoveryMax },
        }
      : { strength: { min: 45, max: 60 }, cardio: { min: 20, max: 45 }, recovery: { min: 10, max: 20 } },
    useAdvancedDurationCaps: !!inputs.durationOverrides,
    trainingSplitPreference,
    customSplit,
    currentActivityLevel: inputs.currentActivityLevel ?? null,
    preferredExercises: inputs.preferredExercises ?? [],
  };
}
