import type { ExerciseSession, WorkoutLog, WorkoutStatsSession } from '../types/workout';
import { formatLocalYmd, getWeekStartMonday } from './planCalendar';
import { sessionLocalWeek, weekStreak } from './progressStats';
import { formatWeightCompactFromLb, type WeightUnit } from './weightDisplay';

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
 * One set as the receipt prints it when an exercise is opened, split so the
 * unit can render a step down and muted — the type scale keeps `caption` and
 * `footnote` as separate steps precisely so a dense data row can size its
 * value and its unit suffix differently.
 */
export type SetDetail = {
  /** The numbers: '8 × 135', '10', '45 sec'. */
  text: string;
  /** Trailing unit, quieter than the value: 'lb', 'kg', 'reps'. */
  unit?: string;
};

/** '185 lb' → { text: '185', unit: 'lb' }; an unsplittable string stays whole. */
function splitUnit(compact: string): SetDetail {
  const cut = compact.lastIndexOf(' ');
  return cut > 0
    ? { text: compact.slice(0, cut), unit: compact.slice(cut + 1) }
    : { text: compact };
}

/** One muscle's share of a session, in set-equivalents. */
export type MuscleSets = { muscle: string; sets: number };

/**
 * What the session actually trained, by muscle, in set-equivalents: a set
 * counts 1 for the muscle it targets and 0.5 for each muscle it also works.
 *
 * The half is the convention the hypertrophy literature uses for synergists,
 * and it is why this is labelled "sets by muscle" rather than "hard sets" —
 * nothing here can see how close a set was to failure, which is what would
 * make it a hard set.
 *
 * Because a set is credited to more than one muscle, these deliberately sum to
 * MORE than the session's set count. They describe stimulus per muscle, not a
 * division of the sets.
 */
export function setsByMuscle(
  entries: Array<{ sets: number; muscle: string | null; secondary?: string[] }>,
): MuscleSets[] {
  const totals = new Map<string, number>();
  const add = (muscle: string, credit: number) => {
    totals.set(muscle, (totals.get(muscle) ?? 0) + credit);
  };
  for (const entry of entries) {
    if (entry.sets <= 0) continue;
    if (entry.muscle) add(entry.muscle, entry.sets);
    for (const s of entry.secondary ?? []) {
      if (s && s !== entry.muscle) add(s, entry.sets * 0.5);
    }
  }
  return [...totals.entries()]
    .map(([muscle, sets]) => ({ muscle, sets: Math.round(sets * 2) / 2 }))
    .filter((m) => m.sets > 0)
    // Biggest share first; ties keep a stable alphabetical order so the strip
    // does not reshuffle between two sessions that trained the same amount.
    .sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle));
}

/**
 * What an exercise's row says before it is opened: the LOAD it was trained
 * with, as a range — '135–145 lb' when the weight moved, '95 lb' when it held.
 *
 * Deliberately not a set. Quoting one set out of four ('6 × 145 lb') reads the
 * same whether that was every set or the one good one, and now that every set
 * is a tap away an unlabelled stand-in for them is worse than none. A range
 * claims nothing about reps, so there is nothing to misread — and it still
 * answers the question the row is usually opened for: what did I lift.
 *
 * Unweighted work has no load to range over, so it ranges over reps instead;
 * a session with neither recorded gets the em dash.
 */
export function summariseSetLoads(
  sets: Array<{ reps: number; weightLb?: number }>,
  unit: WeightUnit,
): string {
  const loads = sets
    .map((s) => s.weightLb)
    .filter((lb): lb is number => lb != null && lb > 0);
  if (loads.length > 0) {
    // Compare what will be PRINTED, not the stored pounds: two loads a pound
    // apart round to the same kilogram, and '61–61 kg' is not a range.
    const low = splitUnit(formatWeightCompactFromLb(Math.min(...loads), unit));
    const high = splitUnit(formatWeightCompactFromLb(Math.max(...loads), unit));
    if (low.text === high.text) return `${high.text} ${high.unit ?? ''}`.trim();
    return `${low.text}–${high.text} ${high.unit ?? ''}`.trim();
  }
  const reps = sets.map((s) => s.reps).filter((r) => r > 0);
  if (reps.length === 0) return '—';
  const low = Math.min(...reps);
  const high = Math.max(...reps);
  return low === high ? `${high} reps` : `${low}–${high} reps`;
}

/**
 * A set from the DECK's record, where reps and weight are the display strings
 * it stored. The weight string is always pounds (the deck normalises on the
 * way in), so kg readers convert here like everywhere else. Same reps × weight
 * grammar the deck's "Last time" line uses, so a session reads identically
 * wherever it appears.
 */
export function loggedSetDetail(
  reps: string,
  weight: string,
  unit: WeightUnit,
): SetDetail {
  const weightLb = parseWeightLb(weight);
  // '' comes back for a zero/absent load — no weight, not a blank one.
  const compact = weightLb != null ? formatWeightCompactFromLb(weightLb, unit) : '';
  const load = compact !== '' ? splitUnit(compact) : null;
  // Timed work reads as its own duration; a load on top is rare enough to
  // stay in one run rather than invent a second unit slot.
  if (/min|sec/i.test(reps)) {
    return { text: load ? `${reps} @ ${load.text} ${load.unit ?? ''}`.trim() : reps };
  }
  const count = parseRepsCount(reps);
  if (count <= 0) return load ?? { text: '—' };
  return load
    ? { text: `${count} × ${load.text}`, unit: load.unit }
    : { text: String(count), unit: 'reps' };
}

/**
 * The same set read back from a STORED log, where reps and weight are numbers.
 * Timed work stores zero reps and keeps no duration, so those sets show their
 * load alone — never a meaningless "0 reps".
 */
export function storedSetDetail(
  reps: number,
  weightLb: number | undefined,
  unit: WeightUnit,
): SetDetail {
  const compact = weightLb != null ? formatWeightCompactFromLb(weightLb, unit) : '';
  const load = compact !== '' ? splitUnit(compact) : null;
  if (!reps || reps <= 0) return load ?? { text: '—' };
  return load
    ? { text: `${reps} × ${load.text}`, unit: load.unit }
    : { text: String(reps), unit: 'reps' };
}

/**
 * The same day's work read back from its STORED workout logs — the history
 * path behind "Review session" on a day this device never trained (logged on
 * another phone, before a reinstall, or older than the 14-day set-log window).
 *
 * The receipt is the log, not the plan: an old session shows what was done
 * that day even if the day's exercises have been replaced since. A reopened
 * day has two logs for the date; they concatenate in the order they were
 * started, which is the order they were performed.
 */
export function sessionsFromWorkoutLogs(logs: WorkoutLog[]): ExerciseSession[] {
  const ordered = [...logs].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const sessions: ExerciseSession[] = [];
  for (const log of ordered) {
    const entries = [...(log.entries ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
    for (const entry of entries) {
      const sets = (entry.completedSets ?? []).filter((s) => s.completed);
      if (sets.length === 0) continue;
      sessions.push({
        exerciseIndex: sessions.length,
        exercise: {
          name: entry.name ?? 'Exercise',
          sets: sets.length,
          reps: Math.max(1, ...sets.map((s) => s.reps || 0)),
          exerciseId: entry.exerciseId || undefined,
          prescriptionType: 'reps',
        },
        completedSets: sets.map((s, i) => ({
          setNumber: i + 1,
          reps: s.reps,
          ...(s.weight != null ? { weight: s.weight } : null),
          completed: true,
        })),
      });
    }
  }
  return sessions;
}

/**
 * How long the stored session took, in seconds — the honest duration for a
 * recap, which cannot recompute one (see the screen's heroSeconds note). Null
 * when the logs carry no timing, so the hero falls back to the exercise count.
 */
export function loggedDurationSeconds(logs: WorkoutLog[]): number | null {
  let total = 0;
  let known = false;
  for (const log of logs) {
    if (log.totalTimeSeconds == null) continue;
    known = true;
    total += Math.max(0, log.totalTimeSeconds);
  }
  return known ? total : null;
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
