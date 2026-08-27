import type { ExercisePrescriptionType } from '../lib/exercisePrescription';

export interface Exercise {
  id?: string;
  name: string;
  sets: number;
  reps: number;
  /**
   * Target rep range (goal × difficulty × role). When present, the UI shows
   * `repsMin–repsMax` on every surface; `reps` is the working default (= repsMin).
   * Undefined on cardio/time rows and legacy rows saved before this existed.
   */
  repsMin?: number;
  repsMax?: number;
  /** Duration in seconds for time-based rows (cardio bouts). */
  durationSeconds?: number;
  weight?: number;
  notes?: string;
  exerciseId?: string; // Link to exercise library
  orderIndex?: number;
  primaryMuscleGroup?: string;
  /** When API sends it (often omitted on persisted rows); UI infers time from name + cardio patterns. */
  prescriptionType?: ExercisePrescriptionType;
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
  /** Omit from progress and from saved history (e.g. "skip for today"). */
  skipped?: boolean;
  notes?: string;
  startTime?: Date;
  endTime?: Date;
}

// Last performance (most recent logged entry per library exercise id)
export interface LastPerformedSet {
  setNumber: number;
  reps: number;
  /** Canonical pounds; null for bodyweight/unweighted sets. */
  weight: number | null;
}

export interface LastExercisePerformance {
  workoutLogId: string;
  performedAt: string; // ISO
  /** Completed sets only, ordered by setNumber. Never empty. */
  sets: LastPerformedSet[];
}

/** Keyed by library exercise id; ids with no history are absent. */
export type LastPerformanceMap = Record<string, LastExercisePerformance>;

/**
 * Heaviest set ever logged for an exercise, across all of the user's history.
 *
 * Deliberately a separate read from `LastPerformanceMap`, which is bounded to
 * the 30 most recent logs (~7 weeks): a "best" reduced over that window is a
 * recent best, and celebrating it as a personal best is simply false for anyone
 * who lifted heavier before it.
 */
export interface PersonalBest {
  /** Canonical pounds; always > 0 (unweighted sets set no load record). */
  weightLb: number;
  /** Reps performed at that weight. */
  reps: number;
  performedAt: string; // ISO
}

/** Keyed by library exercise id; ids with no weighted history are absent. */
export type PersonalBestMap = Record<string, PersonalBest>;

/**
 * One logged session from `GET /workout-logs/stats` — a narrow projection with
 * no entries and no sets, so a year of history stays small over mobile data.
 */
export interface WorkoutStatsSession {
  id: string;
  /**
   * Raw ISO instant. Bucket this into the *device's* local day, never a UTC
   * one, or totals disagree with the History calendar the user is looking at.
   */
  startedAt: string;
  completedAt: string | null;
  totalTimeSeconds: number | null;
  totalSets: number | null;
  /** Canonical pounds; null or 0 whenever the session logged no weighted sets. */
  totalVolume: number | null;
  workoutName: string | null;
}

export interface WorkoutStatsTotals {
  sessionCount: number;
  totalSets: number;
  totalTimeSeconds: number;
  totalVolumeLb: number;
  /** Sessions that recorded any weighted volume. */
  sessionsWithVolume: number;
}

export interface WorkoutStats {
  /** Rolling window actually served, in months. */
  months: number;
  rangeStart: string;
  totals: WorkoutStatsTotals;
  /** Newest first. */
  sessions: WorkoutStatsSession[];
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
