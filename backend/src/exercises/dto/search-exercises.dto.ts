import { IsOptional, IsString, IsArray } from 'class-validator';

export class SearchExercisesDto {
  @IsOptional()
  @IsString()
  searchQuery?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  muscleGroups?: string[]; // Main groups: Chest, Back, Legs, etc.

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subMuscles?: string[]; // Specific muscles: Upper Chest, Lats, etc.

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  equipment?: string[]; // Equipment: Barbell, Dumbbell, etc.

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  movementPatterns?: string[]; // Push, Pull, Squat, etc.
}
