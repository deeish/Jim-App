/**
 * Curated "anchor" exercises per focus. At least one anchor should appear in each workout
 * so routines feel like proven programs (e.g. bench on push day, squat on leg day).
 * IDs must exist in exercises_5000plus.json (same format as common-exercise-ids).
 */

/**
 * Compounds only — an "anchor" is a lift a trainer would open a session with,
 * so isolation moves (curls, pushdowns, leg extensions) never belong here even
 * though they're common. Each list keeps gym staples first (slot-1 swaps take
 * the first acceptable candidate) and ends with dumbbell/bodyweight options so
 * home users (Dumbbell / Resistance Band / Bodyweight) always have a reachable
 * anchor once equipment filtering applies.
 */
export const ANCHOR_EXERCISES_BY_FOCUS: Record<string, string[]> = {
  push: [
    'flat_barbell_bench_press',
    'incline_barbell_bench_press',
    'barbell_overhead_press',
    'seated_barbell_overhead_press',
    'chest_dip',
    'flat_dumbbell_bench_press',
    'push_up',
  ],
  pull: [
    'pull_up_pronated',
    'lat_pulldown_wide',
    'barbell_bent_over_row',
    'conventional_deadlift',
    'chin_up',
    'single_arm_dumbbell_row',
  ],
  legs: [
    'back_squat',
    'front_squat',
    'forty_five_degree_leg_press',
    'conventional_deadlift',
    'barbell_sumo_deadlift',
    'goblet_squat',
    'dumbbell_romanian_deadlift',
    'bodyweight_squat',
  ],
  upper: [
    'flat_barbell_bench_press',
    'flat_dumbbell_bench_press',
    'barbell_bent_over_row',
    'lat_pulldown_wide',
    'barbell_overhead_press',
    'pull_up_pronated',
    'single_arm_dumbbell_row',
    'push_up',
  ],
  lower: [
    'back_squat',
    'forty_five_degree_leg_press',
    'conventional_deadlift',
    'goblet_squat',
    'dumbbell_romanian_deadlift',
    'bodyweight_squat',
  ],
  'upper body': [
    'flat_barbell_bench_press',
    'barbell_bent_over_row',
    'lat_pulldown_wide',
    'barbell_overhead_press',
    'flat_dumbbell_bench_press',
    'single_arm_dumbbell_row',
    'push_up',
  ],
  'lower body': [
    'back_squat',
    'conventional_deadlift',
    'forty_five_degree_leg_press',
    'goblet_squat',
    'dumbbell_romanian_deadlift',
    'bodyweight_squat',
  ],
  'full body': [
    'conventional_deadlift',
    'back_squat',
    'flat_barbell_bench_press',
    'pull_up_pronated',
    'barbell_bent_over_row',
    'barbell_overhead_press',
    'goblet_squat',
    'flat_dumbbell_bench_press',
    'dumbbell_romanian_deadlift',
    'single_arm_dumbbell_row',
    'push_up',
    'bodyweight_squat',
  ],
};

/** Get anchor exercise IDs for a focus (normalized key). Returns empty array for cardio/recovery/body-part. */
export function getAnchorIdsForFocus(focus: string): string[] {
  const key = focus.toLowerCase().trim();
  if (/^push\b/.test(key)) return ANCHOR_EXERCISES_BY_FOCUS.push ?? [];
  if (/^pull\b/.test(key)) return ANCHOR_EXERCISES_BY_FOCUS.pull ?? [];
  if (/^legs\b|^lower\b|lower body/.test(key))
    return (
      ANCHOR_EXERCISES_BY_FOCUS.lower ??
      ANCHOR_EXERCISES_BY_FOCUS['lower body'] ??
      []
    );
  if (/^upper\b|upper body/.test(key))
    return (
      ANCHOR_EXERCISES_BY_FOCUS.upper ??
      ANCHOR_EXERCISES_BY_FOCUS['upper body'] ??
      []
    );
  if (/full body/.test(key))
    return ANCHOR_EXERCISES_BY_FOCUS['full body'] ?? [];
  if (/^chest\b|^back\b|^shoulders?\b|^arms\b/.test(key)) return [];
  return [];
}

/**
 * Larger set of "acceptable" anchors for slot-1 enforcement. A trainer wouldn't
 * blink at an Upper day opening with `incline_barbell_bench_press` (a Push anchor)
 * even though it isn't in the curated `upper` list, so the validator treats the
 * union of related focuses as acceptable. Narrow focuses (push, pull, chest, etc.)
 * still use the direct list.
 */
export function getAcceptedAnchorIdsForFocus(focus: string): string[] {
  const key = focus.toLowerCase().trim();
  if (/^upper\b|upper body/.test(key)) {
    return [
      ...new Set([
        ...(ANCHOR_EXERCISES_BY_FOCUS.upper ?? []),
        ...(ANCHOR_EXERCISES_BY_FOCUS['upper body'] ?? []),
        ...(ANCHOR_EXERCISES_BY_FOCUS.push ?? []),
        ...(ANCHOR_EXERCISES_BY_FOCUS.pull ?? []),
      ]),
    ];
  }
  if (/^legs\b|^lower\b|lower body/.test(key)) {
    return [
      ...new Set([
        ...(ANCHOR_EXERCISES_BY_FOCUS.lower ?? []),
        ...(ANCHOR_EXERCISES_BY_FOCUS['lower body'] ?? []),
        ...(ANCHOR_EXERCISES_BY_FOCUS.legs ?? []),
      ]),
    ];
  }
  if (/full body/.test(key)) {
    // For Full Body the "acceptable" set is the full anchor universe — any
    // staple compound is fine in slot 1.
    return [
      ...new Set(Object.values(ANCHOR_EXERCISES_BY_FOCUS).flat() as string[]),
    ];
  }
  return getAnchorIdsForFocus(focus);
}
