import { ExercisesService } from '../exercises/exercises.service';
import type { GeneratedSession } from './session-enrichment';
import { coachCheckProgram } from './coach-check';
import { enforceMuscleExposureFloor } from './muscle-exposure-floor';

const spec = (weekday: string, title: string) => ({
  type: 'strength' as const,
  title,
  weekIndex: 1,
  weekday,
  durationMin: 30,
  durationMax: 45,
});

/** Real catalog: the fix has to hold against the ids the generator actually sees. */
describe('enforceMuscleExposureFloor (real catalog)', () => {
  let library: ExercisesService;
  beforeAll(async () => {
    library = new ExercisesService();
    await library.onModuleInit();
  });
  const row = (id: string, sets = 4, rest = 90) => {
    const meta = library.findOne(id)!;
    return {
      name: meta.name,
      exerciseId: id,
      sets,
      reps: 8,
      repsMin: 8,
      repsMax: 12,
      restSeconds: rest,
      targetRir: 2,
      primaryMuscleGroup: meta.primaryMuscleGroup,
    };
  };
  const session = (
    weekday: string,
    name: string,
    exercises: GeneratedSession['exercises'],
  ): GeneratedSession => ({
    weekIndex: 1,
    weekday,
    name,
    exercises,
  });

  it('the rig week: chest on Monday only gets a second exposure on Upper 2, before the core tail', () => {
    const sessions = [
      session('Monday', 'Upper', [
        row('flat_barbell_bench_press', 4, 120),
        row('pull_up_pronated', 3),
        row('parallel_bar_dip', 3),
        row('single_arm_dumbbell_row', 3),
      ]),
      session('Tuesday', 'Lower', [
        row('back_squat', 4, 120),
        row('conventional_deadlift', 3),
        row('hanging_leg_raise', 3, 60),
      ]),
      session('Thursday', 'Upper 2', [
        row('barbell_overhead_press', 4, 120),
        row('barbell_bent_over_row', 3),
        row('chin_up', 3),
        row('side_plank', 3, 60),
      ]),
      session('Friday', 'Lower 2', [
        row('front_squat', 4, 120),
        row('barbell_romanian_deadlift', 3),
        row('barbell_hip_thrust', 3),
        row('front_plank', 3, 60),
      ]),
    ];
    const specs = [
      spec('Monday', 'Upper'),
      spec('Tuesday', 'Lower'),
      spec('Thursday', 'Upper 2'),
      spec('Friday', 'Lower 2'),
    ];
    const prefs = { goal: 'hypertrophy', difficulty: 'intermediate' };
    const before = coachCheckProgram({
      sessions,
      specs,
      findMeta: (id) => library.findOne(id),
      prefs,
    })[0]!;
    expect(before.volumeByMuscle.Chest!.exposures).toBe(1);

    const out = enforceMuscleExposureFloor({ sessions, specs, library, prefs });
    expect(out.repairs).toBeGreaterThanOrEqual(1);
    const thursday = out.sessions[2]!;
    const added = thursday.exercises.find((e) =>
      e.notes?.includes('trained twice'),
    );
    expect(added).toBeDefined();
    expect(library.findOne(added!.exerciseId!)!.primaryMuscleGroup).toBe(
      'Chest',
    );
    expect(added!.sets).toBeGreaterThanOrEqual(2);
    expect(added!.targetRir).toBeDefined();
    // inserted before the core row, never in slot one
    expect(thursday.exercises[0]!.exerciseId).toBe('barbell_overhead_press');
    expect(thursday.exercises.findIndex((e) => e === added)).toBeLessThan(
      thursday.exercises.findIndex((e) => e.exerciseId === 'side_plank'),
    );
    const after = coachCheckProgram({
      sessions: out.sessions,
      specs,
      findMeta: (id) => library.findOne(id),
      prefs,
    })[0]!;
    expect(after.volumeByMuscle.Chest!.exposures).toBe(2);
    // the other sessions are untouched objects
    expect(out.sessions[0]).toBe(sessions[0]);
  });

  it('leaves a two-day week alone and never adds a lift the week already has', () => {
    const sessions = [
      session('Monday', 'Upper', [
        row('flat_barbell_bench_press', 4, 120),
        row('pull_up_pronated', 3),
      ]),
      session('Thursday', 'Lower', [
        row('back_squat', 4, 120),
        row('barbell_romanian_deadlift', 3),
      ]),
    ];
    const specs = [spec('Monday', 'Upper'), spec('Thursday', 'Lower')];
    const out = enforceMuscleExposureFloor({
      sessions,
      specs,
      library,
      prefs: { goal: 'strength', difficulty: 'beginner' },
    });
    expect(out.repairs).toBe(0);
    expect(out.sessions[0]).toBe(sessions[0]);
  });
});
