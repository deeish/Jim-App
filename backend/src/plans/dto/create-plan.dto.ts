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

const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
const TYPES = ['strength', 'cardio', 'recovery'];
const INTENSITIES = ['Easy', 'Medium', 'Hard'];

export class PlanSlotExerciseDto {
  @IsString()
  exerciseId: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsNumber()
  @Min(1)
  sets: number;

  @IsNumber()
  @Min(1)
  reps: number;

  /** Target rep range low end (role-aware prescription). Defaults to `reps` when absent. */
  @IsOptional()
  @IsNumber()
  @Min(1)
  repsMin?: number;

  /** Target rep range high end. */
  @IsOptional()
  @IsNumber()
  @Min(1)
  repsMax?: number;

  /** Duration in seconds for time-based rows (cardio bouts). */
  @IsOptional()
  @IsNumber()
  @Min(1)
  durationSeconds?: number;

  @IsOptional()
  @IsNumber()
  weight?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  orderIndex?: number;

  /** Prescription type — persisted to plan_exercises / workout_exercises. */
  @IsOptional()
  @IsIn(['reps', 'time', 'distance'])
  prescriptionType?: 'reps' | 'time' | 'distance';
}

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

  /** Exercises from preview / library apply (skips server LLM for this slot when present). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanSlotExerciseDto)
  exercises?: PlanSlotExerciseDto[];
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

  /** Optional secondary emphasis blended into generation. */
  @IsOptional()
  @IsString()
  secondaryGoal?: string;

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
