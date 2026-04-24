import type { GenerationEvalScenario } from './eval-types';
import { runChunkGenerationEval, runChunkRepairEnrichThenValidate } from './eval-harness';
import { scoreGeneratedChunk, type EvalScoreResult } from './eval-scoring';

export type ScoredEvalScenarioRow = {
  id: string;
  description: string;
  score: EvalScoreResult;
  validationOk: boolean;
  issues: string[];
  pipeline: 'repair_only' | 'repair_then_enrich';
};

/**
 * Run the same pipeline as {@link generation-eval.scoring.spec.ts} and return scores.
 * Used by CI tests and the `eval:score:report` CLI.
 */
export async function scoreEvalScenario(
  s: GenerationEvalScenario,
): Promise<ScoredEvalScenarioRow> {
  if (s.enrichPrefs) {
    const out = await runChunkRepairEnrichThenValidate({
      specs: s.specs,
      sessions: s.sessionsBeforeRepair,
      catalog: s.catalog,
      equipment: s.equipment,
      effectiveDetailLevel: s.effectiveDetailLevel,
      enrichPrefs: s.enrichPrefs,
    });
    const score = scoreGeneratedChunk({
      specs: s.specs,
      sessions: out.sessionsEnriched,
      catalog: s.catalog,
      validation: out.validationAfterEnrich,
      effectiveDetailLevel: s.effectiveDetailLevel,
      enrichGoal: s.enrichPrefs.goal,
      evalScoring: s.evalScoring,
    });
    return {
      id: s.id,
      description: s.description,
      score,
      validationOk: out.validationAfterEnrich.ok,
      issues: out.validationAfterEnrich.issues,
      pipeline: 'repair_then_enrich',
    };
  }

  const out = runChunkGenerationEval({
    specs: s.specs,
    sessions: s.sessionsBeforeRepair,
    catalog: s.catalog,
    equipment: s.equipment,
    effectiveDetailLevel: s.effectiveDetailLevel,
    applyRepair: true,
  });
  const score = scoreGeneratedChunk({
    specs: s.specs,
    sessions: out.sessionsOut,
    catalog: s.catalog,
    validation: out.validation,
    effectiveDetailLevel: s.effectiveDetailLevel,
    enrichGoal: s.enrichPrefs?.goal,
    evalScoring: s.evalScoring,
  });
  return {
    id: s.id,
    description: s.description,
    score,
    validationOk: out.validation.ok,
    issues: out.validation.issues,
    pipeline: 'repair_only',
  };
}
