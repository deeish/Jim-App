import { ExercisesService } from '../exercises/exercises.service';
import {
  inferPrescriptionTypeFromExerciseName,
  type ExercisePrescriptionType,
} from '../data/exercise-prescription';

/** One exercise row as returned by plan / workout generation (before save). */
export type GeneratedSessionExercise = {
  name: string;
  sets: number;
  reps: number;
  weight?: number;
  notes?: string;
  exerciseId?: string;
  /** From exercise library when `exerciseId` resolves; else inferred from name. */
  prescriptionType?: ExercisePrescriptionType;
};

export type GeneratedSession = {
  weekIndex: number;
  weekday: string;
  name: string;
  reasoning?: string;
  warmUp?: string;
  coolDown?: string;
  cardioFinisher?: { suggestion: string };
  exercises: GeneratedSessionExercise[];
};

const PULL_NAME =
  /\b(row|rows|pulldown|pull-down|pullup|pull-up|pull up|lat\b|lats\b|chin-up|chinup|face pull|shrug|deadlift|rdl|romanian|hyperextension|good morning)\b/i;

/** Strength sessions that should include at least one pull pattern (upper / pull / back emphasis). */
export function sessionTitleNeedsPullBalance(
  title: string | undefined,
  type: string,
): boolean {
  if (type !== 'strength') return false;
  const t = (title ?? '').toLowerCase();
  if (
    /\b(leg day|legs\b|lower body|quad|hamstring|glute|squat day)\b/.test(t) &&
    !/\bupper\b/.test(t)
  ) {
    return false;
  }
  if (/\b(cardio|run|conditioning|recovery)\b/.test(t)) return false;
  return (
    /\bupper\b/.test(t) ||
    /\bpull\b/.test(t) ||
    /\bchest\b.*\bback\b|\bback\b.*\bchest\b/.test(t) ||
    /\bback\b/.test(t) ||
    /\bfull body\b/.test(t)
  );
}

export function listHasPull(exercises: GeneratedSessionExercise[]): boolean {
  return exercises.some((e) => PULL_NAME.test(e.name));
}

export function inferMainLiftName(
  exercises: GeneratedSessionExercise[],
): string | null {
  const work = exercises.filter(
    (e) =>
      (e.sets ?? 0) >= 3 && !/warm|stretch|cool|mobility|foam/i.test(e.name),
  );
  return work[0]?.name ?? exercises[0]?.name ?? null;
}

export function tieWarmupToMainLift(
  warmUp: string | undefined,
  mainName: string | null,
): string | undefined {
  if (!mainName) return warmUp;
  const base = (
    warmUp ?? '5–8 minutes of light movement and dynamic mobility.'
  ).trim();
  const short = mainName.slice(0, 48);
  if (base.toLowerCase().includes(short.toLowerCase())) return base;
  const prefix = `After a general warm-up, take 2–3 light ramp sets toward working weight on ${mainName}. `;
  return prefix + base;
}

function compoundSortScore(
  ex: GeneratedSessionExercise,
  meta:
    | { movementPatterns?: string[]; primaryMuscleGroup?: string }
    | undefined,
): number {
  if (meta?.primaryMuscleGroup === 'Cardio') return -10_000;
  const patterns = meta?.movementPatterns ?? [];
  const bigFour = ['Squat', 'Hinge', 'Push', 'Pull'];
  const compoundish = bigFour.some((p) => patterns.includes(p));
  let score = compoundish ? 100 : 0;
  score += Math.min(50, (ex.sets ?? 0) * 8);
  return score;
}

function nameMatchesAvoidList(name: string, phrases: string[]): boolean {
  const nl = (name ?? '').toLowerCase();
  return phrases.some((p) => {
    const x = p.toLowerCase().trim();
    return x.length >= 2 && nl.includes(x);
  });
}

/**
 * Order compounds before accessories, ensure pull balance when the title calls for it,
 * and tie warm-up copy to the first main lift.
 */
export async function enrichGeneratedSession(
  session: GeneratedSession,
  spec: { title?: string; type: string },
  exercisesService: ExercisesService,
  equipment?: string[],
  avoidPhrases: string[] = [],
): Promise<GeneratedSession> {
  if (spec.type !== 'strength') {
    return session;
  }

  let exercises = [...session.exercises];

  const withScores = await Promise.all(
    exercises.map(async (e, origIndex) => {
      const meta = e.exerciseId
        ? exercisesService.findOne(e.exerciseId)
        : undefined;
      const prescriptionType =
        meta?.prescriptionType ??
        inferPrescriptionTypeFromExerciseName(e.name);
      return {
        e: { ...e, prescriptionType },
        origIndex,
        score: compoundSortScore(e, meta),
      };
    }),
  );
  withScores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.origIndex - b.origIndex;
  });
  exercises = withScores.map((x) => x.e);

  if (
    sessionTitleNeedsPullBalance(spec.title, spec.type) &&
    !listHasPull(exercises)
  ) {
    const excludeIds = exercises
      .map((e) => e.exerciseId)
      .filter((id): id is string => !!id);
    const pullPool = exercisesService.getCandidatesForGenerator({
      focus: 'pull',
      equipment: equipment?.length ? equipment : undefined,
      excludeIds,
      limit: 45,
    });
    const pick = pullPool.find(
      (c) =>
        !exercises.some((e) => e.exerciseId === c.id || e.name === c.name) &&
        !nameMatchesAvoidList(c.name, avoidPhrases),
    );
    if (pick) {
      const insertAt = Math.min(2, exercises.length);
      exercises.splice(insertAt, 0, {
        name: pick.name,
        exerciseId: pick.id,
        sets: 3,
        reps: 10,
        notes: 'Added for pull balance vs session focus',
        prescriptionType:
          pick.prescriptionType ??
          inferPrescriptionTypeFromExerciseName(pick.name),
      });
    }
  }

  const mainName = inferMainLiftName(exercises);
  const warmUp = tieWarmupToMainLift(session.warmUp, mainName);

  return { ...session, warmUp, exercises };
}
