import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  IsIn,
  Min,
  Matches,
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

  /** Monday of the calendar week when program week 1 starts (YYYY-MM-DD). */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  weekAnchorMonday?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanSlotDto)
  slots: PlanSlotDto[];

  /** User goal for workout generation (e.g. strength, hypertrophy, endurance). */
  @IsOptional()
  @IsString()
  goal?: string;

  /** Experience level (beginner, intermediate, advanced). */
  @IsOptional()
  @IsString()
  experience?: string;

  /** Available equipment for generated workouts. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  equipment?: string[];

  /** Limitations to respect (e.g. "bad knee", "no barbell"). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  limitations?: string[];

  /** Program template id for reasoning (e.g. "ppl", "upper-lower-4"). */
  @IsOptional()
  @IsString()
  programTemplateId?: string;
}
