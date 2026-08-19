import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import { QUICK_MUSCLES } from '../quick-session-builder';

/** Request for POST /workouts/quick-session — the at-the-gym quick builder. */
export class QuickSessionDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(QUICK_MUSCLES as unknown as string[], { each: true })
  muscles: string[];

  @IsOptional()
  @IsString()
  goal?: string;

  /** beginner | intermediate | advanced (free text tolerated). */
  @IsOptional()
  @IsString()
  experience?: string;

  /** Available equipment; omitted = fully equipped gym. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  equipment?: string[];

  /** Avoid phrases ("bad knee", "no barbell"). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  limitations?: string[];
}
