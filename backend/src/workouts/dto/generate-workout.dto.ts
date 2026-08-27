import { IsString, IsOptional, IsObject } from 'class-validator';

export class GenerateWorkoutDto {
  @IsOptional()
  @IsString()
  day?: string;

  /**
   * Whose history to personalise against. **Server-set only.**
   *
   * ⚠ DO NOT ADD VALIDATION DECORATORS TO THIS FIELD. Its lack of them is
   * load-bearing: the global pipe runs `whitelist: true`, which strips any
   * property that carries no validator, so leaving it bare is what stops a
   * caller supplying it over the wire. With `@IsOptional() @IsString()` on it,
   * the pipe KEPT it — and `POST /workouts/preview` passed the body straight
   * through, so anyone could name another user here and receive a workout
   * personalised from that user's logged working weights. Crew summaries hand
   * out every crewmate's `userId`, so the target ids were not secret either.
   *
   * Both call sites now overwrite it from the auth guard; this is the second
   * line of defence, so that a future route that forgets cannot reopen it.
   */
  userId?: string;

  @IsOptional()
  @IsObject()
  preferences?: {
    focus?: string; // e.g., 'upper body', 'lower body', 'cardio', 'full body'
    duration?: number; // in minutes
    difficulty?: 'beginner' | 'intermediate' | 'advanced';
    equipment?: string[]; // available equipment
    /** User goal: strength, hypertrophy/muscle, endurance, fat loss, hybrid */
    goal?: string;
    /** Optional secondary emphasis; biases the prompt + cardio finisher, not rep ranges. */
    secondaryGoal?: string;
    /** Experience level (can align with difficulty) */
    experience?: string;
    /** Limitations to respect: e.g. "bad knee", "no barbell", "home only" */
    limitations?: string[];
    /** Program template id (e.g. "ppl", "upper-lower-4") for reasoning */
    programTemplateId?: string;
    /** This day's role in the program (e.g. "Push", "Upper 1") for reasoning */
    programDayFocus?: string;
    /** "simple" = fewer exercises, shorter reasoning; "detailed" = more exercises, longer warmup/cooldown/reasoning */
    detailLevel?: 'simple' | 'detailed';
    /** Exercise IDs to exclude (e.g. already used this week) for variety */
    excludeExerciseIds?: string[];
    /** Exercise names to exclude (e.g. "Deadlift") when replacing one exercise */
    excludeExerciseNames?: string[];
    /** When true, skip Groq and use rule-based generation only (hybrid / tests). */
    skipGroq?: boolean;
    /** run, bike, swim, row, elliptical — order matters for Cardio finisher bias */
    cardioModalities?: string[];
    /** User's current activity level outside the gym. */
    currentActivityLevel?: string;
    /** Preferred movements/lifts to bias exercise selection. */
    preferredExercises?: string[];
  };
}
