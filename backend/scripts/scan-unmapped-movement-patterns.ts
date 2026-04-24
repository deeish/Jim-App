import * as fs from 'fs';
import * as path from 'path';
import {
  MOVEMENT_PATTERN_MAP,
  transformExercise,
  type RawExercise,
} from '../src/data/exercise-mappings';

const raw = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/exercises_5000plus.json'), 'utf-8'),
) as RawExercise[];

const unmapped = new Map<string, number>();
for (const r of raw) {
  for (const pid of r.movementPatternIds ?? []) {
    if (!MOVEMENT_PATTERN_MAP[pid]) {
      unmapped.set(pid, (unmapped.get(pid) ?? 0) + 1);
    }
  }
}

const sorted = [...unmapped.entries()].sort((a, b) => b[1] - a[1]);
console.log('Unmapped movementPatternIds:', sorted.length);
for (const [k, v] of sorted.slice(0, 50)) console.log(v, k);

let dropped = 0;
for (const r of raw) {
  const rawIds = r.movementPatternIds ?? [];
  if (!rawIds.length) continue;
  const t = transformExercise(r);
  if (t.movementPatterns.length === 0) dropped++;
}
console.log('Exercises with raw patterns but empty after map:', dropped);

const out = path.join(__dirname, 'unmapped-movement-pattern-ids.tsv');
fs.writeFileSync(
  out,
  sorted.map(([k, v]) => `${v}\t${k}`).join('\n'),
  'utf-8',
);
console.log('Wrote', out);

