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
  exercisesLikeFromPrescription,
  getWorkoutDisplayEstimateMinutes,
} from './estimateWorkoutMinutes';

export { isTimeHoldExerciseName } from './exercisePrescription';

const WEEKDAYS: Weekday[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/**
 * Second column for "sets × …" in preview and drafts.
 * Time-holds show a second range; numeric reps use {@link formatDraftReps}.
 */
export function formatExerciseRepsDisplay(
  exerciseName: string,
  reps: string | number | undefined,
  goal: PlanInputs['goal'],
  prescriptionType?: ExercisePrescriptionType,
): string {
  if (exerciseUsesTimeDisplay(prescriptionType, exerciseName)) {
    return '20–45 sec';
  }
  if (typeof reps === 'string') {
    const t = reps.trim();
    if (/\bsec(onds?)?\b/i.test(t)) return t;
    if (/\d+\s*[–-]\s*\d+/.test(t)) return t;
    const m = t.match(/\d+/);
    if (m) return formatDraftReps(parseInt(m[0], 10), goal);
    return t || '8–12';
  }
  const num = typeof reps === 'number' ? reps : NaN;
  if (Number.isFinite(num)) return formatDraftReps(Math.round(num), goal);
  return '8–12';
}

/** Rep range string for draft + preview (API often returns one number). */
export function formatDraftReps(reps: number, goal: PlanInputs['goal']): string {
  const n = Math.round(Number(reps));
  if (!Number.isFinite(n) || n < 1) return '8–12';
  if (goal === 'strength') {
    const lo = Math.max(3, n - 2);
    let hi = Math.min(12, n + 2);
    if (hi < lo) hi = lo;
    return `${lo}–${hi}`;
  }
  if (goal === 'endurance') {
    const lo = Math.max(12, n - 3);
    let hi = Math.min(25, n + 5);
    if (hi < lo) hi = lo;
    return `${lo}–${hi}`;
  }
  const lo = Math.max(6, n - 2);
  let hi = Math.min(15, n + 4);
  if (hi < lo) hi = lo;
  return `${lo}–${hi}`;
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

// --- Stage 2: Week skeleton (which days are strength/cardio/recovery/rest)
function stage2WeekSkeleton(inputs: PlanInputs, effective: EffectiveSplitResult): WeekSkeleton[] {
  const selectedSet = new Set(inputs.selectedWeekdays);
  const forceOneRest = inputs.selectedWeekdays.length >= 7;
  const cardioPreference = inputs.customSplit?.cardioPreference ?? 'none';
  const strengthTemplatesCount =
    effective.effectiveSplitId === 'custom'
      ? Math.max(1, inputs.customSplit?.dayTemplates?.length ?? 1)
      : effective.effectiveSplitId === 'full_body'
        ? 1
        : effective.effectiveSplitId === 'upper_lower'
          ? 2
          : effective.effectiveSplitId === 'ppl'
            ? 3
            : 4;
  const hasCardioSlot = cardioPreference !== 'none';
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
  skeletons: WeekSkeleton[]
): TemplateAssignments {
  const byDay: TemplateAssignments['byDay'] = {};
  const effectiveId = inputs.splitPreference === 'custom' ? 'custom' : inputs.splitPreference;
  const customTemplates = inputs.customSplit?.dayTemplates ?? [];
  const cycleMode = inputs.customSplit?.cycleMode ?? 'repeat_weekly';

  const strengthTitles: string[] =
    effectiveId === 'full_body'
      ? ['Full Body']
      : effectiveId === 'upper_lower'
        ? ['Upper', 'Lower']
        : effectiveId === 'ppl'
          ? ['Push', 'Pull', 'Legs']
          : effectiveId === 'body_part_days'
            ? ['Push', 'Pull', 'Legs', 'Upper', 'Lower']
            : customTemplates.length > 0
              ? customTemplates.map(
                  (t, i) =>
                    t.primaryGroups?.[0] ?? `Day ${i + 1}`
                )
              : ['Full Body'];

  skeletons.forEach((sk) => {
    sk.days.forEach((d, dayIdx) => {
      if (d.sessionType !== 'strength') return;
      const key = `${sk.weekIndex}-${d.weekday}`;
      let templateIndex = 0;
      const strengthDayIndex = sk.days
        .filter((x) => x.sessionType === 'strength')
        .indexOf(d);
      if (effectiveId === 'custom' && customTemplates.length) {
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
  return {
    goal,
    location: planInputs.location,
    detailLevel: planInputs.detailLevel,
    avoidConstraints: avoidConstraints.length ? avoidConstraints : undefined,
    makeItEasier: (options as { makeItEasier?: boolean } | undefined)?.makeItEasier,
    sessions,
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
      const exercises: ExerciseDraft[] = (result.exercises ?? []).map((e) => ({
        exerciseId: e.exerciseId ?? null,
        name: e.name ?? 'Exercise',
        sets: typeof e.sets === 'number' ? e.sets : 3,
        reps: formatExerciseRepsDisplay(
          e.name ?? 'Exercise',
          typeof e.reps === 'number' ? e.reps : String(e.reps ?? ''),
          planInputs.goal,
          e.prescriptionType,
        ),
        prescriptionType: e.prescriptionType,
        notes: e.notes,
      }));
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
  options?: { makeItEasier?: boolean }
): Promise<{ weeks: WeekDraft[]; rawGrokResponse: unknown }> {
  const request = buildGenerateSessionsRequest(planInputs, weekSpecs, options);
  if (request.sessions.length === 0) {
    const weeks: WeekDraft[] = weekSpecs.map((ws) => ({
      weekIndex: ws.weekIndex,
      days: ws.specs.map((_, i) => ({ weekday: WEEKDAYS[i], dateOrLabel: `Week ${ws.weekIndex}`, session: null })),
    }));
    return { weeks, rawGrokResponse: null };
  }
  const { sessions } = await generateSessions(request);
  if (sessions.length !== request.sessions.length) {
    throw new Error(
      `Generate sessions: expected ${request.sessions.length} sessions, got ${sessions.length}`
    );
  }
  const { weeks } = normalizeSessionsResponse(weekSpecs, sessions, planInputs);
  return { weeks, rawGrokResponse: sessions };
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
  const stage3 = stage3TemplateAssignments(planInputs, stage2);
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
  options?: { captureDebug?: boolean; repairIfInvalid?: boolean; makeItEasier?: boolean }
): Promise<PipelineRunResult> {
  const captureDebug = options?.captureDebug ?? false;
  const repairIfInvalid = options?.repairIfInvalid ?? true;
  const makeItEasier = options?.makeItEasier ?? false;
  try {
    const stage1 = stage1EffectiveSplit(planInputs);
    const stage2 = stage2WeekSkeleton(planInputs, stage1);
    const stage3 = stage3TemplateAssignments(planInputs, stage2);
    const stage4 = stage4SessionSpecs(planInputs, stage2, stage3);
    const { weeks, rawGrokResponse } = await stages5And6FromApi(planInputs, stage4, { makeItEasier });
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
    const stage3 = stage3TemplateAssignments(planInputs, stage2);
    const stage4 = stage4SessionSpecs(planInputs, stage2, stage3);
    const weekSpecsForWeek = stage4.filter((ws) => ws.weekIndex === weekIndex);
    if (!weekSpecsForWeek.length) {
      return { ok: false, error: `No week ${weekIndex} in plan.` };
    }
    const { weeks: regeneratedPartial, rawGrokResponse } = await stages5And6FromApi(
      planInputs,
      weekSpecsForWeek,
      { makeItEasier }
    );
    const newWeekDraft = regeneratedPartial.find((w) => w.weekIndex === weekIndex);
    if (!newWeekDraft) {
      return { ok: false, error: 'Unexpected regeneration response for this week.' };
    }
    const mergedWeeks = existingDraft.weeks.map((w) =>
      w.weekIndex === weekIndex ? newWeekDraft : w
    );
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
    const stage3 = stage3TemplateAssignments(planInputs, stage2);
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
    const { weeks: regeneratedSubset, rawGrokResponse } = await stages5And6FromApi(
      planInputs,
      partialWeekSpecs,
      {}
    );
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
    const hold = exerciseUsesTimeDisplay(e.prescriptionType, e.name);
    const repsScalar = hold
      ? 45
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
  durationMinutes: number;
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

/** One line for Preview cards — keeps the week list scannable; full copy stays in SessionDraft.whyThisWorkout for tooling/debug. */
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
        intensity: session.isHardDay ? 'Hard' : session.type === 'recovery' ? 'Easy' : 'Medium',
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
