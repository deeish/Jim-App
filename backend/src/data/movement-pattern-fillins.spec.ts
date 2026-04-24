import * as fs from 'fs';
import * as path from 'path';
import {
  MOVEMENT_PATTERN_MAP,
  transformExercise,
  VALID_MOVEMENT_PATTERNS,
} from './exercise-mappings';
import { MOVEMENT_PATTERN_FILLINS } from './movement-pattern-fillins';
import type { RawExercise } from './exercise-mappings';

describe('MOVEMENT_PATTERN_FILLINS (Phase D)', () => {
  it('maps every fill-in to a valid movement pattern', () => {
    for (const [k, v] of Object.entries(MOVEMENT_PATTERN_FILLINS)) {
      expect(VALID_MOVEMENT_PATTERNS).toContain(v);
      expect(k.length).toBeGreaterThan(0);
    }
  });

  it('clears previously all-dropped pattern rows in the catalog JSON', () => {
    const exercisesFile = path.join(
      __dirname,
      '..',
      '..',
      'data',
      'exercises_5000plus.json',
    );
    const rawData = JSON.parse(
      fs.readFileSync(exercisesFile, 'utf-8'),
    ) as RawExercise[];

    let droppedBefore = 0;
    let droppedAfter = 0;
    for (const raw of rawData) {
      const rawIds = raw.movementPatternIds ?? [];
      if (!rawIds.length) continue;
      const legacy = rawIds.map((id) => MOVEMENT_PATTERN_MAP[id]).filter(Boolean);
      if (legacy.length === 0) droppedBefore++;

      const t = transformExercise(raw);
      if (t.movementPatterns.length === 0) droppedAfter++;
    }

    expect(droppedBefore).toBeGreaterThan(100);
    expect(droppedAfter).toBe(0);
  });
});
