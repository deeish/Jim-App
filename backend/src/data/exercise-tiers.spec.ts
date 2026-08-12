import * as fs from 'fs';
import * as path from 'path';
import {
  EXERCISE_TIERS,
  TIER_COMPLETED_GROUPS,
  TIER_ORDER,
  type ExerciseTier,
} from './exercise-tiers';
import { COMMON_EXERCISE_IDS } from './common-exercise-ids';
import { isRetiredExercise } from './retired-exercise-ids';
import { isExcludedFromExerciseCatalog } from './cardio-catalog-exclusions';

interface RawExerciseRow {
  id: string;
  primaryMuscleGroupId: string;
}

const catalog = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', '..', 'data', 'exercises_5000plus.json'),
    'utf-8',
  ),
) as RawExerciseRow[];

const catalogById = new Map(catalog.map((r) => [r.id, r]));
const CANONICAL_GROUPS = [
  'chest',
  'back',
  'legs',
  'shoulders',
  'arms',
  'core',
  'cardio',
];

/** Rows that must be graded once their group is listed as completed. */
function isGradable(row: RawExerciseRow): boolean {
  return !isRetiredExercise(row.id) && !isExcludedFromExerciseCatalog(row.id);
}

describe('EXERCISE_TIERS', () => {
  it('grades only real catalog ids', () => {
    const unknown = Object.keys(EXERCISE_TIERS).filter(
      (id) => !catalogById.has(id),
    );
    expect(unknown).toEqual([]);
  });

  it('never grades retired or session-template rows', () => {
    const hidden = Object.keys(EXERCISE_TIERS).filter(
      (id) => isRetiredExercise(id) || isExcludedFromExerciseCatalog(id),
    );
    expect(hidden).toEqual([]);
  });

  it('uses only valid tier values', () => {
    const valid = new Set(Object.keys(TIER_ORDER));
    const bad = Object.entries(EXERCISE_TIERS).filter(
      ([, tier]) => !valid.has(tier),
    );
    expect(bad).toEqual([]);
  });

  it('lists only canonical muscle groups as completed, without duplicates', () => {
    const bad = TIER_COMPLETED_GROUPS.filter(
      (g) => !CANONICAL_GROUPS.includes(g),
    );
    expect(bad).toEqual([]);
    expect(new Set(TIER_COMPLETED_GROUPS).size).toBe(
      TIER_COMPLETED_GROUPS.length,
    );
  });

  it('covers every visible row of every completed group', () => {
    for (const group of TIER_COMPLETED_GROUPS) {
      const missing = catalog
        .filter((r) => r.primaryMuscleGroupId === group && isGradable(r))
        .filter((r) => !(r.id in EXERCISE_TIERS))
        .map((r) => r.id);
      expect({ group, missing }).toEqual({ group, missing: [] });
    }
  });

  it('has no stray grades in groups not yet completed', () => {
    const completed = new Set(TIER_COMPLETED_GROUPS);
    const strays = Object.keys(EXERCISE_TIERS).filter(
      (id) => !completed.has(catalogById.get(id)!.primaryMuscleGroupId),
    );
    expect(strays).toEqual([]);
  });

  it('grades common staples S or A (they are staples by definition)', () => {
    const completed = new Set(TIER_COMPLETED_GROUPS);
    const offenders = COMMON_EXERCISE_IDS.filter((id) => {
      const row = catalogById.get(id);
      if (!row || !completed.has(row.primaryMuscleGroupId)) return false;
      const tier: ExerciseTier | undefined = EXERCISE_TIERS[id];
      return tier !== 'S' && tier !== 'A';
    });
    expect(offenders).toEqual([]);
  });

  it('keeps S deliberately rare per completed group (at most 10%)', () => {
    for (const group of TIER_COMPLETED_GROUPS) {
      const graded = catalog.filter(
        (r) =>
          r.primaryMuscleGroupId === group &&
          isGradable(r) &&
          r.id in EXERCISE_TIERS,
      );
      const sCount = graded.filter((r) => EXERCISE_TIERS[r.id] === 'S').length;
      expect({ group, ok: sCount <= Math.ceil(graded.length * 0.1) }).toEqual({
        group,
        ok: true,
      });
    }
  });
});
