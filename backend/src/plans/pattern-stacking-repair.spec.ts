import { ExercisesService } from '../exercises/exercises.service';
import type { GenerateSessionsDto } from './dto/generate-sessions.dto';
import type { GeneratedSession } from './session-enrichment';
import { coachCheckProgram } from './coach-check';
import { repairPatternStacking } from './pattern-stacking-repair';

type Spec = GenerateSessionsDto['sessions'][number];

function spec(overrides: Partial<Spec> = {}): Spec {
  return {
    type: 'strength',
    title: 'Push',
    durationMin: 45,
    durationMax: 60,
    isHardDay: false,
    weekIndex: 1,
    weekday: 'Monday',
    ...overrides,
  };
}

/**
 * Real catalog: the assertions must hold against the ids and metadata the
 * generator actually sees (a fake catalog would only prove the fake).
 */
describe('repairPatternStacking (real catalog)', () => {
  let library: ExercisesService;
  beforeAll(async () => {
    library = new ExercisesService();
    await library.onModuleInit();
  });

  const row = (id: string, sets = 4) => {
    const meta = library.findOne(id);
    if (!meta) throw new Error(`fixture id missing from catalog: ${id}`);
    return {
      name: meta.name,
      exerciseId: id,
      sets,
      reps: 8,
      repsMin: 8,
      repsMax: 12,
      restSeconds: 120,
      targetRir: 2,
      primaryMuscleGroup: meta.primaryMuscleGroup,
    };
  };

  it('turns the third press of a Push day into an isolation for the same muscle, keeping the main lift', () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Push',
      exercises: [
        row('barbell_overhead_press'),
        row('parallel_bar_dip'),
        row('push_up', 3),
        row('dumbbell_lateral_raise', 3),
      ],
    };
    const before = coachCheckProgram({
      sessions: [session],
      specs: [spec()],
      findMeta: (id) => library.findOne(id),
      prefs: { goal: 'hypertrophy', difficulty: 'intermediate' },
    });
    expect(
      before.flatMap((r) => r.findings).some((f) => f.code === 'stacking'),
    ).toBe(true);

    const out = repairPatternStacking({
      sessions: [session],
      specs: [spec()],
      library,
      prefs: { goal: 'hypertrophy', difficulty: 'intermediate' },
    });
    expect(out.repairs).toBe(1);
    const rows = out.sessions[0]!.exercises;
    expect(rows[0]!.exerciseId).toBe('barbell_overhead_press');
    expect(rows[1]!.exerciseId).toBe('parallel_bar_dip');
    const swapped = rows[2]!;
    expect(swapped.exerciseId).not.toBe('push_up');
    const meta = library.findOne(swapped.exerciseId!)!;
    expect((meta.type ?? '').toLowerCase()).toBe('isolation');
    expect(meta.primaryMuscleGroup).toBe('Chest');
    expect(swapped.targetRir).toBeDefined();
    expect(swapped.restSeconds).toBeDefined();
    expect(swapped.repsMin).toBeDefined();

    const after = coachCheckProgram({
      sessions: out.sessions,
      specs: [spec()],
      findMeta: (id) => library.findOne(id),
      prefs: { goal: 'hypertrophy', difficulty: 'intermediate' },
    });
    expect(
      after.flatMap((r) => r.findings).some((f) => f.code === 'stacking'),
    ).toBe(false);
  });

  it('never picks a lift already used that week, and leaves a clean day alone', () => {
    const clean: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Push',
      exercises: [
        row('barbell_overhead_press'),
        row('flat_barbell_bench_press'),
        row('dumbbell_lateral_raise', 3),
      ],
    };
    const stacked: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Thursday',
      name: 'Push',
      exercises: [
        row('incline_barbell_bench_press'),
        row('seated_dumbbell_shoulder_press'),
        row('push_up', 3),
        row('flat_dumbbell_fly', 3), // the obvious chest isolation is taken
      ],
    };
    const out = repairPatternStacking({
      sessions: [clean, stacked],
      specs: [spec(), spec({ weekday: 'Thursday' })],
      library,
      prefs: { goal: 'hypertrophy', difficulty: 'intermediate' },
    });
    expect(out.sessions[0]).toBe(clean);
    expect(out.repairs).toBe(1);
    const ids = out.sessions[1]!.exercises.map((e) => e.exerciseId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('push_up');
    expect(ids).not.toContain('flat_dumbbell_fly_duplicate');
    expect(ids.filter((id) => id === 'flat_dumbbell_fly')).toHaveLength(1);
  });

  it('caps hinges at two on a Legs day', () => {
    const legs: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Wednesday',
      name: 'Legs',
      exercises: [
        row('back_squat'),
        row('conventional_deadlift'),
        row('barbell_romanian_deadlift'),
        row('barbell_hip_thrust', 3),
      ],
    };
    const out = repairPatternStacking({
      sessions: [legs],
      specs: [spec({ title: 'Legs', weekday: 'Wednesday' })],
      library,
      prefs: { goal: 'strength', difficulty: 'intermediate' },
    });
    const after = coachCheckProgram({
      sessions: out.sessions,
      specs: [spec({ title: 'Legs', weekday: 'Wednesday' })],
      findMeta: (id) => library.findOne(id),
      prefs: { goal: 'strength', difficulty: 'intermediate' },
    });
    expect(
      after.flatMap((r) => r.findings).some((f) => f.code === 'stacking'),
    ).toBe(false);
    expect(out.sessions[0]!.exercises[0]!.exerciseId).toBe('back_squat');
    expect(out.sessions[0]!.exercises[1]!.exerciseId).toBe(
      'conventional_deadlift',
    );
  });
});
