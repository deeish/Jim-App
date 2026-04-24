import { validateGeneratedProgramChunk } from '../generated-chunk-validators';
import {
  repairChunkGeneratedSessions,
  type ChunkRepairExerciseLibrary,
} from '../generation-chunk-repair';
import {
  enrichGeneratedSessionsInChunkOrder,
  type EnrichSessionGenerationPrefs,
  type GeneratedSession,
} from '../session-enrichment';
import type { GenerateSessionsDto } from '../dto/generate-sessions.dto';
import type { ChunkValidationResult } from '../generated-chunk-validators';
import type { EvalCatalogExercise } from './eval-types';
import { createEvalMockExercisesService } from './mock-exercises-service-for-eval';

function mockRepairLibrary(rows: EvalCatalogExercise[]): ChunkRepairExerciseLibrary {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return {
    findOne: (id: string) => byId.get(id),
    getCandidatesForGenerator: ({ excludeIds }) => {
      const ex = new Set(excludeIds ?? []);
      return rows.filter((r) => !ex.has(r.id));
    },
    candidatesForChunkRepairScavenge: (excludeIds, limit = 200) => {
      const ex = new Set(excludeIds.map((i) => String(i ?? '').trim()).filter(Boolean));
      const out = rows.filter((r) => !ex.has(r.id));
      return limit ? out.slice(0, limit) : out;
    },
  };
}

/** Build movement-pattern map for chunk validator (same idea as PlansService.movementPatternMapForSessions). */
export function movementPatternsMapForSessions(
  sessions: GeneratedSession[],
  findOne: (id: string) => { movementPatterns?: string[] } | undefined,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const s of sessions) {
    for (const e of s.exercises ?? []) {
      const id = e.exerciseId?.trim();
      if (!id || map.has(id)) continue;
      const p = findOne(id)?.movementPatterns;
      if (p?.length) map.set(id, [...p]);
    }
  }
  return map;
}

export type ChunkEvalRunResult = {
  sessionsOut: GeneratedSession[];
  repairNotes: string[];
  duplicateRepairs: number;
  upperLowerPatternRepairs: number;
  belowMinRepairs: number;
  validation: ChunkValidationResult;
};

/**
 * Run deterministic chunk repair (optional) then {@link validateGeneratedProgramChunk}.
 * No Nest, no Groq — pure regression surface for frozen scenarios.
 */
export function runChunkGenerationEval(args: {
  specs: GenerateSessionsDto['sessions'];
  sessions: GeneratedSession[];
  catalog: EvalCatalogExercise[];
  equipment?: string[];
  effectiveDetailLevel: 'simple' | 'detailed';
  applyRepair: boolean;
}): ChunkEvalRunResult {
  const lib = mockRepairLibrary(args.catalog);
  let sessions = args.sessions.map((s) => ({
    ...s,
    exercises: (s.exercises ?? []).map((e) => ({ ...e })),
  }));
  let repairNotes: string[] = [];
  let duplicateRepairs = 0;
  let upperLowerPatternRepairs = 0;
  let belowMinRepairs = 0;
  if (args.applyRepair) {
    const r = repairChunkGeneratedSessions({
      sessions,
      specs: args.specs,
      library: lib,
      equipment: args.equipment,
      effectiveDetailLevel: args.effectiveDetailLevel,
    });
    sessions = r.sessions;
    repairNotes = r.notes;
    duplicateRepairs = r.duplicateRepairs;
    upperLowerPatternRepairs = r.upperLowerPatternRepairs;
    belowMinRepairs = r.belowMinRepairs;
  }
  const movementMap = movementPatternsMapForSessions(sessions, (id) => lib.findOne(id));
  const validation = validateGeneratedProgramChunk(
    args.specs,
    sessions,
    args.effectiveDetailLevel,
    movementMap,
  );
  return {
    sessionsOut: sessions,
    repairNotes,
    duplicateRepairs,
    upperLowerPatternRepairs,
    belowMinRepairs,
    validation,
  };
}

export type ChunkEvalWithEnrichResult = ChunkEvalRunResult & {
  sessionsEnriched: GeneratedSession[];
  validationAfterEnrich: ChunkValidationResult;
};

/**
 * Repair chunk sessions, then run {@link enrichGeneratedSession} for each session
 * (same order as specs), then validate the enriched chunk.
 */
export async function runChunkRepairEnrichThenValidate(args: {
  specs: GenerateSessionsDto['sessions'];
  sessions: GeneratedSession[];
  catalog: EvalCatalogExercise[];
  equipment?: string[];
  effectiveDetailLevel: 'simple' | 'detailed';
  enrichPrefs: EnrichSessionGenerationPrefs;
}): Promise<ChunkEvalWithEnrichResult> {
  const repaired = runChunkGenerationEval({
    specs: args.specs,
    sessions: args.sessions,
    catalog: args.catalog,
    equipment: args.equipment,
    effectiveDetailLevel: args.effectiveDetailLevel,
    applyRepair: true,
  });
  const mock = createEvalMockExercisesService(args.catalog);
  const sessionsEnriched = await enrichGeneratedSessionsInChunkOrder(
    repaired.sessionsOut,
    {
      getSpec: (i) => args.specs[i],
      getAvoidPhrases: () => [],
      getGenerationPrefs: () => args.enrichPrefs,
      exercisesService: mock,
      equipment: args.equipment?.length ? args.equipment : undefined,
    },
  );
  const movementMap = movementPatternsMapForSessions(sessionsEnriched, (id) =>
    mock.findOne(id),
  );
  const validationAfterEnrich = validateGeneratedProgramChunk(
    args.specs,
    sessionsEnriched,
    args.effectiveDetailLevel,
    movementMap,
  );
  return {
    ...repaired,
    sessionsEnriched,
    validationAfterEnrich,
  };
}
