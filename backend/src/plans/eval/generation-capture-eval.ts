import * as fs from 'fs';
import * as path from 'path';
import type { GenerateSessionsDto } from '../dto/generate-sessions.dto';
import type { GeneratedSession } from '../session-enrichment';
import { validateGeneratedProgramChunk } from '../generated-chunk-validators';
import { scoreGeneratedChunk, type EvalScoreResult } from './eval-scoring';
import type { EvalCatalogExercise } from './eval-types';
import { movementPatternsMapForSessions } from './eval-harness';
import {
  transformExercise,
  type RawExercise,
} from '../../data/exercise-mappings';

export type ParsedGenerateSessionsCapture = {
  inputs: {
    goal?: string;
    detailLevel?: string;
    sessions: GenerateSessionsDto['sessions'];
  };
  sessionsOut: GeneratedSession[];
  /** Present when capture logged pre-enrichment slice aligned with specs. */
  sessionsPreEnrichment?: GeneratedSession[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Parse a `GENERATION_CAPTURE=1` JSON file (`kind: "generate_sessions"`).
 * Returns final {@link outputs.sessions} and optional {@link outputs.sessionsPreEnrichment}.
 */
export function parseGenerateSessionsCapture(
  raw: unknown,
): ParsedGenerateSessionsCapture {
  const r = asRecord(raw);
  if (!r) throw new Error('Capture: expected JSON object');
  if (r.kind !== 'generate_sessions') {
    throw new Error(
      `Capture: expected kind "generate_sessions", got ${String(r.kind)}`,
    );
  }
  const inputs = asRecord(r.inputs);
  if (!inputs) throw new Error('Capture: missing inputs');
  const specsRaw = inputs.sessions;
  if (!Array.isArray(specsRaw) || specsRaw.length === 0) {
    throw new Error('Capture: inputs.sessions must be a non-empty array');
  }
  const outputs = asRecord(r.outputs);
  if (!outputs) throw new Error('Capture: missing outputs');
  const sessionsRaw = outputs.sessions;
  if (!Array.isArray(sessionsRaw) || sessionsRaw.length === 0) {
    throw new Error('Capture: outputs.sessions must be a non-empty array');
  }
  const specs = specsRaw as GenerateSessionsDto['sessions'];
  const sessions = sessionsRaw as GeneratedSession[];
  if (sessions.length !== specs.length) {
    throw new Error(
      `Capture: sessions/specs length mismatch (${sessions.length} vs ${specs.length})`,
    );
  }
  let sessionsPreEnrichment: GeneratedSession[] | undefined;
  const preRaw = outputs.sessionsPreEnrichment;
  if (Array.isArray(preRaw) && preRaw.length === sessions.length) {
    sessionsPreEnrichment = preRaw as GeneratedSession[];
  }
  return {
    inputs: {
      goal: typeof inputs.goal === 'string' ? inputs.goal : undefined,
      detailLevel:
        typeof inputs.detailLevel === 'string' ? inputs.detailLevel : undefined,
      sessions: specs,
    },
    sessionsOut: sessions,
    sessionsPreEnrichment,
  };
}

/**
 * Summarize `pipeline.chunks` when present (batch vs per-session, validator passes, Groq finish reasons).
 */
export type CapturePipelineSummary = {
  chunkCount: number;
  anyPerSessionAfterBatchFallback: boolean;
  /** Any chunk had a first-pass validator with issues (batch slice failed checks). */
  anyValidatorFirstPassHadIssues: boolean;
  /** Distinct Groq `finish_reason` values across logged HTTP completions. */
  groqFinishReasons: string[];
  /** Any completion ended with `length` (truncation risk). */
  anyFinishReasonLength: boolean;
};

export function summarizeCapturePipeline(
  raw: unknown,
): CapturePipelineSummary | undefined {
  const r = asRecord(raw);
  if (!r) return undefined;
  const pipe = asRecord(r.pipeline);
  const chunks = pipe?.chunks;
  if (!Array.isArray(chunks) || chunks.length === 0) return undefined;
  const finish = new Set<string>();
  let anyPer = false;
  let anyFirstIssues = false;
  let anyLength = false;
  for (const c of chunks) {
    const ch = asRecord(c);
    if (!ch) continue;
    if (ch.perSessionAfterBatchFallback === true) anyPer = true;
    const v1 = asRecord(ch.validatorFirstPass);
    if (v1 && v1.ok === false) anyFirstIssues = true;
    const issues = v1?.issues;
    if (Array.isArray(issues) && issues.length > 0) anyFirstIssues = true;
    const rawCalls = ch.groqCallsRaw;
    if (Array.isArray(rawCalls)) {
      for (const call of rawCalls) {
        const cr = asRecord(call);
        const fr = cr?.finish_reason;
        if (typeof fr === 'string' && fr.trim()) {
          finish.add(fr.trim());
          if (fr.trim() === 'length') anyLength = true;
        }
      }
    }
  }
  return {
    chunkCount: chunks.length,
    anyPerSessionAfterBatchFallback: anyPer,
    anyValidatorFirstPassHadIssues: anyFirstIssues,
    groqFinishReasons: [...finish].sort(),
    anyFinishReasonLength: anyLength,
  };
}

/**
 * Infer movement patterns from capture row text + muscle when the full exercise
 * library is not loaded (CLI / offline eval). Tuned for chunk scoring, not catalog authoring.
 */
export function inferMovementPatternsForCaptureExercise(ex: {
  name?: string;
  exerciseId?: string;
  primaryMuscleGroup?: string;
}): string[] {
  const blob = `${ex.name ?? ''} ${ex.exerciseId ?? ''}`.toLowerCase();
  const p = new Set<string>();
  if ((ex.primaryMuscleGroup ?? '').trim() === 'Cardio') return [];

  if (
    /\b(deadlift|rdl\b|romanian|good morning|hip hinge|glute bridge|back extension|leg curl|hamstring curl|hip thrust)\b/.test(
      blob,
    )
  ) {
    p.add('Hinge');
  }
  if (
    /\b(squat|leg press|hack squat|goblet squat|front squat|wall sit|leg extension)\b/.test(
      blob,
    )
  ) {
    p.add('Squat');
  }
  if (/\b(lunge|split squat|step-?up|curtsy|lateral lunge)\b/.test(blob)) {
    p.add('Lunge');
  }
  if (
    /\b(row|rows|pulldown|pull-down|pullup|pull-up|pull up|lat\b|chin-up|chinup|face pull|shrug|landmine row)\b/.test(
      blob,
    )
  ) {
    p.add('Pull');
  }
  if (
    /\b(press|bench|push-up|pushup|dip|fly|curl|pushdown|extension|skull|overhead march|rotation|sit-?up)\b/.test(
      blob,
    )
  ) {
    p.add('Push');
  }

  if (p.size === 0) {
    const pm = (ex.primaryMuscleGroup ?? '').toLowerCase();
    if (pm === 'back') p.add('Pull');
    else if (pm === 'chest' || pm === 'shoulders' || pm === 'arms')
      p.add('Push');
    else if (pm === 'legs' || pm === 'glutes') p.add('Squat');
    else if (pm === 'core') p.add('Push');
  }
  return [...p];
}

function findExerciseRowById(
  sessions: GeneratedSession[],
  id: string,
): NonNullable<GeneratedSession['exercises']>[number] | undefined {
  for (const s of sessions) {
    for (const e of s.exercises ?? []) {
      if (e.exerciseId?.trim() === id) return e;
    }
  }
  return undefined;
}

/** Build a minimal catalog from whatever the capture already stamped on each exercise row. */
export function buildInferCatalogFromCaptureSessions(
  sessions: GeneratedSession[],
): EvalCatalogExercise[] {
  const byId = new Map<string, EvalCatalogExercise>();
  for (const s of sessions) {
    for (const e of s.exercises ?? []) {
      const id = e.exerciseId?.trim();
      if (!id || byId.has(id)) continue;
      byId.set(id, {
        id,
        name: (e.name ?? id).trim() || id,
        movementPatterns: inferMovementPatternsForCaptureExercise({
          name: e.name,
          exerciseId: e.exerciseId,
          primaryMuscleGroup: e.primaryMuscleGroup,
        }),
        primaryMuscleGroup: e.primaryMuscleGroup,
        prescriptionType: e.prescriptionType,
      });
    }
  }
  return [...byId.values()];
}

let cachedLibrary: {
  path: string;
  map: Map<string, EvalCatalogExercise>;
} | null = null;

function loadExerciseLibraryMap(
  jsonPath: string,
): Map<string, EvalCatalogExercise> {
  if (cachedLibrary?.path === jsonPath) return cachedLibrary.map;
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as RawExercise[];
  const map = new Map<string, EvalCatalogExercise>();
  for (const row of raw) {
    const t = transformExercise(row);
    map.set(t.id, {
      id: t.id,
      name: t.name,
      movementPatterns: t.movementPatterns,
      primaryMuscleGroup: t.primaryMuscleGroup,
      prescriptionType: t.prescriptionType,
    });
  }
  cachedLibrary = { path: jsonPath, map };
  return map;
}

/**
 * Resolve capture exerciseIds against `exercises_5000plus.json` for accurate movement metadata.
 * Missing ids fall back to capture-row inference.
 */
export function buildCatalogForSessionsFromLibrary(
  sessions: GeneratedSession[],
  libraryJsonPath: string,
): { catalog: EvalCatalogExercise[]; resolvedIds: number; totalIds: number } {
  if (!fs.existsSync(libraryJsonPath)) {
    const catalog = buildInferCatalogFromCaptureSessions(sessions);
    const ids = new Set<string>();
    for (const s of sessions) {
      for (const e of s.exercises ?? []) {
        const id = e.exerciseId?.trim();
        if (id) ids.add(id);
      }
    }
    return { catalog, resolvedIds: ids.size, totalIds: ids.size };
  }
  const lib = loadExerciseLibraryMap(libraryJsonPath);
  const ids = new Set<string>();
  for (const s of sessions) {
    for (const e of s.exercises ?? []) {
      const id = e.exerciseId?.trim();
      if (id) ids.add(id);
    }
  }
  const catalog: EvalCatalogExercise[] = [];
  let resolved = 0;
  for (const id of ids) {
    const hit = lib.get(id);
    if (hit) {
      catalog.push(hit);
      resolved++;
    } else {
      const row = findExerciseRowById(sessions, id);
      catalog.push({
        id,
        name: (row?.name ?? id).trim() || id,
        movementPatterns: inferMovementPatternsForCaptureExercise({
          name: row?.name,
          exerciseId: id,
          primaryMuscleGroup: row?.primaryMuscleGroup,
        }),
        primaryMuscleGroup: row?.primaryMuscleGroup,
        prescriptionType: row?.prescriptionType,
      });
    }
  }
  return { catalog, resolvedIds: resolved, totalIds: ids.size };
}

export type GenerationCaptureScoreResult = {
  score: EvalScoreResult;
  validation: ReturnType<typeof validateGeneratedProgramChunk>;
  effectiveDetailLevel: 'simple' | 'detailed';
};

function effectiveDetail(
  detailLevel: string | undefined,
): 'simple' | 'detailed' {
  return detailLevel === 'detailed' ? 'detailed' : 'simple';
}

function scoreSessionsWithCatalog(
  inputs: ParsedGenerateSessionsCapture['inputs'],
  sessions: GeneratedSession[],
  catalog: EvalCatalogExercise[],
): GenerationCaptureScoreResult {
  const effectiveDetailLevel = effectiveDetail(inputs.detailLevel);
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const movementMap = movementPatternsMapForSessions(sessions, (id) =>
    byId.get(id),
  );
  const validation = validateGeneratedProgramChunk(
    inputs.sessions,
    sessions,
    effectiveDetailLevel,
    movementMap,
  );
  const score = scoreGeneratedChunk({
    specs: inputs.sessions,
    sessions,
    catalog,
    validation,
    effectiveDetailLevel,
    enrichGoal: inputs.goal,
  });
  return { score, validation, effectiveDetailLevel };
}

function buildCatalogForMode(
  sessions: GeneratedSession[],
  mode: 'infer' | 'library',
  libraryPath: string,
): {
  catalog: EvalCatalogExercise[];
  resolvedIds: number;
  totalIds: number;
  usedLibrary: boolean;
  libraryPath?: string;
} {
  if (mode === 'library' && fs.existsSync(libraryPath)) {
    const r = buildCatalogForSessionsFromLibrary(sessions, libraryPath);
    return { ...r, usedLibrary: true, libraryPath };
  }
  const catalog = buildInferCatalogFromCaptureSessions(sessions);
  const ids = new Set<string>();
  for (const s of sessions) {
    for (const e of s.exercises ?? []) {
      const id = e.exerciseId?.trim();
      if (id) ids.add(id);
    }
  }
  const n = ids.size;
  return { catalog, resolvedIds: n, totalIds: n, usedLibrary: false };
}

export type GenerationCaptureFullResult = {
  final: GenerationCaptureScoreResult;
  preEnrichment?: GenerationCaptureScoreResult;
  /** Post-enrichment quality guardrails (final should not regress key strength signals vs pre). */
  strengthFloor?: {
    ok: boolean;
    findings: string[];
  };
  /** final.total - pre.total when pre exists */
  deltaTotal?: number;
  catalog: {
    mode: 'infer' | 'library';
    resolvedIds: number;
    totalIds: number;
    libraryPath?: string;
  };
  preCatalog?: {
    mode: 'infer' | 'library';
    resolvedIds: number;
    totalIds: number;
  };
  pipeline?: CapturePipelineSummary;
};

export type ScoreGenerationCaptureFullOptions = {
  catalogMode?: 'infer' | 'library';
  /** Defaults to `<cwd>/data/exercises_5000plus.json`. */
  exerciseLibraryPath?: string;
};

function strengthFloorFindings(args: {
  specs: GenerateSessionsDto['sessions'];
  pre: GenerationCaptureScoreResult;
  final: GenerationCaptureScoreResult;
}): string[] {
  const findings: string[] = [];
  const preB = args.pre.score.breakdown;
  const finB = args.final.score.breakdown;
  const reqNoDrop: Array<keyof typeof preB> = [
    'balance',
    'workoutOrder',
    'prescriptionHygiene',
  ];
  for (const k of reqNoDrop) {
    if (finB[k] < preB[k]) {
      findings.push(
        `Strength floor: post-enrichment ${k} dropped (${finB[k]} < ${preB[k]}).`,
      );
    }
  }
  if (finB.coachingProDepth + 1 < preB.coachingProDepth) {
    findings.push(
      `Strength floor: coaching depth regressed too far (${finB.coachingProDepth} vs ${preB.coachingProDepth}).`,
    );
  }
  const hasStrength = args.specs.some((s) => s.type === 'strength');
  if (hasStrength && finB.total + 2 < preB.total) {
    findings.push(
      `Strength floor: post-enrichment total fell materially (${finB.total} vs ${preB.total}).`,
    );
  }
  return findings;
}

/**
 * Score final sessions; optionally score `sessionsPreEnrichment` and summarize pipeline metadata.
 */
export function scoreGenerationCaptureFull(
  raw: unknown,
  opts?: ScoreGenerationCaptureFullOptions,
): GenerationCaptureFullResult {
  const parsed = parseGenerateSessionsCapture(raw);
  const mode = opts?.catalogMode ?? 'infer';
  const libraryPath =
    opts?.exerciseLibraryPath ??
    path.join(process.cwd(), 'data', 'exercises_5000plus.json');

  const finalCat = buildCatalogForMode(parsed.sessionsOut, mode, libraryPath);
  let final = scoreSessionsWithCatalog(
    parsed.inputs,
    parsed.sessionsOut,
    finalCat.catalog,
  );

  let pre: GenerationCaptureScoreResult | undefined;
  let preCatStats: GenerationCaptureFullResult['preCatalog'];
  let strengthFloor: GenerationCaptureFullResult['strengthFloor'];
  let deltaTotal: number | undefined;
  if (parsed.sessionsPreEnrichment) {
    const pc = buildCatalogForMode(
      parsed.sessionsPreEnrichment,
      mode,
      libraryPath,
    );
    pre = scoreSessionsWithCatalog(
      parsed.inputs,
      parsed.sessionsPreEnrichment,
      pc.catalog,
    );
    preCatStats = {
      mode: pc.usedLibrary ? 'library' : 'infer',
      resolvedIds: pc.resolvedIds,
      totalIds: pc.totalIds,
    };
    const floorFindings = strengthFloorFindings({
      specs: parsed.inputs.sessions,
      pre,
      final,
    });
    strengthFloor = { ok: floorFindings.length === 0, findings: floorFindings };
    if (floorFindings.length) {
      final = {
        ...final,
        score: {
          ...final.score,
          findings: [...final.score.findings, ...floorFindings],
        },
      };
    }
    deltaTotal = final.score.breakdown.total - pre.score.breakdown.total;
  }

  return {
    final,
    preEnrichment: pre,
    deltaTotal,
    catalog: {
      mode: finalCat.usedLibrary ? 'library' : 'infer',
      resolvedIds: finalCat.resolvedIds,
      totalIds: finalCat.totalIds,
      libraryPath: finalCat.libraryPath,
    },
    strengthFloor,
    preCatalog: preCatStats,
    pipeline: summarizeCapturePipeline(raw),
  };
}

/**
 * Score final `outputs.sessions` only (backward compatible).
 * Pass `{ catalogMode: 'library' }` to resolve movement metadata from `data/exercises_5000plus.json`.
 */
export function scoreGenerationCapture(
  raw: unknown,
  opts?: ScoreGenerationCaptureFullOptions,
): GenerationCaptureScoreResult {
  return scoreGenerationCaptureFull(raw, opts).final;
}

export { EVAL_SCORE_MAX_TOTAL } from './eval-scoring';
