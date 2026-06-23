import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

/** Request a single catalog exercise to swap in for `targetName` within a day. */
export class ReplaceExerciseDto {
  /** Name of the exercise being replaced (primary lookup key). */
  @IsString()
  targetName: string;

  /** Catalog id of the exercise being replaced, if known (preferred lookup). */
  @IsOptional()
  @IsString()
  targetExerciseId?: string;

  /** Names of exercises already in the day — never duplicate these. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dayExerciseNames?: string[];

  /** Catalog ids already in the day — never duplicate these. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dayExerciseIds?: string[];

  /** Available equipment context; 'home' restricts to home-doable gear. */
  @IsOptional()
  @IsIn(['gym', 'home'])
  location?: 'gym' | 'home';

  /** Injury / equipment phrases to avoid. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  avoid?: string[];
}
