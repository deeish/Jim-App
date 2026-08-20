import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/**
 * Request ranked ADD suggestions for a day: exercises that complete the
 * workout (uncovered sub-muscles, missing compound anchor / isolation
 * finisher) rather than more of what's already there.
 */
export class SuggestAdditionsDto {
  /** Names of exercises already in the day — the workout being completed. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dayExerciseNames?: string[];

  /** Catalog ids already in the day. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dayExerciseIds?: string[];

  /** Available equipment context; 'home' restricts to home-doable gear. */
  @IsOptional()
  @IsIn(['gym', 'home'])
  location?: 'gym' | 'home';

  /** The user's actual equipment (catalog display names). Overrides location. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  equipment?: string[];

  /** How many ranked suggestions to return. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  count?: number;

  /** Injury / equipment phrases to avoid. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  avoid?: string[];

  /** Catalog ids planned/logged on OTHER days of the same week. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  weekExerciseIds?: string[];

  /** Names planned/logged on OTHER days of the same week. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  weekExerciseNames?: string[];

  /** The user's training goal. Free string, normalized server-side. */
  @IsOptional()
  @IsString()
  goal?: string;

  /** The user's experience level. Free string, normalized server-side. */
  @IsOptional()
  @IsString()
  experience?: string;
}
