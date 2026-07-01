import { groupExercises, getVariationNames } from './exerciseGrouping';
import type { Exercise } from '../services/exerciseService';

function ex(partial: Partial<Exercise> & { id: string; name: string }): Exercise {
  return {
    primaryMuscleGroup: 'Chest',
    subMuscles: [],
    secondaryMuscleGroups: [],
    equipment: [],
    movementPatterns: [],
    ...partial,
  } as Exercise;
}

describe('groupExercises', () => {
  it('groups by server groupKey and headlines the first (best-ranked) variant', () => {
    const groups = groupExercises([
      ex({ id: 'flat-bb', name: 'Flat Barbell Bench Press', groupKey: 'flat bench press' }),
      ex({ id: 'flat-db', name: 'Flat Dumbbell Bench Press', groupKey: 'flat bench press' }),
      ex({ id: 'incline-bb', name: 'Incline Barbell Bench Press', groupKey: 'incline bench press' }),
    ]);

    expect(groups).toHaveLength(2);
    // Headline is the first row in backend rank order, not the shortest name.
    expect(groups[0].primaryExercise.id).toBe('flat-bb');
    expect(groups[0].exercises.map((e) => e.id)).toEqual(['flat-bb', 'flat-db']);
    // Incline stays its own family instead of merging into "Bench Press".
    expect(groups[1].primaryExercise.id).toBe('incline-bb');
  });

  it('falls back to exact-name grouping when groupKey is missing', () => {
    const groups = groupExercises([
      ex({ id: 'a', name: 'Bench Press' }),
      ex({ id: 'b', name: 'bench press ' }),
      ex({ id: 'c', name: 'Incline Bench Press' }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].exercises.map((e) => e.id)).toEqual(['a', 'b']);
    expect(groups[1].exercises.map((e) => e.id)).toEqual(['c']);
  });

  it('keeps families in the order the backend ranked their best variant', () => {
    const groups = groupExercises([
      ex({ id: 'squat', name: 'Squat', groupKey: 'squat' }),
      ex({ id: 'bench', name: 'Bench Press', groupKey: 'bench press' }),
      ex({ id: 'squat-db', name: 'Dumbbell Squat', groupKey: 'squat' }),
    ]);

    expect(groups.map((g) => g.primaryExercise.id)).toEqual(['squat', 'bench']);
  });
});

describe('getVariationNames', () => {
  it('lists other variants, excluding the headline and duplicate names', () => {
    const groups = groupExercises([
      ex({ id: 'flat-bb', name: 'Flat Barbell Bench Press', groupKey: 'flat bench press' }),
      ex({ id: 'flat-db', name: 'Flat Dumbbell Bench Press', groupKey: 'flat bench press' }),
      ex({ id: 'flat-db-2', name: 'Flat Dumbbell Bench Press', groupKey: 'flat bench press' }),
    ]);

    expect(getVariationNames(groups[0])).toEqual(['Flat Dumbbell Bench Press']);
  });

  it('returns nothing for a single-exercise family', () => {
    const groups = groupExercises([ex({ id: 'solo', name: 'Squat', groupKey: 'squat' })]);
    expect(getVariationNames(groups[0])).toEqual([]);
  });
});
