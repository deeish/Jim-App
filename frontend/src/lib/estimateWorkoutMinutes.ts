/**
 * Rough “how long might this take?” from prescriptions. Not a logged stopwatch.
 *
 * Model (strength-oriented gym session):
 * - Per set: ~3 min work + typical rest (compounds rest longer on average)
 * - Slightly longer per set when reps are high, or when an exercise has many sets (more rest)
 * - Between exercises: setup / walk
 * - Warm-up buffer scales a bit with how many movements are in the session
 *
 * When a plan `estimatedDuration` exists alongside a prescription, we lightly blend toward it
 * so the label stays in the ballpark of what the user scheduled (volume still dominates).
 *
 * When there are no exercises with sets, falls back to `plannedMinutes`.
 */
export type ExerciseLike = {
  sets: number;
  reps?: number;
  /**
   * Synthetic preview rows (e.g. the "cardio finisher" appended by
   * `buildWorkoutPreviewFromSessionDraft`) are not real prescribed sets and must not
   * inflate the time estimate — otherwise the modal disagrees with the card calculation,
   * which only sees the underlying `session.exercises`.
   */
  isSyntheticFinisher?: boolean;
};

/** Coerce API/preview rows (reps sometimes string) for the estimate. */
export function exercisesLikeFromPrescription(
  rows:
    | Array<{
        sets: number;
        reps?: number | string | null;
        isSyntheticFinisher?: boolean;
      }>
    | null
    | undefined,
): ExerciseLike[] | undefined {
  if (!rows?.length) return undefined;
  return rows.map((e) => {
    const r = e.reps;
    let reps: number | undefined;
    if (typeof r === 'number' && Number.isFinite(r)) reps = r;
    else if (typeof r === 'string') {
      const n = Number.parseInt(r, 10);
      reps = Number.isFinite(n) ? n : undefined;
    }
    return {
      sets: e.sets,
      reps,
      ...(e.isSyntheticFinisher ? { isSyntheticFinisher: true } : {}),
    };
  });
}

const MIN_PER_SET_BASE = 2.5;
const MIN_BETWEEN_EXERCISES = 1.5;
/** Bigger sessions get a bit more buffer; 1-movement days stay tighter. */
const WARMUP_BASE = 3.5;
const WARMUP_PER_MOVE_CAP = 5.5;
const WARMUP_PER_MOVE = 0.65;
const DISPLAY_MIN_FLOOR = 10;
const DISPLAY_MAX_CAP = 150;
/** How much planned session length pulls the heuristic (0 = ignore plan, 1 = use plan only). */
const PLANNED_BLEND = 0.40;

function minutesPerSet(reps: number | undefined): number {
  if (reps == null || !Number.isFinite(reps)) return MIN_PER_SET_BASE;
  const r = Math.max(1, Math.min(100, reps));
  if (r > 20) return MIN_PER_SET_BASE + 0.75;
  if (r > 12) return MIN_PER_SET_BASE + 0.35;
  return MIN_PER_SET_BASE;
}

/** Extra time for heavy volume on one lift (longer rests). */
function setsVolumeFactor(sets: number): number {
  if (sets >= 6) return 1.1;
  if (sets >= 4) return 1.05;
  return 1;
}

export function estimateWorkoutMinutesFromExercises(
  exercises: ExerciseLike[] | null | undefined,
  plannedMinutes?: number | null,
): number | null {
  const list = (exercises ?? []).filter(
    (e) => e && (e.sets ?? 0) > 0 && !e.isSyntheticFinisher,
  );
  if (list.length === 0) {
    if (plannedMinutes != null && plannedMinutes > 0) {
      return Math.min(DISPLAY_MAX_CAP, Math.round(plannedMinutes));
    }
    return null;
  }

  const warmup =
    WARMUP_BASE + Math.min(WARMUP_PER_MOVE_CAP, list.length * WARMUP_PER_MOVE);
  let total = warmup;
  for (const ex of list) {
    const sets = Math.max(0, ex.sets);
    const perSet = minutesPerSet(ex.reps) * setsVolumeFactor(sets);
    total += sets * perSet;
  }
  total += Math.max(0, list.length - 1) * MIN_BETWEEN_EXERCISES;

  let rounded = Math.round(total);
  const planned =
    plannedMinutes != null && plannedMinutes > 0
      ? Math.min(DISPLAY_MAX_CAP, plannedMinutes)
      : null;
  if (planned != null) {
    rounded = Math.round(rounded * (1 - PLANNED_BLEND) + planned * PLANNED_BLEND);
  }

  rounded = Math.min(DISPLAY_MAX_CAP, Math.max(DISPLAY_MIN_FLOOR, rounded));
  return rounded;
}

/** Use for UI “Est. X min”: heuristic from exercises, else planned duration. */
export function getWorkoutDisplayEstimateMinutes(
  exercises: ExerciseLike[] | null | undefined,
  plannedMinutes?: number | null,
): number | null {
  return estimateWorkoutMinutesFromExercises(exercises, plannedMinutes);
}

/**
 * Plan calendar: prefer materialized workout exercises, else slot `plan_exercises`, else slot duration.
 */
export function getPlanSlotDisplayMinutes(
  durationMinutes: number,
  planExercises: ExerciseLike[] | null | undefined,
  linkedWorkoutExercises: ExerciseLike[] | null | undefined,
): number {
  const list =
    linkedWorkoutExercises && linkedWorkoutExercises.length > 0
      ? linkedWorkoutExercises
      : planExercises;
  return getWorkoutDisplayEstimateMinutes(list, durationMinutes) ?? durationMinutes;
}
