import {
  PLAN_CALENDAR_LOOKAHEAD_WEEKS,
  PLAN_CALENDAR_LOOKBACK_WEEKS,
  getPlanCalendarWeekNavigationBounds,
} from './planCalendar';

describe('getPlanCalendarWeekNavigationBounds', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Monday Apr 6, 2026 (local)
    jest.setSystemTime(new Date(2026, 3, 6, 12, 0, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('without anchor keeps min at 0 (legacy strip)', () => {
    expect(getPlanCalendarWeekNavigationBounds(null)).toEqual({
      min: 0,
      max: PLAN_CALENDAR_LOOKAHEAD_WEEKS,
    });
    expect(getPlanCalendarWeekNavigationBounds(undefined)).toEqual({
      min: 0,
      max: PLAN_CALENDAR_LOOKAHEAD_WEEKS,
    });
  });

  it('with anchor allows back to program start Monday, not past lookback cap', () => {
    // Anchor one week before this Monday → min offset -1
    expect(getPlanCalendarWeekNavigationBounds('2026-03-30')).toEqual({
      min: -1,
      max: PLAN_CALENDAR_LOOKAHEAD_WEEKS,
    });
  });

  it('caps backward navigation at PLAN_CALENDAR_LOOKBACK_WEEKS', () => {
    // 20 weeks before Apr 6, 2026 Monday
    expect(getPlanCalendarWeekNavigationBounds('2025-11-17')).toEqual({
      min: -PLAN_CALENDAR_LOOKBACK_WEEKS,
      max: PLAN_CALENDAR_LOOKAHEAD_WEEKS,
    });
  });

  it('when program anchor is in the future, min stays 0 so this week is still reachable', () => {
    // Two Mondays after Apr 6, 2026
    expect(getPlanCalendarWeekNavigationBounds('2026-04-20')).toEqual({
      min: 0,
      max: PLAN_CALENDAR_LOOKAHEAD_WEEKS,
    });
  });
});
