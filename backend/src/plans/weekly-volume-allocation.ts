import type {
  GeneratedSession,
  GeneratedSessionExercise,
} from './session-enrichment';
import {
  coachCheckWeek,
  coachRoleOf,
  isCardioRowMeta,
  weeklyVolumeBand,
  type CoachMeta,
  type CoachRole,
} from './coach-check';

/**
 * Sets allocated from the week, not from a per-exercise band.
 *
 * Before this pass, every row's set count came from its role band and the
 * session's time cap could only TRIM. So a short session was five lifts at
 * two sets, and nothing ever added a set where a muscle was short for the
 * week (2026-09-16 review). This pass runs once per week after enrichment:
 *
 *  1. Every session gets a time budget: the slot's minutes minus a six-minute
 *     warm-up, minus its cardio tail. A set costs its row's rest plus ~35 s
 *     under load (holds cost their duration instead).
 *  2. Muscles under the goal-and-level band (`weeklyVolumeBand`) get sets
 *     added, one at a time, to the best row for that muscle: a compound
 *     before isolation, the session with the most spare time first, never
 *     past the role's ceiling, never beyond the session's budget.
 *  3. Muscles over the band lose sets from their isolation and secondary
 *     rows, never the session's main lift, never below two.
 *  4. Spare time left after that goes to each session's main lift, up to
 *     one extra set, while that muscle stays inside the band.
 *
 * Selection is not touched: a muscle with no direct work stays untrained
 * here (that is a prompt and pattern-floor matter). Bounded and deterministic.
 */

export type AllocationSpec = {
  type: 'strength' | 'cardio' | 'recovery';
  weekday: string;
  title?: string;
  weekIndex: number;
  durationMin: number;
  durationMax: number;
};

export type AllocationResult = {
  sessions: GeneratedSession[];
  /** Sets added minus sets removed, per week, for the log. */
  adjustments: Array<{
    weekIndex: number;
    added: number;
    removed: number;
    notes: string[];
  }>;
};

const WARMUP_SECONDS = 6 * 60;
const SECONDS_UNDER_LOAD = 35;
const MAX_ITERATIONS = 24;

const ROLE_SET_CEILING: Record<CoachRole, number> = {
  main: 6,
  compound: 5,
  isolation: 4,
  core: 4,
  hold: 4,
};

type Row = GeneratedSessionExercise;

function setCost(row: Row): number {
  if (row.prescriptionType === 'time') {
    return (row.durationSeconds ?? 40) + (row.restSeconds ?? 60);
  }
  return (row.restSeconds ?? 90) + SECONDS_UNDER_LOAD;
}

function sessionBudgetSeconds(spec: AllocationSpec): number {
  const minutes = Math.round((spec.durationMin + spec.durationMax) / 2);
  return Math.max(0, minutes * 60 - WARMUP_SECONDS);
}

function sessionCostSeconds(
  session: GeneratedSession,
  findMeta: (id: string) => CoachMeta | undefined,
): number {
  let total = 0;
  for (const row of session.exercises ?? []) {
    const meta = row.exerciseId ? findMeta(row.exerciseId) : undefined;
    if (isCardioRowMeta(meta, row)) {
      total += (row.durationSeconds ?? 0) * Math.max(1, row.sets || 1);
      continue;
    }
    total += Math.max(0, row.sets ?? 0) * setCost(row);
  }
  return total;
}

type RowRef = {
  sessionIndex: number;
  rowIndex: number;
  role: CoachRole;
  group: string | undefined;
};

function classifyRows(
  sessions: GeneratedSession[],
  findMeta: (id: string) => CoachMeta | undefined,
): RowRef[] {
  const refs: RowRef[] = [];
  sessions.forEach((session, sessionIndex) => {
    let mainAssigned = false;
    (session.exercises ?? []).forEach((row, rowIndex) => {
      const meta = row.exerciseId ? findMeta(row.exerciseId) : undefined;
      if (isCardioRowMeta(meta, row)) return;
      const role = coachRoleOf(meta, row, mainAssigned);
      if (role === 'main') mainAssigned = true;
      refs.push({
        sessionIndex,
        rowIndex,
        role,
        group: meta?.primaryMuscleGroup,
      });
    });
  });
  return refs;
}

export function allocateWeeklyVolume(args: {
  sessions: GeneratedSession[];
  specs: AllocationSpec[];
  findMeta: (id: string) => CoachMeta | undefined;
  prefs: { goal?: string; difficulty?: string };
}): AllocationResult {
  const { specs, findMeta, prefs } = args;
  if (args.sessions.length !== specs.length) {
    return { sessions: args.sessions, adjustments: [] };
  }
  // Clone rows so the caller's objects survive untouched.
  const sessions = args.sessions.map((s) => ({
    ...s,
    exercises: (s.exercises ?? []).map((e) => ({ ...e })),
  }));
  const band = weeklyVolumeBand(prefs.goal, prefs.difficulty);
  const adjustments: AllocationResult['adjustments'] = [];

  const weekIndices = [...new Set(specs.map((s) => s.weekIndex))];
  for (const weekIndex of weekIndices) {
    const idx = specs
      .map((s, i) =>
        s.weekIndex === weekIndex && s.type === 'strength' ? i : -1,
      )
      .filter((i) => i >= 0);
    if (idx.length === 0) continue;
    const notes: string[] = [];
    let added = 0;
    let removed = 0;

    const weekSessions = () => idx.map((i) => sessions[i]!);
    const volume = () =>
      coachCheckWeek({
        weekIndex,
        sessions: idx.map((i) => ({ session: sessions[i]!, spec: specs[i]! })),
        findMeta,
        prefs,
      }).volumeByMuscle;
    const spare = (i: number) =>
      sessionBudgetSeconds(specs[i]!) -
      sessionCostSeconds(sessions[i]!, findMeta);
    const groupMin = (g: string) =>
      g === 'Arms' || g === 'Core' ? Math.round(band.min / 2) : band.min;

    // 2. Fill muscles under the band.
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const vol = volume();
      const refs = classifyRows(weekSessions(), findMeta).map((r) => ({
        ...r,
        sessionIndex: idx[r.sessionIndex]!,
      }));
      const under = Object.entries(vol)
        .filter(([g, v]) => v.direct > 0 && v.weighted < groupMin(g))
        .sort(
          (a, b) =>
            groupMin(a[0]) - a[1].weighted - (groupMin(b[0]) - b[1].weighted),
        )
        .reverse();
      if (under.length === 0) break;
      let placed = false;
      for (const [group] of under) {
        const candidates = refs
          .filter((r) => r.group === group)
          .filter((r) => {
            const row = sessions[r.sessionIndex]!.exercises[r.rowIndex]!;
            return (
              (row.sets ?? 0) < ROLE_SET_CEILING[r.role] &&
              spare(r.sessionIndex) >= setCost(row)
            );
          })
          .sort((a, b) => {
            const rank = (r: RowRef) =>
              r.role === 'main' ? 0 : r.role === 'compound' ? 1 : 2;
            return (
              rank(a) - rank(b) || spare(b.sessionIndex) - spare(a.sessionIndex)
            );
          });
        const pick = candidates[0];
        if (!pick) continue;
        const row = sessions[pick.sessionIndex]!.exercises[pick.rowIndex]!;
        row.sets = (row.sets ?? 0) + 1;
        added += 1;
        placed = true;
        notes.push(
          `+1 set ${row.name ?? row.exerciseId} (${group} under ${groupMin(group)}/wk)`,
        );
        break;
      }
      if (!placed) break;
    }

    // 3. Trim muscles over the band, from accessory rows only.
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const vol = volume();
      const over = Object.entries(vol).filter(([, v]) => v.weighted > band.max);
      if (over.length === 0) break;
      const refs = classifyRows(weekSessions(), findMeta).map((r) => ({
        ...r,
        sessionIndex: idx[r.sessionIndex]!,
      }));
      let trimmed = false;
      for (const [group] of over) {
        const candidates = refs
          .filter((r) => r.group === group && r.role !== 'main')
          .filter(
            (r) =>
              (sessions[r.sessionIndex]!.exercises[r.rowIndex]!.sets ?? 0) > 2,
          )
          .sort((a, b) => {
            const rank = (r: RowRef) =>
              r.role === 'isolation'
                ? 0
                : r.role === 'core' || r.role === 'hold'
                  ? 1
                  : 2;
            const sa =
              sessions[a.sessionIndex]!.exercises[a.rowIndex]!.sets ?? 0;
            const sb =
              sessions[b.sessionIndex]!.exercises[b.rowIndex]!.sets ?? 0;
            return rank(a) - rank(b) || sb - sa;
          });
        const pick = candidates[0];
        if (!pick) continue;
        const row = sessions[pick.sessionIndex]!.exercises[pick.rowIndex]!;
        row.sets = (row.sets ?? 0) - 1;
        removed += 1;
        trimmed = true;
        notes.push(
          `-1 set ${row.name ?? row.exerciseId} (${group} over ${band.max}/wk)`,
        );
        break;
      }
      if (!trimmed) break;
    }

    // 4. Spare time goes to the main lift, one set, while its muscle stays in band.
    for (const i of idx) {
      const refs = classifyRows([sessions[i]!], findMeta);
      const main = refs.find((r) => r.role === 'main');
      if (!main) continue;
      const row = sessions[i]!.exercises[main.rowIndex]!;
      if ((row.sets ?? 0) >= ROLE_SET_CEILING.main) continue;
      if (spare(i) < setCost(row)) continue;
      const g = main.group;
      const v = g ? volume()[g] : undefined;
      if (v && v.weighted + 1 > band.max) continue;
      row.sets = (row.sets ?? 0) + 1;
      added += 1;
      notes.push(
        `+1 set ${row.name ?? row.exerciseId} (spare time on ${specs[i]!.weekday})`,
      );
    }

    if (added > 0 || removed > 0)
      adjustments.push({ weekIndex, added, removed, notes });
  }

  // Keep `reps` (the working default) in step with any changed range — sets
  // changed, ranges did not, so nothing to do there; return clones only for
  // sessions that changed.
  const out = sessions.map((s, i) => {
    const before = args.sessions[i]!;
    const changed = (s.exercises ?? []).some(
      (e, j) => e.sets !== before.exercises?.[j]?.sets,
    );
    return changed ? s : before;
  });
  return { sessions: out, adjustments };
}
