import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBodyWeightEntryDto {
  /** Body weight in pounds (canonical unit — see frontend weightDisplay.ts). */
  @IsNumber()
  @Min(1)
  @Max(1500)
  weightLb: number;

  /** Weigh-in instant (ISO). Defaults to now when omitted. */
  @IsOptional()
  @IsDateString()
  loggedAt?: string;

  /**
   * The user's local calendar day (YYYY-MM-DD) for the weigh-in — one entry
   * per day. Falls back to loggedAt's UTC day when omitted.
   */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dayKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;
}
