/**
 * Calendar ↔ program-week mapping for workout plans.
 * Program week 1 is anchored to a specific Monday (`weekAnchorMonday` on the plan).
 */

/** English weekday names matching API `dayOfWeek` / Plan columns (week starts Monday). */
export const PLAN_WEEKDAY_NAMES_MONDAY_FIRST = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

/**
 * Local calendar weekday as an English name (`Monday`–`Sunday`), ISO-style week (Monday first).
 * Prefer this over `toLocaleDateString` so lookups match `dayOfWeek` regardless of device locale.
 */
export function planWeekdayNameLocal(d: Date = new Date()): string {
  const dow = d.getDay(); // 0 Sunday .. 6 Saturday
  const idx = dow === 0 ? 6 : dow - 1;
  return PLAN_WEEKDAY_NAMES_MONDAY_FIRST[idx];
}

type PlanDayCanon = (typeof PLAN_WEEKDAY_NAMES_MONDAY_FIRST)[number];

function buildPlanDayLookup(): Map<string, PlanDayCanon> {
  const m = new Map<string, PlanDayCanon>();
  for (const d of PLAN_WEEKDAY_NAMES_MONDAY_FIRST) {
    m.set(d.toLowerCase(), d);
  }
  const abbrevs: [string, PlanDayCanon][] = [
    ['mon', 'Monday'],
    ['tue', 'Tuesday'],
    ['tues', 'Tuesday'],
    ['wed', 'Wednesday'],
    ['weds', 'Wednesday'],
    ['thu', 'Thursday'],
    ['thur', 'Thursday'],
    ['thurs', 'Thursday'],
    ['fri', 'Friday'],
    ['sat', 'Saturday'],
    ['sun', 'Sunday'],
  ];
  for (const [k, v] of abbrevs) {
    m.set(k, v);
  }
  return m;
}

const PLAN_DAY_LOWER = buildPlanDayLookup();

/** Program week index for calendar mapping and grid keys; non-finite or < 1 → 1 (bad legacy rows). */
export function normalizeProgramWeekNumber(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

/**
 * Canonical English weekday matching plan columns (`Monday`–`Sunday`). Trims and case-folds.
 * Unknown values return trimmed `raw` so callers can still bucket odd API keys if needed.
 */
export function normalizePlanDayOfWeek(raw: string | null | undefined): string {
  if (raw == null) return '';
  const t = String(raw).trim();
  if (!t) return '';
  return PLAN_DAY_LOWER.get(t.toLowerCase()) ?? t;
}

/** Matches generator/API rest placeholders; case-insensitive so Home and Plan stay aligned. */
export function isRestPlanSlotTitle(title: string | null | undefined): boolean {
  return String(title ?? '').trim().toLowerCase() === 'rest day';
}

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

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Whole calendar weeks from `from` to `to` (both local-midnight week Mondays).
 * Monday-to-Monday spans are only ever a whole number of weeks ± the DST hour,
 * so round: with floor, a spring-forward week (7d − 1h) mapped to the previous
 * program week for its entire duration.
 */
export function wholeWeeksBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / WEEK_MS);
}

/**
 * Calendar-week offset (0 = the device's current week) where program week 1
 * sits; null without a valid anchor. A future anchor gives a positive
 * offset — Plan uses this to land a just-applied program on its first real
 * week instead of the empty pre-start week (apply a Mon/Tue/… template on a
 * Thursday and week 1 anchors to NEXT Monday; the current week has nothing
 * to show).
 */
export function calendarOffsetOfProgramWeek1(
  anchorYmdRaw: string | null | undefined,
  today: Date = new Date(),
): number | null {
  const anchorYmd = normalizePlanAnchorYmd(anchorYmdRaw);
  if (!anchorYmd) return null;
  const todayMonday = getWeekStartMonday(today);
  // Anchors are Mondays by construction; normalizing defensively costs nothing.
  const anchorMonday = getWeekStartMonday(parseLocalYmd(anchorYmd));
  return wholeWeeksBetween(todayMonday, anchorMonday);
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
 *
 * `maxProgramWeek` extends the forward bound to the program's final week: a
 * hard {@link PLAN_CALENDAR_LOOKAHEAD_WEEKS} cap made week 8 of an 8-week
 * program starting next Monday unreachable until real time caught up.
 */
export function getPlanCalendarWeekNavigationBounds(
  anchorYmdRaw: string | null | undefined,
  maxProgramWeek: number = 1,
): {
  min: number;
  max: number;
} {
  const programWeeks = normalizeProgramWeekNumber(maxProgramWeek);
  const anchorYmd = normalizePlanAnchorYmd(anchorYmdRaw);
  if (!anchorYmd) {
    // Legacy mapping is offset + 1 → program week, so the final week sits at
    // offset programWeeks − 1.
    return { min: 0, max: Math.max(PLAN_CALENDAR_LOOKAHEAD_WEEKS, programWeeks - 1) };
  }
  const todayMonday = calendarMondayForOffsetFromToday(0);
  const anchorMonday = parseLocalYmd(anchorYmd);
  todayMonday.setHours(0, 0, 0, 0);
  anchorMonday.setHours(0, 0, 0, 0);
  const diffWeeks = wholeWeeksBetween(todayMonday, anchorMonday);
  // When the anchor is in the future, diffWeeks > 0: still allow offset 0 (this week) and earlier
  // offsets are not meaningful for "program start", so min stays 0 like legacy.
  // When anchor is this week or in the past, diffWeeks <= 0: min is the strip offset of program week 1’s Monday, capped at -12.
  const min =
    diffWeeks > 0 ? 0 : Math.max(-PLAN_CALENDAR_LOOKBACK_WEEKS, diffWeeks);
  // Program week w's Monday sits at offset diffWeeks + (w − 1).
  const max = Math.max(PLAN_CALENDAR_LOOKAHEAD_WEEKS, diffWeeks + programWeeks - 1);
  return { min, max };
}

/**
 * Last program week reachable from week 1 without a gap (a week counts as
 * present when at least one slot row carries its number). A one-off workout
 * added to a far-future calendar week creates an isolated week number
 * ({1, 5} → 1), and repeating that sparse tail week forever after the program
 * ends would look broken. Falls back to the max present week when week 1
 * itself is missing, and 1 for empty input.
 */
export function lastContiguousProgramWeek(weekNumbers: Iterable<number>): number {
  const present = new Set<number>();
  let max = 0;
  for (const n of weekNumbers) {
    const w = normalizeProgramWeekNumber(n);
    present.add(w);
    if (w > max) max = w;
  }
  if (max === 0) return 1;
  let k = 0;
  while (present.has(k + 1)) k += 1;
  return k >= 1 ? k : max;
}

/** How a calendar week relates to the program window. */
export type ProgramWeekResolution =
  | {
      status: 'in_program';
      /** 1-based program week whose schedule applies to this calendar week. */
      week: number;
      /**
       * True when the calendar week falls past the program window and `week` is
       * the repeat target: the plan keeps repeating that week instead of going blank.
       */
      repeatingLastWeek: boolean;
    }
  /** Anchored plan whose start Monday is still in the future — never roll backward. */
  | { status: 'before_program' }
  /** No mappable week: empty plan, or a legacy (anchorless) plan outside offset+1 range. */
  | { status: 'out_of_program' };

/**
 * Resolve which program week's schedule applies to the given calendar strip offset.
 *
 * Anchored plans clamp past the program end (`repeatingLastWeek: true`) so a
 * finished 1-week plan behaves as a recurring weekly routine rather than every
 * surface going blank the next calendar week. Callers pass `repeatWeek`
 * (typically {@link lastContiguousProgramWeek}) so an isolated far-future week
 * number doesn't become the routine; omitted, the clamp targets `maxProgramWeek`.
 * Legacy plans (no anchor) keep the historical offset+1 mapping and never expire
 * at offset 0, so they are left untouched. Weeks before an anchored start stay
 * unresolved (`before_program`).
 */
export function resolveProgramWeekForCalendarOffset(
  selectedWeekOffset: number,
  anchorYmdRaw: string | null | undefined,
  maxProgramWeek: number,
  repeatWeek?: number,
): ProgramWeekResolution {
  if (maxProgramWeek < 1) return { status: 'out_of_program' };
  const anchorYmd = normalizePlanAnchorYmd(anchorYmdRaw);
  if (!anchorYmd) {
    const w = selectedWeekOffset + 1;
    if (w < 1 || w > maxProgramWeek) return { status: 'out_of_program' };
    return { status: 'in_program', week: w, repeatingLastWeek: false };
  }
  const calMonday = calendarMondayForOffsetFromToday(selectedWeekOffset);
  const anchor = parseLocalYmd(anchorYmd);
  calMonday.setHours(0, 0, 0, 0);
  anchor.setHours(0, 0, 0, 0);
  const planWeek = wholeWeeksBetween(anchor, calMonday) + 1;
  if (planWeek < 1) return { status: 'before_program' };
  if (planWeek > maxProgramWeek) {
    const target = Math.min(
      Math.max(normalizeProgramWeekNumber(repeatWeek ?? maxProgramWeek), 1),
      maxProgramWeek,
    );
    return { status: 'in_program', week: target, repeatingLastWeek: true };
  }
  return { status: 'in_program', week: planWeek, repeatingLastWeek: false };
}

/**
 * Which program week (1-based) should be shown for the given calendar strip offset —
 * strict variant of {@link resolveProgramWeekForCalendarOffset}: `null` for anything
 * not natively inside the program window (no roll-forward clamping).
 */
export function programWeekForCalendarOffset(
  selectedWeekOffset: number,
  anchorYmdRaw: string | null | undefined,
  maxProgramWeek: number,
): number | null {
  const r = resolveProgramWeekForCalendarOffset(selectedWeekOffset, anchorYmdRaw, maxProgramWeek);
  return r.status === 'in_program' && !r.repeatingLastWeek ? r.week : null;
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
  return wholeWeeksBetween(anchor, slotMon) + 1;
}
