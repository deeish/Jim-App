/**
 * Resolves "what today means" for Home so it stays in sync with the Plan tab
 * (calendar week 0 + program week mapping + day slots + linked weekly workouts).
 */

import type { Workout, WorkoutLog } from '../types/workout';
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

export function buildPlanByWeek(planWorkouts: ApiPlanWorkout[]): Record<number, Record<string, ApiPlanWorkout[]>> {
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

export type HomeWeekDotStatus = 'completed' | 'today' | 'scheduled' | 'rest';
export type HomeWeekDot = { status: HomeWeekDotStatus; name: string | null };

/**
 * Week-strip dots for Home (Monday-first). A day is "completed" only when a
 * completed WorkoutLog from the current calendar week points at a workout
 * linked to one of its slots. Applying a plan materializes Workout rows for
 * every slot upfront, so row existence must never be used as a done signal
 * (that made every dot render solid the moment a generated plan was applied).
 */
export function buildHomeWeekDots(
  plan: ApiPlan | null | undefined,
  weeklyWorkouts: Workout[],
  completedLogs: Pick<WorkoutLog, 'workoutId' | 'completedAt'>[],
  currentProgramWeek: number | null,
): HomeWeekDot[] {
  const list = plan?.planWorkouts;
  if (!list?.length || currentProgramWeek == null) return [];
  const thisWeek = buildPlanByWeek(list)[currentProgramWeek] ?? {};
  const todayName = planWeekdayNameLocal();
  return DAYS.map((day) => {
    const slots = thisWeek[day] ?? [];
    const nonRest = slots.filter((s) => !isRestPlanSlotTitle(s.title));
    if (!nonRest.length) return { status: 'rest', name: null };
    const name = nonRest[0].title ?? null;
    const completed = nonRest.some((s) => {
      const linked = weeklyWorkouts.find((w) => planSlotLinksWeeklyWorkout(s.id, w.planWorkoutId));
      if (!linked?.id) return false;
      return completedLogs.some((l) => l.completedAt != null && l.workoutId === linked.id);
    });
    if (completed) return { status: 'completed', name };
    if (day === todayName) return { status: 'today', name };
    return { status: 'scheduled', name };
  });
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
