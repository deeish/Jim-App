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
  /**
   * Server-computed grouping key (name minus equipment words). Equipment variants
   * of one lift share it; angle/stance variants get their own.
   */
  groupKey?: string;
  /**
   * Progression-ladder neighbors, present only on GET /exercises/:id and
   * only for exercises that sit on a ladder (push-up, pull-up, squat, …).
   */
  progressions?: {
    easier: { id: string; name: string }[];
    harder: { id: string; name: string }[];
  };
  /**
   * "Watch Out For" coaching cues (common mistake; fix). Present only on
   * GET /exercises/:id for rows with authored cues.
   */
  formCues?: string[];
  /**
   * Joints this exercise places outsized demand on (display labels, e.g.
   * "Shoulders"). Present only on GET /exercises/:id when non-empty.
   */
  jointDemands?: string[];
  /** True for the curated staples — drives the Recommended star and filter. */
  recommended?: boolean;
  /**
   * Quality grade from the catalog audit (S best → D), shown as the
   * "Jim score" fact on the detail screen. Absent for ungraded rows.
   * Display only — never filter or sort by it client-side.
   */
  tier?: 'S' | 'A' | 'B' | 'C' | 'D';
  [key: string]: any; // Allow other fields
}

export interface SearchExercisesParams {
  searchQuery?: string;
  muscleGroups?: string[];
  subMuscles?: string[];
  equipment?: string[];
  movementPatterns?: string[];
  /** Only the curated staples (the rows carrying the Recommended badge). */
  recommendedOnly?: boolean;
  /** Cap the exercises array (browse mode). `count` still reports total matches. */
  limit?: number;
}

export interface SearchExercisesResponse {
  /** Total matches, which can exceed exercises.length when `limit` capped the list. */
  count: number;
  exercises: Exercise[];
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

/** One ranked row of the replace picker's recommendation rail. */
export interface ReplaceSuggestion {
  exercise: Exercise;
  /** Short why-tags, strongest first (max 2), e.g. "Easier version". */
  reasons: string[];
}

/**
 * Ranked top-N alternatives for one exercise, each with why-tags — powers the
 * replace picker's pinned recommendation rail. `equipment` takes the user's
 * real gear list (catalog display names) and overrides `location`.
 */
export async function getReplaceSuggestions(body: {
  targetName: string;
  targetExerciseId?: string;
  dayExerciseNames?: string[];
  dayExerciseIds?: string[];
  equipment?: string[];
  count?: number;
  avoid?: string[];
  /** Exercises on OTHER days of the same week — ranking keeps the week varied. */
  weekExerciseIds?: string[];
  weekExerciseNames?: string[];
  /** User profile context — beginner gating + goal-fit ranking. */
  goal?: string;
  experience?: string;
}): Promise<ReplaceSuggestion[]> {
  const res = await api.post<{ suggestions: ReplaceSuggestion[] }>(
    '/exercises/replace-suggestions',
    body,
  );
  return res.data.suggestions ?? [];
}

/**
 * Ranked exercises that COMPLETE a day (uncovered sub-muscles, missing
 * anchor/finisher, history-aware) — powers the add picker's recommendation
 * rail. Same why-tag shape as the replace rail.
 */
export async function getAddSuggestions(body: {
  dayExerciseNames?: string[];
  dayExerciseIds?: string[];
  equipment?: string[];
  count?: number;
  avoid?: string[];
  weekExerciseIds?: string[];
  weekExerciseNames?: string[];
  goal?: string;
  experience?: string;
}): Promise<ReplaceSuggestion[]> {
  const res = await api.post<{ suggestions: ReplaceSuggestion[] }>(
    '/exercises/add-suggestions',
    body,
  );
  return res.data.suggestions ?? [];
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
 * Get exercise by ID
 */
export const getExerciseById = async (id: string): Promise<Exercise> => {
  const response = await api.get<Exercise>(`/exercises/${id}`);
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
