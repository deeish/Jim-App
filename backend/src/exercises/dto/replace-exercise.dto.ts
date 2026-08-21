import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

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

  /** The user's actual equipment (catalog display names, e.g. 'Dumbbell',
   *  'Resistance Band'). When present it overrides `location`. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  equipment?: string[];

  /** How many ranked suggestions to return (replace-suggestions only). */
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

  /** Catalog ids planned/logged on OTHER days of the same week — variety
   *  ranking demotes these so Thursday isn't handed Monday's lift. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  weekExerciseIds?: string[];

  /** Names planned/logged on OTHER days of the same week (id-less rows). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  weekExerciseNames?: string[];

  /** The user's training goal (e.g. 'Strength', 'Hypertrophy', 'Fat loss').
   *  Free string — normalized server-side so client version skew is safe. */
  @IsOptional()
  @IsString()
  goal?: string;

  /** The user's experience level ('Beginner' | 'Intermediate' | 'Advanced').
   *  Free string — normalized server-side. Beginner sinks high-skill lifts. */
  @IsOptional()
  @IsString()
  experience?: string;
}
