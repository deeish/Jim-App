import type { GenerateSessionsDto } from './dto/generate-sessions.dto';
import {
  sessionTitleIsUpperEmphasis,
  type GeneratedSession,
} from './session-enrichment';
import { exerciseTargetsForSession } from '../workouts/workout-generator.service';

/** Must stay aligned with `MAX_PRIOR_WEEK_IDS_IN_BATCH_PROMPT` in workout-generator.service.ts */
export const BATCH_PRIOR_EXERCISE_IDS_TAIL = 48;

export type ChunkValidatorIssue =
  | 'duplicate_exercise_id_in_session'
  | 'duplicate_exercise_id_across_chunk'
  | 'below_min_exercises'
  /** Strength day with upper-style title but library metadata shows primary lower pattern (Squat/Hinge). */
  | 'primary_lower_pattern_on_upper_focus';

export type ChunkValidationResult = {
  ok: boolean;
  issues: ChunkValidatorIssue[];
  /** Unique library ids that appeared more than once (retry hint). */
  duplicateExerciseIds: string[];
  /**
   * Library ids on upper-focus strength days whose `movementPatterns` include Squat or Hinge
   * (batch retry tail — same treatment as duplicates in `buildRetryPriorExerciseIds`).
   */
  patternClashExerciseIds: string[];
};

export type ChunkValidationMovementMeta = ReadonlyMap<
  string,
  ReadonlyArray<string>
>;

function patternsIncludePrimaryLower(
  patterns: ReadonlyArray<string> | undefined,
): boolean {
  if (!patterns?.length) return false;
  const set = new Set(patterns.map((p) => String(p).trim()));
  return set.has('Squat') || set.has('Hinge');
}

function countIdsPerSession(
  sessions: ReadonlyArray<{ exercises?: ReadonlyArray<{ exerciseId?: string }> }>,
): { perSession: string[][]; totals: Map<string, number> } {
  const perSession: string[][] = [];
  const totals = new Map<string, number>();
  for (const s of sessions) {
    const row: string[] = [];
    for (const ex of s.exercises ?? []) {
      const id = ex.exerciseId?.trim();
      if (!id) continue;
      row.push(id);
      totals.set(id, (totals.get(id) ?? 0) + 1);
    }
    perSession.push(row);
  }
  return { perSession, totals };
}

/**
 * Deterministic checks on a generated chunk (one batch / hybrid slice, usually one program week).
 * Used to trigger a single batch retry or fall back to per-session generation.
 */
export function validateGeneratedProgramChunk(
  specs: GenerateSessionsDto['sessions'],
  sessions: GeneratedSession[],
  effectiveDetailLevel: 'simple' | 'detailed',
  /** When set (e.g. from in-memory library), reject Squat/Hinge on upper-emphasis strength titles. */
  movementPatternsByExerciseId?: ChunkValidationMovementMeta,
): ChunkValidationResult {
  const issues: ChunkValidatorIssue[] = [];
  const duplicateExerciseIds = new Set<string>();
  const patternClashExerciseIds = new Set<string>();

  if (sessions.length !== specs.length) {
    return {
      ok: false,
      issues,
      duplicateExerciseIds: [],
      patternClashExerciseIds: [],
    };
  }

  const { perSession, totals } = countIdsPerSession(sessions);

  for (const ids of perSession) {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) {
        issues.push('duplicate_exercise_id_in_session');
        duplicateExerciseIds.add(id);
      }
      seen.add(id);
    }
  }

  for (const [id, n] of totals) {
    if (n > 1) {
      issues.push('duplicate_exercise_id_across_chunk');
      duplicateExerciseIds.add(id);
    }
  }

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]!;
    const session = sessions[i]!;
    const isCardioOrRecovery =
      spec.type === 'cardio' || spec.type === 'recovery';
    const duration = Math.round((spec.durationMin + spec.durationMax) / 2);
    const { minExercises } = exerciseTargetsForSession(
      duration,
      effectiveDetailLevel,
      isCardioOrRecovery,
    );
    const count = (session.exercises ?? []).filter((e) =>
      String(e.name ?? '').trim(),
    ).length;
    if (count < minExercises) {
      issues.push('below_min_exercises');
    }

    if (
      movementPatternsByExerciseId &&
      spec.type === 'strength' &&
      sessionTitleIsUpperEmphasis(spec.title)
    ) {
      for (const ex of session.exercises ?? []) {
        const id = ex.exerciseId?.trim();
        if (!id) continue;
        const pats = movementPatternsByExerciseId.get(id);
        if (!patternsIncludePrimaryLower(pats)) continue;
        issues.push('primary_lower_pattern_on_upper_focus');
        patternClashExerciseIds.add(id);
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues: [...new Set(issues)],
    duplicateExerciseIds: [...duplicateExerciseIds],
    patternClashExerciseIds: [...patternClashExerciseIds],
  };
}

/**
 * Tail list for `priorWeekExerciseIds` — same semantics as batch Groq
 * `[...new Set(ids)].slice(-N)`: duplicate offenders are removed from the prefix
 * then appended so they survive truncation when possible.
 */
export function buildRetryPriorExerciseIds(args: {
  cappedPrior: string[];
  validation: ChunkValidationResult;
  sessions: GeneratedSession[];
}): string[] {
  const fromSessions = args.sessions.flatMap((s) =>
    (s.exercises ?? [])
      .map((e) => e.exerciseId?.trim())
      .filter((id): id is string => !!id),
  );
  const dupOrdered = [
    ...new Set(
      args.validation.duplicateExerciseIds
        .map((x) => String(x).trim())
        .filter(Boolean),
    ),
  ];
  const clashOrdered = [
    ...new Set(
      args.validation.patternClashExerciseIds
        .map((x) => String(x).trim())
        .filter(Boolean),
    ),
  ];
  const hintSet = new Set([...dupOrdered, ...clashOrdered]);
  const base = [...args.cappedPrior, ...fromSessions]
    .map((x) => String(x).trim())
    .filter(Boolean)
    .filter((id) => !hintSet.has(id));
  const merged = [...base, ...dupOrdered, ...clashOrdered];
  return [...new Set(merged)].slice(-BATCH_PRIOR_EXERCISE_IDS_TAIL);
}
