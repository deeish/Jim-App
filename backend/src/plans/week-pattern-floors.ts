import type {
  GeneratedSession,
  GeneratedSessionExercise,
} from './session-enrichment';
import {
  buildStrengthReasoning,
  exerciseRowIsBalanceInsert,
  nameMatchesAvoidList,
  sessionTitleIsLowerEmphasis,
  sessionTitleIsUpperEmphasis,
} from './session-enrichment';
import {
  classifyLowerDominance,
  classifyPushAngle,
  classifyPullAngle,
} from './cross-session-diversity';

/**
 * Week-level movement-pattern floors. Session-scoped balance checks (pull on
 * upper days, squat/hinge on lower titles) cannot see the week, so live plans
 * shipped a 4-day upper/lower split with zero vertical pressing anywhere and
 * a legs day whose only loaded pattern was a hinge. A coach guarantees the
 * week as a whole trains the fundamentals: knee-dominant (squat/lunge), hip
 * hinge, horizontal + vertical push, horizontal + vertical pull.
 *
 * For each floor a week misses, one redundant/accessory row in a
 * title-appropriate session is swapped for a staple that provides it (pools
 * are staple-first, so the pick is canonical). Slot-1 anchors, deterministic
 * balance inserts, cardio rows, and any row that is the week's only source of
 * another floor are never touched. Sets/reps/rest are inherited from the
 * replaced row so stamped prescriptions stay coherent.
 */

export type WeekFloorKey =
  | 'knee'
  | 'hinge'
  | 'push_h'
  | 'push_v'
  | 'pull_h'
  | 'pull_v';

const ALL_FLOOR_KEYS: readonly WeekFloorKey[] = [
  'knee',
  'hinge',
  'push_h',
  'pull_h',
  'push_v',
  'pull_v',
];

type FloorExerciseMeta = {
  id: string;
  name: string;
  primaryMuscleGroup?: string;
  secondaryMuscleGroups?: string[];
  movementPatterns?: string[];
  prescriptionType?: GeneratedSessionExercise['prescriptionType'];
};

export type WeekFloorLibrary = {
  findOne(id: string): FloorExerciseMeta | undefined;
  getCandidatesForGenerator(options: {
    focus: string;
    equipment?: string[];
    excludeIds?: string[];
    limit?: number;
  }): FloorExerciseMeta[];
};

/** The floors a single exercise row provides. */
export function floorKeysForExercise(
  name: string,
  meta: { movementPatterns?: string[] } | undefined,
): Set<WeekFloorKey> {
  const patterns = new Set(meta?.movementPatterns ?? []);
  const keys = new Set<WeekFloorKey>();
  const lower = classifyLowerDominance(name);
  if (
    patterns.has('Squat') ||
    patterns.has('Lunge') ||
    lower === 'squat' ||
    lower === 'lunge'
  ) {
    keys.add('knee');
  }
  if (patterns.has('Hinge') || lower === 'hinge') keys.add('hinge');
  if (patterns.has('Push')) {
    const angle = classifyPushAngle(name);
    if (angle === 'overhead') keys.add('push_v');
    else if (angle !== 'other') keys.add('push_h');
  }
  if (patterns.has('Pull')) {
    const angle = classifyPullAngle(name);
    if (angle === 'vertical') keys.add('pull_v');
    else if (angle === 'horizontal') keys.add('pull_h');
  }
  return keys;
}

/** Can this floor key sensibly be inserted into a session with this title? */
function sessionAcceptsKey(
  title: string | undefined,
  key: WeekFloorKey,
): boolean {
  const t = (title ?? '').toLowerCase();
  const upper = sessionTitleIsUpperEmphasis(title);
  const lower = sessionTitleIsLowerEmphasis(title);
  const fullBody = !upper && !lower;
  switch (key) {
    case 'knee':
    case 'hinge':
      return lower || fullBody;
    case 'push_h':
    case 'push_v':
      // Never force a press onto a pull/back day.
      return fullBody || (upper && !/\bpull\b|\bback\b/.test(t));
    case 'pull_h':
    case 'pull_v':
      // Never force a row onto a push/chest day.
      return fullBody || (upper && !/\bpush\b|\bchest\b/.test(t));
  }
}

/**
 * Candidate pool focus for a missing floor. Pools must target the missing
 * pattern, not the host session's title: a "Full Body" title yields the whole
 * catalog, and with staple-first ordering plus the pool size cap, the only
 * equipment-viable vertical pull for a home user can fall outside the cap
 * (observed live: a home week kept missing its vertical pull).
 */
function focusForKey(key: WeekFloorKey): string {
  switch (key) {
    case 'knee':
    case 'hinge':
      return 'lower';
    case 'push_h':
    case 'push_v':
      return 'push';
    case 'pull_h':
    case 'pull_v':
      return 'pull';
  }
}

function rowIsCardio(
  e: GeneratedSessionExercise,
  findMeta: (id: string) => FloorExerciseMeta | undefined,
): boolean {
  const id = e.exerciseId?.trim();
  const group =
    (id ? findMeta(id)?.primaryMuscleGroup : undefined) ?? e.primaryMuscleGroup;
  return (group ?? '').toLowerCase() === 'cardio';
}

/**
 * Rebuild the session's deterministic reasoning after a swap, preserving the
 * appended "Note: …" coach sentences (the prefix is list-derived and now
 * stale; the notes are still true).
 */
function refreshReasoning(
  session: GeneratedSession,
  findMeta: (id: string) => FloorExerciseMeta | undefined,
): void {
  const rebuilt = buildStrengthReasoning(session.exercises ?? [], findMeta);
  if (!rebuilt) return;
  const existing = session.reasoning ?? '';
  const noteIdx = existing.indexOf(' Note: ');
  session.reasoning =
    noteIdx >= 0 ? rebuilt + existing.slice(noteIdx) : rebuilt;
}

export function enforceWeekPatternFloors(args: {
  sessions: GeneratedSession[];
  specs: Array<{ type: string; title?: string; weekIndex: number }>;
  library: WeekFloorLibrary;
  equipment: string[] | undefined;
  avoidConstraintsGlobal?: string[];
}): { sessions: GeneratedSession[]; repairs: number } {
  const { specs, library, equipment } = args;
  if (args.sessions.length !== specs.length) {
    return { sessions: args.sessions, repairs: 0 };
  }
  const sessions = args.sessions.map((s) => ({
    ...s,
    exercises: (s.exercises ?? []).map((e) => ({ ...e })),
  }));
  const findMeta = (id: string) => library.findOne(id);
  const avoid = (args.avoidConstraintsGlobal ?? []).filter(
    (p) => typeof p === 'string' && p.trim().length >= 2,
  );

  const weekGroups = new Map<number, number[]>();
  for (let i = 0; i < specs.length; i++) {
    const group = weekGroups.get(specs[i]!.weekIndex) ?? [];
    group.push(i);
    weekGroups.set(specs[i]!.weekIndex, group);
  }

  let repairs = 0;
  for (const indices of weekGroups.values()) {
    const strengthIdx = indices.filter(
      (i) => specs[i]!.type === 'strength' && sessions[i]!.exercises?.length,
    );
    // A single session cannot host six patterns; session-level balance
    // passes already cover that case.
    if (strengthIdx.length < 2) continue;

    const keysOfRow = (e: GeneratedSessionExercise): Set<WeekFloorKey> =>
      floorKeysForExercise(
        e.name ?? '',
        e.exerciseId ? findMeta(e.exerciseId.trim()) : undefined,
      );

    const weekCounts = new Map<WeekFloorKey, number>(
      ALL_FLOOR_KEYS.map((k) => [k, 0]),
    );
    for (const i of strengthIdx) {
      for (const e of sessions[i]!.exercises) {
        if (rowIsCardio(e, findMeta)) continue;
        for (const k of keysOfRow(e)) {
          weekCounts.set(k, (weekCounts.get(k) ?? 0) + 1);
        }
      }
    }

    const weekIds = () =>
      new Set(
        strengthIdx.flatMap((i) =>
          sessions[i]!.exercises.map((e) => e.exerciseId?.trim()).filter(
            (x): x is string => !!x,
          ),
        ),
      );
    const weekNames = () =>
      new Set(
        strengthIdx.flatMap((i) =>
          sessions[i]!.exercises.map((e) =>
            (e.name ?? '').trim().toLowerCase(),
          ),
        ),
      );

    for (const key of ALL_FLOOR_KEYS) {
      if ((weekCounts.get(key) ?? 0) > 0) continue;
      const hosts = strengthIdx.filter((i) =>
        sessionAcceptsKey(specs[i]!.title, key),
      );
      if (!hosts.length) continue; // e.g. an upper-only week never gets a squat forced in

      let done = false;
      for (const i of hosts) {
        if (done) break;
        const rows = sessions[i]!.exercises;
        // First strength row is the session's main lift — never replace it.
        const slotOne = rows.findIndex((e) => !rowIsCardio(e, findMeta));
        for (let r = rows.length - 1; r > slotOne && r >= 0; r--) {
          const row = rows[r]!;
          if (rowIsCardio(row, findMeta)) continue;
          if (exerciseRowIsBalanceInsert(row)) continue;
          // Never remove the week's only source of another floor.
          const provided = keysOfRow(row);
          let sole = false;
          for (const k of provided) {
            if ((weekCounts.get(k) ?? 0) <= 1) sole = true;
          }
          if (sole) continue;

          const ids = weekIds();
          const names = weekNames();
          const pool = library.getCandidatesForGenerator({
            focus: focusForKey(key),
            equipment: equipment?.length ? equipment : undefined,
            excludeIds: [...ids],
            limit: 90,
          });
          const pick = pool.find(
            (c) =>
              c.primaryMuscleGroup !== 'Cardio' &&
              !ids.has(c.id) &&
              !names.has((c.name ?? '').trim().toLowerCase()) &&
              !nameMatchesAvoidList(c.name, avoid) &&
              floorKeysForExercise(c.name, c).has(key),
          );
          if (!pick) continue;

          rows.splice(r, 1, {
            name: pick.name,
            exerciseId: pick.id,
            sets: row.sets,
            reps: row.reps,
            ...(row.weight != null ? { weight: row.weight } : {}),
            ...(row.repsMin != null ? { repsMin: row.repsMin } : {}),
            ...(row.repsMax != null ? { repsMax: row.repsMax } : {}),
            ...(row.restSeconds != null
              ? { restSeconds: row.restSeconds }
              : {}),
            notes:
              'Added so your week trains every fundamental movement pattern.',
            prescriptionType: pick.prescriptionType ?? 'reps',
            primaryMuscleGroup: pick.primaryMuscleGroup,
            ...(pick.secondaryMuscleGroups?.length
              ? { secondaryMuscleGroups: [...pick.secondaryMuscleGroups] }
              : {}),
          });
          for (const k of provided) {
            weekCounts.set(k, Math.max(0, (weekCounts.get(k) ?? 1) - 1));
          }
          for (const k of floorKeysForExercise(pick.name, pick)) {
            weekCounts.set(k, (weekCounts.get(k) ?? 0) + 1);
          }
          refreshReasoning(sessions[i]!, findMeta);
          repairs++;
          done = true;
          break;
        }
      }
    }
  }
  return { sessions, repairs };
}
