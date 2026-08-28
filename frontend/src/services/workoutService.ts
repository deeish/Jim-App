import {
  Workout,
  WorkoutLog,
  LastPerformanceMap,
  PersonalBestMap,
  PersonalBestE1rmMap,
  WorkoutStats,
} from '../types/workout';
import type { ExerciseHistory } from '../lib/exerciseHistory';
import { api } from '../api/client';

// ---------------------------------------------------------------------------
// Quick Workout (deterministic catalog builder — no LLM, instant)
// ---------------------------------------------------------------------------

export type QuickSessionExercise = {
  exerciseId: string;
  name: string;
  /** The calendar's 12-muscle vocabulary — drives the day view's chip. */
  muscle: string;
  sets: number;
  reps: number;
  repsMin: number;
  repsMax: number;
  orderIndex: number;
  prescriptionType?: 'reps' | 'time';
  durationSeconds?: number;
};

export type QuickSession = {
  title: string;
  type: 'strength' | 'cardio';
  durationMinutes: number;
  exercises: QuickSessionExercise[];
};

export type QuickSessionRequest = {
  muscles: string[];
  goal?: string;
  experience?: string;
  equipment?: string[];
  limitations?: string[];
  /** Exercise ids already on today, so a second session doesn't repeat them. */
  excludeIds?: string[];
};

/** Build a one-off session for an arbitrary muscle selection. */
export async function buildQuickSession(
  body: QuickSessionRequest,
): Promise<QuickSession> {
  const response = await api.post<QuickSession>('/workouts/quick-session', body);
  return response.data;
}

/** Create (or return) a Workout row from a plan slot’s stored exercises. */
export const materializePlanSlotWorkout = async (planWorkoutId: string): Promise<Workout> => {
  const response = await api.post<Workout>(
    `/workouts/plan-slot/${encodeURIComponent(planWorkoutId)}/materialize`,
  );
  return response.data;
};

export const getWorkoutById = async (id: string): Promise<Workout> => {
  const response = await api.get(`/workouts/${id}`);
  return response.data;
};

export const generateWorkout = async (day?: string, preferences?: any): Promise<Workout> => {
  const response = await api.post('/workouts/generate', {
    day,
    preferences,
  });
  return response.data;
};

/** AI-regenerate exercises in place for this workout (same id; uses title/focus, day, duration). */
export const regenerateWorkoutInPlace = async (workoutId: string): Promise<Workout> => {
  const response = await api.post<Workout>(`/workouts/${workoutId}/regenerate`, {});
  return response.data;
};

/** Generated workout shape without id (for plan preview). */
export interface WorkoutPreview {
  name: string;
  day?: string;
  reasoning?: string;
  warmUp?: string;
  coolDown?: string;
  exercises: Array<{
    name: string;
    sets: number;
    reps: number | string;
    weight?: number;
    notes?: string;
    orderIndex?: number;
    /** Library id when available — opens Exercise detail from preview. */
    exerciseId?: string;
    /** When API sends library metadata (e.g. holds). */
    prescriptionType?: 'reps' | 'time' | 'distance';
    primaryMuscleGroup?: string;
    secondaryMuscleGroups?: string[];
    /** Short label for preview body-part chip (Chest, Tris, Cardio, …). */
    bodyTag?: string;
    /** Cardio finisher row — not in session draft; hide replace control. */
    isSyntheticFinisher?: boolean;
    /**
     * Suggested rest between sets (seconds), stamped server-side from the
     * goal+difficulty scheme. Cardio rows leave this undefined. Surfaced as
     * a "· 90s rest" suffix on the preview row.
     */
    restSeconds?: number;
  }>;
}

export const generateWorkoutPreview = async (
  day?: string,
  preferences?: {
    focus?: string;
    duration?: number;
    difficulty?: string;
    equipment?: string[];
    goal?: string;
    experience?: string;
    limitations?: string[];
    programTemplateId?: string;
    programDayFocus?: string;
  }
): Promise<WorkoutPreview> => {
  const response = await api.post<WorkoutPreview>('/workouts/preview', {
    day,
    preferences,
  });
  return response.data;
};

export const createWorkout = async (workout: Partial<Workout>): Promise<Workout> => {
  const response = await api.post('/workouts', workout);
  return response.data;
};

export const updateWorkout = async (id: string, workout: Partial<Workout>): Promise<Workout> => {
  const response = await api.patch(`/workouts/${id}`, workout);
  return response.data;
};

// --- Saved / liked workouts ---

export const getSavedWorkoutIds = async (): Promise<string[]> => {
  const response = await api.get<{ workoutIds: string[] }>('/workouts/saved/ids');
  return response.data.workoutIds;
};

export const getSavedWorkouts = async (): Promise<Workout[]> => {
  const response = await api.get<Workout[]>('/workouts/saved');
  return response.data;
};

export const saveWorkout = async (workoutId: string): Promise<void> => {
  await api.post(`/workouts/${workoutId}/save`);
};

export const unsaveWorkout = async (workoutId: string): Promise<void> => {
  await api.delete(`/workouts/${workoutId}/save`);
};

// --- Workout logs (history) ---

export interface GetWorkoutLogsParams {
  from?: string; // ISO date string (start of range)
  to?: string;   // ISO date string (end of range)
}

export const getWorkoutLogs = async (
  params?: GetWorkoutLogsParams
): Promise<WorkoutLog[]> => {
  const query = new URLSearchParams();
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  const response = await api.get<WorkoutLog[]>(
    `/workout-logs${query.toString() ? `?${query.toString()}` : ''}`
  );
  return response.data;
};

/** Most recent logged performance per library exercise id (weights in lb). */
export const getLastPerformance = async (
  exerciseIds: string[]
): Promise<LastPerformanceMap> => {
  const ids = exerciseIds.map((id) => id.trim()).filter((id) => id.length > 0);
  if (ids.length === 0) return {};
  const query = new URLSearchParams({ exerciseIds: ids.join(',') });
  const response = await api.get<{ results: LastPerformanceMap }>(
    `/workout-logs/last-performance?${query.toString()}`
  );
  return response.data.results ?? {};
};

/**
 * Heaviest set ever logged per library exercise id (weights in lb), across all
 * history. A separate call from `getLastPerformance` on purpose: that one is
 * bounded to the 30 most recent logs, so a "best" taken from it would celebrate
 * a lift the user beat months ago. Ids with no weighted history are absent.
 */
export const getPersonalBests = async (
  exerciseIds: string[]
): Promise<PersonalBestMap> => (await getPersonalBestRecords(exerciseIds)).byWeight;

/**
 * BOTH records in one request: the heaviest bar ever moved (`byWeight`) and the
 * strongest set ever performed (`byE1rm`). The server reduces them from the
 * same rows, so this costs no more than asking for one.
 *
 * ⚠ `byE1rm` is defaulted rather than assumed. This JS reaches phones over the
 * air, and an older API that predates the field would otherwise hand every
 * consumer `undefined` where a map is expected.
 */
export const getPersonalBestRecords = async (
  exerciseIds: string[]
): Promise<{ byWeight: PersonalBestMap; byE1rm: PersonalBestE1rmMap }> => {
  const ids = exerciseIds.map((id) => id.trim()).filter((id) => id.length > 0);
  if (ids.length === 0) return { byWeight: {}, byE1rm: {} };
  const query = new URLSearchParams({ exerciseIds: ids.join(',') });
  const response = await api.get<{
    results: PersonalBestMap;
    e1rm?: PersonalBestE1rmMap;
  }>(`/workout-logs/personal-bests?${query.toString()}`);
  return {
    byWeight: response.data.results ?? {},
    byE1rm: response.data.e1rm ?? {},
  };
};

/**
 * One exercise's recent sessions plus its all-time best. Bounded by sessions of
 * that lift rather than by a window of recent logs, so a movement trained once
 * a month still has a history.
 */
export const getExerciseHistory = async (
  exerciseId: string,
  limit?: number
): Promise<ExerciseHistory> => {
  const id = exerciseId.trim();
  // Same guard as getPersonalBests: an empty id would go out as `exerciseId=`
  // and 400 against the backend's @IsNotEmpty. The server answers untrackable
  // ids with this exact empty envelope, so resolve it locally instead.
  if (id.length === 0) return { exerciseId: id, best: null, sessions: [] };
  const query = new URLSearchParams({ exerciseId: id });
  if (limit != null) query.set('limit', String(limit));
  const response = await api.get<ExerciseHistory>(
    `/workout-logs/exercise-history?${query.toString()}`
  );
  return response.data;
};

/**
 * Session-level history for the Progress screen, over a rolling window of
 * months (server default 12). Returns raw `startedAt` instants and per-session
 * summary columns only — the client buckets them into local days and weeks, so
 * the numbers agree with the History calendar rather than with UTC.
 */
export const getWorkoutStats = async (
  months?: number
): Promise<WorkoutStats> => {
  const query = new URLSearchParams();
  if (months != null) query.set('months', String(months));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const response = await api.get<WorkoutStats>(`/workout-logs/stats${suffix}`);
  return response.data;
};
