import * as fs from 'fs';
import * as path from 'path';
import { CUE_COMPLETED_GROUPS, FORM_CUES } from './exercise-form-cues';
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

/** Cue scope: quality tiers S/A/B — the rows users actually encounter. */
const CUE_TIERS = new Set(['S', 'A', 'B']);

describe('FORM_CUES', () => {
  it('covers only real, visible catalog ids', () => {
    const bad = Object.keys(FORM_CUES).filter(
      (id) =>
        !catalogById.has(id) ||
        isRetiredExercise(id) ||
        isExcludedFromExerciseCatalog(id),
    );
    expect(bad).toEqual([]);
  });

  it('covers every S/A/B row of every completed group', () => {
    for (const group of CUE_COMPLETED_GROUPS) {
      const missing = catalog
        .filter(
          (r) =>
            r.primaryMuscleGroupId === group &&
            CUE_TIERS.has(EXERCISE_TIERS[r.id]) &&
            !isRetiredExercise(r.id) &&
            !isExcludedFromExerciseCatalog(r.id),
        )
        .filter((r) => !(r.id in FORM_CUES))
        .map((r) => r.id);
      expect({ group, missing }).toEqual({ group, missing: [] });
    }
  });

  it('has no stray cues outside completed groups or the S/A/B scope', () => {
    const completed = new Set(CUE_COMPLETED_GROUPS);
    const strays = Object.keys(FORM_CUES).filter((id) => {
      const row = catalogById.get(id);
      return (
        !row ||
        !completed.has(row.primaryMuscleGroupId) ||
        !CUE_TIERS.has(EXERCISE_TIERS[id])
      );
    });
    expect(strays).toEqual([]);
  });

  it('keeps every cue in house style (1-4 per row, sentence-shaped, no em-dashes)', () => {
    const offenders: string[] = [];
    for (const [id, cues] of Object.entries(FORM_CUES)) {
      if (cues.length < 1 || cues.length > 4) offenders.push(`${id}: count`);
      for (const cue of cues) {
        if (!cue.trim() || cue !== cue.trim())
          offenders.push(`${id}: whitespace`);
        if (!/[.!]$/.test(cue)) offenders.push(`${id}: no period`);
        if (/—|–/.test(cue)) offenders.push(`${id}: em-dash`);
        if (cue.length > 160) offenders.push(`${id}: too long`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
