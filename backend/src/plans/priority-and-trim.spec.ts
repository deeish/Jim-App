import { ExercisesService } from '../exercises/exercises.service';
import type { GeneratedSession } from './session-enrichment';
import { coachCheckProgram } from './coach-check';
import { clampSessionWorkingSets } from './session-enrichment';
import {
  allocateWeeklyVolume,
  trimWeeklyVolumeToBand,
} from './weekly-volume-allocation';

/**
 * Rig run 4 (2026-09-17): Back, the "bring up" choice, landed at 13.5 sets
 * while Shoulders sat at the 22-set ceiling, because the 30-45 minute days
 * had no spare time for another set; and week-4 Lower kept a 6-set squat and
 * lost both leg accessories to the band trim, leaving a three-row day.
 */
describe('priority rebalance and the main-lift trim cap (real catalog)', () => {
  let library: ExercisesService;
  beforeAll(async () => {
    library = new ExercisesService();
    await library.onModuleInit();
  });
  const row = (id: string, sets: number, rest = 90) => {
    const meta = library.findOne(id)!;
    return {
      name: meta.name,
      exerciseId: id,
      sets,
      reps: 10,
      repsMin: 8,
      repsMax: 12,
      restSeconds: rest,
      targetRir: 2,
      primaryMuscleGroup: meta.primaryMuscleGroup,
    };
  };
  const spec = (weekday: string, title: string) => ({
    type: 'strength' as const,
    title,
    weekIndex: 1,
    weekday,
    durationMin: 30,
    durationMax: 45,
    isHardDay: true,
  });
  const session = (
    weekday: string,
    name: string,
    exercises: GeneratedSession['exercises'],
  ): GeneratedSession => ({ weekIndex: 1, weekday, name, exercises });
  const prefs = {
    goal: 'hypertrophy',
    difficulty: 'intermediate',
    priorityMuscle: 'Back',
  };

  it('moves sets from the biggest non-priority accessory to the priority muscle when the days are full', () => {
    // The run-4 week: shoulders hit twice with a press and a raise on both
    // upper days, back with one pull per day at three sets.
    const sessions = [
      session('Monday', 'Upper', [
        row('flat_barbell_bench_press', 4, 120),
        row('barbell_bent_over_row', 3),
        row('barbell_overhead_press', 4),
        row('dumbbell_lateral_raise', 4, 60),
        row('standing_ez_bar_cable_curl', 3, 60),
      ]),
      session('Tuesday', 'Lower', [
        row('back_squat', 5, 120),
        row('trap_bar_deadlift', 3),
        row('seated_leg_extension', 3, 60),
        row('floor_crunch', 3, 60),
      ]),
      session('Thursday', 'Upper 2', [
        row('incline_barbell_bench_press', 4, 120),
        row('pull_up_pronated', 3),
        row('seated_dumbbell_shoulder_press', 4),
        row('cable_lateral_raise', 4, 60),
        row('straight_bar_cable_pushdown', 3, 60),
      ]),
      session('Friday', 'Lower 2', [
        row('conventional_deadlift', 4, 120),
        row('forty_five_degree_leg_press', 3),
        row('hanging_leg_raise', 3, 60),
        row('lying_leg_curl', 3, 60),
      ]),
    ];
    const specs = [
      spec('Monday', 'Upper'),
      spec('Tuesday', 'Lower'),
      spec('Thursday', 'Upper 2'),
      spec('Friday', 'Lower 2'),
    ];
    const findMeta = (id: string) => library.findOne(id);
    const before = coachCheckProgram({ sessions, specs, findMeta, prefs })[0]!;
    const out = allocateWeeklyVolume({ sessions, specs, findMeta, prefs });
    const after = coachCheckProgram({
      sessions: out.sessions,
      specs,
      findMeta,
      prefs,
    })[0]!;
    expect(after.volumeByMuscle.Back!.weighted).toBeGreaterThan(
      before.volumeByMuscle.Back!.weighted,
    );
    expect(after.volumeByMuscle.Shoulders!.weighted).toBeLessThan(
      before.volumeByMuscle.Shoulders!.weighted,
    );
    const moved = out.adjustments
      .flatMap((a) => a.notes)
      .filter((n) => n.startsWith('moved 1 set'));
    expect(moved.length).toBeGreaterThan(0);
    // the donor never leaves the band
    expect(after.volumeByMuscle.Shoulders!.weighted).toBeGreaterThanOrEqual(8);
  });

  it('main lifts give sets back, down to four on a four-row day, before the last accessory goes', () => {
    // A beginner's Legs ceiling is 27 (18 × 1.5). Three lower days at
    // their floors with six-set main lifts are 33 direct sets, so only
    // the squats can give sets back; no row goes.
    const lower = (weekday: string, name: string, opener: string) => ({
      weekIndex: 1,
      weekday,
      name,
      exercises: [
        row(opener, 6, 120),
        row('barbell_romanian_deadlift', 3),
        row('seated_leg_extension', 2, 60),
        row('front_plank', 3, 60),
      ],
    });
    const sessions = [
      lower('Monday', 'Lower', 'back_squat'),
      lower('Wednesday', 'Lower 2', 'front_squat'),
      lower('Friday', 'Lower 3', 'machine_hack_squat'),
    ];
    const specs = [
      spec('Monday', 'Lower'),
      spec('Wednesday', 'Lower 2'),
      spec('Friday', 'Lower 3'),
    ];
    const findMeta = (id: string) => library.findOne(id);
    const beginner = { ...prefs, difficulty: 'beginner' };
    const legs = coachCheckProgram({
      sessions,
      specs,
      findMeta,
      prefs: beginner,
    })[0]!.volumeByMuscle.Legs!.weighted;
    expect(legs).toBeGreaterThan(27);
    const out = trimWeeklyVolumeToBand({
      sessions,
      specs,
      findMeta,
      prefs: beginner,
    });
    const notes = out.adjustments.flatMap((a) => a.notes);
    expect(notes.some((n) => n.includes('main lift above'))).toBe(true);
    expect(notes.some((n) => n.startsWith('dropped'))).toBe(false);
    for (const s of out.sessions) {
      expect(s.exercises.length).toBe(4);
      expect(s.exercises[0]!.sets).toBeLessThanOrEqual(5);
      expect(s.exercises[0]!.sets).toBeGreaterThanOrEqual(4);
    }
  });

  it('the duration clamp takes sets from every other row before the priority muscle', () => {
    const exercises = [
      row('flat_barbell_bench_press', 5, 120),
      row('barbell_bent_over_row', 5),
      row('barbell_overhead_press', 4),
      row('dumbbell_lateral_raise', 4, 60),
      row('rope_cable_pushdown', 4, 60),
    ];
    clampSessionWorkingSets(exercises, (id) => library.findOne(id), {
      goal: 'hypertrophy',
      difficulty: 'intermediate',
      priorityMuscle: 'Back',
      durationMinutes: 38,
    });
    const rowSets = exercises.find(
      (e) => e.exerciseId === 'barbell_bent_over_row',
    )!.sets;
    const others = exercises
      .filter(
        (e) =>
          !['flat_barbell_bench_press', 'barbell_bent_over_row'].includes(
            e.exerciseId!,
          ),
      )
      .map((e) => e.sets);
    expect(rowSets).toBe(5);
    expect(Math.max(...others)).toBeLessThan(4);
  });
});
