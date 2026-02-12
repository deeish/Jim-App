import { IsString, IsOptional, IsObject } from 'class-validator';

export class GenerateWorkoutDto {
  @IsOptional()
  @IsString()
  day?: string;

  /** When set, recent workouts are used to avoid repeating the same exercises (variety). */
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsObject()
  preferences?: {
    focus?: string; // e.g., 'upper body', 'lower body', 'cardio', 'full body'
    duration?: number; // in minutes
    difficulty?: 'beginner' | 'intermediate' | 'advanced';
    equipment?: string[]; // available equipment
    /** User goal: strength, hypertrophy/muscle, endurance, fat loss, hybrid */
    goal?: string;
    /** Experience level (can align with difficulty) */
    experience?: string;
    /** Limitations to respect: e.g. "bad knee", "no barbell", "home only" */
    limitations?: string[];
    /** Program template id (e.g. "ppl", "upper-lower-4") for reasoning */
    programTemplateId?: string;
    /** This day's role in the program (e.g. "Push", "Upper 1") for reasoning */
    programDayFocus?: string;
    /** "simple" = fewer exercises, shorter reasoning; "detailed" = more exercises, longer warmup/cooldown/reasoning */
    detailLevel?: 'simple' | 'detailed';
    /** Exercise IDs to exclude (e.g. already used this week) for variety */
    excludeExerciseIds?: string[];
    /** Exercise names to exclude (e.g. "Deadlift") when replacing one exercise */
    excludeExerciseNames?: string[];
  };
}
