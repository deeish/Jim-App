import { ExercisesService } from './exercises.service';
import type { TransformedExercise } from '../data/exercise-mappings';
import { getExerciseProgressions } from '../data/exercise-progressions';

/** Minimal catalog row for tests; only the fields the suggestions path reads. */
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

describe('ExercisesService.pickReplacementSuggestions', () => {
  const chestCatalog = () => [
    ex({
      id: 'flatbb',
      name: 'Flat Barbell Bench Press',
      primaryMuscleGroup: 'Chest',
      subMuscles: ['Mid Chest'],
    }),
    ex({
      id: 'flatdb',
      name: 'Flat Dumbbell Bench Press',
      primaryMuscleGroup: 'Chest',
      subMuscles: ['Mid Chest'],
      equipment: ['Dumbbell'],
    }),
    ex({
      id: 'fly',
      name: 'Cable Fly',
      primaryMuscleGroup: 'Chest',
      subMuscles: ['Mid Chest'],
      equipment: ['Cable'],
    }),
    ex({
      id: 'declinebb',
      name: 'Decline Barbell Bench Press',
      primaryMuscleGroup: 'Chest',
      subMuscles: ['Lower Chest'],
    }),
    ex({
      id: 'row',
      name: 'Barbell Bent Over Row',
      primaryMuscleGroup: 'Back',
      movementPatterns: ['Pull'],
    }),
  ];

  it('suggests only the same primary muscle and never the target itself', () => {
    const service = withCatalog(chestCatalog());
    const out = service.pickReplacementSuggestions({
      targetName: 'Flat Barbell Bench Press',
      targetExerciseId: 'flatbb',
      dayExerciseIds: ['flatbb', 'row'],
      count: 10,
    });
    expect(out.length).toBeGreaterThan(0);
    for (const s of out) {
      expect(s.exercise.primaryMuscleGroup).toBe('Chest');
      expect(s.exercise.id).not.toBe('flatbb');
    }
  });

  it("ranks the target's own equipment variant on top with the same-lift reason", () => {
    const service = withCatalog(chestCatalog());
    const out = service.pickReplacementSuggestions({
      targetName: 'Flat Barbell Bench Press',
      targetExerciseId: 'flatbb',
      dayExerciseIds: ['flatbb', 'row'],
    });
    expect(out[0].exercise.id).toBe('flatdb');
    expect(out[0].reasons).toContain('Same lift, different equipment');
  });

  it('never suggests anything already in the day, nor variants of OTHER day exercises', () => {
    const service = withCatalog([
      ...chestCatalog(),
      ex({
        id: 'inclinedb',
        name: 'Incline Dumbbell Bench Press',
        primaryMuscleGroup: 'Chest',
        subMuscles: ['Upper Chest'],
        equipment: ['Dumbbell'],
      }),
      ex({
        id: 'inclinebb',
        name: 'Incline Barbell Bench Press',
        primaryMuscleGroup: 'Chest',
        subMuscles: ['Upper Chest'],
      }),
    ]);
    // Day = target + incline DB bench. The incline BARBELL bench is a variant
    // of a day exercise that is NOT the target — excluded; the target's own
    // flat-DB variant stays eligible.
    const out = service.pickReplacementSuggestions({
      targetName: 'Flat Barbell Bench Press',
      targetExerciseId: 'flatbb',
      dayExerciseIds: ['flatbb', 'inclinedb'],
      count: 10,
    });
    const ids = out.map((s) => s.exercise.id);
    expect(ids).not.toContain('inclinedb'); // already in the day
    expect(ids).not.toContain('inclinebb'); // family of another day exercise
    expect(ids).toContain('flatdb'); // target's own family stays eligible
  });

  it('boosts progression-ladder neighbors with Easier/Harder reasons (real ladder ids)', () => {
    const progressions = getExerciseProgressions('knee_push_up');
    expect(progressions?.easier).toContain('wall_push_up'); // data premise
    const service = withCatalog([
      ex({
        id: 'knee_push_up',
        name: 'Knee Push-Up',
        primaryMuscleGroup: 'Chest',
        equipment: ['Bodyweight'],
      }),
      ex({
        id: 'wall_push_up',
        name: 'Wall Push-Up',
        primaryMuscleGroup: 'Chest',
        equipment: ['Bodyweight'],
      }),
      ex({
        id: 'fly2',
        name: 'Cable Fly',
        primaryMuscleGroup: 'Chest',
        equipment: ['Cable'],
      }),
    ]);
    const out = service.pickReplacementSuggestions({
      targetName: 'Knee Push-Up',
      targetExerciseId: 'knee_push_up',
      dayExerciseIds: ['knee_push_up'],
    });
    expect(out[0].exercise.id).toBe('wall_push_up');
    expect(out[0].reasons).toContain('Easier version');
  });

  it('prefers shared sub-muscle candidates and names the focus in the reason', () => {
    const service = withCatalog([
      ex({
        id: 'declinebb2',
        name: 'Decline Barbell Bench Press',
        primaryMuscleGroup: 'Chest',
        subMuscles: ['Lower Chest'],
      }),
      ex({
        id: 'dip',
        name: 'Chest Dip',
        primaryMuscleGroup: 'Chest',
        subMuscles: ['Lower Chest'],
        equipment: ['Bodyweight'],
      }),
      ex({
        id: 'inclinefly',
        name: 'Incline Cable Fly',
        primaryMuscleGroup: 'Chest',
        subMuscles: ['Upper Chest'],
        equipment: ['Cable'],
      }),
    ]);
    const out = service.pickReplacementSuggestions({
      targetName: 'Decline Barbell Bench Press',
      targetExerciseId: 'declinebb2',
      dayExerciseIds: ['declinebb2'],
      count: 10,
    });
    expect(out[0].exercise.id).toBe('dip');
    expect(out[0].reasons.join(' ')).toContain('Lower Chest focus');
  });

  it('respects the real equipment list and explains the fit when nothing stronger applies', () => {
    const service = withCatalog(chestCatalog());
    const out = service.pickReplacementSuggestions({
      targetName: 'Flat Barbell Bench Press',
      targetExerciseId: 'flatbb',
      dayExerciseIds: ['flatbb'],
      equipment: ['Cable'],
      count: 10,
    });
    expect(out.length).toBeGreaterThan(0);
    for (const s of out) {
      expect(s.exercise.equipment).toContain('Cable');
    }
  });

  it('honors avoid phrases (free-text over name/equipment)', () => {
    const service = withCatalog(chestCatalog());
    const out = service.pickReplacementSuggestions({
      targetName: 'Flat Barbell Bench Press',
      targetExerciseId: 'flatbb',
      dayExerciseIds: ['flatbb'],
      avoid: ['dumbbell'],
      count: 10,
    });
    expect(out.map((s) => s.exercise.id)).not.toContain('flatdb');
  });

  it('is deterministic and caps at count with at most two reasons per row', () => {
    const service = withCatalog(chestCatalog());
    const dto = {
      targetName: 'Flat Barbell Bench Press',
      targetExerciseId: 'flatbb',
      dayExerciseIds: ['flatbb'],
      count: 2,
    };
    const a = service.pickReplacementSuggestions(dto);
    const b = service.pickReplacementSuggestions(dto);
    expect(a.map((s) => s.exercise.id)).toEqual(b.map((s) => s.exercise.id));
    expect(a.length).toBeLessThanOrEqual(2);
    for (const s of a) {
      expect(s.reasons.length).toBeGreaterThanOrEqual(1);
      expect(s.reasons.length).toBeLessThanOrEqual(2);
    }
  });

  it('returns empty for an unknown target instead of guessing', () => {
    const service = withCatalog(chestCatalog());
    const out = service.pickReplacementSuggestions({
      targetName: 'Not A Real Exercise',
    });
    expect(out).toEqual([]);
  });
});
