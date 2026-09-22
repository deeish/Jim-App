import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { WorkoutLogEntryDto } from './create-workout-log.dto';

/**
 * The corrected sets of a logged session (GitHub #57): the whole entry list,
 * in the create shape, replacing what the log held. Timings, notes and the
 * check-in stay as they were.
 */
export class UpdateWorkoutLogSetsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkoutLogEntryDto)
  entries: WorkoutLogEntryDto[];
}
