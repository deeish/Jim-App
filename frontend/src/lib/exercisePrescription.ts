/**
 * Aligns with backend `ExercisePrescriptionType` / `exercise-prescription.ts`.
 * When the API sends `prescriptionType: "time"`, UI uses duration; otherwise name heuristics apply.
 */
export type ExercisePrescriptionType = 'reps' | 'time' | 'distance';

// `\bhold\b` generic catch — every "… hold" exercise in the catalog is isometric
// (verified, zero rep false positives). Keep in sync with backend `TIME_NAME`.
const TIME_HOLD_NAME =
  /\b(dead|passive|active)\s+hang\b|\bbar\s+hang\b|\bhold\b|\bwall\s+sit\b|\bl[\-\s]?sit\b|\bisometric\b|\bfront\s+lever\b|\bside\s+plank\b|\bplank\b|\bfront\s+plank\b|\bforearm\s+plank\b/i;

const CARRY_OR_LOADED_WALK =
  /\b(carry|carries|farmer|pinch|suitcase|yoke|prowler|sled|loaded\s+carry)\b/i;

/** Machine/modality names for cardio finishers — DB rows often omit primaryMuscleGroup. */
const CARDIO_MODALITY_NAME =
  /\b(?:treadmill|elliptical|(?:stationary\s+)?bike|spin(?:\s+bike)?|air\s*dyne|rowing|rower|(?:ski|assault)\s*erg|ski\s*erg|ergometer|versa\s*climber|stair\s*(?:master|climber)|step\s*mill|walking\s+pad)\b/i;

export function isTimeHoldExerciseName(name: string): boolean {
  const n = (name ?? '').trim();
  if (!n) return false;
  if (/\bside\s+plank\b/i.test(n) && /\brow\b/i.test(n)) return false;
  if (TIME_HOLD_NAME.test(n)) {
    // Plank-HYBRID names are rep movements performed from a plank position —
    // base plank/side-plank holds stay timed. Keep in sync with backend.
    if (
      /\bplank\b/i.test(n) &&
      /\b(row|rotation|reach|drag|dumbbell|clamshell|abduction|hip\s+dip|shoulder\s+tap|knee\s+tuck|bird\s+dog|leg\s+raise|up[\s-]?down|walkout)\b/i.test(
        n,
      )
    ) {
      return false;
    }
    return true;
  }
  return false;
}

/**
 * Render a `restSeconds` value as a compact preview string. Mirrors the
 * convention shown in trainer-authored programs:
 *   - <60s → `45s`
 *   - exact minute → `2 min`
 *   - mixed → `1m 30s`
 */
export function formatRestSecondsForPreview(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  if (rem === 0) return mins === 1 ? `1 min` : `${mins} min`;
  return `${mins}m ${rem}s`;
}

/**
 * What to write when an exercise is added with nothing to inherit — from
 * search, or any other "just put this in my workout" path. Timed work carries
 * its duration and a placeholder rep count, the shape the plan-slot writer
 * already uses; adding a plank used to record it as 3 × 10 reps.
 */
export function defaultPrescriptionForNewExercise(
  name: string,
  primaryMuscleGroup?: string,
  prescriptionType?: ExercisePrescriptionType,
): {
  sets: number;
  reps: number;
  prescriptionType?: 'time';
  durationSeconds?: number;
} {
  if (!exerciseUsesTimeDisplay(prescriptionType, name, primaryMuscleGroup)) {
    return { sets: 3, reps: 10 };
  }
  // A cardio block is one long piece; a hold is still sets of a hold.
  return (primaryMuscleGroup ?? '').toLowerCase() === 'cardio'
    ? { sets: 1, reps: 1, prescriptionType: 'time', durationSeconds: 600 }
    : { sets: 3, reps: 1, prescriptionType: 'time', durationSeconds: 45 };
}

export function exerciseUsesTimeDisplay(
  prescriptionType: ExercisePrescriptionType | undefined,
  exerciseName: string,
  /**
   * Belt-and-suspenders fallback for cardio rows whose `prescriptionType` is
   * missing (legacy generated sessions, mock previews, swap cards). When
   * `'Cardio'`, the row renders as a duration regardless of the rep value —
   * mirrors the backend `inferPrescriptionTypeFromRawExercise` cardio gate.
   */
  primaryMuscleGroup?: string,
): boolean {
  if (prescriptionType === 'time') return true;
  if ((primaryMuscleGroup ?? '').toLowerCase() === 'cardio') return true;
  const n = (exerciseName ?? '').trim();
  if (CARRY_OR_LOADED_WALK.test(n)) return true;
  if (CARDIO_MODALITY_NAME.test(n)) return true;
  return isTimeHoldExerciseName(exerciseName);
}
