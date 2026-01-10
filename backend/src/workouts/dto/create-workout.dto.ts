import { IsString, IsOptional, IsArray, ValidateNested, IsNumber, Min } from 'class-validator';
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
}

export class CreateWorkoutDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  day?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateExerciseDto)
  exercises: CreateExerciseDto[];
}
