import type { PlanTemplate } from './types';
import { estimateTemplateSessionMinutes } from './types';
import { STRENGTH_UPPER_LOWER } from './strength-upper-lower';
import { FAT_LOSS_FULL_BODY } from './fat-loss-full-body';
import { HYBRID_PPL } from './hybrid-ppl';
import { BEGINNER_FULL_BODY } from './beginner-full-body';
import { HOME_DUMBBELL_FULL_BODY } from './home-dumbbell-full-body';

export * from './types';
export { STRENGTH_UPPER_LOWER } from './strength-upper-lower';
export { FAT_LOSS_FULL_BODY } from './fat-loss-full-body';
export { HYBRID_PPL } from './hybrid-ppl';
export { BEGINNER_FULL_BODY } from './beginner-full-body';
export { HOME_DUMBBELL_FULL_BODY } from './home-dumbbell-full-body';

/** All hand-authored programs, browse order (newcomer-friendly first). */
export const PLAN_TEMPLATES_V1: PlanTemplate[] = [
  BEGINNER_FULL_BODY,
  STRENGTH_UPPER_LOWER,
  FAT_LOSS_FULL_BODY,
  HYBRID_PPL,
  HOME_DUMBBELL_FULL_BODY,
];

/** Card projection for the list endpoint (no weekly programming payload). */
export interface PlanTemplateCard {
  id: string;
  name: string;
  tagline: string;
  goal: PlanTemplate['goal'];
  goalId: PlanTemplate['goalId'];
  split: string;
  splitId: PlanTemplate['splitId'];
  daysPerWeek: number;
  supportedDaysPerWeek: PlanTemplate['supportedDaysPerWeek'];
  weeksCount: number;
  experienceLevel: PlanTemplate['experienceLevel'];
  defaultWeekdays: PlanTemplate['defaultWeekdays'];
  muscleFocus: string[];
  /** Typical session length band across the block (min/max of per-week estimates). */
  sessionMinutes: { min: number; max: number };
}

export function toPlanTemplateCard(t: PlanTemplate): PlanTemplateCard {
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (const session of t.sessions) {
    for (let w = 0; w < t.weeksCount; w++) {
      const est = estimateTemplateSessionMinutes(session, w);
      if (est < min) min = est;
      if (est > max) max = est;
    }
  }
  if (!Number.isFinite(min)) min = 0;
  return {
    id: t.id,
    name: t.name,
    tagline: t.tagline,
    goal: t.goal,
    goalId: t.goalId,
    split: t.split,
    splitId: t.splitId,
    daysPerWeek: t.daysPerWeek,
    supportedDaysPerWeek: t.supportedDaysPerWeek,
    weeksCount: t.weeksCount,
    experienceLevel: t.experienceLevel,
    defaultWeekdays: t.defaultWeekdays,
    muscleFocus: t.muscleFocus,
    sessionMinutes: { min, max },
  };
}

export function getPlanTemplateById(id: string): PlanTemplate | undefined {
  return PLAN_TEMPLATES_V1.find((t) => t.id === id);
}
