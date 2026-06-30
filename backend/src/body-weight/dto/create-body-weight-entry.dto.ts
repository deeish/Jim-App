import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
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

  /** Weigh-in date (ISO). Defaults to now when omitted. */
  @IsOptional()
  @IsDateString()
  loggedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;
}
