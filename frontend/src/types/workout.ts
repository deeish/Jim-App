export interface Exercise {
  id?: string;
  name: string;
  sets: number;
  reps: number;
  weight?: number;
  notes?: string;
  exerciseId?: string; // Link to exercise library
  orderIndex?: number;
  primaryMuscleGroup?: string;
  targetMuscles?: string[];
}

export interface Workout {
  id: string;
  name: string;
  day?: string;
  exercises: Exercise[];
  createdAt?: string;
  updatedAt?: string;
  estimatedDuration?: number; // in minutes
  focus?: string; // e.g., "Full Body", "Push", "Legs"
  /** Short explanation of why this workout on this day (from AI). */
  reasoning?: string | null;
  /** Optional warm-up instructions (from AI). */
  warmUp?: string | null;
  /** Optional cool-down instructions (from AI). */
  coolDown?: string | null;
  /** When workout was created from a plan slot, links to PlanWorkout.id */
  planWorkoutId?: string | null;
  /** True if the current user has saved this workout (from API). */
  saved?: boolean;
}

// Workout session types
export interface CompletedSet {
  setNumber: number;
  reps: number;
  weight?: number;
  rpe?: number; // Rate of Perceived Exertion (1-10)
  completed: boolean;
  notes?: string;
}

export interface ExerciseSession {
  exerciseIndex: number;
  exercise: Exercise;
  completedSets: CompletedSet[];
  notes?: string;
  startTime?: Date;
  endTime?: Date;
}

export interface WorkoutSessionState {
  workout: Workout;
  exercises: ExerciseSession[];
  currentExerciseIndex: number;
  startTime: Date;
  endTime?: Date;
  overallNotes?: string;
  restTimerSeconds?: number; // Default rest time in seconds
  isResting: boolean;
  restTimeRemaining: number;
  restTimerPaused: boolean;
}

// Workout log (history) types
export interface WorkoutLogEntrySet {
  setNumber: number;
  reps: number;
  weight?: number;
  rpe?: number;
  completed: boolean;
  notes?: string;
}

export interface WorkoutLogEntry {
  id: string;
  exerciseId: string;
  name: string | null;
  orderIndex: number;
  notes: string | null;
  completedSets: WorkoutLogEntrySet[];
}

export interface WorkoutLog {
  id: string;
  workoutId: string;
  startedAt: string;
  completedAt: string | null;
  totalTimeSeconds: number | null;
  totalSets: number | null;
  totalVolume: number | null;
  overallNotes: string | null;
  workout: Workout;
  entries: WorkoutLogEntry[];
}
