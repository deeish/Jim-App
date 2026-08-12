import { IsString, Matches, MaxLength } from 'class-validator';

/**
 * Body for PATCH /plans/:id/name. Deliberately its own endpoint: the general
 * PATCH /plans/:id rebuilds the plan from `slots` (unlinks workouts, deletes
 * and recreates every planWorkout), which is catastrophically wrong for a
 * title edit. Renaming must touch the name column and nothing else.
 */
export class RenamePlanDto {
  @IsString()
  // IsNotEmpty passes whitespace-only strings, which the service would trim
  // into an empty title — require at least one non-space character.
  @Matches(/\S/, { message: 'name must not be blank' })
  @MaxLength(80)
  name: string;
}
