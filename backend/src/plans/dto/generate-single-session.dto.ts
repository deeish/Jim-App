import { IsString, IsOptional, IsArray, IsNumber, IsBoolean, IsIn } from 'class-validator';

export class GenerateSingleSessionDto {
  @IsOptional()
  @IsString()
  goal?: string;

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
}
