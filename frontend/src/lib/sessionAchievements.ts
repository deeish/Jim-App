import type {
  ExerciseSession,
  LastPerformanceMap,
  PersonalBestE1rmMap,
  PersonalBestMap,
} from '../types/workout';
// The SAME Epley rules the history screen, the crew tab and the server all
// apply. Three copies of the constant exist; a fourth definition here would be
// the one that drifts and made a set a record in one place and not another.
import { estimateOneRepMax } from './exerciseHistory';
import {
  MIN_PLAUSIBLE_DURATION_SECONDS,
  lastTopSet,
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

/**
 * Which axis the claim was won on. Load progression and rep progression are
 * equivalent routes to the same adaptation, and this app's own Target line
 * asks for reps first ("add a rep") — so a session that adds one at the same
 * weight has progressed, and used to be told nothing.
 *
 * `estimated` is the third route and the one that was invisible: a best set on
 * a LIGHTER bar for more reps. 185x5 then 175x12 is 216 lb estimated to 245,
 * unmistakable progress — and it beat neither the record (175 < 185) nor last
 * time, so the app said nothing at all.
 */
export type SessionAchievementBasis = 'weight' | 'reps' | 'estimated';

export interface SessionAchievement {
  exerciseId: string;
  exerciseName: string;
  /**
   * The slot whose set won this. A lift can fill two slots — an opener and a
   * back-off block — and only the one that actually set the mark should wear
   * it; keying the display by exercise id alone puts the opener's PB on the
   * back-off row too.
   */
  exerciseIndex: number;
  kind: SessionAchievementKind;
  basis: SessionAchievementBasis;
  /** Best completed set of this session, in pounds; 0 for bodyweight work. */
  weightLb: number;
  /**
   * Reps performed at that weight — or, for a time-based row, the duration in
   * seconds, since timed sets log their seconds in the reps field.
   */
  reps: number;
  /** What it beat: the all-time best, or last session's top set. */
  previousLb: number;
  /** Reps of that previous set — what a rep-basis claim beat. */
  previousReps: number;
  /** `weightLb - previousLb`. Zero on a rep-basis claim. */
  gainLb: number;
  /** `reps - previousReps`. Zero on a weight-basis claim. */
  gainReps: number;
  /** Estimated 1RM of this session's set. Zero unless the basis is estimated. */
  e1rmLb: number;
  /** The estimate it beat. Zero unless the basis is estimated. */
  previousE1rmLb: number;
  /**
   * Loaded carries, sled pushes and weighted holds are timed *and* weighted, so
   * `reps` here is seconds. Rendering it as `45×70 lb` would read as 45 reps.
   */
  isTimeBased: boolean;
}

/**
 * The best completed set of an exercise this session, INCLUDING unweighted
 * ones (reported at zero load). Same ordering as the weighted version —
 * heavier wins, equal load is settled by reps — which is exactly what makes
 * rep progress comparable: at one load, more reps is a better set.
 *
 * A set with neither load nor reps is skipped. Timed rows log their seconds in
 * a field this never sees, so they arrive here as 0 × 0 and claim nothing.
 */
export function bestSetOfSession(session: ExerciseSession): WeightedSet | null {
  let best: WeightedSet | null = null;
  for (const set of session.completedSets) {
    if (!set.completed) continue;
    const weightLb = set.weight != null && set.weight > 0 ? set.weight : 0;
    const reps = set.reps ?? 0;
    if (weightLb <= 0 && reps <= 0) continue;
    if (!best || outranks({ weightLb, reps }, best)) {
      best = { weightLb, reps };
    }
  }
  return best;
}

/**
 * Best completed set of this session by ESTIMATED one-rep max.
 *
 * A different question from `bestSetOfSession`, and often a different set: the
 * heaviest bar of the day is not always the strongest thing done with it. Ties
 * prefer the heavier bar, matching the server's reducer exactly so the client
 * and the stored record can never disagree about which set holds a mark.
 */
export function bestE1rmSetOfSession(
  session: ExerciseSession,
): { set: WeightedSet; e1rmLb: number } | null {
  let best: { set: WeightedSet; e1rmLb: number } | null = null;
  for (const s of session.completedSets) {
    if (!s.completed) continue;
    const e1rmLb = estimateOneRepMax(s.weight ?? null, s.reps);
    if (e1rmLb === null) continue;
    const set = { weightLb: s.weight as number, reps: s.reps };
    if (
      !best ||
      e1rmLb > best.e1rmLb ||
      (e1rmLb === best.e1rmLb && set.weightLb > best.set.weightLb)
    ) {
      best = { set, e1rmLb };
    }
  }
  return best;
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
  /**
   * The strongest-set records. Optional so a client running ahead of an API
   * that predates the field simply finds no estimated PRs, rather than
   * throwing on the emotional peak of the app.
   */
  personalBestsE1rm: PersonalBestE1rmMap = {},
  /**
   * Local-day start of the session being celebrated. Anything recorded at or
   * after it is not something this session beat.
   *
   * Backdating is a supported flow: train Monday, forget to finish, train and
   * finish Tuesday, then open Monday and press Complete. Monday is still
   * unlogged so the pre-log gate is open — but the records now describe
   * TUESDAY. Without this the poster congratulates Monday for beating a
   * workout performed after it. Omit only where no date is known.
   */
  beforeIso?: string,
): SessionAchievement[] {
  const cutoff = beforeIso ? Date.parse(beforeIso) : NaN;
  const isEarlier = (performedAt: string | undefined): boolean => {
    if (Number.isNaN(cutoff)) return true;
    const at = performedAt ? Date.parse(performedAt) : NaN;
    return Number.isNaN(at) ? false : at < cutoff;
  };
  // Grouped by exercise id, not per row: the same exercise can legitimately
  // appear twice in one session (a back-off set, or re-added from the library),
  // and the user's best across both is what a record has to beat. Claiming it
  // twice would also duplicate a React key in the rendered list.
  const byExercise = new Map<
    string,
    {
      session: ExerciseSession;
      best: WeightedSet;
      /** Kept separately: the day's strongest set is often not its heaviest. */
      e1rm: { set: WeightedSet; e1rmLb: number } | null;
    }
  >();

  for (const es of sessions) {
    if (es.skipped) continue;
    const exerciseId = es.exercise.exerciseId;
    if (!exerciseId) continue;
    const best = bestSetOfSession(es);
    if (!best) continue;
    const e1rm = bestE1rmSetOfSession(es);
    const existing = byExercise.get(exerciseId);
    if (!existing) {
      byExercise.set(exerciseId, { session: es, best, e1rm });
      continue;
    }
    if (outranks(best, existing.best)) {
      // Keep the slot alongside the set, or the claim lands on whichever slot
      // happened to come first rather than the one that earned it.
      existing.best = best;
      existing.session = es;
    }
    // The estimate is maximised across every slot independently — an opener
    // can hold the heaviest set while a back-off block holds the strongest.
    if (e1rm && (!existing.e1rm || e1rm.e1rmLb > existing.e1rm.e1rmLb)) {
      existing.e1rm = e1rm;
    }
  }

  const found: SessionAchievement[] = [];
  // Map iteration is insertion order, i.e. the order they were performed.
  for (const [exerciseId, { session, best, e1rm }] of byExercise) {
    // `outranks`, not a weight comparison: heavier still wins, but equal load
    // with more reps now counts too. The server keeps no load record for
    // unweighted work, so bodyweight exercises never reach this branch and are
    // judged against last time below — which is the only record they have.
    const record = personalBests[exerciseId];
    if (
      record &&
      isEarlier(record.performedAt) &&
      outranks(best, { weightLb: record.weightLb, reps: record.reps })
    ) {
      found.push(
        buildAchievement(exerciseId, session, best, 'personal-best', {
          weightLb: record.weightLb,
          reps: record.reps,
        }),
      );
      continue;
    }

    // Only now, having failed the heavier-bar test: did the session produce
    // the strongest set this lift has ever seen? This is what catches a PR won
    // by adding reps to a lighter bar, which neither branch above can see.
    const e1rmRecord = personalBestsE1rm[exerciseId];
    if (
      e1rm &&
      e1rmRecord &&
      isEarlier(e1rmRecord.performedAt) &&
      e1rm.e1rmLb > e1rmRecord.e1rmLb
    ) {
      found.push(
        buildAchievement(
          exerciseId,
          session,
          e1rm.set,
          'personal-best',
          { weightLb: e1rmRecord.weightLb, reps: e1rmRecord.reps },
          { e1rmLb: e1rm.e1rmLb, previousE1rmLb: e1rmRecord.e1rmLb },
        ),
      );
      continue;
    }

    const previous = lastPerformance[exerciseId];
    const lastTop = isEarlier(previous?.performedAt) ? lastTopSet(previous) : null;
    if (lastTop && outranks(best, lastTop)) {
      found.push(
        buildAchievement(exerciseId, session, best, 'beat-last-time', lastTop),
      );
    }
  }

  const kindRank: Record<SessionAchievementKind, number> = {
    'personal-best': 0,
    'beat-last-time': 1,
  };
  // Records first, then load gains ahead of rep gains — adding a plate is the
  // rarer event, so it leads a reel the caller may truncate to two.
  // Adding a plate is the rarest event, so it leads; an estimated gain comes
  // last because it is the subtlest claim of the three and the caller may
  // truncate the reel to two rows.
  const basisRank: Record<SessionAchievementBasis, number> = {
    weight: 0,
    reps: 1,
    estimated: 2,
  };
  // Sort is stable, so equal gains keep the order the exercises were performed.
  return found.sort((a, b) => {
    if (a.kind !== b.kind) return kindRank[a.kind] - kindRank[b.kind];
    if (a.basis !== b.basis) return basisRank[a.basis] - basisRank[b.basis];
    if (a.basis === 'weight') return b.gainLb - a.gainLb;
    if (a.basis === 'estimated') {
      return b.e1rmLb - b.previousE1rmLb - (a.e1rmLb - a.previousE1rmLb);
    }
    return b.gainReps - a.gainReps;
  });
}

function buildAchievement(
  exerciseId: string,
  session: ExerciseSession,
  best: WeightedSet,
  kind: SessionAchievementKind,
  previous: WeightedSet,
  /** Present only for an estimated claim; its presence IS the basis. */
  estimated?: { e1rmLb: number; previousE1rmLb: number },
): SessionAchievement {
  const exercise = session.exercise;
  const previousLb = previous.weightLb;
  return {
    exerciseId,
    exerciseName: exercise.name,
    exerciseIndex: session.exerciseIndex,
    kind,
    // Heavier is a load claim; anything else that outranked the record did it
    // on reps at the same load. An estimated claim is neither — it is usually
    // a LIGHTER bar, so calling it a weight or rep gain would misreport it.
    basis: estimated ? 'estimated' : best.weightLb > previousLb ? 'weight' : 'reps',
    weightLb: best.weightLb,
    reps: best.reps,
    previousLb,
    previousReps: previous.reps,
    gainLb: Math.max(0, best.weightLb - previousLb),
    gainReps: Math.max(0, best.reps - previous.reps),
    e1rmLb: estimated?.e1rmLb ?? 0,
    previousE1rmLb: estimated?.previousE1rmLb ?? 0,
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
  if (achievement.isTimeBased && achievement.reps >= MIN_PLAUSIBLE_DURATION_SECONDS) {
    lead = now
      ? `${formatRestSecondsForPreview(achievement.reps)} @ ${now}`
      : formatRestSecondsForPreview(achievement.reps);
  } else if (achievement.weightLb <= 0) {
    // Bodyweight work has no load to name, so the reps carry the line.
    lead = `${achievement.reps} reps`;
  } else if (!achievement.isTimeBased) {
    lead = `${achievement.reps}×${now}`;
  } else {
    // Legacy cardio rows store a rep count rather than seconds, so a small
    // value here is not a duration worth rendering as one.
    lead = now;
  }

  // An estimated claim is usually won on a LIGHTER bar, so "up from 185 lb"
  // beside a 175 lb set would read as a mistake. The estimates are what moved,
  // and naming them is also what stops the row overstating itself: the set is
  // reported as performed, and the comparison is explicitly an estimate.
  if (achievement.basis === 'estimated') {
    const est = formatWeightCompactFromLb(achievement.e1rmLb, unit);
    const prevEst = formatWeightCompactFromLb(achievement.previousE1rmLb, unit);
    if (!est) return lead;
    return prevEst && prevEst !== est
      ? `${lead} · est. ${est}, up from ${prevEst}`
      : `${lead} · est. ${est}`;
  }

  // A rep claim was won at an unchanged load, so naming the weight again says
  // nothing — the reps are what moved.
  if (achievement.basis === 'reps') {
    return achievement.previousReps > 0
      ? `${lead} · up from ${achievement.previousReps} reps`
      : lead;
  }

  // Converting to the display unit can round a small gain onto the same number
  // (141 lb and 140 lb are both 64 kg). Repeating it reads as a bug, so the
  // comparison is dropped rather than shown as "up from" the same figure.
  return before && before !== now ? `${lead} · up from ${before}` : lead;
}
