import axios from 'axios';
import { Workout } from '../types/workout';
import { API_BASE_URL } from '../config/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const getWeeklyWorkouts = async (): Promise<Workout[]> => {
  const response = await api.get('/workouts/weekly');
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

export const createWorkout = async (workout: Partial<Workout>): Promise<Workout> => {
  const response = await api.post('/workouts', workout);
  return response.data;
};

export const updateWorkout = async (id: string, workout: Partial<Workout>): Promise<Workout> => {
  const response = await api.put(`/workouts/${id}`, workout);
  return response.data;
};

export const deleteWorkout = async (id: string): Promise<void> => {
  await api.delete(`/workouts/${id}`);
};
