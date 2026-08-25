/**
 * Resolves "what today means" for Home so it stays in sync with the Plan tab
 * (calendar week 0 + program week mapping + day slots + linked weekly workouts).
 */

import type { Workout } from '../types/workout';
import type { ApiPlan, ApiPlanWorkout } from '../services/planService';
import {
  isRestPlanSlotTitle,
  lastContiguousProgramWeek,
  normalizePlanAnchorYmd,
  normalizePlanDayOfWeek,
  normalizeProgramWeekNumber,
  parseLocalYmd,
  planWeekdayNameLocal,
  resolveProgramWeekForCalendarOffset,
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

/**
 * "Bench Press · Incline DB Press · Cable Fly +3 more" — the Today hero's
 * one-line glance at what the session actually is.
 */
export function heroExercisePreviewLine(names: string[], max = 3): string {
  const shown = names.map((n) => n.trim()).filter((n) => n.length > 0);
  if (shown.length === 0) return '';
  const head = shown.slice(0, max).join(' · ');
  const extra = shown.length - Math.min(max, shown.length);
  return extra > 0 ? `${head} +${extra} more` : head;
}

/** First word of a day title for the week strip's mini tiles ("Push Day A" → "Push"). */
export function tileDayTitle(title: string): string {
  return title.trim().split(/\s+/)[0] ?? '';
}

/** Newest completed session — the list usually arrives newest-first, but sorted defensively. */
export function latestCompletedSession<T extends { startedAt: string; completedAt: string | null }>(
  sessions: T[],
): T | null {
  let best: T | null = null;
  for (const s of sessions) {
    if (s.completedAt == null) continue;
    if (!best || Date.parse(s.startedAt) > Date.parse(best.startedAt)) best = s;
  }
  return best;
}

/**
 * "Today" / "Yesterday" / "Tue" (within the past week) / "Aug 12" — the
 * last-workout card's day label. Both arguments are LOCAL `YYYY-MM-DD` days.
 */
export function recentDayLabel(ymd: string, todayYmd: string): string {
  const d = parseLocalYmd(ymd);
  const today = parseLocalYmd(todayYmd);
  const days = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export type HomeTodayResult = (
  | { status: 'no_plan' }
  | { status: 'out_of_program' }
  | { status: 'rest' }
  | { status: 'empty_day' }
  | { status: 'scheduled'; workout: Workout }
  | { status: 'planned_pending'; slot: ApiPlanWorkout }
) & {
  /** Set when the calendar week is past the program end and today shows the repeated last week. */
  repeatingWeek?: number;
};

export function resolveHomeToday(plan: ApiPlan | null | undefined, weeklyWorkouts: Workout[]): HomeTodayResult {
  const todayDay = planWeekdayNameLocal();
  const list = plan?.planWorkouts;
  if (!plan || !list?.length) {
    return { status: 'no_plan' };
  }

  const maxPlanWeek = Math.max(...list.map((p) => normalizeProgramWeekNumber(p.weekNumber)), 1);
  const anchorYmd = normalizePlanAnchorYmd(plan.weekAnchorMonday);
  const repeatWeek = lastContiguousProgramWeek(list.map((p) => p.weekNumber));
  const resolution = resolveProgramWeekForCalendarOffset(0, anchorYmd, maxPlanWeek, repeatWeek);

  if (resolution.status !== 'in_program') {
    return { status: 'out_of_program' };
  }
  const repeat = resolution.repeatingLastWeek ? { repeatingWeek: resolution.week } : {};

  const planByWeek = buildPlanByWeek(list);
  const slots = planByWeek[resolution.week]?.[todayDay] ?? [];

  if (slots.length === 0) {
    return { status: 'empty_day', ...repeat };
  }

  const activeSlots = slots.filter((s) => !isRestPlanSlotTitle(s.title));
  if (activeSlots.length === 0) {
    return { status: 'rest', ...repeat };
  }

  // Same-day slots are ordered by `orderInDay`; prefer the first one that already has a linked row
  // so Home matches “you already started this day’s session” even if it isn’t the first card.
  for (const slot of activeSlots) {
    const linked = weeklyWorkouts.find((w) => planSlotLinksWeeklyWorkout(slot.id, w.planWorkoutId));
    if (linked) {
      return { status: 'scheduled', workout: linked, ...repeat };
    }
  }

  return { status: 'planned_pending', slot: activeSlots[0], ...repeat };
}
