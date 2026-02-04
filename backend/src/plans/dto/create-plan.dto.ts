import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  IsIn,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TYPES = ['strength', 'cardio', 'recovery'];
const INTENSITIES = ['Easy', 'Medium', 'Hard'];

export class PlanSlotDto {
  @IsNumber()
  @Min(1)
  weekNumber: number;

  @IsString()
  @IsIn(DAYS)
  dayOfWeek: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  detailLine?: string;

  @IsString()
  @IsIn(TYPES)
  type: string;

  @IsNumber()
  @Min(0)
  durationMinutes: number;

  @IsOptional()
  @IsString()
  @IsIn(INTENSITIES)
  intensity?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  orderInDay?: number;
}

export class CreatePlanDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanSlotDto)
  slots: PlanSlotDto[];
}
