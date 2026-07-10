import { loadAllEvalScenarios } from './all-eval-scenarios';
import { scoreEvalScenario } from './eval-score-runner';
import { scoreGeneratedChunk } from './eval-scoring';
import type { ChunkValidationResult } from '../generated-chunk-validators';

const CLEAN_VALIDATION: ChunkValidationResult = {
  ok: true,
  issues: [],
  duplicateExerciseIds: [],
  patternClashExerciseIds: [],
  patternOverflowExerciseIds: [],
  subMuscleOverflowExerciseIds: [],
  nonAnchorSlotOneExerciseIds: [],
  crossSessionOverlapExerciseIds: [],
};

/** Minimal single-session chunk for exercising one scoring dimension. */
function scoreOneSession(args: {
  exercises: NonNullable<
    Parameters<typeof scoreGeneratedChunk>[0]['sessions'][number]['exercises']
  >;
  reasoning?: string;
  catalog: Parameters<typeof scoreGeneratedChunk>[0]['catalog'];
  generatorEquipment?: string[];
}) {
  return scoreGeneratedChunk({
    specs: [
      {
        type: 'strength',
        title: 'Upper',
        durationMin: 30,
        durationMax: 45,
        isHardDay: false,
        weekIndex: 1,
        weekday: 'Monday',
      },
    ],
    sessions: [
      {
        weekIndex: 1,
        weekday: 'Monday',
        name: 'Upper',
        reasoning: args.reasoning,
        exercises: args.exercises,
      },
    ],
    catalog: args.catalog,
    validation: CLEAN_VALIDATION,
    effectiveDetailLevel: 'simple',
    generatorEquipment: args.generatorEquipment,
    evalScoring: {
      skipBalance: true,
      skipVolume: true,
      skipDiversity: true,
      skipMetadata: true,
      skipConditioning: true,
      skipCoaching: true,
      skipWorkoutOrder: true,
      skipPrescription: true,
      skipFatigueStacking: true,
    },
  });
}

describe('equipmentConformance scoring', () => {
  const catalog = [
    {
      id: 'back_squat',
      name: 'Back Squat',
      primaryMuscleGroup: 'Legs',
      movementPatterns: ['Squat'],
      primaryEquipment: ['Barbell'],
    },
    {
      id: 'goblet_squat',
      name: 'Goblet Squat',
      primaryMuscleGroup: 'Legs',
      movementPatterns: ['Squat'],
      primaryEquipment: ['Dumbbell'],
    },
  ];
  const rows = [
    { name: 'Back Squat', sets: 3, reps: 10, exerciseId: 'back_squat' },
    { name: 'Goblet Squat', sets: 3, reps: 10, exerciseId: 'goblet_squat' },
  ];

  it('penalizes gear outside the resolved equipment and names it', () => {
    const r = scoreOneSession({
      exercises: rows,
      catalog,
      generatorEquipment: ['Dumbbell', 'Resistance Band', 'Bodyweight'],
    });
    expect(r.breakdown.equipmentConformance).toBe(5);
    expect(r.findings.join(' ')).toMatch(/Back Squat/);
  });

  it('scores full marks when everything is doable (or no constraint given)', () => {
    const gym = scoreOneSession({
      exercises: rows,
      catalog,
      generatorEquipment: ['Barbell', 'Dumbbell'],
    });
    expect(gym.breakdown.equipmentConformance).toBe(10);
    const unconstrained = scoreOneSession({ exercises: rows, catalog });
    expect(unconstrained.breakdown.equipmentConformance).toBe(10);
  });
});

describe('copySanity scoring', () => {
  const catalog = [
    {
      id: 'back_squat',
      name: 'Back Squat',
      primaryMuscleGroup: 'Legs',
      movementPatterns: ['Squat'],
    },
  ];

  it('flags snake_case ids, pipeline jargon, and stale duration notes', () => {
    const r = scoreOneSession({
      exercises: [
        {
          name: 'Back Squat',
          sets: 3,
          reps: 10,
          exerciseId: 'back_squat',
          notes:
            'Swapped in a staple compound for slot 1 (anchor enforcement).',
        },
        {
          name: 'Jumping Jack',
          sets: 1,
          reps: 600,
          exerciseId: 'jumping_jack',
          notes: '30 seconds of work',
          prescriptionType: 'time',
          durationSeconds: 600,
        },
      ],
      reasoning: 'This day starts with the back_squat for leg strength.',
      catalog,
    });
    expect(r.breakdown.copySanity).toBe(0);
    const joined = r.findings.join(' | ');
    expect(joined).toMatch(/snake_case/);
    expect(joined).toMatch(/jargon/);
    expect(joined).toMatch(/contradicts/);
  });

  it('gives clean coach copy full marks', () => {
    const r = scoreOneSession({
      exercises: [
        {
          name: 'Back Squat',
          sets: 3,
          reps: 10,
          exerciseId: 'back_squat',
          notes: 'Your main lift today: start here while you are freshest.',
        },
      ],
      reasoning: 'Leads with a heavy squat, then accessories.',
      catalog,
    });
    expect(r.breakdown.copySanity).toBe(6);
  });
});

describe('generation eval scoring', () => {
  const scenarios = loadAllEvalScenarios();
  const minByScenarioId: Record<string, number> = {
    // Intentionally dirty input; scoring skips balance/coaching noise from synthetic fillers.
    chunk_duplicate_across_four_strength_days: 136,
  };

  it('meets quality thresholds on regression suite', async () => {
    const rows: Array<{ id: string; total: number }> = [];
    for (const s of scenarios) {
      const row = await scoreEvalScenario(s);
      rows.push({ id: row.id, total: row.score.breakdown.total });
      const min = minByScenarioId[s.id] ?? 134;
      if (row.score.breakdown.total < min) {
        throw new Error(
          `Score too low for ${s.id}: ${row.score.breakdown.total} < ${min}. Findings: ${row.score.findings.join(' | ')}`,
        );
      }
    }

    const avg = rows.reduce((sum, r) => sum + r.total, 0) / rows.length;
    expect(avg).toBeGreaterThanOrEqual(136);
  });
});
