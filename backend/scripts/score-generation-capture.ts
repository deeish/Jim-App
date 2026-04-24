/**
 * Score a local GENERATION_CAPTURE JSON (same shape as logs/generation-captures/*.json).
 *
 * Usage (from backend/):
 *   npm run eval:capture
 *   npm run eval:capture -- path/to/capture.json
 *   npm run eval:capture -- --library path/to/capture.json
 *   npx ts-node --transpile-only scripts/score-generation-capture.ts ./logs/generation-captures/foo.json
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  scoreGenerationCaptureFull,
  EVAL_SCORE_MAX_TOTAL,
} from '../src/plans/eval/generation-capture-eval';

function main(): void {
  const useLibrary = process.argv.includes('--library');
  const positional = process.argv
    .slice(2)
    .filter((a) => a !== '--library' && a !== '--' && !a.startsWith('-'));
  const defaultPath = path.join(
    process.cwd(),
    'logs',
    'generation-captures',
    'generation-1776722579925-cc734d2b.json',
  );
  const file = positional[0] ? path.resolve(positional[0]) : defaultPath;
  if (!fs.existsSync(file)) {
    console.error(`Capture file not found: ${file}`);
    console.error('Pass a path, or place a capture at the default logs path.');
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
  const full = scoreGenerationCaptureFull(raw, {
    catalogMode: useLibrary ? 'library' : 'infer',
  });
  console.log(
    JSON.stringify(
      {
        file,
        catalogMode: full.catalog.mode,
        catalogResolved: `${full.catalog.resolvedIds}/${full.catalog.totalIds}`,
        libraryPath: full.catalog.libraryPath,
        pipeline: full.pipeline,
        preEnrichment: full.preEnrichment
          ? {
              total: full.preEnrichment.score.breakdown.total,
              validationOk: full.preEnrichment.validation.ok,
              issues: full.preEnrichment.validation.issues,
            }
          : undefined,
        strengthFloor: full.strengthFloor,
        final: {
          total: full.final.score.breakdown.total,
          max: EVAL_SCORE_MAX_TOTAL,
          validationOk: full.final.validation.ok,
          issues: full.final.validation.issues,
          breakdown: full.final.score.breakdown,
          findings: full.final.score.findings,
        },
        deltaTotal: full.deltaTotal,
      },
      null,
      2,
    ),
  );
}

main();
