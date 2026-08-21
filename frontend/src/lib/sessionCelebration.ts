import type { ExerciseSession, WorkoutStatsSession } from '../types/workout';
import { formatLocalYmd, getWeekStartMonday } from './planCalendar';
import { sessionLocalWeek, weekStreak } from './progressStats';

/**
 * Pure logic behind the workout-complete celebration flow (the Moment →
 * Ledger screens): turning the calendar store's string set-logs into the
 * `ExerciseSession[]` shape the finish-screen helpers (`summarizeSessionTotals`,
 * `collectSessionAchievements`) already consume, plus the streak and clock
 * formatting the celebration renders.
 *
 * The rep/weight parsers here are THE canonical ones — the calendar store
 * imports them for the workout-log POST, so the numbers the celebration shows
 * and the numbers History stores can never drift apart.
 */

/** One checked set as the calendar deck stores it — both display strings. */
export type LoggedSetStrings = { reps: string; weight: string };

/**
 * The slice of a planned exercise the celebration needs. Structural on purpose:
 * the store's `PlannedExercise` satisfies it without this module importing the
 * store (which would drag AsyncStorage and the API client into Jest).
 */
export type CelebrationExercise = {
  name: string;
  /** Prototype muscle label; doubles as `primaryMuscleGroup` for time detection. */
  muscle?: string;
  exerciseId?: string;
  sets: number;
  /** Display string, e.g. '8–10' or '45 sec'. */
  reps: string;
  /** Display string incl. unit, e.g. '155 lb' or 'Bodyweight'. */
  weight: string;
};

/** '5–8' → 8, '12' → 12, '10 min' → 0 (time work carries no rep count). */
export function parseRepsCount(reps: string): number {
  const nums = reps.match(/\d+/g);
  if (!nums || /min|sec/i.test(reps)) return 0;
  return Number(nums[nums.length - 1]) || 0;
}

/** '185 lb' → 185; 'Bodyweight' / '—' → undefined. */
export function parseWeightLb(weight: string): number | undefined {
  const m = weight.match(/[\d.]+/);
  return m ? Number(m[0]) : undefined;
}

/**
 * The day's logged work as `ExerciseSession[]`. Only exercises with at least
 * one logged set appear — identical to the entries the workout-log POST
 * builds, so the celebration and History always describe the same session.
 */
export function calendarSessionsFromLogs(
  exercises: CelebrationExercise[],
  logsFor: (index: number) => LoggedSetStrings[],
): ExerciseSession[] {
  const sessions: ExerciseSession[] = [];
  exercises.forEach((ex, index) => {
    const logs = logsFor(index);
    if (logs.length === 0) return;
    sessions.push({
      exerciseIndex: index,
      exercise: {
        name: ex.name,
        sets: ex.sets,
        reps: Math.max(1, parseRepsCount(ex.reps)),
        exerciseId: ex.exerciseId,
        primaryMuscleGroup: ex.muscle,
        prescriptionType: /min|sec/i.test(ex.reps) ? 'time' : 'reps',
      },
      completedSets: logs.map((l, si) => {
        const weight = parseWeightLb(l.weight);
        return {
          setNumber: si + 1,
          reps: parseRepsCount(l.reps),
          ...(weight != null ? { weight } : null),
          completed: true,
        };
      }),
    });
  });
  return sessions;
}

/**
 * The streak the Moment screen shows: server history plus the session just
 * finished, whose log may not have POSTed yet — its week is added by hand.
 * `sessionDate` is the day being logged, so a backdated log credits its own
 * week rather than today's.
 */
export function streakWithSession(
  stats: WorkoutStatsSession[],
  sessionDate: Date,
  now: Date = new Date(),
): number {
  const weeks = new Set<string>();
  for (const s of stats) {
    const week = sessionLocalWeek(s);
    if (week) weeks.add(week);
  }
  weeks.add(formatLocalYmd(getWeekStartMonday(sessionDate)));
  return weekStreak(weeks, now);
}

/** 2538 → '42:18'; 3725 → '1:02:05'. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Most frequent muscle among the day's logged exercises (ties keep the first
 * seen, i.e. the session's opener). Drives the light-mode gradient wash on the
 * Moment screen; dark mode uses the charcoal wash regardless.
 */
export function dominantMuscle<M extends string>(
  rows: Array<{ muscle: M; logged: boolean }>,
): M | null {
  const counts = new Map<M, number>();
  let best: M | null = null;
  let bestCount = 0;
  for (const row of rows) {
    if (!row.logged) continue;
    const next = (counts.get(row.muscle) ?? 0) + 1;
    counts.set(row.muscle, next);
    if (next > bestCount) {
      best = row.muscle;
      bestCount = next;
    }
  }
  return best;
}
