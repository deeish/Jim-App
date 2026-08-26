import {
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class JoinCrewDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  code: string;
}

export class KudosDto {
  @IsString()
  @IsNotEmpty()
  toUserId: string;

  /** "day:<iso>" or "pr:<iso>:<exerciseId>" — shape-checked so a member
   *  can't mint unbounded junk kudos rows. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  @Matches(/^(day:\d{4}-\d{2}-\d{2}|pr:\d{4}-\d{2}-\d{2}:.+)$/)
  eventRef: string;
}

export class CrewSummaryQueryDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  today: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  weekMonday: string;

  /** Caller's Date.getTimezoneOffset() — minutes to SUBTRACT from local time. */
  @Type(() => Number)
  @IsInt()
  @Min(-14 * 60)
  @Max(14 * 60)
  tz: number;
}
