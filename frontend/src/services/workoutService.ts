import { Workout, WorkoutLog, ExerciseSession } from '../types/workout';
import { api } from '../api/client';

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
  const response = await api.patch(`/workouts/${id}`, workout);
  return response.data;
};

export const deleteWorkout = async (id: string): Promise<void> => {
  await api.delete(`/workouts/${id}`);
};

// --- Workout logs (history) ---

export interface SaveWorkoutLogParams {
  workout: Workout;
  exercises: ExerciseSession[];
  startTime: Date;
  endTime: Date;
  totalTime: number;
  totalSets: number;
  totalVolume: number;
  overallNotes?: string;
  exerciseNotes?: Record<number, string>;
}

export const saveWorkoutLog = async (params: SaveWorkoutLogParams): Promise<WorkoutLog> => {
  const {
    workout,
    exercises,
    startTime,
    endTime,
    totalTime,
    totalSets,
    totalVolume,
    overallNotes,
    exerciseNotes = {},
  } = params;

  let workoutId = workout.id;
  if (!workoutId) {
    const created = await createWorkout({
      name: workout.name,
      day: workout.day,
      estimatedDuration: workout.estimatedDuration,
      focus: workout.focus,
      exercises: workout.exercises.map((e) => ({
        name: e.name,
        sets: e.sets,
        reps: e.reps,
        weight: e.weight,
        notes: e.notes,
        exerciseId: e.exerciseId,
      })),
    });
    workoutId = created.id;
  }

  const response = await api.post<WorkoutLog>('/workout-logs', {
    workoutId,
    startedAt: startTime.toISOString(),
    completedAt: endTime.toISOString(),
    totalTimeSeconds: totalTime,
    totalSets,
    totalVolume,
    overallNotes: overallNotes ?? undefined,
    entries: exercises.map((es) => ({
      exerciseId: es.exercise.exerciseId ?? undefined,
      name: es.exercise.name,
      orderIndex: es.exerciseIndex,
      notes: exerciseNotes[es.exerciseIndex] ?? undefined,
      sets: es.completedSets.map((s) => ({
        setNumber: s.setNumber,
        reps: s.reps,
        weight: s.weight,
        rpe: s.rpe,
        completed: s.completed,
        notes: s.notes,
      })),
    })),
  });
  return response.data;
};

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

export const getWorkoutLogById = async (id: string): Promise<WorkoutLog> => {
  const response = await api.get<WorkoutLog>(`/workout-logs/${id}`);
  return response.data;
};
