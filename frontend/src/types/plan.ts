/**
 * Canonical data contracts for Generate Plan → Preview → Apply.
 * Single source of truth: UI produces PlanInputs on "Generate"; pipeline and Preview use only this.
 */

import type { ExercisePrescriptionType } from '../lib/exercisePrescription';

// --- Weekday type (canonical order / user-selected order)
export type Weekday =
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'
  | 'Sunday';

// --- PlanInputs (snapshot when user taps "Generate Week 1 Preview")
export type GoalId = 'fat_loss' | 'strength' | 'muscle' | 'endurance' | 'balanced';
export type DurationMode = 'fixed' | 'range';
export type SplitPreferenceId =
  | 'full_body'
  | 'upper_lower'
  | 'ppl'
  | 'body_part_days'
  | 'auto'
  | 'custom';
export type LocationId = 'gym' | 'home';
export type DetailLevelId = 'simple' | 'detailed';
export type ProgressionStyleId = 'build' | 'build_deload' | 'maintain';
export type CycleModeId = 'repeat_weekly' | 'rotate_forward' | 'auto_balance';
export type AbsPreferenceId = 'none' | 'sometimes' | 'often';
export type CardioPreferenceId = 'none' | 'easy' | 'mixed';

/** One template in a custom split (Day 1..N). */
export interface DayTemplateSpec {
  primaryGroups: string[];
  secondaryGroups: string[];
}

export interface CustomSplitInput {
  name?: string;
  dayTemplates: DayTemplateSpec[];
  cycleMode: CycleModeId;
  absPreference: AbsPreferenceId;
  cardioPreference: CardioPreferenceId;
}

export interface DurationOverrides {
  strengthMin: number;
  strengthMax: number;
  cardioMin: number;
  cardioMax: number;
  recoveryMin: number;
  recoveryMax: number;
}

export interface HardDayLimitsInput {
  enabled: boolean;
  maxHardDaysPerWeek?: number;
  maxHardDaysInARow?: number;
}

export interface InjuriesAvoidInput {
  bodyAreas: string[];
  movementsOrEquipment: string[];
}

export type CurrentActivityLevelId = '0' | '1-2' | '3-4' | '5+';

/** Muscle groups a plan can bring up (the server's coach-check groups). */
export const PRIORITY_MUSCLE_IDS = ['Chest', 'Back', 'Shoulders', 'Legs', 'Arms', 'Core'] as const;
export type PriorityMuscleId = (typeof PRIORITY_MUSCLE_IDS)[number];

/** A current number the user typed instead of logging; weight in canonical pounds. */
export interface KnownLift {
  exerciseId: string;
  weight: number;
  reps: number;
}

export type ExperienceLevelId = 'beginner' | 'intermediate' | 'advanced';

/**
 * Canonical plan inputs — produced once when user taps "Generate Week 1 Preview".
 * All downstream logic (skeleton, mapping, AI, preview) uses only this snapshot.
 */
export interface PlanInputs {
  goal: GoalId;
  /** Optional secondary emphasis blended into generation (primary still drives rep ranges). */
  secondaryGoal?: GoalId | null;
  selectedWeekdays: Weekday[];
  startWeekday?: Weekday;
  startDateISO?: string;
  daysPerWeek: number;
  durationMode: DurationMode;
  durationMin: number;
  durationMax: number;
  planStyleId: string;
  splitPreference: SplitPreferenceId;
  useRecommended: boolean;
  customSplit: CustomSplitInput | null;
  location: LocationId;
  weeksCount: number;
  detailLevel: DetailLevelId;
  progressionStyle: ProgressionStyleId | null;
  durationOverrides: DurationOverrides | null;
  hardDayLimits: HardDayLimitsInput;
  injuriesAvoid: InjuriesAvoidInput;
  /** Free-text limitations note (onboarding/profile); sent verbatim to the generator prompt. */
  restrictions?: string;
  currentActivityLevel: CurrentActivityLevelId | null;
  preferredExercises: string[];
  /** One muscle group to bring up; the server fills it toward the top of its weekly band. */
  priorityMuscle?: PriorityMuscleId | null;
  /** Typed current lifts; stand in for history where no logs exist. */
  knownLifts?: KnownLift[];
  /** Maps to POST /plans/generate-sessions; drives set/rep + Groq difficulty (default intermediate). */
  experienceLevel: ExperienceLevelId;
  /**
   * Generate Plan equipment checklist (UI ids, e.g. barbell, dumbbells). Server maps to library labels for gym candidate filter only.
   */
  equipmentTags: string[];
  /** User-ordered cardio modality chips (e.g. run, bike) for finishers / Cardio rows. */
  cardioModalities?: string[];
}

// --- PlanDraft / WeekDraft (canonical output — Preview renders only from this)

export type SessionTypeId = 'strength' | 'cardio' | 'recovery';

export interface ExerciseDraft {
  exerciseId: string | null;
  name: string;
  sets: number;
  reps: string;
  /** Raw reps or seconds from generate-sessions (for apply + time-based rows). */
  repsRaw?: number;
  /**
   * Target rep range from generate-sessions (goal × difficulty × role). When set,
   * the UI shows `repsMin–repsMax` directly instead of deriving a band from a
   * single number. Cardio/time rows leave these undefined.
   */
  repsMin?: number;
  repsMax?: number;
  /** Duration in seconds for time-based rows (cardio bouts). */
  durationSeconds?: number;
  /** From generate-sessions when backend attached library metadata. */
  prescriptionType?: ExercisePrescriptionType;
  /** Exercise library primary muscle (e.g. Chest, Cardio) for preview chips. */
  primaryMuscleGroup?: string;
  /** Secondary muscles from library (preview chips beside title). */
  secondaryMuscleGroups?: string[];
  rpe?: number;
  rir?: number;
  /**
   * Suggested rest between sets (seconds). Stamped on the backend from the
   * user's goal+difficulty scheme; Cardio rows leave this undefined.
   */
  restSeconds?: number;
  /** Reps in reserve to stop at (effort target) from the generator. */
  targetRir?: number;
  /** Working load in pounds from the user's own logs (generator, 2026-09-17); undefined without history. */
  weight?: number;
  notes?: string;
  focus?: string;
}

export interface SessionDraft {
  type: SessionTypeId;
  title: string;
  focusTags: string[];
  durationMin: number;
  durationMax: number;
  isHardDay: boolean;
  warmup?: string;
  whyThisWorkout?: string;
  cooldown?: string;
  /** Optional cardio finisher suggestion (e.g. "Run 10 min"). */
  cardioFinisher?: { suggestion: string };
  exercises: ExerciseDraft[];
}

export interface DayDraft {
  weekday: Weekday;
  dateOrLabel: string;
  session: SessionDraft | null;
}

export interface WeekDraft {
  weekIndex: number;
  days: DayDraft[];
}

export interface PlanDraftMetrics {
  sessionsPerWeek: number;
  strengthCount: number;
  cardioCount: number;
  hardDaysCount: number;
}

/** One note from the server's coach check, written for the user. */
export interface CoachCheckFinding {
  code: string;
  severity: 'info' | 'warn' | 'high';
  message: string;
  weekday?: string;
}

/** The server's coach check for one week of the generated program (backend ≥ 2026-09-17). */
export interface CoachCheckReport {
  weekIndex: number;
  sessionCount: number;
  /** Weighted weekly sets per muscle (secondary movers count half) and the sessions that train it. */
  volumeByMuscle: Record<string, { direct: number; weighted: number; exposures: number }>;
  /** 0..1 share of strength rows carrying a load, an effort target, or a hold duration. */
  effortCoverage: number;
  findings: CoachCheckFinding[];
  /** Weekly sets per muscle the goal and level call for. */
  band?: { min: number; max: number };
}

export interface PlanDraftDebugMeta {
  effectiveSplitId?: string;
  mappingDecisions?: string[];
  templateAssignments?: Record<string, unknown>;
  reasons?: string[];
  constraintsApplied?: string[];
  /** Human-readable notes from the server when generation used repairs or fallbacks. */
  generationNotes?: string[];
  /** Who chose the exercises: the model, the rule-based builder, or both across weeks. */
  builtBy?: 'ai' | 'rules' | 'mixed';
  /** The server's coach check per week: volume, exposure, stacking, rest, effort. */
  coachCheck?: CoachCheckReport[];
}

export interface PlanDraft {
  planId?: string;
  draftId: string;
  inputsSnapshot: PlanInputs;
  weeks: WeekDraft[];
  metrics: PlanDraftMetrics;
  debugMeta?: PlanDraftDebugMeta;
}
