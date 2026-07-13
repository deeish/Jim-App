import type { GenerateSessionsDto } from './dto/generate-sessions.dto';
import {
  LOWER_PATTERN_NAME,
  nameMatchesAvoidList,
  sessionTitleIsLowerEmphasis,
  sessionTitleIsUpperEmphasis,
  type GeneratedSession,
  type GeneratedSessionExercise,
} from './session-enrichment';
import { exerciseTargetsForSession } from '../workouts/workout-generator.service';
import { baseMovementKey } from './base-movement-key';

export type ChunkRepairExerciseMeta = {
  id: string;
  name: string;
  movementPatterns?: string[];
  prescriptionType?: GeneratedSessionExercise['prescriptionType'];
  primaryMuscleGroup?: string;
  secondaryMuscleGroups?: string[];
  /** Library sub-muscles. First entry is treated as the primary mover by the sub-muscle cap validator. */
  subMuscles?: string[];
};

export type ChunkRepairExerciseLibrary = {
  findOne(id: string): ChunkRepairExerciseMeta | undefined;
  getCandidatesForGenerator(options: {
    focus: string;
    equipment?: string[];
    excludeIds?: string[];
    limit?: number;
  }): ChunkRepairExerciseMeta[];
  /** Full-library fallback when focus pools return nothing usable (see ExercisesService). */
  candidatesForChunkRepairScavenge?(
    excludeIds: string[],
    limit?: number,
  ): ChunkRepairExerciseMeta[];
};

type ChunkRepairTierFlags = {
  usedWiderEquipment: boolean;
  usedScavenge: boolean;
};

export type RepairChunkGeneratedSessionsResult = {
  sessions: GeneratedSession[];
  notes: string[];
  duplicateRepairs: number;
  upperLowerPatternRepairs: number;
  /** Library rows appended to meet `exerciseTargetsForSession` minimums. */
  belowMinRepairs: number;
  /** Equipment variants of a movement already in the same session, swapped out (see `base-movement-key.ts`). */
  nearDuplicateRepairs: number;
};

function patternsIncludeSquatHinge(
  patterns: ReadonlyArray<string> | undefined,
): boolean {
  if (!patterns?.length) return false;
  const set = new Set(patterns.map((p) => String(p).trim()));
  return set.has('Squat') || set.has('Hinge');
}

function collectExerciseIdsExcept(
  sessions: GeneratedSession[],
  skipSessionIndex: number,
  skipExerciseIndex: number,
): string[] {
  const ids: string[] = [];
  for (let si = 0; si < sessions.length; si++) {
    const exs = sessions[si]?.exercises ?? [];
    for (let ei = 0; ei < exs.length; ei++) {
      if (si === skipSessionIndex && ei === skipExerciseIndex) continue;
      const id = exs[ei]?.exerciseId?.trim();
      if (id) ids.push(id);
    }
  }
  return [...new Set(ids)];
}

function mergeCandidatePools(
  library: ChunkRepairExerciseLibrary,
  focusTries: string[],
  equipment: string[] | undefined,
  excludeIds: string[],
): ChunkRepairExerciseMeta[] {
  const seen = new Set<string>();
  const merged: ChunkRepairExerciseMeta[] = [];
  for (const focus of focusTries) {
    const batch = library.getCandidatesForGenerator({
      focus,
      equipment: equipment?.length ? equipment : undefined,
      excludeIds,
      limit: 90,
    });
    for (const c of batch) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      merged.push(c);
    }
  }
  return merged;
}

function focusTriesForSpec(
  spec: GenerateSessionsDto['sessions'][number],
): string[] {
  const primary = (spec.title ?? spec.type ?? 'Session').trim() || 'Session';
  const fallbacks =
    spec.type === 'strength'
      ? [
          'upper',
          'push',
          'pull',
          'chest',
          'back',
          'shoulders',
          'arms',
          'accessory',
          'core',
          'full body',
        ]
      : ['strength', 'conditioning', 'core'];
  return [...new Set([primary, ...fallbacks])];
}

function scorePatternAffinity(
  origMeta: ChunkRepairExerciseMeta | undefined,
  cand: ChunkRepairExerciseMeta,
): number {
  let score = 0;
  const origPat = origMeta?.movementPatterns ?? [];
  const candSet = new Set(cand.movementPatterns ?? []);
  for (const p of origPat) {
    if (p === 'Squat' || p === 'Hinge') continue;
    if (candSet.has(p)) score += 12;
  }
  if (
    origMeta?.primaryMuscleGroup &&
    cand.primaryMuscleGroup === origMeta.primaryMuscleGroup
  ) {
    score += 6;
  }
  return score;
}

function pickBestCandidate(
  pool: ChunkRepairExerciseMeta[],
  origMeta: ChunkRepairExerciseMeta | undefined,
  predicate: (c: ChunkRepairExerciseMeta) => boolean,
): ChunkRepairExerciseMeta | undefined {
  const filtered = pool.filter(predicate);
  if (!filtered.length) return undefined;
  filtered.sort(
    (a, b) =>
      scorePatternAffinity(origMeta, b) - scorePatternAffinity(origMeta, a),
  );
  return filtered[0];
}

/** Avoid swapping a strength slot for catalog Cardio (bad UX); Cardio dupes stay in Cardio. */
function duplicateReplacementPredicate(
  origMeta: ChunkRepairExerciseMeta | undefined,
): (c: ChunkRepairExerciseMeta) => boolean {
  if (origMeta?.primaryMuscleGroup === 'Cardio') {
    return (c) => c.primaryMuscleGroup === 'Cardio';
  }
  return (c) => c.primaryMuscleGroup !== 'Cardio';
}

/**
 * Cardio rows are exempt from cross-session dedupe: repeating a conditioning
 * modality across days is normal (a "run"-only hybrid week must reuse the few
 * run-type ids). Mirrors the exemption in `generated-chunk-validators.ts`.
 */
function isCardioRow(
  library: ChunkRepairExerciseLibrary,
  id: string,
  row: GeneratedSessionExercise,
): boolean {
  const meta = library.findOne(id);
  if (meta?.primaryMuscleGroup) return meta.primaryMuscleGroup === 'Cardio';
  return row.primaryMuscleGroup?.trim() === 'Cardio';
}

/** Base movement keys already present in a session (optionally skipping one slot). */
function sessionBaseKeys(
  session: GeneratedSession,
  skipExerciseIndex?: number,
): Set<string> {
  const keys = new Set<string>();
  const exercises = session.exercises ?? [];
  for (let ei = 0; ei < exercises.length; ei++) {
    if (ei === skipExerciseIndex) continue;
    const id = exercises[ei]?.exerciseId?.trim();
    if (id) keys.add(baseMovementKey(id));
  }
  return keys;
}

function applyLibraryExerciseToSlot(
  slot: GeneratedSessionExercise,
  pick: ChunkRepairExerciseMeta,
): void {
  slot.name = pick.name;
  slot.exerciseId = pick.id;
  if (pick.prescriptionType !== undefined) {
    slot.prescriptionType = pick.prescriptionType;
  }
  if (pick.primaryMuscleGroup) {
    slot.primaryMuscleGroup = pick.primaryMuscleGroup;
  } else {
    delete slot.primaryMuscleGroup;
  }
  if (pick.secondaryMuscleGroups?.length) {
    slot.secondaryMuscleGroups = [...pick.secondaryMuscleGroups];
  } else {
    delete slot.secondaryMuscleGroups;
  }
}

function cloneSessions(sessions: GeneratedSession[]): GeneratedSession[] {
  return sessions.map((s) => ({
    ...s,
    exercises: (s.exercises ?? []).map((e) => ({ ...e })),
  }));
}

function avoidPhrasesForSpec(
  globalAvoid: string[] | undefined,
  spec: GenerateSessionsDto['sessions'][number] | undefined,
): string[] {
  return [
    ...new Set([...(globalAvoid ?? []), ...(spec?.avoidConstraints ?? [])]),
  ]
    .map((x) => String(x ?? '').trim())
    .filter((x) => x.length >= 2);
}

function chunkHasDuplicateLibraryIds(
  sessions: GeneratedSession[],
  library: ChunkRepairExerciseLibrary,
): boolean {
  const totals = new Map<string, number>();
  for (let si = 0; si < sessions.length; si++) {
    for (const e of sessions[si]!.exercises ?? []) {
      const id = e.exerciseId?.trim();
      if (!id) continue;
      // Cardio counts per session (cross-day repeats are fine); the rest chunk-wide.
      const key = isCardioRow(library, id, e) ? `${si}:${id}` : id;
      totals.set(key, (totals.get(key) ?? 0) + 1);
    }
  }
  for (const n of totals.values()) {
    if (n > 1) return true;
  }
  return false;
}

/**
 * Swap equipment variants of a movement already present in the same session
 * (`barbell_upright_row` + `ez_bar_upright_row`, two cable-pushdown bars, …).
 * Exact-id duplicates are the duplicate passes' job; this pass only fires when
 * the ids differ but collapse to the same {@link baseMovementKey}. Cardio rows
 * are exempt (a warm-up walk and a finisher walk can share a base movement).
 */
function runNearDuplicatePass(
  sessions: GeneratedSession[],
  specs: GenerateSessionsDto['sessions'],
  library: ChunkRepairExerciseLibrary,
  equipment: string[] | undefined,
  tierFlags: ChunkRepairTierFlags,
  avoidConstraintsGlobal: string[] | undefined,
): number {
  let repairs = 0;

  for (let si = 0; si < sessions.length; si++) {
    const session = sessions[si]!;
    const spec = specs[si]!;
    const exercises = session.exercises ?? [];
    const seenKeyByFirstId = new Map<string, string>();

    for (let ei = 0; ei < exercises.length; ei++) {
      const row = exercises[ei]!;
      const id = row.exerciseId?.trim();
      if (!id) continue;
      if (isCardioRow(library, id, row)) continue;
      const key = baseMovementKey(id);
      const firstId = seenKeyByFirstId.get(key);
      if (firstId === undefined || firstId === id) {
        seenKeyByFirstId.set(key, id);
        continue;
      }

      const excludeIds = collectExerciseIdsExcept(sessions, si, ei);
      const origMeta = library.findOne(id);
      const avoidPhrases = avoidPhrasesForSpec(avoidConstraintsGlobal, spec);
      const usedBaseKeys = sessionBaseKeys(session, ei);
      const pick = pickWithEquipmentTiers(
        library,
        focusTriesForSpec(spec),
        equipment,
        excludeIds,
        origMeta,
        (c) =>
          c.primaryMuscleGroup !== 'Cardio' &&
          !usedBaseKeys.has(baseMovementKey(c.id)),
        tierFlags,
        avoidPhrases,
      );
      if (pick) {
        applyLibraryExerciseToSlot(row, pick);
        seenKeyByFirstId.set(baseMovementKey(pick.id), pick.id);
        repairs += 1;
      }
    }
  }

  return repairs;
}

function pickWithEquipmentTiers(
  library: ChunkRepairExerciseLibrary,
  focusTries: string[],
  equipment: string[] | undefined,
  excludeIds: string[],
  origMeta: ChunkRepairExerciseMeta | undefined,
  predicate: (c: ChunkRepairExerciseMeta) => boolean,
  tierFlags: ChunkRepairTierFlags,
  avoidPhrases: string[],
): ChunkRepairExerciseMeta | undefined {
  const combined = (c: ChunkRepairExerciseMeta) =>
    (avoidPhrases.length === 0 ||
      !nameMatchesAvoidList(c.name, avoidPhrases)) &&
    predicate(c);

  let pool = mergeCandidatePools(library, focusTries, equipment, excludeIds);
  let pick = pickBestCandidate(pool, origMeta, combined);
  if (pick) return pick;

  if (equipment?.length) {
    tierFlags.usedWiderEquipment = true;
    pool = mergeCandidatePools(library, focusTries, undefined, excludeIds);
    pick = pickBestCandidate(pool, origMeta, combined);
    if (pick) return pick;
  }

  if (library.candidatesForChunkRepairScavenge) {
    tierFlags.usedScavenge = true;
    pool = library.candidatesForChunkRepairScavenge(excludeIds, 240);
    return pickBestCandidate(pool, origMeta, combined);
  }

  return undefined;
}

function runDuplicatePass(
  sessions: GeneratedSession[],
  specs: GenerateSessionsDto['sessions'],
  library: ChunkRepairExerciseLibrary,
  equipment: string[] | undefined,
  tierFlags: ChunkRepairTierFlags,
  avoidConstraintsGlobal: string[] | undefined,
): number {
  const seenChunkIds = new Set<string>();
  let repairs = 0;

  for (let si = 0; si < sessions.length; si++) {
    const session = sessions[si]!;
    const spec = specs[si]!;
    const exercises = session.exercises ?? [];
    // Cardio may repeat across days (finishers), but not within one session.
    const seenCardioThisSession = new Set<string>();

    for (let ei = 0; ei < exercises.length; ei++) {
      const row = exercises[ei]!;
      const id = row.exerciseId?.trim();
      if (!id) continue;
      const cardio = isCardioRow(library, id, row);
      const seen = cardio ? seenCardioThisSession : seenChunkIds;

      if (seen.has(id)) {
        const excludeIds = collectExerciseIdsExcept(sessions, si, ei);
        const origMeta = library.findOne(id);
        const avoidPhrases = avoidPhrasesForSpec(avoidConstraintsGlobal, spec);
        const usedBaseKeys = sessionBaseKeys(session, ei);
        const basePredicate = duplicateReplacementPredicate(origMeta);
        const pick = pickWithEquipmentTiers(
          library,
          focusTriesForSpec(spec),
          equipment,
          excludeIds,
          origMeta,
          (c) => basePredicate(c) && !usedBaseKeys.has(baseMovementKey(c.id)),
          tierFlags,
          avoidPhrases,
        );
        if (pick) {
          applyLibraryExerciseToSlot(row, pick);
          const pickSeen =
            pick.primaryMuscleGroup === 'Cardio'
              ? seenCardioThisSession
              : seenChunkIds;
          pickSeen.add(pick.id);
          repairs += 1;
        }
      } else {
        seen.add(id);
      }
    }
  }

  return repairs;
}

/** Same dedupe rules as {@link runDuplicatePass} but last-in-chunk wins — helps when forward pass cannot find alts. */
function runDuplicatePassReverse(
  sessions: GeneratedSession[],
  specs: GenerateSessionsDto['sessions'],
  library: ChunkRepairExerciseLibrary,
  equipment: string[] | undefined,
  tierFlags: ChunkRepairTierFlags,
  avoidConstraintsGlobal: string[] | undefined,
): number {
  const seenChunkIds = new Set<string>();
  let repairs = 0;

  for (let si = sessions.length - 1; si >= 0; si--) {
    const session = sessions[si]!;
    const spec = specs[si]!;
    const exercises = session.exercises ?? [];
    // Cardio may repeat across days (finishers), but not within one session.
    const seenCardioThisSession = new Set<string>();

    for (let ei = exercises.length - 1; ei >= 0; ei--) {
      const row = exercises[ei]!;
      const id = row.exerciseId?.trim();
      if (!id) continue;
      const cardio = isCardioRow(library, id, row);
      const seen = cardio ? seenCardioThisSession : seenChunkIds;

      if (seen.has(id)) {
        const excludeIds = collectExerciseIdsExcept(sessions, si, ei);
        const origMeta = library.findOne(id);
        const avoidPhrases = avoidPhrasesForSpec(avoidConstraintsGlobal, spec);
        const usedBaseKeys = sessionBaseKeys(session, ei);
        const basePredicate = duplicateReplacementPredicate(origMeta);
        const pick = pickWithEquipmentTiers(
          library,
          focusTriesForSpec(spec),
          equipment,
          excludeIds,
          origMeta,
          (c) => basePredicate(c) && !usedBaseKeys.has(baseMovementKey(c.id)),
          tierFlags,
          avoidPhrases,
        );
        if (pick) {
          applyLibraryExerciseToSlot(row, pick);
          const pickSeen =
            pick.primaryMuscleGroup === 'Cardio'
              ? seenCardioThisSession
              : seenChunkIds;
          pickSeen.add(pick.id);
          repairs += 1;
        }
      } else {
        seen.add(id);
      }
    }
  }

  return repairs;
}

function collectAllChunkExerciseIds(sessions: GeneratedSession[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const s of sessions) {
    for (const e of s.exercises ?? []) {
      const id = e.exerciseId?.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

function namedExerciseCount(session: GeneratedSession): number {
  return (session.exercises ?? []).filter((e) => String(e.name ?? '').trim())
    .length;
}

function appendPredicateForSpec(
  spec: GenerateSessionsDto['sessions'][number],
): (c: ChunkRepairExerciseMeta) => boolean {
  if (spec.type === 'strength') {
    return (c) => c.primaryMuscleGroup !== 'Cardio';
  }
  return () => true;
}

function appendLibraryRowToSession(
  session: GeneratedSession,
  pick: ChunkRepairExerciseMeta,
): void {
  if (!session.exercises) session.exercises = [];
  const prescriptionType =
    pick.prescriptionType ??
    (pick.primaryMuscleGroup === 'Cardio' ? 'time' : 'reps');
  session.exercises.push({
    name: pick.name,
    exerciseId: pick.id,
    sets: 3,
    reps: prescriptionType === 'time' ? 10 : 8,
    notes:
      'Added so the session meets the minimum exercise count for its length.',
    prescriptionType,
    ...(pick.primaryMuscleGroup
      ? { primaryMuscleGroup: pick.primaryMuscleGroup }
      : {}),
    ...(pick.secondaryMuscleGroups?.length
      ? { secondaryMuscleGroups: [...pick.secondaryMuscleGroups] }
      : {}),
  });
}

function runBelowMinimumPass(
  sessions: GeneratedSession[],
  specs: GenerateSessionsDto['sessions'],
  library: ChunkRepairExerciseLibrary,
  equipment: string[] | undefined,
  effectiveDetailLevel: 'simple' | 'detailed',
  tierFlags: ChunkRepairTierFlags,
  avoidConstraintsGlobal: string[] | undefined,
): number {
  let repairs = 0;
  for (let si = 0; si < sessions.length; si++) {
    const spec = specs[si]!;
    const session = sessions[si]!;
    const isCardioOrRecovery =
      spec.type === 'cardio' || spec.type === 'recovery';
    const duration = Math.round((spec.durationMin + spec.durationMax) / 2);
    const { minExercises } = exerciseTargetsForSession(
      duration,
      effectiveDetailLevel,
      isCardioOrRecovery,
    );
    let guard = 0;
    while (namedExerciseCount(session) < minExercises && guard < 24) {
      guard++;
      const excludeIds = collectAllChunkExerciseIds(sessions);
      const avoidPhrases = avoidPhrasesForSpec(avoidConstraintsGlobal, spec);
      const usedBaseKeys = sessionBaseKeys(session);
      const specPredicate = appendPredicateForSpec(spec);
      const pick = pickWithEquipmentTiers(
        library,
        focusTriesForSpec(spec),
        equipment,
        excludeIds,
        undefined,
        (c) => specPredicate(c) && !usedBaseKeys.has(baseMovementKey(c.id)),
        tierFlags,
        avoidPhrases,
      );
      if (!pick) break;
      appendLibraryRowToSession(session, pick);
      repairs += 1;
    }
  }
  return repairs;
}

/** Upper-body primary muscle groups (Back handled separately — it also holds hinges). */
const UPPER_BODY_GROUPS = new Set(['Chest', 'Shoulders', 'Arms']);

/**
 * A lower-body movement: a Legs row, a squat/hinge movement pattern, or a name
 * that reads as lower work (lunge, deadlift, RDL, hip thrust…). The name regex
 * is the safety net for the catalog's inconsistent tagging — conventional/sumo/
 * trap deadlifts are filed under `Back`, RDL/good-morning under `Legs`.
 */
function isLowerMovement(
  name: string | undefined,
  meta: ChunkRepairExerciseMeta | undefined,
): boolean {
  return (
    meta?.primaryMuscleGroup === 'Legs' ||
    patternsIncludeSquatHinge(meta?.movementPatterns) ||
    LOWER_PATTERN_NAME.test(name ?? '')
  );
}

/**
 * An upper-body movement that does not belong on a leg day: Chest/Shoulders/Arms,
 * or a `Back` row that is NOT a hinge/squat (a pulldown or horizontal row — but a
 * deadlift/good-morning, also filed under Back, stays on lower days).
 */
function isUpperMovement(
  name: string | undefined,
  meta: ChunkRepairExerciseMeta | undefined,
): boolean {
  const group = meta?.primaryMuscleGroup;
  if (group && UPPER_BODY_GROUPS.has(group)) return true;
  if (group === 'Back') return !isLowerMovement(name, meta);
  return false;
}

/** Leg-biased candidate pool so lower-day swaps don't draw upper movements. */
function lowerFocusTries(
  spec: GenerateSessionsDto['sessions'][number],
): string[] {
  const primary = (spec.title ?? spec.type ?? 'Lower').trim() || 'Lower';
  return [
    ...new Set([
      primary,
      'legs',
      'lower',
      'lower body',
      'quad',
      'hamstring',
      'glute',
      'calf',
    ]),
  ];
}

/**
 * Bidirectional split-purity pass: swap movements that fight the session's
 * upper/lower title. On Upper/Push/Pull days remove lower movements (legs,
 * squats, hinges, lunges); on Lower/Legs days remove upper movements (chest,
 * shoulders, arms, upper-back pulls) while keeping deadlifts/RDLs. Sessions whose
 * title is neither (full-body, AI-decide) are left untouched, as are cardio rows.
 */
function runFocusPurityPass(
  sessions: GeneratedSession[],
  specs: GenerateSessionsDto['sessions'],
  library: ChunkRepairExerciseLibrary,
  equipment: string[] | undefined,
  tierFlags: ChunkRepairTierFlags,
  avoidConstraintsGlobal: string[] | undefined,
): number {
  let repairs = 0;

  for (let si = 0; si < sessions.length; si++) {
    const spec = specs[si]!;
    if (spec.type !== 'strength') continue;
    const focus: 'upper' | 'lower' | undefined = sessionTitleIsUpperEmphasis(
      spec.title,
    )
      ? 'upper'
      : sessionTitleIsLowerEmphasis(spec.title)
        ? 'lower'
        : undefined;
    if (!focus) continue;

    const session = sessions[si]!;
    const exercises = session.exercises ?? [];

    for (let ei = 0; ei < exercises.length; ei++) {
      const row = exercises[ei]!;
      const id = row.exerciseId?.trim();
      if (!id) continue;
      const meta = library.findOne(id);
      // A legitimate cardio finisher can sit on any day — never swap it.
      if (meta?.primaryMuscleGroup === 'Cardio') continue;

      const misplaced =
        focus === 'upper'
          ? isLowerMovement(row.name, meta)
          : isUpperMovement(row.name, meta);
      if (!misplaced) continue;

      const excludeIds = collectExerciseIdsExcept(sessions, si, ei);
      const avoidPhrases = avoidPhrasesForSpec(avoidConstraintsGlobal, spec);
      const focusTries =
        focus === 'upper' ? focusTriesForSpec(spec) : lowerFocusTries(spec);
      const predicate =
        focus === 'upper'
          ? (c: ChunkRepairExerciseMeta) =>
              c.primaryMuscleGroup !== 'Cardio' && !isLowerMovement(c.name, c)
          : (c: ChunkRepairExerciseMeta) =>
              c.primaryMuscleGroup !== 'Cardio' && isLowerMovement(c.name, c);
      const pick = pickWithEquipmentTiers(
        library,
        focusTries,
        equipment,
        excludeIds,
        meta,
        predicate,
        tierFlags,
        avoidPhrases,
      );
      if (pick) {
        applyLibraryExerciseToSlot(row, pick);
        repairs += 1;
      }
    }
  }

  return repairs;
}

/** Session indices grouped by `weekIndex`, in first-seen week order. */
function groupSessionIndicesByWeek(
  specs: GenerateSessionsDto['sessions'],
): number[][] {
  const byWeek = new Map<number, number[]>();
  for (let i = 0; i < specs.length; i++) {
    const week = specs[i]!.weekIndex;
    const group = byWeek.get(week) ?? [];
    group.push(i);
    byWeek.set(week, group);
  }
  return [...byWeek.values()];
}

/**
 * Deterministic post-pass on a generated chunk: dedupe non-cardio library ids within each
 * program week (in session order; cardio modalities may repeat across days by design, and
 * weeks 2+ intentionally repeat week 1's selections via clone-and-progress), enforce upper/lower
 * split purity (swap movements that fight the day's title, in either direction), swap same-session
 * equipment variants of one base movement, then backfill rows when the model returned fewer
 * exercises than {@link exerciseTargetsForSession} requires.
 */
export function repairChunkGeneratedSessions(args: {
  sessions: GeneratedSession[];
  specs: GenerateSessionsDto['sessions'];
  library: ChunkRepairExerciseLibrary;
  equipment: string[] | undefined;
  /** Must match batch / validator (`exerciseTargetsForSession`). Defaults to `detailed`. */
  effectiveDetailLevel?: 'simple' | 'detailed';
  /** Merged with each spec’s `avoidConstraints` when choosing library replacements. */
  avoidConstraintsGlobal?: string[];
}): RepairChunkGeneratedSessionsResult {
  const { specs, library, equipment } = args;
  const avoidConstraintsGlobal = args.avoidConstraintsGlobal;
  const effectiveDetailLevel = args.effectiveDetailLevel ?? 'detailed';
  if (args.sessions.length !== specs.length) {
    return {
      sessions: cloneSessions(args.sessions),
      notes: [],
      duplicateRepairs: 0,
      upperLowerPatternRepairs: 0,
      belowMinRepairs: 0,
      nearDuplicateRepairs: 0,
    };
  }

  const sessions = cloneSessions(args.sessions);
  const notes: string[] = [];
  const tierFlags: ChunkRepairTierFlags = {
    usedWiderEquipment: false,
    usedScavenge: false,
  };

  // Duplicate passes are scoped per weekIndex group: repeating week 1's lift in
  // week 2 is normal programming (weeks 2+ clone week 1 on purpose), while a
  // repeat inside one week is a defect. Slices share session object references,
  // so pass mutations land in `sessions`.
  const weekGroups = groupSessionIndicesByWeek(specs);
  const runDuplicatePassPerWeek = (pass: typeof runDuplicatePass): number => {
    let repairs = 0;
    for (const indices of weekGroups) {
      repairs += pass(
        indices.map((i) => sessions[i]!),
        indices.map((i) => specs[i]!),
        library,
        equipment,
        tierFlags,
        avoidConstraintsGlobal,
      );
    }
    return repairs;
  };
  const anyWeekHasDuplicateLibraryIds = (): boolean =>
    weekGroups.some((indices) =>
      chunkHasDuplicateLibraryIds(
        indices.map((i) => sessions[i]!),
        library,
      ),
    );

  let duplicateRepairs = runDuplicatePassPerWeek(runDuplicatePass);
  const upperLowerPatternRepairs = runFocusPurityPass(
    sessions,
    specs,
    library,
    equipment,
    tierFlags,
    avoidConstraintsGlobal,
  );
  duplicateRepairs += runDuplicatePassPerWeek(runDuplicatePass);

  if (anyWeekHasDuplicateLibraryIds()) {
    duplicateRepairs += runDuplicatePassPerWeek(runDuplicatePass);
  }

  duplicateRepairs += runDuplicatePassPerWeek(runDuplicatePassReverse);

  if (anyWeekHasDuplicateLibraryIds()) {
    duplicateRepairs += runDuplicatePassPerWeek(runDuplicatePass);
  }

  const nearDuplicateRepairs = runNearDuplicatePass(
    sessions,
    specs,
    library,
    equipment,
    tierFlags,
    avoidConstraintsGlobal,
  );

  const belowMinRepairs = runBelowMinimumPass(
    sessions,
    specs,
    library,
    equipment,
    effectiveDetailLevel,
    tierFlags,
    avoidConstraintsGlobal,
  );

  if (anyWeekHasDuplicateLibraryIds()) {
    duplicateRepairs += runDuplicatePassPerWeek(runDuplicatePass);
  }

  if (duplicateRepairs > 0) {
    notes.push(
      'Adjusted repeated exercise picks so this program week does not reuse the same library movement across sessions.',
    );
  }
  if (upperLowerPatternRepairs > 0) {
    notes.push(
      'Swapped exercises that did not match the day’s upper/lower focus so each session matches its title.',
    );
  }
  if (nearDuplicateRepairs > 0) {
    notes.push(
      'Swapped equipment variants of a movement already in the session so each slot trains something distinct.',
    );
  }
  if (belowMinRepairs > 0) {
    notes.push(
      'Added library exercises where the model returned fewer moves than the minimum for that session length.',
    );
  }
  if (tierFlags.usedScavenge) {
    notes.push(
      'Used a broad catalog search for some replacement slots so the week stays unique and valid.',
    );
  } else if (tierFlags.usedWiderEquipment) {
    notes.push(
      'Relaxed equipment filtering for some replacement picks when tagged options ran out.',
    );
  }

  return {
    sessions,
    notes: [...new Set(notes)],
    duplicateRepairs,
    upperLowerPatternRepairs,
    belowMinRepairs,
    nearDuplicateRepairs,
  };
}

/**
 * Post-enrichment safety net: enrichment's per-session swaps (anchor slot-1,
 * equipment compatibility, pull balance) run AFTER the chunk validators and can
 * reintroduce the exact defects repair removed — the same accessory on two days,
 * or a second equipment variant of a movement already in the session. This pass
 * re-runs the duplicate + near-duplicate swaps on the enriched program.
 *
 * Dedupe is scoped per `weekIndex` group: repeating a lift in week 2 that week 1
 * used is normal programming; repeating it twice in the same week is not.
 * Replacements keep the row's stamped sets/reps/rest (same-role, like-for-like
 * swap), so prescriptions stay coherent. No purity/backfill passes here — those
 * already ran pre-enrichment and enrichment owns min-count decisions.
 */
export function dedupeEnrichedProgramSessions(args: {
  sessions: GeneratedSession[];
  specs: GenerateSessionsDto['sessions'];
  library: ChunkRepairExerciseLibrary;
  equipment: string[] | undefined;
  avoidConstraintsGlobal?: string[];
}): { sessions: GeneratedSession[]; repairs: number } {
  const { specs, library, equipment, avoidConstraintsGlobal } = args;
  if (args.sessions.length !== specs.length) {
    return { sessions: cloneSessions(args.sessions), repairs: 0 };
  }
  const sessions = cloneSessions(args.sessions);
  const tierFlags: ChunkRepairTierFlags = {
    usedWiderEquipment: false,
    usedScavenge: false,
  };

  const weekGroups = groupSessionIndicesByWeek(specs);

  let repairs = 0;
  for (const indices of weekGroups) {
    // Slices share session object references, so pass mutations land in `sessions`.
    const weekSessions = indices.map((i) => sessions[i]!);
    const weekSpecs = indices.map((i) => specs[i]!);
    repairs += runDuplicatePass(
      weekSessions,
      weekSpecs,
      library,
      equipment,
      tierFlags,
      avoidConstraintsGlobal,
    );
    if (chunkHasDuplicateLibraryIds(weekSessions, library)) {
      repairs += runDuplicatePassReverse(
        weekSessions,
        weekSpecs,
        library,
        equipment,
        tierFlags,
        avoidConstraintsGlobal,
      );
    }
  }

  repairs += runNearDuplicatePass(
    sessions,
    specs,
    library,
    equipment,
    tierFlags,
    avoidConstraintsGlobal,
  );

  return { sessions, repairs };
}
