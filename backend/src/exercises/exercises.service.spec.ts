import { ExercisesService } from './exercises.service';
import type { TransformedExercise } from '../data/exercise-mappings';

/** Minimal catalog row for tests; only the fields pickReplacement/search read. */
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

/** Build a service with an injected in-memory catalog (skips file loading). */
function withCatalog(list: TransformedExercise[]): ExercisesService {
  const service = new ExercisesService();
  (service as unknown as { exercises: TransformedExercise[] }).exercises = list;
  return service;
}

describe('ExercisesService.pickReplacement', () => {
  it('replaces with the same primary muscle, never another muscle', () => {
    const service = withCatalog([
      ex({
        id: 'situps',
        name: 'Sit-ups',
        primaryMuscleGroup: 'Core',
        equipment: ['Bodyweight'],
        subMuscles: ['Upper Abs'],
      }),
      ex({
        id: 'flatbb',
        name: 'Flat Barbell Bench Press',
        primaryMuscleGroup: 'Chest',
      }),
      ex({
        id: 'crunch',
        name: 'Crunch',
        primaryMuscleGroup: 'Core',
        equipment: ['Bodyweight'],
        subMuscles: ['Upper Abs'],
      }),
      ex({
        id: 'legraise',
        name: 'Hanging Leg Raise',
        primaryMuscleGroup: 'Core',
        equipment: ['Pull-up Bar'],
        subMuscles: ['Lower Abs'],
      }),
    ]);

    // The original bug: replacing sit-ups (core) on an upper day handed back a chest press.
    const r = service.pickReplacement({
      targetName: 'Sit-ups',
      targetExerciseId: 'situps',
      dayExerciseIds: ['flatbb', 'situps'],
    });

    expect(r).not.toBeNull();
    expect(r!.primaryMuscleGroup).toBe('Core');
    expect(r!.id).not.toBe('situps');
    expect(r!.id).not.toBe('flatbb');
  });

  it('does not return an equipment variant of an exercise already in the day', () => {
    const service = withCatalog([
      ex({
        id: 'flatbb',
        name: 'Flat Barbell Bench Press',
        primaryMuscleGroup: 'Chest',
      }),
      ex({
        id: 'flatdb',
        name: 'Flat Dumbbell Bench Press',
        primaryMuscleGroup: 'Chest',
        equipment: ['Dumbbell'],
      }),
      ex({
        id: 'incdb',
        name: 'Incline Dumbbell Press',
        primaryMuscleGroup: 'Chest',
        equipment: ['Dumbbell'],
      }),
      ex({
        id: 'fly',
        name: 'Cable Fly',
        primaryMuscleGroup: 'Chest',
        equipment: ['Cable'],
      }),
    ]);

    // Day = flat-BB-bench + incline-DB-press; replace the incline press.
    // flat-DB-bench shares the "flat bench press" family with the flat-BB-bench → must be excluded.
    const r = service.pickReplacement({
      targetName: 'Incline Dumbbell Press',
      targetExerciseId: 'incdb',
      dayExerciseIds: ['flatbb', 'incdb'],
    });

    expect(r).not.toBeNull();
    expect(r!.id).not.toBe('flatdb');
    expect(r!.id).toBe('fly');
  });

  it('relaxes the family rule rather than returning nothing', () => {
    const service = withCatalog([
      ex({
        id: 'flatbb',
        name: 'Flat Barbell Bench Press',
        primaryMuscleGroup: 'Chest',
      }),
      ex({
        id: 'flatdb',
        name: 'Flat Dumbbell Bench Press',
        primaryMuscleGroup: 'Chest',
        equipment: ['Dumbbell'],
      }),
      ex({
        id: 'flatsmith',
        name: 'Flat Smith Bench Press',
        primaryMuscleGroup: 'Chest',
        equipment: ['Smith Machine'],
      }),
    ]);

    // Every alternative is the "flat bench press" family → strict pool empty → relax (still same muscle).
    const r = service.pickReplacement({
      targetName: 'Flat Barbell Bench Press',
      targetExerciseId: 'flatbb',
      dayExerciseIds: ['flatbb'],
    });

    expect(r).not.toBeNull();
    expect(['flatdb', 'flatsmith']).toContain(r!.id);
  });

  it('returns null when no other same-muscle exercise exists', () => {
    const service = withCatalog([
      ex({ id: 'situps', name: 'Sit-ups', primaryMuscleGroup: 'Core' }),
      ex({ id: 'bench', name: 'Bench Press', primaryMuscleGroup: 'Chest' }),
    ]);

    const r = service.pickReplacement({
      targetName: 'Sit-ups',
      targetExerciseId: 'situps',
      dayExerciseIds: ['situps'],
    });

    expect(r).toBeNull();
  });

  it('prefers the target sub-muscle (keeps a biceps move a biceps move)', () => {
    const service = withCatalog([
      ex({
        id: 'bbcurl',
        name: 'Barbell Curl',
        primaryMuscleGroup: 'Arms',
        subMuscles: ['Biceps'],
      }),
      ex({
        id: 'hammer',
        name: 'Hammer Curl',
        primaryMuscleGroup: 'Arms',
        subMuscles: ['Biceps'],
        equipment: ['Dumbbell'],
      }),
      ex({
        id: 'pushdown',
        name: 'Triceps Pushdown',
        primaryMuscleGroup: 'Arms',
        subMuscles: ['Triceps'],
        equipment: ['Cable'],
      }),
    ]);

    // Arms is a broad group; replacing a biceps curl should stay biceps, not become triceps.
    const r = service.pickReplacement({
      targetName: 'Barbell Curl',
      targetExerciseId: 'bbcurl',
      dayExerciseIds: ['bbcurl'],
    });

    expect(r).not.toBeNull();
    expect(r!.subMuscles).toContain('Biceps');
    expect(r!.id).toBe('hammer');
  });

  it('resolves the target by name when no id is given', () => {
    const service = withCatalog([
      ex({
        id: 'bbcurl',
        name: 'Barbell Curl',
        primaryMuscleGroup: 'Arms',
        subMuscles: ['Biceps'],
      }),
      ex({
        id: 'preacher',
        name: 'Preacher Curl',
        primaryMuscleGroup: 'Arms',
        subMuscles: ['Biceps'],
        equipment: ['Dumbbell'],
      }),
    ]);

    const r = service.pickReplacement({
      targetName: 'Barbell Curl',
      dayExerciseNames: ['Barbell Curl'],
    });

    expect(r).not.toBeNull();
    expect(r!.id).toBe('preacher');
  });

  it('restricts to home-doable equipment when location is home', () => {
    const service = withCatalog([
      ex({
        id: 'bbbench',
        name: 'Barbell Bench Press',
        primaryMuscleGroup: 'Chest',
        equipment: ['Barbell'],
      }),
      ex({
        id: 'pushup',
        name: 'Push-up',
        primaryMuscleGroup: 'Chest',
        equipment: ['Bodyweight'],
      }),
      ex({
        id: 'machinefly',
        name: 'Machine Fly',
        primaryMuscleGroup: 'Chest',
        equipment: ['Machine'],
      }),
    ]);

    // At home only the bodyweight push-up qualifies (barbell + machine aren't home gear).
    const r = service.pickReplacement({
      targetName: 'Barbell Bench Press',
      targetExerciseId: 'bbbench',
      dayExerciseIds: ['bbbench'],
      location: 'home',
    });

    expect(r).not.toBeNull();
    expect(r!.id).toBe('pushup');
  });

  it('returns null when the target is not in the catalog', () => {
    const service = withCatalog([
      ex({
        id: 'flatbb',
        name: 'Flat Barbell Bench Press',
        primaryMuscleGroup: 'Chest',
      }),
    ]);

    const r = service.pickReplacement({ targetName: 'Some Made-up Exercise' });

    expect(r).toBeNull();
  });
});

describe('ExercisesService search groupKey', () => {
  it('gives equipment variants one key but keeps angle variants distinct', () => {
    const service = withCatalog([
      ex({
        id: 'flat-bb',
        name: 'Flat Barbell Bench Press',
        primaryMuscleGroup: 'Chest',
      }),
      ex({
        id: 'flat-db',
        name: 'Flat Dumbbell Bench Press',
        primaryMuscleGroup: 'Chest',
        equipment: ['Dumbbell'],
      }),
      ex({
        id: 'incline-bb',
        name: 'Incline Barbell Bench Press',
        primaryMuscleGroup: 'Chest',
      }),
      ex({
        id: 'hammer-curl',
        name: 'Hammer Curl',
        primaryMuscleGroup: 'Arms',
        equipment: ['Dumbbell'],
      }),
      ex({
        id: 'bb-curl',
        name: 'Barbell Curl',
        primaryMuscleGroup: 'Arms',
      }),
    ]);

    const keyById = new Map(service.search({}).map((e) => [e.id, e.groupKey]));

    expect(keyById.get('flat-bb')).toBeTruthy();
    // Equipment variants of the same lift merge.
    expect(keyById.get('flat-bb')).toBe(keyById.get('flat-db'));
    // Angle stays a separate family.
    expect(keyById.get('incline-bb')).not.toBe(keyById.get('flat-bb'));
    // Movement-style words are kept: hammer curl is not a barbell curl variant.
    expect(keyById.get('hammer-curl')).not.toBe(keyById.get('bb-curl'));
  });

  it('falls back to the lowercased name when stripping empties the key', () => {
    const service = withCatalog([
      ex({ id: 'edge', name: 'Barbell', primaryMuscleGroup: 'Arms' }),
    ]);

    expect(service.search({})[0].groupKey).toBe('barbell');
  });
});
