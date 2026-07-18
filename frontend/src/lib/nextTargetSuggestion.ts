import { WeightUnit, kgToLb, lbToKg, roundLb } from './weightDisplay';
import {
  exerciseUsesTimeDisplay,
  type ExercisePrescriptionType,
} from './exercisePrescription';

/**
 * Deterministic next-target rule: given the last logged performance and the
 * prescribed rep band, suggest the next load/reps. Pure (sibling lib deps
 * only) so it can move server-side if plan progression ever consumes it.
 */

export type NextTargetKind =
  | 'increase_weight'
  | 'add_rep'
  | 'hold'
  | 'reduce_weight';

export interface NextTargetSuggestion {
  kind: NextTargetKind;
  /** Suggested load, canonical lb; null for bodyweight rows. */
  weightLb: number | null;
  /** Last top working weight the suggestion was derived from (lb). */
  fromWeightLb: number | null;
  targetReps: number;
}

export interface SuggestNextTargetInput {
  /** Completed sets from the most recent log of this exercise. */
  lastSets: Array<{ reps: number; weight?: number | null }>;
  repsMin?: number;
  repsMax?: number;
  /** Legacy single-number prescription (= repsMin when a band exists). */
  reps: number;
  isTimeBased: boolean;
  isLowerBody: boolean;
  unit: WeightUnit;
}

/**
 * A weight jump larger than this fraction of the current load is not real
 * gym progression (+5 lb on 15 lb lateral raises is a 33% jump) — keep
 * adding reps past the ceiling instead.
 */
const MAX_INCREMENT_FRACTION = 0.15;

const LOWER_BODY_NAME =
  /\b(squat|deadlift|lunge|leg|hip thrust|glute|calf|calves|rdl|romanian|hamstring|step[\s-]?up|good morning)\b/i;

export function isLowerBodyExercise(
  primaryMuscleGroup: string | undefined,
  name: string,
): boolean {
  if ((primaryMuscleGroup ?? '').toLowerCase() === 'legs') return true;
  return LOWER_BODY_NAME.test(name ?? '');
}

/** Round a lb value to the nearest clean plate step in the display unit. */
function roundToStep(lb: number, unit: WeightUnit): number {
  if (unit === 'kg') {
    const kg = Math.round(lbToKg(lb) / 2.5) * 2.5;
    return roundLb(kgToLb(kg));
  }
  return Math.round(lb / 5) * 5;
}

export function suggestNextTarget(
  input: SuggestNextTargetInput,
): NextTargetSuggestion | null {
  const { lastSets, isTimeBased, isLowerBody, unit } = input;
  if (isTimeBased || lastSets.length === 0) return null;

  const lo = input.repsMin ?? input.reps;
  if (!Number.isFinite(lo) || lo < 1) return null;
  const hi = Math.max(input.repsMax ?? lo, lo);

  let topWeight = 0;
  for (const s of lastSets) {
    if (s.weight != null && s.weight > topWeight) topWeight = s.weight;
  }
  if (topWeight <= 0) {
    // Bodyweight: progress by adding a rep to the best set.
    const maxReps = Math.max(...lastSets.map((s) => s.reps));
    return {
      kind: 'add_rep',
      weightLb: null,
      fromWeightLb: null,
      targetReps: maxReps + 1,
    };
  }

  // Judge only the sets at the top weight so warmup/back-off sets don't drag
  // the verdict down.
  const workingSets = lastSets.filter((s) => s.weight === topWeight);
  const maxWorkingReps = Math.max(...workingSets.map((s) => s.reps));

  if (workingSets.every((s) => s.reps >= hi)) {
    const incrementLb =
      unit === 'kg' ? kgToLb(isLowerBody ? 5 : 2.5) : isLowerBody ? 10 : 5;
    if (incrementLb > topWeight * MAX_INCREMENT_FRACTION) {
      return {
        kind: 'add_rep',
        weightLb: topWeight,
        fromWeightLb: topWeight,
        targetReps: maxWorkingReps + 1,
      };
    }
    return {
      kind: 'increase_weight',
      weightLb: roundLb(topWeight + incrementLb),
      fromWeightLb: topWeight,
      targetReps: lo,
    };
  }

  // Deload only when even the best working set was a hard failure; one set
  // collapsing 3+ under the floor is normal late-set fatigue, not a sign the
  // weight is wrong.
  if (maxWorkingReps <= lo - 3) {
    let reduced = roundToStep(topWeight * 0.9, unit);
    if (reduced >= topWeight) {
      reduced = roundToStep(topWeight * 0.9 - (unit === 'kg' ? kgToLb(2.5) : 5), unit);
    }
    if (reduced <= 0) {
      return {
        kind: 'hold',
        weightLb: topWeight,
        fromWeightLb: topWeight,
        targetReps: lo,
      };
    }
    return {
      kind: 'reduce_weight',
      weightLb: reduced,
      fromWeightLb: topWeight,
      targetReps: lo,
    };
  }

  if (workingSets.some((s) => s.reps < lo)) {
    return {
      kind: 'hold',
      weightLb: topWeight,
      fromWeightLb: topWeight,
      targetReps: lo,
    };
  }

  return {
    kind: 'add_rep',
    weightLb: topWeight,
    fromWeightLb: topWeight,
    targetReps: Math.min(hi, maxWorkingReps + 1),
  };
}

/** Session-exercise fields the rule needs (structural subset of Exercise). */
export interface SuggestibleExercise {
  name: string;
  reps: number;
  repsMin?: number;
  repsMax?: number;
  prescriptionType?: ExercisePrescriptionType;
  primaryMuscleGroup?: string;
}

/**
 * Builds the rule input from a session exercise. The prefill resolver and the
 * card render must both go through here so the prefilled weight can never
 * diverge from the displayed suggestion.
 */
export function suggestNextTargetForExercise(
  exercise: SuggestibleExercise,
  lastSets: SuggestNextTargetInput['lastSets'],
  unit: WeightUnit,
): NextTargetSuggestion | null {
  return suggestNextTarget({
    lastSets,
    repsMin: exercise.repsMin,
    repsMax: exercise.repsMax,
    reps: exercise.reps,
    isTimeBased: exerciseUsesTimeDisplay(
      exercise.prescriptionType,
      exercise.name,
      exercise.primaryMuscleGroup,
    ),
    isLowerBody: isLowerBodyExercise(exercise.primaryMuscleGroup, exercise.name),
    unit,
  });
}

/** Suggested-weight display keeps half-kilo precision (103 kg vs 102.5 kg matters). */
function formatSuggestedWeight(lb: number, unit: WeightUnit): string {
  if (unit === 'lb') return `${Math.round(lb)} lb`;
  const kg = Math.round(lbToKg(lb) * 2) / 2;
  return `${kg} kg`;
}

export function formatSuggestionLine(
  suggestion: NextTargetSuggestion | null,
  unit: WeightUnit,
): string | null {
  if (!suggestion) return null;
  const { kind, weightLb, fromWeightLb, targetReps } = suggestion;
  if (weightLb == null) {
    return `Next: aim ${targetReps} reps`;
  }
  const w = formatSuggestedWeight(weightLb, unit);
  switch (kind) {
    case 'increase_weight': {
      const up =
        fromWeightLb != null
          ? ` (up ${formatSuggestedWeight(weightLb - fromWeightLb, unit)})`
          : '';
      return `Next: ${w} × ${targetReps}${up}`;
    }
    case 'reduce_weight':
      return `Next: ${w} × ${targetReps} (deload)`;
    case 'hold':
      return `Next: hold ${w}, build to ${targetReps}`;
    case 'add_rep':
      return `Next: ${w} × ${targetReps} (add a rep)`;
  }
}
