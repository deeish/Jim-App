export interface Exercise {
  name: string;
  sets: number;
  reps: number;
  weight?: number;
  notes?: string;
}

export interface Workout {
  id: string;
  name: string;
  day?: string;
  exercises: Exercise[];
  createdAt?: string;
  updatedAt?: string;
}
