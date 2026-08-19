/**
 * The Calendar tab's shared foundation: param list, muscle colour system,
 * plan-day display shapes, local-date helpers and haptics.
 * Month grid → Week list (landing) → Day exercise list → Workout detail.
 * Everything here is pure and side-effect free; data flows through
 * planCalendarPrototypeStore.
 */

import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { RootStackParamList } from '../types/navigation';

/**
 * Param list for the prototype stack. Lives here (not in the navigator) so
 * screens can `import type` it without a screens ↔ navigator cycle.
 *
 * The Calendar tab REPLACED the Plan and Train tabs, so the stack also mounts
 * the real plan screens (templates, generate, history, progress, saved-workout
 * detail) — their route names/params are picked straight from the old Plan
 * stack's param list. `PlanList` is deliberately ALIASED to the calendar week
 * view: TemplateDetail and PlanPreview reset to `PlanList` after applying a
 * plan, which now lands on "This Week" showing the freshly applied program.
 */
export type PlanCalendarParamList = {
  /** `monthIso`: any date inside the month to display (default: today's). */
  PlanCalendarMonth: { monthIso?: string } | undefined;
  /** No param = the current week (the tab's landing state). */
  PlanCalendarWeek: { weekMondayIso?: string } | undefined;
  PlanCalendarDay: { dateIso: string };
  /** `exerciseIndex` is the slot in the day (survives a replace); the name is
   *  display-only for the header title. */
  PlanCalendarWorkout: { dateIso: string; exerciseIndex: number; exerciseName: string };
  /** The library-as-picker sheet: replace one slot or multi-add to the day. */
  PlanCalendarExercisePicker:
    | { dateIso: string; mode: 'replace'; exerciseIndex: number }
    | { dateIso: string; mode: 'add' };
} & Pick<
  RootStackParamList,
  | 'PlanList'
  | 'History'
  | 'Progress'
  | 'Templates'
  | 'TemplateDetail'
  | 'GeneratePlan'
  | 'PlanPreview'
  | 'WorkoutDetail'
  | 'ExerciseDetail'
>;

/**
 * SF Pro on every platform that has it. iOS/macOS render the system font (SF)
 * with no fontFamily at all; this spread only matters on web, where the
 * `-apple-system` stack picks SF on Apple devices and falls back gracefully.
 */
export const sfPro: { fontFamily?: string } = Platform.select({
  web: {
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', 'Segoe UI', Roboto, sans-serif",
  },
  default: {},
}) as { fontFamily?: string };

// ---------------------------------------------------------------------------
// Muscle colour coding
// ---------------------------------------------------------------------------

export type PrototypeMuscle =
  | 'Chest'
  | 'Back'
  | 'Shoulders'
  | 'Biceps'
  | 'Triceps'
  | 'Quads'
  | 'Hamstrings'
  | 'Glutes'
  | 'Calves'
  | 'Core'
  | 'Cardio'
  | 'Forearms';

/**
 * One vibrant hue per muscle — the SINGLE source of truth for every view
 * (week chips, month dots, day blocks, detail accents, replace picker).
 * Calendar surfaces render it through muscleGradient (the E2 Bright fade);
 * the hue itself stays the spec value. The mapping is the design spec verbatim
 * (chest=salmon red, tris=pure orange, shoulders=light blue, back=lime
 * green, biceps=electric blue, quads=red, glutes=pink, hamstrings=purple,
 * calves=deep orange/coral, core=dark charcoal, cardio=white,
 * forearms=vibrant yellow), with each non-explicit tone pushed vibrant.
 */
export const MUSCLE_COLORS: Record<PrototypeMuscle, string> = {
  Chest: '#FF6F61', // salmon red
  Triceps: '#FF8A00', // pure orange
  Shoulders: '#38B6FF', // light blue
  Back: '#7ED321', // lime green
  Biceps: '#0A6BFF', // electric blue
  Quads: '#FF3B30', // red
  Glutes: '#FF2D92', // pink
  Hamstrings: '#A742F5', // purple
  Calves: '#FF6B35', // deep orange / coral
  Core: '#36454F', // dark charcoal
  Cardio: '#FFFFFF', // white
  Forearms: '#FFD60A', // vibrant yellow
};

/**
 * Text ink on a solid muscle fill. White wherever it holds up; the light
 * fills (light blue, lime, white, yellow) flip to a near-black ink because
 * white on them is unreadable — "make text white if needed", not "always".
 */
export const MUSCLE_INK: Record<PrototypeMuscle, string> = {
  Chest: '#FFFFFF',
  Triceps: '#FFFFFF',
  Shoulders: '#1C1C1E',
  Back: '#1C1C1E',
  Biceps: '#FFFFFF',
  Quads: '#FFFFFF',
  Glutes: '#FFFFFF',
  Hamstrings: '#FFFFFF',
  Calves: '#FFFFFF',
  Core: '#FFFFFF',
  Cardio: '#1C1C1E',
  Forearms: '#1C1C1E',
};

/**
 * Hairline edge for fills that would otherwise vanish into the page — only
 * Cardio's white needs one; everything else stays borderless (transparent).
 * Apply as `borderWidth: 1, borderColor: MUSCLE_EDGE[m]` wherever a solid
 * muscle fill (block, chip, dot) is drawn.
 */
export const MUSCLE_EDGE: Record<PrototypeMuscle, string> = {
  Chest: 'transparent',
  Triceps: 'transparent',
  Shoulders: 'transparent',
  Back: 'transparent',
  Biceps: 'transparent',
  Quads: 'transparent',
  Glutes: 'transparent',
  Hamstrings: 'transparent',
  Calves: 'transparent',
  Core: 'transparent',
  Cardio: '#C6C6C8',
  Forearms: 'transparent',
};

/**
 * The "E2 Bright" muscle gradient Dylan picked from the 2026-08-15 mockup
 * rounds: the pure muscle colour fading lighter across the surface, no dark
 * end. Started on the day cards, now the ONE treatment for every muscle
 * fill on the calendar (day cards, week chips, month dots, legend). Ink
 * stays MUSCLE_INK — text sits on the full-colour corner, exactly the
 * surface the ink map was tuned for.
 */
export function muscleGradient(m: PrototypeMuscle): [string, string] {
  return [MUSCLE_COLORS[m], mixWithWhite(MUSCLE_COLORS[m], 0.62)];
}

/** #RRGGBB mixed toward white; `colorFraction` is how much colour survives. */
export function mixWithWhite(hex: string, colorFraction: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (c: number) =>
    Math.round(c * colorFraction + 255 * (1 - colorFraction))
      .toString(16)
      .padStart(2, '0');
  return `#${channel((n >> 16) & 0xff)}${channel((n >> 8) & 0xff)}${channel(n & 0xff)}`;
}

/** Frosted muscle-chip fill on a gradient day card. Cardio's card is
 *  white-on-white, so its chip frosts dark instead of disappearing. */
export function muscleChipFrost(m: PrototypeMuscle): string {
  return m === 'Cardio' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.32)';
}

/** Set-complete gold: check button, the completion outline, finished-set cards. */
export const GOLD = '#F5A623';

// ⚠ Strength calibrated on-device (2026-08-15, build 23): the Light-impact and
// selection tiers were reported as imperceptible in real use, so every moment
// runs one tier stronger than the "textbook" iOS mapping. Don't quietly walk
// these back down without another on-device pass.

/** Baseline tap for ordinary presses (cards, rows, pills, chevrons) — the
 *  2026-08-18 "haptics on everything" pass. Light: present on every touch
 *  without competing with the Medium/Heavy moments below. */
export function buzzTap(): void {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Tap on each completed set — Medium, because Light didn't register. */
export function buzzSetComplete(): void {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/** Success buzz when the whole exercise is finished. */
export function buzzAllSetsComplete(): void {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** Crisp tick for selection moments (scope-bar slides, page turns). Rigid
 *  impact, not `selectionAsync` — the system selection tick is the faintest
 *  haptic iOS has and was unnoticeable in real use. */
export function buzzSelection(): void {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
}

/** Heavy thump when a long-press surfaces a menu — the native context-menu feel. */
export function buzzMenuOpen(): void {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
}

/** Tap confirming a swap/add landed on the day — Medium, same reason as sets. */
export function buzzEditApplied(): void {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/** Rest timer done — attention pattern, distinct from the Success double-tap,
 *  strong enough to register with the phone face-down between sets. */
export function buzzRestOver(): void {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

// ---------------------------------------------------------------------------
// Plan day shapes
// ---------------------------------------------------------------------------

export type PlannedExercise = {
  name: string;
  muscle: PrototypeMuscle;
  /** Catalog id — powers the Exercise Guide link and plan persistence. */
  exerciseId?: string;
  sets: number;
  /** Display string, e.g. '8–10'. */
  reps: string;
  /** Display string incl. unit, e.g. '155 lb' or 'Bodyweight'. */
  weight: string;
  /** Rest between sets, mm:ss display string. */
  rest: string;
  equipment: string;
  note: string;
};

export type PlannedDay = {
  weekday: string;
  /** 'Push Day', 'Rest Day', … */
  title: string;
  exercises: PlannedExercise[];
};

export const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

/** Ordered unique muscles trained on a day (chip rows, calendar dots). */
export function dayMuscles(day: PlannedDay): PrototypeMuscle[] {
  const seen = new Set<PrototypeMuscle>();
  const out: PrototypeMuscle[] = [];
  for (const ex of day.exercises) {
    if (!seen.has(ex.muscle)) {
      seen.add(ex.muscle);
      out.push(ex.muscle);
    }
  }
  return out;
}

/** The exercise catalog's coarser muscle-group vocabulary for a palette muscle. */
export function catalogGroupForMuscle(m: PrototypeMuscle): string {
  switch (m) {
    case 'Chest':
      return 'Chest';
    case 'Back':
      return 'Back';
    case 'Shoulders':
      return 'Shoulders';
    case 'Core':
      return 'Core';
    case 'Cardio':
      return 'Cardio';
    case 'Biceps':
    case 'Triceps':
    case 'Forearms':
      return 'Arms';
    default:
      return 'Legs';
  }
}

// ---------------------------------------------------------------------------
// Local-date helpers (the app's convention: days are LOCAL days, weeks start
// Monday — matches progressStats/planCalendar)
// ---------------------------------------------------------------------------

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD to LOCAL midnight (never UTC — avoids off-by-one days). */
export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Monday-first weekday index: Monday=0 … Sunday=6. */
export function weekdayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function mondayOf(d: Date): Date {
  return addDays(d, -weekdayIndex(d));
}

export function todayIso(): string {
  return toIso(new Date());
}

export function isToday(iso: string): boolean {
  return iso === todayIso();
}

export function isCurrentWeek(mondayIso: string): boolean {
  return mondayIso === toIso(mondayOf(new Date()));
}

/** 'Aug 13' */
export function shortDate(d: Date): string {
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

/** 'Mon' for a YYYY-MM-DD date. */
export function shortWeekday(iso: string): string {
  return WEEKDAYS[weekdayIndex(fromIso(iso))].slice(0, 3);
}

// ---------------------------------------------------------------------------
// Missed-day rescue (pure date logic; state lives in the store)
// ---------------------------------------------------------------------------

/** Misses older than this stay quiet history — no pill, no banner, no sheet. */
export const RESCUE_WINDOW_DAYS = 7;

/**
 * A PAST day close enough to rescue: strictly before today, and no more than
 * RESCUE_WINDOW_DAYS back. Compares ISO strings (same format ⇒ lexicographic
 * order is date order). Today itself is never "missed".
 */
export function isWithinRescueWindow(dateIso: string, todayIsoStr: string): boolean {
  const cutoff = toIso(addDays(fromIso(todayIsoStr), -RESCUE_WINDOW_DAYS));
  return dateIso < todayIsoStr && dateIso >= cutoff;
}

/** Today plus the next `count - 1` days — the move picker's candidate rows. */
export function upcomingDatesFrom(todayIsoStr: string, count = 7): string[] {
  const start = fromIso(todayIsoStr);
  return Array.from({ length: count }, (_, i) => toIso(addDays(start, i)));
}

/** 'today' or the 3-letter weekday — the "Moved to X ›" caption. */
export function movedToLabel(targetIso: string, todayIsoStr: string): string {
  return targetIso === todayIsoStr ? 'today' : shortWeekday(targetIso);
}

/**
 * The make-room step's "send it to the nearest open day" suggestion: of the
 * open candidates, the one closest to `aroundIso` (ties go to the later
 * date — forward beats backward when equally near). Null when nothing is
 * open.
 */
export function nearestOpenIso(
  days: Array<{ dateIso: string; open: boolean }>,
  aroundIso: string,
): string | null {
  const around = fromIso(aroundIso).getTime();
  let best: string | null = null;
  let bestDist = Infinity;
  for (const day of days) {
    if (!day.open) continue;
    const dist = Math.abs(fromIso(day.dateIso).getTime() - around);
    if (dist < bestDist || (dist === bestDist && best != null && day.dateIso > best)) {
      best = day.dateIso;
      bestDist = dist;
    }
  }
  return best;
}

/** 'August 2026' */
export function monthLabel(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** 'Aug 17–23' within one month, 'Aug 31 – Sep 6' across a boundary. */
export function weekRangeLabel(mondayIso: string): string {
  const mon = fromIso(mondayIso);
  const sun = addDays(mon, 6);
  if (mon.getMonth() === sun.getMonth()) {
    return `${shortDate(mon)}–${sun.getDate()}`;
  }
  return `${shortDate(mon)} – ${shortDate(sun)}`;
}

/** Header title for the Week screen. */
export function weekTitle(mondayIso?: string): string {
  if (!mondayIso || isCurrentWeek(mondayIso)) return 'This Week';
  return weekRangeLabel(mondayIso);
}

/**
 * Monday-first week rows covering a month. Leading/trailing cells belong to
 * the adjacent months (rendered dimmed, like the iOS Calendar month grid).
 */
export function monthGrid(monthDate: Date): Date[][] {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const last = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const weeks: Date[][] = [];
  for (let cur = mondayOf(first); cur <= last; cur = addDays(cur, 7)) {
    weeks.push([0, 1, 2, 3, 4, 5, 6].map((i) => addDays(cur, i)));
  }
  return weeks;
}
