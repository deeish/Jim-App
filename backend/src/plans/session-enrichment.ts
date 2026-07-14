import { ExercisesService } from '../exercises/exercises.service';
import {
  inferPrescriptionTypeFromExerciseName,
  type ExercisePrescriptionType,
} from '../data/exercise-prescription';
import { secondaryMusclesForPreview } from '../data/muscle-preview-tags';
import {
  exerciseTargetsForSession,
  goalWantsStrengthCardioFinisher,
} from '../workouts/workout-generator.service';
import { getAcceptedAnchorIdsForFocus } from '../data/anchor-exercises';
import { equipmentSatisfies } from '../data/exercise-mappings';
import {
  getSetRepGuidelines,
  getRoleAwareScheme,
  normalizeDifficulty,
  type ExerciseRole,
} from '../data/set-rep-schemes';
import {
  classifyLowerDominance,
  classifyPushAngle,
  classifyPullAngle,
  baseMovementFamily,
} from './cross-session-diversity';
import {
  buildCardioDaySession,
  cardioNameMatchesModality,
} from './cardio-day-template';

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
  /** Library primary muscle (e.g. Chest, Cardio) for preview chips. */
  primaryMuscleGroup?: string;
  /** Distinct secondary muscles from library (e.g. Triceps, Shoulders on bench press). */
  secondaryMuscleGroups?: string[];
  /**
   * Suggested rest between sets in seconds. Sourced from the goal+difficulty
   * scheme in `data/set-rep-schemes.ts → getSetRepGuidelines`. Cardio rows are
   * left undefined (no inter-set rest concept). Surfaced in the preview as
   * `4 × 8 · 90s rest` so trainer-quality programming becomes visible to the
   * user without requiring an LLM round-trip.
   */
  restSeconds?: number;
  /**
   * Rep range stamped deterministically by goal × difficulty × exercise role
   * (see `stampSetsAndReps` + `getRoleAwareScheme`). `reps` holds the working
   * default (= `repsMin`) for set logging / progression; the range is what the
   * UI shows ("4 × 8–12"). Undefined on cardio/time rows.
   */
  repsMin?: number;
  repsMax?: number;
  /**
   * Duration in seconds for time-based rows (cardio bouts). Set in
   * `normalizeCardioRowShape` so a cardio row carries an explicit duration
   * instead of a rep count stuffed into `reps`.
   */
  durationSeconds?: number;
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

const BIG_FOUR = ['Squat', 'Hinge', 'Push', 'Pull'] as const;

/** Chest/shoulder isolation and small-arm work — deprioritize for ordering + warm-up anchor. */
export const ISOLATION_NAME =
  /\b(fly|flies|flyes|cable\s+fly|pec\s+deck|curl|curls|\bcable\s+curl|lateral\s+raise|front\s+raise|skull|(?:push|press)[-\s]?down|kickback|crossover|pullover|shrug|wrist|rear\s+delt|triceps\s+extension|overhead\s+extension)\b/i;

/** Squat / hinge class movements that belong on lower days, not Upper/Push/Pull focus. */
export const LOWER_PATTERN_NAME =
  /\b(deadlift|sumo|conventional\b|\brdl\b|romanian|good\s*morning|squat|leg\s+press|hack\s+squat|goblet\s+squat|front\s+squat|lunge|split\s+squat|hip\s+thrust|glute\s+bridge)\b/i;

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

/** Upper-emphasis session titles (exclude explicit lower/legs-only days). */
export function sessionTitleIsUpperEmphasis(
  title: string | undefined,
): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  if (/\b(cardio|recovery|run|conditioning)\b/.test(t)) return false;
  if (
    (/\blegs?\b|\blower\b|leg\s+day|\bquad\b|\bhamstring\b|\bglute\b/.test(t) ||
      /\bfull\s+body\b/.test(t)) &&
    !/\bupper\b/.test(t)
  ) {
    return false;
  }
  return /\bupper\b|\bpush\b|\bpull\b|\bchest\b|\bback\b|\bshoulders?\b|\barms\b/.test(
    t,
  );
}

/**
 * Lower-emphasis session titles (mirror of {@link sessionTitleIsUpperEmphasis}).
 * Excludes upper days and ambiguous full-body so the purity pass only acts on
 * titles that clearly own the lower body.
 */
export function sessionTitleIsLowerEmphasis(
  title: string | undefined,
): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  if (/\b(cardio|recovery|run|conditioning)\b/.test(t)) return false;
  if (/\bfull\s+body\b/.test(t)) return false;
  // An explicit upper marker (incl. PPL push/pull) wins — never treat as lower.
  if (/\bupper\b|\bpush\b|\bpull\b/.test(t)) return false;
  return /\blower\b|\blegs?\b|leg\s+day|\bquad\b|\bhamstring\b|\bglute\b|\bposterior\b|\bcalf\b/.test(
    t,
  );
}

/** Lower / legs strength days where knee-dominant + hip hinge coverage is expected when metadata allows checks. */
export function sessionTitleNeedsSquatHingeBalance(
  title: string | undefined,
  type: string,
): boolean {
  if (type !== 'strength') return false;
  const t = (title ?? '').toLowerCase();
  if (/\b(cardio|recovery|run|conditioning)\b/.test(t)) return false;
  if (
    /\bupper\b|\bpush\b|\bpull\b|\bchest\b|\bback\b|\bshoulders\b|\barms\b/.test(
      t,
    )
  ) {
    if (!/\blegs?\b|\blower\b|\bquad\b|\bhamstring\b|\bglute\b/.test(t))
      return false;
  }
  return (
    /\blegs?\b/.test(t) ||
    /\blower\b/.test(t) ||
    /\bleg day\b/.test(t) ||
    /\bquad\b|\bhamstring\b|\bglute\b/.test(t)
  );
}

function movementTier(
  meta:
    | { movementPatterns?: string[]; primaryMuscleGroup?: string }
    | undefined,
): number {
  if (meta?.primaryMuscleGroup === 'Cardio') return 1;
  const patterns = meta?.movementPatterns ?? [];
  if (!patterns.length) return 1;
  return BIG_FOUR.some((p) => patterns.includes(p)) ? 0 : 2;
}

function unionPatternsFromSession(
  exercises: GeneratedSessionExercise[],
  findOne: (id: string) => { movementPatterns?: string[] } | undefined,
): { union: Set<string>; withMetaCount: number } {
  const union = new Set<string>();
  let withMetaCount = 0;
  for (const e of exercises) {
    const id = e.exerciseId?.trim();
    if (!id) continue;
    const meta = findOne(id);
    const p = meta?.movementPatterns ?? [];
    if (p.length) {
      withMetaCount++;
      for (const x of p) union.add(x);
    }
  }
  return { union, withMetaCount };
}

/**
 * The model sometimes cites raw catalog ids in user-facing copy ("starts with
 * the front_squat"). Map known ids to display names; unknown snake_case tokens
 * are de-underscored so no machine identifier reaches the app.
 */
const SNAKE_CASE_TOKEN = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;

export function humanizeExerciseIdsInCopy(
  text: string | undefined,
  findMeta: (id: string) => { name?: string } | undefined,
): string | undefined {
  if (!text) return text;
  return text.replace(
    SNAKE_CASE_TOKEN,
    (token) => findMeta(token)?.name ?? token.replace(/_/g, ' '),
  );
}

function appendDeterministicCoachNotes(
  reasoning: string | undefined,
  notes: string[],
): string | undefined {
  if (!notes.length) return reasoning;
  const block = notes.join(' ').trim();
  const r = (reasoning ?? '').trim();
  if (!r) return block;
  const rl = r.toLowerCase();
  if (rl.includes(block.slice(0, 40).toLowerCase())) return r;
  return `${r} Note: ${block}`;
}

function listToProse(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * Deterministic, list-grounded session reasoning for strength days. The
 * model's free-text reasoning routinely contradicts the final exercise list —
 * live captures showed garbled chain-of-thought fragments ("the waiter carry
 * is not a press so we use the Farmer Handle Carry is not a press either")
 * and references to lifts the enrichment passes had already swapped out — so
 * the user-facing copy is rebuilt from the rows the user will actually
 * perform. Deterministic coach notes are appended afterwards by the caller,
 * unchanged. Returns undefined (keep the model text) when the session has no
 * strength rows to describe.
 */
export function buildStrengthReasoning(
  exercises: GeneratedSessionExercise[],
  findMeta: (id: string) => { primaryMuscleGroup?: string } | undefined,
): string | undefined {
  const groupOf = (e: GeneratedSessionExercise): string | undefined =>
    (e.exerciseId
      ? findMeta(e.exerciseId.trim())?.primaryMuscleGroup
      : undefined) ?? e.primaryMuscleGroup;
  const named = exercises.filter((e) => (e.name ?? '').trim());
  const strength = named.filter(
    (e) => (groupOf(e) ?? '').toLowerCase() !== 'cardio',
  );
  if (!strength.length) return undefined;
  const hasCardio = strength.length < named.length;
  const muscles: string[] = [];
  for (const e of strength) {
    const g = groupOf(e);
    if (g && !muscles.includes(g.toLowerCase())) muscles.push(g.toLowerCase());
  }
  const opener = strength[0]!.name.trim();
  const supporting = strength.length - 1;
  let text = `${opener} leads the session while you are freshest`;
  if (supporting > 0) {
    text += `, then ${supporting} supporting ${
      supporting === 1 ? 'move rounds' : 'moves round'
    } out ${listToProse(muscles)}`;
  }
  text += '.';
  if (hasCardio) {
    text += ' A short, easy cardio block closes the day.';
  }
  return text;
}

/**
 * The lift the warm-up ramp line points at: slot 1 after the ordering and
 * anchor passes have run (those already guarantee a sensible opener). A scoring
 * heuristic here used to out-guess the ordered list and told users to take ramp
 * sets on a pull-flavored accessory (live: "Axle Bar Deadlift Hold" on a lower
 * day whose opener was Front Squat).
 *
 * Returns null — no ramp line — when the opener is time-based (carries/holds
 * have no working sets to ramp toward) or needs no external load ("toward
 * working weight" reads as nonsense on a push-up).
 */
export function inferMainLiftName(
  exercises: GeneratedSessionExercise[],
  options?: {
    findMeta?: (id: string) =>
      | {
          primaryMuscleGroup?: string;
          primaryEquipment?: string[];
          equipment?: string[];
        }
      | undefined;
  },
): string | null {
  const findMeta = options?.findMeta;
  for (const e of exercises) {
    const name = e.name?.trim();
    if (!name || /warm|stretch|cool|mobility|foam/i.test(name)) continue;
    if ((e.sets ?? 0) < 1) continue;
    const meta = e.exerciseId ? findMeta?.(e.exerciseId.trim()) : undefined;
    const muscle = meta?.primaryMuscleGroup ?? e.primaryMuscleGroup;
    if (muscle === 'Cardio') continue;
    if (e.prescriptionType === 'time') return null;
    const eq = meta?.primaryEquipment ?? meta?.equipment;
    if (eq && eq.every((x) => /bodyweight/i.test(x))) return null;
    return name;
  }
  return null;
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
  sessionTitle?: string,
): number {
  if (meta?.primaryMuscleGroup === 'Cardio') return -10_000;
  const patterns = meta?.movementPatterns ?? [];
  const compoundish = BIG_FOUR.some((p) => patterns.includes(p));
  let score = compoundish ? 100 : 0;
  score += Math.min(50, (ex.sets ?? 0) * 8);
  const n = (ex.name ?? '').toLowerCase();
  if (ISOLATION_NAME.test(n)) score -= 42;
  if (sessionTitleIsUpperEmphasis(sessionTitle) && LOWER_PATTERN_NAME.test(n)) {
    score -= 75;
  }
  if (
    sessionTitleIsUpperEmphasis(sessionTitle) &&
    (patterns.includes('Hinge') || patterns.includes('Squat'))
  ) {
    score -= 35;
  }
  return score;
}

/**
 * Deterministic permutation of exercise indices: compound-first ordering, then
 * library cardio rows last (same rules as {@link enrichGeneratedSession} reorder).
 * Used by eval scoring so “ideal order” stays aligned with production enrichment.
 */
export function idealStrengthExercisePermutation(
  exercises: GeneratedSessionExercise[],
  findMeta: (
    id: string,
  ) => { movementPatterns?: string[]; primaryMuscleGroup?: string } | undefined,
  sessionTitle?: string,
): number[] {
  const n = exercises.length;
  if (n === 0) return [];
  const withScores = exercises.map((e, origIndex) => {
    const meta = e.exerciseId ? findMeta(e.exerciseId) : undefined;
    return {
      origIndex,
      tier: movementTier(meta),
      score: compoundSortScore(e, meta, sessionTitle),
    };
  });
  withScores.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (b.score !== a.score) return b.score - a.score;
    return a.origIndex - b.origIndex;
  });
  const non: number[] = [];
  const cardio: number[] = [];
  for (const row of withScores) {
    const e = exercises[row.origIndex]!;
    const id = e.exerciseId?.trim();
    const meta = id ? findMeta(id) : undefined;
    if (meta?.primaryMuscleGroup === 'Cardio') cardio.push(row.origIndex);
    else non.push(row.origIndex);
  }
  return [...non, ...cardio];
}

export function nameMatchesAvoidList(name: string, phrases: string[]): boolean {
  const nl = (name ?? '').toLowerCase();
  return phrases.some((p) => {
    const x = p.toLowerCase().trim();
    return x.length >= 2 && nl.includes(x);
  });
}

// Modality matcher lives in cardio-day-template.ts (shared with the cardio-day
// builder; that module only imports types from here, so no runtime cycle).

function moveCardioExercisesLast(
  exercises: GeneratedSessionExercise[],
  findOne: (id: string) => { primaryMuscleGroup?: string } | undefined,
): void {
  const non: GeneratedSessionExercise[] = [];
  const cardio: GeneratedSessionExercise[] = [];
  for (const e of exercises) {
    const id = e.exerciseId?.trim();
    const meta = id ? findOne(id) : undefined;
    if (meta?.primaryMuscleGroup === 'Cardio') cardio.push(e);
    else non.push(e);
  }
  exercises.splice(0, exercises.length, ...non, ...cardio);
}

/**
 * Cardio-machine modality names — belt-and-suspenders for a model-placed cardio
 * row whose `exerciseId` doesn't resolve to a `Cardio` library row. Mirrors the
 * frontend `CARDIO_MODALITY_NAME` (`exercisePrescription.ts`). Deliberately does
 * NOT match carries/holds (farmer/plank/hang) — those are strength, not cardio.
 */
const CARDIO_MODALITY_NAME =
  /\b(?:treadmill|elliptical|(?:stationary\s+)?bike|spin(?:\s+bike)?|air\s*dyne|air\s*bike|rowing|rower|(?:ski|assault)\s*erg|ski\s*erg|ergometer|versa\s*climber|stair\s*(?:master|climber)|step\s*mill|walking\s+pad)\b/i;

/**
 * A cardio row is one whose library `primaryMuscleGroup === 'Cardio'` (the
 * strongest signal — covers treadmill/bike/rower plus conditioning carries the
 * catalog files under Cardio) or, failing a resolvable id, whose name is a
 * cardio machine. Keyed on Cardio — NOT on `prescriptionType === 'time'`, which
 * legitimately covers planks/hangs/loaded carries we must leave alone.
 */
export function isCardioRow(
  e: GeneratedSessionExercise,
  findOne: (id: string) => { primaryMuscleGroup?: string } | undefined,
): boolean {
  const id = e.exerciseId?.trim();
  const group =
    (id ? findOne(id)?.primaryMuscleGroup : undefined) ?? e.primaryMuscleGroup;
  if ((group ?? '').toLowerCase() === 'cardio') return true;
  return CARDIO_MODALITY_NAME.test(e.name ?? '');
}

/**
 * Force every cardio row to the canonical time shape (`sets:1`, `reps:600`,
 * `prescriptionType:'time'`) so it renders "10 min" instead of an invented
 * "5 × 11". The model sometimes places its own cardio row with strength-style
 * sets/reps, which skips the clean appended finisher. A `reps` value under 60 is
 * a rep count, not seconds, so snap it to a 10-min bout; genuine durations
 * (>= 60s) are preserved.
 */
function normalizeCardioRowShape(
  exercises: GeneratedSessionExercise[],
  findOne: (id: string) => { primaryMuscleGroup?: string } | undefined,
): void {
  for (const e of exercises) {
    if (!isCardioRow(e, findOne)) continue;
    e.sets = 1;
    if (e.reps == null || e.reps < 60) e.reps = 600;
    e.prescriptionType = 'time';
    // Carry an explicit duration so the row no longer relies on a seconds value
    // smuggled inside `reps`. The UI renders this as "10 min".
    e.durationSeconds = e.reps;
    // Cardio rows have no rep range — clear any stamped band defensively.
    e.repsMin = undefined;
    e.repsMax = undefined;
    // The model often wrote a "30 seconds of work" note for a row we just
    // re-timed to a longer block. Drop the note when it contradicts the
    // stamped duration — the UI already renders the real duration.
    const claim =
      /^\s*(\d+)\s*(seconds?|secs?|minutes?|mins?)\s+of work\.?\s*$/i.exec(
        e.notes ?? '',
      );
    if (claim) {
      const claimedSeconds =
        parseInt(claim[1]!, 10) * (/^min/i.test(claim[2]!) ? 60 : 1);
      if (claimedSeconds !== e.durationSeconds) e.notes = undefined;
    }
  }
}

/**
 * Per-session working-set ceiling: the lower of an experience ceiling and what
 * actually fits the session length the user picked. Without the duration term
 * every session pinned to the experience cap (22 sets), which at strength rest
 * periods is 60+ minutes of work in a slot the user set to 45.
 */
export function workingSetCap(
  prefs: EnrichSessionGenerationPrefs | undefined,
): number {
  const experienceCap =
    normalizeDifficulty(prefs?.difficulty) === 'beginner'
      ? 14
      : normalizeDifficulty(prefs?.difficulty) === 'advanced'
        ? 22
        : 18;

  const duration = prefs?.durationMinutes;
  if (!duration || !Number.isFinite(duration) || duration <= 0) {
    return experienceCap;
  }
  // Each working set costs ~its rest interval + ~35s under load; reserve ~6 min
  // for the warm-up. Rest is capped at 120s because accessories don't truly rest
  // as long as the main lift. So a 45-min strength day (~150s rest) fits ~15
  // sets and a 45-min hybrid day (~90s rest) ~19 — both inside the chosen time.
  const rest = Math.min(
    getSetRepGuidelines(prefs?.goal, prefs?.difficulty).restSeconds ?? 90,
    120,
  );
  const perSetMinutes = (rest + 35) / 60;
  const durationCap = Math.max(6, Math.round((duration - 6) / perSetMinutes));
  return Math.min(experienceCap, durationCap);
}

/**
 * Guarantee a sane per-session working-set total. The model + per-exercise
 * scheme are chosen independently, so a detailed advanced session can stack
 * 6–7 lifts × 5 sets = 30+ sets — too much to finish or recover from. While the
 * strength total is over the experience-scaled cap, shave one set off the
 * highest-set accessory (never the slot-0 anchor, never below 2, never cardio).
 * Only ever removes sets, so it can't inflate a reasonable session.
 */
export function clampSessionWorkingSets(
  exercises: GeneratedSessionExercise[],
  findOne: (id: string) => { primaryMuscleGroup?: string } | undefined,
  prefs: EnrichSessionGenerationPrefs | undefined,
): void {
  const cap = workingSetCap(prefs);
  const isStrength = (e: GeneratedSessionExercise) => !isCardioRow(e, findOne);
  const total = () =>
    exercises.reduce(
      (sum, e) => (isStrength(e) ? sum + (e.sets ?? 0) : sum),
      0,
    );

  let guard = 0;
  while (total() > cap && guard < 200) {
    guard++;
    // Skip slot 0 (the anchor / heaviest main lift) and cardio; only trim rows
    // still above the floor of 2 sets.
    let target: GeneratedSessionExercise | undefined;
    for (let i = 1; i < exercises.length; i++) {
      const e = exercises[i]!;
      if (!isStrength(e) || (e.sets ?? 0) <= 2) continue;
      if (!target || (e.sets ?? 0) > (target.sets ?? 0)) target = e;
    }
    if (!target) break;
    target.sets -= 1;
  }
}

function pickLibraryCardioFinisherExercise(
  exercisesService: ExercisesService,
  equipment: string[] | undefined,
  excludeIds: string[],
  modalities: string[] | undefined,
  avoidPhrases: string[],
): NonNullable<ReturnType<ExercisesService['findOne']>> | undefined {
  const pool = exercisesService.getCandidatesForGenerator({
    focus: 'cardio',
    equipment: equipment?.length ? equipment : undefined,
    excludeIds,
    limit: 60,
  });
  const cardioRows = pool.filter(
    (c) =>
      c.primaryMuscleGroup === 'Cardio' &&
      !nameMatchesAvoidList(c.name, avoidPhrases),
  );
  if (!cardioRows.length) return undefined;
  if (modalities?.length) {
    for (const m of modalities) {
      const hit = cardioRows.find((c) => cardioNameMatchesModality(c.name, m));
      if (hit) return hit;
    }
  }
  return cardioRows[0];
}

/**
 * A strength day keeps at most ONE cardio row (the finisher), and that row
 * should match the user's preferred modality when one is set. The model
 * sometimes places two conditioning tails (20 min of cardio inside a strength
 * slot) or picks a rower when the user asked for "run" — both deterministic
 * fixes, no retry needed. Runs after `moveCardioExercisesLast` +
 * `normalizeCardioRowShape`, so cardio rows sit at the tail in time shape.
 */
function conformStrengthDayCardioFinisher(args: {
  exercises: GeneratedSessionExercise[];
  findMeta: (id: string) => { primaryMuscleGroup?: string } | undefined;
  exercisesService: ExercisesService;
  equipment: string[] | undefined;
  avoidPhrases: string[];
  modalities: string[] | undefined;
  coachNotes: string[];
}): void {
  const { exercises, findMeta, modalities } = args;
  const cardioEntries = exercises
    .map((e, i) => ({ row: e, index: i }))
    .filter(({ row }) => isCardioRow(row, findMeta));
  if (!cardioEntries.length) return;

  let keeper: { row: GeneratedSessionExercise; index: number } | undefined;
  for (const m of modalities ?? []) {
    keeper = cardioEntries.find(({ row }) =>
      cardioNameMatchesModality(row.name ?? '', m),
    );
    if (keeper) break;
  }
  keeper ??= cardioEntries[cardioEntries.length - 1]!;

  if (cardioEntries.length > 1) {
    for (const entry of [...cardioEntries].reverse()) {
      if (entry.index === keeper.index) continue;
      exercises.splice(entry.index, 1);
    }
    args.coachNotes.push(
      'Kept one short cardio finisher and removed extra conditioning so the strength work stays the focus.',
    );
  }

  const row = keeper.row;
  const matchesPreference =
    !modalities?.length ||
    modalities.some((m) => cardioNameMatchesModality(row.name ?? '', m));
  if (matchesPreference) return;

  const excludeIds = exercises
    .map((e) => e.exerciseId?.trim())
    .filter((id): id is string => !!id);
  const pick = pickLibraryCardioFinisherExercise(
    args.exercisesService,
    args.equipment,
    excludeIds,
    modalities,
    args.avoidPhrases,
  );
  if (
    !pick ||
    !modalities!.some((m) => cardioNameMatchesModality(pick.name, m))
  ) {
    return;
  }
  const sec = secondaryMusclesForPreview(
    pick.secondaryMuscleGroups,
    pick.primaryMuscleGroup,
  );
  row.name = pick.name;
  row.exerciseId = pick.id;
  row.primaryMuscleGroup = pick.primaryMuscleGroup;
  if (sec.length) row.secondaryMuscleGroups = sec;
  else delete row.secondaryMuscleGroups;
  // Time shape (sets 1 / seconds in reps / durationSeconds) was already
  // normalized on this row and carries over to the swapped-in modality.
  args.coachNotes.push(
    'Swapped the cardio finisher to match your preferred cardio style.',
  );
}

/**
 * Metabolic / finisher-style work — skip adding a second conditioning tail.
 * Do not treat loaded carries as metcon: names like "Farmer Handle Carry" or
 * "Waiter Carry" matched bare `farmer`/`carry` and wrongly blocked hybrid finishers.
 */
const METABOLIC_CONDITIONING =
  /\b(battle\s*rope|burpee|mountain\s*climber|jump\s*rope|jumping\s*jack|prowler|sled\s*push|sled\s+pull|farmer(?:'|’)?s?\s+walk|tabata|amrap|metcon|conditioning\s+circuit|box\s+jump|shuttle\s+run|ski\s+erg|airdyne|assault\s+bike)\b/i;

function maxStrengthExercisesForDuration(
  durationMinutes: number,
  detailLevel: 'simple' | 'detailed',
): number {
  const { promptRange } = exerciseTargetsForSession(
    durationMinutes,
    detailLevel,
    false,
  );
  const m = promptRange.match(/(\d+)\s*[-–]\s*(\d+)/);
  return m ? parseInt(m[2]!, 10) : 8;
}

function sessionLooksLikeFinisherConditioning(
  exercises: GeneratedSessionExercise[],
): boolean {
  const blob = exercises
    .map((e) => `${e.name ?? ''} ${e.notes ?? ''}`)
    .join(' ')
    .toLowerCase();
  return METABOLIC_CONDITIONING.test(blob);
}

/**
 * Enrichment-added rows we should not drop when trimming to a time cap.
 * Must match every note text the balance inserts below actually write
 * (legacy "Added for …" phrasing kept for sessions persisted before the
 * coach-language rewrite).
 */
const BALANCE_INSERT_NOTES =
  /Added (so pressing and pulling|so your week trains|to round out the day|for (pull balance|squat\/knee|hip hinge|pattern balance))/i;

export function exerciseRowIsBalanceInsert(
  e: GeneratedSessionExercise,
): boolean {
  return BALANCE_INSERT_NOTES.test(e.notes ?? '');
}

function pickStrengthTrimIndex(
  exercises: GeneratedSessionExercise[],
  findMeta: (
    id: string,
  ) => { movementPatterns?: string[]; primaryMuscleGroup?: string } | undefined,
): number {
  const n = exercises.length;
  const protectedIndices = new Set<number>();
  let protectedCompounds = 0;
  for (let i = 0; i < n; i++) {
    const e = exercises[i]!;
    const id = e.exerciseId?.trim();
    const meta = id ? findMeta(id) : undefined;
    const patterns = meta?.movementPatterns ?? [];
    const isCompound =
      patterns.includes('Push') ||
      patterns.includes('Pull') ||
      patterns.includes('Squat') ||
      patterns.includes('Hinge');
    if (isCompound && protectedCompounds < 2) {
      protectedIndices.add(i);
      protectedCompounds++;
    }
  }
  const tierOf = (i: number): number => {
    const e = exercises[i]!;
    const id = e.exerciseId?.trim();
    return movementTier(id ? findMeta(id) : undefined);
  };
  const skippable = (i: number): boolean => {
    if (exerciseRowIsBalanceInsert(exercises[i]!)) return true;
    if (protectedIndices.has(i)) return true;
    const id = exercises[i]!.exerciseId?.trim();
    if (id && findMeta(id)?.primaryMuscleGroup === 'Cardio') return true;
    return false;
  };
  for (const wantTier of [2, 1, 0] as const) {
    for (let i = n - 1; i >= 0; i--) {
      if (skippable(i)) continue;
      if (tierOf(i) === wantTier) return i;
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    if (!skippable(i)) return i;
  }
  return -1;
}

/**
 * Keeps strength sessions within the same high end as Groq's exercise-count cap so
 * enrichment (pull / squat-hinge / hybrid finisher) does not push time targets over.
 */
function trimStrengthExercisesToSoftCap(args: {
  exercises: GeneratedSessionExercise[];
  findMeta: (
    id: string,
  ) => { movementPatterns?: string[]; primaryMuscleGroup?: string } | undefined;
  maxEx: number;
  coachNotes: string[];
}): void {
  let removed = 0;
  while (args.exercises.length > args.maxEx) {
    const idx = pickStrengthTrimIndex(args.exercises, args.findMeta);
    if (idx < 0) break;
    args.exercises.splice(idx, 1);
    removed++;
  }
  if (removed > 0) {
    args.coachNotes.push(
      removed === 1
        ? 'We shortened this session to match your target length by dropping one lower-priority move so your main lifts stay sharp.'
        : `We shortened this session to match your target length by dropping ${removed} lower-priority moves so your main lifts stay sharp.`,
    );
  }
}

/**
 * When false, skip appending a library cardio row (session already long, short slot,
 * or clearly has conditioning-style work).
 *
 * Reserves one slot for the appended finisher: at the prompt-range high end we still
 * append (e.g. 6 strength moves at a 5–6 cap → 7 with finisher). Only skip when the
 * list is already longer than cap+1 (e.g. 8+ before append).
 */
export function shouldAppendHybridCardioFinisher(args: {
  exercises: GeneratedSessionExercise[];
  durationMinutes: number;
  detailLevel: 'simple' | 'detailed';
  hasCardioExercise: boolean;
  hasFinisherText: boolean;
}): boolean {
  if (args.hasCardioExercise || args.hasFinisherText) return false;
  if (sessionLooksLikeFinisherConditioning(args.exercises)) return false;
  if (args.durationMinutes < 38) return false;
  const maxEx = maxStrengthExercisesForDuration(
    args.durationMinutes,
    args.detailLevel,
  );
  if (args.exercises.length > maxEx + 1) return false;
  return true;
}

async function sortExercisesByCompoundOrder(
  exercises: GeneratedSessionExercise[],
  spec: { title?: string; type: string },
  exercisesService: ExercisesService,
): Promise<GeneratedSessionExercise[]> {
  const findMeta = (id: string) => exercisesService.findOne(id);
  const perm = idealStrengthExercisePermutation(
    exercises,
    findMeta,
    spec.title,
  );
  return Promise.all(
    perm.map(async (origIndex) => {
      const e = exercises[origIndex]!;
      const meta = e.exerciseId ? findMeta(e.exerciseId) : undefined;
      // Preserve any explicit `prescriptionType` already on the row — the cardio
      // finisher append at the end of `enrichGeneratedSession` deliberately sets
      // `'time'` for cardio rows whose library `prescriptionType` is missing.
      // Without this guard, the post-pass resort clobbers it back to `'reps'`.
      // Cardio meta is also a strong fallback (treadmill / bike with no name
      // regex match still implies time-based programming).
      const prescriptionType =
        e.prescriptionType ??
        meta?.prescriptionType ??
        ((meta?.primaryMuscleGroup ?? '').toLowerCase() === 'cardio'
          ? 'time'
          : inferPrescriptionTypeFromExerciseName(e.name));
      const secondaries = meta
        ? secondaryMusclesForPreview(
            meta.secondaryMuscleGroups,
            meta.primaryMuscleGroup,
          )
        : [];
      return {
        ...e,
        prescriptionType,
        primaryMuscleGroup: meta?.primaryMuscleGroup,
        ...(secondaries.length ? { secondaryMuscleGroups: secondaries } : {}),
      };
    }),
  );
}

export type EnrichSessionGenerationPrefs = {
  goal?: string;
  cardioModalities?: string[];
  /** Session length (minutes), typically mean of durationMin/Max — drives cardio + caps. */
  durationMinutes?: number;
  detailLevel?: 'simple' | 'detailed';
  /**
   * User's experience level — feeds `getSetRepGuidelines(goal, difficulty)` so
   * we can stamp `restSeconds` on each strength row in Phase 6b. Falls back to
   * `'intermediate'` inside the scheme lookup when omitted.
   */
  difficulty?: string;
  /**
   * Library `exerciseId`s already present on other sessions in this generated chunk.
   * Hybrid cardio finisher picks merge these into `excludeIds` so we do not append the
   * same catalog id twice across the chunk (`duplicate_exercise_id_across_chunk`).
   * Note: repeating a cardio modality across days is allowed by design — the
   * finisher conformance pass may still swap back to a modality match that
   * another day already uses.
   */
  chunkExcludeExerciseIds?: string[];
  /**
   * 0-based position of this session among the request's `type: 'cardio'` specs.
   * Drives the deterministic cardio-day template (steady vs intervals alternation
   * and modality rotation). Ignored on strength sessions.
   */
  cardioDayIndex?: number;
};

/**
 * Deterministic safety net for "novelty drift" in slot 1 — if the LLM opens the
 * session with a non-staple exercise (landmine variations, low-bar rotations,
 * influencer moves) and a curated anchor with a matching movement pattern is
 * available in the candidate pool, swap it. Mirrors the chunk validator's
 * `slot_one_not_anchor` check — that flag drives retry-tail demotion, this
 * swap fixes the symptom for the user when retry already used its budget.
 *
 * Constraints:
 * - Only mutates strength sessions (`spec.type === 'strength'`).
 * - Only swaps when the focus has anchors (cardio / recovery / narrow body-part
 *   focuses are skipped via `getAcceptedAnchorIdsForFocus` returning `[]`).
 * - Skips cardio rows when locating slot 1 (cardio finishers live at the tail).
 * - Refuses to swap if no candidate anchor shares a tracked movement pattern
 *   with slot 1 — prevents replacing a chest move with a row.
 * - Skips anchors the user's equipment can't support (a home dumbbell/band
 *   list never gets a barbell swapped in).
 * - Preserves the original sets/reps/weight scheme; only the exercise identity
 *   changes. Adds a coach note so the swap is visible in the reasoning copy.
 */
function ensureAnchorInSlotOne(args: {
  exercises: GeneratedSessionExercise[];
  spec: { title?: string; type: string };
  exercisesService: ExercisesService;
  equipment?: string[];
  avoidPhrases: string[];
  chunkExcludeExerciseIds: string[];
  coachNotes: string[];
}): void {
  const { exercises, spec } = args;
  if (spec.type !== 'strength') return;
  const accepted = getAcceptedAnchorIdsForFocus(spec.title ?? '');
  if (!accepted.length) return;
  const acceptedSet = new Set(accepted);
  const findMeta = (id: string) => args.exercisesService.findOne(id);

  let slotOneIdx = -1;
  for (let i = 0; i < exercises.length; i++) {
    const id = exercises[i]?.exerciseId?.trim();
    if (!id) continue;
    if (findMeta(id)?.primaryMuscleGroup === 'Cardio') continue;
    slotOneIdx = i;
    break;
  }
  if (slotOneIdx < 0) return;
  const slotOne = exercises[slotOneIdx]!;
  const slotOneId = slotOne.exerciseId?.trim();
  if (!slotOneId) return;
  if (acceptedSet.has(slotOneId)) return;

  const slotOneMeta = findMeta(slotOneId);
  const slotOnePatterns = new Set(slotOneMeta?.movementPatterns ?? []);
  const sessionExcludeIds = new Set(
    exercises.map((e) => e.exerciseId?.trim()).filter((x): x is string => !!x),
  );
  const chunkExcludeSet = new Set(args.chunkExcludeExerciseIds);

  for (const anchorId of accepted) {
    if (sessionExcludeIds.has(anchorId)) continue;
    if (chunkExcludeSet.has(anchorId)) continue;
    const anchorMeta = findMeta(anchorId);
    if (!anchorMeta) continue;
    if (anchorMeta.primaryMuscleGroup === 'Cardio') continue;
    if (nameMatchesAvoidList(anchorMeta.name, args.avoidPhrases)) continue;
    // Respect the user's equipment (home users must not get barbell anchors).
    // Required-only equipment; empty means bodyweight-doable anywhere.
    if (
      args.equipment?.length &&
      !equipmentSatisfies(
        anchorMeta.primaryEquipment ?? anchorMeta.equipment,
        args.equipment,
      )
    ) {
      continue;
    }
    const anchorPatterns = anchorMeta.movementPatterns ?? [];
    if (
      slotOnePatterns.size &&
      !anchorPatterns.some((p) => slotOnePatterns.has(p))
    ) {
      continue;
    }
    const sec = secondaryMusclesForPreview(
      anchorMeta.secondaryMuscleGroups,
      anchorMeta.primaryMuscleGroup,
    );
    exercises.splice(slotOneIdx, 1, {
      name: anchorMeta.name,
      exerciseId: anchorMeta.id,
      sets: slotOne.sets,
      reps: slotOne.reps,
      ...(slotOne.weight != null ? { weight: slotOne.weight } : {}),
      notes: 'Your main lift today: start here while you are freshest.',
      prescriptionType:
        anchorMeta.prescriptionType ??
        inferPrescriptionTypeFromExerciseName(anchorMeta.name),
      primaryMuscleGroup: anchorMeta.primaryMuscleGroup,
      ...(sec.length ? { secondaryMuscleGroups: sec } : {}),
    });
    args.coachNotes.push(
      'We led off this session with a staple compound so your heaviest work happens on a proven main lift.',
    );
    return;
  }
}

/**
 * Post-LLM equipment gate. Generation candidate pools filter on required
 * equipment, but the model can emit any exercise it knows and chunk repair
 * happily maps the name to a library id — live captures showed a Pinch Block
 * Carry on a dumbbell/band pull day and a pool-only swim row at home. Swap
 * every row whose required equipment the user lacks for a same-pattern
 * candidate from the equipment-filtered focus pool; when nothing fits, drop
 * the row rather than prescribe gear the user does not own (but never below
 * three strength rows — an imperfect pick beats a hollow session).
 * Runs before the balance/ordering passes so they evaluate the final rows.
 */
function conformExercisesToEquipment(args: {
  exercises: GeneratedSessionExercise[];
  spec: { title?: string; type: string };
  exercisesService: ExercisesService;
  equipment?: string[];
  avoidPhrases: string[];
  chunkExcludeExerciseIds: string[];
  coachNotes: string[];
}): void {
  const { exercises, spec, exercisesService, equipment } = args;
  if (spec.type !== 'strength') return;
  if (!equipment?.length) return;
  const findMeta = (id: string) => exercisesService.findOne(id);

  const rowIsCardio = (e: GeneratedSessionExercise): boolean => {
    const id = e.exerciseId?.trim();
    const group =
      (id ? findMeta(id)?.primaryMuscleGroup : undefined) ??
      e.primaryMuscleGroup;
    return (group ?? '').toLowerCase() === 'cardio';
  };

  let adjusted = false;
  for (let i = exercises.length - 1; i >= 0; i--) {
    const row = exercises[i]!;
    const id = row.exerciseId?.trim();
    if (!id) continue;
    const meta = findMeta(id);
    if (!meta) continue;
    if (equipmentSatisfies(meta.primaryEquipment ?? meta.equipment, equipment))
      continue;

    const isCardio = rowIsCardio(row);
    const rowPatterns = new Set(meta.movementPatterns ?? []);
    const ids = new Set(
      exercises
        .map((e) => e.exerciseId?.trim())
        .filter((x): x is string => !!x),
    );
    const names = new Set(
      exercises.map((e) => (e.name ?? '').trim().toLowerCase()),
    );
    const pool = exercisesService.getCandidatesForGenerator({
      focus: isCardio ? 'cardio' : (spec.title ?? 'full body'),
      equipment,
      excludeIds: [...ids, ...args.chunkExcludeExerciseIds],
      limit: 90,
    });
    const pick = pool.find(
      (c) =>
        !ids.has(c.id) &&
        !names.has((c.name ?? '').trim().toLowerCase()) &&
        !nameMatchesAvoidList(c.name, args.avoidPhrases) &&
        (isCardio
          ? c.primaryMuscleGroup === 'Cardio'
          : c.primaryMuscleGroup !== 'Cardio' &&
            (!rowPatterns.size ||
              (c.movementPatterns ?? []).some((p) => rowPatterns.has(p)))),
    );
    if (pick) {
      const sec = secondaryMusclesForPreview(
        pick.secondaryMuscleGroups,
        pick.primaryMuscleGroup,
      );
      exercises.splice(i, 1, {
        name: pick.name,
        exerciseId: pick.id,
        sets: row.sets,
        reps: row.reps,
        ...(row.weight != null ? { weight: row.weight } : {}),
        notes: 'Swapped in to match the equipment you have available.',
        prescriptionType:
          pick.prescriptionType ??
          inferPrescriptionTypeFromExerciseName(pick.name),
        primaryMuscleGroup: pick.primaryMuscleGroup,
        ...(sec.length ? { secondaryMuscleGroups: sec } : {}),
      });
      adjusted = true;
    } else {
      const strengthRowsLeft = exercises.filter(
        (e, j) => j !== i && !rowIsCardio(e),
      ).length;
      if (isCardio || strengthRowsLeft >= 3) {
        exercises.splice(i, 1);
        adjusted = true;
      }
    }
  }
  if (adjusted) {
    args.coachNotes.push(
      'We adjusted this session to stick to the equipment you have available.',
    );
  }
}

/**
 * Within-session redundancy guard: stops a session stacking 3+ of the same
 * movement family. Caps (≤2 each) on lower-body dominance (lunge/squat/hinge),
 * push angle, pull angle, and base-movement family, swapping the excess (latest,
 * non-anchor, non-balance-insert rows) for a different movement from the focus
 * candidate pool. Preserves the swapped row's sets/reps; only the exercise
 * identity changes. No-ops when the candidate pool is empty (e.g. eval mocks).
 */
function capRedundantMovementFamilies(args: {
  exercises: GeneratedSessionExercise[];
  spec: { title?: string; type: string };
  exercisesService: ExercisesService;
  equipment?: string[];
  avoidPhrases: string[];
  chunkExcludeExerciseIds: string[];
  coachNotes: string[];
}): void {
  const {
    exercises,
    spec,
    exercisesService,
    equipment,
    avoidPhrases,
    chunkExcludeExerciseIds,
    coachNotes,
  } = args;
  if (spec.type !== 'strength') return;

  const MAX_PER_FAMILY = 2;
  const findMeta = (id: string) => exercisesService.findOne(id);

  const isStrengthRow = (e: GeneratedSessionExercise): boolean => {
    const id = e.exerciseId?.trim();
    const group =
      (id ? findMeta(id)?.primaryMuscleGroup : undefined) ??
      e.primaryMuscleGroup;
    return (group ?? '').toLowerCase() !== 'cardio';
  };

  // Never swap the slot-0 anchor or a deterministic balance insert.
  const protectedIdx = new Set<number>();
  for (let i = 0; i < exercises.length; i++) {
    if (isStrengthRow(exercises[i]!)) {
      protectedIdx.add(i);
      break;
    }
  }
  exercises.forEach((e, i) => {
    if (exerciseRowIsBalanceInsert(e)) protectedIdx.add(i);
  });

  const presentIds = () =>
    new Set(
      exercises
        .map((e) => e.exerciseId?.trim())
        .filter((x): x is string => !!x),
    );
  const presentNames = () =>
    new Set(exercises.map((e) => (e.name ?? '').trim().toLowerCase()));

  /** Replace exercises[index] with a focus-pool exercise satisfying `accept`. */
  const trySwap = (
    index: number,
    accept: (candidateName: string) => boolean,
  ): boolean => {
    const ids = presentIds();
    const names = presentNames();
    const pool = exercisesService.getCandidatesForGenerator({
      focus: spec.title ?? 'full body',
      equipment: equipment?.length ? equipment : undefined,
      excludeIds: [...ids, ...chunkExcludeExerciseIds],
      limit: 90,
    });
    const pick = pool.find(
      (c) =>
        c.primaryMuscleGroup !== 'Cardio' &&
        !ids.has(c.id) &&
        !names.has((c.name ?? '').trim().toLowerCase()) &&
        !nameMatchesAvoidList(c.name, avoidPhrases) &&
        accept(c.name ?? ''),
    );
    if (!pick) return false;
    const prev = exercises[index]!;
    const sec = secondaryMusclesForPreview(
      pick.secondaryMuscleGroups,
      pick.primaryMuscleGroup,
    );
    exercises[index] = {
      name: pick.name,
      exerciseId: pick.id,
      sets: prev.sets,
      reps: prev.reps,
      ...(prev.weight != null ? { weight: prev.weight } : {}),
      notes:
        'Swapped in for movement variety since a similar lift is already in this session.',
      prescriptionType:
        pick.prescriptionType ??
        inferPrescriptionTypeFromExerciseName(pick.name),
      primaryMuscleGroup: pick.primaryMuscleGroup,
      ...(sec.length ? { secondaryMuscleGroups: sec } : {}),
    };
    return true;
  };

  let swaps = 0;

  /**
   * Cap any key (skipping `null` keys) at `max`, swapping the excess. When
   * `preferSwapTo` is given, candidates matching it are tried before any other
   * out-of-family candidate (e.g. cap presses by swapping in a pull).
   */
  const capByKey = (
    keyOf: (name: string) => string | null,
    max: number = MAX_PER_FAMILY,
    preferSwapTo?: (name: string) => boolean,
  ): void => {
    const groups = new Map<string, number[]>();
    exercises.forEach((e, i) => {
      if (!isStrengthRow(e)) return;
      const k = keyOf(e.name ?? '');
      if (!k) return;
      const arr = groups.get(k);
      if (arr) arr.push(i);
      else groups.set(k, [i]);
    });
    // Live counts per key: a replacement must not push a *sibling* family over
    // the cap (observed: capping 3 squats swapped in a deadlift that made a
    // third hinge — the groups snapshot alone can't see that).
    const counts = new Map<string, number>();
    for (const [k, idxs] of groups) counts.set(k, idxs.length);
    for (const [key, idxs] of groups) {
      let excess = (counts.get(key) ?? 0) - max;
      if (excess <= 0) continue;
      // Trim from the end (lowest-priority rows) first.
      const swappable = idxs
        .filter((i) => !protectedIdx.has(i))
        .sort((a, b) => b - a);
      for (const i of swappable) {
        if (excess <= 0) break;
        const acceptable = (name: string): boolean => {
          const k = keyOf(name);
          if (k === key) return false;
          return !k || (counts.get(k) ?? 0) < max;
        };
        const swapped =
          (preferSwapTo != null &&
            trySwap(i, (name) => acceptable(name) && preferSwapTo(name))) ||
          trySwap(i, acceptable);
        if (swapped) {
          const newKey = keyOf(exercises[i]!.name ?? '');
          if (newKey) counts.set(newKey, (counts.get(newKey) ?? 0) + 1);
          counts.set(key, (counts.get(key) ?? 0) - 1);
          excess--;
          swaps++;
        }
      }
    }
  };

  // Dominance caps used to run only on lower-emphasis days, but a full-body
  // day can stack 3 hinge variants just as easily — run them everywhere.
  capByKey((n) => {
    const d = classifyLowerDominance(n);
    return d === 'other' ? null : `dom:${d}`;
  });
  capByKey((n) => {
    const a = classifyPushAngle(n);
    return a === 'other' ? null : `push:${a}`;
  });
  capByKey((n) => {
    const a = classifyPullAngle(n);
    return a === 'other' ? null : `pull:${a}`;
  });
  capByKey((n) => {
    const f = baseMovementFamily(n);
    return f ? `base:${f}` : null;
  });

  // Total-press cap: the per-angle caps still allow flat + incline + decline +
  // overhead on one day (live: 4 presses vs 1 pull on an Upper day). Days whose
  // title IS press work keep their presses; an upper/mixed day caps at 3, any
  // other strength day at 2. Excess rows swap to a pull first, so the day's
  // push:pull balance improves with the same pass.
  const titleLower = (spec.title ?? '').toLowerCase();
  const isPressFocusDay =
    /\b(push|chest|shoulders?|press)\b/.test(titleLower) &&
    !/\b(pull|back|legs?)\b/.test(titleLower);
  if (!isPressFocusDay) {
    const pressMax = /\bupper\b/.test(titleLower) ? 3 : 2;
    capByKey(
      (n) => (classifyPushAngle(n) === 'other' ? null : 'press:total'),
      pressMax,
      (n) => classifyPullAngle(n) !== 'other',
    );
  }

  if (swaps > 0) {
    coachNotes.push(
      swaps === 1
        ? 'We swapped one lift so this session does not stack several near-identical movements.'
        : `We swapped ${swaps} lifts so this session does not stack several near-identical movements.`,
    );
  }
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
  generationPrefs?: EnrichSessionGenerationPrefs,
): Promise<GeneratedSession> {
  if (spec.type !== 'strength') {
    // Cardio days are built deterministically — the model's cardio rows ship
    // with strength-style sets/reps and no metadata, so we replace them with a
    // clear modality plan (see cardio-day-template.ts). Recovery days pass
    // through untouched for now.
    if (spec.type === 'cardio') {
      return buildCardioDaySession({
        session,
        library: exercisesService,
        equipment,
        avoidPhrases,
        modalities: generationPrefs?.cardioModalities,
        durationMinutes: generationPrefs?.durationMinutes,
        cardioDayIndex: generationPrefs?.cardioDayIndex,
        chunkExcludeExerciseIds: generationPrefs?.chunkExcludeExerciseIds,
      });
    }
    const findName = (id: string) => exercisesService.findOne(id);
    return {
      ...session,
      reasoning: humanizeExerciseIdsInCopy(session.reasoning, findName),
      warmUp: humanizeExerciseIdsInCopy(session.warmUp, findName),
      coolDown: humanizeExerciseIdsInCopy(session.coolDown, findName),
    };
  }

  let exercises = await sortExercisesByCompoundOrder(
    [...session.exercises],
    spec,
    exercisesService,
  );
  const coachNotes: string[] = [];
  const findMeta = (id: string) => exercisesService.findOne(id);

  for (const ex of exercises) {
    if (ex.exerciseId && !findMeta(ex.exerciseId)) {
      console.warn(
        `[Enrichment] exerciseId '${ex.exerciseId}' not found in catalog — LLM hallucination or stale id`,
      );
    }
  }

  conformExercisesToEquipment({
    exercises,
    spec,
    exercisesService,
    equipment,
    avoidPhrases,
    chunkExcludeExerciseIds: generationPrefs?.chunkExcludeExerciseIds ?? [],
    coachNotes,
  });

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
    // The 'pull' pool is muscle-group based (Back + Arms), so it also holds
    // triceps/biceps isolation. Only insert a movement that satisfies the same
    // PULL_NAME predicate that flagged the session — otherwise a live run can
    // add a cable pushdown "for pull balance" (observed in capture logs).
    const pick = pullPool.find(
      (c) =>
        PULL_NAME.test(c.name) &&
        !exercises.some((e) => e.exerciseId === c.id || e.name === c.name) &&
        !nameMatchesAvoidList(c.name, avoidPhrases),
    );
    if (pick) {
      const insertAt = Math.min(2, exercises.length);
      const pullSecondaries = secondaryMusclesForPreview(
        pick.secondaryMuscleGroups,
        pick.primaryMuscleGroup,
      );
      exercises.splice(insertAt, 0, {
        name: pick.name,
        exerciseId: pick.id,
        sets: 3,
        reps: 10,
        notes: 'Added so pressing and pulling stay balanced.',
        prescriptionType:
          pick.prescriptionType ??
          inferPrescriptionTypeFromExerciseName(pick.name),
        primaryMuscleGroup: pick.primaryMuscleGroup,
        ...(pullSecondaries.length
          ? { secondaryMuscleGroups: pullSecondaries }
          : {}),
      });
      coachNotes.push(
        'Added a pulling movement so pressing and pulling stay balanced.',
      );
    }
  }

  if (sessionTitleNeedsSquatHingeBalance(spec.title, spec.type)) {
    let cover = unionPatternsFromSession(exercises, findMeta);
    if (cover.withMetaCount >= 2) {
      const excludeForLower = () =>
        exercises.map((e) => e.exerciseId).filter((id): id is string => !!id);
      const lowerPool = () =>
        exercisesService.getCandidatesForGenerator({
          focus: 'lower',
          equipment: equipment?.length ? equipment : undefined,
          excludeIds: excludeForLower(),
          limit: 60,
        });
      if (!cover.union.has('Squat')) {
        const pick = lowerPool().find(
          (c) =>
            c.movementPatterns?.includes('Squat') &&
            !exercises.some(
              (e) => e.exerciseId === c.id || e.name === c.name,
            ) &&
            !nameMatchesAvoidList(c.name, avoidPhrases),
        );
        if (pick) {
          const insertAt = Math.min(1, exercises.length);
          const sec = secondaryMusclesForPreview(
            pick.secondaryMuscleGroups,
            pick.primaryMuscleGroup,
          );
          exercises.splice(insertAt, 0, {
            name: pick.name,
            exerciseId: pick.id,
            sets: 3,
            reps: 8,
            notes: 'Added to round out the day with a squat pattern.',
            prescriptionType:
              pick.prescriptionType ??
              inferPrescriptionTypeFromExerciseName(pick.name),
            primaryMuscleGroup: pick.primaryMuscleGroup,
            ...(sec.length ? { secondaryMuscleGroups: sec } : {}),
          });
          coachNotes.push(
            'Added a squat-pattern lift so the day trains both squatting and hinging.',
          );
          cover = unionPatternsFromSession(exercises, findMeta);
        }
      }
      if (!cover.union.has('Hinge')) {
        const pick = lowerPool().find(
          (c) =>
            c.movementPatterns?.includes('Hinge') &&
            !exercises.some(
              (e) => e.exerciseId === c.id || e.name === c.name,
            ) &&
            !nameMatchesAvoidList(c.name, avoidPhrases),
        );
        if (pick) {
          const insertAt = Math.min(2, exercises.length);
          const sec = secondaryMusclesForPreview(
            pick.secondaryMuscleGroups,
            pick.primaryMuscleGroup,
          );
          exercises.splice(insertAt, 0, {
            name: pick.name,
            exerciseId: pick.id,
            sets: 3,
            reps: 6,
            notes: 'Added to round out the day with a hip hinge.',
            prescriptionType:
              pick.prescriptionType ??
              inferPrescriptionTypeFromExerciseName(pick.name),
            primaryMuscleGroup: pick.primaryMuscleGroup,
            ...(sec.length ? { secondaryMuscleGroups: sec } : {}),
          });
          coachNotes.push(
            'Added a hip-hinge lift so the day trains both squatting and hinging.',
          );
        }
      }
    }
  }

  exercises = await sortExercisesByCompoundOrder(
    exercises,
    spec,
    exercisesService,
  );

  // Break up too-many-of-one-family stacking (e.g. 4 lunges, 3 landmine presses)
  // before the soft-cap trim and the role-aware rep stamp run.
  capRedundantMovementFamilies({
    exercises,
    spec,
    exercisesService,
    equipment,
    avoidPhrases,
    chunkExcludeExerciseIds: generationPrefs?.chunkExcludeExerciseIds ?? [],
    coachNotes,
  });

  if (generationPrefs) {
    const detailForCap = generationPrefs.detailLevel ?? 'detailed';
    const rawDur = generationPrefs.durationMinutes;
    const durationForSoftCap =
      typeof rawDur === 'number' && Number.isFinite(rawDur) && rawDur > 0
        ? Math.round(rawDur)
        : 50;
    const maxStrengthSlots = maxStrengthExercisesForDuration(
      durationForSoftCap,
      detailForCap,
    );
    trimStrengthExercisesToSoftCap({
      exercises,
      findMeta,
      maxEx: maxStrengthSlots,
      coachNotes,
    });
  }

  if (
    generationPrefs &&
    goalWantsStrengthCardioFinisher(generationPrefs.goal) &&
    spec.type === 'strength'
  ) {
    const hasCardioExercise = exercises.some((e) => {
      const id = e.exerciseId?.trim();
      if (!id) return false;
      return findMeta(id)?.primaryMuscleGroup === 'Cardio';
    });
    const hasFinisherText = !!session.cardioFinisher?.suggestion?.trim();
    const detailLevel = generationPrefs.detailLevel ?? 'detailed';
    const rawDuration = generationPrefs.durationMinutes;
    const durationForCap =
      typeof rawDuration === 'number' &&
      Number.isFinite(rawDuration) &&
      rawDuration > 0
        ? Math.round(rawDuration)
        : 50;

    if (
      shouldAppendHybridCardioFinisher({
        exercises,
        durationMinutes: durationForCap,
        detailLevel,
        hasCardioExercise,
        hasFinisherText,
      })
    ) {
      const sessionExcludeIds = exercises
        .map((e) => e.exerciseId)
        .filter((id): id is string => !!id?.trim());
      const chunkEx = (generationPrefs.chunkExcludeExerciseIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
      const excludeIds = [...new Set([...sessionExcludeIds, ...chunkEx])];
      const pick = pickLibraryCardioFinisherExercise(
        exercisesService,
        equipment,
        excludeIds,
        generationPrefs.cardioModalities,
        avoidPhrases,
      );
      if (pick) {
        const sec = secondaryMusclesForPreview(
          pick.secondaryMuscleGroups,
          pick.primaryMuscleGroup,
        );
        exercises.push({
          name: pick.name,
          exerciseId: pick.id,
          sets: 1,
          // 600s = 10 min, the midpoint of the 8–12 min band already in the
          // notes. The frontend formatter converts seconds → "10 min" when
          // `prescriptionType === 'time'` and `reps >= 60` (see
          // `formatExerciseRepsDisplay` in `frontend/src/lib/planPipeline.ts`).
          reps: 600,
          notes:
            'Short steady-state finisher (~8–12 min easy effort). Skip on a busy day if you prefer.',
          // Cardio finishers are time-based regardless of name (treadmill /
          // bike / rower / etc.). Force `time` so the row shows "10 min" not
          // a rep band even when the picked row's `prescriptionType` is stale.
          prescriptionType:
            pick.primaryMuscleGroup === 'Cardio'
              ? 'time'
              : (pick.prescriptionType ??
                inferPrescriptionTypeFromExerciseName(pick.name)),
          primaryMuscleGroup: pick.primaryMuscleGroup,
          ...(sec.length ? { secondaryMuscleGroups: sec } : {}),
        });
        coachNotes.push(
          'We added a short, easy cardio finisher for your hybrid-style goal. Skip it when you are short on time.',
        );
      }
    }
  }

  exercises = await sortExercisesByCompoundOrder(
    exercises,
    spec,
    exercisesService,
  );
  ensureAnchorInSlotOne({
    exercises,
    spec,
    exercisesService,
    equipment,
    avoidPhrases,
    chunkExcludeExerciseIds: generationPrefs?.chunkExcludeExerciseIds ?? [],
    coachNotes,
  });
  moveCardioExercisesLast(exercises, findMeta);
  normalizeCardioRowShape(exercises, findMeta);
  conformStrengthDayCardioFinisher({
    exercises,
    findMeta,
    exercisesService,
    equipment,
    avoidPhrases,
    modalities: generationPrefs?.cardioModalities,
    coachNotes,
  });
  // Stamp role-aware sets + rep ranges before clamping so the duration/experience
  // cap still trims the resulting working-set total to fit the session length.
  stampSetsAndReps(exercises, findMeta, generationPrefs);
  clampSessionWorkingSets(exercises, findMeta, generationPrefs);

  stampRestSeconds(exercises, findMeta, generationPrefs);

  const mainName = inferMainLiftName(exercises, { findMeta });
  const warmUp = humanizeExerciseIdsInCopy(
    tieWarmupToMainLift(session.warmUp, mainName),
    findMeta,
  );
  const reasoning = humanizeExerciseIdsInCopy(
    appendDeterministicCoachNotes(
      buildStrengthReasoning(exercises, findMeta) ?? session.reasoning,
      coachNotes,
    ),
    findMeta,
  );
  const coolDown =
    humanizeExerciseIdsInCopy(session.coolDown, findMeta)?.trim() ||
    '2–5 minutes of easy walking or light cycling, then brief static stretching for the muscles you trained.';

  return { ...session, warmUp, exercises, reasoning, coolDown };
}

/**
 * Stamp `restSeconds` on each non-cardio strength row from the goal+difficulty
 * scheme. The first compound (anchor) row gets a +30s bump because the trainer
 * convention is to give the heaviest lift longer rest than accessories — keeps
 * the preview honest without requiring an LLM round trip.
 *
 * Cardio rows are left untouched: the inter-set rest concept doesn't apply,
 * and the row is rendered as a duration ("10 min") rather than "sets × reps".
 */
function stampRestSeconds(
  exercises: GeneratedSessionExercise[],
  findMeta: (id: string) => { primaryMuscleGroup?: string } | undefined,
  prefs: EnrichSessionGenerationPrefs | undefined,
): void {
  const guidelines = getSetRepGuidelines(prefs?.goal, prefs?.difficulty);
  const baseRest = guidelines.restSeconds;
  if (!baseRest || baseRest <= 0) return;
  let firstStrengthSeen = false;
  for (const ex of exercises) {
    const id = ex.exerciseId?.trim();
    const meta = id ? findMeta(id) : undefined;
    if ((meta?.primaryMuscleGroup ?? '').toLowerCase() === 'cardio') continue;
    if ((ex.primaryMuscleGroup ?? '').toLowerCase() === 'cardio') continue;
    if (ex.restSeconds == null) {
      ex.restSeconds = firstStrengthSeen ? baseRest : baseRest + 30;
    }
    firstStrengthSeen = true;
  }
}

/** Loose shape of the catalog metadata `stampSetsAndReps` reads (subset of `TransformedExercise`). */
type RoleMeta = {
  type?: string;
  movementPatterns?: string[];
  primaryMuscleGroup?: string;
  equipment?: string[];
};

type BaseRole = 'compound' | 'isolation' | 'core';

/**
 * Classify an exercise into compound / isolation / core from catalog metadata,
 * falling back to the name. Cardio rows are handled separately (durationSeconds)
 * and never reach here. Reuses the existing `BIG_FOUR` patterns + `ISOLATION_NAME`.
 */
function classifyExerciseBaseRole(
  meta: RoleMeta | undefined,
  name: string,
): BaseRole {
  if ((meta?.primaryMuscleGroup ?? '').toLowerCase() === 'core') return 'core';

  // Unambiguous isolation names (fly, curl, pushdown, lateral raise, kickback, …)
  // are very high precision — no compound lift carries them — so they win even
  // over a catalog `type`/pattern that (mis)labels the row as compound.
  if (ISOLATION_NAME.test(name)) return 'isolation';

  // Explicit catalog `type` next; it beats the movement pattern (a triceps
  // pushdown can carry a "Push" pattern yet still be isolation).
  const typeStr = (meta?.type ?? '').toLowerCase();
  if (typeStr === 'isolation') return 'isolation';
  if (typeStr === 'compound') return 'compound';

  const patterns = meta?.movementPatterns ?? [];
  if (BIG_FOUR.some((p) => patterns.includes(p))) return 'compound';

  // Unknown accessories default to the isolation (higher-rep, fewer-set) scheme.
  return 'isolation';
}

/**
 * Stamp `sets` + `repsMin`/`repsMax` on each non-cardio strength row from
 * `goal × difficulty × role` (see {@link getRoleAwareScheme}). The first compound
 * in the (already compound-sorted) list becomes the heavy `primary_compound`
 * anchor; later compounds are `secondary_compound`. `reps` is set to `repsMin`
 * as the working default for set logging + progression math.
 *
 * Runs before {@link clampSessionWorkingSets} so the duration cap still trims the
 * total. Cardio + time-hold rows are skipped (they render as a duration).
 */
function stampSetsAndReps(
  exercises: GeneratedSessionExercise[],
  findMeta: (id: string) => RoleMeta | undefined,
  prefs: EnrichSessionGenerationPrefs | undefined,
): void {
  let primaryCompoundAssigned = false;
  for (const ex of exercises) {
    const id = ex.exerciseId?.trim();
    const meta = id ? findMeta(id) : undefined;

    // Cardio rows carry a duration, not reps (already shaped in normalizeCardioRowShape).
    if ((meta?.primaryMuscleGroup ?? '').toLowerCase() === 'cardio') continue;
    if ((ex.primaryMuscleGroup ?? '').toLowerCase() === 'cardio') continue;
    // Time-holds (planks / hangs / static holds) aren't rep-counted. Give them an
    // explicit duration so the UI shows "~40 sec" instead of the model's leftover
    // rep count as seconds, and never stamp a rep range on them.
    if (ex.prescriptionType === 'time') {
      if (ex.durationSeconds == null) {
        ex.durationSeconds =
          ex.reps != null && Number.isFinite(ex.reps) && ex.reps >= 20
            ? Math.round(ex.reps)
            : 40;
      }
      ex.repsMin = undefined;
      ex.repsMax = undefined;
      continue;
    }

    const baseRole = classifyExerciseBaseRole(meta, ex.name);
    let role: ExerciseRole;
    if (baseRole === 'core') {
      role = 'core';
    } else if (baseRole === 'isolation') {
      role = 'isolation';
    } else {
      role = primaryCompoundAssigned
        ? 'secondary_compound'
        : 'primary_compound';
      primaryCompoundAssigned = true;
    }

    const scheme = getRoleAwareScheme(prefs?.goal, prefs?.difficulty, role);
    let repsMin = scheme.repsMin;
    let repsMax = scheme.repsMax;

    // Bodyweight compounds (push-ups, pull-ups, dips) carry light relative load —
    // bump into a higher rep band so they aren't prescribed like a loaded barbell lift.
    const equip = (meta?.equipment ?? []).map((e) => e.toLowerCase());
    const bodyweightOnly =
      equip.length > 0 && equip.every((e) => e === 'bodyweight');
    if (
      bodyweightOnly &&
      (role === 'primary_compound' || role === 'secondary_compound')
    ) {
      repsMin = Math.min(25, repsMin + 4);
      repsMax = Math.min(25, repsMax + 4);
    }

    ex.sets = scheme.sets;
    ex.repsMin = repsMin;
    ex.repsMax = repsMax;
    ex.reps = repsMin;
  }
}

function collectDistinctExerciseIds(session: GeneratedSession): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of session.exercises ?? []) {
    const id = e.exerciseId?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export type EnrichChunkSessionSpec = { type: string; title?: string };

/**
 * Enrich strength sessions in chunk order so hybrid cardio finishers avoid library ids
 * already used on sibling sessions (pre/post enrichment ids from other slots).
 */
export async function enrichGeneratedSessionsInChunkOrder(
  sessions: GeneratedSession[],
  opts: {
    getSpec: (index: number) => EnrichChunkSessionSpec | undefined;
    getAvoidPhrases: (index: number) => string[];
    getGenerationPrefs: (
      index: number,
    ) => EnrichSessionGenerationPrefs | undefined;
    exercisesService: ExercisesService;
    equipment?: string[];
  },
): Promise<GeneratedSession[]> {
  const out: GeneratedSession[] = [];
  for (let i = 0; i < sessions.length; i++) {
    const spec = opts.getSpec(i);
    if (!spec) {
      out.push(sessions[i]!);
      continue;
    }
    const chunkExcludeExerciseIds: string[] = [];
    const seenChunk = new Set<string>();
    for (let j = 0; j < sessions.length; j++) {
      if (j === i) continue;
      const sess = j < i ? out[j]! : sessions[j]!;
      for (const id of collectDistinctExerciseIds(sess)) {
        if (seenChunk.has(id)) continue;
        seenChunk.add(id);
        chunkExcludeExerciseIds.push(id);
      }
    }
    const base = opts.getGenerationPrefs(i);
    const generationPrefs: EnrichSessionGenerationPrefs | undefined =
      base === undefined && chunkExcludeExerciseIds.length === 0
        ? undefined
        : {
            ...base,
            ...(chunkExcludeExerciseIds.length
              ? { chunkExcludeExerciseIds }
              : {}),
          };
    const enriched = await enrichGeneratedSession(
      sessions[i]!,
      spec,
      opts.exercisesService,
      opts.equipment?.length ? opts.equipment : undefined,
      opts.getAvoidPhrases(i),
      generationPrefs,
    );
    out.push(enriched);
  }
  return out;
}
