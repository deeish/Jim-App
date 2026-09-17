import type {
  GeneratedSession,
  GeneratedSessionExercise,
} from './session-enrichment';
import type { GenerateSessionsDto } from './dto/generate-sessions.dto';
import { coachRoleOf, isCardioRowMeta, type CoachMeta } from './coach-check';
import {
  getRoleAwareScheme,
  getRoleRestSeconds,
  getRoleTargetRir,
} from '../data/set-rep-schemes';
import { nameMatchesAvoidList } from './session-enrichment';

/**
 * Pattern stacking repair (Tier 2f of the 2026-09-16 plan).
 *
 * The coach check flags a session with more than two pressing compounds or
 * more than two hinges, and the batch prompt asks the model not to write
 * one. The model still does: a Push day of push-up, overhead press and dip
 * is the single most common finding in the re-driven captures. This pass
 * makes the rule hold deterministically. The last stacked press or hinge
 * in the session (never the main lift) becomes an isolation exercise for
 * the same primary muscle, chosen from the catalog under the user's
 * equipment and avoid list and not already used that week, so the muscle
 * keeps its volume and the session loses a redundant heavy pattern.
 */

const MAX_PER_PATTERN = 2;
const STACK_PATTERNS = ['Push', 'Hinge'] as const;
type StackPattern = (typeof STACK_PATTERNS)[number];

/** Catalog fields this pass reads (subset of `TransformedExercise`). */
export type StackingExerciseMeta = CoachMeta & {
  id?: string;
  name?: string;
  equipment?: string[];
  primaryEquipment?: string[];
  prescriptionType?: string;
};

export type StackingLibrary = {
  findOne: (id: string) => StackingExerciseMeta | undefined;
  getCandidatesForGenerator: (options: {
    focus: string;
    equipment?: string[];
    excludeIds?: string[];
    limit?: number;
  }) => Array<StackingExerciseMeta & { id: string; name: string }>;
};

function isIsolationMeta(meta: StackingExerciseMeta): boolean {
  return (meta.type ?? '').toLowerCase() === 'isolation';
}

/** The pool focus that lists isolation work for a primary muscle. */
function focusForMuscle(primary: string): string {
  const p = primary.toLowerCase();
  if (p === 'chest' || p === 'shoulders' || p === 'triceps') return p;
  if (p === 'hamstrings' || p === 'glutes' || p === 'quads' || p === 'legs')
    return 'lower';
  if (p === 'back' || p === 'biceps') return p;
  return p;
}

export type StackingRepairResult = {
  sessions: GeneratedSession[];
  repairs: number;
  notes: string[];
};

export function repairPatternStacking(args: {
  sessions: GeneratedSession[];
  specs: GenerateSessionsDto['sessions'];
  library: StackingLibrary;
  equipment?: string[];
  avoidConstraintsGlobal?: string[];
  prefs?: { goal?: string; difficulty?: string };
}): StackingRepairResult {
  const { specs, library, equipment, prefs } = args;
  const notes: string[] = [];
  let repairs = 0;

  // Ids and names in use per week, so a swap never duplicates a lift.
  const weekIds = new Map<number, Set<string>>();
  const weekNames = new Map<number, Set<string>>();
  args.sessions.forEach((s, i) => {
    const wi = specs[i]?.weekIndex ?? s.weekIndex;
    if (!weekIds.has(wi)) weekIds.set(wi, new Set());
    if (!weekNames.has(wi)) weekNames.set(wi, new Set());
    for (const e of s.exercises) {
      if (e.exerciseId) weekIds.get(wi)!.add(e.exerciseId);
      weekNames.get(wi)!.add((e.name ?? '').trim().toLowerCase());
    }
  });

  const sessions = args.sessions.map((session, i) => {
    const spec = specs[i];
    if (!spec || spec.type !== 'strength') return session;
    const wi = spec.weekIndex;
    const avoid = [
      ...new Set([
        ...(args.avoidConstraintsGlobal ?? []),
        ...(spec.avoidConstraints ?? []),
      ]),
    ];

    let rows = session.exercises;
    let changed = false;
    for (const pattern of STACK_PATTERNS) {
      // Re-evaluate after each swap: roles depend on order and metadata.
      for (let guard = 0; guard < 4; guard++) {
        const stacked = stackedRows(rows, pattern, (id) => library.findOne(id));
        if (stacked.length <= MAX_PER_PATTERN) break;
        // Keep the main lift and the next press/hinge; demote the last one.
        const victimIndex = stacked[stacked.length - 1]!;
        const victim = rows[victimIndex]!;
        const meta = victim.exerciseId
          ? library.findOne(victim.exerciseId)
          : undefined;
        const primary = meta?.primaryMuscleGroup ?? victim.primaryMuscleGroup;
        if (!primary) break;
        const pick = pickIsolation({
          library,
          primary,
          equipment,
          avoid,
          usedIds: weekIds.get(wi) ?? new Set(),
          usedNames: weekNames.get(wi) ?? new Set(),
        });
        if (!pick) break;
        const scheme = getRoleAwareScheme(
          prefs?.goal,
          prefs?.difficulty,
          'isolation',
        );
        const replacement: GeneratedSessionExercise = {
          name: pick.name,
          exerciseId: pick.id,
          sets: Math.min(victim.sets || scheme.sets, scheme.sets),
          reps: scheme.repsMin,
          repsMin: scheme.repsMin,
          repsMax: scheme.repsMax,
          restSeconds: getRoleRestSeconds(
            prefs?.goal,
            prefs?.difficulty,
            'isolation',
          ),
          targetRir: getRoleTargetRir(
            prefs?.goal,
            prefs?.difficulty,
            'isolation',
          ),
          prescriptionType:
            (pick.prescriptionType as
              | GeneratedSessionExercise['prescriptionType']
              | undefined) ?? 'reps',
          primaryMuscleGroup: pick.primaryMuscleGroup,
          ...(pick.secondaryMuscleGroups?.length
            ? { secondaryMuscleGroups: [...pick.secondaryMuscleGroups] }
            : {}),
          notes:
            pattern === 'Push'
              ? 'Swapped in for a third pressing lift: two heavy presses is enough for one day, and this keeps the muscle working without another loaded pattern.'
              : 'Swapped in for a third hinge: two heavy hinges is enough for one day, and this keeps the muscle working without another loaded pattern.',
        };
        rows = rows.map((r, idx) => (idx === victimIndex ? replacement : r));
        if (victim.exerciseId) weekIds.get(wi)?.delete(victim.exerciseId);
        weekIds.get(wi)?.add(pick.id);
        weekNames.get(wi)?.add(pick.name.trim().toLowerCase());
        changed = true;
        repairs += 1;
        notes.push(
          `${spec.title ?? spec.weekday} (week ${wi}): ${victim.name} → ${pick.name} (${stacked.length} ${pattern.toLowerCase()} movements)`,
        );
      }
    }
    return changed ? { ...session, exercises: rows } : session;
  });

  return { sessions, repairs, notes };
}

/** Indices of the rows the coach check counts toward a pattern stack, in order. */
function stackedRows(
  rows: GeneratedSessionExercise[],
  pattern: StackPattern,
  findMeta: (id: string) => StackingExerciseMeta | undefined,
): number[] {
  const out: number[] = [];
  let mainAssigned = false;
  rows.forEach((row, idx) => {
    const meta = row.exerciseId ? findMeta(row.exerciseId) : undefined;
    if (isCardioRowMeta(meta, row)) return;
    if ((row.sets ?? 0) <= 0) return;
    const role = coachRoleOf(meta, row, mainAssigned);
    if (role === 'main') mainAssigned = true;
    if (!(meta?.movementPatterns ?? []).includes(pattern)) return;
    // Mirrors coach-check: hinges of any role count, presses only compounds.
    if (
      pattern === 'Hinge' ||
      (role !== 'isolation' && role !== 'core' && role !== 'hold')
    ) {
      out.push(idx);
    }
  });
  return out;
}

function pickIsolation(args: {
  library: StackingLibrary;
  primary: string;
  equipment?: string[];
  avoid: string[];
  usedIds: Set<string>;
  usedNames: Set<string>;
}): (StackingExerciseMeta & { id: string; name: string }) | undefined {
  const { library, primary, equipment, avoid, usedIds, usedNames } = args;
  const pool = library.getCandidatesForGenerator({
    focus: focusForMuscle(primary),
    equipment: equipment?.length ? equipment : undefined,
    excludeIds: [...usedIds],
    limit: 120,
  });
  return pool.find(
    (c) =>
      isIsolationMeta(c) &&
      (c.primaryMuscleGroup ?? '') === primary &&
      c.primaryMuscleGroup !== 'Cardio' &&
      !usedIds.has(c.id) &&
      !usedNames.has(c.name.trim().toLowerCase()) &&
      !nameMatchesAvoidList(c.name, avoid) &&
      // A fly is tagged Push in the catalog but the coach check only counts
      // pressing compounds; a hinge counts at any role, so none may return.
      !(c.movementPatterns ?? []).includes('Hinge'),
  );
}
