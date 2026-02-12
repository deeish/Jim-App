/**
 * Generation pipeline stage outputs (contract for the engine).
 * Pipeline: PlanInputs → Stage 1 → … → Stage 7 → PlanDraft.
 */

import type { Weekday } from './plan';

// --- Stage 1: Resolve effective split
export interface EffectiveSplitResult {
  effectiveSplitId: string;
  effectiveSplitMeta: Record<string, unknown>;
}

// --- Stage 2: Week skeleton (structure before AI)
export type SessionTypePlaceholder = 'strength' | 'cardio' | 'recovery' | 'rest';

export interface DaySkeleton {
  weekday: Weekday;
  sessionType: SessionTypePlaceholder;
}

export interface WeekSkeleton {
  weekIndex: number;
  days: DaySkeleton[];
}

// --- Stage 3: Template assignments
export interface TemplateAssignment {
  templateId: string;
  index: number;
  reason?: string;
}

export interface TemplateAssignments {
  byDay: Partial<Record<string, TemplateAssignment>>;
}

// --- Stage 4: Session specs (pre-AI)
export interface SessionSpec {
  type: 'strength' | 'cardio' | 'recovery';
  title?: string;
  targetMuscleGroups?: string[];
  durationMin: number;
  durationMax: number;
  isHardDay: boolean;
  avoidConstraints?: string[];
  locationConstraint?: 'gym' | 'home';
  detailLevel: 'simple' | 'detailed';
}

export interface WeekSessionSpecs {
  weekIndex: number;
  specs: (SessionSpec | null)[];
}
