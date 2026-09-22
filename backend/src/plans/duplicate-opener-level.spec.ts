import { ExercisesService } from '../exercises/exercises.service';
import {
  getAcceptedOpenerIdsForFocus,
  LIGHT_ANCHOR_IDS,
} from '../data/anchor-exercises';
import type { GenerateSessionsDto } from './dto/generate-sessions.dto';
import type { GeneratedSession } from './session-enrichment';
import {
  dedupeEnrichedProgramSessions,
  repairChunkGeneratedSessions,
} from './generation-chunk-repair';

/**
 * Open items 2026-09-21, item 4: the duplicate repair chose a replacement
 * opener without the user's level, so its accepted list disagreed with the
 * slot-one check's and enrichment swapped the row a second time.
 */
describe('duplicate opener repair honours the user level (real catalog)', () => {
  let library: ExercisesService;
  beforeAll(async () => {
    library = new ExercisesService();
    await library.onModuleInit();
  });
  const gym = ['barbell', 'dumbbells', 'cable', 'machines'];
  const row = (id: string, sets = 3) => {
    const meta = library.findOne(id)!;
    return {
      name: meta.name,
      exerciseId: id,
      sets,
      reps: 10,
      restSeconds: 90,
      primaryMuscleGroup: meta.primaryMuscleGroup,
    };
  };
  const spec = (
    weekday: string,
    title: string,
  ): GenerateSessionsDto['sessions'][number] => ({
    type: 'strength',
    title,
    weekday,
    weekIndex: 1,
    durationMin: 45,
    durationMax: 60,
    isHardDay: true,
  });
  // Two lower days that both open with the same light anchor.
  const week = (): GeneratedSession[] => [
    {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Lower',
      exercises: [
        row('goblet_squat', 4),
        row('barbell_romanian_deadlift'),
        row('seated_leg_extension'),
      ],
    },
    {
      weekIndex: 1,
      weekday: 'Thursday',
      name: 'Lower 2',
      exercises: [
        row('goblet_squat', 4),
        row('lying_leg_curl'),
        row('walking_lunge'),
      ],
    },
  ];
  const specs = [spec('Monday', 'Lower'), spec('Thursday', 'Lower 2')];

  for (const entry of [
    { name: 'repairChunkGeneratedSessions', run: repairChunkGeneratedSessions },
    {
      name: 'dedupeEnrichedProgramSessions',
      run: dedupeEnrichedProgramSessions,
    },
  ]) {
    it(`${entry.name}: a gym intermediate's duplicate opener becomes a staple, never a light anchor`, () => {
      const out = entry.run({
        sessions: week(),
        specs,
        library,
        equipment: gym,
        difficulty: 'intermediate',
      });
      const opener = out.sessions[1]!.exercises[0]!.exerciseId!;
      expect(opener).not.toBe('goblet_squat');
      expect(LIGHT_ANCHOR_IDS.has(opener)).toBe(false);
      expect(
        getAcceptedOpenerIdsForFocus('Lower 2', {
          equipment: gym,
          difficulty: 'intermediate',
        }),
      ).toContain(opener);
    });

    it(`${entry.name}: a gym beginner's duplicate opener may be any opener the slot-one check accepts for a beginner`, () => {
      const out = entry.run({
        sessions: week(),
        specs,
        library,
        equipment: gym,
        difficulty: 'beginner',
      });
      const opener = out.sessions[1]!.exercises[0]!.exerciseId!;
      expect(opener).not.toBe('goblet_squat');
      expect(
        getAcceptedOpenerIdsForFocus('Lower 2', {
          equipment: gym,
          difficulty: 'beginner',
        }),
      ).toContain(opener);
    });
  }

  it('the level is what decides: with only light lower openers on offer, a beginner is repaired and an intermediate is left as is', () => {
    // Only light anchors in the pool. Before the level was threaded through,
    // the repair filtered them out for everyone in a gym, so a beginner's
    // duplicate stayed and the slot-one check then flagged it.
    const light = ['bodyweight_squat', 'dumbbell_sumo_squat', 'sumo_squat'];
    const narrow = {
      findOne: (id: string) => library.findOne(id),
      getCandidatesForGenerator: () =>
        light.map((id) => library.findOne(id)!).filter(Boolean),
    };
    const beginner = repairChunkGeneratedSessions({
      sessions: week(),
      specs,
      library: narrow,
      equipment: gym,
      difficulty: 'beginner',
    });
    expect(light).toContain(beginner.sessions[1]!.exercises[0]!.exerciseId);
    const intermediate = repairChunkGeneratedSessions({
      sessions: week(),
      specs,
      library: narrow,
      equipment: gym,
      difficulty: 'intermediate',
    });
    expect(intermediate.sessions[1]!.exercises[0]!.exerciseId).toBe(
      'goblet_squat',
    );
  });
});
