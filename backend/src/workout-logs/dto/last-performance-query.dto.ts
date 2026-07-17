import { IsNotEmpty, IsString } from 'class-validator';

export class LastPerformanceQueryDto {
  /** Comma-separated library exercise ids. */
  @IsString()
  @IsNotEmpty()
  exerciseIds: string;
}
