import { IsString, IsOptional, IsObject } from 'class-validator';

export class GenerateWorkoutDto {
  @IsOptional()
  @IsString()
  day?: string;

  @IsOptional()
  @IsObject()
  preferences?: {
    focus?: string; // e.g., 'upper body', 'lower body', 'cardio', 'full body'
    duration?: number; // in minutes
    difficulty?: 'beginner' | 'intermediate' | 'advanced';
    equipment?: string[]; // available equipment
  };
}
