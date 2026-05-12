import type { GoalId } from '../types/plan';
import type { Exercise } from '../types/workout';
import type { WeightUnit } from './weightDisplay';
import { formatAtWeightFromLb, formatWeightCompactFromLb } from './weightDisplay';
import { exerciseUsesTimeDisplay } from './exercisePrescription';
import { formatExerciseRepsDisplay } from './formatExerciseRepsDisplay';

export type ExercisePrescriptionLike = Pick<
  Exercise,
  'name' | 'sets' | 'reps' | 'weight' | 'primaryMuscleGroup'
> & {
  prescriptionType?: import('./exercisePrescription').ExercisePrescriptionType;
};

/** Maps profile settings labels to pipeline/API goal ids used by {@link formatExerciseRepsDisplay}. */
export function profileGoalToPlanGoal(profileGoal: string): GoalId {
  const g = profileGoal.toLowerCase();
  if (g.includes('fat')) return 'fat_loss';
  if (g.includes('endurance')) return 'endurance';
  if (g.includes('general') || g.includes('hypertrophy')) return 'balanced';
  return 'strength';
}

/** Materialized workout target reps/duration for live session headers (numeric `reps` only). */
export function formatPlanTargetRepDisplay(exercise: ExercisePrescriptionLike, goal: GoalId): string {
  return exerciseUsesTimeDisplay(
    exercise.prescriptionType,
    exercise.name,
    exercise.primaryMuscleGroup,
  )
    ? formatExerciseRepsDisplay(
        exercise.name,
        exercise.reps,
        goal,
        exercise.prescriptionType,
        exercise.primaryMuscleGroup,
      )
    : String(exercise.reps);
}

/**
 * Compact `sets × target` for plan detail, preview lists, cards.
 * When `reps` is already a formatted string from preview APIs (e.g. `10 min`), pass it through.
 */
export function formatExercisePrescriptionCompact(
  exercise: Pick<ExercisePrescriptionLike, 'name' | 'sets' | 'primaryMuscleGroup' | 'prescriptionType'> & {
    reps: number | string;
  },
  goal: GoalId,
): string {
  const raw = exercise.reps;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (t && !/^\d+$/.test(t)) {
      return `${exercise.sets} × ${t}`;
    }
  }
  const repsNum = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
  const repPart = exerciseUsesTimeDisplay(
    exercise.prescriptionType,
    exercise.name,
    exercise.primaryMuscleGroup,
  )
    ? formatExerciseRepsDisplay(
        exercise.name,
        Number.isFinite(repsNum) ? repsNum : raw,
        goal,
        exercise.prescriptionType,
        exercise.primaryMuscleGroup,
      )
    : String(Number.isFinite(repsNum) ? repsNum : raw);
  return `${exercise.sets} × ${repPart}`;
}

/** Bullet-separated line for workout detail (matches Plan Est. sublines). */
export function formatExercisePrescriptionBulleted(
  exercise: ExercisePrescriptionLike,
  goal: GoalId,
  weightUnit: WeightUnit,
): string {
  const setsLbl = `${exercise.sets} ${exercise.sets === 1 ? 'set' : 'sets'}`;
  const second = exerciseUsesTimeDisplay(
    exercise.prescriptionType,
    exercise.name,
    exercise.primaryMuscleGroup,
  )
    ? formatExerciseRepsDisplay(
        exercise.name,
        exercise.reps,
        goal,
        exercise.prescriptionType,
        exercise.primaryMuscleGroup,
      )
    : `${exercise.reps} reps`;
  const parts: string[] = [setsLbl, second];
  if (exercise.weight != null && exercise.weight !== 0) {
    parts.push(formatWeightCompactFromLb(exercise.weight, weightUnit));
  }
  return parts.join(' · ');
}

/** Exercise list row like legacy `ExerciseCard`. */
export function formatExercisePrescriptionExerciseCard(
  exercise: ExercisePrescriptionLike,
  goal: GoalId,
  weightUnit: WeightUnit,
): string {
  const compact = formatExercisePrescriptionCompact(exercise, goal);
  if (exercise.weight != null && exercise.weight > 0) {
    return `${compact}${formatAtWeightFromLb(exercise.weight, weightUnit)}`;
  }
  return compact;
}
