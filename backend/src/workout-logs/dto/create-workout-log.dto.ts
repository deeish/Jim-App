import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  IsDateString,
  IsBoolean,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CompletedSetDto {
  @IsNumber()
  @Min(1)
  setNumber: number;

  @IsNumber()
  @Min(0)
  reps: number;

  @IsOptional()
  @IsNumber()
  weight?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  rpe?: number;

  @IsBoolean()
  completed: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class WorkoutLogEntryDto {
  @IsOptional()
  @IsString()
  exerciseId?: string;

  @IsString()
  name: string;

  @IsNumber()
  @Min(0)
  orderIndex: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompletedSetDto)
  sets: CompletedSetDto[];
}

export class CreateWorkoutLogDto {
  @IsString()
  workoutId: string;

  @IsDateString()
  startedAt: string;

  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @IsOptional()
  @IsNumber()
  totalTimeSeconds?: number;

  @IsOptional()
  @IsNumber()
  totalSets?: number;

  @IsOptional()
  @IsNumber()
  totalVolume?: number;

  @IsOptional()
  @IsString()
  overallNotes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkoutLogEntryDto)
  entries: WorkoutLogEntryDto[];
}
