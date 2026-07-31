import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { STATS_MAX_MONTHS } from '../progress-stats';

export class StatsQueryDto {
  /** Rolling history depth in months. Omitted -> STATS_DEFAULT_MONTHS. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(STATS_MAX_MONTHS)
  months?: number;
}
