import { api } from '../api/client';

export interface Exercise {
  id: string;
  name: string;
  aliases?: string[];
  description?: string;
  primaryMuscleGroup: string;
  subMuscles: string[];
  secondaryMuscleGroups: string[];
  equipment: string[];
  movementPatterns: string[];
  difficulty?: string;
  instructions?: string[];
  /** YouTube video ID for demo video on detail screen (from backend exercise-videos.json). */
  youtubeId?: string;
  [key: string]: any; // Allow other fields
}

export interface SearchExercisesParams {
  searchQuery?: string;
  muscleGroups?: string[];
  subMuscles?: string[];
  equipment?: string[];
  movementPatterns?: string[];
}

export interface SearchExercisesResponse {
  count: number;
  exercises: Exercise[];
}

export interface ExerciseStats {
  total: number;
  byMuscleGroup: Record<string, number>;
  byEquipment: Record<string, number>;
  byMovementPattern: Record<string, number>;
}

/**
 * Ask the backend for one catalog exercise to swap in for `targetName` within a
 * day: same primary muscle, not already in the day, and not the same movement
 * pattern as another exercise that day. Returns null when nothing fits.
 */
export async function replaceExercise(body: {
  targetName: string;
  targetExerciseId?: string;
  dayExerciseNames?: string[];
  dayExerciseIds?: string[];
  location?: 'gym' | 'home';
  avoid?: string[];
}): Promise<Exercise | null> {
  const res = await api.post<{ exercise: Exercise | null }>(
    '/exercises/replace',
    body,
  );
  return res.data.exercise ?? null;
}

/**
 * Search exercises with filters
 */
export const searchExercises = async (
  params: SearchExercisesParams
): Promise<SearchExercisesResponse> => {
  const response = await api.post<SearchExercisesResponse>('/exercises/search', params);
  return response.data;
};

/**
 * Get all exercises
 */
export const getAllExercises = async (): Promise<Exercise[]> => {
  const response = await api.get<Exercise[]>('/exercises');
  return response.data;
};

/**
 * Get exercise by ID
 */
export const getExerciseById = async (id: string): Promise<Exercise> => {
  const response = await api.get<Exercise>(`/exercises/${id}`);
  return response.data;
};

/**
 * Get exercise statistics
 */
export const getExerciseStats = async (): Promise<ExerciseStats> => {
  const response = await api.get<ExerciseStats>('/exercises/stats');
  return response.data;
};

// --- Saved / liked exercises (Find Workouts) ---

export const getSavedExerciseIds = async (): Promise<string[]> => {
  try {
    const response = await api.get<{ exerciseIds: string[] }>('/exercises/saved/ids');
    const ids = response.data.exerciseIds;
    if (__DEV__) console.log('[exerciseService] getSavedExerciseIds OK', ids?.length ?? 0, 'ids:', ids);
    return ids;
  } catch (e) {
    if (__DEV__) console.warn('[exerciseService] getSavedExerciseIds failed', e);
    throw e;
  }
};

/** Full exercise objects for the user's saved list (for "Saved exercises" view). */
export const getSavedExercises = async (): Promise<Exercise[]> => {
  try {
    const response = await api.get<{ exercises: Exercise[] }>('/exercises/saved');
    const list = response.data.exercises ?? [];
    if (__DEV__) console.log('[exerciseService] getSavedExercises OK', list.length);
    return list;
  } catch (e) {
    if (__DEV__) console.warn('[exerciseService] getSavedExercises failed', e);
    throw e;
  }
};

export const saveExercise = async (exerciseId: string): Promise<void> => {
  try {
    await api.post(`/exercises/${encodeURIComponent(exerciseId)}/save`);
    if (__DEV__) console.log('[exerciseService] saveExercise OK', exerciseId);
  } catch (e) {
    if (__DEV__) console.warn('[exerciseService] saveExercise failed', exerciseId, e);
    throw e;
  }
};

export const unsaveExercise = async (exerciseId: string): Promise<void> => {
  try {
    await api.delete(`/exercises/${encodeURIComponent(exerciseId)}/save`);
    if (__DEV__) console.log('[exerciseService] unsaveExercise OK', exerciseId);
  } catch (e) {
    if (__DEV__) console.warn('[exerciseService] unsaveExercise failed', exerciseId, e);
    throw e;
  }
};
