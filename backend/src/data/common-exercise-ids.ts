/**
 * Curated list of "common" gym exercise IDs (exercises_5000plus.json).
 * Search results are sorted so these appear first, in this order.
 * Add or reorder IDs to tune what users see first.
 * IDs not in the dataset are ignored (no error).
 *
 * This list also shapes plan generation: `getCandidatesForGenerator` inherits
 * the search order, so the LLM's candidate pools and every deterministic swap
 * pass see these staples first. Before the list was expanded, everything
 * outside the top ~36 tied and fell through to an alphabetical tiebreak —
 * which is how "Bear Row", "Bird-Dog Row", and "B-Stance Hip Thrust"
 * (alphabetically early compounds) kept landing in mainstream plans.
 */
export const COMMON_EXERCISE_IDS: string[] = [
  // Chest – bench & push
  'flat_barbell_bench_press',
  'flat_dumbbell_bench_press',
  'incline_barbell_bench_press',
  'incline_dumbbell_bench_press',
  'decline_barbell_bench_press',
  'machine_chest_press',
  'push_up',
  'chest_dip',
  'pec_deck_fly',
  'flat_dumbbell_fly',
  'cable_crossover',
  // Back – rows & pulls
  'barbell_bent_over_row',
  'pendlay_row',
  't_bar_row',
  'single_arm_dumbbell_row',
  'chest_supported_dumbbell_row',
  'seated_cable_row_wide_pronated',
  'seated_cable_row_close_neutral',
  'lat_pulldown_wide',
  'close_grip_lat_pulldown',
  'lat_pulldown_neutral_grip',
  'pull_up_pronated',
  'chin_up',
  'machine_assisted_pull_up',
  'face_pull',
  'hyperextension_back_extension',
  'barbell_shrug',
  'dumbbell_shrug',
  // Hinge
  'conventional_deadlift',
  'barbell_sumo_deadlift',
  'trap_bar_deadlift',
  'barbell_romanian_deadlift',
  'dumbbell_romanian_deadlift',
  'barbell_hip_thrust',
  'glute_bridge',
  'barbell_good_morning',
  'kettlebell_swing',
  'cable_pull_through',
  // Legs – squat, lunge, machines
  'back_squat',
  'front_squat',
  'goblet_squat',
  'bodyweight_squat',
  'forty_five_degree_leg_press',
  'machine_hack_squat',
  'walking_lunge',
  'dumbbell_bulgarian_split_squat',
  'dumbbell_step_up',
  'seated_leg_extension',
  'lying_leg_curl',
  'seated_leg_curl',
  'standing_calf_raise_machine',
  'seated_calf_raise_machine',
  'bodyweight_calf_raise',
  'hip_abductor_machine',
  // Shoulders
  'barbell_overhead_press',
  'seated_barbell_overhead_press',
  'seated_dumbbell_shoulder_press',
  'arnold_press',
  'seated_machine_shoulder_press',
  'dumbbell_lateral_raise',
  'cable_lateral_raise',
  'reverse_pec_deck',
  'barbell_upright_row',
  // Arms
  'standing_barbell_curl',
  'standing_dumbbell_curl',
  'dumbbell_hammer_curl',
  'preacher_ez_bar_curl',
  'incline_dumbbell_curl',
  'standing_ez_bar_cable_curl',
  'straight_bar_cable_pushdown',
  'rope_cable_pushdown',
  'lying_ez_bar_triceps_extension',
  'standing_dumbbell_overhead_triceps_extension',
  'close_grip_bench_press',
  // Core
  'front_plank',
  'side_plank',
  'floor_crunch',
  'kneeling_cable_crunch',
  'hanging_knee_raise',
  'hanging_leg_raise',
  'russian_twist',
  'dead_bug',
  'standing_pallof_press',
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

/**
 * Movements a coach would not put in a default program: grip-sport specialty,
 * instability/quadruped circus variants, and stance/setup oddities. They stay
 * searchable in the library but sort last, so generation pools and swap
 * passes only reach them when nothing mainstream fits. Name-based because the
 * variants span many ids (live plans opened sessions with Bear Row and picked
 * Bird-Dog Row / Waiter Carry over ordinary rows and presses).
 */
const NICHE_NAME = new RegExp(
  [
    '\\bbear\\b',
    'bird.?dog row',
    'b.?stance',
    'kickstand',
    'dead.?row',
    'zercher (march|carry|hold)',
    'jefferson',
    'steinborn',
    'sots press',
    'waiter',
    'bottoms.?up',
    'pinch',
    'gripper',
    'wrist wrench',
    'rice bucket',
    'therapy putty',
    '\\bblob\\b',
    'hub lift',
    '\\baxle\\b',
    'pike lat pullover',
    'guillotine',
    'static hold',
    'head hold',
  ].join('|'),
  'i',
);

export function isNicheExercise(name: string): boolean {
  return NICHE_NAME.test(name ?? '');
}
