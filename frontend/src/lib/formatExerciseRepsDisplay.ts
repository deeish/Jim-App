/**
 * Shared reps/duration display for plan drafts, previews, and materialized workouts.
 * Kept separate from {@link ./planPipeline} so lightweight callers avoid pulling the full pipeline + API stack.
 */
import type { GoalId } from '../types/plan';
import {
  exerciseUsesTimeDisplay,
  type ExercisePrescriptionType,
} from './exercisePrescription';

/**
 * Second column for "sets × …" in preview and drafts.
 * Time-holds show a second range; numeric reps use {@link formatDraftReps}.
 */
export function formatExerciseRepsDisplay(
  exerciseName: string,
  reps: string | number | undefined,
  goal: GoalId,
  prescriptionType?: ExercisePrescriptionType,
  /**
   * When provided, the formatter treats `'Cardio'` rows as time-based even if
   * `prescriptionType` is missing AND falls back to a `"8–12 min"` band for
   * legacy cardio rows whose `reps` value is a small rep count (e.g. `10`)
   * rather than a seconds value (e.g. `600`). Without this, legacy captures
   * surfaced cardio finishers as `1 × 10 sec` after Phase 6a.
   */
  primaryMuscleGroup?: string,
): string {
  const isCardio = (primaryMuscleGroup ?? '').toLowerCase() === 'cardio';
  if (exerciseUsesTimeDisplay(prescriptionType, exerciseName, primaryMuscleGroup)) {
    const n =
      typeof reps === 'number'
        ? reps
        : typeof reps === 'string'
          ? parseInt(reps.replace(/[^\d]/g, ''), 10)
          : NaN;
    if (Number.isFinite(n) && n > 0) {
      if (n >= 120 && n % 60 === 0) return `${n / 60} min`;
      if (n >= 60 && n < 120) return `${Math.round(n / 60)} min`;
      if (isCardio && n < 60) return '8–12 min';
      return `${n} sec`;
    }
    return isCardio ? '8–12 min' : '20–45 sec';
  }
  if (typeof reps === 'string') {
    const t = reps.trim();
    if (/\bsec(onds?)?\b/i.test(t)) return t;
    if (/\d+\s*[–-]\s*\d+/.test(t)) return t;
    const m = t.match(/\d+/);
    if (m) return formatDraftReps(parseInt(m[0], 10), goal);
    return t || '8–12';
  }
  const num = typeof reps === 'number' ? reps : NaN;
  if (Number.isFinite(num)) return formatDraftReps(Math.round(num), goal);
  return '8–12';
}

/**
 * Format a stored rep range ("8–12"), collapsing to a single number when
 * `min === max`. Returns `null` when no usable range is present so callers can
 * fall back to the legacy single-number derivation ({@link formatDraftReps}).
 *
 * This is the source of truth once the backend stamps `repsMin`/`repsMax`
 * (goal × difficulty × role) — no more fabricating a band from one number.
 */
export function formatRepRange(
  repsMin: number | undefined | null,
  repsMax: number | undefined | null,
): string | null {
  if (repsMin == null || !Number.isFinite(repsMin)) return null;
  const lo = Math.max(1, Math.round(repsMin));
  const hi =
    repsMax != null && Number.isFinite(repsMax)
      ? Math.max(lo, Math.round(repsMax))
      : lo;
  return hi > lo ? `${lo}–${hi}` : `${lo}`;
}

/** Rep range string for draft + preview (API often returns one number). */
export function formatDraftReps(reps: number, goal: GoalId): string {
  const n = Math.round(Number(reps));
  if (!Number.isFinite(n) || n < 1) return '8–12';
  if (goal === 'strength') {
    const lo = Math.max(3, n - 2);
    let hi = Math.min(12, n + 2);
    if (hi < lo) hi = lo;
    return `${lo}–${hi}`;
  }
  if (goal === 'endurance') {
    const lo = Math.max(12, n - 3);
    let hi = Math.min(25, n + 5);
    if (hi < lo) hi = lo;
    return `${lo}–${hi}`;
  }
  if (goal === 'balanced') {
    const lo = Math.max(6, n - 3);
    let hi = Math.min(14, n + 3);
    if (hi < lo) hi = lo;
    return `${lo}–${hi}`;
  }
  if (goal === 'fat_loss') {
    const lo = Math.max(8, n - 3);
    let hi = Math.min(20, n + 5);
    if (hi < lo) hi = lo;
    return `${lo}–${hi}`;
  }
  const lo = Math.max(6, n - 2);
  let hi = Math.min(15, n + 4);
  if (hi < lo) hi = lo;
  return `${lo}–${hi}`;
}
