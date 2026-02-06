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
  };
}
