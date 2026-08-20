/**
 * High-skill barbell lifts a BEGINNER must not be steered toward. Shared by
 * the quick-session builder (blocks them from a beginner's pool) and the
 * replace/add recommendation brain (sinks them in a beginner's ranking).
 * The pool swaps to goblet squats, RDLs, chest-supported rows, seated
 * presses — the same movement patterns with the technique tax removed.
 */
export const BEGINNER_BLOCK_RE =
  /back squat|front squat|overhead squat|conventional deadlift|trap bar deadlift|sumo deadlift|deficit deadlift|barbell romanian deadlift|pendlay|bent[- ]over barbell row|barbell bent[- ]over row|barbell bench press|barbell overhead press|military press|push press|\bsnatch\b|\bclean\b|\bjerk\b|good morning|muscle-up|pistol/i;
