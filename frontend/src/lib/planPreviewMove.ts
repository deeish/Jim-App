/**
 * Moving a workout between days in the plan preview.
 *
 * ⚠ WHY THIS IS A LIBRARY FUNCTION AND NOT A LINE IN THE SCREEN.
 *
 * The preview keeps the same plan in two places: `planData`, which is what you
 * SEE, and `planDraft`, which is what Apply actually writes. `handleMoveToDay`
 * used to update them with two DIFFERENT operations — the display appended the
 * workout to the destination day, while the draft EXCHANGED the sessions of the
 * two days.
 *
 * Those agree only when the destination is empty, which is why it survived. Move
 * onto an occupied day and they diverge: the display shows the destination with
 * two workouts and the origin empty, while the draft has them swapped. `handleApply`
 * then reads the SLOTS from `planData` and their EXERCISES from `planDraft`, so
 * the destination emits two slots that both resolve to the same session, and the
 * origin emits none at all — a doubled day and a silently lost session, applied
 * to a real plan.
 *
 * The draft's swap is the correct semantic: one day holds one session, and the
 * calendar's own language for moving onto a taken day is "make room". So the
 * display is what was wrong, and this function is the single definition of the
 * operation both stores now perform.
 */

/** The shape this needs; the screen's `PlanWorkout` satisfies it. */
export interface MovableWorkout {
  id: string;
  changeType?: string;
}

export type DayWorkouts<T extends MovableWorkout> = Record<string, T[]>;

/**
 * Exchange the workout on `fromDay` with whatever sits on `toDay`.
 *
 * Returns a new map. Anything else already on the origin day is preserved
 * rather than discarded — the draft can only model one session per day, so a
 * second one is already an anomaly, and silently dropping it would be a second
 * bug on top of the first.
 */
export function moveWorkoutBetweenDays<T extends MovableWorkout>(
  workouts: DayWorkouts<T>,
  workoutId: string,
  fromDay: string,
  toDay: string,
  markMoved: (workout: T) => T,
): DayWorkouts<T> {
  if (fromDay === toDay) return workouts;
  const fromWorkouts = workouts[fromDay] ?? [];
  const moving = fromWorkouts.find((w) => w.id === workoutId);
  if (!moving) return workouts;

  const displaced = workouts[toDay] ?? [];
  const remainingOnOrigin = fromWorkouts.filter((w) => w.id !== workoutId);

  return {
    ...workouts,
    // The displaced session takes the origin day — a swap, matching the draft.
    [fromDay]: [...displaced.map(markMoved), ...remainingOnOrigin],
    [toDay]: [markMoved(moving)],
  };
}
