import {
  cuesBetween,
  elapsedSeconds,
  formatClock,
  goNow,
  leadInRemaining,
  LEAD_IN_SECONDS,
  overTarget,
  pauseHold,
  resumeHold,
  ringProgress,
  settleHold,
  startHold,
  stopHold,
} from './holdTimer';

const T0 = 1_000_000;

describe('holdTimer: the stopwatch on a timed set (#58)', () => {
  it('starts with a five-second lead-in that is never logged', () => {
    const h = startHold(45, T0);
    expect(h.phase).toBe('leadIn');
    expect(leadInRemaining(h, T0)).toBe(LEAD_IN_SECONDS);
    expect(leadInRemaining(h, T0 + 2_100)).toBe(3);
    expect(elapsedSeconds(h, T0 + 4_000)).toBe(0);
    // A tick that lands late still starts the clock at the instant the count hit zero.
    const running = settleHold(h, T0 + 5_400);
    expect(running.phase).toBe('running');
    expect(elapsedSeconds(running, T0 + 5_400 + 12_000)).toBe(12);
  });

  it('Go now skips the lead-in; a lead-in of zero skips it too', () => {
    const h = goNow(startHold(45, T0), T0 + 1_000);
    expect(h.phase).toBe('running');
    expect(elapsedSeconds(h, T0 + 1_000 + 3_000)).toBe(3);
    expect(startHold(45, T0, 0).phase).toBe('running');
  });

  it('counts up on the wall clock, so a locked phone comes back right', () => {
    const h = startHold(45, T0, 0);
    expect(elapsedSeconds(h, T0 + 27_400)).toBe(27);
    expect(elapsedSeconds(h, T0 + 120_000)).toBe(120);
  });

  it('keeps counting past the target and names the overshoot', () => {
    const h = startHold(45, T0, 0);
    expect(overTarget(h, T0 + 30_000)).toBe(0);
    expect(overTarget(h, T0 + 52_000)).toBe(7);
    expect(ringProgress(h, T0 + 27_000)).toBe(0.6);
    expect(ringProgress(h, T0 + 60_000)).toBe(1);
  });

  it('pause holds the number; resume does not count the pause', () => {
    const h = startHold(45, T0, 0);
    const paused = pauseHold(h, T0 + 10_000);
    expect(elapsedSeconds(paused, T0 + 25_000)).toBe(10);
    const resumed = resumeHold(paused, T0 + 25_000);
    expect(elapsedSeconds(resumed, T0 + 30_000)).toBe(15);
    expect(stopHold(resumed, T0 + 30_400).elapsedSec).toBe(15);
  });

  it('stop keeps the time, over or under the target, rounded to the second', () => {
    const h = startHold(45, T0, 0);
    expect(stopHold(h, T0 + 30_200).elapsedSec).toBe(30);
    expect(stopHold(h, T0 + 52_600).elapsedSec).toBe(53);
    expect(stopHold(startHold(45, T0), T0 + 2_000).elapsedSec).toBe(0);
    const paused = pauseHold(h, T0 + 20_000);
    expect(stopHold(paused, T0 + 90_000).elapsedSec).toBe(20);
  });

  it('cues fire once each however uneven the ticks: 3, 2, 1, go, then the target', () => {
    const h = startHold(45, T0);
    expect(cuesBetween(h, T0, T0 + 1_000)).toEqual([]);
    expect(cuesBetween(h, T0 + 1_000, T0 + 2_100)).toEqual(['three']);
    // A phone that slept through the count gets every cue it missed, in order.
    expect(cuesBetween(h, T0 + 2_100, T0 + 5_500)).toEqual(['two', 'one', 'go']);
    const running = settleHold(h, T0 + 5_500);
    expect(cuesBetween(running, T0 + 40_000, T0 + 49_000)).toEqual([]);
    expect(cuesBetween(running, T0 + 49_000, T0 + 50_200)).toEqual(['target']);
    expect(cuesBetween(running, T0 + 50_200, T0 + 60_000)).toEqual([]);
    // Nothing fires backwards.
    expect(cuesBetween(h, T0 + 3_000, T0 + 2_000)).toEqual([]);
  });

  it('formats the clock', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(52)).toBe('0:52');
    expect(formatClock(605)).toBe('10:05');
  });
});
