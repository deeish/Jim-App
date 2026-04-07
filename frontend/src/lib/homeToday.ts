/**
 * Resolves "what today means" for Home so it stays in sync with the Plan tab
 * (calendar week 0 + program week mapping + day slots + linked weekly workouts).
 */

import type { Workout } from '../types/workout';
import type { ApiPlan, ApiPlanWorkout } from '../services/planService';
import {
  isRestPlanSlotTitle,
  normalizePlanAnchorYmd,
  normalizePlanDayOfWeek,
  normalizeProgramWeekNumber,
  planWeekdayNameLocal,
  programWeekForCalendarOffset,
} from './planCalendar';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/** Stable match for API JSON (either id can arrive as string or number). */
export function planSlotLinksWeeklyWorkout(
  slotId: string,
  planWorkoutId: string | number | null | undefined,
): boolean {
  const a = String(slotId ?? '').trim();
  const b = String(planWorkoutId ?? '').trim();
  return a.length > 0 && a === b;
}

function buildPlanByWeek(planWorkouts: ApiPlanWorkout[]): Record<number, Record<string, ApiPlanWorkout[]>> {
  const byWeek: Record<number, Record<string, ApiPlanWorkout[]>> = {};
  const weeks = [...new Set(planWorkouts.map((pw) => normalizeProgramWeekNumber(pw.weekNumber)))];
  weeks.forEach((week) => {
    byWeek[week] = {};
    DAYS.forEach((d) => {
      byWeek[week][d] = [];
    });
  });
  planWorkouts
    .slice()
    .sort((a, b) => a.orderInDay - b.orderInDay)
    .forEach((pw) => {
      const wn = normalizeProgramWeekNumber(pw.weekNumber);
      const day = normalizePlanDayOfWeek(pw.dayOfWeek);
      if (!day) return;
      if (!byWeek[wn]) {
        byWeek[wn] = {};
        DAYS.forEach((d) => {
          byWeek[wn][d] = [];
        });
      }
      if (!byWeek[wn][day]) {
        byWeek[wn][day] = [];
      }
      byWeek[wn][day].push(pw);
    });
  return byWeek;
}

export type HomeTodayResult =
  | { status: 'no_plan' }
  | { status: 'out_of_program' }
  | { status: 'rest' }
  | { status: 'empty_day' }
  | { status: 'scheduled'; workout: Workout }
  | { status: 'planned_pending'; slot: ApiPlanWorkout };

export function resolveHomeToday(plan: ApiPlan | null | undefined, weeklyWorkouts: Workout[]): HomeTodayResult {
  const todayDay = planWeekdayNameLocal();
  const list = plan?.planWorkouts;
  if (!plan || !list?.length) {
    return { status: 'no_plan' };
  }

  const maxPlanWeek = Math.max(...list.map((p) => normalizeProgramWeekNumber(p.weekNumber)), 1);
  const anchorYmd = normalizePlanAnchorYmd(plan.weekAnchorMonday);
  const resolvedProgramWeek = programWeekForCalendarOffset(0, anchorYmd, maxPlanWeek);

  if (resolvedProgramWeek === null) {
    return { status: 'out_of_program' };
  }

  const planByWeek = buildPlanByWeek(list);
  const slots = planByWeek[resolvedProgramWeek]?.[todayDay] ?? [];

  if (slots.length === 0) {
    return { status: 'empty_day' };
  }

  const activeSlots = slots.filter((s) => !isRestPlanSlotTitle(s.title));
  if (activeSlots.length === 0) {
    return { status: 'rest' };
  }

  // Same-day slots are ordered by `orderInDay`; prefer the first one that already has a linked row
  // so Home matches “you already started this day’s session” even if it isn’t the first card.
  for (const slot of activeSlots) {
    const linked = weeklyWorkouts.find((w) => planSlotLinksWeeklyWorkout(slot.id, w.planWorkoutId));
    if (linked) {
      return { status: 'scheduled', workout: linked };
    }
  }

  return { status: 'planned_pending', slot: activeSlots[0] };
}
