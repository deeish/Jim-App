import axios from 'axios';
import { API_BASE_URL } from '../config/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

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
