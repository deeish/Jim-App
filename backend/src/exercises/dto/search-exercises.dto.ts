import {
  IsOptional,
  IsString,
  IsArray,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

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

  /** Only the curated staples (the rows carrying the Recommended badge). */
  @IsOptional()
  @IsBoolean()
  recommendedOnly?: boolean;

  /**
   * Cap how many exercises come back (browse mode keeps the payload small).
   * The response `count` still reports the total number of matches.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;
}
