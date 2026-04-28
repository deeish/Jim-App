import type { GenerateSessionsDto } from './dto/generate-sessions.dto';
import {
  nameMatchesAvoidList,
  sessionTitleIsUpperEmphasis,
  type GeneratedSession,
  type GeneratedSessionExercise,
} from './session-enrichment';
import { exerciseTargetsForSession } from '../workouts/workout-generator.service';

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
    (a, b) => scorePatternAffinity(origMeta, b) - scorePatternAffinity(origMeta, a),
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

function chunkHasDuplicateLibraryIds(sessions: GeneratedSession[]): boolean {
  const totals = new Map<string, number>();
  for (const s of sessions) {
    for (const e of s.exercises ?? []) {
      const id = e.exerciseId?.trim();
      if (!id) continue;
      totals.set(id, (totals.get(id) ?? 0) + 1);
    }
  }
  for (const n of totals.values()) {
    if (n > 1) return true;
  }
  return false;
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
    (avoidPhrases.length === 0 || !nameMatchesAvoidList(c.name, avoidPhrases)) &&
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

    for (let ei = 0; ei < exercises.length; ei++) {
      const row = exercises[ei]!;
      const id = row.exerciseId?.trim();
      if (!id) continue;

      if (seenChunkIds.has(id)) {
        const excludeIds = collectExerciseIdsExcept(sessions, si, ei);
        const origMeta = library.findOne(id);
        const avoidPhrases = avoidPhrasesForSpec(avoidConstraintsGlobal, spec);
        const pick = pickWithEquipmentTiers(
          library,
          focusTriesForSpec(spec),
          equipment,
          excludeIds,
          origMeta,
          duplicateReplacementPredicate(origMeta),
          tierFlags,
          avoidPhrases,
        );
        if (pick) {
          applyLibraryExerciseToSlot(row, pick);
          seenChunkIds.add(pick.id);
          repairs += 1;
        }
      } else {
        seenChunkIds.add(id);
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

    for (let ei = exercises.length - 1; ei >= 0; ei--) {
      const row = exercises[ei]!;
      const id = row.exerciseId?.trim();
      if (!id) continue;

      if (seenChunkIds.has(id)) {
        const excludeIds = collectExerciseIdsExcept(sessions, si, ei);
        const origMeta = library.findOne(id);
        const avoidPhrases = avoidPhrasesForSpec(avoidConstraintsGlobal, spec);
        const pick = pickWithEquipmentTiers(
          library,
          focusTriesForSpec(spec),
          equipment,
          excludeIds,
          origMeta,
          duplicateReplacementPredicate(origMeta),
          tierFlags,
          avoidPhrases,
        );
        if (pick) {
          applyLibraryExerciseToSlot(row, pick);
          seenChunkIds.add(pick.id);
          repairs += 1;
        }
      } else {
        seenChunkIds.add(id);
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
  return (session.exercises ?? []).filter((e) => String(e.name ?? '').trim()).length;
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
    notes: 'Added so the session meets the minimum exercise count for its length.',
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
    const isCardioOrRecovery = spec.type === 'cardio' || spec.type === 'recovery';
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
      const pick = pickWithEquipmentTiers(
        library,
        focusTriesForSpec(spec),
        equipment,
        excludeIds,
        undefined,
        appendPredicateForSpec(spec),
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

function runUpperPatternPass(
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
    if (spec.type !== 'strength' || !sessionTitleIsUpperEmphasis(spec.title)) {
      continue;
    }
    const session = sessions[si]!;
    const exercises = session.exercises ?? [];

    for (let ei = 0; ei < exercises.length; ei++) {
      const row = exercises[ei]!;
      const id = row.exerciseId?.trim();
      if (!id) continue;
      const meta = library.findOne(id);
      if (!patternsIncludeSquatHinge(meta?.movementPatterns)) continue;

      const excludeIds = collectExerciseIdsExcept(sessions, si, ei);
      const avoidPhrases = avoidPhrasesForSpec(avoidConstraintsGlobal, spec);
      const pick = pickWithEquipmentTiers(
        library,
        focusTriesForSpec(spec),
        equipment,
        excludeIds,
        meta,
        (c) => !patternsIncludeSquatHinge(c.movementPatterns),
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

/**
 * Deterministic post-pass on a generated chunk: dedupe library ids across the chunk (in session order),
 * remove Squat/Hinge library patterns on upper-emphasis strength titles, then backfill rows when the
 * model returned fewer exercises than {@link exerciseTargetsForSession} requires.
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
    };
  }

  const sessions = cloneSessions(args.sessions);
  const notes: string[] = [];
  const tierFlags: ChunkRepairTierFlags = {
    usedWiderEquipment: false,
    usedScavenge: false,
  };

  let duplicateRepairs = runDuplicatePass(
    sessions,
    specs,
    library,
    equipment,
    tierFlags,
    avoidConstraintsGlobal,
  );
  const upperLowerPatternRepairs = runUpperPatternPass(
    sessions,
    specs,
    library,
    equipment,
    tierFlags,
    avoidConstraintsGlobal,
  );
  duplicateRepairs += runDuplicatePass(
    sessions,
    specs,
    library,
    equipment,
    tierFlags,
    avoidConstraintsGlobal,
  );

  if (chunkHasDuplicateLibraryIds(sessions)) {
    duplicateRepairs += runDuplicatePass(
      sessions,
      specs,
      library,
      equipment,
      tierFlags,
      avoidConstraintsGlobal,
    );
  }

  duplicateRepairs += runDuplicatePassReverse(
    sessions,
    specs,
    library,
    equipment,
    tierFlags,
    avoidConstraintsGlobal,
  );

  if (chunkHasDuplicateLibraryIds(sessions)) {
    duplicateRepairs += runDuplicatePass(
      sessions,
      specs,
      library,
      equipment,
      tierFlags,
      avoidConstraintsGlobal,
    );
  }

  const belowMinRepairs = runBelowMinimumPass(
    sessions,
    specs,
    library,
    equipment,
    effectiveDetailLevel,
    tierFlags,
    avoidConstraintsGlobal,
  );

  if (chunkHasDuplicateLibraryIds(sessions)) {
    duplicateRepairs += runDuplicatePass(
      sessions,
      specs,
      library,
      equipment,
      tierFlags,
      avoidConstraintsGlobal,
    );
  }

  if (duplicateRepairs > 0) {
    notes.push(
      'Adjusted repeated exercise picks so this program week does not reuse the same library movement across sessions.',
    );
  }
  if (upperLowerPatternRepairs > 0) {
    notes.push(
      'Swapped squat/hinge-pattern lifts on upper-focus days so titles and movement patterns align.',
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
  };
}
