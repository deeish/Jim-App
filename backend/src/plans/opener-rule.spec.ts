import { ExercisesService } from '../exercises/exercises.service';
import {
  getAcceptedOpenerIdsForFocus,
  isGymLikeEquipment,
} from '../data/anchor-exercises';
import { validateGeneratedProgramChunk } from './generated-chunk-validators';
import { enrichGeneratedSession } from './session-enrichment';
import type { GeneratedSession } from './session-enrichment';

const GYM = ['Barbell', 'Dumbbell', 'Machine', 'Cable', 'Pull-up Bar'];
const HOME = ['Dumbbell', 'Resistance Band', 'Bodyweight'];

/**
 * Rig run 2026-09-17: an intermediate with a full rack got a goblet squat
 * leading Lower and a bodyweight squat on Lower 2, and the slot-one check
 * passed both because they sit in the anchor list for home users.
 */
describe('opener rule: light anchors do not open a gym session past beginner', () => {
  let library: ExercisesService;
  beforeAll(async () => {
    library = new ExercisesService();
    await library.onModuleInit();
  });

  it('classifies equipment lists', () => {
    expect(isGymLikeEquipment(GYM)).toBe(true);
    expect(isGymLikeEquipment(HOME)).toBe(false);
    expect(isGymLikeEquipment(undefined)).toBe(false);
  });

  it('keeps the light anchors at home and for beginners, drops them for a gym intermediate', () => {
    const home = getAcceptedOpenerIdsForFocus('Lower', {
      equipment: HOME,
      difficulty: 'intermediate',
    });
    expect(home).toContain('goblet_squat');
    const beginner = getAcceptedOpenerIdsForFocus('Lower', {
      equipment: GYM,
      difficulty: 'beginner',
    });
    expect(beginner).toContain('goblet_squat');
    const gym = getAcceptedOpenerIdsForFocus('Lower', {
      equipment: GYM,
      difficulty: 'intermediate',
    });
    expect(gym).not.toContain('goblet_squat');
    expect(gym).not.toContain('bodyweight_squat');
    expect(gym).toContain('back_squat');
    // no context: the old behaviour, so synthetic fixtures are unaffected
    expect(getAcceptedOpenerIdsForFocus('Lower')).toContain('goblet_squat');
  });

  const lowerLedByGoblet = (): GeneratedSession => ({
    weekIndex: 1,
    weekday: 'Tuesday',
    name: 'Lower',
    exercises: [
      { name: 'Goblet Squat', sets: 5, reps: 8, exerciseId: 'goblet_squat' },
      {
        name: 'Trap Bar Deadlift',
        sets: 4,
        reps: 10,
        exerciseId: 'trap_bar_deadlift',
      },
      { name: 'Front Plank', sets: 3, reps: 40, exerciseId: 'front_plank' },
      {
        name: 'Seated Leg Curl',
        sets: 3,
        reps: 12,
        exerciseId: 'seated_leg_curl',
      },
    ],
  });
  const spec = {
    type: 'strength' as const,
    title: 'Lower',
    weekIndex: 1,
    weekday: 'Tuesday',
    durationMin: 30,
    durationMax: 45,
    isHardDay: true,
  };
  const primary = (s: GeneratedSession) =>
    new Map(
      s.exercises.map((e) => [
        e.exerciseId!,
        library.findOne(e.exerciseId!)?.primaryMuscleGroup ?? '',
      ]),
    );
  const patterns = (s: GeneratedSession) =>
    new Map(
      s.exercises.map((e) => [
        e.exerciseId!,
        library.findOne(e.exerciseId!)?.movementPatterns ?? [],
      ]),
    );

  it('the validator flags the goblet opener for a gym intermediate and not for a home user', () => {
    const s = lowerLedByGoblet();
    const gym = validateGeneratedProgramChunk(
      [spec],
      [s],
      'detailed',
      patterns(s),
      primary(s),
      undefined,
      true,
      { equipment: GYM, difficulty: 'intermediate' },
    );
    expect(gym.issues).toContain('slot_one_not_anchor');
    expect(gym.nonAnchorSlotOneExerciseIds).toEqual(['goblet_squat']);
    const home = validateGeneratedProgramChunk(
      [spec],
      [s],
      'detailed',
      patterns(s),
      primary(s),
      undefined,
      true,
      { equipment: HOME, difficulty: 'intermediate' },
    );
    expect(home.issues).not.toContain('slot_one_not_anchor');
  });

  it('enrichment swaps the goblet squat for the barbell squat and leaves a home plan alone', async () => {
    const gym = await enrichGeneratedSession(
      lowerLedByGoblet(),
      spec,
      library,
      GYM,
      [],
      {
        goal: 'hypertrophy',
        durationMinutes: 38,
        detailLevel: 'detailed',
        difficulty: 'intermediate',
      },
    );
    expect(gym.exercises[0]!.exerciseId).toBe('back_squat');
    expect(gym.exercises.some((e) => e.exerciseId === 'goblet_squat')).toBe(
      false,
    );
    const home = await enrichGeneratedSession(
      lowerLedByGoblet(),
      spec,
      library,
      HOME,
      [],
      {
        goal: 'hypertrophy',
        durationMinutes: 38,
        detailLevel: 'detailed',
        difficulty: 'intermediate',
      },
    );
    expect(home.exercises[0]!.exerciseId).toBe('goblet_squat');
  });
});
