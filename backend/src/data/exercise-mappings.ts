/**
 * Mapping configuration to convert exercise data IDs to SearchScreen display names
 * This maps the format from exercises_5000plus.json to what SearchScreen.tsx expects
 */

import {
  inferPrescriptionTypeFromRawExercise,
  type ExercisePrescriptionType,
} from './exercise-prescription';
import { MOVEMENT_PATTERN_FILLINS } from './movement-pattern-fillins';

// Primary Muscle Group ID → Display Name
export const PRIMARY_MUSCLE_GROUP_MAP: Record<string, string> = {
  chest: 'Chest',
  back: 'Back',
  legs: 'Legs',
  shoulders: 'Shoulders',
  arms: 'Arms',
  core: 'Core',
  cardio: 'Cardio',
};

// Sub-Muscle ID → Display Name
export const SUB_MUSCLE_MAP: Record<string, string> = {
  // Chest
  chest_upper: 'Upper Chest',
  chest_mid: 'Mid Chest',
  chest_lower: 'Lower Chest',

  // Back
  back_lats: 'Lats',
  back_traps: 'Traps',
  back_mid: 'Mid Back',
  back_lower: 'Lower Back',
  back_upper: 'Upper Back', // If exists in data

  // Legs
  legs_quads: 'Quads',
  legs_hamstrings: 'Hamstrings',
  legs_glutes: 'Glutes',
  legs_calves: 'Calves',
  legs_inner_thighs: 'Inner Thighs',
  legs_outer_thighs: 'Outer Thighs',

  // Shoulders
  shoulders_front_delts: 'Front Delts',
  shoulders_side_delts: 'Side Delts',
  shoulders_rear_delts: 'Rear Delts',
  shoulders_rotator_cuff: 'Rotator Cuff',

  // Arms
  arms_biceps: 'Biceps',
  arms_triceps: 'Triceps',
  arms_forearms: 'Forearms',
  arms_grip: 'Forearms',

  // Core
  core_upper_abs: 'Upper Abs',
  core_lower_abs: 'Lower Abs',
  core_obliques: 'Obliques',
  core_deep: 'Upper Abs',
};

// Equipment ID → Display Name (must map to VALID_EQUIPMENT for filter UI)
export const EQUIPMENT_MAP: Record<string, string> = {
  bodyweight: 'Bodyweight',
  dumbbell: 'Dumbbell',
  dumbbells: 'Dumbbell',
  barbell: 'Barbell',
  cable: 'Cable',
  cable_machine: 'Cable',
  machine: 'Machine',
  kettlebell: 'Kettlebell',
  pullup_bar: 'Pull-up Bar',
  pull_up_bar: 'Pull-up Bar',
  smith_machine: 'Smith Machine',
  smith_machine_bar: 'Smith Machine',
  medicine_ball: 'Medicine Ball',
  bands: 'Resistance Band',
  resistance_band: 'Resistance Band',
  rubber_band: 'Resistance Band',
  trx: 'TRX',
  suspension_trainer: 'TRX',
  battle_rope: 'Battle Rope',
  battle_ropes: 'Battle Rope',
  // Benches & bars
  bench: 'Machine',
  flat_bench: 'Machine',
  incline_bench: 'Machine',
  decline_bench: 'Machine',
  adjustable_bench: 'Machine',
  preacher_bench: 'Machine',
  ez_bar: 'Barbell',
  trap_bar: 'Barbell',
  safety_bar: 'Barbell',
  safety_squat_bar: 'Barbell',
  landmine: 'Machine',
  landmine_attachment: 'Machine',
  dip_bars: 'Pull-up Bar',
  dip_station: 'Pull-up Bar',
  parallel_bars: 'Pull-up Bar',
  // Bodyweight / minimal
  ab_wheel: 'Bodyweight',
  plyo_box: 'Bodyweight',
  box: 'Bodyweight',
  step: 'Bodyweight',
  step_platform: 'Bodyweight',
  wall: 'Bodyweight',
  abmat: 'Bodyweight',
  exercise_mat: 'Bodyweight',
  yoga_mat: 'Bodyweight',
  foam_roller: 'Bodyweight',
  foam_block: 'Bodyweight',
  parallettes: 'Bodyweight',
  push_up_handles: 'Bodyweight',
  sliders: 'Bodyweight',
  slider: 'Bodyweight',
  furniture_sliders: 'Bodyweight',
  // Rings / suspension
  gymnastic_rings: 'Pull-up Bar',
  gymnastics_rings: 'Pull-up Bar',
  rings: 'Pull-up Bar',
  // Cable attachments (count as Cable)
  rope_attachment: 'Cable',
  straight_bar_attachment: 'Cable',
  v_bar_attachment: 'Cable',
  d_handle_attachment: 'Cable',
  single_handle_attachment: 'Cable',
  single_handle: 'Cable',
  rope_handle: 'Cable',
  lat_pulldown_bar: 'Cable',
  neutral_grip_lat_bar: 'Cable',
  ez_bar_attachment: 'Cable',
  waiter_handle: 'Cable',
  rope: 'Cable',
  ankle_strap: 'Cable',
  // Machines (generic or specific)
  chest_press_machine: 'Machine',
  incline_chest_press_machine: 'Machine',
  decline_chest_press_machine: 'Machine',
  pec_deck_machine: 'Machine',
  leg_press_machine: 'Machine',
  horizontal_leg_press_machine: 'Machine',
  vertical_leg_press_machine: 'Machine',
  leg_curl_machine: 'Machine',
  standing_leg_curl_machine: 'Machine',
  leg_extension_machine: 'Machine',
  hack_squat_machine: 'Machine',
  lever_squat_machine: 'Machine',
  pendulum_squat_machine: 'Machine',
  sissy_squat_machine: 'Machine',
  belt_squat_machine: 'Machine',
  standing_calf_raise_machine: 'Machine',
  seated_calf_raise_machine: 'Machine',
  donkey_calf_machine: 'Machine',
  back_extension_machine: 'Machine',
  back_extension_bench: 'Machine',
  roman_chair: 'Machine',
  ab_crunch_machine: 'Machine',
  oblique_crunch_machine: 'Machine',
  biceps_curl_machine: 'Machine',
  preacher_curl_machine: 'Machine',
  lever_curl_machine: 'Machine',
  plate_loaded_curl_machine: 'Machine',
  triceps_extension_machine: 'Machine',
  overhead_triceps_machine: 'Machine',
  lever_triceps_machine: 'Machine',
  iso_lateral_triceps_machine: 'Machine',
  plate_loaded_triceps_machine: 'Machine',
  dip_belt: 'Bodyweight',
  assisted_dip_machine: 'Machine',
  assisted_pull_up_machine: 'Machine',
  selectorized_lat_pulldown_machine: 'Machine',
  hammer_strength_pulldown_machine: 'Machine',
  machine_lat_pulldown_selectorized: 'Machine',
  seated_row_machine: 'Machine',
  chest_supported_row_machine: 'Machine',
  t_bar_row_machine: 'Machine',
  pullover_machine: 'Machine',
  shrug_machine: 'Machine',
  functional_trainer: 'Machine',
  hip_thrust_machine: 'Machine',
  glute_ham_developer: 'Machine',
  ghd_machine: 'Machine',
  reverse_hyper_machine: 'Machine',
  multi_hip_machine: 'Machine',
  abductor_machine: 'Machine',
  adductor_machine: 'Machine',
  nordic_bench: 'Machine',
  sit_up_station: 'Machine',
  captains_chair: 'Machine',
  power_rack: 'Machine',
  rack: 'Machine',
  rack_bar: 'Machine',
  support: 'Machine',
  support_rails: 'Machine',
  // Weights & implements
  weight_plate: 'Barbell',
  weight_plates: 'Barbell',
  plate: 'Barbell',
  hex_dumbbell: 'Dumbbell',
  macebell: 'Kettlebell',
  sandbag: 'Bodyweight',
  sand_bucket: 'Bodyweight',
  slam_ball: 'Medicine Ball',
  stability_ball: 'Medicine Ball',
  exercise_ball: 'Medicine Ball',
  bosu_ball: 'Bodyweight',
  weight_belt: 'Bodyweight',
  weight_vest: 'Bodyweight',
  weighted_vest: 'Bodyweight',
  ankle_weights: 'Bodyweight',
  chains: 'Barbell',
  // Grip / specialty
  hand_gripper: 'Bodyweight',
  adjustable_hand_gripper: 'Bodyweight',
  finger_extensor_band: 'Resistance Band',
  finger_extensor_device: 'Bodyweight',
  wrist_roller: 'Barbell',
  plate_loaded_wrist_roller: 'Machine',
  wrist_curl_machine: 'Machine',
  wrist_extension_machine: 'Machine',
  wrist_cuff: 'Cable',
  pinch_block: 'Bodyweight',
  fat_grip_sleeves: 'Bodyweight',
  thick_bar: 'Barbell',
  rolling_handle: 'Cable',
  loading_pin: 'Barbell',
  farmer_handles: 'Dumbbell',
  farmers_handles: 'Dumbbell',
  lever_bar: 'Barbell',
  axle_bar: 'Barbell',
  log_bar: 'Barbell',
  // Other
  partner_assist: 'Bodyweight',
  towel: 'Bodyweight',
  tire: 'Bodyweight',
  sled: 'Machine',
  heavy_bag: 'Bodyweight',
  climbing_rope: 'Pull-up Bar',
  bench_pad: 'Machine',
  pillow: 'Bodyweight',
  rice_bucket: 'Bodyweight',
  therapy_putty: 'Bodyweight',
  spanish_squat_strap: 'Bodyweight',
  lateral_band: 'Resistance Band',
  assistance_band: 'Resistance Band',
  arm_blaster: 'Dumbbell',
  neutral_grip_pull_up_bar: 'Pull-up Bar',
  // Blob / hub / specialty (map to available)
  blob_implement: 'Dumbbell',
  hub_lift_implement: 'Dumbbell',
  thick_handle_implement: 'Dumbbell',
  wrist_wrench: 'Bodyweight',
  plate_loaded_dip_machine: 'Machine',
  plate_loaded_preacher_machine: 'Machine',
};

// Movement Pattern ID → Display Name (must map to VALID_MOVEMENT_PATTERNS for filter UI)
export const MOVEMENT_PATTERN_MAP: Record<string, string> = {
  push: 'Push',
  pull: 'Pull',
  squat: 'Squat',
  hinge: 'Hinge',
  lunge: 'Lunge',
  carry: 'Carry',
  cardio: 'Push',
  core: 'Push',
  isometric: 'Push',
  // Push variants
  horizontal_push: 'Push',
  incline_push: 'Push',
  decline_push: 'Push',
  vertical_press: 'Push',
  bench_press: 'Push',
  overhead_extension: 'Push',
  overhead_press: 'Push',
  push_up: 'Push',
  dip: 'Push',
  shoulder_flexion: 'Push',
  horizontal_adduction: 'Push',
  incline_adduction: 'Push',
  decline_adduction: 'Push',
  chest_supported_curl: 'Pull',
  bodyweight_press: 'Push',
  compound_press: 'Push',
  landmine_press: 'Push',
  push_press: 'Push',
  press_away: 'Push',
  skull_crusher: 'Push',
  jm_press: 'Push',
  elbow_extension: 'Push',
  kickback: 'Push',
  pushdown: 'Push',
  tricep_pushdown: 'Push',
  // Pull variants
  horizontal_pull: 'Pull',
  vertical_pull: 'Pull',
  row: 'Pull',
  pull_up: 'Pull',
  curl: 'Pull',
  elbow_flexion: 'Pull',
  pullover: 'Pull',
  rear_delt_row: 'Pull',
  reverse_fly: 'Pull',
  face_pull: 'Pull',
  lateral_raise: 'Pull',
  front_raise: 'Pull',
  scaption: 'Pull',
  y_raise: 'Pull',
  shrug: 'Pull',
  scapular_elevation: 'Pull',
  bicep_curl: 'Pull',
  hammer_curl: 'Pull',
  preacher_curl: 'Pull',
  concentration_curl: 'Pull',
  drag_curl: 'Pull',
  spider_curl: 'Pull',
  external_rotation: 'Pull',
  internal_rotation: 'Pull',
  band_pulldown: 'Pull',
  band_curl: 'Pull',
  cable_curl: 'Pull',
  cable_extension: 'Pull',
  // Squat / leg
  leg_press: 'Squat',
  hack_squat: 'Squat',
  split_squat: 'Lunge',
  single_leg_squat: 'Squat',
  sissy_squat: 'Squat',
  knee_extension: 'Squat',
  leg_extension: 'Squat',
  // Hinge
  deadlift: 'Hinge',
  hip_hinge: 'Hinge',
  good_morning: 'Hinge',
  back_extension: 'Hinge',
  hip_thrust: 'Hinge',
  glute_bridge: 'Hinge',
  leg_curl: 'Hinge',
  knee_curl: 'Hinge',
  romanian_deadlift: 'Hinge',
  // Lunge
  step_up: 'Lunge',
  step_down: 'Lunge',
  lateral_lunge: 'Lunge',
  // Carry
  farmer_carry: 'Carry',
  suitcase_carry: 'Carry',
  front_carry: 'Carry',
  overhead_carry: 'Carry',
  trap_bar_carry: 'Carry',
  loaded_carry: 'Carry',
  // Core / stability (map to Push for filter; optional)
  crunch: 'Push',
  plank: 'Push',
  dead_bug: 'Push',
  bird_dog: 'Push',
  anti_extension: 'Push',
  anti_rotation: 'Push',
  pallof_hold: 'Push',
  side_plank: 'Push',
  hanging_leg_raise: 'Push',
  leg_raise: 'Push',
  russian_twist: 'Push',
  wood_chop: 'Push',
  rotation: 'Push',
  // Misc
  band_extension: 'Push',
  band_resistance: 'Push',
  band_rotation: 'Pull',
  band_wrist_curl: 'Pull',
  band_wrist_extension: 'Push',
  cable_crunch: 'Push',
  cable_rotation: 'Pull',
  cable_wrist_curl: 'Pull',
  cable_wrist_extension: 'Push',
  machine_crunch: 'Push',
  machine_curl: 'Pull',
  machine_extension: 'Push',
  machine_rotation: 'Pull',
  isometric_hold: 'Push',
  isometric_rotation: 'Pull',
  plantar_flexion: 'Squat',
  calf_raise: 'Squat',
};

/**
 * Valid display names from SearchScreen (for validation)
 */
export const VALID_PRIMARY_MUSCLE_GROUPS = Object.values(
  PRIMARY_MUSCLE_GROUP_MAP,
);
export const VALID_SUB_MUSCLES = Object.values(SUB_MUSCLE_MAP);
export const VALID_EQUIPMENT = [
  'Bodyweight',
  'Dumbbell',
  'Barbell',
  'Cable',
  'Machine',
  'Kettlebell',
  'Resistance Band',
  'TRX',
  'Pull-up Bar',
  'Medicine Ball',
  'Battle Rope',
  'Smith Machine',
];
export const VALID_MOVEMENT_PATTERNS = [
  'Push',
  'Pull',
  'Squat',
  'Hinge',
  'Lunge',
  'Carry',
];

/**
 * Transform exercise data from ID format to display name format
 */
export interface RawExercise {
  id: string;
  name: string;
  aliases?: string[];
  description?: string;
  primaryMuscleGroupId: string;
  subMuscleIds?: string[];
  secondaryMuscleGroupIds?: string[];
  equipmentIds?: string[];
  equipmentAlternativeIds?: string[];
  movementPatternIds?: string[];
  /** When set, overrides inference (e.g. holds vs reps). */
  prescriptionType?: ExercisePrescriptionType;
  [key: string]: any; // Allow other fields
}

export interface TransformedExercise {
  id: string;
  name: string;
  aliases?: string[];
  description?: string;
  primaryMuscleGroup: string;
  subMuscles: string[];
  secondaryMuscleGroups: string[];
  equipment: string[];
  movementPatterns: string[];
  /** From raw data: "Compound" | "Isolation" etc. Used for common-first sort. */
  type?: string;
  /** How sets×prescription should be shown (reps vs time vs distance). */
  prescriptionType: ExercisePrescriptionType;
  /** YouTube video ID (from exercise-videos.json) for demo video on detail screen. */
  youtubeId?: string;
  [key: string]: any; // Preserve other fields
}

export function transformExercise(raw: RawExercise): TransformedExercise {
  // Transform primary muscle group
  const primaryMuscleGroup =
    PRIMARY_MUSCLE_GROUP_MAP[raw.primaryMuscleGroupId] ||
    raw.primaryMuscleGroupId;

  // Transform sub-muscles (filter out unmapped ones)
  const subMuscles = (raw.subMuscleIds || [])
    .map((id) => SUB_MUSCLE_MAP[id])
    .filter((name): name is string => name !== undefined);

  // Transform secondary muscle groups
  const secondaryMuscleGroups = (raw.secondaryMuscleGroupIds || [])
    .map((id) => PRIMARY_MUSCLE_GROUP_MAP[id])
    .filter((name): name is string => name !== undefined);

  // Combine equipment and alternative equipment, then transform
  const allEquipmentIds = [
    ...(raw.equipmentIds || []),
    ...(raw.equipmentAlternativeIds || []),
  ];
  const equipment = allEquipmentIds
    .map((id) => EQUIPMENT_MAP[id])
    .filter((name): name is string => name !== undefined)
    // Remove duplicates
    .filter((value, index, self) => self.indexOf(value) === index);

  // Transform movement patterns (only include valid ones from SearchScreen)
  const movementPatterns = (raw.movementPatternIds || [])
    .map((id) => MOVEMENT_PATTERN_MAP[id] ?? MOVEMENT_PATTERN_FILLINS[id])
    .filter(
      (name): name is string =>
        name !== undefined && VALID_MOVEMENT_PATTERNS.includes(name),
    )
    // Remove duplicates
    .filter((value, index, self) => self.indexOf(value) === index);

  const prescriptionType = inferPrescriptionTypeFromRawExercise({
    name: raw.name,
    aliases: raw.aliases,
    prescriptionType: raw.prescriptionType,
    movementPatternIds: raw.movementPatternIds,
  });

  return {
    ...raw,
    primaryMuscleGroup,
    subMuscles,
    secondaryMuscleGroups,
    equipment,
    movementPatterns,
    type: raw.type,
    prescriptionType,
    // Remove old ID fields
    primaryMuscleGroupId: undefined,
    subMuscleIds: undefined,
    secondaryMuscleGroupIds: undefined,
    equipmentIds: undefined,
    equipmentAlternativeIds: undefined,
    movementPatternIds: undefined,
  } as TransformedExercise;
}
