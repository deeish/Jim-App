import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateExerciseDto {
  @IsString()
  name: string;

  @IsNumber()
  @Min(1)
  sets: number;

  @IsNumber()
  @Min(1)
  reps: number;

  @IsOptional()
  @IsNumber()
  weight?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Library exercise id (e.g. from exercises API). Links to reference data. */
  @IsOptional()
  @IsString()
  exerciseId?: string;

  /** Order within the workout. Defaults to array index when creating. */
  @IsOptional()
  @IsNumber()
  orderIndex?: number;
}

export class CreateWorkoutDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  day?: string;

  /** Short personable explanation of why this workout on this day (e.g. from LLM). */
  @IsOptional()
  @IsString()
  reasoning?: string;

  /** Optional warm-up instructions (1-2 sentences from LLM). */
  @IsOptional()
  @IsString()
  warmUp?: string;

  /** Optional cool-down instructions (1-2 sentences from LLM). */
  @IsOptional()
  @IsString()
  coolDown?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateExerciseDto)
  exercises: CreateExerciseDto[];
}
