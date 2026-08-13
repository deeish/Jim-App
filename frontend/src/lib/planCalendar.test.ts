import {
  PLAN_CALENDAR_LOOKAHEAD_WEEKS,
  PLAN_CALENDAR_LOOKBACK_WEEKS,
  calendarOffsetOfProgramWeek1,
  getPlanCalendarWeekNavigationBounds,
  lastContiguousProgramWeek,
  normalizePlanDayOfWeek,
  programWeekForCalendarOffset,
  resolveProgramWeekForCalendarOffset,
  wholeWeeksBetween,
} from './planCalendar';

describe('calendarOffsetOfProgramWeek1', () => {
  // Thursday 2026-08-13 — the exact repro: template applied midweek anchors
  // week 1 to NEXT Monday.
  const thursday = new Date(2026, 7, 13);

  it('a future anchor is a positive offset (the auto-jump case)', () => {
    expect(calendarOffsetOfProgramWeek1('2026-08-17', thursday)).toBe(1);
    expect(calendarOffsetOfProgramWeek1('2026-08-24', thursday)).toBe(2);
  });

  it('an anchor in the current week is offset 0 (no jump)', () => {
    expect(calendarOffsetOfProgramWeek1('2026-08-10', thursday)).toBe(0);
    // Mid-week anchor values normalize to their own week's Monday.
    expect(calendarOffsetOfProgramWeek1('2026-08-13', thursday)).toBe(0);
  });

  it('a past anchor is negative (running plans never jump)', () => {
    expect(calendarOffsetOfProgramWeek1('2026-08-03', thursday)).toBe(-1);
  });

  it('missing or invalid anchors return null', () => {
    expect(calendarOffsetOfProgramWeek1(null, thursday)).toBeNull();
    expect(calendarOffsetOfProgramWeek1(undefined, thursday)).toBeNull();
    expect(calendarOffsetOfProgramWeek1('not-a-date', thursday)).toBeNull();
  });
});

describe('wholeWeeksBetween', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const HOUR_MS = 60 * 60 * 1000;
  const at = (ms: number) => new Date(ms);

  it('counts exact Monday-to-Monday spans', () => {
    expect(wholeWeeksBetween(at(0), at(0))).toBe(0);
    expect(wholeWeeksBetween(at(0), at(7 * DAY_MS))).toBe(1);
    expect(wholeWeeksBetween(at(0), at(21 * DAY_MS))).toBe(3);
    expect(wholeWeeksBetween(at(7 * DAY_MS), at(0))).toBe(-1);
  });

  it('absorbs the DST hour in both directions (floor mapped a whole spring-forward week wrong)', () => {
    // Spring forward: local Monday-midnight to next Monday-midnight is 7d − 1h.
    expect(wholeWeeksBetween(at(0), at(7 * DAY_MS - HOUR_MS))).toBe(1);
    // Fall back: 7d + 1h.
    expect(wholeWeeksBetween(at(0), at(7 * DAY_MS + HOUR_MS))).toBe(1);
    // Same, looking backward across fall-back (floor gave -2 here).
    expect(wholeWeeksBetween(at(7 * DAY_MS + HOUR_MS), at(0))).toBe(-1);
    // Multi-week span crossing one transition.
    expect(wholeWeeksBetween(at(0), at(28 * DAY_MS - HOUR_MS))).toBe(4);
  });
});

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

  it('extends max so the final week of a program starting next Monday is reachable', () => {
    // Anchor next Monday (+1); an 8-week program's final week sits at offset 1 + 7 = 8,
    // one past the flat 7-week lookahead that used to strand it.
    expect(getPlanCalendarWeekNavigationBounds('2026-04-13', 8)).toEqual({
      min: 0,
      max: 8,
    });
  });

  it('keeps the flat lookahead when the program end is already within it', () => {
    // Anchor 6 weeks back: week 8 sits at offset -6 + 7 = 1, well inside the default 7.
    expect(getPlanCalendarWeekNavigationBounds('2026-02-23', 8)).toEqual({
      min: -6,
      max: PLAN_CALENDAR_LOOKAHEAD_WEEKS,
    });
  });

  it('reaches the end of a long program anchored this week', () => {
    // 16-week program starting this Monday: final week at offset 15.
    expect(getPlanCalendarWeekNavigationBounds('2026-04-06', 16)).toEqual({
      min: 0,
      max: 15,
    });
  });

  it('extends the legacy (anchorless) strip to the final program week', () => {
    // Legacy mapping is offset + 1 → week, so a 10-week plan needs offset 9.
    expect(getPlanCalendarWeekNavigationBounds(null, 10)).toEqual({
      min: 0,
      max: 9,
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

  it('repeats the given repeatWeek, not the max week, past the program end', () => {
    // Weeks {1, 5}: one workout added far in the future made maxProgramWeek 5,
    // but the routine to repeat is week 1.
    expect(resolveProgramWeekForCalendarOffset(6, '2026-03-30', 5, 1)).toEqual({
      status: 'in_program',
      week: 1,
      repeatingLastWeek: true,
    });
    // Inside the window repeatWeek is ignored: week 5 still shows its own schedule.
    expect(resolveProgramWeekForCalendarOffset(3, '2026-03-30', 5, 1)).toEqual({
      status: 'in_program',
      week: 5,
      repeatingLastWeek: false,
    });
    // Out-of-range repeatWeek clamps into the program window.
    expect(resolveProgramWeekForCalendarOffset(6, '2026-03-30', 5, 9)).toEqual({
      status: 'in_program',
      week: 5,
      repeatingLastWeek: true,
    });
  });
});

describe('lastContiguousProgramWeek', () => {
  it('returns the last week of the run starting at week 1', () => {
    expect(lastContiguousProgramWeek([1])).toBe(1);
    expect(lastContiguousProgramWeek([1, 2, 3])).toBe(3);
    expect(lastContiguousProgramWeek([3, 1, 2, 2])).toBe(3);
  });

  it('ignores isolated week numbers past a gap', () => {
    expect(lastContiguousProgramWeek([1, 5])).toBe(1);
    expect(lastContiguousProgramWeek([1, 2, 6, 9])).toBe(2);
  });

  it('falls back to the max week when week 1 is missing, and 1 when empty', () => {
    expect(lastContiguousProgramWeek([3, 5])).toBe(5);
    expect(lastContiguousProgramWeek([])).toBe(1);
  });

  it('normalizes bad week numbers like the rest of the calendar math', () => {
    expect(lastContiguousProgramWeek([0, -2, 2])).toBe(2); // <1 → 1
    expect(lastContiguousProgramWeek([NaN, 2])).toBe(2);
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
