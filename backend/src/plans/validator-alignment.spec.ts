import type { GenerateSessionsDto } from './dto/generate-sessions.dto';
import type { GeneratedSession } from './session-enrichment';
import {
  buildRetryPriorExerciseIds,
  validateGeneratedProgramChunk,
  type ChunkValidationResult,
} from './generated-chunk-validators';

/**
 * Drives on 2026-09-17: every chunk failed the first validator pass. A Push
 * day is push-pattern by design (bench, press, fly, pushdown), so the
 * "upper" same-pattern cap of three fired on every one; and the retry was
 * told to avoid every id of the first attempt, so the week went to the
 * second-best rows (a chest dip opened Push with the bench unused).
 */
const spec = (
  title: string,
  weekday: string,
): GenerateSessionsDto['sessions'][number] => ({
  type: 'strength',
  title,
  weekIndex: 1,
  weekday,
  durationMin: 45,
  durationMax: 60,
  isHardDay: true,
});

const row = (id: string) => ({ name: id, sets: 3, reps: 10, exerciseId: id });

describe('validator alignment with the ranked shortlists', () => {
  it('a Push day may carry four push-pattern rows; an Upper day still caps at three', () => {
    const movement = new Map([
      ['flat_barbell_bench_press', ['Push']],
      ['barbell_overhead_press', ['Push']],
      ['pec_deck_fly', ['Push']],
      ['rope_cable_pushdown', ['Push']],
      ['barbell_bent_over_row', ['Pull']],
    ]);
    const primary = new Map([
      ['flat_barbell_bench_press', 'Chest'],
      ['barbell_overhead_press', 'Shoulders'],
      ['pec_deck_fly', 'Chest'],
      ['rope_cable_pushdown', 'Arms'],
      ['barbell_bent_over_row', 'Back'],
    ]);
    const pushDay: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Push',
      exercises: [
        row('flat_barbell_bench_press'),
        row('barbell_overhead_press'),
        row('pec_deck_fly'),
        row('rope_cable_pushdown'),
      ],
    };
    const push = validateGeneratedProgramChunk(
      [spec('Push', 'Monday')],
      [pushDay],
      'detailed',
      movement,
      primary,
    );
    expect(push.issues).not.toContain('over_concentrated_pattern');
    const upper = validateGeneratedProgramChunk(
      [spec('Upper', 'Monday')],
      [{ ...pushDay, name: 'Upper' }],
      'detailed',
      movement,
      primary,
    );
    expect(upper.issues).toContain('over_concentrated_pattern');
  });

  it('offendersOnly demotes the named rows and keeps the rest of the first attempt available', () => {
    const sessions: GeneratedSession[] = [
      {
        weekIndex: 1,
        weekday: 'Monday',
        name: 'Push',
        exercises: [
          row('flat_barbell_bench_press'),
          row('seated_dumbbell_shoulder_press'),
          row('pec_deck_fly'),
        ],
      },
    ];
    const validation: ChunkValidationResult = {
      ok: false,
      issues: ['slot_one_not_anchor'],
      duplicateExerciseIds: [],
      patternClashExerciseIds: [],
      patternOverflowExerciseIds: [],
      subMuscleOverflowExerciseIds: [],
      nonAnchorSlotOneExerciseIds: ['seated_dumbbell_shoulder_press'],
      crossSessionOverlapExerciseIds: [],
    };
    const out = buildRetryPriorExerciseIds({
      cappedPrior: ['p1'],
      validation,
      sessions,
      offendersOnly: true,
    });
    expect(out).toEqual(['p1', 'seated_dumbbell_shoulder_press']);
    // the old behaviour is still there for callers that want it
    const all = buildRetryPriorExerciseIds({
      cappedPrior: ['p1'],
      validation,
      sessions,
    });
    expect(all).toContain('flat_barbell_bench_press');
  });
});
