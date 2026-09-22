import type { RestTimer } from './restTimer';

/**
 * When the rest-over nudge is offered and when it is scheduled (GitHub #55).
 * Pure, so the screen's wiring stays thin and the rules have tests.
 */
export type RestNudgeStatus = 'unasked' | 'granted' | 'declined';

/**
 * A rest that ended while the app was away is the moment the nudge earns
 * its ask: the user just felt the gap it would have filled. Nothing is
 * offered at launch, after a decline, or when the app saw the end itself.
 */
export function restEndedWhileAway(
  timer: RestTimer | null,
  backgroundedAtMs: number | null,
  nowMs: number,
): boolean {
  if (!timer || backgroundedAtMs == null) return false;
  return backgroundedAtMs < timer.endsAtMs && nowMs >= timer.endsAtMs;
}

export function shouldOfferRestNudge(args: {
  status: RestNudgeStatus;
  endedWhileAway: boolean;
  /** Offered once per app session; a dismissal without an answer is not a decline. */
  offeredThisSession: boolean;
  available: boolean;
}): boolean {
  return (
    args.available && args.status === 'unasked' && args.endedWhileAway && !args.offeredThisSession
  );
}

/** Only a granted phone schedules, and only for a rest still ahead. */
export function shouldScheduleRestNudge(
  status: RestNudgeStatus,
  timer: RestTimer | null,
  nowMs: number,
): boolean {
  return status === 'granted' && timer != null && timer.endsAtMs > nowMs;
}

/** 'Set 3 of 4 · Flat Barbell Bench Press' */
export function restNudgeBody(setNumber: number, totalSets: number, exerciseName: string): string {
  return `Set ${setNumber} of ${totalSets} · ${exerciseName}`;
}
