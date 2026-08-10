/**
 * Catalog rows retired by the exercise-catalog audit
 * (docs/audits/2026-08-exercise-catalog-audit-findings.md — Tasks 1 & 2).
 *
 * Exercise ids are permanent: workout logs, plan slots, and saved items may
 * reference them, so retired rows STAY in exercises_5000plus.json and remain
 * resolvable by id/name (`findOne`, `findByIds`, `resolveByName` — history,
 * saved lists, and replace *targets* keep working). They are removed from
 * everything forward-looking: browse (`findAll`), search, generator candidate
 * pools, chunk-repair scavenging, and replace-picker candidates — all of which
 * flow through `ExercisesService.search()` / `memoFindAll`.
 *
 * Never delete or rename a catalog id. To retire a row, add it here with a
 * one-line reason; to un-retire, remove the entry.
 */
export const RETIRED_EXERCISE_IDS: readonly string[] = [
  // Task 1 — Chest (2026-08-07)
  'cable_pullover', // dup of straight_arm_cable_pulldown (chest-vs-back twin of the same standing cable pull)
  'pullover_dumbbell', // decision 1.3-A (pullover home = back): worse-id twin of dumbbell_pullover, which moved to back/lats

  // Task 2 — Back A (2026-08-09): exact in-slice duplicates
  'banded_pull_up_overhand', // dup of band_assisted_pull_up
  'cable_lat_pulldown_d_handle', // dup of single_arm_cable_pulldown (attachment naming only)
  'cable_pull_to_waist_kneeling', // dup of half_kneeling_lat_pulldown_cable (its alias was the keeper's name)
  'cable_pulldown_supine_floor', // dup of cable_pulldown_lying_face_up (bench is non-gating setup gear)
  'cable_pullover_kneeling', // dup of lat_prayer_cable
  'cable_single_arm_pullover_standing', // dup of stir_the_pot_lat ("Cable Lat Pull-Around")
  'high_cable_lat_pull', // dup of single_arm_straight_arm_pulldown
  'lat_stretch_pulldown_single_arm', // dup of crossover_lat_pulldown (seated twin)
  'pulldown_with_hip_hinge', // dup of straight_arm_cable_pulldown (hinged twin)

  // Task 2 — cross-group / cross-sub duplicates
  'pike_lat_pullover_floor', // kneeling ab-wheel rollout; core owns the rollout family
  'slam_ball_lat_activation', // a ball slam; cardio owns medicine_ball_slam
  'underhand_barbell_row_lower_lat', // IS the Yates row; back-mid owns yates_row (aliases merged there)

  // Task 2 — incoherent / invented / miscoached
  'db_lat_swing', // standing DB "lat" sweep — gravity cannot resist the lat line standing
  'landmine_lat_pulldown', // a landmine cannot resist a downward pull (pivots at the floor)
  'cable_pull_behind_back', // movement is shoulder flexion (front delts) mis-tagged as lats
  'cable_pulldown_ankle_strap', // name/id/copy describe three different exercises
  'supine_lat_pull_barbell', // name says barbell, equipment says band; covered by prone band rows
  'battle_rope_lat_pull', // requires battle ropes anchored overhead — not a real setup
  'lat_cable_fly', // "lat spread" posing simulation; dual_cable_straight_arm_pulldown covers the pattern
  'cable_single_arm_pulldown_behind', // single-arm pulldown to behind the ear — impingement-prone permutation
  'barbell_behind_neck_pull_up', // feet-assisted behind-neck pull-up graded Advanced; concept survives as Smith Machine Seated Pull-Up
  'dumbbell_row_lat_focused', // backwards coaching (elbow flare ≠ lat bias); one_arm_dumbbell_row_lat_bias is the keeper

  // Task 3 — Back B (2026-08-09): Task 0 twin pairs (keepers live in legs/core; aliases absorbed)
  'deadlift_conventional', // twin of legs' conventional_deadlift (deadlift home = legs, Dylan)
  'romanian_deadlift', // twin of legs' barbell_romanian_deadlift (removed from common tier with the retire)
  'sumo_deadlift', // twin of legs' barbell_sumo_deadlift; anchor + common refs re-pointed (Dylan 2026-08-09)
  'good_morning', // twin of legs' barbell_good_morning (common entry re-pointed)
  'barbell_good_morning_seated', // twin of legs' seated_good_morning (same name, same equipment)
  'single_leg_rdl', // twin of legs' dumbbell_single_leg_romanian_deadlift
  'barbell_hip_thrust_back_ext', // twin of legs' barbell_hip_thrust
  'farmers_carry', // third carry twin; core's farmer_carry is the keeper (core/arms sessions settle the family home)

  // Task 3 — dups of the complete shoulders rear-delt / face-pull / upright-row families
  'band_face_pull', // dup of shoulders' resistance_band_face_pull (face-pull home = shoulders, Dylan)
  'cable_face_pull_single_arm', // dup of shoulders' single_arm_cable_face_pull
  'scapular_retraction_band', // dup of shoulders' band_pull_apart
  'cable_rear_delt_fly', // dup of shoulders' cable_reverse_fly (their aliases cross-referenced each other)
  'dumbbell_reverse_fly', // dup of shoulders' bent_over_dumbbell_reverse_fly
  'incline_reverse_fly', // dup of shoulders' incline_bench_rear_delt_fly
  'machine_upright_row', // copy is a low-cable upright row = shoulders' cable_upright_row
  'wide_grip_seated_cable_row_single', // seated single-arm rear-delt row; shoulders' single_arm_rear_delt_cable_row is the keeper

  // Task 3 — in/cross-slice dups
  'seated_good_morning_band', // "Banded Good Morning" — exact dup of legs' resistance_band_good_morning (surfaced by the hinge retag)
  'barbell_row_supine', // verbatim the Inverted Row (overhand_bodyweight_row)
  'landmine_row_bilateral', // same movement as t_bar_row (which carries the Landmine Row alias)
  'cable_straight_arm_row', // pulley-height variant of straight_arm_cable_pulldown
  'cable_high_row_elbows_wide', // copy is a face pull; face_pull is the keeper

  // Task 4 — Legs A (2026-08-10)
  'sled_drag_backward', // cardio twin of legs' backward_sled_drag (same movement, both aliased "Reverse Sled Drag"; muscle-true home = legs, matching lateral_sled_drag)

  // Task 5 — Legs B (2026-08-10): implement twins (towel and slider map to the same
  // Bodyweight equipment label, so the pairs are gating-identical duplicates)
  'towel_leg_curl', // dup of slider_leg_curl (mutual equipment alternatives; keeper absorbs the alias)
  'single_leg_towel_leg_curl', // dup of single_leg_slider_leg_curl

  // Task 6 — Legs C (2026-08-10)
  'barbell_donkey_calf_raise', // a free bar cannot be secured across the hips in a 90° hinge; the donkey family keeps machine/Smith/dip-belt/bodyweight loading
  'bench_copenhagen_plank', // core dup of legs' copenhagen_knee_plank (same knee-on-bench short-lever hold; aliases absorbed there)

  // Task 7 — Shoulders (2026-08-10): rotator-cuff cue-twins — each pairs with a
  // keeper that is gating-identical (towel/wall map to the free Bodyweight
  // label, pads are setup gear) and differs only by a coaching cue
  'band_towel_roll_external_rotation', // dup of band_standing_external_rotation (towel between elbow and ribs is a cue, not an exercise)
  'band_towel_roll_internal_rotation', // dup of band_standing_internal_rotation
  'cable_towel_roll_external_rotation', // dup of cable_standing_external_rotation
  'cable_towel_roll_internal_rotation', // dup of cable_standing_internal_rotation
  'wall_supported_band_45_degree_external_rotation', // dup of band_45_degree_external_rotation (wall = posture cue)
  'wall_supported_band_90_90_external_rotation', // dup of band_90_90_external_rotation
  'pad_supported_cable_90_90_external_rotation', // dup of seated_supported_cable_90_90_external_rotation (same cable+pad setup, near-verbatim copy)
  'single_arm_medicine_ball_wall_stabilization_circles', // dup of single_arm_stability_ball_wall_circles (both ball ids map to 'Medicine Ball'; mutual alternatives)
  'single_arm_forearm_wall_slide', // dup of single_arm_serratus_wall_slide (near-verbatim copy; keeper already aliased "Single-Arm Wall Slide")

  // Task 8 — Arms A (2026-08-10)
  'single_arm_face_away_cable_curl', // IS the Bayesian curl (bayesian_cable_curl keeper: identical eq/uni, near-verbatim copy)
  'wall_strict_dumbbell_curl', // wall = free anti-cheat cue; gating-identical to standing_dumbbell_curl (verbatim instructions across the wall-strict clones)
  'wall_strict_ez_bar_curl', // dup of standing_ez_bar_curl; only the barbell row survives as the competed Strict Curl
  'wall_strict_cable_curl', // dup of standing_straight_bar_cable_curl
  'ring_triceps_extension', // rings gate as TRX (decision 1.3-C): gating-identical to suspension_trainer_triceps_extension, verbatim instructions

  // Task 9 — Arms B (2026-08-10): the grip-sport specialty class (plan §4).
  // Competition implements the app cannot model honestly: `hammer` is unmapped
  // (rows were dead), and blob/hub/wrist-wrench/thick-handle/pinch-block map to
  // labels (Dumbbell/Bodyweight) that falsely serve them to users without the
  // implement. Gym-real grip work (plate pinches, hex head hold, fat-grip,
  // thick-bar, towel, rice bucket, grippers, carries) stays.
  'hammer_front_lever', // sledgehammer levering; `hammer` equipment id was never in EQUIPMENT_MAP
  'hammer_front_lever_hold',
  'hammer_lever_pronation',
  'hammer_lever_supination',
  'hammer_rear_lever',
  'hammer_rear_lever_hold',
  'pinch_block_carry', // pinch_block is deliberately unmodeled (see EQUIPMENT_MAP comment); plate_pinch_carry covers the pattern
  'pinch_block_hold', // plate_pinch_hold / hex_dumbbell_head_hold cover
  'pinch_block_lift', // plate pinch lifts cover
  'blob_hold', // blob_implement falsely gates as 'Dumbbell'; hex_dumbbell_head_hold IS the dumbbell version
  'blob_lift',
  'hub_hold', // hub_lift_implement falsely gates as 'Dumbbell'
  'hub_lift',
  'wrist_wrench_hold', // wrist_wrench falsely maps to free 'Bodyweight' — served to users with no equipment
  'wrist_wrench_lift',
  'rolling_handle_hold', // rolling_handle+loading_pin gates as 'Cable'+'Barbell' — neither owns the implement
  'rolling_handle_deadlift',
  'loading_pin_grip_lift', // loading-pin specialty; barbell/plate holds cover top-position grip work
  'thick_handle_farmer_carry', // thick_handle_implement falsely gates as 'Dumbbell'; farmer_handle_carry + fat-grip rows cover
  'axle_bar_deadlift_hold', // gating-identical twin of barbell_static_hold (axle_bar → 'Barbell'); keeper absorbs the name and offers axle_bar as an alternative
  'dumbbell_farmer_carry', // gating-identical cross-group twin of core's farmer_carry (identical eq+alt; Task 3 keeper wins again); full carry-family home = Task 10

  // Task 10 — Core (2026-08-10)
  'kneeling_ab_wheel_rollout', // exact dup of ab_wheel_rollout — the keeper's own instructions start "Kneel…", and this row's alias was the keeper's name
  'ring_fallout', // rings gate as TRX (decision 1.3-C): gating-identical to suspension_trainer_fallout
  'trap_bar_hold', // core twin of arms' trap_bar_static_hold (same bar, same top hold); grip is the limiting factor, so the grip row keeps the family
  'bottoms_up_kettlebell_carry', // the bottoms-up KB carry existed THREE times (core/arms/shoulders, identical equipment); core's bottoms_up_carry is the keeper
  'single_arm_bottoms_up_kettlebell_carry', // third copy of the same carry (shoulders); the unique overhead bottoms-up row stays in shoulders
];

const RETIRED = new Set(RETIRED_EXERCISE_IDS);

export function isRetiredExercise(id: string): boolean {
  return RETIRED.has(id);
}
