import { api } from '../api/client';
import type { Weekday } from '../types/plan';

/**
 * Hand-authored plan templates (backend `src/data/plan-templates/`).
 * Read-only endpoints; applying a template goes through the EXISTING plan
 * save flow (`createPlan` in planService) with a body materialized by
 * `lib/templatePlan.ts`.
 */

export type TemplateGoalApi = 'strength' | 'fat loss' | 'hybrid';
export type TemplateGoalId = 'strength' | 'fat_loss' | 'balanced';
export type TemplateIntensity = 'Easy' | 'Medium' | 'Hard';

export interface PlanTemplateCard {
  id: string;
  name: string;
  tagline: string;
  goal: TemplateGoalApi;
  goalId: TemplateGoalId;
  split: string;
  splitId: 'upper_lower' | 'full_body' | 'ppl';
  /** Authored (recommended) training days/week. */
  daysPerWeek: number;
  /**
   * Inclusive schedulable range. Optional because a client can meet an older
   * backend during the BE-first deploy window — absent means "authored count
   * only" (see supportedDayRange in lib/templatePlan.ts).
   */
  supportedDaysPerWeek?: { min: number; max: number };
  weeksCount: number;
  experienceLevel: 'beginner' | 'intermediate' | 'advanced';
  defaultWeekdays: Weekday[];
  muscleFocus: string[];
  sessionMinutes: { min: number; max: number };
}

export interface TemplateWeekPrescription {
  sets: number;
  repsMin?: number;
  repsMax?: number;
  durationSeconds?: number;
  note?: string;
}

export interface TemplateExercise {
  exerciseId: string;
  name: string;
  prescriptionType: 'reps' | 'time';
  restSeconds: number;
  note?: string;
  supersetGroup?: string;
  /** One entry per program week (index 0 = week 1). */
  weekly: TemplateWeekPrescription[];
}

export interface TemplateSession {
  key: string;
  title: string;
  focus: string;
  exercises: TemplateExercise[];
}

export interface TemplateWeekMeta {
  weekNumber: number;
  label: string;
  coachNote: string;
  intensity: TemplateIntensity;
}

export interface PlanTemplateDetail extends PlanTemplateCard {
  programTemplateId: string;
  summary: string[];
  progression: string;
  weekMeta: TemplateWeekMeta[];
  sessions: TemplateSession[];
}

export async function listPlanTemplates(): Promise<PlanTemplateCard[]> {
  const response = await api.get<{ templates: PlanTemplateCard[] }>(
    '/plan-templates',
  );
  return response.data.templates;
}

export async function getPlanTemplate(id: string): Promise<PlanTemplateDetail> {
  const response = await api.get<PlanTemplateDetail>(`/plan-templates/${id}`);
  return response.data;
}
