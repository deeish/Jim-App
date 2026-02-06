/**
 * Curated "anchor" exercises per focus. At least one anchor should appear in each workout
 * so routines feel like proven programs (e.g. bench on push day, squat on leg day).
 * IDs must exist in exercises_5000plus.json (same format as common-exercise-ids).
 */

export const ANCHOR_EXERCISES_BY_FOCUS: Record<string, string[]> = {
  push: [
    'bench_press_barbell_flat',
    'bench_press_dumbbell_flat',
    'overhead_press_barbell_standing',
    'overhead_press_barbell_seated',
    'dip_bodyweight_chest_lean',
    'bench_press_barbell_incline',
    'tricep_pushdown_cable_bar',
  ],
  pull: [
    'pull_up_bodyweight',
    'lat_pulldown_cable_wide_grip',
    'row_barbell_bent_over',
    'deadlift_barbell_conventional',
    'bicep_curl_dumbbell_dumbbell',
  ],
  legs: [
    'squat_barbell_back',
    'squat_barbell_front',
    'leg_press_machine',
    'deadlift_barbell_conventional',
    'deadlift_barbell_sumo',
    'leg_curl_machine_lying',
    'leg_extension_machine',
    'calf_raise_machine_standing',
  ],
  upper: [
    'bench_press_barbell_flat',
    'bench_press_dumbbell_flat',
    'row_barbell_bent_over',
    'lat_pulldown_cable_wide_grip',
    'overhead_press_barbell_standing',
    'pull_up_bodyweight',
    'bicep_curl_dumbbell_dumbbell',
    'tricep_pushdown_cable_bar',
  ],
  lower: [
    'squat_barbell_back',
    'leg_press_machine',
    'deadlift_barbell_conventional',
    'leg_curl_machine_lying',
    'leg_extension_machine',
    'calf_raise_machine_standing',
  ],
  'upper body': [
    'bench_press_barbell_flat',
    'row_barbell_bent_over',
    'lat_pulldown_cable_wide_grip',
    'overhead_press_barbell_standing',
    'bicep_curl_dumbbell_dumbbell',
    'tricep_pushdown_cable_bar',
  ],
  'lower body': [
    'squat_barbell_back',
    'deadlift_barbell_conventional',
    'leg_press_machine',
    'leg_curl_machine_lying',
    'leg_extension_machine',
    'calf_raise_machine_standing',
  ],
  'full body': [
    'deadlift_barbell_conventional',
    'squat_barbell_back',
    'bench_press_barbell_flat',
    'pull_up_bodyweight',
    'row_barbell_bent_over',
    'overhead_press_barbell_standing',
  ],
};

/** Get anchor exercise IDs for a focus (normalized key). Returns empty array for cardio/recovery. */
export function getAnchorIdsForFocus(focus: string): string[] {
  const key = focus.toLowerCase().trim();
  if (/^push\b/.test(key)) return ANCHOR_EXERCISES_BY_FOCUS.push ?? [];
  if (/^pull\b/.test(key)) return ANCHOR_EXERCISES_BY_FOCUS.pull ?? [];
  if (/^legs\b|^lower\b|lower body/.test(key)) return ANCHOR_EXERCISES_BY_FOCUS.lower ?? ANCHOR_EXERCISES_BY_FOCUS['lower body'] ?? [];
  if (/^upper\b|upper body/.test(key)) return ANCHOR_EXERCISES_BY_FOCUS.upper ?? ANCHOR_EXERCISES_BY_FOCUS['upper body'] ?? [];
  if (/full body/.test(key)) return ANCHOR_EXERCISES_BY_FOCUS['full body'] ?? [];
  return [];
}
