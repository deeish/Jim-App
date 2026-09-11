import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Body of POST /plans/me/workarounds: swap the exercises of the signed-in
 * user's current plan that load the given joints, from a program week on.
 * The one route that rewrites an existing plan's rows, and only on the
 * user's explicit "swap in my current plan too".
 */
export class ApplyWorkaroundsDto {
  /** Work-arounds in the plan vocabulary ("knees", "lower back", …). */
  @IsArray()
  @IsString({ each: true })
  limitations!: string[];

  /** The user's equipment (catalog display names), so alternatives are doable. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  equipment?: string[];

  @IsOptional()
  @IsString()
  goal?: string;

  @IsOptional()
  @IsString()
  experience?: string;

  /** First program week to touch (1-based). Earlier weeks are history and
   *  stay as they were done. Defaults to 1. */
  @IsOptional()
  @IsInt()
  @Min(1)
  fromWeekNumber?: number;
}
