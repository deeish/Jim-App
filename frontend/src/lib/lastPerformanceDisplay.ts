import type {
  ExerciseSession,
  LastExercisePerformance,
  LastPerformanceMap,
} from '../types/workout';
import { WeightUnit, formatWeightCompactFromLb } from './weightDisplay';
import {
  exerciseUsesTimeDisplay,
  formatRestSecondsForPreview,
} from './exercisePrescription';
import { isLinkableLibraryExerciseId } from './exerciseNavigation';

/**
 * Logged values below this can't be real durations — legacy cardio rows store
 * a rep count (1, 10) in the reps field rather than seconds.
 */
export const MIN_PLAUSIBLE_DURATION_SECONDS = 15;

/**
 * "Last time" line for the live-session exercise card, e.g.
 *   weighted:   `Last time (Jul 10): 8×135 lb, 8×135 lb, 6×140 lb`
 *   bodyweight: `Last time (Jul 10): 8, 9, 10 reps`
 *   time-based: `Last time (Jul 10): 45s @ 50 lb, 45s`
 * Returns null when there is nothing to show.
 */
export function formatLastTimeLine(
  perf: LastExercisePerformance | undefined,
  unit: WeightUnit,
  isTimeBased: boolean,
): string | null {
  if (!perf || perf.sets.length === 0) return null;
  const date = new Date(perf.performedAt);
  if (Number.isNaN(date.getTime())) return null;
  const dateLabel = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  let body: string;
  if (isTimeBased) {
    // Timed rows log their duration seconds in the reps field — but legacy
    // cardio rows can carry a small rep count instead (see the cardio
    // fallback in formatExerciseRepsDisplay), so only trust plausible
    // durations rather than rendering "1s".
    const timedSets = perf.sets.filter(
      (s) => s.reps >= MIN_PLAUSIBLE_DURATION_SECONDS,
    );
    if (timedSets.length === 0) return null;
    body = timedSets
      .map((s) => {
        const dur = formatRestSecondsForPreview(s.reps);
        const w = formatWeightCompactFromLb(s.weight, unit);
        return w ? `${dur} @ ${w}` : dur;
      })
      .join(', ');
  } else if (perf.sets.every((s) => s.weight == null || s.weight <= 0)) {
    body = `${perf.sets.map((s) => s.reps).join(', ')} reps`;
  } else {
    // Matches the adjacent "Last set today" reps×weight format.
    body = perf.sets
      .map((s) => `${s.reps}×${formatWeightCompactFromLb(s.weight, unit) || '—'}`)
      .join(', ');
  }
  return `Last time (${dateLabel}): ${body}`;
}

/** One set as both the workout-log map and the exercise-history endpoint shape it. */
interface AnyLoggedSet {
  reps: number;
  /** Canonical pounds; null/0 for bodyweight sets. */
  weight?: number | null;
}

export interface LastSetPick {
  reps: number;
  /** Canonical pounds; null when the set was bodyweight. */
  weightLb: number | null;
  /** Set `setNumber` didn't exist last session — this is its best set instead. */
  isBestFallback: boolean;
}

/**
 * Last session's set matching a 1-based set number. Past the end (today runs
 * more sets than last time), falls back to the session's best set: heaviest
 * weighted set (ties prefer reps), or the most reps when nothing was weighted.
 */
export function lastSetForIndex(
  sets: AnyLoggedSet[],
  setNumber: number,
): LastSetPick | null {
  if (sets.length === 0 || setNumber < 1) return null;
  const pick = (s: AnyLoggedSet, isBestFallback: boolean): LastSetPick => ({
    reps: s.reps,
    weightLb: s.weight != null && s.weight > 0 ? s.weight : null,
    isBestFallback,
  });
  const direct = sets[setNumber - 1];
  if (direct) return pick(direct, false);
  let best = sets[0];
  for (const s of sets) {
    const w = s.weight ?? 0;
    const bw = best.weight ?? 0;
    if (w > bw || (w === bw && s.reps > best.reps)) best = s;
  }
  return pick(best, true);
}

/**
 * Set-aware "Last time" line for the calendar set deck, e.g.
 *   weighted:   `Last time, set 2 (Aug 14): 8 × 135 lb`
 *   bodyweight: `Last time, set 2 (Aug 14): 9 reps`
 *   time-based: `Last time, set 2 (Aug 14): 45s @ 50 lb`
 *   fallback:   `Last time (best): 6 × 140 lb`  (today runs longer than last session)
 * Returns null when there is nothing plausible to show.
 */
export function formatLastTimeForSet(
  perf: { performedAt: string; sets: AnyLoggedSet[] } | null | undefined,
  setNumber: number,
  unit: WeightUnit,
  isTimeBased: boolean,
): string | null {
  if (!perf || perf.sets.length === 0) return null;
  const date = new Date(perf.performedAt);
  if (Number.isNaN(date.getTime())) return null;
  const dateLabel = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  let chosen: LastSetPick | null;
  if (isTimeBased) {
    // Same legacy-cardio guard as formatLastTimeLine: only plausible
    // durations render, and an implausible direct match falls back to the
    // longest plausible one rather than showing "1s".
    const plausible = perf.sets.filter(
      (s) => s.reps >= MIN_PLAUSIBLE_DURATION_SECONDS,
    );
    if (plausible.length === 0) return null;
    const direct = perf.sets[setNumber - 1];
    if (direct && direct.reps >= MIN_PLAUSIBLE_DURATION_SECONDS) {
      chosen = {
        reps: direct.reps,
        weightLb: direct.weight != null && direct.weight > 0 ? direct.weight : null,
        isBestFallback: false,
      };
    } else {
      const longest = plausible.reduce((a, b) => (b.reps > a.reps ? b : a));
      chosen = {
        reps: longest.reps,
        weightLb: longest.weight != null && longest.weight > 0 ? longest.weight : null,
        isBestFallback: true,
      };
    }
  } else {
    chosen = lastSetForIndex(perf.sets, setNumber);
  }
  if (!chosen) return null;

  let body: string;
  if (isTimeBased) {
    const dur = formatRestSecondsForPreview(chosen.reps);
    const w = chosen.weightLb != null ? formatWeightCompactFromLb(chosen.weightLb, unit) : '';
    body = w ? `${dur} @ ${w}` : dur;
  } else if (chosen.weightLb == null) {
    body = `${chosen.reps} reps`;
  } else {
    body = `${chosen.reps} × ${formatWeightCompactFromLb(chosen.weightLb, unit) || '—'}`;
  }
  return chosen.isBestFallback
    ? `Last time (best): ${body}`
    : `Last time, set ${setNumber} (${dateLabel}): ${body}`;
}

/** Heaviest completed weight (lb) from the last performance, if any. */
export function lastTopWeightLb(
  perf: LastExercisePerformance | undefined,
): number | null {
  if (!perf) return null;
  let top: number | null = null;
  for (const s of perf.sets) {
    if (s.weight != null && s.weight > 0 && (top == null || s.weight > top)) {
      top = s.weight;
    }
  }
  return top;
}

/**
 * Seeds unweighted, not-yet-completed sets with the last-time top weight (or a
 * preferred weight, e.g. the next-target suggestion, when the resolver returns
 * one). Pure: returns the same array reference when nothing changes. A set the
 * user already gave a weight (or completed) before the fetch resolved is left
 * alone, as are time-based rows, weighted prescriptions, and skipped exercises.
 */
export function applyLastPerformancePrefill(
  sessions: ExerciseSession[],
  map: LastPerformanceMap,
  preferredWeightLb?: (
    session: ExerciseSession,
    perf: LastExercisePerformance,
  ) => number | null,
): ExerciseSession[] {
  let changed = false;
  const next = sessions.map((es) => {
    if (es.skipped) return es;
    const exercise = es.exercise;
    const id = exercise.exerciseId;
    if (!isLinkableLibraryExerciseId(id)) return es;
    const perf = map[id!];
    if (!perf) return es;
    if (
      exerciseUsesTimeDisplay(
        exercise.prescriptionType,
        exercise.name,
        exercise.primaryMuscleGroup,
      )
    ) {
      return es;
    }
    if (exercise.weight != null && exercise.weight !== 0) return es;
    const fillLb =
      (preferredWeightLb ? preferredWeightLb(es, perf) : null) ??
      lastTopWeightLb(perf);
    if (fillLb == null) return es;

    let setsChanged = false;
    const completedSets = es.completedSets.map((s) => {
      if (s.completed) return s;
      // Sets were seeded with the (empty) prescription weight; a non-empty
      // weight here means the user already touched this set.
      if (s.weight != null && s.weight !== 0) return s;
      setsChanged = true;
      return { ...s, weight: fillLb };
    });
    if (!setsChanged) return es;
    changed = true;
    return { ...es, completedSets };
  });
  return changed ? next : sessions;
}
