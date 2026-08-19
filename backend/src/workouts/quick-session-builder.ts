/**
 * Quick Workout session builder (2026-08-18).
 *
 * Deterministic, catalog-driven session assembly for an ARBITRARY set of
 * target muscles — the engine behind "I'm at the gym, give me a Back & Bis
 * day right now". Deliberately NOT the LLM path: the generation pipeline's
 * focus keys collapse "Back & Biceps" to its first muscle
 * (normalizeFocusToKey / getCandidatesForGenerator both split on `& , +`),
 * and a quick session wants instant, explainable, rate-limit-free picks.
 *
 * The quality machinery is shared with generation, not reinvented:
 *  - tier discipline via EXERCISE_TIERS (S > A > B; C only when a pool runs
 *    dry, D never) with common-exercise rank as the within-tier tiebreak;
 *  - role-aware set/rep schemes via getRoleAwareScheme (goal × difficulty ×
 *    role — the same bands plans prescribe);
 *  - joint-demand exclusion mirroring pickReplacement's semantics (an avoid
 *    phrase naming a joint excludes rows tagged with that joint);
 *  - equipment filtering on PRIMARY equipment (a cable row with a band
 *    alternative must not reach a home session under its cable name).
 *
 * Selection logic per session:
 *  - exercise budget scales with how many muscles were picked, with LARGE
 *    muscles (chest/back/quads/hams/glutes/shoulders) absorbing the extra
 *    slots ahead of SMALL ones (arms/calves/core);
 *  - each muscle leads with its best-tier COMPOUND when one exists, then
 *    fills with accessories that avoid repeating a movement pattern or
 *    equipment already used for that muscle;
 *  - the finished session orders large-muscle compounds first, then
 *    accessories/isolation, Core near the end, Cardio always last;
 *  - a `seed` rotates picks WITHIN a tier band so today's Pull day and next
 *    week's differ without ever trading down in quality.
 *
 * Pure module — no Nest deps — so the spec can hammer it against the real
 * transformed catalog.
 */

import type { TransformedExercise } from '../data/exercise-mappings';
import { equipmentSatisfies } from '../data/exercise-mappings';
import { EXERCISE_TIERS, type ExerciseTier } from '../data/exercise-tiers';
import { getJointDemands, type JointId } from '../data/exercise-joint-demands';
import { getCommonExerciseRank } from '../data/common-exercise-ids';
import { getRoleAwareScheme, type ExerciseRole } from '../data/set-rep-schemes';

/** The calendar's 12-muscle vocabulary (mirrors the app's palette). */
export const QUICK_MUSCLES = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Quads',
  'Hamstrings',
  'Glutes',
  'Calves',
  'Core',
  'Cardio',
  'Forearms',
] as const;
export type QuickMuscle = (typeof QUICK_MUSCLES)[number];

/** Muscles that earn extra slots and lead the session with compounds. */
const LARGE_MUSCLES = new Set<QuickMuscle>([
  'Chest',
  'Back',
  'Shoulders',
  'Quads',
  'Hamstrings',
  'Glutes',
]);

/**
 * A muscle's SIGNATURE movement patterns — the catalog's patterns are coarse
 * ('Pull', 'Hinge', 'Squat'…), and for most muscles their identity IS a
 * pattern: a Back day should mostly Pull, a Quads day mostly Squat/Lunge.
 * Candidates carrying the signature score a bonus, so a second pulling
 * exercise beats an erector hinge for a Back day's slot 2 — while the hinge
 * still wins a later slot on sub-muscle freshness.
 */
const SIGNATURE_PATTERNS: Partial<Record<QuickMuscle, string[]>> = {
  Chest: ['Push'],
  Back: ['Pull'],
  Shoulders: ['Push'],
  Biceps: ['Pull'],
  Triceps: ['Push'],
  Quads: ['Squat', 'Lunge'],
  Hamstrings: ['Hinge'],
  Glutes: ['Hinge', 'Lunge'],
  Core: ['Core'],
};

export type QuickSessionExercise = {
  exerciseId: string;
  name: string;
  /** The palette muscle this pick serves (drives the day view's chip). */
  muscle: QuickMuscle;
  sets: number;
  reps: number;
  repsMin: number;
  repsMax: number;
  orderIndex: number;
  /** 'time' for cardio bouts (durationSeconds set). */
  prescriptionType?: 'reps' | 'time';
  durationSeconds?: number;
};

export type QuickSession = {
  title: string;
  type: 'strength' | 'cardio';
  durationMinutes: number;
  exercises: QuickSessionExercise[];
};

export type QuickSessionOptions = {
  muscles: QuickMuscle[];
  /** The visible catalog (ExercisesService.search({})) — pre-transformed. */
  candidates: TransformedExercise[];
  goal?: string;
  difficulty?: string;
  /** User's available equipment; empty/undefined = fully equipped gym. */
  equipment?: string[];
  /** Avoid phrases ("bad knee", "no barbell") — joints + name matching. */
  limitations?: string[];
  excludeIds?: string[];
  /** Same seed + same inputs = same session (callers seed by date). */
  seed?: number;
};

// ---------------------------------------------------------------------------
// Muscle matching — MUST mirror the app's display mapping (the store's
// muscleFromCatalog): a pick made "for Quads" has to render a Quads chip.
// ---------------------------------------------------------------------------

function subsHay(e: TransformedExercise): string {
  return (e.subMuscles ?? []).join(' ').toLowerCase();
}

export function muscleMatches(
  e: TransformedExercise,
  muscle: QuickMuscle,
): boolean {
  const group = (e.primaryMuscleGroup ?? '').toLowerCase();
  const subs = subsHay(e);
  switch (muscle) {
    case 'Chest':
      return group === 'chest';
    case 'Back':
      return group === 'back';
    case 'Shoulders':
      return group === 'shoulders';
    case 'Core':
      return group === 'core' || group === 'abs';
    case 'Cardio':
      return group === 'cardio';
    case 'Biceps':
      // EXACTLY the display mapping's else-branch: an arms row shows as
      // Triceps or Forearms first when tagged, Biceps otherwise — so a
      // hammer curl (bicep+forearm subs) belongs to Forearms, not Biceps,
      // and a pick's chip always matches the muscle it was picked for.
      return (
        group === 'arms' &&
        !subs.includes('tricep') &&
        !subs.includes('forearm')
      );
    case 'Triceps':
      return group === 'arms' && subs.includes('tricep');
    case 'Forearms':
      return group === 'arms' && subs.includes('forearm');
    case 'Quads':
      // Legs rows default to Quads on display unless tagged otherwise.
      return (
        group === 'legs' &&
        (subs.includes('quad') ||
          (!subs.includes('hamstring') &&
            !subs.includes('glute') &&
            !subs.includes('calf') &&
            !subs.includes('calves')))
      );
    case 'Hamstrings':
      return group === 'legs' && subs.includes('hamstring');
    case 'Glutes':
      return group === 'legs' && subs.includes('glute');
    case 'Calves':
      return (
        group === 'legs' && (subs.includes('calf') || subs.includes('calves'))
      );
  }
}

// ---------------------------------------------------------------------------
// Limitations — pickReplacement's semantics: a phrase naming a joint excludes
// joint-tagged rows; any phrase also excludes rows whose name contains it.
// "back" alone is deliberately NOT a joint synonym (it's a muscle group).
// ---------------------------------------------------------------------------

const JOINT_SYNONYMS: Array<[RegExp, JointId]> = [
  [/shoulder/, 'shoulder'],
  [/elbow/, 'elbow'],
  [/wrist/, 'wrist'],
  [/lower back|low back|lumbar|spine/, 'lower_back'],
  [/hip/, 'hip'],
  [/knee/, 'knee'],
  [/ankle/, 'ankle'],
];

function jointsFromPhrases(phrases: string[]): Set<JointId> {
  const joints = new Set<JointId>();
  for (const raw of phrases) {
    const p = raw.toLowerCase();
    for (const [re, joint] of JOINT_SYNONYMS) {
      if (re.test(p)) joints.add(joint);
    }
  }
  return joints;
}

function blockedByLimitations(
  e: TransformedExercise,
  phrases: string[],
  avoidJoints: Set<JointId>,
): boolean {
  if (avoidJoints.size > 0) {
    const demands = getJointDemands(e.id);
    if (demands?.some((j) => avoidJoints.has(j))) return true;
  }
  const name = e.name.toLowerCase();
  return phrases.some((p) => {
    const phrase = p.toLowerCase().trim();
    return phrase.length >= 3 && name.includes(phrase);
  });
}

// ---------------------------------------------------------------------------
// Ranking — tier first (S=0 … C=3; D and untiered sink), common-rank next.
// ---------------------------------------------------------------------------

const TIER_ORDER: Record<ExerciseTier, number> = {
  S: 0,
  A: 1,
  B: 2,
  C: 3,
  D: 9,
};

function tierRank(id: string): number {
  const tier = EXERCISE_TIERS[id];
  return tier != null ? TIER_ORDER[tier] : 6; // untiered between C and D
}

function isCompound(e: TransformedExercise): boolean {
  return (e.type ?? '').toLowerCase() === 'compound';
}

function commonRank(id: string): number {
  const rank = getCommonExerciseRank(id);
  return Number.isFinite(rank) ? (rank as number) : 100_000;
}

/** Stable quality sort: tier → compound-before-isolation (when asked) → common rank. */
function rankPool(
  pool: TransformedExercise[],
  compoundsFirst: boolean,
): TransformedExercise[] {
  return [...pool].sort((a, b) => {
    const t = tierRank(a.id) - tierRank(b.id);
    if (t !== 0) return t;
    if (compoundsFirst) {
      const c = Number(isCompound(b)) - Number(isCompound(a));
      if (c !== 0) return c;
    }
    return commonRank(a.id) - commonRank(b.id);
  });
}

// ---------------------------------------------------------------------------
// Allocation — how many exercises each selected muscle gets.
// ---------------------------------------------------------------------------

/** Total-session budget by number of STRENGTH muscles selected. */
export function sessionBudget(muscleCount: number): number {
  if (muscleCount <= 0) return 0;
  if (muscleCount === 1) return 4;
  if (muscleCount === 2) return 5;
  if (muscleCount === 3) return 6;
  if (muscleCount === 4) return 6;
  if (muscleCount <= 6) return 7;
  return Math.min(12, muscleCount); // 7+ muscles: one each, honest monster day
}

/** Per-muscle exercise counts: everyone gets 1, extras go to LARGE muscles
 *  (selection order breaks ties), capped at 3 per muscle (4 for a solo day). */
export function allocate(muscles: QuickMuscle[]): Map<QuickMuscle, number> {
  const counts = new Map<QuickMuscle, number>();
  if (muscles.length === 0) return counts;
  const perMuscleCap = muscles.length === 1 ? 4 : 3;
  let remaining = sessionBudget(muscles.length) - muscles.length;
  for (const m of muscles) counts.set(m, 1);
  const priority = [
    ...muscles.filter((m) => LARGE_MUSCLES.has(m)),
    ...muscles.filter(
      (m) => !LARGE_MUSCLES.has(m) && m !== 'Core' && m !== 'Cardio',
    ),
    ...muscles.filter((m) => m === 'Core'),
  ];
  while (remaining > 0 && priority.length > 0) {
    let gave = false;
    for (const m of priority) {
      if (remaining <= 0) break;
      const cur = counts.get(m) ?? 0;
      if (cur < perMuscleCap) {
        counts.set(m, cur + 1);
        remaining--;
        gave = true;
      }
    }
    if (!gave) break; // every muscle at cap
  }
  return counts;
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

/** Human title: "Back Day", "Back & Biceps", "Chest, Back & Quads", else count. */
export function quickSessionTitle(muscles: QuickMuscle[]): string {
  const strength = muscles.filter((m) => m !== 'Cardio');
  const named = strength.length > 0 ? strength : muscles;
  if (named.length === 1) return `${named[0]} Day`;
  if (named.length === 2) return `${named[0]} & ${named[1]}`;
  if (named.length === 3) return `${named[0]}, ${named[1]} & ${named[2]}`;
  if (named.length >= QUICK_MUSCLES.length - 2) return 'Full Body';
  return `${named[0]}, ${named[1]} +${named.length - 2} more`;
}

export function buildQuickSession(options: QuickSessionOptions): QuickSession {
  const {
    muscles,
    candidates,
    goal,
    difficulty,
    equipment,
    limitations = [],
    excludeIds = [],
    seed = 0,
  } = options;

  const selected = muscles.filter((m): m is QuickMuscle =>
    (QUICK_MUSCLES as readonly string[]).includes(m),
  );
  if (selected.length === 0) {
    throw new Error('Pick at least one muscle');
  }

  const wantsCardio = selected.includes('Cardio');
  const strengthMuscles = selected.filter((m) => m !== 'Cardio');
  const avoidJoints = jointsFromPhrases(limitations);
  const excluded = new Set(excludeIds);

  // One equipment/limitation pass over the whole catalog.
  const eligible = candidates.filter((e) => {
    if (excluded.has(e.id)) return false;
    if (tierRank(e.id) >= TIER_ORDER.D) return false; // never D
    if (blockedByLimitations(e, limitations, avoidJoints)) return false;
    if (equipment?.length) {
      if (!equipmentSatisfies(e.primaryEquipment ?? e.equipment, equipment)) {
        return false;
      }
    }
    return true;
  });

  const counts = allocate(strengthMuscles);
  const usedIds = new Set<string>();
  /** Per-pick record before final ordering. */
  type Pick = {
    exercise: TransformedExercise;
    muscle: QuickMuscle;
    compound: boolean;
  };
  const picks: Pick[] = [];

  for (const muscle of strengthMuscles) {
    const want = counts.get(muscle) ?? 0;
    const pool = rankPool(
      eligible.filter((e) => muscleMatches(e, muscle) && !usedIds.has(e.id)),
      true,
    );
    const usedSubs = new Set<string>();
    const usedPatterns = new Set<string>();
    const usedEquipment = new Set<string>();
    let taken = 0;

    while (taken < want && pool.length > 0) {
      // HARD near-duplicate guard: never two rows a coach would call the
      // same exercise. If only near-dupes remain, a muscle still gets its
      // FIRST pick (never starve a selected muscle) — but a later slot is
      // skipped rather than filled with a photocopy.
      let unpicked = pool.filter(
        (e) =>
          !usedIds.has(e.id) &&
          !picks.some((p) => isNearDuplicate(p.exercise, e)),
      );
      if (unpicked.length === 0) {
        if (taken > 0) break;
        unpicked = pool.filter((e) => !usedIds.has(e.id));
        if (unpicked.length === 0) break;
      }

      let chosen: TransformedExercise;
      if (taken === 0) {
        // The muscle's anchor: best-tier compound, no rotation — a Back day
        // ALWAYS opens with its row/pull-up class anchor.
        chosen = unpicked[0]!;
      } else {
        // Later picks score, not hard-filter: new sub-muscle coverage (lats
        // vs upper vs lower back — the finest signal the catalog has) counts
        // most, the muscle's SIGNATURE pattern is rewarded (a Back day wants
        // more pulling, not pattern novelty), and new equipment breaks ties.
        const signature = SIGNATURE_PATTERNS[muscle] ?? [];
        const freshScore = (e: TransformedExercise): number => {
          let score = 0;
          if ((e.subMuscles ?? []).some((s) => !usedSubs.has(s))) score += 4;
          if ((e.movementPatterns ?? []).some((p) => signature.includes(p)))
            score += 2;
          if (!sharesAny(primaryEquip(e), usedEquipment)) score += 1;
          return score;
        };
        // Near-best contenders (best score and one below) keep a rotation
        // band alive; tierBand then guarantees no quality trade-down.
        const best = Math.max(...unpicked.map(freshScore));
        const contenders = unpicked.filter((e) => freshScore(e) >= best - 1);
        const band = tierBand(contenders);
        chosen = band[(seed + taken) % band.length]!;
      }

      usedIds.add(chosen.id);
      chosen.subMuscles?.forEach((s) => usedSubs.add(s));
      chosen.movementPatterns?.forEach((p) => usedPatterns.add(p));
      primaryEquip(chosen).forEach((eq) => usedEquipment.add(eq));
      picks.push({ exercise: chosen, muscle, compound: isCompound(chosen) });
      taken++;
    }
  }

  // Ordering: large-muscle compounds → small-muscle/other compounds →
  // accessories & isolation (selection order) → Core → Cardio last.
  const orderClass = (p: Pick): number => {
    if (p.muscle === 'Core') return 3;
    if (p.compound && LARGE_MUSCLES.has(p.muscle)) return 0;
    if (p.compound) return 1;
    return 2;
  };
  const muscleOrder = new Map<QuickMuscle, number>(
    strengthMuscles.map((m, i) => [m, i]),
  );
  picks.sort((a, b) => {
    const c = orderClass(a) - orderClass(b);
    if (c !== 0) return c;
    const m =
      (muscleOrder.get(a.muscle) ?? 0) - (muscleOrder.get(b.muscle) ?? 0);
    if (m !== 0) return m;
    return tierRank(a.exercise.id) - tierRank(b.exercise.id);
  });

  // Roles → concrete prescriptions. First compound overall is THE anchor.
  let sawPrimary = false;
  const exercises: QuickSessionExercise[] = picks.map((p, i) => {
    let role: ExerciseRole;
    if (p.muscle === 'Core') role = 'core';
    else if (p.compound && !sawPrimary) {
      role = 'primary_compound';
      sawPrimary = true;
    } else if (p.compound) role = 'secondary_compound';
    else role = 'isolation';
    const scheme = getRoleAwareScheme(goal, difficulty, role);
    // Time-prescribed rows (planks, dead hangs, carries) keep their nature:
    // sets of a hold, not phantom reps.
    if ((p.exercise.prescriptionType as string) === 'time') {
      return {
        exerciseId: p.exercise.id,
        name: p.exercise.name,
        muscle: p.muscle,
        sets: scheme.sets,
        reps: 1,
        repsMin: 1,
        repsMax: 1,
        orderIndex: i,
        prescriptionType: 'time' as const,
        durationSeconds: role === 'core' ? 40 : 30,
      };
    }
    return {
      exerciseId: p.exercise.id,
      name: p.exercise.name,
      muscle: p.muscle,
      sets: scheme.sets,
      reps: Math.round((scheme.repsMin + scheme.repsMax) / 2),
      repsMin: scheme.repsMin,
      repsMax: scheme.repsMax,
      orderIndex: i,
    };
  });

  // Cardio finisher (or a cardio-only session): one time-based bout.
  if (wantsCardio) {
    const cardioPool = rankPool(
      eligible.filter((e) => muscleMatches(e, 'Cardio') && !usedIds.has(e.id)),
      false,
    );
    if (cardioPool.length > 0) {
      const band = tierBand(cardioPool);
      const pick = band[seed % band.length]!;
      exercises.push({
        exerciseId: pick.id,
        name: pick.name,
        muscle: 'Cardio',
        sets: 1,
        reps: 1,
        repsMin: 1,
        repsMax: 1,
        orderIndex: exercises.length,
        prescriptionType: 'time',
        durationSeconds: strengthMuscles.length > 0 ? 600 : 1200,
      });
    }
  }

  exercises.forEach((ex, i) => {
    ex.orderIndex = i;
  });

  return {
    title: quickSessionTitle(selected),
    type: strengthMuscles.length === 0 ? 'cardio' : 'strength',
    durationMinutes: Math.max(15, exercises.length * 8),
    exercises,
  };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function sharesAny(items: string[] | undefined, used: Set<string>): boolean {
  return (items ?? []).some((x) => used.has(x));
}

function primaryEquip(e: TransformedExercise): string[] {
  return e.primaryEquipment?.length ? e.primaryEquipment : (e.equipment ?? []);
}

function sameList(x: string[] | undefined, y: string[] | undefined): boolean {
  return (
    JSON.stringify([...(x ?? [])].sort()) ===
    JSON.stringify([...(y ?? [])].sort())
  );
}

/** Two rows a coach would call the same exercise in different clothes:
 *  identical movement patterns, identical sub-muscles, identical primary
 *  equipment. One session never contains such a pair. */
export function isNearDuplicate(
  a: TransformedExercise,
  b: TransformedExercise,
): boolean {
  return (
    sameList(a.movementPatterns, b.movementPatterns) &&
    sameList(a.subMuscles, b.subMuscles) &&
    sameList(a.primaryEquipment, b.primaryEquipment)
  );
}

/** The rotation band of an already-ranked pool: the leading tier, extended
 *  into the next tier when the leading one is thin — a band of one can't
 *  rotate, and adjacent tiers are both curated quality. */
function tierBand(ranked: TransformedExercise[]): TransformedExercise[] {
  if (ranked.length === 0) return ranked;
  const lead = tierRank(ranked[0]!.id);
  let band = ranked.filter((e) => tierRank(e.id) === lead);
  if (band.length < 3) {
    const nextTiers = [...new Set(ranked.map((e) => tierRank(e.id)))]
      .filter((t) => t > lead)
      .sort((a, b) => a - b);
    for (const t of nextTiers) {
      if (band.length >= 3) break;
      band = [...band, ...ranked.filter((e) => tierRank(e.id) === t)];
    }
  }
  return band.slice(0, Math.min(5, band.length));
}
