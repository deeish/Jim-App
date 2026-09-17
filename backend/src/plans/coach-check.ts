import { ISOLATION_NAME, type GeneratedSession } from './session-enrichment';
import { normalizeDifficulty, normalizeGoal } from '../data/set-rep-schemes';
import { TECHNICAL_LIFT_NAME } from '../data/technical-lifts';

/**
 * The coach check: a deterministic read of one generated week, the way a
 * strength coach would count it. It measures what the validators and the
 * eval scorer did not (2026-09-16 review): sets per muscle per week with
 * fractional credit for secondary movers, how many sessions expose each
 * muscle, hinge and press stacking inside a session, rest that does not fit
 * the movement's role, lifts a beginner should not be opening with, and
 * whether rows carry an effort or load target at all.
 *
 * Pure and catalog-agnostic: the caller supplies `findMeta`. Used by the
 * eval scorer (as points) and by `generateSessions` (returned to the client
 * and logged), so the number the eval optimises is the number the user sees.
 */

export type CoachMeta = {
  primaryMuscleGroup?: string;
  secondaryMuscleGroups?: string[];
  movementPatterns?: string[];
  type?: string;
};

export type CoachFinding = {
  code:
    | 'volume_low'
    | 'volume_high'
    | 'muscle_untrained'
    | 'exposure_low'
    | 'stacking'
    | 'rest_main_short'
    | 'rest_accessory_long'
    | 'skill_gate'
    | 'no_effort_target';
  severity: 'info' | 'warn' | 'high';
  /** Plain words, written for the user, not the pipeline. */
  message: string;
  weekday?: string;
};

export type MuscleVolume = {
  /** Sets where the muscle is the primary mover. */
  direct: number;
  /** direct + 0.5 × sets where it is a secondary mover (Pelland 2025 counting). */
  weighted: number;
  /** Sessions in the week with at least one direct set. */
  exposures: number;
};

export type CoachCheckReport = {
  weekIndex: number;
  sessionCount: number;
  volumeByMuscle: Record<string, MuscleVolume>;
  patternSets: Record<'Push' | 'Pull' | 'Squat' | 'Hinge', number>;
  /** 0..1 share of strength rows carrying a load, an RIR target, or a hold duration. */
  effortCoverage: number;
  findings: CoachFinding[];
  /** Sub-scores, each 0..max, for the eval scorer. */
  scores: CoachCheckScores;
  /** Weekly sets per muscle the goal and level call for (what the volume findings measure against). */
  band: { min: number; max: number };
};

export type CoachCheckScores = {
  weeklyVolume: number;
  muscleExposure: number;
  patternStacking: number;
  restByRole: number;
  skillGate: number;
  effortTarget: number;
};

export const COACH_CHECK_MAX: Record<keyof CoachCheckScores, number> = {
  weeklyVolume: 8,
  muscleExposure: 4,
  patternStacking: 4,
  restByRole: 4,
  skillGate: 4,
  effortTarget: 4,
};

export const COACH_CHECK_MAX_TOTAL = Object.values(COACH_CHECK_MAX).reduce(
  (a, b) => a + b,
  0,
);

/** The groups a week is expected to cover when it trains the whole body. */
const MAIN_GROUPS = ['Chest', 'Back', 'Legs', 'Shoulders'] as const;
const COUNTED_GROUPS = [
  'Chest',
  'Back',
  'Legs',
  'Shoulders',
  'Arms',
  'Core',
] as const;

/**
 * Weekly weighted-set bands per main muscle group by goal and level. Floors
 * follow the minimum-effective-volume literature (about 4 to 6 sets for a
 * big muscle at the least; ACSM 2026 puts the typical hypertrophy target near
 * 10); ceilings follow the recoverable-volume landmarks (high teens to mid
 * twenties). Strength and endurance goals train muscles through fewer, heavier
 * or sport-supporting sets, so their floors sit lower.
 */
export function weeklyVolumeBand(
  goal: string | undefined,
  difficulty: string | undefined,
): { min: number; max: number } {
  const g = normalizeGoal(goal);
  const d = normalizeDifficulty(difficulty);
  const base =
    d === 'beginner'
      ? { min: 6, max: 18 }
      : d === 'advanced'
        ? { min: 10, max: 26 }
        : { min: 8, max: 22 };
  if (g === 'strength')
    return { min: Math.max(4, base.min - 2), max: base.max };
  if (g === 'endurance')
    return { min: Math.max(4, base.min - 3), max: base.max - 4 };
  return base;
}

const SKILL_GATED_NAME = TECHNICAL_LIFT_NAME;

function isCardio(
  meta: CoachMeta | undefined,
  row: { primaryMuscleGroup?: string },
): boolean {
  return (
    (meta?.primaryMuscleGroup ?? '').toLowerCase() === 'cardio' ||
    (row.primaryMuscleGroup ?? '').toLowerCase() === 'cardio'
  );
}

export type CoachRole = 'main' | 'compound' | 'isolation' | 'core' | 'hold';
type Role = CoachRole;

/** The role a row plays in its session (first compound = main). Shared with the volume allocator. */
export function coachRoleOf(
  meta: CoachMeta | undefined,
  row: { name?: string; prescriptionType?: string },
  mainAssigned: boolean,
): CoachRole {
  return roleOf(meta, row, mainAssigned);
}

/** Cardio rows carry no strength sets. */
export function isCardioRowMeta(
  meta: CoachMeta | undefined,
  row: { primaryMuscleGroup?: string },
): boolean {
  return isCardio(meta, row);
}

function roleOf(
  meta: CoachMeta | undefined,
  row: { name?: string; prescriptionType?: string },
  mainAssigned: boolean,
): Role {
  if (row.prescriptionType === 'time') return 'hold';
  if ((meta?.primaryMuscleGroup ?? '').toLowerCase() === 'core') return 'core';
  if (ISOLATION_NAME.test(row.name ?? '')) return 'isolation';
  const t = (meta?.type ?? '').toLowerCase();
  if (t === 'isolation') return 'isolation';
  if (t === 'compound') return mainAssigned ? 'compound' : 'main';
  const patterns = meta?.movementPatterns ?? [];
  if (['Squat', 'Hinge', 'Push', 'Pull'].some((p) => patterns.includes(p))) {
    return mainAssigned ? 'compound' : 'main';
  }
  return 'isolation';
}

export function coachCheckWeek(args: {
  weekIndex: number;
  /** The week's sessions with their specs, in weekday order. */
  sessions: Array<{
    session: GeneratedSession;
    spec: {
      type: 'strength' | 'cardio' | 'recovery';
      weekday: string;
      title?: string;
    };
  }>;
  findMeta: (id: string) => CoachMeta | undefined;
  prefs: { goal?: string; difficulty?: string };
}): CoachCheckReport {
  const findings: CoachFinding[] = [];
  const volume: Record<string, MuscleVolume> = {};
  for (const g of COUNTED_GROUPS)
    volume[g] = { direct: 0, weighted: 0, exposures: 0 };
  const patternSets = { Push: 0, Pull: 0, Squat: 0, Hinge: 0 };
  const difficulty = normalizeDifficulty(args.prefs.difficulty);
  const strengthDays = args.sessions.filter((s) => s.spec.type === 'strength');

  let strengthRows = 0;
  let rowsWithTarget = 0;
  let restIssues = 0;
  let stackingSessions = 0;
  let skillHits = 0;

  for (const { session, spec } of strengthDays) {
    const touched = new Set<string>();
    const patternRows = { Push: 0, Pull: 0, Squat: 0, Hinge: 0 };
    let mainAssigned = false;
    for (const row of session.exercises ?? []) {
      const id = row.exerciseId?.trim();
      const meta = id ? args.findMeta(id) : undefined;
      if (isCardio(meta, row)) continue;
      const sets = Math.max(0, Math.round(row.sets ?? 0));
      if (sets === 0) continue;
      strengthRows += 1;
      // A rep range alone is not an effort target: every row has one since
      // enrichment re-stamps it. A row is "targeted" when it carries a load or
      // a reps-in-reserve target (Tier 2 of the 2026-09-16 plan adds both), or
      // is a timed hold. Expect this to read 0 until then; that is the point.
      const targetRir = (row as { targetRir?: number }).targetRir;
      if (
        (typeof row.weight === 'number' && row.weight > 0) ||
        (typeof targetRir === 'number' && targetRir >= 0) ||
        row.prescriptionType === 'time'
      ) {
        rowsWithTarget += 1;
      }

      const primary = meta?.primaryMuscleGroup;
      if (primary && volume[primary]) {
        volume[primary].direct += sets;
        volume[primary].weighted += sets;
        touched.add(primary);
      }
      for (const sec of meta?.secondaryMuscleGroups ?? []) {
        if (volume[sec] && sec !== primary) volume[sec].weighted += sets * 0.5;
      }
      const role = roleOf(meta, row, mainAssigned);
      if (role === 'main') mainAssigned = true;
      for (const p of meta?.movementPatterns ?? []) {
        if (!(p in patternRows)) continue;
        patternSets[p as keyof typeof patternSets] += sets;
        // Stacking counts hinges of any kind (three hinges is three hinges),
        // but for presses only the compounds: bench, press and a triceps
        // pushdown is a normal upper day, not a stack.
        if (
          p === 'Hinge' ||
          (role !== 'isolation' && role !== 'core' && role !== 'hold')
        ) {
          patternRows[p as keyof typeof patternRows] += 1;
        }
      }
      const rest = row.restSeconds;
      if (typeof rest === 'number' && rest > 0) {
        if (role === 'main' && rest < 120) {
          restIssues += 1;
          findings.push({
            code: 'rest_main_short',
            severity: 'warn',
            weekday: spec.weekday,
            message: `${row.name ?? 'The main lift'} rests only ${rest} seconds; a heavy first lift wants 2 to 4 minutes.`,
          });
        } else if (
          (role === 'isolation' || role === 'core' || role === 'hold') &&
          rest > 90
        ) {
          restIssues += 1;
          findings.push({
            code: 'rest_accessory_long',
            severity: 'info',
            weekday: spec.weekday,
            message: `${row.name ?? 'An accessory'} rests ${rest} seconds; 60 to 90 is enough for isolation and core work.`,
          });
        }
      }

      if (difficulty === 'beginner' && SKILL_GATED_NAME.test(row.name ?? '')) {
        skillHits += 1;
        findings.push({
          code: 'skill_gate',
          severity: 'high',
          weekday: spec.weekday,
          message: `${row.name} is a technical lift; a beginner's plan should teach the basics first.`,
        });
      }
    }
    for (const g of touched) volume[g]!.exposures += 1;
    const stacked = (['Hinge', 'Push'] as const).filter(
      (p) => patternRows[p] > 2,
    );
    if (stacked.length > 0) {
      stackingSessions += 1;
      findings.push({
        code: 'stacking',
        severity: 'warn',
        weekday: spec.weekday,
        message: `${spec.title ?? spec.weekday} stacks ${stacked.map((p) => `${patternRows[p]} ${p.toLowerCase()} movements`).join(' and ')}; two is the most one session needs.`,
      });
    }
  }

  // Weekly volume against the band, for the groups this week actually trains
  // plus the big groups a whole-body week is expected to cover.
  const band = weeklyVolumeBand(args.prefs.goal, args.prefs.difficulty);
  const expected = new Set<string>(MAIN_GROUPS);
  for (const g of COUNTED_GROUPS) if (volume[g]!.direct > 0) expected.add(g);
  let inBand = 0;
  for (const g of expected) {
    const v = volume[g]!;
    if (v.direct === 0) {
      findings.push({
        code: 'muscle_untrained',
        severity: strengthDays.length >= 3 ? 'warn' : 'info',
        message: `${g} gets no direct work this week.`,
      });
      continue;
    }
    const groupMin =
      g === 'Arms' || g === 'Core' ? Math.round(band.min / 2) : band.min;
    if (v.weighted < groupMin) {
      findings.push({
        code: 'volume_low',
        severity: 'warn',
        message: `${g}: ${fmt(v.weighted)} weekly sets, under the ${groupMin} most ${difficulty} lifters need to progress.`,
      });
    } else if (v.weighted > band.max && g !== 'Core') {
      // Core collects half-credit from every squat, hinge and carry, so it
      // reads high on any lower-body week; direct core work is rarely a
      // recovery problem, so it is never flagged as over the band.
      findings.push({
        code: 'volume_high',
        severity: 'warn',
        message: `${g}: ${fmt(v.weighted)} weekly sets, above the ${band.max} most ${difficulty} lifters recover from.`,
      });
    } else {
      inBand += 1;
    }
  }

  // Exposure: with three or more lifting days, each big muscle should be hit twice.
  let exposureOk = 0;
  let exposureChecked = 0;
  if (strengthDays.length >= 3) {
    for (const g of MAIN_GROUPS) {
      const v = volume[g]!;
      if (v.direct === 0) continue;
      exposureChecked += 1;
      if (v.exposures >= 2) exposureOk += 1;
      else
        findings.push({
          code: 'exposure_low',
          severity: 'info',
          message: `${g} is trained on one day only; twice a week grows and holds strength better.`,
        });
    }
  }

  const effortCoverage = strengthRows > 0 ? rowsWithTarget / strengthRows : 1;
  if (strengthRows > 0 && effortCoverage < 1) {
    findings.push({
      code: 'no_effort_target',
      severity: 'info',
      message: `${strengthRows - rowsWithTarget} of ${strengthRows} lifts have no rep range, load or effort target.`,
    });
  }

  const scores: CoachCheckScores = {
    weeklyVolume:
      expected.size === 0
        ? COACH_CHECK_MAX.weeklyVolume
        : Math.round((inBand / expected.size) * COACH_CHECK_MAX.weeklyVolume),
    muscleExposure:
      exposureChecked === 0
        ? COACH_CHECK_MAX.muscleExposure
        : Math.round(
            (exposureOk / exposureChecked) * COACH_CHECK_MAX.muscleExposure,
          ),
    patternStacking: Math.max(
      0,
      COACH_CHECK_MAX.patternStacking - 2 * stackingSessions,
    ),
    restByRole: Math.max(0, COACH_CHECK_MAX.restByRole - restIssues),
    skillGate: skillHits > 0 ? 0 : COACH_CHECK_MAX.skillGate,
    effortTarget: Math.round(effortCoverage * COACH_CHECK_MAX.effortTarget),
  };

  return {
    weekIndex: args.weekIndex,
    sessionCount: args.sessions.length,
    volumeByMuscle: volume,
    patternSets,
    effortCoverage,
    findings,
    scores,
    band,
  };
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Group a flat session list by weekIndex, in first-appearance order. */
export function coachCheckProgram(args: {
  sessions: GeneratedSession[];
  specs: Array<{
    type: 'strength' | 'cardio' | 'recovery';
    weekday: string;
    title?: string;
    weekIndex: number;
  }>;
  findMeta: (id: string) => CoachMeta | undefined;
  prefs: { goal?: string; difficulty?: string };
}): CoachCheckReport[] {
  const byWeek = new Map<
    number,
    CoachCheckReport['sessionCount'] extends number
      ? Array<{ session: GeneratedSession; spec: (typeof args.specs)[number] }>
      : never
  >();
  for (let i = 0; i < args.specs.length; i++) {
    const spec = args.specs[i];
    const session = args.sessions[i];
    if (!spec || !session) continue;
    const list = byWeek.get(spec.weekIndex) ?? [];
    list.push({ session, spec });
    byWeek.set(spec.weekIndex, list);
  }
  return [...byWeek.entries()].map(([weekIndex, sessions]) =>
    coachCheckWeek({
      weekIndex,
      sessions,
      findMeta: args.findMeta,
      prefs: args.prefs,
    }),
  );
}
