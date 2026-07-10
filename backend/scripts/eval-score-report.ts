/**
 * Print per-scenario eval scores: structural, balance, volume, diversity, conditioning,
 * coaching surface, metadata, order, coaching pro depth (cp), prescription hygiene (ph),
 * fatigue stacking (fs), equipment conformance (eq), copy sanity (cs), total (max 140).
 *
 * Usage (from backend/):
 *   npm run eval:score:report
 *   npm run eval:score:report:json
 *   (Or: npx ts-node --transpile-only scripts/eval-score-report.ts --json)
 */
import { loadAllEvalScenarios } from '../src/plans/eval/all-eval-scenarios';
import { scoreEvalScenario } from '../src/plans/eval/eval-score-runner';

function wantJsonOutput(): boolean {
  if (process.argv.includes('--json')) return true;
  if (process.env.EVAL_SCORE_JSON === '1' || process.env.EVAL_SCORE_JSON === 'true')
    return true;
  return false;
}

function pad(s: string, w: number): string {
  const t = s.length > w ? `${s.slice(0, w - 1)}…` : s;
  return t.padEnd(w);
}

function num(n: number, w: number): string {
  return String(n).padStart(w);
}

async function main(): Promise<void> {
  const json = wantJsonOutput();
  const scenarios = loadAllEvalScenarios();
  const rows = [];
  for (const s of scenarios) {
    rows.push(await scoreEvalScenario(s));
  }

  if (json) {
    console.log(
      JSON.stringify(
        rows.map((r) => ({
          id: r.id,
          description: r.description,
          pipeline: r.pipeline,
          validationOk: r.validationOk,
          issues: r.issues,
          breakdown: r.score.breakdown,
          findings: r.score.findings,
        })),
        null,
        2,
      ),
    );
    return;
  }

  const wId = Math.min(
    48,
    Math.max(28, ...rows.map((r) => r.id.length)),
  );
  const hdr = `${pad('id', wId)}  tot str bal vol div cnd cch met ord cp ph fs eq cs val  findings`;
  console.log(hdr);
  console.log('-'.repeat(hdr.length + 28));

  for (const r of rows) {
    const b = r.score.breakdown;
    const findings =
      r.score.findings.length > 0 ? r.score.findings.join(' | ') : '(none)';
    const line = `${pad(r.id, wId)}  ${num(b.total, 3)} ${num(b.structural, 3)} ${num(b.balance, 3)} ${num(b.volumeFit, 3)} ${num(b.movementDiversity, 3)} ${num(b.conditioning, 3)} ${num(b.coachingSurface, 3)} ${num(b.libraryMetadata, 3)} ${num(b.workoutOrder, 3)} ${num(b.coachingProDepth, 2)} ${num(b.prescriptionHygiene, 2)} ${num(b.fatigueStacking, 2)} ${num(b.equipmentConformance, 2)} ${num(b.copySanity, 2)} ${r.validationOk ? ' ok' : ' BAD'}  ${findings}`;
    console.log(line);
  }

  const totals = rows.map((r) => r.score.breakdown.total);
  const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
  console.log('');
  console.log(`Scenarios: ${rows.length}  Mean total: ${avg.toFixed(1)}`);
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
