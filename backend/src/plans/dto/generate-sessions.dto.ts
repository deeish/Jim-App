import {
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  IsBoolean,
  ValidateNested,
  IsIn,
  ArrayMaxSize,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class WeekProgressionDto {
  /** 1-based week number within this preview chunk. */
  @IsNumber()
  weekIndex: number;

  /** Phase label: 'foundation' | 'progression' | 'peak' | 'deload' | 'maintain' */
  @IsString()
  @MaxLength(20)
  phase: string;

  /** Intensity as approximate % of working max, e.g. 65, 70, 75, 60 */
  @IsNumber()
  intensityPct: number;

  /** Set volume multiplier relative to baseline: 1.0 = normal, 1.15 = +15%, 0.7 = deload */
  @IsNumber()
  volumeMultiplier: number;

  /** Rep modifier vs base scheme: 0 = same, -1 = 1 fewer rep (heavier), +2 = 2 more reps (lighter) */
  @IsNumber()
  repModifier: number;
}

export class SessionSpecDto {
  @IsIn(['strength', 'cardio', 'recovery'])
  type: 'strength' | 'cardio' | 'recovery';

  @IsOptional()
  @IsString()
  title?: string;

  @IsNumber()
  durationMin: number;

  @IsNumber()
  durationMax: number;

  @IsBoolean()
  isHardDay: boolean;

  @IsNumber()
  weekIndex: number;

  @IsString()
  weekday: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  avoidConstraints?: string[];
}

export class GenerateSessionsDto {
  @IsOptional()
  @IsString()
  goal?: string;

  @IsOptional()
  @IsString()
  @IsIn(['gym', 'home'])
  location?: 'gym' | 'home';

  @IsOptional()
  @IsString()
  @IsIn(['simple', 'detailed'])
  detailLevel?: 'simple' | 'detailed';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  avoidConstraints?: string[];

  @IsOptional()
  @IsBoolean()
  makeItEasier?: boolean;

  /** Ordered hints (run, bike, swim, row, elliptical); unknown values dropped server-side. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(16, { each: true })
  cardioModalities?: string[];

  /** beginner | intermediate | advanced — batch set/rep + difficulty */
  @IsOptional()
  @IsString()
  @IsIn(['beginner', 'intermediate', 'advanced'])
  experienceLevel?: 'beginner' | 'intermediate' | 'advanced';

  /**
   * Gym checklist ids from Generate Plan (e.g. barbell, dumbbells). Mapped to library equipment.
   * Ignored when location is home.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(12)
  @MaxLength(32, { each: true })
  equipmentTags?: string[];

  /** Short periodization / preview-scope hint for batch Groq only */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  mesoHint?: string;

  /** Per-week intensity and volume targets computed by the client. Max 12 weeks. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => WeekProgressionDto)
  weekProgression?: WeekProgressionDto[];

  /** User's current activity level outside the gym. */
  @IsOptional()
  @IsString()
  @IsIn(['0', '1-2', '3-4', '5+'])
  currentActivityLevel?: string;

  /** Preferred movements/lifts from the UI (max 8, 40 chars each). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  preferredExercises?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SessionSpecDto)
  sessions: SessionSpecDto[];
}
