import * as fs from 'fs';
import * as path from 'path';
import {
  PROGRESSION_LADDERS,
  getExerciseProgressions,
} from './exercise-progressions';
import { isRetiredExercise } from './retired-exercise-ids';
import { isExcludedFromExerciseCatalog } from './cardio-catalog-exclusions';

interface RawExerciseRow {
  id: string;
  difficulty: string;
}

const catalog = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', '..', 'data', 'exercises_5000plus.json'),
    'utf-8',
  ),
) as RawExerciseRow[];
const catalogById = new Map(catalog.map((r) => [r.id, r]));

const DIFFICULTY_RANK: Record<string, number> = {
  Beginner: 0,
  Intermediate: 1,
  Advanced: 2,
};

describe('PROGRESSION_LADDERS', () => {
  it('references only real, visible catalog ids', () => {
    const bad: string[] = [];
    for (const ladder of PROGRESSION_LADDERS) {
      for (const step of ladder.steps) {
        for (const id of step) {
          if (
            !catalogById.has(id) ||
            isRetiredExercise(id) ||
            isExcludedFromExerciseCatalog(id)
          ) {
            bad.push(`${ladder.name}: ${id}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('has at least two steps per ladder and no duplicate id within a ladder', () => {
    for (const ladder of PROGRESSION_LADDERS) {
      expect({ name: ladder.name, ok: ladder.steps.length >= 2 }).toEqual({
        name: ladder.name,
        ok: true,
      });
      const ids = ladder.steps.flat();
      expect({
        name: ladder.name,
        dupFree: new Set(ids).size === ids.length,
      }).toEqual({ name: ladder.name, dupFree: true });
    }
  });

  it('never gets easier as a ladder ascends (difficulty non-decreasing)', () => {
    const violations: string[] = [];
    for (const ladder of PROGRESSION_LADDERS) {
      let prev = -1;
      for (const step of ladder.steps) {
        const stepRank = Math.min(
          ...step.map(
            (id) => DIFFICULTY_RANK[catalogById.get(id)!.difficulty] ?? 0,
          ),
        );
        if (stepRank < prev)
          violations.push(`${ladder.name}: ${step.join(',')}`);
        prev = Math.max(prev, stepRank);
      }
    }
    expect(violations).toEqual([]);
  });

  it('indexes neighbors symmetrically (A harder-of-B ⇔ B easier-of-A)', () => {
    for (const ladder of PROGRESSION_LADDERS) {
      for (let i = 1; i < ladder.steps.length; i++) {
        for (const upper of ladder.steps[i]) {
          for (const lower of ladder.steps[i - 1]) {
            expect(getExerciseProgressions(upper)?.easier).toContain(lower);
            expect(getExerciseProgressions(lower)?.harder).toContain(upper);
          }
        }
      }
    }
  });

  it('returns undefined for exercises on no ladder', () => {
    expect(getExerciseProgressions('pec_deck_fly')).toBeUndefined();
  });
});
