/**
 * Calendar ↔ program-week mapping for workout plans.
 * Program week 1 is anchored to a specific Monday (`weekAnchorMonday` on the plan).
 */

export function getWeekStartMonday(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Local calendar date as YYYY-MM-DD (no timezone shift). */
export function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

/** Parse YYYY-MM-DD as local midnight. */
export function parseLocalYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return new Date(NaN);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalize plan anchor from API (ISO string or YYYY-MM-DD). Invalid values → null (legacy mode).
 */
export function normalizePlanAnchorYmd(raw: string | null | undefined): string | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  const ymd = s.length >= 10 ? s.slice(0, 10) : s;
  if (!YMD_RE.test(ymd)) return null;
  const d = parseLocalYmd(ymd);
  if (Number.isNaN(d.getTime())) return null;
  return ymd;
}

/** Monday of the calendar week that is `weekOffset` weeks after this device's current week. */
export function calendarMondayForOffsetFromToday(weekOffset: number): Date {
  const monday = getWeekStartMonday(new Date());
  monday.setDate(monday.getDate() + weekOffset * 7);
  return monday;
}

export function getCalendarWeekRange(weekOffsetFromThisWeek: number): { start: Date; end: Date } {
  const start = calendarMondayForOffsetFromToday(weekOffsetFromThisWeek);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start, end };
}

/** Max weeks forward from the device’s current calendar week on Plan. */
export const PLAN_CALENDAR_LOOKAHEAD_WEEKS = 7;

/**
 * Max weeks backward from the device’s current calendar week on Plan.
 * Older weeks are still visible in History; this keeps the strip bounded.
 */
export const PLAN_CALENDAR_LOOKBACK_WEEKS = 12;

/**
 * Min/max `selectedWeek` offsets for Plan week arrows.
 * Without an anchor (legacy plans), only the current and future weeks are addressable.
 * With `weekAnchorMonday`, users can go back toward program week 1’s Monday, capped by {@link PLAN_CALENDAR_LOOKBACK_WEEKS}.
 * If the anchor is still in the future, `min` stays `0` so “this week” and the out-of-range banner remain reachable.
 */
export function getPlanCalendarWeekNavigationBounds(anchorYmdRaw: string | null | undefined): {
  min: number;
  max: number;
} {
  const max = PLAN_CALENDAR_LOOKAHEAD_WEEKS;
  const anchorYmd = normalizePlanAnchorYmd(anchorYmdRaw);
  if (!anchorYmd) {
    return { min: 0, max };
  }
  const todayMonday = calendarMondayForOffsetFromToday(0);
  const anchorMonday = parseLocalYmd(anchorYmd);
  todayMonday.setHours(0, 0, 0, 0);
  anchorMonday.setHours(0, 0, 0, 0);
  const diffMs = anchorMonday.getTime() - todayMonday.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  // When the anchor is in the future, diffWeeks > 0: still allow offset 0 (this week) and earlier
  // offsets are not meaningful for "program start", so min stays 0 like legacy.
  // When anchor is this week or in the past, diffWeeks <= 0: min is the strip offset of program week 1’s Monday, capped at -12.
  const min =
    diffWeeks > 0 ? 0 : Math.max(-PLAN_CALENDAR_LOOKBACK_WEEKS, diffWeeks);
  return { min, max };
}

/**
 * Which program week (1-based) should be shown for the given calendar strip offset.
 * `anchorYmd` is the Monday that program week 1 starts on.
 * Legacy: if anchor is missing, behave like before (offset 0 → week 1, offset 1 → week 2, …).
 */
export function programWeekForCalendarOffset(
  selectedWeekOffset: number,
  anchorYmdRaw: string | null | undefined,
  maxProgramWeek: number,
): number | null {
  if (maxProgramWeek < 1) return null;
  const anchorYmd = normalizePlanAnchorYmd(anchorYmdRaw);
  if (!anchorYmd) {
    const w = selectedWeekOffset + 1;
    if (w < 1) return null;
    if (w > maxProgramWeek) return null;
    return w;
  }
  const calMonday = calendarMondayForOffsetFromToday(selectedWeekOffset);
  const anchor = parseLocalYmd(anchorYmd);
  calMonday.setHours(0, 0, 0, 0);
  anchor.setHours(0, 0, 0, 0);
  const diffMs = calMonday.getTime() - anchor.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  const planWeek = diffWeeks + 1;
  if (planWeek < 1) return null;
  if (planWeek > maxProgramWeek) return null;
  return planWeek;
}

/** Program week index for a slot placed on the week that starts on `slotWeekMondayYmd`. */
export function programWeekNumberForSlotWeek(
  anchorYmdRaw: string | null | undefined,
  slotWeekMondayYmd: string,
): number {
  const slotMon = parseLocalYmd(slotWeekMondayYmd);
  if (Number.isNaN(slotMon.getTime())) return 1;
  const anchorYmd = normalizePlanAnchorYmd(anchorYmdRaw);
  const anchor = parseLocalYmd(anchorYmd ?? slotWeekMondayYmd);
  if (Number.isNaN(anchor.getTime())) return 1;
  anchor.setHours(0, 0, 0, 0);
  slotMon.setHours(0, 0, 0, 0);
  const diffWeeks = Math.floor((slotMon.getTime() - anchor.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return diffWeeks + 1;
}
