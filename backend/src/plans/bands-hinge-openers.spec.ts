import { ExercisesService } from '../exercises/exercises.service';
import {
  getAcceptedOpenerIdsForFocus,
  LIGHT_ANCHOR_IDS,
} from '../data/anchor-exercises';
import { enrichGeneratedSession } from './session-enrichment';

const BANDS_ONLY = ['Resistance Band', 'Bodyweight'];
const BAND_HINGES = [
  'resistance_band_romanian_deadlift',
  'resistance_band_pull_through',
  'resistance_band_good_morning',
];

/**
 * Scenario matrix 2026-09-17, plan 15 (bands only, three full-body days):
 * the pool had no hinge opener beyond the glute bridge and the bodyweight
 * single-leg RDL, so once both were used the third day kept whatever the
 * model put first. The catalog had the band hinges; the anchor lists did not.
 */
describe('bands-only hinge openers (real catalog)', () => {
  let library: ExercisesService;
  beforeAll(async () => {
    library = new ExercisesService();
    await library.onModuleInit();
  });

  it('the lower and full-body opener lists reach the band hinges on a bands-only setup', () => {
    for (const focus of ['Lower', 'Legs', 'Full Body']) {
      const accepted = getAcceptedOpenerIdsForFocus(focus, {
        equipment: BANDS_ONLY,
        difficulty: 'intermediate',
      });
      for (const id of BAND_HINGES) expect(accepted).toContain(id);
    }
    for (const id of BAND_HINGES) {
      const meta = library.findOne(id)!;
      expect(meta.movementPatterns).toContain('Hinge');
      expect(meta.primaryEquipment).toEqual(['Resistance Band']);
      // A band hinge opens a session only when nothing heavier is on hand.
      expect(LIGHT_ANCHOR_IDS.has(id)).toBe(true);
    }
    const gym = getAcceptedOpenerIdsForFocus('Lower', {
      equipment: ['Barbell', 'Dumbbell', 'Machine', 'Cable'],
      difficulty: 'intermediate',
    });
    for (const id of BAND_HINGES) expect(gym).not.toContain(id);
  });

  it('a bands-only hinge day whose bridge and single-leg RDL are spent opens with a band hinge', async () => {
    const row = (id: string, sets: number, reps: number) => {
      const meta = library.findOne(id)!;
      return {
        name: meta.name,
        exerciseId: id,
        sets,
        reps,
        restSeconds: 90,
        primaryMuscleGroup: meta.primaryMuscleGroup,
      };
    };
    const out = await enrichGeneratedSession(
      {
        weekIndex: 1,
        weekday: 'Friday',
        name: 'Lower · Deadlift + Row',
        exercises: [
          // A hinge the slot-one check does not accept as an opener.
          row('resistance_band_hip_thrust', 4, 10),
          row('resistance_band_bent_over_row', 3, 10),
          row('lying_resistance_band_leg_curl', 3, 12),
          row('resistance_band_squat', 3, 12),
        ],
      },
      { type: 'strength', title: 'Lower · Deadlift + Row' },
      library,
      BANDS_ONLY,
      ['glute_bridge', 'bodyweight_single_leg_romanian_deadlift'],
      {
        goal: 'hypertrophy',
        durationMinutes: 40,
        detailLevel: 'detailed',
        difficulty: 'intermediate',
      },
    );
    const opener = out.exercises[0]!.exerciseId;
    expect(BAND_HINGES).toContain(opener);
  });
});
