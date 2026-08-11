/**
 * Exercise quality tiers (catalog audit Task 13, Phase A — data only).
 *
 * Every visible catalog row gets ONE overall quality grade. The grade is
 * consumed (Phase B+) for browse ordering, replace-picker bias, and
 * generation pool priority — higher tiers surface first. Until those
 * phases land, nothing at runtime reads this file except its spec.
 *
 * TIERS
 *   S — canonical best-in-class; you would build a program around it.
 *       Deliberately rare (roughly 3–8% of a group).
 *   A — excellent standard pick; belongs in any sensible rotation.
 *   B — solid variant; nothing wrong with it, chosen for its context
 *       (equipment, angle, unilateral demand, regression/progression).
 *   C — situational: niche audience, high skill floor, rare implement,
 *       PT/prehab identity, or warm-up-class stimulus.
 *   D — kept for completeness but last-resort; the redundant tail of an
 *       exercise family. (Retiring was already handled by the audit —
 *       D rows are real exercises, just never the recommendation.)
 *
 * RUBRIC (one grade weighing all five; exemplars pin the scale)
 *   effectiveness  — stimulus quality for the row's primary muscles
 *   accessibility  — equipment + skill floor for the target audience
 *   safety         — injury-risk profile at honest loading
 *   popularity     — recognizability; familiar names build trust
 *   redundancy     — is it the best version of its family, or the 7th?
 *   Cross-group S exemplars: flat_barbell_bench_press, push_up,
 *   treadmill_jog_steady, rowing_machine_steady (see group blocks).
 *
 * RULES (enforced by exercise-tiers.spec.ts)
 *   - Groups are graded one slice at a time; a group listed in
 *     TIER_COMPLETED_GROUPS must have EVERY visible row graded.
 *   - Retired rows and the cardio session-template rows are never graded.
 *   - COMMON_EXERCISE_IDS rows must grade S or A (staples by definition);
 *     any exception is a conscious, commented decision.
 *   - Ids are catalog ids — immutable, never renamed here or anywhere.
 */

export type ExerciseTier = 'S' | 'A' | 'B' | 'C' | 'D';

/** Sort helper for Phase B+ consumers: lower sorts first. */
export const TIER_ORDER: Record<ExerciseTier, number> = {
  S: 0,
  A: 1,
  B: 2,
  C: 3,
  D: 4,
};

/**
 * Muscle groups whose visible rows are fully graded. Grown one audit-style
 * slice at a time; the spec enforces full coverage for every group listed
 * here and no stray grades in groups not yet listed.
 */
export const TIER_COMPLETED_GROUPS: string[] = ['chest', 'cardio', 'shoulders'];

export const EXERCISE_TIERS: Record<string, ExerciseTier> = {
  // ─── chest (58) ───────────────────────────────────────────────────────
  // Barbell presses
  flat_barbell_bench_press: 'S',
  incline_barbell_bench_press: 'A',
  decline_barbell_bench_press: 'A',
  wide_grip_bench_press: 'B',
  floor_press: 'B',
  smith_machine_bench_press: 'B',
  smith_machine_incline_bench_press: 'B',
  // Dumbbell / kettlebell presses
  incline_dumbbell_bench_press: 'S',
  flat_dumbbell_bench_press: 'A',
  decline_dumbbell_bench_press: 'B',
  neutral_grip_dumbbell_press: 'B',
  dumbbell_squeeze_press: 'B',
  dumbbell_floor_press: 'B',
  single_arm_dumbbell_press: 'B',
  kettlebell_floor_press: 'B',
  single_arm_kettlebell_floor_press: 'C',
  // Machine / cable / band presses
  machine_chest_press: 'A',
  incline_machine_chest_press: 'A',
  decline_machine_chest_press: 'B',
  cable_chest_press: 'B',
  incline_cable_chest_press: 'B',
  cable_single_arm_press: 'B',
  resistance_band_chest_press: 'B',
  trx_chest_press: 'B',
  // Flies
  flat_dumbbell_fly: 'A',
  pec_deck_fly: 'A',
  cable_crossover: 'A',
  low_cable_fly: 'B',
  mid_cable_fly: 'B',
  cable_incline_fly: 'B',
  incline_dumbbell_fly: 'B',
  resistance_band_chest_fly: 'B',
  dumbbell_floor_fly: 'C',
  cable_decline_fly: 'C',
  single_arm_cable_fly: 'C',
  trx_chest_fly: 'C',
  bodyweight_chest_fly: 'C',
  svend_press: 'C',
  decline_dumbbell_fly: 'D',
  single_arm_dumbbell_fly: 'D',
  // Push-up family (regressions B when canonical, skill variants C)
  push_up: 'S',
  incline_push_up: 'B',
  knee_push_up: 'B',
  decline_push_up: 'B',
  deficit_push_up: 'B',
  weighted_push_up: 'B',
  band_resisted_push_up: 'B',
  ring_push_up: 'B',
  wall_push_up: 'C',
  wide_grip_push_up: 'C',
  push_up_plus: 'C',
  dive_bomber_push_up: 'C',
  medicine_ball_push_up: 'C',
  archer_push_up: 'C',
  one_arm_push_up: 'C',
  plyo_push_up: 'C',
  // Dips
  chest_dip: 'S',
  weighted_chest_dip: 'A',

  // ─── cardio (43; session-template rows exempt) ────────────────────────
  // Steady-state machines
  treadmill_jog_steady: 'S',
  stationary_bike_steady: 'S',
  rowing_machine_steady: 'S',
  treadmill_walk_easy: 'A',
  treadmill_incline_walk: 'A',
  stair_climber_machine: 'A',
  elliptical_steady: 'B',
  ski_erg_steady: 'B',
  arc_trainer_steady: 'C',
  recumbent_bike_steady: 'C',
  jacobs_ladder_machine: 'C',
  versaclimber_machine: 'C',
  curve_treadmill_self_powered: 'C',
  // Machine intervals
  treadmill_run_intervals: 'A',
  stationary_bike_intervals: 'A',
  rowing_machine_intervals: 'A',
  air_bike_assault: 'A',
  elliptical_intervals: 'B',
  ski_erg_intervals: 'B',
  // Outdoor / venue (bicycle and pool are unmodeled venues by design)
  outdoor_jog_steady: 'A',
  outdoor_run_intervals: 'B',
  outdoor_cycling_steady: 'B',
  trail_hiking_brisk: 'B',
  swimming_laps_easy: 'B',
  // Bodyweight conditioning + plyo
  burpee: 'A',
  jump_rope_single_under: 'A',
  mountain_climber_cardio: 'B',
  jumping_jack: 'B',
  jump_squat_bodyweight: 'B',
  jumping_lunge: 'B',
  plyo_box_jump: 'B',
  shadow_boxing_rounds: 'B',
  high_knees: 'C',
  broad_jump: 'C',
  jump_rope_double_under: 'C',
  lateral_shuffle_conditioning: 'C',
  // Implement conditioning
  kettlebell_swing_conditioning: 'A',
  sled_push: 'A',
  medicine_ball_slam: 'B',
  wall_ball: 'B',
  battle_rope_alternating_waves: 'B',
  battle_rope_double_slams: 'C',
  farmers_carry_brisk_walk: 'C',

  // ─── shoulders (193) ──────────────────────────────────────────────────
  // Overhead presses
  barbell_overhead_press: 'S',
  seated_dumbbell_shoulder_press: 'S',
  dumbbell_shoulder_press: 'A',
  seated_barbell_overhead_press: 'A',
  seated_machine_shoulder_press: 'A',
  arnold_press: 'A',
  landmine_press: 'A',
  barbell_push_press: 'A',
  pike_push_up: 'A',
  seated_arnold_press: 'B',
  single_arm_dumbbell_shoulder_press: 'B',
  dumbbell_push_press: 'B',
  single_arm_dumbbell_push_press: 'B',
  kettlebell_push_press: 'B',
  kettlebell_overhead_press: 'B',
  single_arm_kettlebell_overhead_press: 'B',
  z_press: 'B',
  viking_press: 'B',
  smith_machine_shoulder_press: 'B',
  cable_shoulder_press: 'B',
  single_arm_cable_shoulder_press: 'B',
  single_arm_machine_shoulder_press: 'B',
  single_arm_landmine_press: 'B',
  handstand_push_up: 'B',
  incline_pike_push_up: 'B',
  resistance_band_overhead_press: 'B',
  seated_kettlebell_press: 'C',
  bottoms_up_kettlebell_press: 'C',
  dumbbell_z_press: 'C',
  half_kneeling_single_arm_cable_press: 'C',
  half_kneeling_landmine_press: 'C',
  tall_kneeling_landmine_press: 'C',
  half_kneeling_single_arm_landmine_press: 'C',
  half_kneeling_single_arm_kettlebell_press: 'C',
  single_arm_resistance_band_overhead_press: 'C',
  single_arm_seated_dumbbell_shoulder_press: 'C',
  // Scaption / Y raises
  dumbbell_scaption: 'B',
  dumbbell_y_raise: 'B',
  cable_scaption_raise: 'C',
  single_arm_cable_scaption_raise: 'C',
  resistance_band_scaption: 'C',
  cable_y_raise: 'C',
  incline_dumbbell_y_raise: 'C',
  // Lateral raises
  dumbbell_lateral_raise: 'S',
  cable_lateral_raise: 'A',
  machine_lateral_raise: 'A',
  seated_dumbbell_lateral_raise: 'B',
  single_arm_dumbbell_lateral_raise: 'B',
  single_arm_cable_lateral_raise: 'B',
  single_arm_machine_lateral_raise: 'B',
  behind_the_back_cable_lateral_raise: 'B',
  lean_away_cable_lateral_raise: 'B',
  lean_away_dumbbell_lateral_raise: 'B',
  resistance_band_lateral_raise: 'B',
  incline_dumbbell_lateral_raise: 'C',
  side_lying_dumbbell_lateral_raise: 'C',
  lying_cable_lateral_raise: 'C',
  seated_cable_lateral_raise: 'C',
  single_arm_resistance_band_lateral_raise: 'C',
  // Front raises (pressed-enough accessory; deep redundant tail)
  dumbbell_front_raise: 'B',
  plate_front_raise: 'B',
  single_arm_cable_front_raise: 'B',
  barbell_front_raise: 'C',
  machine_front_raise: 'C',
  landmine_front_raise: 'C',
  resistance_band_front_raise: 'C',
  single_arm_dumbbell_front_raise: 'C',
  ez_bar_front_raise: 'D',
  dual_cable_front_raise: 'D',
  rope_front_raise: 'D',
  // Upright rows
  barbell_upright_row: 'A',
  cable_upright_row: 'B',
  dumbbell_upright_row: 'B',
  ez_bar_upright_row: 'B',
  rope_upright_row: 'B',
  kettlebell_upright_row: 'C',
  landmine_upright_row: 'C',
  resistance_band_upright_row: 'C',
  single_arm_cable_upright_row: 'C',
  smith_machine_upright_row: 'C',
  // Rear delts
  face_pull: 'S',
  reverse_pec_deck: 'A',
  bent_over_dumbbell_reverse_fly: 'A',
  cable_reverse_fly: 'A',
  band_pull_apart: 'A',
  chest_supported_rear_delt_row: 'B',
  rear_delt_row: 'B',
  resistance_band_face_pull: 'B',
  seated_bent_over_dumbbell_reverse_fly: 'B',
  incline_bench_rear_delt_fly: 'B',
  chest_supported_cable_rear_delt_fly: 'B',
  prone_t_raise: 'B',
  single_arm_cable_reverse_fly: 'B',
  high_cable_rear_delt_row: 'B',
  low_cable_pull_apart: 'B',
  resistance_band_reverse_fly: 'B',
  bent_over_cable_reverse_fly: 'C',
  single_arm_cable_face_pull: 'C',
  single_arm_rear_delt_cable_row: 'C',
  rope_rear_delt_row: 'C',
  single_arm_reverse_pec_deck: 'C',
  trx_reverse_fly: 'C',
  cuban_press: 'C',
  // Rotator cuff / prehab matrix (90 rows): PT-library identity — C by
  // default as general programming; B only for the canonical clinical
  // prescriptions; D where a strictly-supported near-twin duplicates a
  // covered pattern.
  side_lying_dumbbell_external_rotation: 'B',
  band_standing_external_rotation: 'B',
  band_standing_internal_rotation: 'B',
  cable_standing_external_rotation: 'B',
  cable_standing_internal_rotation: 'B',
  single_arm_full_can_raise: 'B',
  single_arm_serratus_wall_slide: 'B',
  band_45_degree_external_rotation: 'C',
  band_45_degree_internal_rotation: 'C',
  band_90_90_external_rotation: 'C',
  band_90_90_internal_rotation: 'C',
  band_bear_hug_internal_rotation: 'C',
  band_belly_press: 'C',
  band_diagonal_external_rotation: 'C',
  band_external_rotation_isometric_hold: 'C',
  band_face_pull_external_rotation: 'C',
  band_half_kneeling_45_degree_internal_rotation: 'C',
  band_hand_behind_back_lift_off: 'C',
  band_internal_rotation_isometric_hold: 'C',
  band_quarterback_external_rotation: 'C',
  band_seated_external_rotation: 'C',
  band_seated_internal_rotation: 'C',
  belly_press_isometric_wall_hold: 'C',
  cable_45_degree_external_rotation: 'C',
  cable_45_degree_internal_rotation: 'C',
  cable_90_90_external_rotation: 'C',
  cable_90_90_internal_rotation: 'C',
  cable_bear_hug_internal_rotation: 'C',
  cable_belly_press: 'C',
  cable_half_kneeling_45_degree_internal_rotation: 'C',
  cable_hand_behind_back_lift_off: 'C',
  cable_low_to_high_external_rotation: 'C',
  cable_seated_external_rotation: 'C',
  cable_seated_internal_rotation: 'C',
  cable_throwers_external_rotation: 'C',
  hand_behind_back_lift_off: 'C',
  incline_supported_45_degree_external_rotation: 'C',
  prone_45_degree_external_rotation: 'C',
  prone_flat_bench_90_90_external_rotation: 'C',
  prone_incline_bench_90_90_external_rotation: 'C',
  quadruped_single_arm_weight_shift: 'C',
  rope_cable_face_pull_external_rotation: 'C',
  seated_supported_dumbbell_external_rotation: 'C',
  seated_supported_dumbbell_internal_rotation: 'C',
  side_lying_45_degree_external_rotation: 'C',
  side_lying_abducted_external_rotation: 'C',
  side_lying_dumbbell_internal_rotation: 'C',
  side_lying_shoulder_abduction_thumb_up: 'C',
  single_arm_band_cuban_rotation: 'C',
  single_arm_band_face_pull_external_rotation: 'C',
  single_arm_band_full_can_raise: 'C',
  single_arm_band_scarecrow_external_rotation: 'C',
  single_arm_band_serratus_punch: 'C',
  single_arm_band_t_raise_thumb_up: 'C',
  single_arm_band_trap_3_raise: 'C',
  single_arm_band_w_raise: 'C',
  single_arm_band_y_raise: 'C',
  single_arm_cable_cuban_rotation: 'C',
  single_arm_cable_face_pull_external_rotation: 'C',
  single_arm_cable_full_can_raise: 'C',
  single_arm_cable_scarecrow_external_rotation: 'C',
  single_arm_cable_serratus_punch: 'C',
  single_arm_cable_t_raise_thumb_up: 'C',
  single_arm_cable_trap_3_raise: 'C',
  single_arm_cable_w_raise: 'C',
  single_arm_cable_y_raise: 'C',
  single_arm_dumbbell_cuban_rotation: 'C',
  single_arm_foam_roller_serratus_wall_slide: 'C',
  single_arm_foam_roller_wall_slide_band: 'C',
  single_arm_incline_t_raise_thumb_up: 'C',
  single_arm_incline_trap_3_raise: 'C',
  single_arm_incline_w_raise: 'C',
  single_arm_incline_y_raise_thumb_up: 'C',
  single_arm_overhead_bottoms_up_kettlebell_carry: 'C',
  single_arm_prone_t_raise_thumb_up: 'C',
  single_arm_prone_w_raise: 'C',
  single_arm_prone_y_raise_thumb_up: 'C',
  single_arm_stability_ball_wall_circles: 'C',
  single_arm_trap_3_raise: 'C',
  single_arm_wall_shoulder_circles_towel: 'C',
  single_arm_wall_slide_band: 'C',
  supine_single_arm_serratus_punch: 'C',
  wall_90_90_external_rotation_isometric: 'C',
  wall_90_90_internal_rotation_isometric: 'C',
  wall_slide_lift_off: 'C',
  seated_supported_band_90_90_external_rotation: 'D',
  seated_supported_band_90_90_internal_rotation: 'D',
  seated_supported_cable_90_90_external_rotation: 'D',
  seated_supported_cable_90_90_internal_rotation: 'D',
  hand_behind_back_lift_off_isometric: 'D',
};
