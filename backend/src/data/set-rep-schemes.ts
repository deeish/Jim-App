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
      setsMax: 5,
      repsMin: 5,
      repsMax: 12,
      description:
        '4-5 sets of 5-12 reps. Compound focus with accessory volume.',
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
