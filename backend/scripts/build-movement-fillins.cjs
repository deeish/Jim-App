/**
 * Generates src/data/movement-pattern-fillins.ts from unmapped-movement-pattern-ids.tsv
 * Run from backend/: node scripts/build-movement-fillins.cjs
 */
const fs = require('fs');
const path = require('path');

function classify(id) {
  const x = id;

  if (
    /(?:^|_)carry(?:$|_)|suitcase_carry|zercher_carry|front_rack_carry|trap_bar_carry|bear_hug_carry|offset_carry|offset_front_rack|pinch_carry|towel_carry|waiter_carry|thick_handle_carry|shoulder_carry|overhead_march|suitcase_march|front_rack_march|bear_crawl|sled_drag|turkish_get|farmer|farmers|bottoms_up_carry|bottoms_up_march|zercher_march|suitcase_hold|front_rack_hold|overhead_hold|trap_bar_hold|bear_hug_hold|pinch_lift|pinch_hold|blob_lift|hub_lift|rolling_handle_lift|grip_lift|^drag$|half_get_up/.test(
      x,
    )
  )
    return 'Carry';

  if (
    /_hinge$|^single_leg_hinge|^hip_extension$|^pull_through$|^bridge$|good_morning|romanian|rdl|deadlift|hip_thrust|glute_bridge|loaded_flexion|extended_range_flexion|^leg_curl|^knee_curl|back_extension|hip_hinge/.test(
      x,
    )
  )
    return 'Hinge';

  if (
    /hip_abduction|hip_adduction|lateral_lunge|step_up|step_down|copenhagen|split_stance|hip_dip|lateral_locomotion|reverse_locomotion|^locomotion$/.test(
      x,
    )
  )
    return 'Lunge';

  if (
    /^squat|leg_press|hack_squat|single_leg_squat|sissy_squat|isometric_squat|knee_extension|^leg_extension$|^jump$|^plantar|^calf_raise|^hip_flexion|^top_leg_raise|^vertical_leg$|vertical_leg_flexion/.test(
      x,
    )
  )
    return 'Squat';

  if (
    /pushdown|pullover_extension|long_head_extension|lying_extension|single_arm_overhead|incline_extension|single_arm_extension|machine_overhead|machine_dip|assisted_dip|bench_dip|floor_extension|rolling_extension|independent_arm|band_pushdown|reverse_grip_pushdown|single_arm_pushdown|decline_extension|neutral_grip_extension|single_arm_floor|single_arm_pullover|tate_press|bodyweight_extension|supported_extension|cross_body_extension|alternating_lying|single_arm_rolling|single_arm_rolling_extension|kneeling_pushdown|band_press_away|reverse_grip_press|cross_body_pushdown|rotation_press|single_arm_press|landmine_rotation|landmine_180|^rotation$/.test(
      x,
    ) ||
    (/extension/.test(x) &&
      !/wrist_extension|finger_extension|^leg_extension$|knee_extension|tuck_extension/.test(
        x,
      ))
  )
    return 'Push';

  if (
    /curl|finger_curl|wrist_flexion|^wrist_extension$|pinch_|_hang|hang_|\bhang\b|gripper|towel_grip|hub_|blob_|wrist_wrench|supination|pronation|deviation|wrist_roller|static_pull|scapular|upright_row|face_pull|horizontal_abduction|scarecrow|cuban|serratus|trap_3|zottman|arm_blaster|radial_deviation|ulnar_deviation|rope_grip|thick_bar|open_hand|crush_grip|waiter_curl|behind_body|reverse_curl|strict_curl|high_cable|kneeling_curl|incline_curl|supinating|alternating_curl|single_arm_curl|drag_curl|loaded_raise|simultaneous_raise|lever_rotation|horizontal_pull|vertical_pull|pull_up|pullover(?!_extension)|shrug|rear_delt|external_rotation|internal_rotation|band_curl|cable_curl|machine_wrist|cross_body_curl|flexed_arm|front_lever|rear_lever|hand_endurance|grip_lift|rim_hold|hub_hold|blob_hold|gripper_close|gripper_hold|finger_extension|single_arm_wrist|face_pull_external|scarecrow_external|trap_3_raise|horizontal_abduction_external|single_arm_finger|cable_grip|rolling_handle|axle_hold|support_hold|bottoms_up_hold|thick_bar_grip|thick_handle_grip|single_arm_hang|open_hand_grip|levering|rolling_handle_lift|rolling_handle_hold|wrist_stability|flexed_arm_hang|scarecrow_external_rotation|face_pull_external_rotation/.test(
      x,
    )
  )
    return 'Pull';

  if (
    /plank|rollout|standing_rollout|stir_the_pot|walkout|crunch|sit_up|oblique|russian|wood_chop|anti_|pallof|bird_dog|dead_bug|^brace$|breathing|diaphragmatic|^march$|^gait$|toe_tap|tabletop|explosive|lift_off|pelvic|spinal_flexion|side_flexion|anti_lateral|eccentric|shoulder_tap|flutter|scissor|jackknife|v_up|tuck|dragon|hover|l_sit|loaded_rotation|cable_flexion|cable_crunch|machine_crunch|suspension|bear_plank|bear_position|closed_chain|unstable_support|stability|static_hold|support_hold|high_tension|long_lever|short_lever|star_position|single_leg_control|side_bend|reverse_crunch|garhammer|bicycle|anchored|decline_flexion|cross_body_sit|rotational_sit|windshield|knee_tuck|leg_lower|hanging_knee|supported_knee|supported_leg|hanging_raise|supported_hip|hanging_hip|top_leg|alternating_leg_lower|toes_to_bar|pike|leg_raise|^hanging_|oblique_reach|oblique_slam|body_saw|fallout|halo|wheel|wall_slide|copenhagen|arm_bar|windmill|cross_body_mountain|machine_oblique|side_plank|in_and_out|tuck_extension|tabletop_march|cross_body_stability|dragon_flag|hollow|double_leg|single_leg_press|suspension_tuck|unstable_tuck|plank_tuck|rotational_v|side_v|side_jackknife|side_sit|jackknife|tuck_up|cable_lift|band_lift|pallof_press|cross_body_flexion|cuban_rotation|serratus_punch|floor_press|diaphragmatic_control|extended_range_flexion|knee_raise|hanging_knee_raise|windshield_wiper|hand_endurance|jump|shoulder_stability|half_get|wheel/.test(
      x,
    )
  )
    return 'Push';

  return 'Push';
}

const tsvPath = path.join(__dirname, 'unmapped-movement-pattern-ids.tsv');
const lines = fs.readFileSync(tsvPath, 'utf8').trim().split(/\r?\n/);
const fillins = {};
for (const line of lines) {
  const tab = line.indexOf('\t');
  if (tab < 0) continue;
  const id = line.slice(tab + 1).trim();
  if (!id) continue;
  fillins[id] = classify(id);
}

const outPath = path.join(__dirname, '../src/data/movement-pattern-fillins.ts');
const header = `/**
 * Auto-generated by scripts/build-movement-fillins.cjs from scripts/unmapped-movement-pattern-ids.tsv
 * Re-run: node scripts/build-movement-fillins.cjs
 * Merged in transformExercise after MOVEMENT_PATTERN_MAP (Phase D catalog).
 */
`;
fs.writeFileSync(
  outPath,
  `${header}export const MOVEMENT_PATTERN_FILLINS: Record<string, string> = ${JSON.stringify(
    fillins,
    null,
    2,
  )};\n`,
  'utf8',
);
console.log('Wrote', outPath, 'entries', Object.keys(fillins).length);
