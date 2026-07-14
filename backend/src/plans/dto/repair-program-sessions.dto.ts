import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
  ArrayMaxSize,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SessionSpecDto, WeekProgressionDto } from './generate-sessions.dto';

/**
 * Deterministic library repair on an already-generated program (same ordering as
 * `GenerateSessionsDto.sessions`). Used after partial week regen to re-dedupe
 * exercise ids within each week of the merged list.
 */
export class RepairProgramSessionsDto {
  @IsOptional()
  @IsString()
  goal?: string;

  /** Accepted because the client spreads its generate request into this call; unused by repair. */
  @IsOptional()
  @IsString()
  secondaryGoal?: string;

  /** Accepted for the same reason; unused by repair. */
  @IsOptional()
  @IsString()
  @MaxLength(280)
  restrictions?: string;

  @IsOptional()
  @IsString()
  @IsIn(['gym', 'home'])
  location?: 'gym' | 'home';

  /**
   * Drives enrichment rep bands and working-set caps. The client has always
   * sent this (it spreads `buildGenerateSessionsRequest` into the repair
   * body), but the field was missing here — with `forbidNonWhitelisted` the
   * whole request 400'd and the client silently skipped repair.
   */
  @IsOptional()
  @IsString()
  @IsIn(['beginner', 'intermediate', 'advanced'])
  experienceLevel?: 'beginner' | 'intermediate' | 'advanced';

  /** Accepted because the client sends it; batch-prompt-only, unused by repair. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  mesoHint?: string;

  /** Accepted because the client sends it; unused by repair. */
  @IsOptional()
  @IsString()
  @IsIn(['0', '1-2', '3-4', '5+'])
  currentActivityLevel?: string;

  /** Accepted because the client sends it; unused by repair. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  preferredExercises?: string[];

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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(16, { each: true })
  cardioModalities?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(12)
  @MaxLength(32, { each: true })
  equipmentTags?: string[];

  /** Per-week intensity and volume targets; re-applied after enrichment re-bands prescriptions. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => WeekProgressionDto)
  weekProgression?: WeekProgressionDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SessionSpecDto)
  sessions!: SessionSpecDto[];

  /** Same length and order as `sessions`; shape matches generate-sessions output rows. */
  @IsArray()
  generatedSessions!: Record<string, unknown>[];
}
