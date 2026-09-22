import { makeRestTimer } from './restTimer';
import {
  restEndedWhileAway,
  restNudgeBody,
  shouldOfferRestNudge,
  shouldScheduleRestNudge,
} from './restNudgeRules';

const T0 = 1_000_000;

describe('restNudgeRules: when the rest-over nudge is offered and scheduled (#55)', () => {
  const timer = makeRestTimer(120, T0)!;

  it('a rest ended while away only when the app left before the end and came back after it', () => {
    expect(restEndedWhileAway(timer, T0 + 30_000, T0 + 130_000)).toBe(true);
    // Came back with time still on the clock: the screen shows the end itself.
    expect(restEndedWhileAway(timer, T0 + 30_000, T0 + 90_000)).toBe(false);
    // Left after the rest was already over: nothing was missed.
    expect(restEndedWhileAway(timer, T0 + 125_000, T0 + 200_000)).toBe(false);
    expect(restEndedWhileAway(timer, null, T0 + 130_000)).toBe(false);
    expect(restEndedWhileAway(null, T0, T0 + 130_000)).toBe(false);
  });

  it('offers once, only when unasked, only after a missed end, only where the module exists', () => {
    const base = {
      status: 'unasked' as const,
      endedWhileAway: true,
      offeredThisSession: false,
      available: true,
    };
    expect(shouldOfferRestNudge(base)).toBe(true);
    expect(shouldOfferRestNudge({ ...base, status: 'declined' })).toBe(false);
    expect(shouldOfferRestNudge({ ...base, status: 'granted' })).toBe(false);
    expect(shouldOfferRestNudge({ ...base, endedWhileAway: false })).toBe(false);
    expect(shouldOfferRestNudge({ ...base, offeredThisSession: true })).toBe(false);
    expect(shouldOfferRestNudge({ ...base, available: false })).toBe(false);
  });

  it('schedules only for a granted phone and a rest still ahead', () => {
    expect(shouldScheduleRestNudge('granted', timer, T0 + 10_000)).toBe(true);
    expect(shouldScheduleRestNudge('granted', timer, T0 + 130_000)).toBe(false);
    expect(shouldScheduleRestNudge('unasked', timer, T0)).toBe(false);
    expect(shouldScheduleRestNudge('declined', timer, T0)).toBe(false);
    expect(shouldScheduleRestNudge('granted', null, T0)).toBe(false);
  });

  it('names the set the rest belongs to', () => {
    expect(restNudgeBody(3, 4, 'Flat Barbell Bench Press')).toBe(
      'Set 3 of 4 · Flat Barbell Bench Press',
    );
  });
});
