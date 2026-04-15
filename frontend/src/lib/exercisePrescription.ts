/**
 * Aligns with backend `ExercisePrescriptionType` / `exercise-prescription.ts`.
 * When the API sends `prescriptionType: "time"`, UI uses duration; otherwise name heuristics apply.
 */
export type ExercisePrescriptionType = 'reps' | 'time' | 'distance';

const TIME_HOLD_NAME =
  /\b(dead|passive|active)\s+hang\b|\bbar\s+hang\b|\bchin[\-\s]?up\s+hold\b|\b(hollow|arch)\s+hold\b|\bwall\s+sit\b|\bl[\-\s]?sit\b|\bisometric\b|\biso\s+hold\b|\bfront\s+lever\b|\bside\s+plank\b|\bplank\b|\bfront\s+plank\b|\bforearm\s+plank\b/i;

export function isTimeHoldExerciseName(name: string): boolean {
  const n = (name ?? '').trim();
  if (!n) return false;
  if (/\bside\s+plank\b/i.test(n) && /\brow\b/i.test(n)) return false;
  if (TIME_HOLD_NAME.test(n)) {
    if (/\bplank\b/i.test(n) && /\b(row|rotation|reach|drag|dumbbell)\b/i.test(n)) {
      return false;
    }
    return true;
  }
  return false;
}

export function exerciseUsesTimeDisplay(
  prescriptionType: ExercisePrescriptionType | undefined,
  exerciseName: string,
): boolean {
  if (prescriptionType === 'time') return true;
  return isTimeHoldExerciseName(exerciseName);
}
