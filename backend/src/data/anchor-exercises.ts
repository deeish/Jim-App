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
    'incline_dumbbell_bench_press',
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
  // A bands-only home ends each lower list with the band hinges (scenario
  // matrix 2026-09-17, plan 15: the pool had no hinge opener beyond the
  // glute bridge and the single-leg RDL, so a "Deadlift" day opened with the
  // bodyweight single-leg RDL every week).
  legs: [
    'back_squat',
    'front_squat',
    'box_squat',
    'machine_hack_squat',
    'forty_five_degree_leg_press',
    'conventional_deadlift',
    'trap_bar_deadlift',
    'barbell_sumo_deadlift',
    'goblet_squat',
    'dumbbell_romanian_deadlift',
    'resistance_band_romanian_deadlift',
    'resistance_band_pull_through',
    'resistance_band_good_morning',
    'bodyweight_squat',
    'dumbbell_sumo_squat',
    'sumo_squat',
    'glute_bridge',
    'bodyweight_single_leg_romanian_deadlift',
  ],
  upper: [
    'flat_barbell_bench_press',
    'flat_dumbbell_bench_press',
    'incline_dumbbell_bench_press',
    'barbell_bent_over_row',
    'lat_pulldown_wide',
    'barbell_overhead_press',
    'pull_up_pronated',
    'single_arm_dumbbell_row',
    'push_up',
  ],
  lower: [
    'back_squat',
    'front_squat',
    'box_squat',
    'machine_hack_squat',
    'forty_five_degree_leg_press',
    'conventional_deadlift',
    'trap_bar_deadlift',
    'goblet_squat',
    'dumbbell_romanian_deadlift',
    'resistance_band_romanian_deadlift',
    'resistance_band_pull_through',
    'resistance_band_good_morning',
    'bodyweight_squat',
    'dumbbell_sumo_squat',
    'sumo_squat',
    'glute_bridge',
    'bodyweight_single_leg_romanian_deadlift',
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
    'resistance_band_romanian_deadlift',
    'resistance_band_pull_through',
    'resistance_band_good_morning',
    'bodyweight_squat',
  ],
  'full body': [
    'conventional_deadlift',
    'trap_bar_deadlift',
    'back_squat',
    'flat_barbell_bench_press',
    'pull_up_pronated',
    'barbell_bent_over_row',
    'barbell_overhead_press',
    'goblet_squat',
    'flat_dumbbell_bench_press',
    'dumbbell_romanian_deadlift',
    'resistance_band_romanian_deadlift',
    'resistance_band_pull_through',
    'resistance_band_good_morning',
    'single_arm_dumbbell_row',
    'push_up',
    'bodyweight_squat',
    'glute_bridge',
    'bodyweight_single_leg_romanian_deadlift',
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

/**
 * Anchors that open a session only when nothing heavier is on hand: a home
 * dumbbell or bodyweight list, or a beginner learning the pattern. In a gym
 * an intermediate's first lift is a barbell or machine staple. Rig run
 * 2026-09-17: a goblet squat and a bodyweight squat led two lower days for
 * an intermediate with a full rack, and the slot-one check let them through
 * because membership in the anchor list was the only test.
 */
export const LIGHT_ANCHOR_IDS: ReadonlySet<string> = new Set([
  'goblet_squat',
  'bodyweight_squat',
  'dumbbell_sumo_squat',
  'sumo_squat',
  'glute_bridge',
  'bodyweight_single_leg_romanian_deadlift',
  'push_up',
  'single_arm_dumbbell_row',
  'dumbbell_romanian_deadlift',
  'resistance_band_romanian_deadlift',
  'resistance_band_pull_through',
  'resistance_band_good_morning',
]);

export type OpenerContext = {
  equipment?: string[];
  difficulty?: string;
};

/** A gym is any equipment list with a bar, cables or machines. */
export function isGymLikeEquipment(equipment: string[] | undefined): boolean {
  return (equipment ?? []).some((e) =>
    /barbell|cable|machine|smith|rack/i.test(e),
  );
}

/**
 * The anchors a session may open with for this user: the accepted set for the
 * focus, minus the light anchors when the user trains in a gym and is past
 * beginner.
 */
export function getAcceptedOpenerIdsForFocus(
  focus: string,
  ctx?: OpenerContext,
): string[] {
  const accepted = getAcceptedAnchorIdsForFocus(focus);
  if (!ctx || !isGymLikeEquipment(ctx.equipment)) return accepted;
  if ((ctx.difficulty ?? '').toLowerCase() === 'beginner') return accepted;
  return accepted.filter((id) => !LIGHT_ANCHOR_IDS.has(id));
}
