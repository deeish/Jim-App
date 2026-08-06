import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  IsIn,
  ArrayMaxSize,
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

  /**
   * Target rep range (role-aware prescription); `reps` stays the working
   * default (= repsMin when a range is set). Clients editing a workout must
   * round-trip these or the range collapses to the scalar — the exact bug
   * that flattened "4 x 6-8" to "4 x 6" on every workout edit. (The collapse
   * came from hand-rolled frontend payloads plus the service's own field
   * lists dropping them; on the validated POST route this DTO also rejected
   * the fields outright under forbidNonWhitelisted.)
   */
  @IsOptional()
  @IsNumber()
  @Min(1)
  repsMin?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  repsMax?: number;

  /** Time-based rows (e.g. cardio bouts): duration instead of a rep range. */
  @IsOptional()
  @IsNumber()
  @Min(1)
  durationSeconds?: number;

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

  /** From exercise library when `exerciseId` resolves (preview / API responses). */
  @IsOptional()
  @IsString()
  primaryMuscleGroup?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  secondaryMuscleGroups?: string[];

  @IsOptional()
  @IsIn(['reps', 'time', 'distance'])
  prescriptionType?: 'reps' | 'time' | 'distance';
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

  /** Optional cardio finisher (not in exercises[]). Used when focus includes "+ run" or "+ cardio". */
  @IsOptional()
  cardioFinisher?: { suggestion: string };
}

/**
 * PATCH /workouts/:id body. Deliberately hand-written rather than
 * PartialType(CreateWorkoutDto): `Partial<CreateWorkoutDto>` as a parameter
 * type erases to Object, so the global ValidationPipe silently skipped PATCH
 * entirely — junk like `repsMin: "abc"` flowed straight into Prisma as a 500.
 * Only the three fields the service actually honors are accepted.
 */
export class UpdateWorkoutDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  day?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateExerciseDto)
  exercises?: CreateExerciseDto[];
}
