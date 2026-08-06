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
 * Toggle one weekday in a constrained selection. Selecting past the cap is
 * ignored (the day stays unselected) so the picker can never exceed the
 * template's days/week; deselecting always works.
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
 * Suggested start date for an anchored program. Week 1 anchors to the Monday
 * of the start date, so "start today" is only clean when none of the selected
 * training days in the CURRENT week have already passed — otherwise week 1
 * would open with sessions sitting in the past. When today is clean, suggest
 * today (nobody should wait until Monday to start training); when it isn't,
 * next Monday keeps week 1 whole. Callers can always override via the picker.
 */
export function suggestedTemplateStartDateISO(
  today: Date = new Date(),
  weekdays?: readonly Weekday[],
): string {
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  const jsDay = d.getDay(); // 0 = Sunday
  if (weekdays && weekdays.length > 0) {
    const mondayFirstIndex = (jsDay + 6) % 7; // Monday = 0 … Sunday = 6
    const earliestSelected = Math.min(
      ...weekdays.map((w) => WEEKDAY_ORDER.indexOf(w)),
    );
    if (mondayFirstIndex <= earliestSelected) return formatLocalYmd(d);
  }
  const daysUntilMonday = jsDay === 1 ? 0 : ((8 - jsDay) % 7 || 7);
  d.setDate(d.getDate() + daysUntilMonday);
  return formatLocalYmd(d);
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
  /** Local YYYY-MM-DD the user wants to start; anchors week 1 to its Monday. */
  startDateISO: string;
}

/**
 * Build the full `POST /plans` body for a template. Throws if the weekday
 * selection does not match the template's days/week — callers gate on the
 * picker, this is the last line of defense.
 */
export function materializeTemplatePlan(
  template: PlanTemplateDetail,
  options: MaterializeTemplateOptions,
): CreatePlanBody {
  const weekdays = orderWeekdays(options.weekdays);
  if (weekdays.length !== template.daysPerWeek) {
    throw new Error(
      `Template needs ${template.daysPerWeek} training days, got ${weekdays.length}`,
    );
  }
  if (new Set(weekdays).size !== weekdays.length) {
    throw new Error('Training days must be unique');
  }

  const slots: PlanSlot[] = [];
  for (let w = 0; w < template.weeksCount; w++) {
    const meta = template.weekMeta[w];
    template.sessions.forEach((session, dayIndex) => {
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
        dayOfWeek: weekdays[dayIndex],
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
    weekAnchorMonday: formatLocalYmd(
      getWeekStartMonday(parseLocalYmd(options.startDateISO)),
    ),
    slots,
    goal: template.goal,
    experience: template.experienceLevel,
    programTemplateId: template.programTemplateId,
  };
}
