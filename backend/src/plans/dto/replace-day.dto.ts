import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PlanSlotDto } from './create-plan.dto';

const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/**
 * "Set this program day to exactly this one slot" (or to nothing, when
 * `slot` is null/absent: a genuine rest day).
 *
 * Exists because the calendar used to rebuild an edited day as two requests
 * — add the new slot, then remove the old one(s). When the second request
 * was lost (signal drop, app backgrounded mid-write) the day held both, and
 * the retry read that doubled day back as "the day" and wrote it into one
 * slot: the tester's "same five exercises listed twice" (build 32,
 * 2026-09-15). One request, one transaction, and repeating it is harmless.
 */
export class ReplaceDayDto {
  @IsNumber()
  @Min(1)
  weekNumber: number;

  @IsString()
  @IsIn(DAYS)
  dayOfWeek: string;

  /** The slot the day becomes. Its own weekNumber/dayOfWeek are ignored in
   *  favour of the two above. Omit (or send null) to clear the day. */
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanSlotDto)
  slot?: PlanSlotDto | null;
}
