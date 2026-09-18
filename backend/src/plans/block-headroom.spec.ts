import { ExercisesService } from '../exercises/exercises.service';
import type { GeneratedSession } from './session-enrichment';
import { coachCheckProgram } from './coach-check';
import { allocateWeeklyVolume } from './weekly-volume-allocation';
import { applyWeekProgressionToEnrichedSessions } from './week-progression';
import { validateGeneratedProgramChunk } from './generated-chunk-validators';

/**
 * Rig run 7 (2026-09-17): week 1 was allocated to the 22-set ceiling, so
 * the peak week overflowed and the trim cut a lower day to three rows; the
 * row reached six sets through the multiplier; and a farmer carry beside a
 * plank failed the one-core cap.
 */
describe('block headroom, progressed-set ceilings, carries (real catalog)', () => {
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
  const spec = (
    weekday: string,
    title: string,
    weekIndex = 1,
    durationMin = 30,
    durationMax = 45,
  ) => ({
    type: 'strength' as const,
    title,
    weekIndex,
    weekday,
    durationMin,
    durationMax,
    isHardDay: true,
  });
  // 17 sets after a 1.24 peak, under the 18-set session cap the clamp enforces.
  const lowerWeek = (weekIndex: number): GeneratedSession[] => [
    {
      weekIndex,
      weekday: 'Tuesday',
      name: 'Lower',
      exercises: [
        row('back_squat', 5, 120),
        row('barbell_romanian_deadlift', 4),
        row('seated_leg_extension', 2, 60),
        row('front_plank', 3, 60),
      ],
    },
    {
      weekIndex,
      weekday: 'Friday',
      name: 'Lower 2',
      exercises: [
        row('conventional_deadlift', 5, 120),
        row('forty_five_degree_leg_press', 4),
        row('lying_leg_curl', 3, 60),
        row('hanging_leg_raise', 3, 60),
      ],
    },
  ];
  const prefs = { goal: 'hypertrophy', difficulty: 'intermediate' };
  const findMeta = (id: string) => library.findOne(id);

  it('allocates the block to ceiling ÷ peak so the peak week lands on the ceiling without a trim', () => {
    // Legs (quads, hamstrings, glutes, calves) has a 33-set ceiling; the
    // block works toward floor(33 / 1.24) = 26 and grows into 33.
    const heavy = (): GeneratedSession[] => [
      {
        weekIndex: 1,
        weekday: 'Tuesday',
        name: 'Lower',
        exercises: [
          row('back_squat', 6, 120),
          row('barbell_romanian_deadlift', 5),
          row('seated_leg_extension', 4, 60),
          row('lying_leg_curl', 4, 60),
        ],
      },
      {
        weekIndex: 1,
        weekday: 'Friday',
        name: 'Lower 2',
        exercises: [
          row('conventional_deadlift', 6, 120),
          row('forty_five_degree_leg_press', 5),
          row('seated_calf_raise_machine', 4, 60),
          row('hip_abductor_machine', 4, 60),
        ],
      },
    ];
    const sessions = heavy();
    const specs = [
      spec('Tuesday', 'Lower', 1, 60, 75),
      spec('Friday', 'Lower 2', 1, 60, 75),
    ];
    const flat = allocateWeeklyVolume({ sessions, specs, findMeta, prefs });
    const legsFlat = coachCheckProgram({
      sessions: flat.sessions,
      specs,
      findMeta,
      prefs,
    })[0]!.volumeByMuscle.Legs!.weighted;
    expect(legsFlat).toBeLessThanOrEqual(33);
    const block = allocateWeeklyVolume({
      sessions: heavy(),
      specs,
      findMeta,
      prefs,
      peakVolumeMultiplier: 1.24,
    });
    const legsBlock = coachCheckProgram({
      sessions: block.sessions,
      specs,
      findMeta,
      prefs,
    })[0]!.volumeByMuscle.Legs!.weighted;
    // floor(33 / 1.24) = 26; sets come down, rows never do
    expect(legsBlock).toBeLessThanOrEqual(26);
    expect(legsBlock).toBeLessThan(legsFlat);
    expect(block.sessions.map((s) => s.exercises.length)).toEqual([4, 4]);
  });

  it('a progressed row stops at its role ceiling: a five-set compound stays five, the main lift may reach six', () => {
    const { sessions } = applyWeekProgressionToEnrichedSessions({
      sessions: lowerWeek(4),
      // a long slot, so the time re-clamp stays out of the way
      specs: [
        spec('Tuesday', 'Lower', 4, 90, 120),
        spec('Friday', 'Lower 2', 4, 90, 120),
      ],
      weekProgression: [
        {
          weekIndex: 1,
          phase: 'foundation',
          intensityPct: 65,
          volumeMultiplier: 1,
          repModifier: 0,
        },
        {
          weekIndex: 4,
          phase: 'peak',
          intensityPct: 77,
          volumeMultiplier: 1.24,
          repModifier: 0,
        },
      ],
      findMeta,
      prefs,
    });
    const tuesday = sessions[0]!.exercises;
    expect(tuesday.find((e) => e.exerciseId === 'back_squat')!.sets).toBe(6);
    expect(
      tuesday.find((e) => e.exerciseId === 'barbell_romanian_deadlift')!.sets,
    ).toBe(5);
    expect(
      tuesday.find((e) => e.exerciseId === 'seated_leg_extension')!.sets,
    ).toBe(2);
  });

  it('a farmer carry beside a plank is not a second core row', () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Tuesday',
      name: 'Lower',
      exercises: [
        row('back_squat', 4, 120),
        row('barbell_romanian_deadlift', 3),
        row('seated_leg_extension', 2, 60),
        row('front_plank', 3, 60),
        row('farmer_carry', 3, 60),
      ],
    };
    const ids = session.exercises.map((e) => e.exerciseId!);
    const r = validateGeneratedProgramChunk(
      [spec('Tuesday', 'Lower')],
      [session],
      'detailed',
      new Map(
        ids.map((id) => [id, library.findOne(id)?.movementPatterns ?? []]),
      ),
      new Map(
        ids.map((id) => [id, library.findOne(id)?.primaryMuscleGroup ?? '']),
      ),
    );
    expect(r.issues).not.toContain('over_concentrated_pattern');
  });
});
