import type {
  GenerateSessionsDto,
  WeekProgressionDto,
} from './dto/generate-sessions.dto';
import type {
  GeneratedSession,
  GeneratedSessionExercise,
} from './session-enrichment';
import { clampSessionWorkingSets, ISOLATION_NAME } from './session-enrichment';
import { isUnilateralByName } from './cross-session-diversity';
import { cardioBlockStyle, cardioMainBlockNotes } from './cardio-day-template';

/**
 * Appended once to a deload session's reasoning so the lighter prescriptions
 * read as intentional coaching, not a generation glitch.
 */
export const DELOAD_REASONING_NOTE =
  'Deload week: sets and reps are intentionally lighter so you recover and come back stronger.';

/**
 * How far a cardio day's main block moves with the phase (Tier 2e of the
 * 2026-09-16 plan). Aerobic time grows more gently than lifting volume: the
 * usual guidance is about 10% a week, so a build phase adds a tenth, a peak
 * a fifth, and a deload gives a quarter back. Unknown phases fall back to the
 * week's set multiplier, capped to the same range.
 */
export function cardioDurationFactorForPhase(
  phase: string | undefined,
  volumeMultiplier: number,
): number {
  switch ((phase ?? '').toLowerCase()) {
    case 'foundation':
    case 'maintain':
      return 1;
    case 'progression':
      return 1.1;
    case 'peak':
      return 1.2;
    case 'deload':
      return 0.75;
    default:
      return Math.min(1.2, Math.max(0.75, volumeMultiplier));
  }
}

/** The shortest a progressed main block may get, and the copy/core allowance inside a cardio slot. */
const CARDIO_MAIN_MIN_SECONDS = 8 * 60;
const CARDIO_SLOT_OVERHEAD_MINUTES = 15;

/** Re-times a cardio day's main block for the week's phase; the same object comes back when nothing moves. */
function progressCardioSession(
  session: GeneratedSession,
  spec: GenerateSessionsDto['sessions'][number],
  prog: WeekProgressionDto,
  findMeta: ((id: string) => ProgressionExerciseMeta | undefined) | undefined,
): GeneratedSession {
  const factor = cardioDurationFactorForPhase(
    prog.phase,
    prog.volumeMultiplier,
  );
  if (factor === 1) return session;
  const isCardioRow = (e: GeneratedSessionExercise): boolean => {
    if (e.durationSeconds == null) return false;
    const group =
      (e.exerciseId
        ? findMeta?.(e.exerciseId)?.primaryMuscleGroup
        : undefined) ?? e.primaryMuscleGroup;
    return (group ?? '').trim() === 'Cardio';
  };
  let mainIndex = -1;
  session.exercises.forEach((e, i) => {
    if (!isCardioRow(e)) return;
    if (
      mainIndex < 0 ||
      (e.durationSeconds ?? 0) >
        (session.exercises[mainIndex]!.durationSeconds ?? 0)
    ) {
      mainIndex = i;
    }
  });
  if (mainIndex < 0) return session;
  const main = session.exercises[mainIndex]!;
  const seconds = main.durationSeconds ?? 0;
  if (seconds <= 0) return session;
  const slotCap = Math.max(
    seconds,
    (spec.durationMax - CARDIO_SLOT_OVERHEAD_MINUTES) * 60,
  );
  const next = Math.min(
    slotCap,
    Math.max(CARDIO_MAIN_MIN_SECONDS, Math.round((seconds * factor) / 60) * 60),
  );
  if (next === seconds) return session;
  const minutes = Math.round(next / 60);
  // Only template copy is rewritten; a model-written note that names no
  // duration is left alone (the eval flags a note whose minutes disagree).
  const notes =
    !main.notes || /^\d+ min/.test(main.notes)
      ? cardioMainBlockNotes(minutes, cardioBlockStyle(main))
      : main.notes;
  const exercises = session.exercises.map((e, i) =>
    i === mainIndex
      ? {
          ...e,
          durationSeconds: next,
          reps: e.reps === seconds ? next : e.reps,
          notes,
        }
      : e,
  );
  let reasoning = session.reasoning;
  if (
    prog.phase === 'deload' &&
    !(reasoning ?? '').includes(DELOAD_CARDIO_REASONING_NOTE)
  ) {
    reasoning = reasoning
      ? `${reasoning.trim()} ${DELOAD_CARDIO_REASONING_NOTE}`
      : DELOAD_CARDIO_REASONING_NOTE;
  }
  return { ...session, exercises, reasoning };
}

/** Appended to a cardio day's reasoning on a deload week. */
export const DELOAD_CARDIO_REASONING_NOTE =
  'Deload week: the main block is intentionally shorter so you recover and come back stronger.';

/** How far the block's phase moves the effort target: harder as it builds, easier on a deload. */
export function rirShiftForPhase(phase: string | undefined): number {
  switch ((phase ?? '').toLowerCase()) {
    case 'progression':
      return -1;
    case 'peak':
      return -2;
    case 'deload':
      return 2;
    default:
      return 0;
  }
}

function clampRir(value: number, floor: number): number {
  return Math.max(floor, Math.min(4, Math.round(value)));
}

function clampReps(value: number): number {
  return Math.max(1, Math.min(100, value));
}

function isTimeOrCardioRow(ex: GeneratedSessionExercise): boolean {
  if (ex.prescriptionType === 'time') return true;
  if (ex.durationSeconds != null) return true;
  return (ex.primaryMuscleGroup ?? '').trim() === 'Cardio';
}

/** Catalog fields this pass reads (subset of `TransformedExercise`). */
export type ProgressionExerciseMeta = {
  primaryMuscleGroup?: string;
  /** Required equipment only — empty means true bodyweight (see exercise-mappings). */
  primaryEquipment?: string[];
  /** Raw catalog kind: "Compound" | "Isolation" | … */
  type?: string;
};

/**
 * Rows whose canonical rep band should survive a heavier week. A negative
 * `repModifier` means "fewer reps, more load", which only makes sense where
 * load can actually go up: bodyweight rows have no load to add, and unilateral
 * / isolation accessories at 3-4 reps are a coaching error (live capture: a
 * beginner peak week prescribed 4x4 Bulgarian Split Squats and 3x4 bodyweight
 * Glute Bridges). The deload direction (+reps) stays safe everywhere.
 */
function keepsCanonicalRepBand(
  ex: GeneratedSessionExercise,
  meta: ProgressionExerciseMeta | undefined,
): boolean {
  if (isUnilateralByName(ex.name)) return true;
  if (ISOLATION_NAME.test(ex.name ?? '')) return true;
  if ((meta?.type ?? '').toLowerCase() === 'isolation') return true;
  if (meta && (meta.primaryEquipment ?? []).length === 0) return true;
  return false;
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
 * Guardrails (all live-capture findings):
 * - Progressed sets never drop below 2 (a ×0.7 deload on a 2-set accessory
 *   used to round down to a single working set).
 * - Negative rep modifiers skip bodyweight / unilateral / isolation rows —
 *   see `keepsCanonicalRepBand`.
 * - Volume weeks re-clamp to the duration-derived working-set cap (against
 *   `durationMax` minus the session's cardio tail) via
 *   `clampSessionWorkingSets`, because enrichment's own clamp ran before the
 *   multiplier and a ×1.25 peak on a full hour landed at ~65 minutes.
 *
 * Cardio and time-based rows keep their duration; cardio/recovery sessions are
 * left untouched.
 */
export function applyWeekProgressionToEnrichedSessions(args: {
  sessions: GeneratedSession[];
  specs: GenerateSessionsDto['sessions'];
  weekProgression: WeekProgressionDto[] | undefined;
  /** Library lookup — enables the rep-band guard's catalog checks and the duration re-clamp. */
  findMeta?: (id: string) => ProgressionExerciseMeta | undefined;
  /** Goal + difficulty feed the working-set cap's rest math (see `workingSetCap`). */
  prefs?: { goal?: string; difficulty?: string };
}): { sessions: GeneratedSession[]; adjustedSessionCount: number } {
  const { specs, weekProgression, findMeta, prefs } = args;
  if (!weekProgression?.length || args.sessions.length !== specs.length) {
    return { sessions: args.sessions, adjustedSessionCount: 0 };
  }

  const progByWeek = new Map<number, WeekProgressionDto>();
  for (const p of weekProgression) progByWeek.set(p.weekIndex, p);

  let adjustedSessionCount = 0;
  const sessions = args.sessions.map((session, i) => {
    const spec = specs[i];
    if (!spec) return session;
    const prog = progByWeek.get(spec.weekIndex);
    if (!prog) return session;
    if (spec.type === 'cardio') {
      const progressed = progressCardioSession(session, spec, prog, findMeta);
      if (progressed !== session) adjustedSessionCount += 1;
      return progressed;
    }
    if (spec.type !== 'strength') return session;
    if (prog.volumeMultiplier === 1 && prog.repModifier === 0) return session;

    let changed = false;
    let exercises = session.exercises.map((ex) => {
      if (isTimeOrCardioRow(ex)) return ex;
      const meta = ex.exerciseId ? findMeta?.(ex.exerciseId) : undefined;
      const setsFloor = Math.min(2, ex.sets);
      const sets = Math.max(
        setsFloor,
        Math.round(ex.sets * prog.volumeMultiplier),
      );
      const shiftReps =
        prog.repModifier >= 0 || !keepsCanonicalRepBand(ex, meta);
      const reps = shiftReps ? clampReps(ex.reps + prog.repModifier) : ex.reps;
      const repsMin =
        shiftReps && ex.repsMin != null
          ? clampReps(ex.repsMin + prog.repModifier)
          : ex.repsMin;
      const repsMax =
        shiftReps && ex.repsMax != null
          ? clampReps(ex.repsMax + prog.repModifier)
          : ex.repsMax;
      // Effort drifts with the phase: closer to failure as the block builds,
      // eased on a deload. Compounds never go below 1 RIR (a heavy lift to
      // failure is a technique risk, not a stimulus); isolation may reach 0.
      const targetRir =
        ex.targetRir == null
          ? undefined
          : clampRir(
              ex.targetRir + rirShiftForPhase(prog.phase),
              keepsCanonicalRepBand(ex, meta) ? 0 : 1,
            );
      if (
        sets === ex.sets &&
        reps === ex.reps &&
        repsMin === ex.repsMin &&
        repsMax === ex.repsMax &&
        targetRir === ex.targetRir
      ) {
        return ex;
      }
      changed = true;
      return { ...ex, sets, reps, repsMin, repsMax, targetRir };
    });
    if (!changed) return session;

    // Enrichment's duration clamp ran before the multiplier, so a volume week
    // can overflow the slot the user picked. Re-clamp against durationMax
    // (not the min/max midpoint — a peak week may use the whole slot) minus
    // the cardio tail, which the set-cost model doesn't see.
    if (prog.volumeMultiplier > 1 && findMeta && spec.durationMax > 0) {
      const isCardioTail = (e: GeneratedSessionExercise): boolean => {
        const group =
          (e.exerciseId
            ? findMeta(e.exerciseId)?.primaryMuscleGroup
            : undefined) ?? e.primaryMuscleGroup;
        return (group ?? '').trim() === 'Cardio';
      };
      const cardioSeconds = exercises
        .filter(isCardioTail)
        .reduce(
          (sum, e) => sum + (e.durationSeconds ?? 0) * Math.max(1, e.sets || 1),
          0,
        );
      // Clone every row first: unchanged rows are still the caller's objects,
      // and the clamp mutates `sets` in place.
      exercises = exercises.map((e) => ({ ...e }));
      clampSessionWorkingSets(exercises, findMeta, {
        goal: prefs?.goal,
        difficulty: prefs?.difficulty,
        durationMinutes: spec.durationMax - Math.round(cardioSeconds / 60),
      });
    }

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
