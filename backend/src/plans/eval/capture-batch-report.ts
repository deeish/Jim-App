import * as fs from 'fs';
import * as path from 'path';
import {
  scoreGenerationCaptureFull,
  EVAL_SCORE_MAX_TOTAL,
  type ScoreGenerationCaptureFullOptions,
} from './generation-capture-eval';
import {
  EVAL_SCORE_DIMENSION_MAX,
  type EvalScoreBreakdown,
} from './eval-scoring';

/**
 * Batch quality report over a directory of GENERATION_CAPTURE JSON files
 * (`logs/generation-captures/` by default — see `generation-capture.ts`).
 *
 * Scores every `kind: "generate_sessions"` capture with the existing
 * per-capture scorer, then aggregates: score distribution, per-dimension
 * averages vs ceiling, recurring findings, validator/fallback/truncation
 * rates, token spend, and per-goal / per-day segmentation.
 *
 * CLI: `npm run eval:captures:report` (see `scripts/eval-captures-report.ts`).
 */

export type DimensionKey = Exclude<keyof EvalScoreBreakdown, 'total'>;

export type CaptureReportRow = {
  file: string;
  capturedAt?: string;
  goal?: string;
  detailLevel?: string;
  location?: string;
  experienceLevel?: string;
  sessionCount: number;
  strengthSessionCount: number;
  total: number;
  validationOk: boolean;
  validatorIssues: string[];
  breakdown: EvalScoreBreakdown;
  findings: string[];
  /** final total - pre-enrichment total, when the capture logged both. */
  deltaTotal?: number;
  strengthFloorOk?: boolean;
  pipeline?: {
    chunkCount: number;
    anyPerSessionAfterBatchFallback: boolean;
    anyValidatorFirstPassHadIssues: boolean;
    anyFinishReasonLength: boolean;
  };
  groqTokens?: {
    calls: number;
    prompt: number;
    completion: number;
    total: number;
  };
  /** Fraction of exercise ids resolved against the catalog used for scoring. */
  catalogResolvedRatio: number;
};

export type SkippedCapture = { file: string; reason: string };

export type FindingBucket = {
  /** Finding text with quoted names and numbers normalized away. */
  pattern: string;
  /** Total occurrences across all captures. */
  count: number;
  /** Number of distinct captures the finding appears in. */
  captures: number;
  /** One verbatim example. */
  example: string;
};

export type CaptureBatchStats = {
  count: number;
  meanTotal: number;
  medianTotal: number;
  p25Total: number;
  minTotal: number;
  maxTotal: number;
  maxPossible: number;
  validationOkRate: number;
  /** Captures where any chunk fell back to per-session calls after a failed batch. */
  fallbackRate: number;
  /** Captures where any chunk's first validator pass had issues (LLM needed repair/retry). */
  firstPassIssueRate: number;
  /** Captures with any Groq completion finish_reason === "length". */
  truncationRate: number;
  dimensionAverages: Record<
    DimensionKey,
    { avg: number; max: number; pctOfMax: number }
  >;
  /** Mean Groq tokens per generated session, over captures that logged usage. */
  tokensPerSession?: { prompt: number; completion: number; captures: number };
};

export type CaptureBatchReport = {
  dir: string;
  catalogMode: 'infer' | 'library';
  scored: CaptureReportRow[];
  skipped: SkippedCapture[];
  stats?: CaptureBatchStats;
  topFindings: FindingBucket[];
  byGoal: Record<string, { count: number; meanTotal: number }>;
  byDay: Record<string, { count: number; meanTotal: number }>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function optString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

/** List capture JSON files in a directory (non-recursive), oldest-first by name. */
export function collectCaptureFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.json'))
    .sort()
    .map((f) => path.join(dir, f));
}

/**
 * Collapse a finding into a comparable pattern: quoted session/exercise names
 * become "…", numbers become N. Keeps findings groupable across captures.
 */
export function normalizeFinding(finding: string): string {
  return finding
    .replace(/"[^"]*"/g, '"…"')
    .replace(/\d+(?:\.\d+)?/g, 'N')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreOneCapture(
  file: string,
  opts?: ScoreGenerationCaptureFullOptions,
): CaptureReportRow {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
  const full = scoreGenerationCaptureFull(raw, opts);

  const record = asRecord(raw);
  const inputs = asRecord(record?.inputs);
  const specsRaw = Array.isArray(inputs?.sessions) ? inputs.sessions : [];
  const strengthCount = specsRaw.filter(
    (s) => asRecord(s)?.type === 'strength',
  ).length;

  const meta = asRecord(record?.meta);
  const groq = asRecord(meta?.groq);
  const groqTokens =
    groq && typeof groq.total_tokens === 'number'
      ? {
          calls: Number(groq.groqCalls) || 0,
          prompt: Number(groq.prompt_tokens) || 0,
          completion: Number(groq.completion_tokens) || 0,
          total: Number(groq.total_tokens) || 0,
        }
      : undefined;

  return {
    file: path.basename(file),
    capturedAt: optString(record?.capturedAt),
    goal: optString(inputs?.goal),
    detailLevel: optString(inputs?.detailLevel),
    location: optString(inputs?.location),
    experienceLevel: optString(inputs?.experienceLevel),
    sessionCount: specsRaw.length,
    strengthSessionCount: strengthCount,
    total: full.final.score.breakdown.total,
    validationOk: full.final.validation.ok,
    validatorIssues: [...full.final.validation.issues],
    breakdown: full.final.score.breakdown,
    findings: [...full.final.score.findings],
    deltaTotal: full.deltaTotal,
    strengthFloorOk: full.strengthFloor?.ok,
    pipeline: full.pipeline
      ? {
          chunkCount: full.pipeline.chunkCount,
          anyPerSessionAfterBatchFallback:
            full.pipeline.anyPerSessionAfterBatchFallback,
          anyValidatorFirstPassHadIssues:
            full.pipeline.anyValidatorFirstPassHadIssues,
          anyFinishReasonLength: full.pipeline.anyFinishReasonLength,
        }
      : undefined,
    groqTokens,
    catalogResolvedRatio:
      full.catalog.totalIds > 0
        ? full.catalog.resolvedIds / full.catalog.totalIds
        : 1,
  };
}

function percentile(sortedAsc: number[], p: number): number {
  if (!sortedAsc.length) return 0;
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo]!;
  return sortedAsc[lo]! + (sortedAsc[hi]! - sortedAsc[lo]!) * (idx - lo);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function buildStats(rows: CaptureReportRow[]): CaptureBatchStats | undefined {
  if (!rows.length) return undefined;
  const totals = rows.map((r) => r.total).sort((a, b) => a - b);
  const mean = totals.reduce((a, b) => a + b, 0) / totals.length;

  const dims = {} as CaptureBatchStats['dimensionAverages'];
  for (const key of Object.keys(EVAL_SCORE_DIMENSION_MAX) as DimensionKey[]) {
    const max = EVAL_SCORE_DIMENSION_MAX[key];
    const avg = rows.reduce((a, r) => a + r.breakdown[key], 0) / rows.length;
    dims[key] = {
      avg: round1(avg),
      max,
      pctOfMax: Math.round((avg / max) * 100),
    };
  }

  const withPipeline = rows.filter((r) => r.pipeline);
  const rate = (pred: (r: CaptureReportRow) => boolean, pool = rows) =>
    pool.length ? round1((pool.filter(pred).length / pool.length) * 100) : 0;

  const withTokens = rows.filter((r) => r.groqTokens && r.sessionCount > 0);
  const tokensPerSession = withTokens.length
    ? {
        prompt: Math.round(
          withTokens.reduce(
            (a, r) => a + r.groqTokens!.prompt / r.sessionCount,
            0,
          ) / withTokens.length,
        ),
        completion: Math.round(
          withTokens.reduce(
            (a, r) => a + r.groqTokens!.completion / r.sessionCount,
            0,
          ) / withTokens.length,
        ),
        captures: withTokens.length,
      }
    : undefined;

  return {
    count: rows.length,
    meanTotal: round1(mean),
    medianTotal: round1(percentile(totals, 0.5)),
    p25Total: round1(percentile(totals, 0.25)),
    minTotal: totals[0]!,
    maxTotal: totals[totals.length - 1]!,
    maxPossible: EVAL_SCORE_MAX_TOTAL,
    validationOkRate: rate((r) => r.validationOk),
    fallbackRate: rate(
      (r) => !!r.pipeline?.anyPerSessionAfterBatchFallback,
      withPipeline,
    ),
    firstPassIssueRate: rate(
      (r) => !!r.pipeline?.anyValidatorFirstPassHadIssues,
      withPipeline,
    ),
    truncationRate: rate(
      (r) => !!r.pipeline?.anyFinishReasonLength,
      withPipeline,
    ),
    dimensionAverages: dims,
    tokensPerSession,
  };
}

function buildFindingBuckets(rows: CaptureReportRow[]): FindingBucket[] {
  const buckets = new Map<
    string,
    { count: number; captures: Set<string>; example: string }
  >();
  for (const row of rows) {
    for (const finding of row.findings) {
      const pattern = normalizeFinding(finding);
      const b = buckets.get(pattern);
      if (b) {
        b.count++;
        b.captures.add(row.file);
      } else {
        buckets.set(pattern, {
          count: 1,
          captures: new Set([row.file]),
          example: finding,
        });
      }
    }
  }
  return [...buckets.entries()]
    .map(([pattern, b]) => ({
      pattern,
      count: b.count,
      captures: b.captures.size,
      example: b.example,
    }))
    .sort((a, b) => b.count - a.count || a.pattern.localeCompare(b.pattern));
}

function buildSegment(
  rows: CaptureReportRow[],
  keyOf: (r: CaptureReportRow) => string | undefined,
): Record<string, { count: number; meanTotal: number }> {
  const seg = new Map<string, number[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const list = seg.get(key) ?? [];
    list.push(row.total);
    seg.set(key, list);
  }
  const out: Record<string, { count: number; meanTotal: number }> = {};
  for (const [key, totals] of [...seg.entries()].sort()) {
    out[key] = {
      count: totals.length,
      meanTotal: round1(totals.reduce((a, b) => a + b, 0) / totals.length),
    };
  }
  return out;
}

export type BuildCaptureBatchReportOptions =
  ScoreGenerationCaptureFullOptions & {
    /** Score only the N most recent captures (by filename sort). */
    limit?: number;
  };

export function buildCaptureBatchReport(
  dir: string,
  opts?: BuildCaptureBatchReportOptions,
): CaptureBatchReport {
  let files = collectCaptureFiles(dir);
  if (opts?.limit && opts.limit > 0) files = files.slice(-opts.limit);

  const scored: CaptureReportRow[] = [];
  const skipped: SkippedCapture[] = [];
  for (const file of files) {
    try {
      scored.push(scoreOneCapture(file, opts));
    } catch (e) {
      skipped.push({
        file: path.basename(file),
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    dir,
    catalogMode: opts?.catalogMode === 'library' ? 'library' : 'infer',
    scored,
    skipped,
    stats: buildStats(scored),
    topFindings: buildFindingBuckets(scored),
    byGoal: buildSegment(scored, (r) => r.goal),
    byDay: buildSegment(scored, (r) => r.capturedAt?.slice(0, 10)),
  };
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

/** Human-readable multi-section report for terminal output. */
export function formatCaptureBatchReport(
  report: CaptureBatchReport,
  opts?: { topFindings?: number; worstCaptures?: number },
): string {
  const lines: string[] = [];
  const stats = report.stats;
  lines.push('=== Generation capture batch report ===');
  lines.push(`Dir: ${report.dir}`);
  lines.push(
    `Scored: ${report.scored.length}  Skipped: ${report.skipped.length}  Catalog: ${report.catalogMode}`,
  );
  if (report.skipped.length) {
    for (const s of report.skipped) {
      lines.push(`  skipped ${s.file}: ${s.reason}`);
    }
  }
  if (!stats) {
    lines.push('No scorable captures found.');
    return lines.join('\n');
  }

  lines.push('');
  lines.push('--- Score distribution ---');
  lines.push(
    `mean ${stats.meanTotal} / median ${stats.medianTotal} / p25 ${stats.p25Total} / min ${stats.minTotal} / max ${stats.maxTotal}  (ceiling ${stats.maxPossible})`,
  );
  lines.push(
    `validator ok: ${stats.validationOkRate}%   batch->per-session fallback: ${stats.fallbackRate}%   first-pass validator issues: ${stats.firstPassIssueRate}%   truncated completions: ${stats.truncationRate}%`,
  );
  if (stats.tokensPerSession) {
    lines.push(
      `Groq tokens/session (mean over ${stats.tokensPerSession.captures} captures): prompt ${stats.tokensPerSession.prompt}, completion ${stats.tokensPerSession.completion}`,
    );
  }

  lines.push('');
  lines.push('--- Dimension averages (avg / max, % of ceiling) ---');
  const dimRows = Object.entries(stats.dimensionAverages).sort(
    (a, b) => a[1].pctOfMax - b[1].pctOfMax,
  );
  for (const [key, d] of dimRows) {
    lines.push(
      `  ${pad(key, 20)} ${pad(`${d.avg}/${d.max}`, 10)} ${d.pctOfMax}%`,
    );
  }

  lines.push('');
  lines.push('--- By goal (mean total) ---');
  for (const [goal, seg] of Object.entries(report.byGoal)) {
    lines.push(
      `  ${pad(goal, 16)} n=${pad(String(seg.count), 4)} mean ${seg.meanTotal}`,
    );
  }

  lines.push('');
  lines.push('--- By capture day (mean total) ---');
  for (const [day, seg] of Object.entries(report.byDay)) {
    lines.push(
      `  ${day}  n=${pad(String(seg.count), 4)} mean ${seg.meanTotal}`,
    );
  }

  const topN = opts?.topFindings ?? 12;
  lines.push('');
  lines.push(`--- Top findings (of ${report.topFindings.length} patterns) ---`);
  for (const f of report.topFindings.slice(0, topN)) {
    lines.push(`  x${f.count} (${f.captures} captures): ${f.pattern}`);
  }

  const worstN = opts?.worstCaptures ?? 10;
  const worst = [...report.scored].sort((a, b) => a.total - b.total);
  lines.push('');
  lines.push(`--- Worst ${Math.min(worstN, worst.length)} captures ---`);
  for (const r of worst.slice(0, worstN)) {
    const flags = [
      r.validationOk ? '' : 'VALIDATOR',
      r.pipeline?.anyPerSessionAfterBatchFallback ? 'fallback' : '',
      r.pipeline?.anyFinishReasonLength ? 'truncated' : '',
    ]
      .filter(Boolean)
      .join(',');
    lines.push(
      `  ${pad(String(r.total), 4)} ${r.file}  goal=${r.goal ?? '?'} sessions=${r.sessionCount}${flags ? `  [${flags}]` : ''}`,
    );
  }

  return lines.join('\n');
}
