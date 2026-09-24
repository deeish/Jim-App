import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { HEAT_MAX_DAYS } from '../muscle-heat';

export class MuscleHeatQueryDto {
  /** Rolling window in days. Omitted -> HEAT_DEFAULT_DAYS. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(HEAT_MAX_DAYS)
  days?: number;
}
