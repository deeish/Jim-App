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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SessionSpecDto)
  sessions: SessionSpecDto[];
}
