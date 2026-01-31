/**
 * Curated list of "common" gym exercise IDs (exercises_5000plus.json).
 * Search results are sorted so these appear first, in this order.
 * Add or reorder IDs to tune what users see first.
 * IDs not in the dataset are ignored (no error).
 */
export const COMMON_EXERCISE_IDS: string[] = [
  // Chest – bench & push
  'bench_press_barbell_flat',
  'bench_press_dumbbell_flat',
  'bench_press_barbell_incline',
  'bench_press_dumbbell_incline',
  'bench_press_barbell_decline',
  'dip_bodyweight_chest_lean',
  'chest_fly_dumbbell_flat',
  // Back – rows & pull
  'row_barbell_bent_over',
  'lat_pulldown_cable_wide_grip',
  'pull_up_bodyweight',
  'pull_up_bodyweight_assisted',
  'deadlift_barbell_conventional',
  'deadlift_barbell_sumo',
  'deadlift_barbell_trap_bar',
  // Shoulders
  'overhead_press_barbell_standing',
  'overhead_press_barbell_seated',
  // Legs – squat, hinge, lunge
  'squat_barbell_back',
  'squat_barbell_front',
  'squat_dumbbell_goblet',
  'leg_press_machine',
  'lunge_bodyweight_forward',
  'lunge_dumbbell_forward',
  'leg_curl_machine_lying',
  'leg_extension_machine',
  'calf_raise_bodyweight_standing',
  'calf_raise_machine_standing',
  // Arms
  'bicep_curl_dumbbell_dumbbell',
  'bicep_curl_barbell',
  'tricep_pushdown_cable_bar',
  'tricep_pushdown_cable_rope',
  // Core
  'crunch_bodyweight_floor',
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
