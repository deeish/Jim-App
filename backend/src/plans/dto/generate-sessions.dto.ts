import {
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  IsBoolean,
  ValidateNested,
  IsIn,
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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SessionSpecDto)
  sessions: SessionSpecDto[];
}
