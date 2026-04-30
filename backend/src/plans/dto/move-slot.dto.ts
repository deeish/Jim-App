import { IsString, IsIn, IsOptional, IsInt, Min } from 'class-validator';

const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export class MoveSlotDto {
  @IsString()
  @IsIn(DAYS)
  dayOfWeek: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  weekNumber?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  orderInDay?: number;
}
