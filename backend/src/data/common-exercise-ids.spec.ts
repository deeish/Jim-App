import * as fs from 'fs';
import * as path from 'path';
import {
  COMMON_EXERCISE_IDS,
  getCommonExerciseRank,
  isNicheExercise,
} from './common-exercise-ids';

describe('COMMON_EXERCISE_IDS', () => {
  it('contains no duplicates', () => {
    expect(new Set(COMMON_EXERCISE_IDS).size).toBe(COMMON_EXERCISE_IDS.length);
  });

  it('every id resolves in the shipped catalog (typos and renames break the staple ordering silently)', () => {
    const raw = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, '..', '..', 'data', 'exercises_5000plus.json'),
        'utf8',
      ),
    ) as Array<{ id: string }>;
    const ids = new Set(raw.map((e) => e.id));
    const missing = COMMON_EXERCISE_IDS.filter((id) => !ids.has(id));
    expect(missing).toEqual([]);
  });

  it('ranks listed staples ahead of unlisted exercises', () => {
    expect(getCommonExerciseRank('back_squat')).toBeLessThan(
      getCommonExerciseRank('some_unlisted_exercise'),
    );
  });
});

describe('isNicheExercise', () => {
  it('flags the circus/specialty picks observed in live plans', () => {
    for (const name of [
      'Bear Row',
      'Bird-Dog Row',
      'B-Stance Hip Thrust',
      'Barbell Dead-Row',
      'Axle Bar Deadlift Hold',
      'Pinch Block Carry',
      'Waiter Carry',
      'Floor Pike Lat Pullover',
      'Bottoms-Up Kettlebell Press',
    ]) {
      expect(isNicheExercise(name)).toBe(true);
    }
  });

  it('leaves mainstream movements alone', () => {
    for (const name of [
      'Back Squat',
      'Bird Dog',
      "Farmer's Carry",
      'Barbell Bent-Over Row',
      'Dead Bug',
      'Romanian Deadlift',
      'Overhead Carry',
    ]) {
      expect(isNicheExercise(name)).toBe(false);
    }
  });
});
