/**
 * Generation pipeline: PlanInputs → stages 1–7 → PlanDraft.
 * Stages 1–4 + 7 in code; stages 5–6 call backend LLM and normalize response.
 */

import type {
  PlanInputs,
  PlanDraft,
  WeekDraft,
  DayDraft,
  SessionDraft,
  ExerciseDraft,
  Weekday,
  PlanDraftMetrics,
} from '../types/plan';
import type {
  EffectiveSplitResult,
  DaySkeleton,
  WeekSkeleton,
  SessionTypePlaceholder,
  TemplateAssignments,
  SessionSpec,
  WeekSessionSpecs,
} from '../types/pipeline';
import { normalizeContext, getRecommendation, type Goal, type PlanStyle } from './planRecommendation';
import {
  generateSessions,
  repairProgramSessions,
  GENERATE_SESSIONS_TIMEOUT_MESSAGE,
  isGenerateSessionsTimeoutError,
  type GenerateSessionResult,
  type PlanSlotExercise,
} from '../services/planService';
import {
  exerciseUsesTimeDisplay,
  type ExercisePrescriptionType,
} from './exercisePrescription';
import {
  formatExerciseRepsDisplay,
  formatRepRange,
} from './formatExerciseRepsDisplay';
import { mesoHintForGenerateSessions, weekProgressionForGenerateSessions } from './planGenerationSummary';
import {
  exercisesLikeFromPrescription,
  getWorkoutDisplayEstimateMinutes,
} from './estimateWorkoutMinutes';
import type { WorkoutPreview } from '../services/workoutService';
import { shortBodyTagLabel, parseCardioFinisherRow } from './previewExerciseMeta';

export { isTimeHoldExerciseName } from './exercisePrescription';
export { formatDraftReps, formatExerciseRepsDisplay, formatRepRange } from './formatExerciseRepsDisplay';

const WEEKDAYS: Weekday[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

function coalesceSecondaryMuscleGroups(e: {
  secondaryMuscleGroups?: string[];
  secondaryMuscleGroup?: string;
}): string[] | undefined {
  const fromArr = (e.secondaryMuscleGroups ?? [])
    .map((s) => (s ?? '').trim())
    .filter(Boolean);
  if (fromArr.length) return fromArr;
  const one = (e.secondaryMuscleGroup ?? '').trim();
  return one ? [one] : undefined;
}

/** Map one generate-sessions exercise into a draft row (single place for reps + muscle metadata). */
function parseRepsNumberForApi(e: ExerciseDraft): number {
  if (typeof e.repsRaw === 'number' && Number.isFinite(e.repsRaw)) {
    return Math.round(e.repsRaw);
  }
  const m = String(e.reps ?? '').match(/\d+/);
  if (m) return parseInt(m[0]!, 10);
  return 8;
}

/** Inverse of {@link exerciseDraftFromGenerateResult} for POST /plans/repair-program-sessions. */
export function sessionDraftToGenerateSessionResult(
  session: SessionDraft | null | undefined,
  weekIndex: number,
  weekday: Weekday,
): GenerateSessionResult {
  if (!session) {
    return {
      weekIndex,
      weekday,
      name: '',
      exercises: [],
    };
  }
  const exercises = (session.exercises ?? []).map((e) => ({
    name: e.name ?? 'Exercise',
    sets: typeof e.sets === 'number' && e.sets > 0 ? e.sets : 3,
    reps: parseRepsNumberForApi(e),
    notes: e.notes,
    exerciseId: e.exerciseId ?? undefined,
    prescriptionType: e.prescriptionType,
    primaryMuscleGroup: e.primaryMuscleGroup,
    secondaryMuscleGroups: e.secondaryMuscleGroups,
  }));
  return {
    weekIndex,
    weekday,
    name: session.title ?? 'Session',
    reasoning: session.whyThisWorkout,
    warmUp: session.warmup,
    coolDown: session.cooldown,
    cardioFinisher: session.cardioFinisher,
    exercises,
  };
}

/** Flatten merged weeks to API session rows in the same order as {@link buildGenerateSessionsRequest}. */
export function buildGeneratedSessionsFromMergedDraft(
  weekSpecs: WeekSessionSpecs[],
  weeks: WeekDraft[],
): GenerateSessionResult[] {
  const weekByIndex = new Map(weeks.map((w) => [w.weekIndex, w]));
  const out: GenerateSessionResult[] = [];
  for (const ws of weekSpecs) {
    const wdraft = weekByIndex.get(ws.weekIndex);
    for (let i = 0; i < ws.specs.length; i++) {
      const spec = ws.specs[i];
      if (!spec) continue;
      const weekday = WEEKDAYS[i]!;
      const day = wdraft?.days.find((d) => d.weekday === weekday);
      out.push(sessionDraftToGenerateSessionResult(day?.session, ws.weekIndex, weekday));
    }
  }
  return out;
}

export function exerciseDraftFromGenerateResult(
  e: GenerateSessionResult['exercises'][number],
  planInputs: PlanInputs,
): ExerciseDraft {
  const rawReps = typeof e.reps === 'number' ? e.reps : NaN;
  const isTime = exerciseUsesTimeDisplay(
    e.prescriptionType,
    e.name ?? '',
    e.primaryMuscleGroup,
  );
  // Prefer the server-stamped range ("8–12") for the display string; only fall
  // back to deriving a band from a single number on legacy/range-less rows.
  const repsDisplay = isTime
    ? formatExerciseRepsDisplay(
        e.name ?? 'Exercise',
        e.durationSeconds ?? (Number.isFinite(rawReps) ? rawReps : String(e.reps ?? '')),
        planInputs.goal,
        e.prescriptionType,
        e.primaryMuscleGroup,
      )
    : (formatRepRange(e.repsMin, e.repsMax) ??
      formatExerciseRepsDisplay(
        e.name ?? 'Exercise',
        Number.isFinite(rawReps) ? rawReps : String(e.reps ?? ''),
        planInputs.goal,
        e.prescriptionType,
        e.primaryMuscleGroup,
      ));
  return {
    exerciseId: e.exerciseId ?? null,
    name: e.name ?? 'Exercise',
    sets: typeof e.sets === 'number' ? e.sets : 3,
    reps: repsDisplay,
    repsRaw: Number.isFinite(rawReps) ? rawReps : undefined,
    repsMin: e.repsMin,
    repsMax: e.repsMax,
    durationSeconds: e.durationSeconds,
    prescriptionType: e.prescriptionType,
    primaryMuscleGroup: e.primaryMuscleGroup,
    secondaryMuscleGroups: coalesceSecondaryMuscleGroups(e),
    ...(typeof e.restSeconds === 'number' && e.restSeconds > 0
      ? { restSeconds: e.restSeconds }
      : {}),
    notes: e.notes,
  };
}

/** Preview modal payload from a pipeline session (chips, cardio finisher row). */
export function buildWorkoutPreviewFromSessionDraft(
  session: SessionDraft,
  cardTitle: string,
  options?: { goal?: PlanInputs['goal'] },
): WorkoutPreview {
  const goal = options?.goal;
  const working = session.exercises.filter((e) => (e.sets ?? 0) > 0);
  const exercises: WorkoutPreview['exercises'] = working.map((e, idx) => ({
    name: e.name,
    sets: e.sets,
    reps: previewRepsLineForGoal(e, goal),
    orderIndex: idx,
    exerciseId: e.exerciseId ?? undefined,
    prescriptionType: e.prescriptionType,
    primaryMuscleGroup: e.primaryMuscleGroup,
    secondaryMuscleGroups: e.secondaryMuscleGroups?.length ? [...e.secondaryMuscleGroups] : undefined,
    bodyTag: shortBodyTagLabel(e.primaryMuscleGroup, e.name),
    ...(typeof e.restSeconds === 'number' && e.restSeconds > 0
      ? { restSeconds: e.restSeconds }
      : {}),
    ...(e.notes?.trim() ? { notes: e.notes.trim() } : {}),
  }));

  if (session.cardioFinisher?.suggestion?.trim()) {
    const fin = parseCardioFinisherRow(session.cardioFinisher.suggestion);
    exercises.push({
      name: fin.name,
      sets: 1,
      reps: fin.reps,
      orderIndex: exercises.length,
      prescriptionType: 'time',
      primaryMuscleGroup: 'Cardio',
      bodyTag: 'Cardio',
      isSyntheticFinisher: true,
    });
  }

  return {
    name: cardTitle,
    reasoning: session.whyThisWorkout,
    warmUp: session.warmup,
    coolDown: session.cooldown,
    exercises,
  };
}

/** Groq / alternate preview: format reps and attach body-part chip label. */
export function mapGroqPreviewExercise(
  e: {
    name: string;
    sets: number;
    reps: number | string;
    weight?: number;
    notes?: string;
    prescriptionType?: ExercisePrescriptionType;
    exerciseId?: string;
    primaryMuscleGroup?: string;
    secondaryMuscleGroups?: string[];
    secondaryMuscleGroup?: string;
    restSeconds?: number;
  },
  idx: number,
  goal: PlanInputs['goal'],
): WorkoutPreview['exercises'][number] {
  return {
    name: e.name,
    sets: e.sets,
    reps: formatExerciseRepsDisplay(
      e.name,
      typeof e.reps === 'number' ? e.reps : String(e.reps ?? ''),
      goal,
      e.prescriptionType,
      e.primaryMuscleGroup,
    ),
    weight: e.weight,
    notes: e.notes,
    orderIndex: idx,
    exerciseId: typeof e.exerciseId === 'string' ? e.exerciseId : undefined,
    prescriptionType: e.prescriptionType,
    primaryMuscleGroup: e.primaryMuscleGroup,
    secondaryMuscleGroups: coalesceSecondaryMuscleGroups(e),
    bodyTag: shortBodyTagLabel(e.primaryMuscleGroup, e.name),
    ...(typeof e.restSeconds === 'number' && e.restSeconds > 0
      ? { restSeconds: e.restSeconds }
      : {}),
  };
}

/** Single-line preview reps from draft: prefer scalar + user's plan goal over a frozen string. */
function previewRepsLineForGoal(e: ExerciseDraft, goal: PlanInputs['goal'] | undefined): string {
  const isTime = exerciseUsesTimeDisplay(e.prescriptionType, e.name, e.primaryMuscleGroup);
  // Stored range wins for non-time rows ("8–12"); no fabricated band.
  if (!isTime) {
    const range = formatRepRange(e.repsMin, e.repsMax);
    if (range) return range;
  }
  if (!goal) return e.reps;
  const seed = isTime ? (e.durationSeconds ?? e.repsRaw) : e.repsRaw;
  if (seed != null && Number.isFinite(seed) && seed > 0) {
    return formatExerciseRepsDisplay(
      e.name,
      Math.round(seed),
      goal,
      e.prescriptionType,
      e.primaryMuscleGroup,
    );
  }
  const str = String(e.reps ?? '').trim();
  if (/^\d+$/.test(str)) {
    return formatExerciseRepsDisplay(
      e.name,
      parseInt(str, 10),
      goal,
      e.prescriptionType,
      e.primaryMuscleGroup,
    );
  }
  return e.reps;
}

function goalToRecommendation(goal: PlanInputs['goal']): Goal | null {
  if (goal === 'fat_loss') return 'fat loss';
  if (goal === 'strength') return 'strength';
  if (goal === 'endurance') return 'endurance';
  if (goal === 'balanced') return 'hybrid';
  return null;
}

const PLAN_STYLE_IDS: PlanStyle[] = [
  'lift_zone2',
  'lift_intervals',
  'circuit_leaning',
  'heavy_compounds',
  'powerbuilding',
  'strength_conditioning',
  'base_building',
  'intervals_focus',
  'mixed_endurance',
  'even_split',
  'strength_bias',
  'muscle_bias',
];

function planStyleIdToPlanStyle(planStyleId: string): PlanStyle | null {
  const id = (planStyleId || '').toLowerCase().replace(/[\s+]/g, '_');
  return (PLAN_STYLE_IDS as readonly string[]).includes(id) ? (id as PlanStyle) : null;
}

function splitPreferenceToFamily(
  splitPreference: PlanInputs['splitPreference']
): 'full body' | 'upper-lower' | 'ppl' | 'body part' | null {
  if (splitPreference === 'full_body') return 'full body';
  if (splitPreference === 'upper_lower') return 'upper-lower';
  if (splitPreference === 'ppl') return 'ppl';
  if (splitPreference === 'body_part_days') return 'body part';
  return null;
}

// --- Stage 1: Resolve effective split
function stage1EffectiveSplit(inputs: PlanInputs): EffectiveSplitResult {
  const useAuto =
    inputs.splitPreference === 'auto' ||
    (inputs.splitPreference !== 'custom' && inputs.useRecommended);
  const goal = goalToRecommendation(inputs.goal);
  const planStyle = planStyleIdToPlanStyle(inputs.planStyleId);

  if (useAuto && goal && inputs.daysPerWeek >= 1) {
    const trainingSplitForCtx =
      inputs.splitPreference === 'auto'
        ? 'ai decide'
        : inputs.splitPreference === 'custom'
          ? 'custom'
          : splitPreferenceToFamily(inputs.splitPreference);
    const ctx = normalizeContext({
      goal,
      planStyle,
      trainingDays: inputs.selectedWeekdays,
      timePerSession: { min: inputs.durationMin, max: inputs.durationMax },
      trainingSplitPreference: trainingSplitForCtx ?? 'ai decide',
    });
    const rec = getRecommendation(ctx);
    const effectiveId = rec?.recommendedSplit ?? 'full body';
    return {
      effectiveSplitId: effectiveId.replace(/\s/g, '_').toLowerCase(),
      effectiveSplitMeta: { source: 'recommendation', recommendedPattern: rec?.recommendedPattern },
    };
  }

  if (inputs.splitPreference === 'custom' && inputs.customSplit?.dayTemplates?.length) {
    return {
      effectiveSplitId: 'custom',
      effectiveSplitMeta: { name: inputs.customSplit.name, dayCount: inputs.customSplit.dayTemplates.length },
    };
  }

  const family = splitPreferenceToFamily(inputs.splitPreference);
  const effectiveId = family ? family.replace(/\s/g, '_').toLowerCase() : 'full_body';
  return { effectiveSplitId: effectiveId, effectiveSplitMeta: { source: 'user' } };
}

/** Stage 1 may emit hyphenated ids (e.g. upper-lower); normalize for comparisons. */
function normalizeEffectiveSplitId(id: string | undefined): string {
  return (id ?? 'full_body').toLowerCase().replace(/-/g, '_');
}

/** Strength day labels aligned with Stage 1 / Stage 2 (`body_part` is Stage 1 id for body-part days). */
function strengthTitlesFromNormalizedSplitId(normalizedId: string): string[] {
  if (normalizedId === 'full_body') return ['Full Body'];
  if (normalizedId === 'upper_lower') return ['Upper', 'Lower'];
  if (normalizedId === 'ppl') return ['Push', 'Pull', 'Legs'];
  if (normalizedId === 'body_part_days' || normalizedId === 'body_part') {
    return ['Push', 'Pull', 'Legs', 'Upper', 'Lower'];
  }
  return ['Full Body'];
}

// --- Stage 2: Week skeleton (which days are strength/cardio/recovery/rest)
function stage2WeekSkeleton(inputs: PlanInputs, effective: EffectiveSplitResult): WeekSkeleton[] {
  const selectedSet = new Set(inputs.selectedWeekdays);
  const forceOneRest = inputs.selectedWeekdays.length >= 7;
  const cardioPreference = inputs.customSplit?.cardioPreference ?? 'none';
  const esid = normalizeEffectiveSplitId(effective.effectiveSplitId);
  const strengthTemplatesCount =
    esid === 'custom'
      ? Math.max(1, inputs.customSplit?.dayTemplates?.length ?? 1)
      : esid === 'full_body'
        ? 1
        : esid === 'upper_lower'
          ? 2
          : esid === 'ppl'
            ? 3
            : 4;
  /**
   * Dedicated cardio *days* when custom split asks for them, or for **endurance** goal on preset splits
   * so the week is not only strength labels (finishers inside strength stay separate).
   */
  const hasCardioSlot =
    cardioPreference !== 'none' ||
    (inputs.goal === 'endurance' && inputs.splitPreference !== 'custom');
  const sessionSlotsPerCycle = strengthTemplatesCount + (hasCardioSlot ? 1 : 0);

  const restDayIndex = forceOneRest && inputs.selectedWeekdays.length === 7 ? 6 : -1;

  const assignType = (weekday: Weekday): SessionTypePlaceholder => {
    if (!selectedSet.has(weekday)) return 'rest';
    const dayIndex = inputs.selectedWeekdays.indexOf(weekday);
    if (dayIndex < 0) return 'rest';
    if (dayIndex === restDayIndex) return 'rest';
    const sessionSlotIndex = restDayIndex >= 0 && dayIndex > restDayIndex ? dayIndex - 1 : dayIndex;
    const slot = sessionSlotIndex % sessionSlotsPerCycle;
    if (hasCardioSlot && slot === strengthTemplatesCount) return 'cardio';
    return 'strength';
  };

  const weeks: WeekSkeleton[] = [];
  for (let w = 0; w < inputs.weeksCount; w++) {
    const days: DaySkeleton[] = WEEKDAYS.map((weekday) => ({
      weekday,
      sessionType: assignType(weekday),
    }));
    weeks.push({ weekIndex: w + 1, days });
  }
  return weeks;
}

// --- Stage 3: Template assignments (titles per strength day)
function stage3TemplateAssignments(
  inputs: PlanInputs,
  skeletons: WeekSkeleton[],
  stage1: EffectiveSplitResult,
): TemplateAssignments {
  const byDay: TemplateAssignments['byDay'] = {};
  const customTemplates = inputs.customSplit?.dayTemplates ?? [];
  const cycleMode = inputs.customSplit?.cycleMode ?? 'repeat_weekly';

  const useCustomTitles =
    inputs.splitPreference === 'custom' && customTemplates.length > 0;
  const strengthTitles: string[] = useCustomTitles
    ? customTemplates.map((t, i) => t.primaryGroups?.[0] ?? `Day ${i + 1}`)
    : strengthTitlesFromNormalizedSplitId(
        normalizeEffectiveSplitId(stage1.effectiveSplitId),
      );

  skeletons.forEach((sk) => {
    sk.days.forEach((d, dayIdx) => {
      if (d.sessionType !== 'strength') return;
      const key = `${sk.weekIndex}-${d.weekday}`;
      let templateIndex = 0;
      const strengthDayIndex = sk.days
        .filter((x) => x.sessionType === 'strength')
        .indexOf(d);
      if (useCustomTitles) {
        if (cycleMode === 'rotate_forward') {
          templateIndex = (sk.weekIndex - 1 + strengthDayIndex) % customTemplates.length;
        } else {
          templateIndex = strengthDayIndex % customTemplates.length;
        }
      } else {
        templateIndex = strengthDayIndex % strengthTitles.length;
      }
      const title = strengthTitles[templateIndex] ?? 'Full Body';
      byDay[key] = { templateId: title.toLowerCase().replace(/\s/g, '_'), index: templateIndex, reason: 'skeleton' };
    });
  });
  return { byDay };
}

// --- Stage 4: Session specs (pre-AI). Uses variant titles (Upper 1, Upper 2, etc.) to reduce repetition.
function stage4SessionSpecs(
  inputs: PlanInputs,
  skeletons: WeekSkeleton[],
  assignments: TemplateAssignments
): WeekSessionSpecs[] {
  const maxHardPerWeek = inputs.hardDayLimits?.maxHardDaysPerWeek ?? 3;

  return skeletons.map((sk) => {
    let hardCount = 0;
    const templateCountThisWeek: Record<string, number> = {};
    const specs: (SessionSpec | null)[] = sk.days.map((d) => {
      if (d.sessionType === 'rest') return null;
      const key = `${sk.weekIndex}-${d.weekday}`;
      const assignment = assignments.byDay[key];
      let baseTitle =
        d.sessionType === 'strength'
          ? assignment
            ? (assignment.templateId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
            : 'Full Body'
          : d.sessionType === 'cardio'
            ? 'Cardio'
            : 'Recovery';
      // Differentiate repeated types in the same week (e.g. Upper 1, Upper 2, Lower 1, Lower 2)
      if (d.sessionType === 'strength' && baseTitle !== 'Full Body') {
        const normalized = baseTitle.toLowerCase().replace(/\s/g, '');
        const count = (templateCountThisWeek[normalized] = (templateCountThisWeek[normalized] ?? 0) + 1);
        if (count > 1) baseTitle = `${baseTitle} ${count}`;
      }
      const title = baseTitle;

      const isHard = inputs.hardDayLimits?.enabled
        ? hardCount < maxHardPerWeek && d.sessionType === 'strength'
        : d.sessionType === 'strength';
      if (isHard && d.sessionType === 'strength') hardCount++;

      const dur = inputs.durationOverrides
        ? d.sessionType === 'strength'
          ? { min: inputs.durationOverrides.strengthMin, max: inputs.durationOverrides.strengthMax }
          : d.sessionType === 'cardio'
            ? { min: inputs.durationOverrides.cardioMin, max: inputs.durationOverrides.cardioMax }
            : { min: inputs.durationOverrides.recoveryMin, max: inputs.durationOverrides.recoveryMax }
        : { min: inputs.durationMin, max: inputs.durationMax };

      const avoidConstraints = [
        ...(inputs.injuriesAvoid?.bodyAreas ?? []),
        ...(inputs.injuriesAvoid?.movementsOrEquipment ?? []),
      ];
      return {
        type: d.sessionType as 'strength' | 'cardio' | 'recovery',
        title,
        durationMin: dur.min,
        durationMax: dur.max,
        isHardDay: isHard,
        detailLevel: inputs.detailLevel,
        locationConstraint: inputs.location,
        avoidConstraints: avoidConstraints.length ? avoidConstraints : undefined,
      };
    });
    return { weekIndex: sk.weekIndex, specs };
  });
}

// --- Build request for POST /plans/generate-sessions
function buildGenerateSessionsRequest(
  planInputs: PlanInputs,
  weekSpecs: WeekSessionSpecs[],
  options?: { makeItEasier?: boolean }
): Parameters<typeof generateSessions>[0] {
  const sessions: Parameters<typeof generateSessions>[0]['sessions'] = [];
  for (const ws of weekSpecs) {
    for (let i = 0; i < ws.specs.length; i++) {
      const spec = ws.specs[i];
      if (!spec) continue;
      sessions.push({
        type: spec.type,
        title: spec.title,
        durationMin: spec.durationMin,
        durationMax: spec.durationMax,
        isHardDay: spec.isHardDay,
        weekIndex: ws.weekIndex,
        weekday: WEEKDAYS[i],
        avoidConstraints: spec.avoidConstraints,
      });
    }
  }
  const goal =
    planInputs.goal === 'fat_loss'
      ? 'fat loss'
      : planInputs.goal === 'balanced'
        ? 'hybrid'
        : planInputs.goal;
  const avoidConstraints = [
    ...(planInputs.injuriesAvoid?.bodyAreas ?? []),
    ...(planInputs.injuriesAvoid?.movementsOrEquipment ?? []),
  ];
  const weekIndices = [...new Set(sessions.map((s) => s.weekIndex))].sort((a, b) => a - b);
  return {
    goal,
    location: planInputs.location,
    detailLevel: planInputs.detailLevel,
    avoidConstraints: avoidConstraints.length ? avoidConstraints : undefined,
    restrictions: planInputs.restrictions,
    makeItEasier: (options as { makeItEasier?: boolean } | undefined)?.makeItEasier,
    sessions,
    cardioModalities:
      planInputs.cardioModalities?.length ? planInputs.cardioModalities : undefined,
    experienceLevel: planInputs.experienceLevel,
    equipmentTags:
      planInputs.location === 'gym' && planInputs.equipmentTags.length
        ? planInputs.equipmentTags
        : undefined,
    mesoHint: mesoHintForGenerateSessions(planInputs),
    weekProgression: weekIndices.length > 0
      ? weekProgressionForGenerateSessions(planInputs, weekIndices)
      : undefined,
    currentActivityLevel: planInputs.currentActivityLevel ?? undefined,
    preferredExercises: planInputs.preferredExercises?.length
      ? planInputs.preferredExercises.slice(0, 8)
      : undefined,
  };
}

// --- Normalize API response into WeekDraft[] (Stage 6)
function shouldUseFallbackSessionTitle(title: string | undefined): boolean {
  const t = (title ?? '').trim();
  if (!t) return true;
  if (t.length < 6) return true;
  return /\b(blast|finisher|shred|destroyer|annihilator|burner)\b/i.test(t);
}

function cleanSessionTitle(
  generatedTitle: string | undefined,
  specTitle: string | undefined,
  specType: SessionDraft['type'],
): string {
  if (!shouldUseFallbackSessionTitle(generatedTitle)) {
    return (generatedTitle ?? '').trim();
  }
  if (specTitle && specTitle.trim().length > 0) return specTitle.trim();
  return specType === 'strength'
    ? 'Strength Session'
    : specType === 'cardio'
      ? 'Cardio Session'
      : 'Recovery Session';
}

function normalizeSessionsResponse(
  weekSpecs: WeekSessionSpecs[],
  apiSessions: GenerateSessionResult[],
  planInputs: PlanInputs
): { weeks: WeekDraft[] } {
  const byKey = new Map<string, GenerateSessionResult>();
  for (const s of apiSessions) {
    byKey.set(`${s.weekIndex}-${s.weekday}`, s);
  }
  const weeks: WeekDraft[] = weekSpecs.map((ws) => {
    const days: DayDraft[] = ws.specs.map((spec, i) => {
      const weekday = WEEKDAYS[i];
      if (!spec) {
        return { weekday, dateOrLabel: `Week ${ws.weekIndex}`, session: null };
      }
      const result = byKey.get(`${ws.weekIndex}-${weekday}`);
      if (!result || !result.name) {
        return { weekday, dateOrLabel: `Week ${ws.weekIndex}`, session: null };
      }
      const exercises: ExerciseDraft[] = (result.exercises ?? []).map((e) =>
        exerciseDraftFromGenerateResult(e, planInputs),
      );
      const session: SessionDraft = {
        type: spec.type,
        title: cleanSessionTitle(result.name, spec.title, spec.type),
        focusTags: spec.title ? [spec.title] : [],
        durationMin: spec.durationMin,
        durationMax: spec.durationMax,
        isHardDay: spec.isHardDay,
        warmup: result.warmUp,
        whyThisWorkout: result.reasoning,
        cooldown: result.coolDown,
        cardioFinisher: result.cardioFinisher,
        exercises: exercises.length ? exercises : [{ exerciseId: null, name: 'Generated', sets: 3, reps: '8–10' }],
      };
      return { weekday, dateOrLabel: `Week ${ws.weekIndex}`, session };
    });
    return { weekIndex: ws.weekIndex, days };
  });
  return { weeks };
}

/** Call backend to generate session content (Stage 5), then normalize (Stage 6). */
async function stages5And6FromApi(
  planInputs: PlanInputs,
  weekSpecs: WeekSessionSpecs[],
  options?: { makeItEasier?: boolean; signal?: AbortSignal }
): Promise<{ weeks: WeekDraft[]; rawGrokResponse: unknown; generationNotes?: string[] }> {
  const request = buildGenerateSessionsRequest(planInputs, weekSpecs, options);
  if (request.sessions.length === 0) {
    const weeks: WeekDraft[] = weekSpecs.map((ws) => ({
      weekIndex: ws.weekIndex,
      days: ws.specs.map((_, i) => ({ weekday: WEEKDAYS[i], dateOrLabel: `Week ${ws.weekIndex}`, session: null })),
    }));
    return { weeks, rawGrokResponse: null };
  }
  const { sessions, generationNotes } = await generateSessions(request, {
    signal: options?.signal,
  });
  if (sessions.length !== request.sessions.length) {
    throw new Error(
      `Generate sessions: expected ${request.sessions.length} sessions, got ${sessions.length}`
    );
  }
  const { weeks } = normalizeSessionsResponse(weekSpecs, sessions, planInputs);
  return { weeks, rawGrokResponse: sessions, generationNotes };
}

function pipelineStage5CatchMessage(error: unknown): string {
  if (isGenerateSessionsTimeoutError(error)) {
    return GENERATE_SESSIONS_TIMEOUT_MESSAGE;
  }
  return error instanceof Error ? error.message : String(error);
}

// --- Mock stages 5–6 (fallback when API not used, e.g. tests)
function mockStages5And6(
  inputs: PlanInputs,
  weekSpecs: WeekSessionSpecs[]
): { weeks: WeekDraft[] } {
  const weeks: WeekDraft[] = weekSpecs.map((ws) => {
    const days: DayDraft[] = ws.specs.map((spec, i) => {
      const weekday = WEEKDAYS[i];
      if (!spec) {
        return { weekday, dateOrLabel: `Week ${ws.weekIndex}`, session: null };
      }
      const placeholderExercises: ExerciseDraft[] = [
        { exerciseId: null, name: 'Warm-up', sets: 0, reps: '—', notes: 'Dynamic stretch' },
        { exerciseId: null, name: 'Main work (from AI)', sets: 3, reps: '8–10', notes: 'Generated by pipeline' },
        { exerciseId: null, name: 'Cool-down', sets: 0, reps: '—', notes: 'Stretch' },
      ];
      const session: SessionDraft = {
        type: spec.type,
        title: spec.title ?? (spec.type === 'strength' ? 'Strength' : spec.type === 'cardio' ? 'Cardio' : 'Recovery'),
        focusTags: spec.title ? [spec.title] : [],
        durationMin: spec.durationMin,
        durationMax: spec.durationMax,
        isHardDay: spec.isHardDay,
        warmup: 'Light warm-up',
        whyThisWorkout: 'Placeholder until AI generation is wired.',
        cooldown: 'Light stretch',
        exercises: placeholderExercises,
      };
      return {
        weekday,
        dateOrLabel: `Week ${ws.weekIndex}`,
        session,
      };
    });
    return { weekIndex: ws.weekIndex, days };
  });
  return { weeks };
}

// --- Stage 7: Compute metrics from draft
function stage7Metrics(weeks: WeekDraft[]): PlanDraftMetrics {
  const firstWeek = weeks[0];
  if (!firstWeek) {
    return { sessionsPerWeek: 0, strengthCount: 0, cardioCount: 0, hardDaysCount: 0 };
  }
  let sessions = 0;
  let strength = 0;
  let cardio = 0;
  let hardDays = 0;
  firstWeek.days.forEach((d) => {
    if (!d.session) return;
    sessions++;
    if (d.session.type === 'strength') strength++;
    if (d.session.type === 'cardio') cardio++;
    if (d.session.isHardDay) hardDays++;
  });
  return {
    sessionsPerWeek: sessions,
    strengthCount: strength,
    cardioCount: cardio,
    hardDaysCount: hardDays,
  };
}

const WEEKDAY_LIST: Weekday[] = [...WEEKDAYS];

/** Validate draft: every week has exactly 7 days, each day has weekday + session or null. Never show half-mapped week. */
export function validateDraft(draft: PlanDraft): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!draft.weeks?.length) {
    errors.push('No weeks in draft');
    return { valid: false, errors };
  }
  for (let w = 0; w < draft.weeks.length; w++) {
    const week = draft.weeks[w];
    if (!week.days || week.days.length !== 7) {
      errors.push(`Week ${week.weekIndex}: expected 7 days, got ${week.days?.length ?? 0}`);
      continue;
    }
    for (let i = 0; i < 7; i++) {
      const day = week.days[i];
      if (!day || day.weekday !== WEEKDAY_LIST[i]) {
        errors.push(`Week ${week.weekIndex} day ${i}: missing or wrong weekday`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

/** Repair draft: ensure every week has exactly 7 days with correct weekdays; fill any missing day with rest. */
export function repairDraft(draft: PlanDraft): PlanDraft {
  const weeks: WeekDraft[] = draft.weeks.map((w) => {
    const days: DayDraft[] = WEEKDAY_LIST.map((weekday, i) => {
      const existing = w.days?.[i];
      if (existing && existing.weekday === weekday) return existing;
      return { weekday, dateOrLabel: `Week ${w.weekIndex}`, session: null };
    });
    return { weekIndex: w.weekIndex, days };
  });
  const metrics = stage7Metrics(weeks);
  return { ...draft, weeks, metrics };
}

/** Result of running the pipeline with optional debug (for dev panel). */
export interface PipelineDebugInfo {
  planInputs: PlanInputs;
  effectiveSplit: EffectiveSplitResult;
  weekSkeleton: WeekSkeleton[];
  templateAssignments: TemplateAssignments;
  sessionSpecs: WeekSessionSpecs[];
  rawGrokResponse: unknown;
  normalizationWarnings: string[];
}

export type PipelineRunResult =
  | { ok: true; draft: PlanDraft; debug?: PipelineDebugInfo }
  | { ok: false; error: string };

/**
 * Run the full pipeline: PlanInputs → PlanDraft.
 */
export function runPipeline(planInputs: PlanInputs, draftId: string): PlanDraft {
  const stage1 = stage1EffectiveSplit(planInputs);
  const stage2 = stage2WeekSkeleton(planInputs, stage1);
  const stage3 = stage3TemplateAssignments(planInputs, stage2, stage1);
  const stage4 = stage4SessionSpecs(planInputs, stage2, stage3);
  const { weeks } = mockStages5And6(planInputs, stage4);
  const metrics = stage7Metrics(weeks);
  return {
    draftId,
    inputsSnapshot: planInputs,
    weeks,
    metrics,
    debugMeta: {
      effectiveSplitId: stage1.effectiveSplitId,
      templateAssignments: stage3.byDay,
      reasons: ['Pipeline run with mock stages 5–6'],
    },
  };
}

/** Run pipeline with validation/repair and optional debug output. Calls backend LLM for session content. */
export async function runPipelineSafe(
  planInputs: PlanInputs,
  draftId: string,
  options?: { captureDebug?: boolean; repairIfInvalid?: boolean; makeItEasier?: boolean; signal?: AbortSignal }
): Promise<PipelineRunResult> {
  const captureDebug = options?.captureDebug ?? false;
  const repairIfInvalid = options?.repairIfInvalid ?? true;
  const makeItEasier = options?.makeItEasier ?? false;
  try {
    const stage1 = stage1EffectiveSplit(planInputs);
    const stage2 = stage2WeekSkeleton(planInputs, stage1);
    const stage3 = stage3TemplateAssignments(planInputs, stage2, stage1);
    const stage4 = stage4SessionSpecs(planInputs, stage2, stage3);
    const { weeks, rawGrokResponse, generationNotes } = await stages5And6FromApi(
      planInputs,
      stage4,
      { makeItEasier, signal: options?.signal }
    );
    const metrics = stage7Metrics(weeks);
    let draft: PlanDraft = {
      draftId,
      inputsSnapshot: planInputs,
      weeks,
      metrics,
      debugMeta: {
        effectiveSplitId: stage1.effectiveSplitId,
        templateAssignments: stage3.byDay,
        reasons: ['Pipeline run with LLM generation'],
        ...(generationNotes?.length ? { generationNotes } : {}),
      },
    };
    const validation = validateDraft(draft);
    const normalizationWarnings: string[] = [...validation.errors];
    if (!validation.valid && repairIfInvalid) {
      draft = repairDraft(draft);
      normalizationWarnings.push('Draft was repaired (missing days filled with rest).');
    } else if (!validation.valid) {
      return { ok: false, error: validation.errors.join('; ') };
    }
    const debug: PipelineDebugInfo | undefined = captureDebug
      ? {
          planInputs,
          effectiveSplit: stage1,
          weekSkeleton: stage2,
          templateAssignments: stage3,
          sessionSpecs: stage4,
          rawGrokResponse: rawGrokResponse ?? undefined,
          normalizationWarnings,
        }
      : undefined;
    return { ok: true, draft, debug };
  } catch (e) {
    return { ok: false, error: pipelineStage5CatchMessage(e) };
  }
}

/**
 * Re-run stages 1–6 for a single week only, then merge into an existing draft.
 * Avoids regenerating every week (uses one targeted `generate-sessions` batch for that week).
 */
export async function regeneratePipelineWeek(
  planInputs: PlanInputs,
  draftId: string,
  existingDraft: PlanDraft,
  weekIndex: number,
  options?: { makeItEasier?: boolean; repairIfInvalid?: boolean; captureDebug?: boolean }
): Promise<PipelineRunResult> {
  const repairIfInvalid = options?.repairIfInvalid ?? true;
  const makeItEasier = options?.makeItEasier ?? false;
  const captureDebug = options?.captureDebug ?? false;
  try {
    const stage1 = stage1EffectiveSplit(planInputs);
    const stage2 = stage2WeekSkeleton(planInputs, stage1);
    const stage3 = stage3TemplateAssignments(planInputs, stage2, stage1);
    const stage4 = stage4SessionSpecs(planInputs, stage2, stage3);
    const weekSpecsForWeek = stage4.filter((ws) => ws.weekIndex === weekIndex);
    if (!weekSpecsForWeek.length) {
      return { ok: false, error: `No week ${weekIndex} in plan.` };
    }
    const { weeks: regeneratedPartial, rawGrokResponse, generationNotes } =
      await stages5And6FromApi(planInputs, weekSpecsForWeek, { makeItEasier });
    const newWeekDraft = regeneratedPartial.find((w) => w.weekIndex === weekIndex);
    if (!newWeekDraft) {
      return { ok: false, error: 'Unexpected regeneration response for this week.' };
    }
    let mergedWeeks = existingDraft.weeks.map((w) =>
      w.weekIndex === weekIndex ? newWeekDraft : w
    );

    const baseRequest = buildGenerateSessionsRequest(planInputs, stage4, { makeItEasier });
    const generatedSessions = buildGeneratedSessionsFromMergedDraft(stage4, mergedWeeks);
    let postRepairNotes: string[] | undefined;
    if (
      generatedSessions.length === baseRequest.sessions.length &&
      baseRequest.sessions.length > 0
    ) {
      try {
        const repaired = await repairProgramSessions({
          ...baseRequest,
          generatedSessions,
        });
        if (repaired.sessions.length === baseRequest.sessions.length) {
          const { weeks: repairedWeeks } = normalizeSessionsResponse(
            stage4,
            repaired.sessions,
            planInputs,
          );
          mergedWeeks = repairedWeeks;
          postRepairNotes = repaired.generationNotes;
        }
      } catch {
        // Keep merged week output if repair is unavailable (older backend / network).
      }
    }

    const mergedGenNotes = [
      ...(existingDraft.debugMeta?.generationNotes ?? []),
      ...(generationNotes ?? []),
      ...(postRepairNotes ?? []),
    ];
    let draft: PlanDraft = {
      ...existingDraft,
      draftId,
      weeks: mergedWeeks,
      metrics: stage7Metrics(mergedWeeks),
      debugMeta: {
        ...existingDraft.debugMeta,
        reasons: [
          ...(existingDraft.debugMeta?.reasons ?? []),
          `Regenerated week ${weekIndex} (targeted generate-sessions)`,
        ],
        ...(mergedGenNotes.length ? { generationNotes: mergedGenNotes } : {}),
      },
    };
    const validation = validateDraft(draft);
    const normalizationWarnings: string[] = [...validation.errors];
    if (!validation.valid && repairIfInvalid) {
      draft = repairDraft(draft);
      normalizationWarnings.push('Draft was repaired after partial week regeneration.');
    } else if (!validation.valid) {
      return { ok: false, error: validation.errors.join('; ') };
    }
    const debug: PipelineDebugInfo | undefined = captureDebug
      ? {
          planInputs,
          effectiveSplit: stage1,
          weekSkeleton: stage2,
          templateAssignments: stage3,
          sessionSpecs: stage4,
          rawGrokResponse: rawGrokResponse ?? undefined,
          normalizationWarnings,
        }
      : undefined;
    return { ok: true, draft, debug };
  } catch (e) {
    return { ok: false, error: pipelineStage5CatchMessage(e) };
  }
}

/**
 * Re-run stages 5–6 for every **cardio** session only, merge into the existing draft.
 * Strength / recovery days are left unchanged.
 */
export async function regeneratePipelineCardioSessions(
  planInputs: PlanInputs,
  draftId: string,
  existingDraft: PlanDraft,
  options?: { repairIfInvalid?: boolean; captureDebug?: boolean }
): Promise<PipelineRunResult> {
  const repairIfInvalid = options?.repairIfInvalid ?? true;
  const captureDebug = options?.captureDebug ?? false;
  try {
    const stage1 = stage1EffectiveSplit(planInputs);
    const stage2 = stage2WeekSkeleton(planInputs, stage1);
    const stage3 = stage3TemplateAssignments(planInputs, stage2, stage1);
    const stage4 = stage4SessionSpecs(planInputs, stage2, stage3);
    const partialWeekSpecs: WeekSessionSpecs[] = stage4
      .map((ws) => ({
        weekIndex: ws.weekIndex,
        specs: ws.specs.map((s) => (s?.type === 'cardio' ? s : null)),
      }))
      .filter((ws) => ws.specs.some((s) => s != null));
    if (partialWeekSpecs.length === 0) {
      return { ok: true, draft: existingDraft };
    }
    const { weeks: regeneratedSubset, rawGrokResponse, generationNotes } =
      await stages5And6FromApi(planInputs, partialWeekSpecs, {});
    const mergedWeeks = existingDraft.weeks.map((oldW) => {
      const sk = stage4.find((s) => s.weekIndex === oldW.weekIndex);
      const regenW = regeneratedSubset.find((r) => r.weekIndex === oldW.weekIndex);
      if (!sk || !regenW) return oldW;
      return {
        weekIndex: oldW.weekIndex,
        days: oldW.days.map((day, i) => {
          const spec = sk.specs[i];
          if (!spec || spec.type !== 'cardio') return day;
          return regenW.days[i] ?? day;
        }),
      };
    });
    let draft: PlanDraft = {
      ...existingDraft,
      draftId,
      weeks: mergedWeeks,
      metrics: stage7Metrics(mergedWeeks),
      debugMeta: {
        ...existingDraft.debugMeta,
        reasons: [
          ...(existingDraft.debugMeta?.reasons ?? []),
          'Regenerated cardio sessions (targeted generate-sessions)',
        ],
        ...(generationNotes?.length
          ? {
              generationNotes: [
                ...(existingDraft.debugMeta?.generationNotes ?? []),
                ...generationNotes,
              ],
            }
          : {}),
      },
    };
    const validation = validateDraft(draft);
    const normalizationWarnings: string[] = [...validation.errors];
    if (!validation.valid && repairIfInvalid) {
      draft = repairDraft(draft);
      normalizationWarnings.push('Draft was repaired after cardio-only regeneration.');
    } else if (!validation.valid) {
      return { ok: false, error: validation.errors.join('; ') };
    }
    const debug: PipelineDebugInfo | undefined = captureDebug
      ? {
          planInputs,
          effectiveSplit: stage1,
          weekSkeleton: stage2,
          templateAssignments: stage3,
          sessionSpecs: stage4,
          rawGrokResponse: rawGrokResponse ?? undefined,
          normalizationWarnings,
        }
      : undefined;
    return { ok: true, draft, debug };
  } catch (e) {
    return { ok: false, error: pipelineStage5CatchMessage(e) };
  }
}

// --- Adapter: PlanDraft → legacy WeekPlan[] for Preview UI

function parseRepScalarForApply(reps: string | number | undefined): number {
  const m = String(reps ?? '').match(/\d+/);
  const n = m ? parseInt(m[0], 10) : 8;
  const x = Number.isFinite(n) ? n : 8;
  return Math.max(1, x);
}

/**
 * Maps a pipeline session to POST /plans plan_exercises. Coerces sets/reps for backend @Min(1).
 * Include rows with a display name even when sets are missing (coerced to 1).
 */
export function sessionDraftToPlanSlotExercises(
  session: SessionDraft,
  weekNumber: number,
  dayOfWeek: string,
): PlanSlotExercise[] | undefined {
  if (!session?.exercises?.length) return undefined;
  const list = session.exercises.filter((e) => {
    const sets = Number(e.sets);
    const hasPositiveSets = Number.isFinite(sets) && sets > 0;
    const hasName = !!(e.name && String(e.name).trim());
    return hasPositiveSets || hasName;
  });
  if (!list.length) return undefined;
  return list.map((e, i) => {
    const raw = Number(e.sets);
    const sets = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
    const id =
      e.exerciseId != null && String(e.exerciseId).trim() !== ''
        ? String(e.exerciseId).trim()
        : `draft_${weekNumber}_${dayOfWeek}_${i}`;
    const hold = exerciseUsesTimeDisplay(e.prescriptionType, e.name, e.primaryMuscleGroup);
    const durationSeconds =
      e.durationSeconds != null && Number.isFinite(e.durationSeconds) && e.durationSeconds > 0
        ? Math.round(e.durationSeconds)
        : undefined;
    // Working scalar persisted in `reps`: time rows use the duration; otherwise
    // prefer the stored range's low end (repsMin) so saved == preview, with the
    // legacy single-number parse only as a fallback. No more low-end-of-a-
    // fabricated-band collapse.
    const repsScalar = hold
      ? durationSeconds ??
        (e.repsRaw != null && Number.isFinite(e.repsRaw) && e.repsRaw > 0
          ? Math.round(e.repsRaw)
          : 45)
      : e.repsMin != null && Number.isFinite(e.repsMin) && e.repsMin > 0
        ? Math.round(e.repsMin)
        : parseRepScalarForApply(
            typeof e.reps === 'number' ? String(e.reps) : String(e.reps ?? ''),
          );
    const noteParts = [
      e.notes,
      hold ? 'Time-based: hold ~30–60 sec per set (add time before load).' : '',
    ].filter((x) => typeof x === 'string' && String(x).trim().length > 0);
    return {
      exerciseId: id,
      name: e.name,
      sets,
      reps: repsScalar,
      ...(!hold && e.repsMin != null && Number.isFinite(e.repsMin)
        ? { repsMin: Math.round(e.repsMin) }
        : {}),
      ...(!hold && e.repsMax != null && Number.isFinite(e.repsMax)
        ? { repsMax: Math.round(e.repsMax) }
        : {}),
      ...(durationSeconds != null ? { durationSeconds } : {}),
      notes: noteParts.length ? noteParts.join(' ') : undefined,
      orderIndex: i,
      ...(e.prescriptionType ? { prescriptionType: e.prescriptionType } : {}),
    };
  });
}

export interface PlanWorkoutAdapter {
  id: string;
  title: string;
  detailLine: string;
  iconColor: string;
  /** Heuristic estimate displayed on the card (volume-aware, blended toward planned). */
  durationMinutes: number;
  /**
   * Planned slot duration (mean of session `durationMin`/`durationMax`). Stable anchor for
   * any volume-aware re-estimate downstream so the modal does not drift on re-render.
   */
  plannedDurationMinutes: number;
  intensity: 'Easy' | 'Medium' | 'Hard';
  type: 'strength' | 'cardio' | 'recovery';
  changeType?: 'new' | 'replaced' | 'moved';
  source?: 'manual' | 'ai';
  locked?: boolean;
  draftId?: string;
  week: number;
  /** Exercises to persist on apply — tied to this card so Apply matches the visible week list. */
  applyExercises?: PlanSlotExercise[];
}

export interface WeekPlanAdapter {
  weekNumber: number;
  workouts: Record<string, PlanWorkoutAdapter[]>;
}

const TYPE_COLORS: Record<string, string> = {
  strength: '#C7A46A',
  cardio: '#E67E22',
  recovery: '#9B59B6',
};

/**
 * Phase 8 — derive a per-session intensity badge from `(totalSets × estimatedMinutes)`
 * rather than a static "Hard / Medium / Easy" label.
 *
 * Two Upper days can both look like "Medium" today even when one is 14 working
 * sets in 35 min and the other is 24 sets in 60 min — the badge should reflect
 * that. `isHardDay` and `recovery` keep their existing overrides so an
 * explicitly hard week stays hard.
 *
 * Bands (sets × minutes):
 *   < 400  → Easy   (≈ 8 sets in 50 min, or 12 sets in 30 min)
 *   < 900  → Medium (≈ 18 sets in 45 min)
 *   ≥ 900  → Hard   (≈ 22+ sets in 45+ min, or 18 sets in 60 min)
 */
export function deriveSessionIntensity(
  session: SessionDraft,
  estimatedMinutes: number,
): 'Easy' | 'Medium' | 'Hard' {
  if (session.type === 'recovery') return 'Easy';
  if (session.isHardDay) return 'Hard';
  let totalSets = 0;
  for (const ex of session.exercises ?? []) {
    const n = Number(ex.sets);
    if (!Number.isFinite(n) || n <= 0) continue;
    // Cap per row at 6 — guards against malformed `sets: 30` style outliers
    // that would otherwise skew the badge way off.
    totalSets += Math.min(n, 6);
  }
  const minutes = Math.max(0, Math.round(estimatedMinutes));
  if (totalSets === 0 || minutes === 0) return 'Medium';
  const load = totalSets * minutes;
  if (load < 400) return 'Easy';
  if (load < 900) return 'Medium';
  return 'Hard';
}

/** True when session has AI/coach copy worth surfacing in the week list (Phase E). */
export function sessionHasCoachPreviewFields(session: SessionDraft): boolean {
  if (session.whyThisWorkout?.trim() || session.warmup?.trim() || session.cooldown?.trim()) {
    return true;
  }
  return !!session.exercises?.some((e) => e.notes?.trim());
}

/** One line for Preview cards — keeps the week list scannable; full copy stays in SessionDraft. */
function previewDetailLineFromSession(session: SessionDraft, durationRounded: number): string {
  const n = session.exercises?.length ?? 0;
  const typeLabel =
    session.type === 'strength' ? 'Strength' : session.type === 'cardio' ? 'Cardio' : 'Recovery';
  return `${durationRounded} min · ${typeLabel} · ${n} exercise${n === 1 ? '' : 's'}`;
}

/**
 * Convert a PlanDraft to the legacy WeekPlan[] shape so the Preview screen
 * can render without changing its UI. Preview "renders from PlanDraft" by
 * deriving this structure from it.
 */
export function planDraftToWeekPlans(draft: PlanDraft): WeekPlanAdapter[] {
  return draft.weeks.map((w) => {
    const workouts: Record<string, PlanWorkoutAdapter[]> = {};
    WEEKDAYS.forEach((weekday) => {
      workouts[weekday] = [];
    });
    w.days.forEach((d) => {
      if (!d.session) return;
      const session = d.session;
      const plannedDuration = Math.round((session.durationMin + session.durationMax) / 2);
      const duration =
        getWorkoutDisplayEstimateMinutes(
          exercisesLikeFromPrescription(session.exercises),
          plannedDuration,
        ) ?? plannedDuration;
      workouts[d.weekday].push({
        id: `draft-${draft.draftId}-w${w.weekIndex}-${d.weekday}-1`,
        title: session.title,
        detailLine: previewDetailLineFromSession(session, duration),
        iconColor: TYPE_COLORS[session.type] ?? '#C7A46A',
        durationMinutes: duration,
        plannedDurationMinutes: plannedDuration,
        intensity: deriveSessionIntensity(session, duration),
        type: session.type,
        source: 'ai',
        draftId: draft.draftId,
        week: w.weekIndex,
        applyExercises: sessionDraftToPlanSlotExercises(session, w.weekIndex, d.weekday),
      });
    });
    return { weekNumber: w.weekIndex, workouts };
  });
}
