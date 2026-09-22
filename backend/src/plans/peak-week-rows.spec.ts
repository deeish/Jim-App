import { ExercisesService } from '../exercises/exercises.service';
import type { GeneratedSession } from './session-enrichment';
import { coachCheckProgram } from './coach-check';
import { trimWeeklyVolumeToBand } from './weekly-volume-allocation';
import { applyWeekProgressionToEnrichedSessions } from './week-progression';

describe('peak week keeps a five-row day (scenario matrix 2026-09-17, plans 01 and 11)', () => {
  let library: ExercisesService;
  beforeAll(async () => {
    library = new ExercisesService();
    await library.onModuleInit();
  });
  const row = (id: string, sets: number, reps = 10, rest = 90) => {
    const meta = library.findOne(id)!;
    return {
      name: meta.name,
      exerciseId: id,
      sets,
      reps,
      repsMin: reps - 2,
      repsMax: reps + 2,
      restSeconds: rest,
      targetRir: 2,
      primaryMuscleGroup: meta.primaryMuscleGroup,
    };
  };
  const spec = (
    weekday: string,
    title: string,
    weekIndex: number,
    isHardDay: boolean,
  ) => ({
    type: 'strength' as const,
    title,
    weekIndex,
    weekday,
    durationMin: 45,
    durationMax: 60,
    isHardDay,
  });
  const weekProgression = [
    {
      weekIndex: 1,
      phase: 'foundation',
      intensityPct: 65,
      volumeMultiplier: 1,
      repModifier: 0,
    },
    {
      weekIndex: 2,
      phase: 'progression',
      intensityPct: 69,
      volumeMultiplier: 1.08,
      repModifier: 0,
    },
    {
      weekIndex: 3,
      phase: 'progression',
      intensityPct: 73,
      volumeMultiplier: 1.16,
      repModifier: 0,
    },
    {
      weekIndex: 4,
      phase: 'peak',
      intensityPct: 77,
      volumeMultiplier: 1.24,
      repModifier: 0,
    },
  ];
  const findMeta = (id: string) => library.findOne(id);

  it('plan 01: six-day push/pull/legs, priority chest — both push days keep five rows in week 4', () => {
    const week = (weekIndex: number): GeneratedSession[] => [
      {
        weekIndex,
        weekday: 'Monday',
        name: 'Push',
        exercises: [
          row('flat_barbell_bench_press', 6, 8, 120),
          row('barbell_overhead_press', 3),
          row('standing_barbell_curl', 2, 12, 60),
          row('dumbbell_lateral_raise', 2, 12, 60),
          row('rope_cable_pushdown', 2, 12, 60),
        ],
      },
      {
        weekIndex,
        weekday: 'Tuesday',
        name: 'Pull',
        exercises: [
          row('lat_pulldown_wide', 4, 8),
          row('barbell_bent_over_row', 3),
          row('standing_dumbbell_curl', 2, 12, 60),
          row('incline_dumbbell_curl', 2, 12, 60),
          {
            ...row('farmer_handle_carry', 1),
            prescriptionType: 'time',
            durationSeconds: 60,
          },
        ],
      },
      {
        weekIndex,
        weekday: 'Wednesday',
        name: 'Legs',
        exercises: [
          row('back_squat', 4, 8, 120),
          row('barbell_romanian_deadlift', 3),
          row('seated_leg_extension', 2, 12, 60),
          row('seated_calf_raise_machine', 2, 12, 60),
          {
            ...row('front_plank', 1),
            prescriptionType: 'time',
            durationSeconds: 60,
          },
        ],
      },
      {
        weekIndex,
        weekday: 'Thursday',
        name: 'Push 2',
        exercises: [
          row('incline_dumbbell_bench_press', 6, 8, 120),
          row('seated_dumbbell_shoulder_press', 3),
          row('dumbbell_hammer_curl', 2, 12, 60),
          row('pec_deck_fly', 3, 12, 60),
          row('bent_over_dumbbell_reverse_fly', 2, 12, 60),
        ],
      },
      {
        weekIndex,
        weekday: 'Friday',
        name: 'Pull 2',
        exercises: [
          row('pull_up_pronated', 4, 8),
          row('t_bar_row', 3),
          row('barbell_shrug', 2, 12, 60),
          row('standing_ez_bar_curl', 2, 12, 60),
          {
            ...row('trap_bar_carry', 1),
            prescriptionType: 'time',
            durationSeconds: 60,
          },
        ],
      },
      {
        weekIndex,
        weekday: 'Saturday',
        name: 'Legs 2',
        exercises: [
          row('conventional_deadlift', 4, 8, 120),
          row('front_squat', 3),
          row('hanging_leg_raise', 3, 12, 60),
          row('bodyweight_calf_raise', 2, 12, 60),
          row('lying_leg_curl', 2, 12, 60),
        ],
      },
    ];
    const sessions = [1, 2, 3, 4].flatMap((w) => week(w));
    const specs = [1, 2, 3, 4].flatMap((w) => [
      spec('Monday', 'Push', w, true),
      spec('Tuesday', 'Pull', w, false),
      spec('Wednesday', 'Legs', w, true),
      spec('Thursday', 'Push 2', w, false),
      spec('Friday', 'Pull 2', w, true),
      spec('Saturday', 'Legs 2', w, false),
    ]);
    const prefs = {
      goal: 'hypertrophy',
      difficulty: 'intermediate',
      priorityMuscle: 'Chest',
    };
    const progressed = applyWeekProgressionToEnrichedSessions({
      sessions,
      specs,
      weekProgression,
      findMeta,
      prefs,
    });
    const trimmed = trimWeeklyVolumeToBand({
      sessions: progressed.sessions,
      specs,
      findMeta,
      prefs,
    });
    const out4 = trimmed.sessions.filter((s) => s.weekIndex === 4);
    // Shoulders lands half a set over its 28 in the peak week. Both presses
    // give a set back; the two-set reverse fly used to be dropped for the
    // rest, leaving a four-row push day. It stays, and the week runs over.
    for (const s of out4) expect(s.exercises.length).toBe(5);
    const push2 = out4.find((s) => s.name === 'Push 2')!.exercises;
    expect(
      push2.find((e) => e.exerciseId === 'bent_over_dumbbell_reverse_fly')!
        .sets,
    ).toBe(2);
    expect(
      push2.find((e) => e.exerciseId === 'seated_dumbbell_shoulder_press')!
        .sets,
    ).toBe(3);
    const notes = trimmed.adjustments.flatMap((a) => a.notes);
    expect(notes.some((n) => n.startsWith('dropped'))).toBe(false);
    expect(notes.some((n) => n.startsWith('kept every Shoulders row'))).toBe(
      true,
    );
    const shoulders = coachCheckProgram({
      sessions: trimmed.sessions,
      specs,
      findMeta,
      prefs,
    }).find((r) => r.weekIndex === 4)!.volumeByMuscle.Shoulders!.weighted;
    expect(shoulders).toBeLessThanOrEqual(28.5);
  });

  it('a sixth row still goes: only a day over five lifts gives a row up to the band', () => {
    // Three shoulder-heavy days at their floors, six lifts each, one week.
    const day = (
      weekday: string,
      name: string,
      opener: string,
    ): GeneratedSession => ({
      weekIndex: 1,
      weekday,
      name,
      exercises: [
        row(opener, 5, 8, 120),
        row('seated_dumbbell_shoulder_press', 3),
        row('dumbbell_lateral_raise', 2, 12, 60),
        row('bent_over_dumbbell_reverse_fly', 2, 12, 60),
        row('standing_barbell_curl', 2, 12, 60),
        row('rope_cable_pushdown', 2, 12, 60),
      ],
    });
    const sessions = [
      day('Monday', 'Shoulders', 'barbell_overhead_press'),
      day('Wednesday', 'Shoulders 2', 'barbell_overhead_press'),
      day('Friday', 'Shoulders 3', 'barbell_overhead_press'),
    ];
    const specs = [
      spec('Monday', 'Shoulders', 1, true),
      spec('Wednesday', 'Shoulders 2', 1, true),
      spec('Friday', 'Shoulders 3', 1, true),
    ];
    const prefs = { goal: 'hypertrophy', difficulty: 'intermediate' };
    const before = coachCheckProgram({ sessions, specs, findMeta, prefs })[0]!
      .volumeByMuscle.Shoulders!.weighted;
    expect(before).toBeGreaterThan(28);
    const trimmed = trimWeeklyVolumeToBand({
      sessions,
      specs,
      findMeta,
      prefs,
    });
    const notes = trimmed.adjustments.flatMap((a) => a.notes);
    expect(notes.some((n) => n.startsWith('dropped'))).toBe(true);
    // A day loses at most its sixth row, never a fifth.
    for (const s of trimmed.sessions)
      expect(s.exercises.length).toBeGreaterThanOrEqual(5);
  });
});
