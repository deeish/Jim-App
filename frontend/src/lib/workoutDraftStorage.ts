import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Workout, ExerciseSession, WorkoutSessionRestoredSnapshot } from '../types/workout';

const STORAGE_KEY = 'jim_workout_draft_v1';

export type PersistedWorkoutDraft = {
  version: 1;
  workout: Workout;
  startTimeIso: string;
  currentExerciseIndex: number;
} & WorkoutSessionRestoredSnapshot;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export async function saveWorkoutDraft(payload: Omit<PersistedWorkoutDraft, 'version'>): Promise<void> {
  const full: PersistedWorkoutDraft = { version: 1, ...payload };
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
    if (typeof parsed.currentExerciseIndex !== 'number') return null;
    if (!Array.isArray(parsed.exerciseSessions)) return null;
    return parsed as unknown as PersistedWorkoutDraft;
  } catch {
    return null;
  }
}

export async function clearWorkoutDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
