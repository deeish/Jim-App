import type { WorkoutLogEntrySet } from '../types/workout';
import {
  exerciseUsesTimeDisplay,
  formatRestSecondsForPreview,
} from './exercisePrescription';
import { MIN_PLAUSIBLE_DURATION_SECONDS } from './lastPerformanceDisplay';
import { WeightUnit, formatWeightCompactFromLb } from './weightDisplay';

/**
 * One logged set as History's day view renders it: `8 × 145 lb`, `12 × —`
 * (unweighted), `45s @ 70 lb` (loaded carry), `10 min` (cardio block).
 *
 * Timed rows log their seconds in the reps field, so rendering them the rep
 * way reads as "45 × 70 lb". Log entries carry only the exercise name, so
 * detection is name-based; legacy timed rows can hold a true rep count, so
 * only plausible durations render as time — the same gate the exercise-detail
 * history uses.
 */
export function formatLoggedSetDetail(
  set: Pick<WorkoutLogEntrySet, 'reps' | 'weight'>,
  exerciseName: string | null | undefined,
  unit: WeightUnit,
): string {
  const weight = formatWeightCompactFromLb(set.weight ?? 0, unit);
  const timeBased = exerciseUsesTimeDisplay(undefined, exerciseName ?? '');
  if (timeBased && (set.reps || 0) >= MIN_PLAUSIBLE_DURATION_SECONDS) {
    const duration = formatRestSecondsForPreview(set.reps);
    return weight ? `${duration} @ ${weight}` : duration;
  }
  return `${set.reps} × ${weight || '—'}`;
}
