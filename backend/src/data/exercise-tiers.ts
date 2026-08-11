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
export const TIER_COMPLETED_GROUPS: string[] = ['chest', 'cardio'];

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
};
