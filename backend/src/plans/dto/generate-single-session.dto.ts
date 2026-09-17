import {
  IsString,
  IsOptional,
  IsArray,
  ArrayMaxSize,
  IsNumber,
  IsBoolean,
  IsIn,
} from 'class-validator';

export class GenerateSingleSessionDto {
  @IsOptional()
  @IsString()
  goal?: string;

  /** Optional secondary emphasis blended into generation. */
  @IsOptional()
  @IsString()
  secondaryGoal?: string;

  @IsOptional()
  @IsString()
  @IsIn(['gym', 'home'])
  location?: 'gym' | 'home';

  @IsOptional()
  @IsString()
  @IsIn(['simple', 'detailed'])
  detailLevel?: 'simple' | 'detailed';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  avoidConstraints?: string[];

  @IsString()
  @IsIn(['strength', 'cardio', 'recovery'])
  type: 'strength' | 'cardio' | 'recovery';

  @IsOptional()
  @IsString()
  title?: string;

  @IsNumber()
  durationMin: number;

  @IsNumber()
  durationMax: number;

  @IsBoolean()
  isHardDay: boolean;

  @IsNumber()
  weekIndex: number;

  @IsString()
  weekday: string;

  /** Exercise names to exclude (e.g. "Conventional Deadlift") so the generator picks alternatives. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludeExerciseNames?: string[];

  /** The user's level. Used to be inferred as advanced/intermediate from
   *  `isHardDay`, which stamped a beginner's hard day with the advanced band. */
  @IsOptional()
  @IsString()
  @IsIn(['beginner', 'intermediate', 'advanced'])
  experienceLevel?: 'beginner' | 'intermediate' | 'advanced';

  /** Cardio modality preferences, same whitelist as the plan request. A
   *  regenerated cardio day used to lose them (docs/future.md, issue 4). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  cardioModalities?: string[];
}
