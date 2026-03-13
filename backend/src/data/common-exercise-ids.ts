/**
 * Curated list of "common" gym exercise IDs (exercises_5000plus.json).
 * Search results are sorted so these appear first, in this order.
 * Add or reorder IDs to tune what users see first.
 * IDs not in the dataset are ignored (no error).
 */
export const COMMON_EXERCISE_IDS: string[] = [
  // Chest – bench & push
  'flat_barbell_bench_press',
  'flat_dumbbell_bench_press',
  'incline_barbell_bench_press',
  'incline_dumbbell_bench_press',
  'decline_barbell_bench_press',
  'chest_dip',
  'flat_dumbbell_fly',
  // Back – rows & pull
  'barbell_bent_over_row',
  'lat_pulldown_wide',
  'pull_up_pronated',
  'machine_assisted_pull_up',
  'conventional_deadlift',
  'sumo_deadlift',
  'trap_bar_deadlift',
  // Shoulders
  'barbell_overhead_press',
  'seated_barbell_overhead_press',
  // Legs – squat, hinge, lunge
  'back_squat',
  'front_squat',
  'goblet_squat',
  'forty_five_degree_leg_press',
  'lying_leg_curl',
  'seated_leg_extension',
  'bodyweight_calf_raise',
  'standing_calf_raise_machine',
  // Arms
  'standing_barbell_curl',
  'standing_dumbbell_curl',
  'straight_bar_cable_pushdown',
  'rope_cable_pushdown',
  // Core
  'floor_crunch',
];

/** Set for O(1) lookup: is this ID in the common list? */
const COMMON_ID_SET = new Set(COMMON_EXERCISE_IDS);

/**
 * Returns the index in the common list (0-based), or Infinity if not in list.
 * Lower index = higher priority (show first).
 */
export function getCommonExerciseRank(id: string): number {
  const index = COMMON_EXERCISE_IDS.indexOf(id);
  return index === -1 ? Infinity : index;
}

export function isCommonExercise(id: string): boolean {
  return COMMON_ID_SET.has(id);
}
