/**
 * The rest countdown between sets.
 *
 * ⚠ WALL CLOCK, NOT TICKS. The first version chained a 1000ms `setTimeout` per
 * second and decremented a counter, so the countdown only advanced while
 * JavaScript was actually running. Locking the phone between sets — the single
 * most common thing anyone does during rest — suspends React Native's timers,
 * so the number froze at whatever second the screen went dark and then resumed
 * counting from there. A 2:30 rest with the phone in a pocket came back still
 * claiming 2:30. Storing the END INSTANT and deriving the remainder from
 * `Date.now()` makes the display correct however long JS was asleep, and the
 * same change fixes the slower drift that a chain of "1000ms after the last
 * render finished" timeouts accumulates over a few minutes.
 *
 * The timer lives in a module singleton rather than screen state so it keeps
 * running while you flip between exercises mid-session — rest belongs to the
 * workout, not to one screen.
 *
 * It is deliberately NOT persisted to storage. A rest is a couple of minutes,
 * so the only case persistence would add is the OS killing a backgrounded app
 * inside that window, and a resurrected countdown is worth less than the code
 * and the stale-state edge cases it costs.
 */

export interface RestTimer {
  /** Wall-clock ms at which the rest is over. */
  endsAtMs: number;
  /**
   * What it was started from. Displayed as the "OF 2:30" label, and it has to
   * come from here rather than from whatever exercise is on screen: the timer
   * outlives the screen that started it, so a rest begun on a heavy compound
   * keeps running while you flip to an isolation exercise with a shorter
   * prescribed rest.
   */
  totalSeconds: number;
}

/**
 * How late is too late to buzz.
 *
 * The end-of-rest haptic exists to tell you to pick the bar back up. If we
 * only noticed the timer expired because the app came back to the foreground
 * a minute after the fact, buzzing then is worse than saying nothing: it
 * reports an event that is long gone and, with the phone back in your hand,
 * is exactly when you least need it.
 */
export const REST_OVERSHOOT_GRACE_MS = 2_000;

/** Null for a non-positive rest, which is how "no prescribed rest" arrives. */
export function makeRestTimer(seconds: number, nowMs: number): RestTimer | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const whole = Math.round(seconds);
  return { endsAtMs: nowMs + whole * 1000, totalSeconds: whole };
}

/**
 * Seconds still owed. Rounded UP so any fraction of a second still reads as
 * one — a display that shows 0 while time remains would fire the "rest over"
 * branch early.
 */
export function remainingSeconds(timer: RestTimer | null, nowMs: number): number {
  if (!timer) return 0;
  return Math.max(0, Math.ceil((timer.endsAtMs - nowMs) / 1000));
}

export function isRestOver(timer: RestTimer | null, nowMs: number): boolean {
  return !timer || nowMs >= timer.endsAtMs;
}

/**
 * Whether the end-of-rest haptic should fire right now — see
 * `REST_OVERSHOOT_GRACE_MS` for why lateness disqualifies it, and note that a
 * backgrounded app cannot buzz anyway (that needs a scheduled notification,
 * which needs a binary).
 */
export function shouldSignalRestOver(
  timer: RestTimer | null,
  nowMs: number,
  appActive: boolean,
): boolean {
  if (!timer || !appActive) return false;
  const overshootMs = nowMs - timer.endsAtMs;
  return overshootMs >= 0 && overshootMs <= REST_OVERSHOOT_GRACE_MS;
}

// ---------------------------------------------------------------------------
// The one live timer. A module singleton so it outlives any single screen.
// ---------------------------------------------------------------------------

let current: RestTimer | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of [...listeners]) listener();
}

/** Reference-stable between changes, which is what `useSyncExternalStore` needs. */
export function getRestTimer(): RestTimer | null {
  return current;
}

export function subscribeRestTimer(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Start (or restart) the rest. A non-positive duration just clears it. */
export function startRest(seconds: number, nowMs: number = Date.now()): void {
  current = makeRestTimer(seconds, nowMs);
  emit();
}

export function clearRest(): void {
  if (current === null) return;
  current = null;
  emit();
}

/** Tests only — the singleton would otherwise leak between cases. */
export function resetRestTimerForTests(): void {
  current = null;
  listeners.clear();
}
