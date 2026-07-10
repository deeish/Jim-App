/**
 * Goal-based set/rep guidelines. Maps user goal + difficulty to ranges we pass to the LLM
 * so generated workouts match what users want (strength vs hypertrophy vs endurance).
 */

export type GoalKey =
  | 'strength'
  | 'hypertrophy'
  | 'muscle'
  | 'endurance'
  | 'fat loss'
  | 'hybrid';

export type DifficultyKey = 'beginner' | 'intermediate' | 'advanced';

export interface SetRepGuidelines {
  setsMin: number;
  setsMax: number;
  repsMin: number;
  repsMax: number;
  /** Short description for the LLM prompt */
  description: string;
  /** Optional: suggest rest between sets (seconds) */
  restSeconds?: number;
}

const SCHEMES: Record<GoalKey, Record<DifficultyKey, SetRepGuidelines>> = {
  strength: {
    beginner: {
      setsMin: 3,
      setsMax: 4,
      repsMin: 5,
      repsMax: 8,
      description:
        '3-4 sets of 5-8 reps. Focus on form and progressive overload.',
      restSeconds: 90,
    },
    intermediate: {
      setsMin: 4,
      setsMax: 5,
      repsMin: 4,
      repsMax: 6,
      description: '4-5 sets of 4-6 reps. Heavy compound focus.',
      restSeconds: 120,
    },
    advanced: {
      setsMin: 4,
      setsMax: 6,
      repsMin: 3,
      repsMax: 6,
      description: '4-6 sets of 3-6 reps. Prioritize main lifts.',
      restSeconds: 150,
    },
  },
  hypertrophy: {
    beginner: {
      setsMin: 2,
      setsMax: 3,
      repsMin: 10,
      repsMax: 12,
      description: '2-3 sets of 10-12 reps per exercise.',
      restSeconds: 60,
    },
    intermediate: {
      setsMin: 3,
      setsMax: 4,
      repsMin: 8,
      repsMax: 12,
      description: '3-4 sets of 8-12 reps. Classic hypertrophy range.',
      restSeconds: 75,
    },
    advanced: {
      setsMin: 3,
      setsMax: 5,
      repsMin: 6,
      repsMax: 12,
      description: '3-5 sets of 6-12 reps. Mix heavy and volume.',
      restSeconds: 90,
    },
  },
  muscle: {
    beginner: {
      setsMin: 2,
      setsMax: 3,
      repsMin: 10,
      repsMax: 12,
      description:
        '2-3 sets of 10-12 reps. Build muscle with controlled volume.',
      restSeconds: 60,
    },
    intermediate: {
      setsMin: 3,
      setsMax: 4,
      repsMin: 8,
      repsMax: 12,
      description: '3-4 sets of 8-12 reps. Hypertrophy focus.',
      restSeconds: 75,
    },
    advanced: {
      setsMin: 3,
      setsMax: 5,
      repsMin: 6,
      repsMax: 12,
      description: '3-5 sets of 6-12 reps.',
      restSeconds: 90,
    },
  },
  endurance: {
    beginner: {
      setsMin: 2,
      setsMax: 3,
      repsMin: 12,
      repsMax: 15,
      description: '2-3 sets of 12-15 reps. Light to moderate load.',
      restSeconds: 45,
    },
    intermediate: {
      setsMin: 2,
      setsMax: 3,
      repsMin: 12,
      repsMax: 20,
      description: '2-3 sets of 12-20 reps. Endurance and conditioning.',
      restSeconds: 45,
    },
    advanced: {
      setsMin: 2,
      setsMax: 4,
      repsMin: 12,
      repsMax: 25,
      description: '2-4 sets of 12-25 reps. High rep conditioning.',
      restSeconds: 30,
    },
  },
  'fat loss': {
    beginner: {
      setsMin: 2,
      setsMax: 3,
      repsMin: 10,
      repsMax: 15,
      description:
        '2-3 sets of 10-15 reps. Keep rest short to elevate heart rate.',
      restSeconds: 45,
    },
    intermediate: {
      setsMin: 3,
      setsMax: 4,
      repsMin: 8,
      repsMax: 15,
      description: '3-4 sets of 8-15 reps. Balance strength and calorie burn.',
      restSeconds: 60,
    },
    advanced: {
      setsMin: 3,
      setsMax: 4,
      repsMin: 8,
      repsMax: 12,
      description: '3-4 sets of 8-12 reps. Can add density (shorter rest).',
      restSeconds: 60,
    },
  },
  hybrid: {
    beginner: {
      setsMin: 3,
      setsMax: 4,
      repsMin: 8,
      repsMax: 12,
      description: '3-4 sets of 8-12 reps. Balanced strength and conditioning.',
      restSeconds: 75,
    },
    intermediate: {
      setsMin: 3,
      setsMax: 4,
      repsMin: 6,
      repsMax: 12,
      description: '3-4 sets of 6-12 reps. Mix strength and hypertrophy.',
      restSeconds: 90,
    },
    advanced: {
      setsMin: 4,
      setsMax: 4,
      repsMin: 5,
      repsMax: 12,
      description: '4 sets of 5-12 reps. Compound focus with accessory volume.',
      restSeconds: 90,
    },
  },
};

/** Normalize frontend goal to our key. */
export function normalizeGoal(goal: string | undefined): GoalKey {
  if (!goal) return 'hypertrophy';
  const g = goal.toLowerCase().trim();
  if (/strength/.test(g)) return 'strength';
  if (/hypertrophy|muscle|build muscle/.test(g)) return 'hypertrophy';
  if (/endurance|conditioning/.test(g)) return 'endurance';
  if (/fat loss|weight loss/.test(g)) return 'fat loss';
  if (/hybrid/.test(g)) return 'hybrid';
  return 'hypertrophy';
}

/** Normalize difficulty. */
export function normalizeDifficulty(d: string | undefined): DifficultyKey {
  if (!d) return 'intermediate';
  const lower = d.toLowerCase();
  if (lower === 'beginner') return 'beginner';
  if (lower === 'advanced') return 'advanced';
  return 'intermediate';
}

/** Get set/rep guidelines for the LLM and for rule-based fallback. */
export function getSetRepGuidelines(
  goal: string | undefined,
  difficulty: string | undefined,
): SetRepGuidelines {
  const g = normalizeGoal(goal);
  const d = normalizeDifficulty(difficulty);
  return SCHEMES[g][d];
}

// ---------------------------------------------------------------------------
// Role-aware prescription
//
// The base scheme above is one band per goal+difficulty. Real programming also
// varies by the exercise's ROLE: the heavy compound anchor stays low-rep, while
// isolation/core work runs higher reps with fewer sets. We derive the per-row
// prescription from the base band (so the user's goal still drives the numbers)
// shifted by role — rather than hand-tuning 1,000+ catalog rows.
// ---------------------------------------------------------------------------

export type ExerciseRole =
  | 'primary_compound'
  | 'secondary_compound'
  | 'isolation'
  | 'core';

export interface RoleAwareScheme {
  /** Concrete working-set count for the row (not a range). */
  sets: number;
  repsMin: number;
  repsMax: number;
  restSeconds?: number;
}

/** Global sanity clamps so no goal+role combination produces absurd numbers. */
const REP_FLOOR = 3;
const REP_CEIL = 25;
const SET_FLOOR = 2;
const SET_CEIL = 6;
/**
 * Keep the displayed band coach-tight. A 5–16 spread reads like indecision; we
 * pull the top down toward the (goal-anchored) bottom so ranges stay ≤ this wide.
 */
const MAX_RANGE_WIDTH = 6;

function clampInt(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(value)));
}

/**
 * Canonical coach rep bands. The role arithmetic below can land on odd ranges
 * (11–17, 14–19) that read as machine output; every final prescription snaps
 * to the nearest of these instead. The bottom of the band is weighted double
 * because it anchors intensity (a coach cares more that a heavy lift starts
 * at 5 than exactly where the back-off top sits). Ties go to the earlier
 * (heavier) band. All widths stay ≤ MAX_RANGE_WIDTH.
 */
export const COACH_REP_BANDS: ReadonlyArray<readonly [number, number]> = [
  [3, 5],
  [4, 6],
  [5, 8],
  [6, 10],
  [8, 10],
  [8, 12],
  [10, 12],
  [10, 15],
  [12, 15],
  [15, 20],
  [20, 25],
];

function snapToCoachBand(
  repsMin: number,
  repsMax: number,
): readonly [number, number] {
  let best = COACH_REP_BANDS[0]!;
  let bestCost = Number.POSITIVE_INFINITY;
  for (const band of COACH_REP_BANDS) {
    const cost = 2 * Math.abs(band[0] - repsMin) + Math.abs(band[1] - repsMax);
    if (cost < bestCost) {
      best = band;
      bestCost = cost;
    }
  }
  return best;
}

/**
 * Concrete `sets` + `repsMin`/`repsMax` for one exercise, derived from the
 * goal+difficulty base band ({@link getSetRepGuidelines}) shifted by role:
 *   - primary_compound  → base band, most sets (the heavy anchor)
 *   - secondary_compound→ slightly higher reps, mid sets
 *   - isolation         → higher reps, fewer sets
 *   - core              → core-appropriate higher-rep band, 3 sets
 *
 * Keeping the base as the reference means switching goals still moves every
 * role together (strength stays low-rep, endurance high-rep).
 */
export function getRoleAwareScheme(
  goal: string | undefined,
  difficulty: string | undefined,
  role: ExerciseRole,
): RoleAwareScheme {
  const base = getSetRepGuidelines(goal, difficulty);
  const midSets = Math.round((base.setsMin + base.setsMax) / 2);

  let sets: number;
  let repsMin: number;
  let repsMax: number;

  switch (role) {
    case 'primary_compound':
      sets = base.setsMax;
      repsMin = base.repsMin;
      repsMax = base.repsMax;
      break;
    case 'secondary_compound':
      sets = midSets;
      repsMin = base.repsMin + 1;
      repsMax = base.repsMax + 2;
      break;
    case 'isolation':
      sets = Math.min(3, base.setsMin);
      repsMin = base.repsMin + 4;
      repsMax = base.repsMax + 4;
      break;
    case 'core':
      sets = 3;
      repsMin = Math.max(12, base.repsMin + 4);
      repsMax = Math.max(15, base.repsMax + 4);
      break;
  }

  repsMin = clampInt(repsMin, REP_FLOOR, REP_CEIL);
  repsMax = clampInt(repsMax, REP_FLOOR, REP_CEIL);
  if (repsMax < repsMin) repsMax = repsMin;
  if (repsMax - repsMin > MAX_RANGE_WIDTH) repsMax = repsMin + MAX_RANGE_WIDTH;
  sets = clampInt(sets, SET_FLOOR, SET_CEIL);

  [repsMin, repsMax] = snapToCoachBand(repsMin, repsMax);

  return { sets, repsMin, repsMax, restSeconds: base.restSeconds };
}
