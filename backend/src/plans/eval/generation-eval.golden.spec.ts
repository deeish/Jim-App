import {
  runChunkGenerationEval,
  runChunkRepairEnrichThenValidate,
} from './eval-harness';
import { loadAllEvalScenarios } from './all-eval-scenarios';
import type { GeneratedSession } from '../session-enrichment';

function normalizeSessions(sessions: GeneratedSession[]): GeneratedSession[] {
  return sessions.map((s) => ({
    weekIndex: s.weekIndex,
    weekday: s.weekday,
    name: s.name,
    reasoning: s.reasoning,
    warmUp: s.warmUp,
    coolDown: s.coolDown,
    exercises: (s.exercises ?? []).map((e) => ({
      name: e.name,
      sets: e.sets,
      reps: e.reps,
      notes: e.notes,
      exerciseId: e.exerciseId,
      prescriptionType: e.prescriptionType,
      primaryMuscleGroup: e.primaryMuscleGroup,
      secondaryMuscleGroups: e.secondaryMuscleGroups ?? [],
    })),
  }));
}

describe('generation eval golden snapshots', () => {
  const all = loadAllEvalScenarios();
  const ids = new Set([
    'chunk_clean_stays_ok',
    'chunk_hybrid_goal_appends_cardio_finisher',
  ]);
  const golden = all.filter((s) => ids.has(s.id));

  it.each(golden.map((s) => [s.id, s] as const))(
    '%s',
    async (_id, scenario) => {
      const repaired = runChunkGenerationEval({
        specs: scenario.specs,
        sessions: scenario.sessionsBeforeRepair,
        catalog: scenario.catalog,
        equipment: scenario.equipment,
        effectiveDetailLevel: scenario.effectiveDetailLevel,
        applyRepair: true,
      });
      expect({
        validation: repaired.validation,
        sessionsOut: normalizeSessions(repaired.sessionsOut),
        repairNotes: repaired.repairNotes,
        duplicateRepairs: repaired.duplicateRepairs,
        upperLowerPatternRepairs: repaired.upperLowerPatternRepairs,
      }).toMatchSnapshot();

      if (scenario.enrichPrefs) {
        const enriched = await runChunkRepairEnrichThenValidate({
          specs: scenario.specs,
          sessions: scenario.sessionsBeforeRepair,
          catalog: scenario.catalog,
          equipment: scenario.equipment,
          effectiveDetailLevel: scenario.effectiveDetailLevel,
          enrichPrefs: scenario.enrichPrefs,
        });
        expect({
          validationAfterEnrich: enriched.validationAfterEnrich,
          sessionsEnriched: normalizeSessions(enriched.sessionsEnriched),
        }).toMatchSnapshot();
      }
    },
  );
});
