/**
 * Reports catalog metadata health after transforms (Phase D).
 * Run: npx ts-node --transpile-only scripts/audit-exercise-catalog.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  MOVEMENT_PATTERN_MAP,
  transformExercise,
  type RawExercise,
} from '../src/data/exercise-mappings';
import { MOVEMENT_PATTERN_FILLINS } from '../src/data/movement-pattern-fillins';

const exercisesFile = path.join(__dirname, '../data/exercises_5000plus.json');
const rawData = JSON.parse(
  fs.readFileSync(exercisesFile, 'utf-8'),
) as RawExercise[];

let rawPatternIds = 0;
let wouldDropWithoutFillins = 0;
let stillEmpty = 0;
const unmappedIds = new Map<string, number>();

for (const raw of rawData) {
  const ids = raw.movementPatternIds ?? [];
  if (!ids.length) continue;
  rawPatternIds++;
  const mappedOnlyMain = ids
    .map((id) => MOVEMENT_PATTERN_MAP[id])
    .filter((x): x is string => !!x);
  if (mappedOnlyMain.length === 0) wouldDropWithoutFillins++;

  const t = transformExercise(raw);
  if (t.movementPatterns.length === 0) stillEmpty++;

  for (const id of ids) {
    if (!MOVEMENT_PATTERN_MAP[id] && !MOVEMENT_PATTERN_FILLINS[id]) {
      unmappedIds.set(id, (unmappedIds.get(id) ?? 0) + 1);
    }
  }
}

console.log('Exercises with ≥1 raw movementPatternId:', rawPatternIds);
console.log('Would have empty patterns (main map only):', wouldDropWithoutFillins);
console.log('Empty patterns after main map + fillins:', stillEmpty);
if (unmappedIds.size > 0) {
  console.log('Raw ids still missing from both maps:', unmappedIds.size);
  const top = [...unmappedIds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  for (const [k, v] of top) console.log(' ', v, k);
}
