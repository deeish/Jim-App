/**
 * How a prescription should be interpreted for logging, UI, and generation hints.
 * Library rows may set `prescriptionType` explicitly; otherwise we infer from name/patterns.
 */
export type ExercisePrescriptionType = 'reps' | 'time' | 'distance';

const TIME_NAME =
  /\b(dead|passive|active)\s+hang\b|\bbar\s+hang\b|\bchin[\-\s]?up\s+hold\b|\b(hollow|arch)\s+hold\b|\bwall\s+sit\b|\bl[\-\s]?sit\b|\bisometric\b|\biso\s+hold\b|\bfront\s+lever\b|\bside\s+plank\b|\bplank\b|\bfront\s+plank\b|\bforearm\s+plank\b/i;

/** Pattern ids from raw data that imply duration, not rep counting. */
const TIME_MOVEMENT_PATTERN_IDS = new Set([
  'hang',
  'support_hold',
  'isometric_hold',
  'wall_brace',
  'plank_hold',
]);

function nameImpliesTime(name: string): boolean {
  const n = (name ?? '').trim();
  if (!n) return false;
  if (/\bside\s+plank\b/i.test(n) && /\brow\b/i.test(n)) return false;
  if (TIME_NAME.test(n)) {
    if (/\bplank\b/i.test(n) && /\b(row|rotation|reach|drag|dumbbell)\b/i.test(n)) {
      return false;
    }
    return true;
  }
  return false;
}

/**
 * Infer prescription type from raw library fields (before or after id→name mapping).
 * Prefer explicit `prescriptionType` on the row when present and valid.
 */
export function inferPrescriptionTypeFromRawExercise(raw: {
  name: string;
  aliases?: string[];
  prescriptionType?: string;
  movementPatternIds?: string[];
}): ExercisePrescriptionType {
  const explicit = raw.prescriptionType?.toLowerCase()?.trim();
  if (explicit === 'time' || explicit === 'distance' || explicit === 'reps') {
    return explicit as ExercisePrescriptionType;
  }
  for (const id of raw.movementPatternIds ?? []) {
    if (TIME_MOVEMENT_PATTERN_IDS.has(String(id).toLowerCase())) {
      return 'time';
    }
  }
  if (nameImpliesTime(raw.name)) return 'time';
  for (const a of raw.aliases ?? []) {
    if (nameImpliesTime(a)) return 'time';
  }
  return 'reps';
}

/** Name-only fallback when `exerciseId` is missing (e.g. legacy rows). */
export function inferPrescriptionTypeFromExerciseName(
  name: string | undefined,
): ExercisePrescriptionType {
  return nameImpliesTime(name ?? '') ? 'time' : 'reps';
}
