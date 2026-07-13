import type {
  GenerateSessionsDto,
  WeekProgressionDto,
} from './dto/generate-sessions.dto';
import type {
  GeneratedSession,
  GeneratedSessionExercise,
} from './session-enrichment';

/**
 * Appended once to a deload session's reasoning so the lighter prescriptions
 * read as intentional coaching, not a generation glitch.
 */
export const DELOAD_REASONING_NOTE =
  'Deload week: sets and reps are intentionally lighter so you recover and come back stronger.';

function clampReps(value: number): number {
  return Math.max(1, Math.min(100, value));
}

function isTimeOrCardioRow(ex: GeneratedSessionExercise): boolean {
  if (ex.prescriptionType === 'time') return true;
  if (ex.durationSeconds != null) return true;
  return (ex.primaryMuscleGroup ?? '').trim() === 'Cardio';
}

/**
 * Apply per-week intensity targets (`weekProgression`) to enriched sessions.
 *
 * This is the single place progression math lands: enrichment re-stamps every
 * strength row from goal × difficulty × role bands (`stampSetsAndReps`), which
 * erases any earlier sets/reps arithmetic, so this pass must run after the
 * final enrichment step. Week 1 entries are typically neutral (×1.0, +0) and
 * no-op; a deload week (×0.7, +2) trims sets and lightens the rep band, and
 * gets a one-line reasoning note so the change reads as intentional.
 *
 * Cardio and time-based rows keep their duration; cardio/recovery sessions are
 * left untouched.
 */
export function applyWeekProgressionToEnrichedSessions(args: {
  sessions: GeneratedSession[];
  specs: GenerateSessionsDto['sessions'];
  weekProgression: WeekProgressionDto[] | undefined;
}): { sessions: GeneratedSession[]; adjustedSessionCount: number } {
  const { specs, weekProgression } = args;
  if (!weekProgression?.length || args.sessions.length !== specs.length) {
    return { sessions: args.sessions, adjustedSessionCount: 0 };
  }

  const progByWeek = new Map<number, WeekProgressionDto>();
  for (const p of weekProgression) progByWeek.set(p.weekIndex, p);

  let adjustedSessionCount = 0;
  const sessions = args.sessions.map((session, i) => {
    const spec = specs[i];
    if (!spec || spec.type !== 'strength') return session;
    const prog = progByWeek.get(spec.weekIndex);
    if (!prog) return session;
    if (prog.volumeMultiplier === 1 && prog.repModifier === 0) return session;

    let changed = false;
    const exercises = session.exercises.map((ex) => {
      if (isTimeOrCardioRow(ex)) return ex;
      const sets = Math.max(1, Math.round(ex.sets * prog.volumeMultiplier));
      const reps = clampReps(ex.reps + prog.repModifier);
      const repsMin =
        ex.repsMin != null
          ? clampReps(ex.repsMin + prog.repModifier)
          : ex.repsMin;
      const repsMax =
        ex.repsMax != null
          ? clampReps(ex.repsMax + prog.repModifier)
          : ex.repsMax;
      if (
        sets === ex.sets &&
        reps === ex.reps &&
        repsMin === ex.repsMin &&
        repsMax === ex.repsMax
      ) {
        return ex;
      }
      changed = true;
      return { ...ex, sets, reps, repsMin, repsMax };
    });
    if (!changed) return session;

    adjustedSessionCount += 1;
    let reasoning = session.reasoning;
    if (
      prog.phase === 'deload' &&
      !(reasoning ?? '').includes(DELOAD_REASONING_NOTE)
    ) {
      reasoning = reasoning
        ? `${reasoning.trim()} ${DELOAD_REASONING_NOTE}`
        : DELOAD_REASONING_NOTE;
    }
    return { ...session, exercises, reasoning };
  });

  return { sessions, adjustedSessionCount };
}
