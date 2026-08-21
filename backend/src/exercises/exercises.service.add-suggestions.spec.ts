import { ExercisesService } from './exercises.service';
import type { TransformedExercise } from '../data/exercise-mappings';

/** Minimal catalog row for tests; only the fields the additions path reads. */
function ex(
  partial: Partial<TransformedExercise> & {
    id: string;
    name: string;
    primaryMuscleGroup: string;
  },
): TransformedExercise {
  return {
    aliases: [],
    subMuscles: [],
    secondaryMuscleGroups: [],
    equipment: ['Barbell'],
    movementPatterns: ['Push'],
    prescriptionType: 'reps',
    ...partial,
  } as unknown as TransformedExercise;
}

function withCatalog(list: TransformedExercise[]): ExercisesService {
  const service = new ExercisesService();
  (service as unknown as { exercises: TransformedExercise[] }).exercises = list;
  return service;
}

describe('ExercisesService.pickAdditionSuggestions', () => {
  /** A chest day covering Mid + Upper; Lower Chest is the open gap. */
  const chestDayCatalog = () => [
    ex({
      id: 'flat_bb',
      name: 'Flat Barbell Bench Press',
      primaryMuscleGroup: 'Chest',
      subMuscles: ['Mid Chest'],
      type: 'Compound',
    }),
    ex({
      id: 'incline_db',
      name: 'Incline Dumbbell Bench Press',
      primaryMuscleGroup: 'Chest',
      subMuscles: ['Upper Chest'],
      equipment: ['Dumbbell'],
      type: 'Compound',
    }),
    ex({
      id: 'dip',
      name: 'Chest Dip',
      primaryMuscleGroup: 'Chest',
      subMuscles: ['Lower Chest'],
      equipment: ['Bodyweight'],
      type: 'Compound',
    }),
    ex({
      id: 'mid_fly',
      name: 'Cable Fly',
      primaryMuscleGroup: 'Chest',
      subMuscles: ['Mid Chest'],
      equipment: ['Cable'],
      type: 'Isolation',
    }),
    ex({
      id: 'row',
      name: 'Barbell Bent Over Row',
      primaryMuscleGroup: 'Back',
      subMuscles: ['Lats'],
      movementPatterns: ['Pull'],
      type: 'Compound',
    }),
  ];

  it('tops the rail with the sub-muscle the day leaves uncovered, and says so', () => {
    const service = withCatalog(chestDayCatalog());
    const out = service.pickAdditionSuggestions({
      dayExerciseIds: ['flat_bb', 'incline_db'],
      count: 10,
    });
    expect(out[0].exercise.id).toBe('dip');
    expect(out[0].reasons).toContain('Adds Lower Chest');
  });

  it('never suggests day exercises, their equipment variants, or other muscle groups', () => {
    const service = withCatalog([
      ...chestDayCatalog(),
      ex({
        id: 'flat_db',
        name: 'Flat Dumbbell Bench Press',
        primaryMuscleGroup: 'Chest',
        subMuscles: ['Mid Chest'],
        equipment: ['Dumbbell'],
        type: 'Compound',
      }),
    ]);
    const out = service.pickAdditionSuggestions({
      dayExerciseIds: ['flat_bb', 'incline_db'],
      count: 10,
    });
    const ids = out.map((s) => s.exercise.id);
    expect(ids).not.toContain('flat_bb'); // already in the day
    expect(ids).not.toContain('flat_db'); // equipment twin of a day exercise
    expect(ids).not.toContain('row'); // different muscle group
  });

  it('offers an isolation finisher to an all-compound day', () => {
    const service = withCatalog(chestDayCatalog());
    const out = service.pickAdditionSuggestions({
      dayExerciseIds: ['flat_bb', 'incline_db'],
      count: 10,
    });
    const fly = out.find((s) => s.exercise.id === 'mid_fly');
    expect(fly?.reasons).toContain('Isolation finisher');
  });

  it('offers a compound anchor to a day with no compound', () => {
    const service = withCatalog(chestDayCatalog());
    const out = service.pickAdditionSuggestions({
      dayExerciseIds: ['mid_fly'],
      count: 10,
    });
    const anchor = out.find((s) =>
      s.reasons.includes('Anchor lift for this day'),
    );
    expect(anchor).toBeDefined();
    expect((anchor?.exercise.type ?? '').toLowerCase()).toBe('compound');
  });

  it('ranks a lift the user really trains above an otherwise-equal stranger', () => {
    const service = withCatalog([
      ...chestDayCatalog(),
      ex({
        id: 'decline_press',
        name: 'Decline Machine Press',
        primaryMuscleGroup: 'Chest',
        subMuscles: ['Lower Chest'],
        equipment: ['Machine'],
        type: 'Compound',
      }),
    ]);
    const base = { dayExerciseIds: ['flat_bb', 'incline_db'], count: 10 };
    const history = new Map([
      [
        'decline_press',
        { count: 5, lastAt: new Date(Date.now() - 9 * 86_400_000) },
      ],
    ]);
    const out = service.pickAdditionSuggestions(base, history);
    // Both hit the Lower Chest gap; the trained one wins and explains itself.
    expect(out[0].exercise.id).toBe('decline_press');
    expect(out[0].reasons).toContain("You've trained this before");
    const without = service.pickAdditionSuggestions(base);
    expect(without[0].exercise.id).toBe('dip');
  });

  it('demotes candidates already planned elsewhere this week', () => {
    const service = withCatalog(chestDayCatalog());
    const base = { dayExerciseIds: ['flat_bb', 'incline_db'], count: 10 };
    const out = service.pickAdditionSuggestions({
      ...base,
      weekExerciseIds: ['dip'],
    });
    expect(out[0].exercise.id).not.toBe('dip');
    expect(out.map((s) => s.exercise.id)).toContain('dip'); // demoted, not hidden
  });

  it('falls back to recommended-tier anchors on an empty day (real tier ids)', () => {
    const service = withCatalog([
      ex({
        id: 'flat_barbell_bench_press', // real S-tier id
        name: 'Flat Barbell Bench Press',
        primaryMuscleGroup: 'Chest',
        subMuscles: ['Mid Chest'],
        type: 'Compound',
      }),
      ex({
        id: 'not_a_real_tier_id',
        name: 'Obscure Movement',
        primaryMuscleGroup: 'Chest',
        type: 'Isolation',
      }),
    ]);
    const out = service.pickAdditionSuggestions({ count: 10 });
    expect(out.map((s) => s.exercise.id)).toEqual(['flat_barbell_bench_press']);
    expect(out[0].reasons).toContain('Anchor lift to build around');
  });

  it('respects equipment and avoid, caps at count, at most two reasons, deterministic', () => {
    const service = withCatalog(chestDayCatalog());
    const dto = {
      dayExerciseIds: ['flat_bb'],
      equipment: ['Cable', 'Bodyweight'],
      avoid: ['dip'],
      count: 1,
    };
    const a = service.pickAdditionSuggestions(dto);
    const b = service.pickAdditionSuggestions(dto);
    expect(a.map((s) => s.exercise.id)).toEqual(b.map((s) => s.exercise.id));
    expect(a).toHaveLength(1);
    expect(a[0].exercise.id).toBe('mid_fly'); // dip avoided, incline_db not in gear
    expect(a[0].reasons.length).toBeGreaterThanOrEqual(1);
    expect(a[0].reasons.length).toBeLessThanOrEqual(2);
  });
});
