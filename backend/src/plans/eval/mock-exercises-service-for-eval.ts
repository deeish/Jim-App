import type { ExercisesService } from '../../exercises/exercises.service';
import type { TransformedExercise } from '../../data/exercise-mappings';
import type { EvalCatalogExercise } from './eval-types';

function toTransformed(r: EvalCatalogExercise): TransformedExercise {
  const prescriptionType = r.prescriptionType ?? 'reps';
  return {
    id: r.id,
    name: r.name,
    primaryMuscleGroup: r.primaryMuscleGroup ?? 'Chest',
    subMuscles: r.subMuscles ?? [],
    secondaryMuscleGroups: r.secondaryMuscleGroups ?? [],
    equipment: r.equipment?.length ? r.equipment : ['Barbell'],
    movementPatterns: r.movementPatterns?.length ? [...r.movementPatterns] : [],
    prescriptionType,
    type: 'compound',
  };
}

/**
 * Minimal {@link ExercisesService} for `enrichGeneratedSession` in eval tests
 * (findOne + candidate pools). Not suitable for production.
 */
export function createEvalMockExercisesService(
  catalog: EvalCatalogExercise[],
): ExercisesService {
  const rows = catalog.map(toTransformed);
  const byId = new Map(rows.map((e) => [e.id, e]));

  const findOne = (id: string): TransformedExercise | undefined =>
    byId.get(String(id ?? '').trim());

  const getCandidatesForGenerator = (options: {
    focus: string;
    equipment?: string[];
    excludeIds?: string[];
    limit?: number;
  }): TransformedExercise[] => {
    const exclude = new Set(
      (options.excludeIds ?? []).map((x) => String(x).trim()),
    );
    let pool = rows.filter((e) => !exclude.has(e.id));
    const f = (options.focus ?? '').toLowerCase();
    const limit = options.limit ?? 70;

    if (/\bcardio\b/i.test(f)) {
      pool = pool.filter((e) => e.primaryMuscleGroup === 'Cardio');
    } else if (/\b(pull|back)\b/i.test(f)) {
      pool = pool.filter(
        (e) =>
          e.movementPatterns.includes('Pull') ||
          /\b(row|pull|lat|curl)\b/i.test(e.name),
      );
    } else if (/\b(lower|legs|leg)\b/i.test(f)) {
      pool = pool.filter((e) =>
        ['Squat', 'Hinge', 'Lunge'].some((p) => e.movementPatterns.includes(p)),
      );
    }

    return pool.slice(0, limit);
  };

  const candidatesForChunkRepairScavenge = (
    excludeIds: string[],
    limit = 220,
  ): TransformedExercise[] => {
    const ex = new Set(
      excludeIds.map((i) => String(i ?? '').trim()).filter(Boolean),
    );
    return rows.filter((e) => !ex.has(e.id)).slice(0, limit);
  };

  return {
    findOne,
    getCandidatesForGenerator,
    candidatesForChunkRepairScavenge,
  } as unknown as ExercisesService;
}
