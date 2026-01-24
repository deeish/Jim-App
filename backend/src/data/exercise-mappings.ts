/**
 * Mapping configuration to convert exercise data IDs to SearchScreen display names
 * This maps the format from exercises_5000plus.json to what SearchScreen.tsx expects
 */

// Primary Muscle Group ID → Display Name
export const PRIMARY_MUSCLE_GROUP_MAP: Record<string, string> = {
  chest: 'Chest',
  back: 'Back',
  legs: 'Legs',
  shoulders: 'Shoulders',
  arms: 'Arms',
  core: 'Core',
};

// Sub-Muscle ID → Display Name
export const SUB_MUSCLE_MAP: Record<string, string> = {
  // Chest
  'chest_upper': 'Upper Chest',
  'chest_mid': 'Mid Chest',
  'chest_lower': 'Lower Chest',
  
  // Back
  'back_lats': 'Lats',
  'back_traps': 'Traps',
  'back_mid': 'Mid Back',
  'back_lower': 'Lower Back',
  'back_upper': 'Upper Back', // If exists in data
  
  // Legs
  'legs_quads': 'Quads',
  'legs_hamstrings': 'Hamstrings',
  'legs_glutes': 'Glutes',
  'legs_calves': 'Calves',
  'legs_inner_thighs': 'Inner Thighs',
  'legs_outer_thighs': 'Outer Thighs',
  
  // Shoulders
  'shoulders_front_delts': 'Front Delts',
  'shoulders_side_delts': 'Side Delts',
  'shoulders_rear_delts': 'Rear Delts',
  'shoulders_rotator_cuff': 'Rotator Cuff',
  
  // Arms
  'arms_biceps': 'Biceps',
  'arms_triceps': 'Triceps',
  'arms_forearms': 'Forearms',
  'arms_grip': 'Forearms', // Map grip to forearms
  
  // Core
  'core_upper_abs': 'Upper Abs',
  'core_lower_abs': 'Lower Abs',
  'core_obliques': 'Obliques',
  'core_deep': 'Upper Abs', // Map deep core to upper abs
};

// Equipment ID → Display Name
export const EQUIPMENT_MAP: Record<string, string> = {
  bodyweight: 'Bodyweight',
  dumbbell: 'Dumbbell',
  barbell: 'Barbell',
  cable: 'Cable',
  machine: 'Machine',
  kettlebell: 'Kettlebell',
  pullup_bar: 'Pull-up Bar',
  smith_machine: 'Smith Machine',
  medicine_ball: 'Medicine Ball',
  bands: 'Resistance Band',
  trx: 'TRX',
  // Additional equipment that might be in data but not in SearchScreen
  bench: 'Machine', // Bench is typically part of machine setup
  ab_wheel: 'Bodyweight', // Map to bodyweight
  dip_bars: 'Pull-up Bar', // Similar equipment
  ez_bar: 'Barbell', // EZ bar is a type of barbell
  landmine: 'Machine', // Landmine is machine-based
  plyo_box: 'Bodyweight', // Plyometric box for bodyweight exercises
  rower: 'Machine', // Rowing machine
  squat_rack: 'Machine', // Squat rack is machine equipment
  trap_bar: 'Barbell', // Trap bar is a type of barbell
  battle_rope: 'Battle Rope', // Keep as is if in SearchScreen
};

// Movement Pattern ID → Display Name
export const MOVEMENT_PATTERN_MAP: Record<string, string> = {
  push: 'Push',
  pull: 'Pull',
  squat: 'Squat',
  hinge: 'Hinge',
  lunge: 'Lunge',
  carry: 'Carry',
  // Additional patterns in data but not in SearchScreen (optional)
  cardio: 'Push', // Map cardio to Push for filtering purposes, or filter out
  core: 'Push', // Map core movements to Push, or filter out
  isometric: 'Push', // Map isometric to Push, or filter out
};

/**
 * Valid display names from SearchScreen (for validation)
 */
export const VALID_PRIMARY_MUSCLE_GROUPS = Object.values(PRIMARY_MUSCLE_GROUP_MAP);
export const VALID_SUB_MUSCLES = Object.values(SUB_MUSCLE_MAP);
export const VALID_EQUIPMENT = [
  'Bodyweight', 'Dumbbell', 'Barbell', 'Cable', 'Machine',
  'Kettlebell', 'Resistance Band', 'TRX', 'Pull-up Bar',
  'Medicine Ball', 'Battle Rope', 'Smith Machine'
];
export const VALID_MOVEMENT_PATTERNS = ['Push', 'Pull', 'Squat', 'Hinge', 'Lunge', 'Carry'];

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
  [key: string]: any; // Preserve other fields
}

export function transformExercise(raw: RawExercise): TransformedExercise {
  // Transform primary muscle group
  const primaryMuscleGroup = PRIMARY_MUSCLE_GROUP_MAP[raw.primaryMuscleGroupId] || raw.primaryMuscleGroupId;
  
  // Transform sub-muscles (filter out unmapped ones)
  const subMuscles = (raw.subMuscleIds || [])
    .map(id => SUB_MUSCLE_MAP[id])
    .filter((name): name is string => name !== undefined);
  
  // Transform secondary muscle groups
  const secondaryMuscleGroups = (raw.secondaryMuscleGroupIds || [])
    .map(id => PRIMARY_MUSCLE_GROUP_MAP[id])
    .filter((name): name is string => name !== undefined);
  
  // Combine equipment and alternative equipment, then transform
  const allEquipmentIds = [
    ...(raw.equipmentIds || []),
    ...(raw.equipmentAlternativeIds || [])
  ];
  const equipment = allEquipmentIds
    .map(id => EQUIPMENT_MAP[id])
    .filter((name): name is string => name !== undefined)
    // Remove duplicates
    .filter((value, index, self) => self.indexOf(value) === index);
  
  // Transform movement patterns (only include valid ones from SearchScreen)
  const movementPatterns = (raw.movementPatternIds || [])
    .map(id => MOVEMENT_PATTERN_MAP[id])
    .filter((name): name is string => 
      name !== undefined && VALID_MOVEMENT_PATTERNS.includes(name)
    )
    // Remove duplicates
    .filter((value, index, self) => self.indexOf(value) === index);
  
  return {
    ...raw,
    primaryMuscleGroup,
    subMuscles,
    secondaryMuscleGroups,
    equipment,
    movementPatterns,
    // Remove old ID fields
    primaryMuscleGroupId: undefined,
    subMuscleIds: undefined,
    secondaryMuscleGroupIds: undefined,
    equipmentIds: undefined,
    equipmentAlternativeIds: undefined,
    movementPatternIds: undefined,
  } as TransformedExercise;
}
