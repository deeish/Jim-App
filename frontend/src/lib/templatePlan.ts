/**
 * Template → plan materialization.
 *
 * Turns a hand-authored plan template (GET /plan-templates/:id) into the
 * exact `CreatePlanBody` the generated-preview Apply flow sends to
 * `POST /plans` — same slot shape, same per-row conventions — so a template
 * plan is saved and materialized by the code path every other plan uses:
 *  - rep rows persist `reps === repsMin` plus the `repsMin`/`repsMax` range,
 *  - time rows persist `reps === durationSeconds` plus `durationSeconds`,
 *  - rest guidance is rendered into the note exactly once ("Rest ~2 min."),
 * mirrored by the backend spec `plan-templates.apply-shape.spec.ts`.
 */

import type { CreatePlanBody, PlanSlot, PlanSlotExercise } from '../services/planService';
import type {
  PlanTemplateDetail,
  TemplateSession,
} from '../services/templateService';
import type { Weekday } from '../types/plan';
import { formatRestSecondsForPreview } from './exercisePrescription';
import { formatLocalYmd, getWeekStartMonday, parseLocalYmd } from './planCalendar';

export const WEEKDAY_ORDER: Weekday[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/** Sort weekdays into Monday-first calendar order. */
export function orderWeekdays(days: Weekday[]): Weekday[] {
  return [...days].sort(
    (a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b),
  );
}

/**
 * The schedulable days/week range for a template. Older backends don't send
 * `supportedDaysPerWeek` (BE-first deploy window) — then the authored count
 * is the only option, which is exactly the pre-adjustability behavior.
 */
export function supportedDayRange(
  template: Pick<PlanTemplateDetail, 'daysPerWeek' | 'supportedDaysPerWeek'>,
): { min: number; max: number } {
  return (
    template.supportedDaysPerWeek ?? {
      min: template.daysPerWeek,
      max: template.daysPerWeek,
    }
  );
}

/**
 * Default training days for a chosen count. The authored count keeps the
 * template's hand-picked defaults; other counts use the standard gym-week
 * layouts (recovery-spaced below 5, consecutive weekdays at 5+).
 */
const DEFAULT_WEEKDAYS_BY_COUNT: Record<number, Weekday[]> = {
  2: ['Monday', 'Thursday'],
  3: ['Monday', 'Wednesday', 'Friday'],
  4: ['Monday', 'Tuesday', 'Thursday', 'Friday'],
  5: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  6: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  7: [...WEEKDAY_ORDER],
};

export function defaultWeekdaysForCount(
  template: Pick<
    PlanTemplateDetail,
    'daysPerWeek' | 'supportedDaysPerWeek' | 'defaultWeekdays'
  >,
  count: number,
): Weekday[] {
  if (count === template.daysPerWeek) return [...template.defaultWeekdays];
  return [...(DEFAULT_WEEKDAYS_BY_COUNT[count] ?? template.defaultWeekdays)];
}

/**
 * Toggle one weekday in a constrained selection. Selecting past the cap is
 * ignored (the day stays unselected) so the picker can never exceed the
 * chosen days/week; deselecting always works.
 */
export function toggleTemplateWeekday(
  selected: Weekday[],
  day: Weekday,
  daysPerWeek: number,
): Weekday[] {
  if (selected.includes(day)) {
    return selected.filter((d) => d !== day);
  }
  if (selected.length >= daysPerWeek) return selected;
  return orderWeekdays([...selected, day]);
}

/**
 * Suggested start date for an anchored program: today, always.
 *
 * This used to push a mid-week sign-up to "next Monday" whenever a chosen
 * training day had already passed this week, to keep week 1 whole — which
 * meant a Tuesday sign-up could be told to wait six days for a first session.
 * `materializeTemplatePlan` now schedules nothing before the start date and
 * keeps the session rotation continuous across the partial first week, so
 * starting today is always clean: the first session lands on the next chosen
 * day (see `firstSessionDateISO`). The picker can still override.
 */
export function suggestedTemplateStartDateISO(
  today: Date = new Date(),
  _weekdays?: readonly Weekday[],
): string {
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  return formatLocalYmd(d);
}

/** Monday-first index (0–6) of a local YYYY-MM-DD. */
function mondayFirstIndexOf(iso: string): number {
  const d = parseLocalYmd(iso);
  return (d.getDay() + 6) % 7;
}

/**
 * The local date of the FIRST session: the first chosen weekday on or after
 * the start date. What the payoff card and the apply sheet print ("First
 * session · Thursday") instead of the start date, which may be a rest day.
 * Null with no weekdays.
 */
export function firstSessionDateISO(
  startDateISO: string,
  weekdays: readonly Weekday[],
): string | null {
  if (weekdays.length === 0) return null;
  const chosen = new Set(weekdays.map((w) => WEEKDAY_ORDER.indexOf(w)));
  const start = parseLocalYmd(startDateISO);
  start.setHours(0, 0, 0, 0);
  for (let offset = 0; offset < 7; offset++) {
    const d = new Date(start);
    d.setDate(start.getDate() + offset);
    if (chosen.has((d.getDay() + 6) % 7)) return formatLocalYmd(d);
  }
  return null;
}

/**
 * Planned session minutes for one week. Mirrors the backend estimator in
 * `backend/src/data/plan-templates/types.ts` (rest-aware: a rep set costs
 * ~40s of work + its prescribed rest; a time set costs duration + rest).
 */
export function estimateTemplateSessionMinutes(
  session: TemplateSession,
  weekIndex0: number,
): number {
  const rows = session.exercises;
  let work = 0;
  for (const ex of rows) {
    const week = ex.weekly[weekIndex0];
    if (!week) continue;
    const perSet =
      week.durationSeconds != null
        ? Math.max(45, week.durationSeconds + ex.restSeconds)
        : Math.min(3.5 * 60, Math.max(60, ex.restSeconds + 40));
    work += (week.sets * perSet) / 60;
  }
  const warmup = 3.5 + Math.min(5.5, rows.length * 0.65);
  const raw = warmup + work + Math.max(0, rows.length - 1) * 1.5;
  const rounded = Math.round(raw / 5) * 5;
  return Math.max(20, Math.min(90, rounded));
}

function templateRowNote(
  baseNote: string | undefined,
  weekNote: string | undefined,
  restSeconds: number,
): string {
  const parts = [
    weekNote ?? baseNote,
    restSeconds > 0 ? `Rest ~${formatRestSecondsForPreview(restSeconds)}.` : '',
  ].filter((x): x is string => !!x && x.trim().length > 0);
  return parts.join(' ');
}

export interface MaterializeTemplateOptions {
  /** Training days, one per template session, Monday-first order. */
  weekdays: Weekday[];
  /** Local YYYY-MM-DD the user wants to start; anchors week 1 to its Monday.
   *  Chosen weekdays BEFORE this date in week 1 get no session. */
  startDateISO: string;
  /** The user's work-arounds ("knees", "lower back", …). The server swaps
   *  flagged exercises for fitting alternatives before saving. */
  limitations?: string[];
  /** The user's equipment (catalog display names, e.g. "Dumbbell"), so the
   *  alternatives the server swaps in are ones they can do. */
  equipment?: string[];
}

/**
 * Build the full `POST /plans` body for a template. Throws if the weekday
 * count is outside the template's supported range — callers gate on the
 * picker, this is the last line of defense.
 *
 * Scheduling is SESSION ROTATION: sessions cycle in authored order across
 * every training day of the block, so any day count inside the supported
 * range keeps the split's order intact (a 6-session PPL at 4 days/week rolls
 * Push→Pull→Legs across week boundaries). At the authored count, from a
 * Monday start, the rotation is exactly the classic one-session-per-weekday
 * layout. Prescriptions stay calendar-anchored: whatever session lands in
 * week 8 gets week 8's deload.
 *
 * Week 1 is PARTIAL when the start date is not a Monday: chosen weekdays
 * before the start date get no session (a session dated before the day the
 * user joined would open the plan as "missed"), and the rotation simply
 * begins on the first scheduled day, so nothing in the split is skipped.
 */
export function materializeTemplatePlan(
  template: PlanTemplateDetail,
  options: MaterializeTemplateOptions,
): CreatePlanBody {
  const weekdays = orderWeekdays(options.weekdays);
  const { min, max } = supportedDayRange(template);
  if (weekdays.length < min || weekdays.length > max) {
    throw new Error(
      `Template supports ${min}–${max} training days/week, got ${weekdays.length}`,
    );
  }
  if (new Set(weekdays).size !== weekdays.length) {
    throw new Error('Training days must be unique');
  }

  // Week 1 is the start date's week — unless every chosen day in it has
  // already passed (a Sunday sign-up on a Mon/Thu program), in which case
  // week 1 is the following week and the first session is its first chosen
  // day. Either way the first session is the next chosen day from the start.
  let anchorMonday = getWeekStartMonday(parseLocalYmd(options.startDateISO));
  let startIndex = mondayFirstIndexOf(options.startDateISO);
  if (!weekdays.some((d) => WEEKDAY_ORDER.indexOf(d) >= startIndex)) {
    anchorMonday = new Date(anchorMonday);
    anchorMonday.setDate(anchorMonday.getDate() + 7);
    startIndex = 0;
  }
  let sessionCursor = 0;
  const slots: PlanSlot[] = [];
  for (let w = 0; w < template.weeksCount; w++) {
    const meta = template.weekMeta[w];
    weekdays.forEach((weekday) => {
      if (w === 0 && WEEKDAY_ORDER.indexOf(weekday) < startIndex) return;
      const session =
        template.sessions[sessionCursor % template.sessions.length];
      sessionCursor += 1;
      const exercises: PlanSlotExercise[] = session.exercises.map((ex, i) => {
        const week = ex.weekly[w];
        const isTime = ex.prescriptionType === 'time';
        return {
          exerciseId: ex.exerciseId,
          name: ex.name,
          sets: week.sets,
          reps: isTime ? week.durationSeconds! : week.repsMin!,
          ...(isTime
            ? { durationSeconds: week.durationSeconds! }
            : { repsMin: week.repsMin!, repsMax: week.repsMax! }),
          prescriptionType: ex.prescriptionType,
          notes: templateRowNote(ex.note, week.note, ex.restSeconds),
          orderIndex: i,
        };
      });
      slots.push({
        weekNumber: w + 1,
        dayOfWeek: weekday,
        title: session.title,
        detailLine: `Wk ${meta.weekNumber}: ${meta.label}`,
        type: 'strength',
        durationMinutes: estimateTemplateSessionMinutes(session, w),
        intensity: meta.intensity,
        orderInDay: 0,
        exercises,
      });
    });
  }

  return {
    name: template.name,
    weekAnchorMonday: formatLocalYmd(anchorMonday),
    slots,
    goal: template.goal,
    experience: template.experienceLevel,
    programTemplateId: template.programTemplateId,
    // Nobody has checked a template's rows against the work-arounds, so the
    // server is asked to; it needs the equipment to pick alternatives that
    // the person can actually do.
    ...(options.limitations?.length
      ? { limitations: [...options.limitations], applyWorkarounds: true }
      : {}),
    ...(options.equipment?.length ? { equipment: [...options.equipment] } : {}),
  };
}
