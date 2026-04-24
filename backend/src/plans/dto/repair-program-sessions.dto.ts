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
import { SessionSpecDto } from './generate-sessions.dto';

/**
 * Deterministic library repair on an already-generated program (same ordering as
 * `GenerateSessionsDto.sessions`). Used after partial week regen to re-dedupe
 * exercise ids across the full merged list.
 */
export class RepairProgramSessionsDto {
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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SessionSpecDto)
  sessions!: SessionSpecDto[];

  /** Same length and order as `sessions`; shape matches generate-sessions output rows. */
  @IsArray()
  generatedSessions!: Record<string, unknown>[];
}
