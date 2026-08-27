import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCrewDto {
  /** Named at creation, Clash-of-Clans style — the client requires it. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  name?: string;
}

export class JoinCrewDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  code: string;
}

export class RenameCrewDto {
  /** Blank clears the name (renders as "Your crew"). */
  @IsString()
  @MaxLength(40)
  name: string;
}

export class KudosDto {
  @IsString()
  @IsNotEmpty()
  toUserId: string;

  /**
   * The three poundable event shapes, and ALL of them belong here:
   *
   *   day:<iso>                  a session
   *   pr:<iso>:<exerciseId>      a personal record
   *   recap:<iso>                last week's winner (Mon/Tue only)
   *
   * `recap:` was missing, so every pound on the Monday recap was rejected as
   * a 400 while the summary query went on fetching `recap:` rows that could
   * never exist. The chip filled in and silently snapped back — invisible
   * because it is only reachable two days a week.
   *
   * `crewstreak:` is deliberately absent: a crew-wide milestone has no single
   * recipient, so there is nobody to pound. The service enforces that too.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  @Matches(
    /^(day:\d{4}-\d{2}-\d{2}|pr:\d{4}-\d{2}-\d{2}:[A-Za-z0-9_-]{1,120}|recap:\d{4}-\d{2}-\d{2})$/,
  )
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
