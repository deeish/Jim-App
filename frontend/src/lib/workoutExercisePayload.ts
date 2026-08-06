import type { Exercise } from '../types/workout';

/**
 * Builds the `exercises` payload for PUT/POST /workouts from existing rows
 * WITHOUT losing prescription fields.
 *
 * Three screens used to hand-roll this mapping with only the seven "obvious"
 * fields, which silently dropped repsMin/repsMax/durationSeconds/
 * prescriptionType — so adding or removing a single exercise flattened every
 * range in the workout ("4 x 6-8" became "4 x 6"), and the backend's plan
 * sync then wrote the flattened rows back into the plan permanently. Every
 * exercises payload must go through here; if the row shape grows a field,
 * this is the one place to carry it.
 */
export interface WorkoutExercisePayload {
  name: string;
  sets: number;
  reps: number;
  repsMin?: number;
  repsMax?: number;
  durationSeconds?: number;
  prescriptionType?: Exercise['prescriptionType'];
  weight?: number;
  notes?: string;
  exerciseId?: string;
  orderIndex: number;
}

type ExerciseLike = Pick<Exercise, 'name' | 'sets' | 'reps'> &
  Partial<
    Pick<
      Exercise,
      | 'repsMin'
      | 'repsMax'
      | 'durationSeconds'
      | 'prescriptionType'
      | 'weight'
      | 'notes'
      | 'exerciseId'
    >
  >;

export function toWorkoutExercisePayloads(
  exercises: readonly ExerciseLike[],
  startIndex = 0,
): WorkoutExercisePayload[] {
  return exercises.map((ex, i) => ({
    name: ex.name,
    sets: ex.sets,
    reps: ex.reps,
    // `|| undefined` on purpose: the validated POST route rejects these at
    // @Min(1), so a literal 0 (meaningless for all three) must be omitted
    // rather than 400 the whole request.
    repsMin: ex.repsMin || undefined,
    repsMax: ex.repsMax || undefined,
    durationSeconds: ex.durationSeconds || undefined,
    prescriptionType: ex.prescriptionType ?? undefined,
    weight: ex.weight ?? undefined,
    notes: ex.notes ?? undefined,
    exerciseId: ex.exerciseId ?? undefined,
    orderIndex: startIndex + i,
  }));
}
