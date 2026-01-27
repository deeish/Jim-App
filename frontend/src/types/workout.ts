export interface Exercise {
  name: string;
  sets: number;
  reps: number;
  weight?: number;
  notes?: string;
  exerciseId?: string; // Link to exercise library
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
