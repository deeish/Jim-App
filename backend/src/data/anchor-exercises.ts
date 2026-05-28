/**
 * Curated "anchor" exercises per focus. At least one anchor should appear in each workout
 * so routines feel like proven programs (e.g. bench on push day, squat on leg day).
 * IDs must exist in exercises_5000plus.json (same format as common-exercise-ids).
 */

export const ANCHOR_EXERCISES_BY_FOCUS: Record<string, string[]> = {
  push: [
    'flat_barbell_bench_press',
    'flat_dumbbell_bench_press',
    'barbell_overhead_press',
    'seated_barbell_overhead_press',
    'chest_dip',
    'incline_barbell_bench_press',
    'straight_bar_cable_pushdown',
  ],
  pull: [
    'pull_up_pronated',
    'lat_pulldown_wide',
    'barbell_bent_over_row',
    'conventional_deadlift',
    'standing_dumbbell_curl',
  ],
  legs: [
    'back_squat',
    'front_squat',
    'forty_five_degree_leg_press',
    'conventional_deadlift',
    'sumo_deadlift',
    'lying_leg_curl',
    'seated_leg_extension',
    'standing_calf_raise_machine',
  ],
  upper: [
    'flat_barbell_bench_press',
    'flat_dumbbell_bench_press',
    'barbell_bent_over_row',
    'lat_pulldown_wide',
    'barbell_overhead_press',
    'pull_up_pronated',
    'standing_dumbbell_curl',
    'straight_bar_cable_pushdown',
  ],
  lower: [
    'back_squat',
    'forty_five_degree_leg_press',
    'conventional_deadlift',
    'lying_leg_curl',
    'seated_leg_extension',
    'standing_calf_raise_machine',
  ],
  'upper body': [
    'flat_barbell_bench_press',
    'barbell_bent_over_row',
    'lat_pulldown_wide',
    'barbell_overhead_press',
    'standing_dumbbell_curl',
    'straight_bar_cable_pushdown',
  ],
  'lower body': [
    'back_squat',
    'conventional_deadlift',
    'forty_five_degree_leg_press',
    'lying_leg_curl',
    'seated_leg_extension',
    'standing_calf_raise_machine',
  ],
  'full body': [
    'conventional_deadlift',
    'back_squat',
    'flat_barbell_bench_press',
    'pull_up_pronated',
    'barbell_bent_over_row',
    'barbell_overhead_press',
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
