import type { GenerateSessionsDto } from './dto/generate-sessions.dto';
import {
  sessionTitleIsUpperEmphasis,
  type GeneratedSession,
} from './session-enrichment';
import { exerciseTargetsForSession } from '../workouts/workout-generator.service';
import { getAcceptedAnchorIdsForFocus } from '../data/anchor-exercises';
import {
  buildSessionDiversitySignature,
  compareSameFocusSessionPair,
  type CrossSessionFocus,
} from './cross-session-diversity';

/** Must stay aligned with `MAX_PRIOR_WEEK_IDS_IN_BATCH_PROMPT` in workout-generator.service.ts */
export const BATCH_PRIOR_EXERCISE_IDS_TAIL = 48;

export type ChunkValidatorIssue =
  | 'duplicate_exercise_id_in_session'
  /** Non-cardio id reused across sessions. Cardio rows are exempt (finishers repeat by design). */
  | 'duplicate_exercise_id_across_chunk'
  | 'below_min_exercises'
  /** Strength day with upper-style title but library metadata shows primary lower pattern (Squat/Hinge). */
  | 'primary_lower_pattern_on_upper_focus'
  /**
   * One session has too many exercises sharing a single movement pattern
   * (e.g. 3+ core moves on a Lower day) or sharing a tracked pattern beyond the
   * per-focus cap. Retry tail demotes the offending ids the same way duplicates do.
   */
  | 'over_concentrated_pattern'
  /**
   * One session stacks too many exercises whose primary mover is the same
   * sub-muscle (e.g. 3 hamstring lifts, 3 upper-chest pushes). Calves / Forearms /
   * Core / Cardio primary muscle groups are exempt because stacking is normal there.
   */
  | 'over_concentrated_sub_muscle'
  /**
   * Strength session whose first non-cardio exercise is not in the curated
   * anchor pool for that focus (e.g. opens with `landmine_press` instead of a
   * staple bench / OHP / row / squat / deadlift). Same retry-tail treatment so
   * the next batch attempt drifts away from novelty picks.
   */
  | 'slot_one_not_anchor'
  /**
   * Two strength sessions in the same chunk share a focus (Upper × 2 or
   * Lower × 2) AND open with too-similar exercises (same id, or the same
   * push angle / lower dominance). Retry tail demotes the *second* session's
   * slot-1 id so the next batch attempt picks a contrasting opener.
   */
  | 'under_diversified_across_focus';

export type ChunkValidationResult = {
  ok: boolean;
  issues: ChunkValidatorIssue[];
  /** Unique library ids that appeared more than once (retry hint). */
  duplicateExerciseIds: string[];
  /**
   * Library ids on upper-focus strength days whose `movementPatterns` include Squat or Hinge
   * (batch retry tail — same treatment as duplicates in `buildRetryPriorExerciseIds`).
   */
  patternClashExerciseIds: string[];
  /**
   * Library ids that exceeded the per-session pattern budget (e.g. the 3rd core move on a
   * Lower day, or the 4th Push exercise on an Upper day). Same retry-tail treatment as
   * duplicates so the next batch attempt drifts away from the offending picks.
   */
  patternOverflowExerciseIds: string[];
  /**
   * Library ids that exceeded the per-session sub-muscle cap (e.g. the 3rd hamstring
   * lift, the 3rd upper-chest press). Same retry-tail treatment as duplicates.
   */
  subMuscleOverflowExerciseIds: string[];
  /**
   * Library ids that occupied slot 1 of a strength session but are not in the
   * curated anchor pool (`landmine_press` etc.). Retry tail demotes them so the
   * next batch attempt prefers a staple compound.
   */
  nonAnchorSlotOneExerciseIds: string[];
  /**
   * Library ids of slot-1 exercises on the *second* same-focus session in the
   * chunk that overlap with the first (same id or same push angle / lower
   * dominance). Retry tail demotes them so the next batch attempt picks a
   * contrasting opener for the same-focus pair.
   */
  crossSessionOverlapExerciseIds: string[];
};

export type ChunkValidationMovementMeta = ReadonlyMap<
  string,
  ReadonlyArray<string>
>;

/**
 * Optional `primaryMuscleGroup` lookup. When supplied alongside
 * `movementPatternsByExerciseId`, enables the per-session pattern budget check
 * (e.g. max 1 core move on a Lower day, max 3 same Push/Pull/etc. anywhere).
 */
export type ChunkValidationPrimaryMuscleMeta = ReadonlyMap<string, string>;

/**
 * Optional sub-muscle lookup keyed by `exerciseId`. The validator treats the
 * **first** sub-muscle as the primary mover for that row when checking the
 * per-session sub-muscle cap.
 */
export type ChunkValidationSubMuscleMeta = ReadonlyMap<
  string,
  ReadonlyArray<string>
>;

function patternsIncludePrimaryLower(
  patterns: ReadonlyArray<string> | undefined,
): boolean {
  if (!patterns?.length) return false;
  const set = new Set(patterns.map((p) => String(p).trim()));
  return set.has('Squat') || set.has('Hinge');
}

/**
 * Tracked patterns we cap per session. Anything else (e.g. Rotation, Anti-rotation,
 * domain-specific tags) is ignored for budget purposes — those rarely create the
 * "feels stacked" problem in practice.
 */
const TRACKED_PATTERNS = [
  'Push',
  'Pull',
  'Squat',
  'Hinge',
  'Lunge',
  'Carry',
] as const;

/** Primary muscle groups that don't count toward over-concentration of patterns. */
const PATTERN_BUDGET_EXEMPT_PRIMARY = new Set(['Calves', 'Forearms', 'Cardio']);

type SessionFocus = 'upper' | 'lower' | 'fullbody' | 'other';

/** Loose classifier — mirrors the title regexes used elsewhere in session-enrichment.ts. */
function classifySessionFocus(
  type: string | undefined,
  title: string | undefined,
): SessionFocus {
  if (type !== 'strength') return 'other';
  const t = (title ?? '').toLowerCase();
  if (!t.trim()) return 'other';
  if (/\bcardio\b|\brecovery\b|\brun\b|\bconditioning\b/.test(t)) {
    return 'other';
  }
  if (/\bfull\s*body\b/.test(t)) return 'fullbody';
  if (
    /\blegs?\b|\blower\b|\bleg\s+day\b|\bquad\b|\bhamstring\b|\bglute\b/.test(t)
  ) {
    return 'lower';
  }
  if (
    /\bupper\b|\bpush\b|\bpull\b|\bchest\b|\bback\b|\bshoulders?\b|\barms\b/.test(
      t,
    )
  ) {
    return 'upper';
  }
  return 'other';
}

interface PatternBudget {
  /** Max exercises with `primaryMuscleGroup === 'Core'` allowed in the session. */
  maxCore: number;
  /** Max exercises sharing any single tracked movement pattern. */
  maxSamePattern: number;
}

/** Tunable caps. Keep conservative for v1 — we only flag obvious over-concentration. */
const FOCUS_BUDGET: Record<SessionFocus, PatternBudget | null> = {
  upper: { maxCore: 1, maxSamePattern: 3 },
  lower: { maxCore: 1, maxSamePattern: 3 },
  fullbody: { maxCore: 2, maxSamePattern: 2 },
  other: null,
};

/** Primary muscle groups exempt from the sub-muscle cap (stacking is normal for them). */
const SUB_MUSCLE_BUDGET_EXEMPT_PRIMARY = new Set([
  'Calves',
  'Forearms',
  'Core',
  'Cardio',
]);

/**
 * Returns the library ids that exceed the per-session sub-muscle cap. Cap depends
 * on detail level (simple = 2, detailed = 3) and is relaxed to 3 for Full Body
 * sessions (which legitimately spread volume across more sub-muscles).
 *
 * The first sub-muscle on each row is treated as the primary mover (mirrors how
 * the library `score` boost in `exercises.service.ts` weights sub-muscles).
 */
function findOverConcentratedSubMuscleIds(
  exercises: ReadonlyArray<{ exerciseId?: string }>,
  cap: number,
  subMusclesByExerciseId: ChunkValidationSubMuscleMeta,
  primaryMuscleGroupByExerciseId: ChunkValidationPrimaryMuscleMeta,
): string[] {
  const overflow = new Set<string>();
  const buckets = new Map<string, string[]>();

  for (const ex of exercises) {
    const id = ex.exerciseId?.trim();
    if (!id) continue;
    const primary = primaryMuscleGroupByExerciseId.get(id)?.trim();
    if (primary && SUB_MUSCLE_BUDGET_EXEMPT_PRIMARY.has(primary)) continue;
    const subs = subMusclesByExerciseId.get(id);
    if (!subs?.length) continue;
    const primaryMover = String(subs[0] ?? '').trim();
    if (!primaryMover) continue;
    let bucket = buckets.get(primaryMover);
    if (!bucket) {
      bucket = [];
      buckets.set(primaryMover, bucket);
    }
    bucket.push(id);
  }

  for (const bucket of buckets.values()) {
    if (bucket.length > cap) {
      for (const id of bucket.slice(cap)) overflow.add(id);
    }
  }

  return [...overflow];
}

function subMuscleCapForSession(
  detailLevel: 'simple' | 'detailed',
  focus: SessionFocus,
): number {
  if (focus === 'fullbody') return 3;
  return detailLevel === 'detailed' ? 3 : 2;
}

/**
 * Returns the library id of slot 1 when it is **not** in the curated anchor
 * pool for the given focus; `null` otherwise (including when the focus has no
 * anchors, e.g. cardio / recovery / narrow body-part titles).
 *
 * "Slot 1" = the first exercise whose primary muscle group is not Cardio
 * (cardio finishers always live at the tail). Rows without an `exerciseId` are
 * skipped — Groq sometimes leads with a free-text warm-up cue that happens to
 * be in the exercises array on simple-mode chunks.
 */
function findSlotOneNonAnchorId(
  exercises: ReadonlyArray<{ exerciseId?: string }>,
  sessionTitle: string | undefined,
  primaryMuscleGroupByExerciseId: ChunkValidationPrimaryMuscleMeta,
): string | null {
  const accepted = getAcceptedAnchorIdsForFocus(sessionTitle ?? '');
  if (!accepted.length) return null;
  const acceptedSet = new Set(accepted);
  for (const ex of exercises) {
    const id = ex.exerciseId?.trim();
    if (!id) continue;
    const primary = primaryMuscleGroupByExerciseId.get(id)?.trim();
    if (primary === 'Cardio') continue;
    return acceptedSet.has(id) ? null : id;
  }
  return null;
}

/**
 * Returns the library ids that exceed the per-session pattern budget. Order is
 * deterministic — the first `cap` rows of each pattern keep their slot, anything
 * beyond is flagged. Empty array means the session is within budget.
 */
function findOverConcentratedPatternIds(
  exercises: ReadonlyArray<{ exerciseId?: string }>,
  budget: PatternBudget,
  movementPatternsByExerciseId: ChunkValidationMovementMeta,
  primaryMuscleGroupByExerciseId: ChunkValidationPrimaryMuscleMeta,
): string[] {
  const overflow = new Set<string>();
  const coreOrder: string[] = [];
  const patternBuckets = new Map<string, string[]>();

  for (const ex of exercises) {
    const id = ex.exerciseId?.trim();
    if (!id) continue;
    const primary = primaryMuscleGroupByExerciseId.get(id)?.trim();
    if (primary === 'Core') {
      coreOrder.push(id);
      continue;
    }
    if (primary && PATTERN_BUDGET_EXEMPT_PRIMARY.has(primary)) {
      continue;
    }
    const patterns = movementPatternsByExerciseId.get(id);
    if (!patterns?.length) continue;
    // First tracked pattern wins so we don't double-count Push+Pull style cross-tagged moves.
    const primaryPattern = TRACKED_PATTERNS.find((p) => patterns.includes(p));
    if (!primaryPattern) continue;
    let bucket = patternBuckets.get(primaryPattern);
    if (!bucket) {
      bucket = [];
      patternBuckets.set(primaryPattern, bucket);
    }
    bucket.push(id);
  }

  if (coreOrder.length > budget.maxCore) {
    for (const id of coreOrder.slice(budget.maxCore)) overflow.add(id);
  }
  for (const bucket of patternBuckets.values()) {
    if (bucket.length > budget.maxSamePattern) {
      for (const id of bucket.slice(budget.maxSamePattern)) overflow.add(id);
    }
  }

  return [...overflow];
}

function countIdsPerSession(
  sessions: ReadonlyArray<{
    exercises?: ReadonlyArray<{ exerciseId?: string }>;
  }>,
): { perSession: string[][]; totals: Map<string, number> } {
  const perSession: string[][] = [];
  const totals = new Map<string, number>();
  for (const s of sessions) {
    const row: string[] = [];
    for (const ex of s.exercises ?? []) {
      const id = ex.exerciseId?.trim();
      if (!id) continue;
      row.push(id);
      totals.set(id, (totals.get(id) ?? 0) + 1);
    }
    perSession.push(row);
  }
  return { perSession, totals };
}

/**
 * Cardio ids are exempt from the *cross-chunk* duplicate check: repeating a
 * conditioning modality across days is normal programming (a hybrid week with
 * cardioModalities ["run"] has no way to avoid reusing the few run-type ids).
 * Sourced from the metadata map when provided (production), else from the
 * `primaryMuscleGroup` the rows themselves carry (enriched sessions / eval).
 */
function buildCardioIdLookup(
  sessions: ReadonlyArray<{
    exercises?: ReadonlyArray<{
      exerciseId?: string;
      primaryMuscleGroup?: string;
    }>;
  }>,
  primaryMuscleGroupByExerciseId?: ChunkValidationPrimaryMuscleMeta,
): (id: string) => boolean {
  const rowPrimaryById = new Map<string, string>();
  for (const s of sessions) {
    for (const ex of s.exercises ?? []) {
      const id = ex.exerciseId?.trim();
      if (!id || rowPrimaryById.has(id)) continue;
      const pm =
        typeof ex.primaryMuscleGroup === 'string'
          ? ex.primaryMuscleGroup.trim()
          : '';
      if (pm) rowPrimaryById.set(id, pm);
    }
  }
  return (id: string) =>
    (primaryMuscleGroupByExerciseId?.get(id)?.trim() ??
      rowPrimaryById.get(id)) === 'Cardio';
}

/**
 * Deterministic checks on a generated chunk (one batch / hybrid slice, usually one program week).
 * Used to trigger a single batch retry or fall back to per-session generation.
 */
export function validateGeneratedProgramChunk(
  specs: GenerateSessionsDto['sessions'],
  sessions: GeneratedSession[],
  effectiveDetailLevel: 'simple' | 'detailed',
  /** When set (e.g. from in-memory library), reject Squat/Hinge on upper-emphasis strength titles. */
  movementPatternsByExerciseId?: ChunkValidationMovementMeta,
  /**
   * When set alongside `movementPatternsByExerciseId`, also enforce the per-session
   * pattern budget (max core / max same-pattern). Without it, cardio finishers and
   * calf-raise-style isolations can't be exempted, so the check is skipped.
   */
  primaryMuscleGroupByExerciseId?: ChunkValidationPrimaryMuscleMeta,
  /**
   * When set alongside `primaryMuscleGroupByExerciseId`, also enforce the per-session
   * sub-muscle cap (e.g. max 2 hamstring lifts). Without it, the check is skipped.
   */
  subMusclesByExerciseId?: ChunkValidationSubMuscleMeta,
  /**
   * Opt-in for the slot-1 anchor check. Production (`plans.service.ts`) passes
   * `true` because real captures use canonical library ids that line up with
   * `getAcceptedAnchorIdsForFocus`. Synthetic eval fixtures use ids like `bench`
   * / `dup_shared` that intentionally don't match the curated anchor pool, so
   * leave this `false` (default) and let those scenarios stay focused on the
   * bug they were minted to lock in.
   */
  enforceAnchorSlotOne: boolean = false,
): ChunkValidationResult {
  const issues: ChunkValidatorIssue[] = [];
  const duplicateExerciseIds = new Set<string>();
  const patternClashExerciseIds = new Set<string>();
  const patternOverflowExerciseIds = new Set<string>();
  const subMuscleOverflowExerciseIds = new Set<string>();
  const nonAnchorSlotOneExerciseIds = new Set<string>();
  const crossSessionOverlapExerciseIds = new Set<string>();

  if (sessions.length !== specs.length) {
    return {
      ok: false,
      issues,
      duplicateExerciseIds: [],
      patternClashExerciseIds: [],
      patternOverflowExerciseIds: [],
      subMuscleOverflowExerciseIds: [],
      nonAnchorSlotOneExerciseIds: [],
      crossSessionOverlapExerciseIds: [],
    };
  }

  const { perSession } = countIdsPerSession(sessions);
  const isCardioLibraryId = buildCardioIdLookup(
    sessions,
    primaryMuscleGroupByExerciseId,
  );

  // Chunk-wide checks group by weekIndex: weeks 2+ intentionally repeat week 1's
  // selections (clone-and-progress), so only a repeat inside one week is a defect.
  const sessionIndicesByWeek = new Map<number, number[]>();
  for (let i = 0; i < specs.length; i++) {
    const week = specs[i]!.weekIndex;
    const group = sessionIndicesByWeek.get(week) ?? [];
    group.push(i);
    sessionIndicesByWeek.set(week, group);
  }

  for (const ids of perSession) {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) {
        issues.push('duplicate_exercise_id_in_session');
        duplicateExerciseIds.add(id);
      }
      seen.add(id);
    }
  }

  for (const indices of sessionIndicesByWeek.values()) {
    const weekTotals = new Map<string, number>();
    for (const i of indices) {
      for (const id of perSession[i] ?? []) {
        weekTotals.set(id, (weekTotals.get(id) ?? 0) + 1);
      }
    }
    for (const [id, n] of weekTotals) {
      if (n > 1 && !isCardioLibraryId(id)) {
        issues.push('duplicate_exercise_id_across_chunk');
        duplicateExerciseIds.add(id);
      }
    }
  }

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]!;
    const session = sessions[i]!;
    const isCardioOrRecovery =
      spec.type === 'cardio' || spec.type === 'recovery';
    const duration = Math.round((spec.durationMin + spec.durationMax) / 2);
    const { minExercises } = exerciseTargetsForSession(
      duration,
      effectiveDetailLevel,
      isCardioOrRecovery,
    );
    const count = (session.exercises ?? []).filter((e) =>
      String(e.name ?? '').trim(),
    ).length;
    if (count < minExercises) {
      issues.push('below_min_exercises');
    }

    if (
      movementPatternsByExerciseId &&
      spec.type === 'strength' &&
      sessionTitleIsUpperEmphasis(spec.title)
    ) {
      for (const ex of session.exercises ?? []) {
        const id = ex.exerciseId?.trim();
        if (!id) continue;
        const pats = movementPatternsByExerciseId.get(id);
        if (!patternsIncludePrimaryLower(pats)) continue;
        issues.push('primary_lower_pattern_on_upper_focus');
        patternClashExerciseIds.add(id);
      }
    }

    if (
      movementPatternsByExerciseId &&
      primaryMuscleGroupByExerciseId &&
      spec.type === 'strength'
    ) {
      const focus = classifySessionFocus(spec.type, spec.title);
      const budget = FOCUS_BUDGET[focus];
      if (budget) {
        const overflow = findOverConcentratedPatternIds(
          session.exercises ?? [],
          budget,
          movementPatternsByExerciseId,
          primaryMuscleGroupByExerciseId,
        );
        if (overflow.length) {
          issues.push('over_concentrated_pattern');
          for (const id of overflow) patternOverflowExerciseIds.add(id);
        }
      }

      if (subMusclesByExerciseId && budget) {
        const cap = subMuscleCapForSession(effectiveDetailLevel, focus);
        const subOverflow = findOverConcentratedSubMuscleIds(
          session.exercises ?? [],
          cap,
          subMusclesByExerciseId,
          primaryMuscleGroupByExerciseId,
        );
        if (subOverflow.length) {
          issues.push('over_concentrated_sub_muscle');
          for (const id of subOverflow) subMuscleOverflowExerciseIds.add(id);
        }
      }

      if (enforceAnchorSlotOne) {
        const slotOneOffender = findSlotOneNonAnchorId(
          session.exercises ?? [],
          spec.title,
          primaryMuscleGroupByExerciseId,
        );
        if (slotOneOffender) {
          issues.push('slot_one_not_anchor');
          nonAnchorSlotOneExerciseIds.add(slotOneOffender);
        }
      }
    }
  }

  // Phase 7 — cross-session diversity. Group strength sessions by focus
  // (Upper / Lower) within each week; when 2+ sessions share a focus, compare
  // slot-1 openers and flag the second on overlap (same id / same push angle /
  // same lower dominance). Week-scoped because weeks 2+ legitimately repeat
  // week 1's openers. Skipped when we have no primary-muscle map (synthetic
  // tests / cardio-only chunks).
  if (primaryMuscleGroupByExerciseId) {
    for (const indices of sessionIndicesByWeek.values()) {
      const focusGroups = new Map<
        CrossSessionFocus,
        Array<{
          session: GeneratedSession;
          spec: GenerateSessionsDto['sessions'][number];
        }>
      >();
      for (const i of indices) {
        const spec = specs[i]!;
        const session = sessions[i]!;
        if (spec.type !== 'strength') continue;
        const focus = classifySessionFocus(spec.type, spec.title);
        if (focus !== 'upper' && focus !== 'lower') continue;
        let bucket = focusGroups.get(focus);
        if (!bucket) {
          bucket = [];
          focusGroups.set(focus, bucket);
        }
        bucket.push({ session, spec });
      }
      for (const [focus, bucket] of focusGroups) {
        if (bucket.length < 2) continue;
        const signatures = bucket.map((entry) =>
          buildSessionDiversitySignature(
            entry.session.exercises ?? [],
            primaryMuscleGroupByExerciseId,
          ),
        );
        // Compare each later session against the first occurrence of the focus.
        // Trainers tolerate one repeat across 3 same-focus days (rare anyway),
        // but flag the second day for the most common 2-day case.
        const first = signatures[0]!;
        for (let j = 1; j < signatures.length; j++) {
          const violation = compareSameFocusSessionPair(
            focus,
            first,
            signatures[j]!,
          );
          if (violation) {
            issues.push('under_diversified_across_focus');
            crossSessionOverlapExerciseIds.add(violation.exerciseId);
          }
        }
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues: [...new Set(issues)],
    duplicateExerciseIds: [...duplicateExerciseIds],
    patternClashExerciseIds: [...patternClashExerciseIds],
    patternOverflowExerciseIds: [...patternOverflowExerciseIds],
    subMuscleOverflowExerciseIds: [...subMuscleOverflowExerciseIds],
    nonAnchorSlotOneExerciseIds: [...nonAnchorSlotOneExerciseIds],
    crossSessionOverlapExerciseIds: [...crossSessionOverlapExerciseIds],
  };
}

/**
 * Tail list for `priorWeekExerciseIds` — same semantics as batch Groq
 * `[...new Set(ids)].slice(-N)`: duplicate offenders are removed from the prefix
 * then appended so they survive truncation when possible.
 */
export function buildRetryPriorExerciseIds(args: {
  cappedPrior: string[];
  validation: ChunkValidationResult;
  sessions: GeneratedSession[];
}): string[] {
  const fromSessions = args.sessions.flatMap((s) =>
    (s.exercises ?? [])
      .map((e) => e.exerciseId?.trim())
      .filter((id): id is string => !!id),
  );
  const dupOrdered = [
    ...new Set(
      args.validation.duplicateExerciseIds
        .map((x) => String(x).trim())
        .filter(Boolean),
    ),
  ];
  const clashOrdered = [
    ...new Set(
      args.validation.patternClashExerciseIds
        .map((x) => String(x).trim())
        .filter(Boolean),
    ),
  ];
  const overflowOrdered = [
    ...new Set(
      (args.validation.patternOverflowExerciseIds ?? [])
        .map((x) => String(x).trim())
        .filter(Boolean),
    ),
  ];
  const subMuscleOverflowOrdered = [
    ...new Set(
      (args.validation.subMuscleOverflowExerciseIds ?? [])
        .map((x) => String(x).trim())
        .filter(Boolean),
    ),
  ];
  const slotOneOrdered = [
    ...new Set(
      (args.validation.nonAnchorSlotOneExerciseIds ?? [])
        .map((x) => String(x).trim())
        .filter(Boolean),
    ),
  ];
  const crossSessionOrdered = [
    ...new Set(
      (args.validation.crossSessionOverlapExerciseIds ?? [])
        .map((x) => String(x).trim())
        .filter(Boolean),
    ),
  ];
  const hintSet = new Set([
    ...dupOrdered,
    ...clashOrdered,
    ...overflowOrdered,
    ...subMuscleOverflowOrdered,
    ...slotOneOrdered,
    ...crossSessionOrdered,
  ]);
  const base = [...args.cappedPrior, ...fromSessions]
    .map((x) => String(x).trim())
    .filter(Boolean)
    .filter((id) => !hintSet.has(id));
  const merged = [
    ...base,
    ...dupOrdered,
    ...clashOrdered,
    ...overflowOrdered,
    ...subMuscleOverflowOrdered,
    ...slotOneOrdered,
    ...crossSessionOrdered,
  ];
  return [...new Set(merged)].slice(-BATCH_PRIOR_EXERCISE_IDS_TAIL);
}
