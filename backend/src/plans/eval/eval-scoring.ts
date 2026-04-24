import type { ChunkValidationResult, ChunkValidatorIssue } from '../generated-chunk-validators';
import type { EvalCatalogExercise } from './eval-types';
import {
  idealStrengthExercisePermutation,
  type GeneratedSession,
} from '../session-enrichment';
import type { GenerateSessionsDto } from '../dto/generate-sessions.dto';
import {
  exerciseTargetsForSession,
  goalWantsStrengthCardioFinisher,
} from '../../workouts/workout-generator.service';

export type EvalScoringOptions = {
  skipBalance?: boolean;
  skipVolume?: boolean;
  skipDiversity?: boolean;
  skipMetadata?: boolean;
  skipConditioning?: boolean;
  skipCoaching?: boolean;
  skipWorkoutOrder?: boolean;
  skipPrescription?: boolean;
  skipFatigueStacking?: boolean;
};

export type EvalScoreBreakdown = {
  structural: number;
  balance: number;
  volumeFit: number;
  movementDiversity: number;
  conditioning: number;
  coachingSurface: number;
  libraryMetadata: number;
  /** Alignment with compound-first + cardio-last rules (see `idealStrengthExercisePermutation`). */
  workoutOrder: number;
  /** Coaching copy length + cues a trainer would expect (RPE, ramp, recovery, etc.). */
  coachingProDepth: number;
  /** Sets/reps in sane training ranges; avoids junk prescriptions. */
  prescriptionHygiene: number;
  /** Avoids long unbroken runs on the same primary muscle (local fatigue / joint stress). */
  fatigueStacking: number;
  total: number;
};

/** Sum of structural..fatigueStacking when every dimension is at its ceiling (used for fail caps). */
export const EVAL_SCORE_MAX_TOTAL = 124;

export type EvalScoreResult = {
  breakdown: EvalScoreBreakdown;
  findings: string[];
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function issueCount(v: ChunkValidationResult, issue: ChunkValidatorIssue): number {
  return v.issues.includes(issue) ? 1 : 0;
}

function maxExercisesFromPromptRange(promptRange: string): number {
  const m = promptRange.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (m) {
    const hi = parseInt(m[2]!, 10);
    if (!Number.isNaN(hi)) return hi;
  }
  const lo = parseInt(promptRange.replace(/[^\d].*/, '') || '0', 10);
  return lo > 0 ? lo : 10;
}

function hasCardioExercise(
  session: GeneratedSession,
  byId: Map<string, EvalCatalogExercise>,
): boolean {
  for (const e of session.exercises ?? []) {
    const id = e.exerciseId?.trim();
    if (!id) continue;
    if (byId.get(id)?.primaryMuscleGroup === 'Cardio') return true;
  }
  return false;
}

function hasPattern(
  session: GeneratedSession,
  byId: Map<string, EvalCatalogExercise>,
  pattern: string,
): boolean {
  for (const e of session.exercises ?? []) {
    const id = e.exerciseId?.trim();
    if (!id) continue;
    if (byId.get(id)?.movementPatterns?.includes(pattern)) return true;
  }
  return false;
}

function sessionMetaCoverage(
  session: GeneratedSession,
  byId: Map<string, EvalCatalogExercise>,
): number {
  const rows = session.exercises ?? [];
  const withId = rows.filter((e) => e.exerciseId?.trim());
  if (!withId.length) return 0;
  let ok = 0;
  for (const e of withId) {
    const row = byId.get(e.exerciseId!.trim());
    if (
      row &&
      ((row.movementPatterns?.length ?? 0) > 0 ||
        !!(row.primaryMuscleGroup && row.primaryMuscleGroup.trim()))
    ) {
      ok++;
    }
  }
  return ok / withId.length;
}

function scoreBalance(
  specs: GenerateSessionsDto['sessions'],
  sessions: GeneratedSession[],
  byId: Map<string, EvalCatalogExercise>,
  findings: string[],
  skip: boolean,
): number {
  if (skip) return 18;
  const checks: number[] = [];
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]!;
    const s = sessions[i]!;
    if (spec.type !== 'strength') continue;
    const cov = sessionMetaCoverage(s, byId);
    if (cov < 0.55) {
      findings.push(
        `Balance checks skipped for "${spec.title ?? spec.weekday}" (low catalog metadata coverage ${Math.round(cov * 100)}%).`,
      );
      continue;
    }
    const t = (spec.title ?? '').toLowerCase();
    if (/\bupper\b|\bpull\b|\bback\b/.test(t)) {
      const ok = hasPattern(s, byId, 'Pull');
      checks.push(ok ? 1 : 0);
      if (!ok) findings.push(`"${spec.title ?? spec.weekday}" lacks a clear Pull movement.`);
    }
    if (/\blower\b|\blegs?\b/.test(t)) {
      const squat = hasPattern(s, byId, 'Squat');
      const hinge = hasPattern(s, byId, 'Hinge');
      const ok = squat && hinge;
      checks.push(ok ? 1 : 0);
      if (!ok) {
        findings.push(`"${spec.title ?? spec.weekday}" misses Squat/Hinge pattern coverage.`);
      }
    }
  }
  if (!checks.length) return 18;
  const avg = checks.reduce((a, b) => a + b, 0) / checks.length;
  return Math.round(avg * 18);
}

function scoreVolumeFit(
  specs: GenerateSessionsDto['sessions'],
  sessions: GeneratedSession[],
  effectiveDetailLevel: 'simple' | 'detailed',
  findings: string[],
  skip: boolean,
  enrichGoal: string | undefined,
  byId: Map<string, EvalCatalogExercise>,
): number {
  if (skip) return 12;
  const slices: number[] = [];
  const wantsStrengthConditioning = goalWantsStrengthCardioFinisher(enrichGoal);
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]!;
    const s = sessions[i]!;
    const isCardioOrRecovery = spec.type === 'cardio' || spec.type === 'recovery';
    const duration = Math.round((spec.durationMin + spec.durationMax) / 2);
    const { minExercises, promptRange } = exerciseTargetsForSession(
      duration,
      effectiveDetailLevel,
      isCardioOrRecovery,
    );
    const maxEx = maxExercisesFromPromptRange(promptRange);
    const rows = (s.exercises ?? []).filter((e) => String(e.name ?? '').trim());
    const count = rows.length;
    if (spec.type !== 'strength') continue;
    const lastId = rows[count - 1]?.exerciseId?.trim();
    const lastIsLibraryCardio =
      !!lastId && byId.get(lastId)?.primaryMuscleGroup === 'Cardio';
    const strengthSlots =
      wantsStrengthConditioning && lastIsLibraryCardio ? count - 1 : count;
    if (count < minExercises) {
      slices.push(0);
      findings.push(
        `Volume: "${spec.title ?? spec.weekday}" below target (${count} < ${minExercises} for ~${duration} min ${effectiveDetailLevel}).`,
      );
    } else if (strengthSlots > maxEx) {
      slices.push(0.12);
      const slotLabel =
        wantsStrengthConditioning && lastIsLibraryCardio
          ? `${strengthSlots} strength + 1 cardio finisher (${count} total)`
          : `${count}`;
      findings.push(
        `Volume: "${spec.title ?? spec.weekday}" above soft cap (${slotLabel} > ${maxEx} strength slots for ~${duration} min).`,
      );
    } else {
      slices.push(1);
    }
  }
  if (!slices.length) return 12;
  const avg = slices.reduce((a, b) => a + b, 0) / slices.length;
  return Math.round(avg * 12);
}

function scoreMovementDiversity(
  specs: GenerateSessionsDto['sessions'],
  sessions: GeneratedSession[],
  byId: Map<string, EvalCatalogExercise>,
  findings: string[],
  skip: boolean,
): number {
  if (skip) return 8;
  const keys = ['Push', 'Pull', 'Squat', 'Hinge', 'Lunge'] as const;
  if (specs.length <= 2) {
    let best = 0;
    for (let i = 0; i < specs.length; i++) {
      if (specs[i]!.type !== 'strength') continue;
      const set = new Set<string>();
      for (const e of sessions[i]?.exercises ?? []) {
        const id = e.exerciseId?.trim();
        if (!id) continue;
        for (const p of byId.get(id)?.movementPatterns ?? []) set.add(String(p).trim());
      }
      const n = keys.filter((k) => set.has(k)).length;
      best = Math.max(best, n);
    }
    const score = best >= 4 ? 8 : best === 3 ? 5 : best === 2 ? 2 : best === 1 ? 0 : 0;
    if (best < 4) {
      findings.push(
        `Movement diversity on short chunk: ${best}/5 key patterns; pro programming usually hits ≥4 when the session allows.`,
      );
    }
    return score;
  }
  const union = new Set<string>();
  for (let i = 0; i < specs.length; i++) {
    if (specs[i]!.type !== 'strength') continue;
    for (const e of sessions[i]?.exercises ?? []) {
      const id = e.exerciseId?.trim();
      if (!id) continue;
      for (const p of byId.get(id)?.movementPatterns ?? []) union.add(String(p).trim());
    }
  }
  const n = keys.filter((k) => union.has(k)).length;
  const score = n >= 4 ? 8 : n === 3 ? 5 : n === 2 ? 2 : n === 1 ? 0 : 0;
  if (n < 4) {
    findings.push(
      `Movement diversity across chunk: ${n}/5 key patterns (${keys.filter((k) => union.has(k)).join(', ') || 'none'}); pro weeks usually cover ≥4.`,
    );
  }
  return score;
}

function scoreLibraryMetadata(
  sessions: GeneratedSession[],
  byId: Map<string, EvalCatalogExercise>,
  findings: string[],
  skip: boolean,
): number {
  if (skip) return 8;
  const rows = sessions.flatMap((s) => s.exercises ?? []);
  const withId = rows.filter((e) => e.exerciseId?.trim());
  if (!withId.length) return 0;
  let ok = 0;
  for (const e of withId) {
    const row = byId.get(e.exerciseId!.trim());
    if (
      row &&
      ((row.movementPatterns?.length ?? 0) > 0 ||
        !!(row.primaryMuscleGroup && row.primaryMuscleGroup.trim()))
    ) {
      ok++;
    }
  }
  const ratio = ok / withId.length;
  if (ratio < 0.9) {
    findings.push(
      `Library metadata thin: ${Math.round(ratio * 100)}% of slotted exercises resolve to catalog fields (target ≥90%).`,
    );
  }
  return Math.round(ratio * 8);
}

function scoreCoachingSurface(sessions: GeneratedSession[], findings: string[], skip: boolean): number {
  if (skip) return 10;
  if (!sessions.length) return 0;
  const anyCoachCopy = sessions.some(
    (s) => !!s.warmUp?.trim() || !!s.reasoning?.trim() || !!s.coolDown?.trim(),
  );
  if (!anyCoachCopy) {
    findings.push('No warm-up / rationale / cool-down text on sessions (coaching surface empty).');
    return 4;
  }
  let points = 0;
  for (const s of sessions) {
    const w = (s.warmUp ?? '').trim();
    const r = (s.reasoning ?? '').trim();
    const c = (s.coolDown ?? '').trim();
    const hasWarm = w.length > 0;
    const hasWhy = r.length > 0;
    const hasCool = c.length > 0;
    const n = [hasWarm, hasWhy, hasCool].filter(Boolean).length;
    if (n === 3) {
      const minLens = Math.min(w.length, r.length, c.length);
      points += minLens >= 28 ? 1 : 0.72;
      if (minLens < 28) {
        findings.push(
          'Coaching surface: warm-up / rationale / cool-down should each be substantive (≥~28 chars each) for a pro-ready session card.',
        );
      }
    } else if (n === 2) points += 0.48;
    else if (n === 1) points += 0.22;
    else points += 0;
  }
  const avg = points / sessions.length;
  if (avg < 0.82) {
    findings.push('Coaching surface incomplete (missing warm-up / why / cool-down on some sessions).');
  }
  return Math.round(avg * 10);
}

function inversionCountVsIdealOrder(idealPerm: number[]): number {
  const n = idealPerm.length;
  const posInIdeal = new Array<number>(n);
  for (let k = 0; k < n; k++) {
    posInIdeal[idealPerm[k]!] = k;
  }
  let invs = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (posInIdeal[i]! > posInIdeal[j]!) invs++;
    }
  }
  return invs;
}

function scoreWorkoutOrder(
  specs: GenerateSessionsDto['sessions'],
  sessions: GeneratedSession[],
  byId: Map<string, EvalCatalogExercise>,
  findings: string[],
  skip: boolean,
): number {
  if (skip) return 8;
  const qualities: number[] = [];
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]!;
    const s = sessions[i]!;
    if (spec.type !== 'strength') continue;
    const ex = s.exercises ?? [];
    if (ex.length < 2) continue;
    const cov = sessionMetaCoverage(s, byId);
    if (cov < 0.55) {
      findings.push(
        `Workout order check skipped for "${spec.title ?? spec.weekday}" (low catalog metadata coverage ${Math.round(cov * 100)}%).`,
      );
      continue;
    }
    const findMeta = (id: string) => byId.get(id.trim());
    const ideal = idealStrengthExercisePermutation(ex, findMeta, spec.title);
    const maxInv = (ex.length * (ex.length - 1)) / 2;
    const invs = inversionCountVsIdealOrder(ideal);
    const q = maxInv > 0 ? 1 - invs / maxInv : 1;
    qualities.push(q);
    if (invs > 0) {
      findings.push(
        `"${spec.title ?? spec.weekday}" exercise order deviates from ideal compound-first / cardio-last ranking (${invs} pairwise inversion${invs === 1 ? '' : 's'} of ${maxInv} max).`,
      );
    }
  }
  if (!qualities.length) return 8;
  const avg = qualities.reduce((a, b) => a + b, 0) / qualities.length;
  return Math.round(avg * 8);
}

/** Cues a serious coach would expect in session copy or exercise notes (case-insensitive). */
const PRO_COACHING_SIGNAL_RE =
  /\b(rpe|rate of perceived|tempo|brace|breath|range of motion|\brom\b|progress|overload|technique|submax|density|sustainable|mobility|working weight|effort|quality|stretch|recovery|dynamic|ramp|steady-state|finisher|pace|joint|form|submaximal)\b/gi;

function countProCoachingSignals(text: string): number {
  const re = new RegExp(PRO_COACHING_SIGNAL_RE.source, 'gi');
  let hits = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    hits++;
    if (hits > 16) break;
  }
  return hits;
}

function scoreCoachingProDepth(
  sessions: GeneratedSession[],
  findings: string[],
  skip: boolean,
): number {
  if (skip) return 8;
  const scores: number[] = [];
  for (const s of sessions) {
    const parts: string[] = [];
    if (s.warmUp?.trim()) parts.push(s.warmUp.trim());
    if (s.reasoning?.trim()) parts.push(s.reasoning.trim());
    if (s.coolDown?.trim()) parts.push(s.coolDown.trim());
    for (const e of s.exercises ?? []) {
      if (e.notes?.trim()) parts.push(e.notes.trim());
    }
    const blob = parts.join('\n').trim();
    if (!blob.length) {
      scores.push(0.12);
      continue;
    }
    const lenScore = Math.min(1, blob.length / 240);
    const hits = countProCoachingSignals(blob);
    const cueScore = Math.min(1, hits / 4);
    const q = 0.42 * lenScore + 0.58 * cueScore;
    scores.push(q);
    if (blob.length < 150 || hits < 3) {
      findings.push(
        `Pro coaching depth light on "${s.name ?? 'session'}": add concrete training guidance (RPE/tempo, ramp strategy, recovery, joint-friendly sequencing).`,
      );
    }
  }
  if (!scores.length) return 8;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(avg * 8);
}

function scorePrescriptionHygiene(
  specs: GenerateSessionsDto['sessions'],
  sessions: GeneratedSession[],
  byId: Map<string, EvalCatalogExercise>,
  findings: string[],
  skip: boolean,
): number {
  if (skip) return 8;
  const slices: number[] = [];
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]!;
    const s = sessions[i]!;
    if (spec.type !== 'strength') continue;
    let bad = 0;
    let n = 0;
    for (const e of s.exercises ?? []) {
      if (!String(e.name ?? '').trim()) continue;
      n++;
      const id = e.exerciseId?.trim();
      const meta = id ? byId.get(id) : undefined;
      const isTimeCardio =
        meta?.primaryMuscleGroup === 'Cardio' &&
        (e.prescriptionType === 'time' || meta?.prescriptionType === 'time');
      const sets = Number(e.sets);
      const reps = Number(e.reps);
      let rowOk = Number.isFinite(sets) && Number.isFinite(reps) && sets >= 1 && reps >= 1;
      if (rowOk) {
        if (sets > 12 || sets < 1) rowOk = false;
        if (!isTimeCardio) {
          if (reps > 40 || reps < 2) rowOk = false;
          if (sets * reps > 200) rowOk = false;
        } else if (reps > 50) rowOk = false;
      }
      if (!rowOk) {
        bad++;
        findings.push(
          `Prescription hygiene: "${e.name}" on "${spec.title ?? spec.weekday}" (sets=${e.sets}, reps=${e.reps}) is outside typical coached ranges.`,
        );
      }
    }
    if (!n) continue;
    slices.push(1 - bad / n);
  }
  if (!slices.length) return 8;
  const avg = slices.reduce((a, b) => a + b, 0) / slices.length;
  return Math.round(avg * 8);
}

function scoreFatigueStacking(
  specs: GenerateSessionsDto['sessions'],
  sessions: GeneratedSession[],
  byId: Map<string, EvalCatalogExercise>,
  findings: string[],
  skip: boolean,
): number {
  if (skip) return 6;
  const scores: number[] = [];
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]!;
    const s = sessions[i]!;
    if (spec.type !== 'strength') continue;
    const primaries: string[] = [];
    for (const e of s.exercises ?? []) {
      if (!String(e.name ?? '').trim()) continue;
      const id = e.exerciseId?.trim();
      const mg = id ? byId.get(id)?.primaryMuscleGroup?.trim() : '';
      if (!mg || mg === 'Cardio') continue;
      primaries.push(mg.toLowerCase());
    }
    if (primaries.length < 3) {
      scores.push(1);
      continue;
    }
    let maxRun = 1;
    let run = 1;
    for (let j = 1; j < primaries.length; j++) {
      if (primaries[j] === primaries[j - 1]!) {
        run++;
        maxRun = Math.max(maxRun, run);
      } else {
        run = 1;
      }
    }
    let q = 1;
    if (maxRun >= 5) q = 0;
    else if (maxRun === 4) q = 0.32;
    else if (maxRun === 3) q = 0.62;
    scores.push(q);
    if (maxRun >= 4) {
      findings.push(
        `"${spec.title ?? spec.weekday}" stacks ${maxRun} consecutive lifts targeting the same primary muscle — rotate patterns or insert an antagonist for pro-quality recovery.`,
      );
    }
  }
  if (!scores.length) return 6;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(avg * 6);
}

function checkStrengthStimulusAdequacy(
  specs: GenerateSessionsDto['sessions'],
  sessions: GeneratedSession[],
  byId: Map<string, EvalCatalogExercise>,
  findings: string[],
): void {
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]!;
    const s = sessions[i]!;
    if (spec.type !== 'strength') continue;
    const rows = (s.exercises ?? []).filter((e) => String(e.name ?? '').trim());
    if (!rows.length) continue;
    const duration = Math.round((spec.durationMin + spec.durationMax) / 2);
    let totalSets = 0;
    let compoundCount = 0;
    for (const e of rows) {
      const sets = Number(e.sets);
      if (Number.isFinite(sets) && sets > 0) totalSets += sets;
      const id = e.exerciseId?.trim();
      if (!id) continue;
      const patterns = byId.get(id)?.movementPatterns ?? [];
      if (
        patterns.includes('Push') ||
        patterns.includes('Pull') ||
        patterns.includes('Squat') ||
        patterns.includes('Hinge')
      ) {
        compoundCount++;
      }
    }
    const minSets = duration >= 45 ? 14 : duration >= 35 ? 10 : 8;
    if (totalSets < minSets || compoundCount < 2) {
      findings.push(
        `Stimulus adequacy: "${spec.title ?? spec.weekday}" looks light for ~${duration} min (${totalSets} total sets, ${compoundCount} compound slots).`,
      );
    }
  }
}

function scoreConditioning(
  specs: GenerateSessionsDto['sessions'],
  sessions: GeneratedSession[],
  byId: Map<string, EvalCatalogExercise>,
  enrichGoal: string | undefined,
  findings: string[],
  skip: boolean,
): number {
  if (skip) return 10;
  const goal = (enrichGoal ?? '').toLowerCase();
  const wantsHybrid =
    goal.includes('hybrid') ||
    goal.includes('balanced') ||
    goal.includes('endurance') ||
    goal.includes('fat') ||
    goal.includes('conditioning');
  if (!wantsHybrid) return 10;
  const strengthIdx = specs
    .map((s, i) => [s, i] as const)
    .filter(([s]) => s.type === 'strength')
    .map(([, i]) => i);
  if (!strengthIdx.length) return 10;
  const cardioDays = strengthIdx.filter((i) => hasCardioExercise(sessions[i]!, byId)).length;
  const ratio = cardioDays / strengthIdx.length;
  const score = Math.round(ratio * 10);
  if (ratio < 1) {
    findings.push(
      `Conditioning coverage: ${cardioDays}/${strengthIdx.length} strength sessions include a Cardio library row.`,
    );
  }
  return score;
}

function scoreStructural(
  v: ChunkValidationResult,
  findings: string[],
): number {
  let structural = 28;
  structural -= issueCount(v, 'duplicate_exercise_id_in_session') * 25;
  structural -= issueCount(v, 'duplicate_exercise_id_across_chunk') * 20;
  structural -= Math.min(16, v.duplicateExerciseIds.length * 5);
  structural -= issueCount(v, 'below_min_exercises') * 20;
  structural -= issueCount(v, 'primary_lower_pattern_on_upper_focus') * 18;
  structural -= Math.min(12, v.patternClashExerciseIds.length * 6);
  if (!v.ok) {
    findings.push(`Validator issues: ${v.issues.join(', ')}`);
  }
  return clamp(structural, 0, 28);
}

export function scoreGeneratedChunk(args: {
  specs: GenerateSessionsDto['sessions'];
  sessions: GeneratedSession[];
  catalog: EvalCatalogExercise[];
  validation: ChunkValidationResult;
  effectiveDetailLevel: 'simple' | 'detailed';
  enrichGoal?: string;
  evalScoring?: EvalScoringOptions;
}): EvalScoreResult {
  const findings: string[] = [];
  const opt = args.evalScoring ?? {};
  const byId = new Map(args.catalog.map((x) => [x.id, x]));

  const structural = scoreStructural(args.validation, findings);
  const balance = scoreBalance(
    args.specs,
    args.sessions,
    byId,
    findings,
    !!opt.skipBalance,
  );
  const volumeFit = scoreVolumeFit(
    args.specs,
    args.sessions,
    args.effectiveDetailLevel,
    findings,
    !!opt.skipVolume,
    args.enrichGoal,
    byId,
  );
  const movementDiversity = scoreMovementDiversity(
    args.specs,
    args.sessions,
    byId,
    findings,
    !!opt.skipDiversity,
  );
  const conditioning = scoreConditioning(
    args.specs,
    args.sessions,
    byId,
    args.enrichGoal,
    findings,
    !!opt.skipConditioning,
  );
  const coachingSurface = scoreCoachingSurface(args.sessions, findings, !!opt.skipCoaching);
  const libraryMetadata = scoreLibraryMetadata(args.sessions, byId, findings, !!opt.skipMetadata);
  const workoutOrder = scoreWorkoutOrder(
    args.specs,
    args.sessions,
    byId,
    findings,
    !!opt.skipWorkoutOrder,
  );
  const coachingProDepth = scoreCoachingProDepth(
    args.sessions,
    findings,
    !!opt.skipCoaching,
  );
  const prescriptionHygiene = scorePrescriptionHygiene(
    args.specs,
    args.sessions,
    byId,
    findings,
    !!opt.skipPrescription,
  );
  const fatigueStacking = scoreFatigueStacking(
    args.specs,
    args.sessions,
    byId,
    findings,
    !!opt.skipFatigueStacking,
  );
  checkStrengthStimulusAdequacy(args.specs, args.sessions, byId, findings);
  if (coachingProDepth < 6) {
    findings.push(
      `Coaching floor: pro coaching depth is ${coachingProDepth}/8; strengthen cues (effort target, progression, recovery intent).`,
    );
  }

  let total =
    structural +
    balance +
    volumeFit +
    movementDiversity +
    conditioning +
    coachingSurface +
    libraryMetadata +
    workoutOrder +
    coachingProDepth +
    prescriptionHygiene +
    fatigueStacking;

  if (!args.validation.ok) {
    const cap = Math.round(EVAL_SCORE_MAX_TOTAL * 0.45);
    if (total > cap) {
      findings.push(`Hard cap: total score clamped to ${cap} while validator reports issues.`);
      total = cap;
    }
  }

  return {
    breakdown: {
      structural,
      balance,
      volumeFit,
      movementDiversity,
      conditioning,
      coachingSurface,
      libraryMetadata,
      workoutOrder,
      coachingProDepth,
      prescriptionHygiene,
      fatigueStacking,
      total,
    },
    findings,
  };
}
