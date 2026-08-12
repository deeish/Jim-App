import * as fs from 'fs';
import * as path from 'path';
import {
  JOINT_DEMANDS,
  JOINT_DEMAND_COMPLETED_GROUPS,
  JOINT_LABELS,
  jointsFromAvoidPhrases,
} from './exercise-joint-demands';
import { EXERCISE_TIERS } from './exercise-tiers';
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

const SCOPE_TIERS = new Set(['S', 'A', 'B']);
const VALID_JOINTS = new Set(Object.keys(JOINT_LABELS));

describe('JOINT_DEMANDS', () => {
  it('tags only real, visible catalog ids with valid joints and no duplicates', () => {
    const bad: string[] = [];
    for (const [id, joints] of Object.entries(JOINT_DEMANDS)) {
      if (
        !catalogById.has(id) ||
        isRetiredExercise(id) ||
        isExcludedFromExerciseCatalog(id)
      ) {
        bad.push(`${id}: unknown/hidden id`);
      }
      if (joints.some((j) => !VALID_JOINTS.has(j)))
        bad.push(`${id}: bad joint`);
      if (new Set(joints).size !== joints.length) bad.push(`${id}: duplicate`);
    }
    expect(bad).toEqual([]);
  });

  it('audits every S/A/B row of every completed group (empty array = audited)', () => {
    for (const group of JOINT_DEMAND_COMPLETED_GROUPS) {
      const missing = catalog
        .filter(
          (r) =>
            r.primaryMuscleGroupId === group &&
            SCOPE_TIERS.has(EXERCISE_TIERS[r.id]) &&
            !isRetiredExercise(r.id) &&
            !isExcludedFromExerciseCatalog(r.id),
        )
        .filter((r) => !(r.id in JOINT_DEMANDS))
        .map((r) => r.id);
      expect({ group, missing }).toEqual({ group, missing: [] });
    }
  });

  it('has no stray entries outside completed groups or the S/A/B scope', () => {
    const completed = new Set(JOINT_DEMAND_COMPLETED_GROUPS);
    const strays = Object.keys(JOINT_DEMANDS).filter((id) => {
      const row = catalogById.get(id);
      return (
        !row ||
        !completed.has(row.primaryMuscleGroupId) ||
        !SCOPE_TIERS.has(EXERCISE_TIERS[id])
      );
    });
    expect(strays).toEqual([]);
  });

  it('maps avoid phrases to joints without confusing the back muscle group', () => {
    expect(jointsFromAvoidPhrases(['bad shoulder'])).toEqual(['shoulder']);
    expect(jointsFromAvoidPhrases(['knee pain', 'Lower Back'])).toEqual(
      expect.arrayContaining(['knee', 'lower_back']),
    );
    // "back" alone names a muscle group, not the lumbar spine.
    expect(jointsFromAvoidPhrases(['back'])).toEqual([]);
    expect(jointsFromAvoidPhrases(['rows', 'deadlifts'])).toEqual([]);
  });
});
