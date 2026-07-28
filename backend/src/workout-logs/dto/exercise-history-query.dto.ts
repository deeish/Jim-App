import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { EXERCISE_HISTORY_MAX_SESSIONS } from '../progress-stats';

export class ExerciseHistoryQueryDto {
  /** A single library exercise id. */
  @IsString()
  @IsNotEmpty()
  exerciseId: string;

  /** Sessions to return. Omitted -> EXERCISE_HISTORY_DEFAULT_SESSIONS. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(EXERCISE_HISTORY_MAX_SESSIONS)
  limit?: number;
}
