import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Workout, ExerciseSession, WorkoutSessionRestoredSnapshot } from '../types/workout';

const STORAGE_KEY = 'jim_workout_draft_v1';

export type PersistedWorkoutDraft = {
  version: 1;
  workout: Workout;
  startTimeIso: string;
  /**
   * Stamped at write time. Optional only because drafts saved before it
   * existed lack it; `resumedSessionStartTime` treats those as zero elapsed.
   */
  savedAtIso?: string;
  currentExerciseIndex: number;
} & WorkoutSessionRestoredSnapshot;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export async function saveWorkoutDraft(
  payload: Omit<PersistedWorkoutDraft, 'version' | 'savedAtIso'>,
): Promise<void> {
  const full: PersistedWorkoutDraft = {
    version: 1,
    savedAtIso: new Date().toISOString(),
    ...payload,
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(full));
}

export async function loadWorkoutDraft(): Promise<PersistedWorkoutDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.version !== 1) return null;
    if (typeof parsed.workout !== 'object' || parsed.workout === null) return null;
    if (typeof parsed.startTimeIso !== 'string') return null;
    if (parsed.savedAtIso !== undefined && typeof parsed.savedAtIso !== 'string') return null;
    if (typeof parsed.currentExerciseIndex !== 'number') return null;
    if (!Array.isArray(parsed.exerciseSessions)) return null;
    return parsed as unknown as PersistedWorkoutDraft;
  } catch {
    return null;
  }
}

/**
 * Start time to resume a draft with. The persisted workout duration is
 * `finish − startTime`, so restoring the original start would bill every hour
 * the draft sat idle: resuming yesterday's workout wrote a ~14-hour session
 * into history. Instead the start is re-based so the clock resumes from the
 * active time the draft had accrued when it was last saved — time between
 * that save and the resume never counts. Drafts predating `savedAtIso` (or
 * with garbled timestamps) resume with zero accrued time, which is at worst
 * an undercount, never an inflated one.
 */
export function resumedSessionStartTime(
  draft: Pick<PersistedWorkoutDraft, 'startTimeIso' | 'savedAtIso'>,
  nowMs: number = Date.now(),
): Date {
  const startedMs = Date.parse(draft.startTimeIso);
  const savedMs = draft.savedAtIso ? Date.parse(draft.savedAtIso) : NaN;
  const activeMs =
    Number.isFinite(startedMs) && Number.isFinite(savedMs) && savedMs > startedMs
      ? savedMs - startedMs
      : 0;
  return new Date(nowMs - activeMs);
}

export async function clearWorkoutDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
