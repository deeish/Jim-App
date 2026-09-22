/**
 * The stopwatch on a timed set (GitHub #58, 2026-09-22): a dead hang, a
 * plank, a carry. It counts UP, so the number on screen is always the time
 * that will be logged, and the target lives on the ring and its label. A
 * short lead-in runs first, because nobody can tap Start and be on the bar
 * in the same instant; the lead-in is never logged.
 *
 * Wall clock, not ticks, for the same reason as lib/restTimer.ts: the screen
 * stops rendering the moment the phone is locked, and a hold with the phone
 * face-down on the floor still has to come back with the right number.
 */

export const LEAD_IN_SECONDS = 5;

export type Hold =
  | { phase: 'leadIn'; goAtMs: number; targetSec: number }
  | { phase: 'running'; startedAtMs: number; pausedMs: number; targetSec: number }
  | {
      phase: 'paused';
      startedAtMs: number;
      pausedMs: number;
      pausedAtMs: number;
      targetSec: number;
    }
  | { phase: 'stopped'; elapsedSec: number; targetSec: number };

/** Start: the lead-in, then the clock. `leadInSec` 0 skips straight to running. */
export function startHold(targetSec: number, nowMs: number, leadInSec = LEAD_IN_SECONDS): Hold {
  const target = Math.max(0, Math.round(targetSec));
  if (leadInSec <= 0)
    return { phase: 'running', startedAtMs: nowMs, pausedMs: 0, targetSec: target };
  return { phase: 'leadIn', goAtMs: nowMs + leadInSec * 1000, targetSec: target };
}

/** Already in position: the clock starts now. */
export function goNow(hold: Hold, nowMs: number): Hold {
  if (hold.phase !== 'leadIn') return hold;
  return { phase: 'running', startedAtMs: nowMs, pausedMs: 0, targetSec: hold.targetSec };
}

/**
 * The lead-in ends on the clock, not on a render: a tick that lands late
 * still starts the hold at the instant the count reached zero.
 */
export function settleHold(hold: Hold, nowMs: number): Hold {
  if (hold.phase === 'leadIn' && nowMs >= hold.goAtMs) {
    return { phase: 'running', startedAtMs: hold.goAtMs, pausedMs: 0, targetSec: hold.targetSec };
  }
  return hold;
}

/** Whole seconds left in the lead-in, rounded up so it never shows 0 early. */
export function leadInRemaining(hold: Hold, nowMs: number): number {
  if (hold.phase !== 'leadIn') return 0;
  return Math.max(0, Math.ceil((hold.goAtMs - nowMs) / 1000));
}

/** Seconds held so far (whole, rounded down while running). */
export function elapsedSeconds(hold: Hold, nowMs: number): number {
  switch (hold.phase) {
    case 'leadIn':
      return 0;
    case 'running':
      return Math.max(0, Math.floor((nowMs - hold.startedAtMs - hold.pausedMs) / 1000));
    case 'paused':
      return Math.max(0, Math.floor((hold.pausedAtMs - hold.startedAtMs - hold.pausedMs) / 1000));
    case 'stopped':
      return hold.elapsedSec;
  }
}

export function pauseHold(hold: Hold, nowMs: number): Hold {
  if (hold.phase !== 'running') return hold;
  return { ...hold, phase: 'paused', pausedAtMs: nowMs };
}

export function resumeHold(hold: Hold, nowMs: number): Hold {
  if (hold.phase !== 'paused') return hold;
  return {
    phase: 'running',
    startedAtMs: hold.startedAtMs,
    pausedMs: hold.pausedMs + Math.max(0, nowMs - hold.pausedAtMs),
    targetSec: hold.targetSec,
  };
}

/** Stop and keep the time: rounded to the nearest second, over or under the target. */
export type StoppedHold = Extract<Hold, { phase: 'stopped' }>;

export function stopHold(hold: Hold, nowMs: number): StoppedHold {
  if (hold.phase === 'stopped') return hold;
  if (hold.phase === 'leadIn')
    return { phase: 'stopped', elapsedSec: 0, targetSec: hold.targetSec };
  const endMs = hold.phase === 'paused' ? hold.pausedAtMs : nowMs;
  const raw = (endMs - hold.startedAtMs - hold.pausedMs) / 1000;
  return { phase: 'stopped', elapsedSec: Math.max(0, Math.round(raw)), targetSec: hold.targetSec };
}

/** Seconds past the target (0 until it is reached). */
export function overTarget(hold: Hold, nowMs: number): number {
  return Math.max(0, elapsedSeconds(hold, nowMs) - hold.targetSec);
}

/** The ring's fill, 0 to 1, full at the target and after. */
export function ringProgress(hold: Hold, nowMs: number): number {
  if (hold.phase === 'leadIn') {
    const total = LEAD_IN_SECONDS * 1000;
    return Math.min(1, Math.max(0, 1 - (hold.goAtMs - nowMs) / total));
  }
  if (hold.targetSec <= 0) return 1;
  return Math.min(1, elapsedSeconds(hold, nowMs) / hold.targetSec);
}

export type HoldCue = 'three' | 'two' | 'one' | 'go' | 'target';

/**
 * What crossed between two readings of the clock, oldest first, so the
 * screen can buzz once per cue however uneven its ticks are. The lead-in
 * cues fire on 3, 2, 1 and the longer one at go; `target` fires the moment
 * the hold reaches its target.
 */
export function cuesBetween(hold: Hold, prevMs: number, nowMs: number): HoldCue[] {
  const cues: HoldCue[] = [];
  if (prevMs >= nowMs) return cues;
  if (hold.phase === 'leadIn') {
    for (const [sec, cue] of [
      [3, 'three'],
      [2, 'two'],
      [1, 'one'],
      [0, 'go'],
    ] as const) {
      const at = hold.goAtMs - sec * 1000;
      if (prevMs < at && nowMs >= at) cues.push(cue);
    }
    return cues;
  }
  if (hold.phase === 'running' && hold.targetSec > 0) {
    const at = hold.startedAtMs + hold.pausedMs + hold.targetSec * 1000;
    if (prevMs < at && nowMs >= at) cues.push('target');
  }
  return cues;
}

/** '0:52' */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
