import {
  runChunkGenerationEval,
  runChunkRepairEnrichThenValidate,
} from './eval-harness';
import type { ChunkValidatorIssue } from '../generated-chunk-validators';
import { loadAllEvalScenarios } from './all-eval-scenarios';

const ALL_SCENARIOS = loadAllEvalScenarios();

describe('generation eval (frozen chunk scenarios)', () => {
  it.each(ALL_SCENARIOS.map((s) => [s.id, s] as const))(
    '%s',
    async (_id, scenario) => {
      if (!scenario.expect.runRepair) {
        throw new Error(
          `Scenario ${scenario.id}: set runRepair true or add a no-repair branch`,
        );
      }

      const before = runChunkGenerationEval({
        specs: scenario.specs,
        sessions: scenario.sessionsBeforeRepair,
        catalog: scenario.catalog,
        equipment: scenario.equipment,
        effectiveDetailLevel: scenario.effectiveDetailLevel,
        applyRepair: false,
      });

      if (scenario.enrichPrefs) {
        if (!scenario.expect.afterEnrich) {
          throw new Error(
            `Scenario ${scenario.id}: enrichPrefs requires expect.afterEnrich`,
          );
        }
        const out = await runChunkRepairEnrichThenValidate({
          specs: scenario.specs,
          sessions: scenario.sessionsBeforeRepair,
          catalog: scenario.catalog,
          equipment: scenario.equipment,
          effectiveDetailLevel: scenario.effectiveDetailLevel,
          enrichPrefs: scenario.enrichPrefs,
        });

        expect(out.validation.ok).toBe(scenario.expect.after.validatorOk);
        for (const issue of scenario.expect.after.issuesMustInclude ?? []) {
          expect(out.validation.issues).toContain(issue as ChunkValidatorIssue);
        }
        for (const issue of scenario.expect.after.issuesMustNotInclude ?? []) {
          expect(out.validation.issues).not.toContain(issue);
        }

        expect(out.validationAfterEnrich.ok).toBe(
          scenario.expect.afterEnrich.validatorOk,
        );
        for (const issue of scenario.expect.afterEnrich.issuesMustInclude ??
          []) {
          expect(out.validationAfterEnrich.issues).toContain(
            issue as ChunkValidatorIssue,
          );
        }
        for (const issue of scenario.expect.afterEnrich.issuesMustNotInclude ??
          []) {
          expect(out.validationAfterEnrich.issues).not.toContain(issue);
        }

        if (scenario.expect.expectRepairNotes) {
          expect(out.repairNotes.length).toBeGreaterThan(0);
        }

        if (scenario.expect.assertCardioFinisherLast) {
          const last = out.sessionsEnriched[0]?.exercises?.at(-1);
          expect(last?.exerciseId).toBe('cardio_treadmill');
        }

        if (scenario.id === 'chunk_hybrid_goal_appends_cardio_finisher') {
          expect(before.validation.ok).toBe(true);
          expect(out.duplicateRepairs + out.upperLowerPatternRepairs).toBe(0);
        }
        return;
      }

      const after = runChunkGenerationEval({
        specs: scenario.specs,
        sessions: scenario.sessionsBeforeRepair,
        catalog: scenario.catalog,
        equipment: scenario.equipment,
        effectiveDetailLevel: scenario.effectiveDetailLevel,
        applyRepair: true,
      });

      expect(after.validation.ok).toBe(scenario.expect.after.validatorOk);

      for (const issue of scenario.expect.after.issuesMustInclude ?? []) {
        expect(after.validation.issues).toContain(issue as ChunkValidatorIssue);
      }
      for (const issue of scenario.expect.after.issuesMustNotInclude ?? []) {
        expect(after.validation.issues).not.toContain(issue);
      }

      if (scenario.expect.expectRepairNotes) {
        expect(after.repairNotes.length).toBeGreaterThan(0);
      }

      if (scenario.id === 'chunk_duplicate_across_four_strength_days') {
        expect(before.validation.ok).toBe(false);
        expect(before.validation.issues).toContain(
          'duplicate_exercise_id_across_chunk',
        );
        expect(after.duplicateRepairs).toBeGreaterThan(0);
      }
      if (scenario.id === 'chunk_upper_focus_hinge_clash') {
        expect(before.validation.issues).toContain(
          'primary_lower_pattern_on_upper_focus',
        );
        expect(after.upperLowerPatternRepairs).toBeGreaterThan(0);
      }
      if (scenario.id === 'chunk_clean_stays_ok') {
        expect(before.validation.ok).toBe(true);
        expect(after.duplicateRepairs + after.upperLowerPatternRepairs).toBe(0);
      }
      if (scenario.id === 'chunk_below_min_exercises_fixed_by_repair') {
        expect(before.validation.issues).toContain('below_min_exercises');
        expect(after.belowMinRepairs).toBeGreaterThan(0);
        expect(after.validation.ok).toBe(true);
      }
      if (scenario.id === 'chunk_in_session_dup_repaired') {
        expect(before.validation.issues).toContain(
          'duplicate_exercise_id_in_session',
        );
        expect(after.duplicateRepairs).toBeGreaterThan(0);
      }
      if (scenario.id === 'chunk_lower_two_day_clean') {
        expect(before.validation.ok).toBe(true);
      }
      if (scenario.id === 'chunk_cardio_two_day_clean') {
        expect(before.validation.ok).toBe(true);
      }
    },
  );
});
