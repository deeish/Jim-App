import {
  PLAN_CALENDAR_LOOKAHEAD_WEEKS,
  PLAN_CALENDAR_LOOKBACK_WEEKS,
  getPlanCalendarWeekNavigationBounds,
  normalizePlanDayOfWeek,
  programWeekForCalendarOffset,
  resolveProgramWeekForCalendarOffset,
} from './planCalendar';

describe('normalizePlanDayOfWeek', () => {
  it('normalizes full names case-insensitively', () => {
    expect(normalizePlanDayOfWeek('monday')).toBe('Monday');
    expect(normalizePlanDayOfWeek('  FRIDAY  ')).toBe('Friday');
  });

  it('normalizes common abbreviations', () => {
    expect(normalizePlanDayOfWeek('mon')).toBe('Monday');
    expect(normalizePlanDayOfWeek('thurs')).toBe('Thursday');
    expect(normalizePlanDayOfWeek('Tue')).toBe('Tuesday');
  });
});

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

describe('resolveProgramWeekForCalendarOffset', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Monday Apr 6, 2026 (local)
    jest.setSystemTime(new Date(2026, 3, 6, 12, 0, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('maps calendar weeks inside an anchored program normally', () => {
    // Anchor last Monday, 4-week program → this week is program week 2.
    expect(resolveProgramWeekForCalendarOffset(0, '2026-03-30', 4)).toEqual({
      status: 'in_program',
      week: 2,
      repeatingLastWeek: false,
    });
    expect(resolveProgramWeekForCalendarOffset(-1, '2026-03-30', 4)).toEqual({
      status: 'in_program',
      week: 1,
      repeatingLastWeek: false,
    });
  });

  it('repeats the last program week once the program window has passed (the P0 cliff)', () => {
    // 1-week plan anchored last Monday: this calendar week used to resolve to null
    // and blank Home/Plan/Workout. Now it clamps to week 1 and flags the repeat.
    expect(resolveProgramWeekForCalendarOffset(0, '2026-03-30', 1)).toEqual({
      status: 'in_program',
      week: 1,
      repeatingLastWeek: true,
    });
    // Multi-week plans clamp (repeat week N), not cycle back to week 1.
    expect(resolveProgramWeekForCalendarOffset(5, '2026-03-30', 4)).toEqual({
      status: 'in_program',
      week: 4,
      repeatingLastWeek: true,
    });
  });

  it('never rolls a future-anchored program backward', () => {
    expect(resolveProgramWeekForCalendarOffset(0, '2026-04-13', 4)).toEqual({
      status: 'before_program',
    });
  });

  it('keeps legacy (anchorless) offset+1 mapping without clamping', () => {
    expect(resolveProgramWeekForCalendarOffset(0, null, 2)).toEqual({
      status: 'in_program',
      week: 1,
      repeatingLastWeek: false,
    });
    expect(resolveProgramWeekForCalendarOffset(2, null, 2)).toEqual({ status: 'out_of_program' });
    expect(resolveProgramWeekForCalendarOffset(-1, null, 2)).toEqual({ status: 'out_of_program' });
  });

  it('treats an empty program as out of program', () => {
    expect(resolveProgramWeekForCalendarOffset(0, '2026-03-30', 0)).toEqual({
      status: 'out_of_program',
    });
  });
});

describe('programWeekForCalendarOffset (strict)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 3, 6, 12, 0, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('still returns null outside the native program window (no clamping)', () => {
    expect(programWeekForCalendarOffset(0, '2026-03-30', 1)).toBeNull();
    expect(programWeekForCalendarOffset(0, '2026-04-13', 4)).toBeNull();
    expect(programWeekForCalendarOffset(0, '2026-03-30', 4)).toBe(2);
    expect(programWeekForCalendarOffset(0, null, 2)).toBe(1);
    expect(programWeekForCalendarOffset(3, null, 2)).toBeNull();
  });
});
