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
import { getSetRepGuidelines } from '../data/set-rep-schemes';

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
const ISOLATION_NAME =
  /\b(fly|flies|flyes|cable\s+fly|pec\s+deck|curl|curls|\bcable\s+curl|lateral\s+raise|front\s+raise|skull|push[-\s]?down|kickback|crossover|pullover|shrug|wrist|rear\s+delt|triceps\s+extension|overhead\s+extension)\b/i;

/** Squat / hinge class movements that belong on lower days, not Upper/Push/Pull focus. */
const LOWER_PATTERN_NAME =
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
export function sessionTitleIsUpperEmphasis(title: string | undefined): boolean {
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
  return /\bupper\b|\bpush\b|\bpull\b|\bchest\b|\bback\b|\bshoulders?\b|\barms\b/.test(t);
}

/** Lower / legs strength days where knee-dominant + hip hinge coverage is expected when metadata allows checks. */
export function sessionTitleNeedsSquatHingeBalance(
  title: string | undefined,
  type: string,
): boolean {
  if (type !== 'strength') return false;
  const t = (title ?? '').toLowerCase();
  if (/\b(cardio|recovery|run|conditioning)\b/.test(t)) return false;
  if (/\bupper\b|\bpush\b|\bpull\b|\bchest\b|\bback\b|\bshoulders\b|\barms\b/.test(t)) {
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

/**
 * Best lift to anchor warm-up copy: prefers compounds, avoids fly/curl-class isolation first,
 * and on upper-emphasis titles avoids deadlift/squat-class patterns when metadata or names allow.
 */
export function inferMainLiftName(
  exercises: GeneratedSessionExercise[],
  options?: {
    sessionTitle?: string;
    findMeta?: (id: string) => { movementPatterns?: string[] } | undefined;
  },
): string | null {
  const title = options?.sessionTitle;
  const findMeta = options?.findMeta;
  const candidates = exercises.filter(
    (e) =>
      (e.sets ?? 0) >= 3 && !/warm|stretch|cool|mobility|foam/i.test(e.name),
  );
  if (!candidates.length) {
    const fallback = exercises.find((e) => (e.sets ?? 0) > 0);
    return fallback?.name ?? null;
  }
  const scoreLift = (e: GeneratedSessionExercise): number => {
    let s = 0;
    const name = (e.name ?? '').toLowerCase();
    if (ISOLATION_NAME.test(name)) s -= 65;
    if (sessionTitleIsUpperEmphasis(title) && LOWER_PATTERN_NAME.test(name)) {
      s -= 85;
    }
    if (findMeta && e.exerciseId) {
      const p = findMeta(e.exerciseId)?.movementPatterns ?? [];
      if (p.includes('Push') || p.includes('Pull')) s += 15;
      if (p.includes('Hinge') || p.includes('Squat')) {
        s += sessionTitleIsUpperEmphasis(title) ? -55 : 10;
      }
    }
    s += Math.min(24, (e.sets ?? 0) * 2);
    return s;
  };
  const sorted = [...candidates].sort((a, b) => scoreLift(b) - scoreLift(a));
  return sorted[0]?.name ?? candidates[0]?.name ?? null;
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
  findMeta: (id: string) =>
    | { movementPatterns?: string[]; primaryMuscleGroup?: string }
    | undefined,
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

/** Aligns with `WorkoutGeneratorService.cardioExerciseMatchesModality` for enrichment picks. */
function cardioNameMatchesModality(name: string, modality: string): boolean {
  const n = (name ?? '').toLowerCase();
  const m = modality.toLowerCase().trim();
  if (!m) return false;
  if (m === 'run' || m === 'running')
    return /\b(run|jog|treadmill)\b/i.test(n);
  if (m === 'bike' || m === 'cycle')
    return /\b(bike|bicycle|cycle|assault bike|air bike)\b/i.test(n);
  if (m === 'row' || m === 'rowing')
    return /\b(row|rowing)\b/i.test(n);
  if (m === 'swim' || m === 'swimming') return /\b(swim)\b/i.test(n);
  if (m === 'elliptical')
    return /\b(elliptical|arc trainer|cross trainer)\b/i.test(n);
  return n.includes(m);
}

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

/** Enrichment-added rows we should not drop when trimming to a time cap. */
const BALANCE_INSERT_NOTES =
  /Added for (pull balance|squat\/knee|hip hinge|pattern balance)/i;

function exerciseRowIsBalanceInsert(e: GeneratedSessionExercise): boolean {
  return BALANCE_INSERT_NOTES.test(e.notes ?? '');
}

function pickStrengthTrimIndex(
  exercises: GeneratedSessionExercise[],
  findMeta: (id: string) =>
    | { movementPatterns?: string[]; primaryMuscleGroup?: string }
    | undefined,
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
  findMeta: (id: string) =>
    | { movementPatterns?: string[]; primaryMuscleGroup?: string }
    | undefined;
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
  const perm = idealStrengthExercisePermutation(exercises, findMeta, spec.title);
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
   */
  chunkExcludeExerciseIds?: string[];
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
 * - Preserves the original sets/reps/weight scheme; only the exercise identity
 *   changes. Adds a coach note so the swap is visible in the reasoning copy.
 */
function ensureAnchorInSlotOne(args: {
  exercises: GeneratedSessionExercise[];
  spec: { title?: string; type: string };
  exercisesService: ExercisesService;
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
    exercises
      .map((e) => e.exerciseId?.trim())
      .filter((x): x is string => !!x),
  );
  const chunkExcludeSet = new Set(args.chunkExcludeExerciseIds);

  for (const anchorId of accepted) {
    if (sessionExcludeIds.has(anchorId)) continue;
    if (chunkExcludeSet.has(anchorId)) continue;
    const anchorMeta = findMeta(anchorId);
    if (!anchorMeta) continue;
    if (anchorMeta.primaryMuscleGroup === 'Cardio') continue;
    if (nameMatchesAvoidList(anchorMeta.name, args.avoidPhrases)) continue;
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
      notes: 'Swapped in a staple compound for slot 1 (anchor enforcement).',
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
    return session;
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
      console.warn(`[Enrichment] exerciseId '${ex.exerciseId}' not found in catalog — LLM hallucination or stale id`);
    }
  }

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
      const pullSecondaries = secondaryMusclesForPreview(
        pick.secondaryMuscleGroups,
        pick.primaryMuscleGroup,
      );
      exercises.splice(insertAt, 0, {
        name: pick.name,
        exerciseId: pick.id,
        sets: 3,
        reps: 10,
        notes: 'Added for pull balance vs session focus',
        prescriptionType:
          pick.prescriptionType ??
          inferPrescriptionTypeFromExerciseName(pick.name),
        primaryMuscleGroup: pick.primaryMuscleGroup,
        ...(pullSecondaries.length ? { secondaryMuscleGroups: pullSecondaries } : {}),
      });
      coachNotes.push(
        'Added a pull movement from the library so this upper/pull day includes a clear pull pattern.',
      );
    }
  }

  if (sessionTitleNeedsSquatHingeBalance(spec.title, spec.type)) {
    let cover = unionPatternsFromSession(exercises, findMeta);
    if (cover.withMetaCount >= 2) {
      const excludeForLower = () =>
        exercises
          .map((e) => e.exerciseId)
          .filter((id): id is string => !!id);
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
            !exercises.some((e) => e.exerciseId === c.id || e.name === c.name) &&
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
            notes: 'Added for squat/knee pattern coverage on lower day',
            prescriptionType:
              pick.prescriptionType ??
              inferPrescriptionTypeFromExerciseName(pick.name),
            primaryMuscleGroup: pick.primaryMuscleGroup,
            ...(sec.length ? { secondaryMuscleGroups: sec } : {}),
          });
          coachNotes.push(
            'Added a knee-dominant (squat) lift from the library for lower-day pattern balance.',
          );
          cover = unionPatternsFromSession(exercises, findMeta);
        }
      }
      if (!cover.union.has('Hinge')) {
        const pick = lowerPool().find(
          (c) =>
            c.movementPatterns?.includes('Hinge') &&
            !exercises.some((e) => e.exerciseId === c.id || e.name === c.name) &&
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
            notes: 'Added for hip hinge coverage on lower day',
            prescriptionType:
              pick.prescriptionType ??
              inferPrescriptionTypeFromExerciseName(pick.name),
            primaryMuscleGroup: pick.primaryMuscleGroup,
            ...(sec.length ? { secondaryMuscleGroups: sec } : {}),
          });
          coachNotes.push(
            'Added a hip hinge lift from the library for lower-day pattern balance.',
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
          'We added a short easy machine finisher at the end for your hybrid-style goal—you can skip it when you are short on time.',
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
    avoidPhrases,
    chunkExcludeExerciseIds: generationPrefs?.chunkExcludeExerciseIds ?? [],
    coachNotes,
  });
  moveCardioExercisesLast(exercises, findMeta);

  stampRestSeconds(exercises, findMeta, generationPrefs);

  const mainName = inferMainLiftName(exercises, {
    sessionTitle: spec.title,
    findMeta,
  });
  const warmUp = tieWarmupToMainLift(session.warmUp, mainName);
  const reasoning = appendDeterministicCoachNotes(session.reasoning, coachNotes);
  const coolDown =
    session.coolDown?.trim() ||
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
