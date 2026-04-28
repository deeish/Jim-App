import type { ExercisePrescriptionType } from '../../data/exercise-prescription';
import type { GenerateSessionsDto } from '../dto/generate-sessions.dto';
import type {
  GeneratedSession,
  EnrichSessionGenerationPrefs,
} from '../session-enrichment';
import type { ChunkValidatorIssue } from '../generated-chunk-validators';

/** Expected outcome from {@link validateGeneratedProgramChunk}. */
export type EvalValidatorExpect = {
  validatorOk: boolean;
  issuesMustInclude?: ChunkValidatorIssue[];
  issuesMustNotInclude?: ChunkValidatorIssue[];
};

/** Minimal catalog row for eval mocks (subset of library fields repair + validators use). */
export type EvalCatalogExercise = {
  id: string;
  name: string;
  movementPatterns?: string[];
  primaryMuscleGroup?: string;
  secondaryMuscleGroups?: string[];
  /** First entry is treated as the "primary mover" by the sub-muscle cap validator. */
  subMuscles?: string[];
  prescriptionType?: ExercisePrescriptionType;
  equipment?: string[];
};

/**
 * One frozen “week slice”: session specs + raw chunk sessions + exercise universe.
 * Used by CI to regression-test repair + chunk validators without Groq.
 */
export type GenerationEvalScenario = {
  id: string;
  description: string;
  effectiveDetailLevel: 'simple' | 'detailed';
  specs: GenerateSessionsDto['sessions'];
  sessionsBeforeRepair: GeneratedSession[];
  catalog: EvalCatalogExercise[];
  equipment?: string[];
  /**
   * Optional scoring overrides for toy / structural-only fixtures so CI can stay strict
   * on real multi-day programs without punishing minimal regression cases.
   */
  evalScoring?: {
    skipBalance?: boolean;
    skipVolume?: boolean;
    skipDiversity?: boolean;
    skipMetadata?: boolean;
    skipConditioning?: boolean;
    skipCoaching?: boolean;
    /** Skip compound-first / cardio-last order heuristics (repair-only toy chunks). */
    skipWorkoutOrder?: boolean;
    /** Skip sets/reps sanity checks (rare toy catalogs). */
    skipPrescription?: boolean;
    /** Skip same-muscle run-length checks (minimal lists). */
    skipFatigueStacking?: boolean;
  };
  /**
   * When set, tests also run {@link enrichGeneratedSession} per repaired session
   * and assert `expect.afterEnrich` on the enriched chunk.
   */
  enrichPrefs?: EnrichSessionGenerationPrefs;
  expect: {
    runRepair: boolean;
    /** Post-repair chunk validation (repair-only path). */
    after: EvalValidatorExpect;
    /** Post-repair+enrich validation; required when `enrichPrefs` is set. */
    afterEnrich?: EvalValidatorExpect;
    /** When runRepair is true, assert repair produced at least one note (optional). */
    expectRepairNotes?: boolean;
    /** After enrich: last exercise in session 0 is a library Cardio row (hybrid finisher). */
    assertCardioFinisherLast?: boolean;
  };
};
