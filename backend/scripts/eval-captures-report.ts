/**
 * Batch-score every GENERATION_CAPTURE JSON in a directory and print an
 * aggregate quality report (score distribution, weakest dimensions,
 * recurring findings, fallback/truncation rates, worst captures).
 *
 * Usage (from backend/):
 *   npm run eval:captures:report                       # logs/generation-captures, library catalog
 *   npm run eval:captures:report -- path/to/dir        # custom directory
 *   npm run eval:captures:report -- --infer            # name-based pattern inference instead of library
 *   npm run eval:captures:report -- --json             # machine-readable output
 *   npm run eval:captures:report -- --limit 20         # only the 20 most recent captures
 */
import * as path from 'path';
import {
  buildCaptureBatchReport,
  formatCaptureBatchReport,
} from '../src/plans/eval/capture-batch-report';

function main(): void {
  const args = process.argv.slice(2);
  const useInfer = args.includes('--infer');
  const asJson = args.includes('--json');
  const limitIdx = args.indexOf('--limit');
  const limit =
    limitIdx >= 0 ? parseInt(args[limitIdx + 1] ?? '', 10) : undefined;

  const positional = args.filter(
    (a, i) => !a.startsWith('-') && (limitIdx < 0 || i !== limitIdx + 1),
  );
  const dir = positional[0]
    ? path.resolve(positional[0])
    : path.join(process.cwd(), 'logs', 'generation-captures');

  const report = buildCaptureBatchReport(dir, {
    catalogMode: useInfer ? 'infer' : 'library',
    limit: Number.isFinite(limit) ? limit : undefined,
  });

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(formatCaptureBatchReport(report));
}

main();
