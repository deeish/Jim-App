import {
  plannedLiftingMinutes,
  STRENGTH_CARDIO_FINISHER_MINUTES,
} from './workout-generator.service';

/**
 * Tier 2g of the 2026-09-16 plan: on a day whose goal appends a cardio
 * finisher, the lifting is planned at the window's midpoint plus the
 * finisher, capped at the window's top, so the finisher rides on spare time
 * instead of taking a lifting slot.
 */
describe('plannedLiftingMinutes', () => {
  it('is the midpoint for a goal with no finisher and for cardio days', () => {
    expect(
      plannedLiftingMinutes({
        durationMin: 30,
        durationMax: 60,
        sessionType: 'strength',
        goal: 'strength',
      }),
    ).toBe(45);
    expect(
      plannedLiftingMinutes({
        durationMin: 30,
        durationMax: 60,
        sessionType: 'cardio',
        goal: 'hybrid',
      }),
    ).toBe(45);
  });

  it('adds the finisher on top inside a wide window', () => {
    expect(
      plannedLiftingMinutes({
        durationMin: 30,
        durationMax: 60,
        sessionType: 'strength',
        goal: 'hybrid',
      }),
    ).toBe(45 + STRENGTH_CARDIO_FINISHER_MINUTES);
    expect(
      plannedLiftingMinutes({
        durationMin: 45,
        durationMax: 75,
        sessionType: 'strength',
        goal: 'fat loss',
      }),
    ).toBe(60 + STRENGTH_CARDIO_FINISHER_MINUTES);
  });

  it('never plans past the top of the window', () => {
    expect(
      plannedLiftingMinutes({
        durationMin: 45,
        durationMax: 45,
        sessionType: 'strength',
        goal: 'hybrid',
      }),
    ).toBe(45);
    expect(
      plannedLiftingMinutes({
        durationMin: 40,
        durationMax: 50,
        sessionType: 'strength',
        goal: 'hybrid',
      }),
    ).toBe(50);
  });
});
