import { readFileSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';

/**
 * Optional local QA: write each generation request + response as JSON under
 * `logs/generation-captures/` (default). Enable with GENERATION_CAPTURE=1.
 *
 * Files are gitignored via `logs/` in backend/.gitignore. Do not enable in
 * production unless you intend to store user workout data on disk.
 *
 * Score a saved capture offline: `npm run eval:capture` or
 * `npm run eval:capture -- --library path/to.json` (see
 * `scripts/score-generation-capture.ts` and `plans/eval/generation-capture-eval.ts`).
 *
 * Captures include: raw API inputs, server-resolved context (equipment mapping,
 * effective detail level, prior exercise ids), per-chunk pipeline path and
 * validator results, Groq usage, and enriched outputs — enough to debug,
 * reproduce intent, and tune prompts/validators.
 */

export function generationCaptureEnabled(): boolean {
  const v = process.env.GENERATION_CAPTURE?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Absolute or cwd-relative directory for capture files. */
export function generationCaptureDir(): string {
  const raw = process.env.GENERATION_CAPTURE_DIR?.trim();
  if (raw) {
    if (raw.startsWith('/') || /^[A-Za-z]:[\\/]/.test(raw)) return raw;
    return join(process.cwd(), raw);
  }
  return join(process.cwd(), 'logs', 'generation-captures');
}

/** One session row from the plan DTO — copied per chunk for quick QA without slicing `inputs.sessions`. */
export type SessionSpecSummary = {
  weekIndex: number;
  weekday: string;
  title?: string;
  type: string;
  durationMin: number;
  durationMax: number;
  isHardDay: boolean;
};

/** Serializable chunk validator snapshot (matches `ChunkValidationResult` fields). */
export type ChunkValidationSerialized = {
  ok: boolean;
  issues: string[];
  duplicateExerciseIds: string[];
  patternClashExerciseIds: string[];
};

/**
 * One batch/hybrid/per-session chunk: path taken, priors, validation, Groq cost.
 * Optional `chunkIndex` / `globalSessionIndices` / `priorContextExerciseIdsInput`
 * are set when merging into a full-program capture.
 */
export type ChunkGenerationTrace = {
  weekMin: number;
  sessionWeekIndices: number[];
  effectiveDetailLevel: 'simple' | 'detailed';
  /** Prior ids actually fed into batch / hybrid / per-session (after cap). */
  cappedPriorExerciseIds: string[];
  path: string;
  hybridPolishApplied?: boolean;
  validatorFirstPass?: ChunkValidationSerialized | null;
  validatorSecondPass?: ChunkValidationSerialized | null;
  validatorIssuesFromRetry?: string[];
  /** When batch retries: tail list passed as `priorWeekExerciseIds` to Groq. */
  batchRetryPriorExerciseIdsTail?: string[];
  groq: {
    groqCalls: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  chunkIndex?: number;
  globalSessionIndices?: number[];
  /** Oldest→newest slice passed into this chunk (before capping) — drives variety. */
  priorContextExerciseIdsInput?: string[];
  /** True when `specs.length >= 2` so batch was attempted before per-session fallback. */
  preBatchAttempted?: boolean;
  /** Batch failed validators; final sessions were built with per-session Groq calls. */
  perSessionAfterBatchFallback?: boolean;
  /** Session specs for this chunk only (aligned with `path` / Groq calls). */
  sessionSpecsSummary?: SessionSpecSummary[];
  /**
   * One entry per Groq HTTP completion in this chunk (batch split, retry, or per-session).
   * Preserves `finish_reason` (e.g. length) — folded totals alone lose this.
   */
  groqCallsRaw?: Array<{
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    finish_reason?: string | null;
  }>;
};

export type GenerateSessionsPipelineCapture = {
  resolvedContext: {
    goal: string;
    location: 'gym' | 'home';
    detailLevelRequested: string;
    makeItEasier: boolean;
    experienceLevel: string;
    equipmentTags?: string[];
    /** UI tags mapped to library equipment labels (gym). */
    mappedGymEquipment: string[];
    /** What the generator uses: home list, mapped gym tags, or undefined = full pool. */
    generatorEquipment: string[] | undefined;
    cardioModalitiesRaw?: string[];
    cardioModalitiesNormalized?: string[];
    limitations: string[];
    avoidConstraintsGlobal?: string[];
    mesoHint?: string;
    maxSessionsPerBatchChunk: number;
    totalChunkCount: number;
    /** Batch prompts include “cardio finisher last” on strength days when true. */
    goalWantsStrengthCardioFinisher: boolean;
    /** Same equipment passed to `enrichGeneratedSession` (mirrors generator for gym/home). */
    enrichmentEquipment: string[] | undefined;
    /** Oldest→newest exercise ids kept for cross-chunk variety (see `PlansService` constants). */
    priorExerciseHistoryMax: number;
    /** Unique ids passed to prompts / exclude lists (cap). */
    priorContextMaxUnique: number;
    totalSessionsInRequest: number;
  };
  chunks: ChunkGenerationTrace[];
};

export type SingleSessionPipelineCapture = {
  resolvedContext: {
    goal: string;
    location: 'gym' | 'home';
    detailLevel: string;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    durationMinutes: number;
    focus: string;
    programDayFocus: string;
    equipment: string[] | undefined;
    limitations: string[];
    excludeExerciseNames?: string[];
    goalWantsStrengthCardioFinisher: boolean;
    sessionType: 'strength' | 'cardio' | 'recovery';
    weekIndex: number;
    weekday: string;
    isHardDay: boolean;
    /** Equipment passed to enrichment (home list or undefined for gym in current flow). */
    enrichmentEquipment: string[] | undefined;
  };
  path: 'single_session_groq';
  groqCallsRaw?: Array<{
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    finish_reason?: string | null;
  }>;
};

export type GenerationCaptureRecordV1 = {
  schemaVersion: 1;
  kind: 'generate_sessions' | 'generate_single_session';
  /** ISO 8601 */
  capturedAt: string;
  /** Generate Plan / API body (the “boxes”): goal, equipmentTags, sessions[], etc. */
  inputs: unknown;
  /**
   * Enriched sessions returned to the client.
   * For `generate_sessions`, includes `sessionsPreEnrichment` (post-Groq, pre-`enrichGeneratedSession`)
   * so you can diff ordering, prescription, pull-balance, and warm-up tie-in.
   */
  outputs: unknown;
  /**
   * Server-resolved context + per-chunk pipeline (paths, validators, priors, Groq).
   * Omitted when capture is minimal (should not happen for generate_sessions if wired).
   */
  pipeline?: GenerateSessionsPipelineCapture | SingleSessionPipelineCapture;
  meta?: {
    groq?: {
      sessionCount: number;
      chunkCount: number;
      groqCalls: number;
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
    /** Process / deploy correlation (no user id). */
    run?: {
      nodeEnv?: string;
      /** `backend/package.json` version when readable. */
      serviceVersion?: string;
    };
  };
};

function toJsonSafe(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return value;
  }
}

function readBackendPackageVersion(): string | undefined {
  try {
    const raw = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    return typeof pkg.version === 'string' ? pkg.version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Writes one JSON file. Returns absolute path, or `null` if capture is disabled.
 * Failures are thrown (caller should catch and log).
 */
export async function writeGenerationCapture(args: {
  kind: GenerationCaptureRecordV1['kind'];
  inputs: unknown;
  outputs: unknown;
  meta?: GenerationCaptureRecordV1['meta'];
  pipeline?: GenerationCaptureRecordV1['pipeline'];
  capturedAt?: string;
}): Promise<string | null> {
  if (!generationCaptureEnabled()) return null;

  const dir = generationCaptureDir();
  await mkdir(dir, { recursive: true });

  const capturedAt = args.capturedAt ?? new Date().toISOString();
  const id = randomBytes(4).toString('hex');
  const filename = `generation-${Date.now()}-${id}.json`;
  const filePath = join(dir, filename);

  const runMeta = {
    nodeEnv: process.env.NODE_ENV,
    serviceVersion: readBackendPackageVersion(),
  };

  const record: GenerationCaptureRecordV1 = {
    schemaVersion: 1,
    kind: args.kind,
    capturedAt,
    inputs: toJsonSafe(args.inputs),
    outputs: toJsonSafe(args.outputs),
    ...(args.pipeline ? { pipeline: toJsonSafe(args.pipeline) as GenerationCaptureRecordV1['pipeline'] } : {}),
    meta: {
      ...args.meta,
      run: runMeta,
    },
  };

  await writeFile(filePath, JSON.stringify(record, null, 2), 'utf8');
  return filePath;
}
