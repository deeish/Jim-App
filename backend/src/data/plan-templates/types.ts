/**
 * Hand-authored workout plan templates ("expert programs").
 *
 * A plan template is a complete 8-week program written by hand — NOT the LLM
 * split skeletons in `../program-templates.ts` (those describe day structure
 * for generation; these carry every exercise, set, rep and rest for every
 * week). Templates are static data: applying one never calls the LLM — the
 * client materializes the program into the exact `POST /plans` payload the
 * generated-preview Apply flow already sends.
 *
 * Authoring rules (enforced by plan-templates specs):
 * - `exerciseId` + `name` must match `data/exercises_5000plus.json` exactly.
 * - Every one of the 8 weeks is spelled out per exercise (`weekly` has one
 *   entry per program week) — progression is explicit data, never "repeat
 *   week 1".
 * - Rep rows carry `repsMin`/`repsMax`; time rows (holds, carries, cardio)
 *   carry `durationSeconds` instead, mirroring how generated sessions persist.
 */

export const PLAN_TEMPLATE_WEEKS = 8;

export type TemplateGoalApi = 'strength' | 'fat loss' | 'hybrid';
export type TemplateGoalId = 'strength' | 'fat_loss' | 'balanced';
export type TemplateSplitId = 'upper_lower' | 'full_body' | 'ppl';
export type TemplateIntensity = 'Easy' | 'Medium' | 'Hard';
export type TemplateWeekday =
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'
  | 'Sunday';

/** One week's prescription for one exercise row. */
export interface WeekPrescription {
  /** Working sets this week (≥ 1 — a deload trims sets, never deletes the row). */
  sets: number;
  /** Rep-range rows. `repsMin === repsMax` renders as a single number (e.g. "5"). */
  repsMin?: number;
  repsMax?: number;
  /** Time rows (holds / carries / cardio pieces) — seconds per set. */
  durationSeconds?: number;
  /**
   * Week-specific coaching note (loading/RPE/progression call for THIS week).
   * Falls back to the exercise's base `note` when omitted.
   */
  note?: string;
}

/** Exactly one prescription per program week. */
export type WeeklyPrescriptions = [
  WeekPrescription,
  WeekPrescription,
  WeekPrescription,
  WeekPrescription,
  WeekPrescription,
  WeekPrescription,
  WeekPrescription,
  WeekPrescription,
];

export interface TemplateExercise {
  /** Library id from exercises_5000plus.json (drives history, prefill, detail links). */
  exerciseId: string;
  /** Catalog display name, verbatim (spec-checked against the library). */
  name: string;
  /** 'reps' rows use repsMin/repsMax; 'time' rows use durationSeconds. */
  prescriptionType: 'reps' | 'time';
  /**
   * Rest guidance in seconds. Plan rows don't persist a rest column, so this
   * is rendered into the saved note ("Rest ~3 min") exactly once per row.
   * Superset pairs put the shared rest on the second row of the pair.
   */
  restSeconds: number;
  /** Base coaching cue (form/progression). Week notes override when present. */
  note?: string;
  /**
   * Superset marker: rows sharing a group letter within one session are
   * performed back-to-back (must be adjacent). Rendered into the note.
   */
  supersetGroup?: string;
  weekly: WeeklyPrescriptions;
}

export interface TemplateSession {
  /** Stable key within the template (e.g. "upperA"). */
  key: string;
  /** Slot title shown on plan cards (e.g. "Upper A · Bench + Row"). */
  title: string;
  /** One-line muscle/movement focus for the detail view. */
  focus: string;
  exercises: TemplateExercise[];
}

/** Per-week phase metadata shown in the UI and stamped into slot detail lines. */
export interface TemplateWeekMeta {
  /** 1-based program week. */
  weekNumber: number;
  /** Short phase label, e.g. "Build · heaviest 5s". */
  label: string;
  /** One-sentence coach note about the intent of the week. */
  coachNote: string;
  intensity: TemplateIntensity;
}

export interface PlanTemplate {
  /** Stable id used in the API path (e.g. "strength-upper-lower"). */
  id: string;
  name: string;
  /** One-line pitch for the browse card. */
  tagline: string;
  /** Goal string for CreatePlanDto.goal (matches generated-plan apply values). */
  goal: TemplateGoalApi;
  /** PlanInputs-style goal id (frontend display logic). */
  goalId: TemplateGoalId;
  /** Human split label, e.g. "Upper / Lower". */
  split: string;
  splitId: TemplateSplitId;
  /** Program template id for CreatePlanDto.programTemplateId (existing LLM-context ids). */
  programTemplateId: 'upper-lower-4' | 'full-body-3' | 'ppl';
  daysPerWeek: number;
  weeksCount: typeof PLAN_TEMPLATE_WEEKS;
  experienceLevel: 'beginner' | 'intermediate' | 'advanced';
  /** Sensible default training days (length === daysPerWeek, Monday-first order). */
  defaultWeekdays: TemplateWeekday[];
  /** Short muscle-focus chips for the browse card (e.g. ["Squat", "Bench", "Deadlift"]). */
  muscleFocus: string[];
  /** "What's inside" bullets for the detail view. */
  summary: string[];
  /** Paragraph describing the periodization model. */
  progression: string;
  /** Phase metadata, one entry per week (index 0 = week 1). */
  weekMeta: TemplateWeekMeta[];
  /** Sessions in weekday order (session[i] lands on the i-th selected weekday). */
  sessions: TemplateSession[];
}

/**
 * Planned session length for one week of one session. Rest-aware, because the
 * templates prescribe real per-row rests: a rep set costs ~40s of work plus
 * its prescribed rest (clamped so 4-minute anchor rests don't run away and
 * short-rest finisher rounds still cost real time); a time row costs its
 * duration plus rest. Warm-up buffer and between-exercise transitions follow
 * the same shape as the frontend estimate (`estimateWorkoutMinutes.ts`).
 * Rounded to 5 so slot durations read as planned numbers.
 */
export function estimateTemplateSessionMinutes(
  session: TemplateSession,
  weekIndex0: number,
): number {
  const rows = session.exercises;
  let work = 0;
  for (const ex of rows) {
    const week = ex.weekly[weekIndex0];
    if (!week) continue;
    const perSet =
      week.durationSeconds != null
        ? // Cardio/hold rows: the whole duration is work (a 12-min rower piece
          // really takes 12 minutes) — no upper clamp.
          Math.max(45, week.durationSeconds + ex.restSeconds)
        : Math.min(3.5 * 60, Math.max(60, ex.restSeconds + 40));
    work += (week.sets * perSet) / 60;
  }
  const warmup = 3.5 + Math.min(5.5, rows.length * 0.65);
  const raw = warmup + work + Math.max(0, rows.length - 1) * 1.5;
  const rounded = Math.round(raw / 5) * 5;
  return Math.max(20, Math.min(90, rounded));
}
