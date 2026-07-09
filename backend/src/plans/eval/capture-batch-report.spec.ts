import * as path from 'path';
import {
  buildCaptureBatchReport,
  collectCaptureFiles,
  formatCaptureBatchReport,
  normalizeFinding,
} from './capture-batch-report';
import { EVAL_SCORE_DIMENSION_MAX, EVAL_SCORE_MAX_TOTAL } from './eval-scoring';

const capturesDir = path.join(__dirname, 'captures');

describe('capture batch report', () => {
  it('dimension ceilings sum to the exported max total', () => {
    const sum = Object.values(EVAL_SCORE_DIMENSION_MAX).reduce(
      (a, b) => a + b,
      0,
    );
    expect(sum).toBe(EVAL_SCORE_MAX_TOTAL);
  });

  it('normalizes findings into groupable patterns', () => {
    expect(
      normalizeFinding(
        'Volume: "Upper · Monday" below target (4 < 5 for ~45 min simple).',
      ),
    ).toBe('Volume: "…" below target (N < N for ~N min simple).');
    expect(
      normalizeFinding(
        'Conditioning coverage: 2/4 strength sessions include a Cardio library row.',
      ),
    ).toBe(
      'Conditioning coverage: N/N strength sessions include a Cardio library row.',
    );
  });

  it('scores generate_sessions captures and skips other fixture kinds', () => {
    const files = collectCaptureFiles(capturesDir);
    expect(files.length).toBeGreaterThanOrEqual(7);

    const report = buildCaptureBatchReport(capturesDir);
    // 3 generate_sessions captures live in this dir; cross-week fixtures are a different kind.
    expect(report.scored.length).toBe(3);
    expect(report.skipped.length).toBeGreaterThanOrEqual(4);
    for (const s of report.skipped) {
      expect(s.reason).toMatch(/expected kind "generate_sessions"/);
    }
  });

  it('aggregates stats, segments, and finding buckets', () => {
    const report = buildCaptureBatchReport(capturesDir);
    const stats = report.stats!;
    expect(stats.count).toBe(3);
    expect(stats.maxPossible).toBe(EVAL_SCORE_MAX_TOTAL);
    expect(stats.minTotal).toBeLessThanOrEqual(stats.medianTotal);
    expect(stats.medianTotal).toBeLessThanOrEqual(stats.maxTotal);
    expect(stats.meanTotal).toBeGreaterThan(0);

    for (const [key, max] of Object.entries(EVAL_SCORE_DIMENSION_MAX)) {
      const d =
        stats.dimensionAverages[key as keyof typeof stats.dimensionAverages];
      expect(d.max).toBe(max);
      expect(d.avg).toBeGreaterThanOrEqual(0);
      expect(d.avg).toBeLessThanOrEqual(max);
    }

    // The synthetic duplicate-across-chunk capture must fail validation and
    // score below the clean synthetic two-day capture.
    const dup = report.scored.find((r) =>
      r.file.includes('duplicate-across-chunk'),
    )!;
    const good = report.scored.find((r) =>
      r.file.includes('hybrid-two-day-good'),
    )!;
    expect(dup.validationOk).toBe(false);
    expect(good.validationOk).toBe(true);
    expect(dup.total).toBeLessThan(good.total);
    expect(stats.validationOkRate).toBeLessThan(100);

    expect(report.topFindings.length).toBeGreaterThan(0);
    expect(report.topFindings[0]!.count).toBeGreaterThanOrEqual(
      report.topFindings[report.topFindings.length - 1]!.count,
    );
    expect(Object.keys(report.byGoal).length).toBeGreaterThan(0);
  });

  it('respects the limit option (most recent files win)', () => {
    const all = buildCaptureBatchReport(capturesDir);
    const limited = buildCaptureBatchReport(capturesDir, { limit: 2 });
    expect(limited.scored.length + limited.skipped.length).toBe(2);
    expect(all.scored.length + all.skipped.length).toBeGreaterThan(2);
  });

  it('formats a readable report with the key sections', () => {
    const report = buildCaptureBatchReport(capturesDir);
    const text = formatCaptureBatchReport(report);
    expect(text).toContain('Generation capture batch report');
    expect(text).toContain('--- Score distribution ---');
    expect(text).toContain('--- Dimension averages');
    expect(text).toContain('--- Top findings');
    expect(text).toContain('--- Worst');
  });

  it('returns an empty-but-valid report for a missing directory', () => {
    const report = buildCaptureBatchReport(
      path.join(capturesDir, 'does-not-exist'),
    );
    expect(report.scored).toEqual([]);
    expect(report.stats).toBeUndefined();
    expect(formatCaptureBatchReport(report)).toContain(
      'No scorable captures found.',
    );
  });
});
