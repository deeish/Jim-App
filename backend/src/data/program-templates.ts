/**
 * Program templates define weekly structure: which days exist and what focus each has.
 * Used so the generator produces coherent splits (e.g. Push/Pull/Legs) instead of unrelated days.
 */

export type FocusKey =
  | 'push'
  | 'pull'
  | 'legs'
  | 'upper'
  | 'lower'
  | 'full body'
  | 'upper body'
  | 'lower body'
  | 'cardio'
  | 'recovery'
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'arms';

/** Normalize frontend focus text (e.g. "Upper Body", "Chest", "Back") to a key we can map to slots. */
export function normalizeFocusToKey(focus: string): FocusKey | string {
  const lower = focus.toLowerCase().trim();
  if (/^push\b/.test(lower)) return 'push';
  if (/^pull\b/.test(lower)) return 'pull';
  if (/^legs\b/.test(lower) || lower === 'lower' || lower === 'lower body')
    return 'lower';
  if (/^upper\b/.test(lower) || lower === 'upper body') return 'upper';
  if (/full body|\+ *run|\+ *cardio/.test(lower))
    return lower.includes('run') || lower.includes('cardio')
      ? 'full body'
      : 'full body';
  if (/cardio|recovery/.test(lower))
    return lower.includes('recovery') ? 'recovery' : 'cardio';
  if (/^chest\b/.test(lower)) return 'chest';
  if (/^back\b/.test(lower)) return 'back';
  if (/^shoulders?\b/.test(lower)) return 'shoulders';
  if (/^arms\b/.test(lower)) return 'arms';
  return lower.split(/\+|&|,/)[0].trim() || 'full body';
}

/**
 * Workout "slots" define the structure of a single workout: what type of exercise goes in each position.
 * Compounds first, then accessories, then optional finisher. LLM fills one exercise per slot from the list.
 */
export type SlotRole =
  | 'main_compound_1'
  | 'main_compound_2'
  | 'accessory_1'
  | 'accessory_2'
  | 'accessory_3'
  | 'finisher'
  | 'warm_up'
  | 'cool_down';

export interface SlotDefinition {
  role: SlotRole;
  /** Short description for the LLM, e.g. "horizontal push (bench press style)" */
  description: string;
  /** Minimum exercises in this slot (usually 1). */
  min?: number;
  /** Max exercises (default 1). Finisher can be 0-1. */
  max?: number;
}

/** Slot structure per focus. Order = exercise order in workout. */
export const SLOTS_BY_FOCUS: Record<string, SlotDefinition[]> = {
  push: [
    {
      role: 'main_compound_1',
      description: 'Horizontal push (e.g. bench press, push-up)',
      min: 1,
      max: 1,
    },
    {
      role: 'main_compound_2',
      description: 'Vertical push (e.g. overhead press)',
      min: 1,
      max: 1,
    },
    {
      role: 'accessory_1',
      description: 'Chest or shoulder isolation',
      min: 1,
      max: 1,
    },
    { role: 'accessory_2', description: 'Triceps isolation', min: 1, max: 1 },
    {
      role: 'finisher',
      description: 'Optional triceps or light pump finisher',
      min: 0,
      max: 1,
    },
  ],
  pull: [
    {
      role: 'main_compound_1',
      description: 'Vertical pull (e.g. pull-up, lat pulldown)',
      min: 1,
      max: 1,
    },
    {
      role: 'main_compound_2',
      description: 'Horizontal pull (e.g. row)',
      min: 1,
      max: 1,
    },
    {
      role: 'accessory_1',
      description: 'Back or bicep isolation',
      min: 1,
      max: 1,
    },
    { role: 'accessory_2', description: 'Biceps isolation', min: 1, max: 1 },
    { role: 'finisher', description: 'Optional core or grip', min: 0, max: 1 },
  ],
  legs: [
    {
      role: 'main_compound_1',
      description: 'Squat pattern (e.g. back squat, leg press)',
      min: 1,
      max: 1,
    },
    {
      role: 'main_compound_2',
      description: 'Hinge pattern (e.g. deadlift, RDL)',
      min: 1,
      max: 1,
    },
    {
      role: 'accessory_1',
      description: 'Quad or hamstring isolation',
      min: 1,
      max: 1,
    },
    { role: 'accessory_2', description: 'Calves or glutes', min: 1, max: 1 },
    { role: 'finisher', description: 'Optional core', min: 0, max: 1 },
  ],
  upper: [
    {
      role: 'main_compound_1',
      description: 'Horizontal push (bench, push-up)',
      min: 1,
      max: 1,
    },
    {
      role: 'main_compound_2',
      description: 'Horizontal or vertical pull (row, pulldown)',
      min: 1,
      max: 1,
    },
    {
      role: 'accessory_1',
      description: 'Vertical push (overhead press) or arms',
      min: 1,
      max: 1,
    },
    {
      role: 'accessory_2',
      description: 'Arms or shoulders isolation',
      min: 1,
      max: 1,
    },
    { role: 'finisher', description: 'Optional core or arms', min: 0, max: 1 },
  ],
  lower: [
    {
      role: 'main_compound_1',
      description: 'Squat or leg press',
      min: 1,
      max: 1,
    },
    {
      role: 'main_compound_2',
      description: 'Hinge (deadlift, RDL)',
      min: 1,
      max: 1,
    },
    { role: 'accessory_1', description: 'Leg isolation', min: 1, max: 1 },
    { role: 'accessory_2', description: 'Calves or core', min: 1, max: 1 },
    { role: 'finisher', description: 'Optional', min: 0, max: 1 },
  ],
  'upper body': [
    {
      role: 'main_compound_1',
      description: 'Push (bench or press)',
      min: 1,
      max: 1,
    },
    {
      role: 'main_compound_2',
      description: 'Pull (row or pulldown)',
      min: 1,
      max: 1,
    },
    { role: 'accessory_1', description: 'Shoulders or arms', min: 1, max: 1 },
    { role: 'accessory_2', description: 'Arms or core', min: 1, max: 1 },
    { role: 'finisher', description: 'Optional', min: 0, max: 1 },
  ],
  'lower body': [
    { role: 'main_compound_1', description: 'Squat pattern', min: 1, max: 1 },
    { role: 'main_compound_2', description: 'Hinge pattern', min: 1, max: 1 },
    { role: 'accessory_1', description: 'Leg isolation', min: 1, max: 1 },
    { role: 'accessory_2', description: 'Calves or core', min: 1, max: 1 },
    { role: 'finisher', description: 'Optional', min: 0, max: 1 },
  ],
  'full body': [
    {
      role: 'main_compound_1',
      description: 'Lower body compound (squat or deadlift)',
      min: 1,
      max: 1,
    },
    {
      role: 'main_compound_2',
      description: 'Upper push (bench or press)',
      min: 1,
      max: 1,
    },
    {
      role: 'accessory_1',
      description: 'Upper pull (row or pulldown)',
      min: 1,
      max: 1,
    },
    {
      role: 'accessory_2',
      description: 'Accessory (arms, shoulders, or core)',
      min: 1,
      max: 1,
    },
    {
      role: 'finisher',
      description: 'Optional core or cardio',
      min: 0,
      max: 1,
    },
  ],
  chest: [
    {
      role: 'main_compound_1',
      description: 'Horizontal push (bench press)',
      min: 1,
      max: 1,
    },
    {
      role: 'main_compound_2',
      description: 'Incline or variation',
      min: 1,
      max: 1,
    },
    {
      role: 'accessory_1',
      description: 'Chest isolation (fly, crossover)',
      min: 1,
      max: 1,
    },
    {
      role: 'accessory_2',
      description: 'Optional dip or push-up',
      min: 0,
      max: 1,
    },
  ],
  back: [
    {
      role: 'main_compound_1',
      description: 'Vertical pull (pulldown, pull-up)',
      min: 1,
      max: 1,
    },
    {
      role: 'main_compound_2',
      description: 'Horizontal pull (row)',
      min: 1,
      max: 1,
    },
    {
      role: 'accessory_1',
      description: 'Back or bicep isolation',
      min: 1,
      max: 1,
    },
  ],
  shoulders: [
    { role: 'main_compound_1', description: 'Overhead press', min: 1, max: 1 },
    {
      role: 'accessory_1',
      description: 'Lateral or front raise',
      min: 1,
      max: 1,
    },
    {
      role: 'accessory_2',
      description: 'Rear delt or isolation',
      min: 1,
      max: 1,
    },
  ],
  arms: [
    {
      role: 'main_compound_1',
      description: 'Triceps (pushdown, extension, dip)',
      min: 1,
      max: 1,
    },
    { role: 'main_compound_2', description: 'Biceps (curl)', min: 1, max: 1 },
    {
      role: 'accessory_1',
      description: 'Additional arm isolation',
      min: 1,
      max: 1,
    },
  ],
  cardio: [],
  recovery: [],
};

/** Get slot definitions for a focus (normalized). Returns default full-body-style slots if focus unknown. */
export function getSlotsForFocus(focus: string): SlotDefinition[] {
  const key = normalizeFocusToKey(focus);
  const slots = SLOTS_BY_FOCUS[key as keyof typeof SLOTS_BY_FOCUS];
  if (slots?.length) return slots;
  return SLOTS_BY_FOCUS['full body'];
}
