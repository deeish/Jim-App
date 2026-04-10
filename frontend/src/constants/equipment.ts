/** Labels must match backend / exercise search filter names. */
export const EQUIPMENT_OPTIONS = [
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
] as const;

export type EquipmentOption = (typeof EQUIPMENT_OPTIONS)[number];
