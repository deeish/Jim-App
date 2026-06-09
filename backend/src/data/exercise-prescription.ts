/**
 * How a prescription should be interpreted for logging, UI, and generation hints.
 * Library rows may set `prescriptionType` explicitly; otherwise we infer from name/patterns.
 */
export type ExercisePrescriptionType = 'reps' | 'time' | 'distance';

// `\bhold\b` is a deliberately generic catch: across the full 1,292-exercise
// catalog every exercise whose name contains the word "hold" is isometric/time
// (verified — zero rep-counted false positives), so this covers "Deadlift Hold",
// "Static Hold", "Chin-Up Hold", etc. in one rule instead of an endless list.
const TIME_NAME =
  /\b(dead|passive|active)\s+hang\b|\bbar\s+hang\b|\bhold\b|\bwall\s+sit\b|\bl[\-\s]?sit\b|\bisometric\b|\bfront\s+lever\b|\bside\s+plank\b|\bplank\b|\bfront\s+plank\b|\bforearm\s+plank\b/i;

/** Pattern ids from raw data that imply duration, not rep counting. */
const TIME_MOVEMENT_PATTERN_IDS = new Set([
  'hang',
  'support_hold',
  'isometric_hold',
  'wall_brace',
  'plank_hold',
]);

const CARRY_OR_LOADED_WALK =
  /\b(carry|carries|farmer|pinch|suitcase|yoke|prowler|sled|loaded\s+carry)\b/i;

function nameImpliesTime(name: string): boolean {
  const n = (name ?? '').trim();
  if (!n) return false;
  if (CARRY_OR_LOADED_WALK.test(n)) return true;
  if (/\bside\s+plank\b/i.test(n) && /\brow\b/i.test(n)) return false;
  if (TIME_NAME.test(n)) {
    if (
      /\bplank\b/i.test(n) &&
      /\b(row|rotation|reach|drag|dumbbell)\b/i.test(n)
    ) {
      return false;
    }
    return true;
  }
  return false;
}

/**
 * Infer prescription type from raw library fields (before or after id→name mapping).
 * Prefer explicit `prescriptionType` on the row when present and valid.
 *
 * Cardio rows (treadmill, bike, rower, ski erg, elliptical, versa climber, etc.)
 * are tagged `time` automatically — their `primaryMuscleGroup === 'Cardio'` is
 * the strongest signal we have, even if no name regex matches. Without this,
 * the cardio finisher append in `session-enrichment.ts` ends up showing rep
 * bands (`1 × 7-13`) instead of a duration (`~10 min`).
 */
export function inferPrescriptionTypeFromRawExercise(raw: {
  name: string;
  aliases?: string[];
  prescriptionType?: string;
  movementPatternIds?: string[];
  primaryMuscleGroup?: string;
  primaryMuscleGroupId?: string;
}): ExercisePrescriptionType {
  const explicit = raw.prescriptionType?.toLowerCase()?.trim();
  if (explicit === 'time' || explicit === 'distance' || explicit === 'reps') {
    return explicit as ExercisePrescriptionType;
  }
  if (rawIsCardioPrimaryGroup(raw)) return 'time';
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

/** True when the raw row describes a cardio piece, by transformed group OR raw id. */
function rawIsCardioPrimaryGroup(raw: {
  primaryMuscleGroup?: string;
  primaryMuscleGroupId?: string;
}): boolean {
  if ((raw.primaryMuscleGroup ?? '').toLowerCase() === 'cardio') return true;
  // Raw ids in `data/exercises_5000plus.json` use slugs like `cardio` / `cardio_endurance`.
  if (/^cardio/i.test(raw.primaryMuscleGroupId ?? '')) return true;
  return false;
}

/** Name-only fallback when `exerciseId` is missing (e.g. legacy rows). */
export function inferPrescriptionTypeFromExerciseName(
  name: string | undefined,
): ExercisePrescriptionType {
  return nameImpliesTime(name ?? '') ? 'time' : 'reps';
}
