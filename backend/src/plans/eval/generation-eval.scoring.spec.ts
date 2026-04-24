import { loadAllEvalScenarios } from './all-eval-scenarios';
import { scoreEvalScenario } from './eval-score-runner';

describe('generation eval scoring', () => {
  const scenarios = loadAllEvalScenarios();
  const minByScenarioId: Record<string, number> = {
    // Intentionally dirty input; scoring skips balance/coaching noise from synthetic fillers.
    chunk_duplicate_across_four_strength_days: 120,
  };

  it('meets quality thresholds on regression suite', async () => {
    const rows: Array<{ id: string; total: number }> = [];
    for (const s of scenarios) {
      const row = await scoreEvalScenario(s);
      rows.push({ id: row.id, total: row.score.breakdown.total });
      const min = minByScenarioId[s.id] ?? 118;
      if (row.score.breakdown.total < min) {
        throw new Error(
          `Score too low for ${s.id}: ${row.score.breakdown.total} < ${min}. Findings: ${row.score.findings.join(' | ')}`,
        );
      }
    }

    const avg = rows.reduce((sum, r) => sum + r.total, 0) / rows.length;
    expect(avg).toBeGreaterThanOrEqual(120);
  });
});
