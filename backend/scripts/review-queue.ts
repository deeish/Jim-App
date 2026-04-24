/**
 * Lists generation captures sorted by eval total score (lowest first) for human review.
 *
 * Usage (from backend/):
 *   npm run review:queue
 *   npm run review:queue -- --limit 20
 *
 * The trailing `--` in package.json forwards args past ts-node; do not remove it.
 */
import * as fs from 'fs';
import * as path from 'path';
import { scoreGenerationCaptureFull } from '../src/plans/eval/generation-capture-eval';

type Row = { score: number; file: string; ok: boolean };

function collectCaptures(dirs: string[]): string[] {
  const out: string[] = [];
  for (const dir of dirs) {
    const abs = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs)) {
      if (!name.endsWith('.json')) continue;
      out.push(path.join(abs, name));
    }
  }
  return out;
}

function main(): void {
  let limit = 15;
  const argv = process.argv;
  const li = argv.indexOf('--limit');
  if (li >= 0) {
    const n = parseInt(argv[li + 1] ?? '15', 10);
    if (Number.isFinite(n) && n > 0) limit = n;
  } else {
    const last = argv[argv.length - 1];
    if (/^\d+$/.test(last ?? '')) {
      const n = parseInt(last!, 10);
      if (Number.isFinite(n) && n > 0) limit = n;
    }
  }

  const dirs = [
    path.join('logs', 'generation-captures'),
    path.join('src', 'plans', 'eval', 'captures'),
  ];
  const rows: Row[] = [];
  for (const file of collectCaptures(dirs)) {
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    } catch {
      continue;
    }
    const rec = raw as Record<string, unknown>;
    if (rec.kind !== 'generate_sessions') continue;
    try {
      const full = scoreGenerationCaptureFull(raw, { catalogMode: 'library' });
      rows.push({
        score: full.final.score.breakdown.total,
        file,
        ok: full.final.validation.ok,
      });
    } catch {
      /* skip malformed */
    }
  }
  rows.sort((a, b) => a.score - b.score);
  const slice = rows.slice(0, limit);
  const topSorted = [...rows].sort((a, b) => b.score - a.score);
  const p75Index = Math.max(0, Math.floor(rows.length * 0.25) - 1);
  const topQuartileFloor = topSorted[p75Index]?.score ?? 0;
  const topPool = topSorted.filter((r) => r.score >= topQuartileFloor);
  const randomTopSamples = topPool
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(3, topPool.length));
  console.log(
    JSON.stringify(
      {
        scanned: rows.length,
        showing: slice.length,
        lowestScoresFirst: slice.map((r) => ({
          score: r.score,
          validationOk: r.ok,
          file: path.relative(process.cwd(), r.file),
        })),
        randomTopSamples: randomTopSamples.map((r) => ({
          score: r.score,
          validationOk: r.ok,
          file: path.relative(process.cwd(), r.file),
        })),
        hint: 'See backend/docs/review-workflow.md for how to turn findings into code or prompt changes.',
      },
      null,
      2,
    ),
  );
}

main();
