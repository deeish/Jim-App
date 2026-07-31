import type {
  ExerciseSession,
  LastPerformanceMap,
  PersonalBestMap,
} from '../types/workout';
import {
  MIN_PLAUSIBLE_DURATION_SECONDS,
  lastTopWeightLb,
} from './lastPerformanceDisplay';
import { isLinkableLibraryExerciseId } from './exerciseNavigation';
import {
  exerciseUsesTimeDisplay,
  formatRestSecondsForPreview,
} from './exercisePrescription';
import { WeightUnit, formatWeightCompactFromLb } from './weightDisplay';

/**
 * Turns a just-finished session into the numbers and the claims the finish
 * screen shows.
 *
 * Two rules keep the claims honest. Both cost trust when broken, and nothing
 * erodes trust in a stats screen faster than a celebration the user knows is
 * wrong:
 *
 * 1. **A personal best has to beat something.** An exercise with no prior
 *    weighted history sets no record here. Every first-ever lift is technically
 *    a lifetime best, so counting them would fire on nearly every exercise a
 *    new user touches — noise dressed up as achievement.
 * 2. **Records come from the all-time aggregate, never from `lastPerformance`.**
 *    That map is bounded to the 30 most recent logs (~7 weeks at four sessions
 *    a week), so a "best" reduced from it would celebrate a lift the user beat
 *    months ago. See `docs/plans/2026-07-27-progress-and-history.md` §3.7a.
 *
 * Both server maps are keyed only by ids the backend considers trackable, so
 * placeholder ids (`draft_`/`applied_`/`generated_`) and the `'manual'` bucket
 * are simply absent from them. Requiring a prior number for every claim is what
 * excludes those here; the claims path needs no id guard of its own.
 */

/** Heaviest completed weighted set of one exercise. */
interface WeightedSet {
  weightLb: number;
  reps: number;
}

export interface SessionTotals {
  /** Completed sets across every non-skipped exercise. */
  completedSets: number;
  /**
   * Distinct movements with at least one completed set. Two slots of the same
   * library exercise count once; slots without a usable library id (the
   * `'manual'` bucket, placeholder ids, no id at all) count one each, since
   * nothing proves two of them are the same movement.
   */
  exercisesWorked: number;
  /** Canonical pounds. Unweighted sets contribute nothing. */
  volumeLb: number;
  /**
   * Whether any completed set carried a real weight. Bodyweight work never
   * does, and generated plans ship no prescribed weight at all, so a perfectly
   * good session can legitimately total zero volume. The finish screen hides
   * the volume tile in that case rather than claiming "0 lb".
   */
  hasWeightedWork: boolean;
}

export type SessionAchievementKind = 'personal-best' | 'beat-last-time';

export interface SessionAchievement {
  exerciseId: string;
  exerciseName: string;
  kind: SessionAchievementKind;
  /** Heaviest completed set of this session, in pounds. */
  weightLb: number;
  /**
   * Reps performed at that weight — or, for a time-based row, the duration in
   * seconds, since timed sets log their seconds in the reps field.
   */
  reps: number;
  /** What it beat: the all-time best, or last session's top weight. */
  previousLb: number;
  /** `weightLb - previousLb`; always > 0. */
  gainLb: number;
  /**
   * Loaded carries, sled pushes and weighted holds are timed *and* weighted, so
   * `reps` here is seconds. Rendering it as `45×70 lb` would read as 45 reps.
   */
  isTimeBased: boolean;
}

/**
 * Heaviest completed weighted set of an exercise this session. Ties prefer more
 * reps, matching how the server decides which set a record describes.
 */
export function bestWeightedSetOfSession(
  session: ExerciseSession,
): WeightedSet | null {
  let best: WeightedSet | null = null;
  for (const set of session.completedSets) {
    if (!set.completed) continue;
    const weightLb = set.weight ?? 0;
    if (weightLb <= 0) continue;
    if (!best || outranks({ weightLb, reps: set.reps }, best)) {
      best = { weightLb, reps: set.reps };
    }
  }
  return best;
}

/** Heavier wins; equal weight is settled by more reps (or a longer hold). */
function outranks(candidate: WeightedSet, current: WeightedSet): boolean {
  if (candidate.weightLb !== current.weightLb) {
    return candidate.weightLb > current.weightLb;
  }
  return candidate.reps > current.reps;
}

/**
 * Session totals, using the same definitions the saved log uses — skipped
 * exercises excluded, completed sets only, unweighted sets worth no volume — so
 * the finish screen and history can never disagree about the same workout.
 */
export function summarizeSessionTotals(
  sessions: ExerciseSession[],
): SessionTotals {
  let completedSets = 0;
  let volumeLb = 0;
  let hasWeightedWork = false;
  // "Exercises" counts distinct movements, not slots. The same lift can fill
  // two slots (an opener plus a back-off block, or re-added from the library),
  // and "3 Exercises" for Bench, Bench, Squat reads as a miscount — so slots
  // sharing a library id merge, the identity the claims below group by. An id
  // that names no single movement (the shared `'manual'` bucket, placeholder
  // ids, none at all) cannot merge anything: each such slot counts as its own.
  const workedMovements = new Set<string>();
  let workedUnidentifiedSlots = 0;

  for (const es of sessions) {
    if (es.skipped) continue;
    let setsHere = 0;
    for (const set of es.completedSets) {
      if (!set.completed) continue;
      setsHere += 1;
      const weightLb = set.weight ?? 0;
      if (weightLb > 0) {
        hasWeightedWork = true;
        volumeLb += (set.reps || 0) * weightLb;
      }
    }
    completedSets += setsHere;
    if (setsHere > 0) {
      const id = es.exercise.exerciseId;
      if (id && isLinkableLibraryExerciseId(id)) workedMovements.add(id);
      else workedUnidentifiedSlots += 1;
    }
  }

  return {
    completedSets,
    exercisesWorked: workedMovements.size + workedUnidentifiedSlots,
    volumeLb,
    hasWeightedWork,
  };
}

/**
 * Every honest "you beat something" claim this session earned, best first.
 *
 * At most one claim per exercise: breaking a personal best necessarily beats
 * last time too (the all-time best already includes the last session), so the
 * bigger claim wins and the smaller one is not repeated.
 *
 * Ordering is personal bests first, then by how much was added — a highlight
 * reel, since the caller may only have room for the top few.
 */
export function collectSessionAchievements(
  sessions: ExerciseSession[],
  lastPerformance: LastPerformanceMap,
  personalBests: PersonalBestMap,
): SessionAchievement[] {
  // Grouped by exercise id, not per row: the same exercise can legitimately
  // appear twice in one session (a back-off set, or re-added from the library),
  // and the user's best across both is what a record has to beat. Claiming it
  // twice would also duplicate a React key in the rendered list.
  const byExercise = new Map<string, { session: ExerciseSession; best: WeightedSet }>();

  for (const es of sessions) {
    if (es.skipped) continue;
    const exerciseId = es.exercise.exerciseId;
    if (!exerciseId) continue;
    const best = bestWeightedSetOfSession(es);
    if (!best) continue;
    const existing = byExercise.get(exerciseId);
    if (!existing) byExercise.set(exerciseId, { session: es, best });
    else if (outranks(best, existing.best)) existing.best = best;
  }

  const found: SessionAchievement[] = [];
  // Map iteration is insertion order, i.e. the order they were performed.
  for (const [exerciseId, { session, best }] of byExercise) {
    const record = personalBests[exerciseId];
    if (record && best.weightLb > record.weightLb) {
      found.push(
        buildAchievement(exerciseId, session, best, 'personal-best', record.weightLb),
      );
      continue;
    }

    const lastTop = lastTopWeightLb(lastPerformance[exerciseId]);
    if (lastTop != null && best.weightLb > lastTop) {
      found.push(
        buildAchievement(exerciseId, session, best, 'beat-last-time', lastTop),
      );
    }
  }

  const kindRank: Record<SessionAchievementKind, number> = {
    'personal-best': 0,
    'beat-last-time': 1,
  };
  // Sort is stable, so equal gains keep the order the exercises were performed.
  return found.sort((a, b) =>
    a.kind !== b.kind
      ? kindRank[a.kind] - kindRank[b.kind]
      : b.gainLb - a.gainLb,
  );
}

function buildAchievement(
  exerciseId: string,
  session: ExerciseSession,
  best: WeightedSet,
  kind: SessionAchievementKind,
  previousLb: number,
): SessionAchievement {
  const exercise = session.exercise;
  return {
    exerciseId,
    exerciseName: exercise.name,
    kind,
    weightLb: best.weightLb,
    reps: best.reps,
    previousLb,
    gainLb: best.weightLb - previousLb,
    isTimeBased: exerciseUsesTimeDisplay(
      exercise.prescriptionType,
      exercise.name,
      exercise.primaryMuscleGroup,
    ),
  };
}

/** Headline for an achievement row, e.g. `Personal best`. */
export function formatAchievementLabel(kind: SessionAchievementKind): string {
  return kind === 'personal-best' ? 'Personal best' : 'Beat last time';
}

/**
 * Supporting line for an achievement row, e.g. `5×145 lb · up from 140 lb`, or
 * `45s @ 70 lb · up from 65 lb` for a loaded carry. Matches the formats used by
 * the live-session "Last time" line.
 */
export function formatAchievementDetail(
  achievement: SessionAchievement,
  unit: WeightUnit,
): string {
  const now = formatWeightCompactFromLb(achievement.weightLb, unit);
  const before = formatWeightCompactFromLb(achievement.previousLb, unit);

  let lead: string;
  if (!achievement.isTimeBased) {
    lead = `${achievement.reps}×${now}`;
  } else if (achievement.reps >= MIN_PLAUSIBLE_DURATION_SECONDS) {
    lead = `${formatRestSecondsForPreview(achievement.reps)} @ ${now}`;
  } else {
    // Legacy cardio rows store a rep count rather than seconds, so a small
    // value here is not a duration worth rendering as one.
    lead = now;
  }

  // Converting to the display unit can round a small gain onto the same number
  // (141 lb and 140 lb are both 64 kg). Repeating it reads as a bug, so the
  // comparison is dropped rather than shown as "up from" the same figure.
  return before && before !== now ? `${lead} · up from ${before}` : lead;
}
