import * as fs from 'fs';
import * as path from 'path';
import { goalWantsStrengthCardioFinisher } from '../../workouts/workout-generator.service';
import {
  parseGenerateSessionsCapture,
  buildCatalogForSessionsFromLibrary,
  type ParsedGenerateSessionsCapture,
} from './generation-capture-eval';
import { validateGeneratedProgramChunk } from '../generated-chunk-validators';
import {
  movementPatternsMapForSessions,
  primaryMuscleGroupMapForSessions,
  subMusclesMapForSessions,
} from './eval-harness';
import type { EvalCatalogExercise } from './eval-types';

export type GoldenInvariantResult = {
  ok: boolean;
  issues: string[];
};

function defaultLibraryPath(): string {
  return path.join(process.cwd(), 'data', 'exercises_5000plus.json');
}

function strengthDayHasLibraryCardio(
  session: ParsedGenerateSessionsCapture['sessionsOut'][number],
  byId: Map<string, EvalCatalogExercise>,
): boolean {
  for (const e of session.exercises ?? []) {
    const id = e.exerciseId?.trim();
    if (!id) continue;
    if (byId.get(id)?.primaryMuscleGroup === 'Cardio') return true;
  }
  return false;
}

/**
 * Hard checks for committed `generate_sessions` captures used as golden regressions.
 * Intended for small fixtures that should always pass, and optional "known bad"
 * captures where we assert specific failures exist.
 */
export function collectGoldenCaptureInvariantIssues(
  raw: unknown,
  opts?: { exerciseLibraryPath?: string },
): GoldenInvariantResult {
  const issues: string[] = [];
  const parsed = parseGenerateSessionsCapture(raw);
  const libraryPath = opts?.exerciseLibraryPath ?? defaultLibraryPath();
  const catalog: EvalCatalogExercise[] = fs.existsSync(libraryPath)
    ? buildCatalogForSessionsFromLibrary(parsed.sessionsOut, libraryPath).catalog
    : [];
  const byId = new Map<string, EvalCatalogExercise>(catalog.map((c) => [c.id, c]));

  const effectiveDetail =
    parsed.inputs.detailLevel === 'detailed' ? 'detailed' : 'simple';
  const movementMap = movementPatternsMapForSessions(parsed.sessionsOut, (id) =>
    byId.get(id),
  );
  const primaryMap = primaryMuscleGroupMapForSessions(
    parsed.sessionsOut,
    (id) => byId.get(id),
  );
  const subMuscleMap = subMusclesMapForSessions(
    parsed.sessionsOut,
    (id) => byId.get(id),
  );
  const validation = validateGeneratedProgramChunk(
    parsed.inputs.sessions,
    parsed.sessionsOut,
    effectiveDetail,
    movementMap,
    primaryMap,
    subMuscleMap,
    true,
  );
  if (!validation.ok) {
    issues.push(`chunk validation failed: ${validation.issues.join(', ')}`);
  }

  if (goalWantsStrengthCardioFinisher(parsed.inputs.goal)) {
    for (let i = 0; i < parsed.inputs.sessions.length; i++) {
      const spec = parsed.inputs.sessions[i]!;
      if (spec.type !== 'strength') continue;
      const session = parsed.sessionsOut[i]!;
      if (!strengthDayHasLibraryCardio(session, byId)) {
        issues.push(
          `hybrid-style goal requires a library Cardio exercise on strength day "${spec.title ?? spec.weekday}" (session index ${i}).`,
        );
      }
    }
  }

  return { ok: issues.length === 0, issues };
}
