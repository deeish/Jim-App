import type {
  GeneratedSession,
  GeneratedSessionExercise,
} from './session-enrichment';
import {
  coachCheckWeek,
  coachRoleOf,
  isCardioRowMeta,
  weeklyVolumeBand,
  groupBandMax,
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
const MAX_ITERATIONS = 60;

/**
 * The fewest sets a trim may leave on a row. A secondary compound at two
 * sets is not a compound any more; the trim drops the day's last accessory
 * before it takes a compound below three (rig run, 2026-09-17).
 */
const ROLE_SET_FLOOR: Record<CoachRole, number> = {
  main: 3,
  compound: 3,
  isolation: 2,
  core: 2,
  hold: 2,
};

/**
 * A main lift gives a set back before the trim drops a second accessory row
 * (rig run 4, 2026-09-17: week-4 Lower kept a 6-set squat and lost both leg
 * accessories, leaving a three-row day).
 */
const MAIN_TRIM_CAP = 5;
/** ...and down to four when dropping a row would leave the day with three or fewer lifts (rig run 6). */
const MAIN_TRIM_CAP_THIN_DAY = 4;
const THIN_DAY_ROWS = 3;

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

function sessionBudgetSeconds(
  spec: AllocationSpec,
  cardioTailSeconds: number,
): number {
  // The lifting is planned at the window's midpoint; a cardio tail rides on
  // the spare window above it (capped at the top), the same rule the prompt
  // and the enrichment caps use (`plannedLiftingMinutes`).
  const mid = Math.round((spec.durationMin + spec.durationMax) / 2);
  const tailMinutes = Math.round(cardioTailSeconds / 60);
  const minutes =
    tailMinutes > 0
      ? Math.min(Math.max(mid, spec.durationMax), mid + tailMinutes)
      : mid;
  return Math.max(0, minutes * 60 - WARMUP_SECONDS);
}

/** Seconds of cardio rows in the session (the finisher tail). */
function cardioTailSeconds(
  session: GeneratedSession,
  findMeta: (id: string) => CoachMeta | undefined,
): number {
  let total = 0;
  for (const row of session.exercises ?? []) {
    const meta = row.exerciseId ? findMeta(row.exerciseId) : undefined;
    if (!isCardioRowMeta(meta, row)) continue;
    total += (row.durationSeconds ?? 0) * Math.max(1, row.sets || 1);
  }
  return total;
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

/**
 * One week's over-band trim. Takes a set off the accessory with the most
 * sets (isolation first, then core, then secondary compounds) while it is
 * above its role's floor; when every accessory of that muscle sits at its
 * floor, drops the day's last isolation or core row for that muscle rather
 * than cutting a compound to two sets. Never touches the main lift. Mutates
 * the cloned rows in place; returns sets removed (a dropped row counts its
 * sets).
 */
function trimWeekOverBand(ctx: {
  sessions: GeneratedSession[];
  idx: number[];
  findMeta: (id: string) => CoachMeta | undefined;
  /** The ceiling for a group (Legs is one and a half bands, see coach-check.ts). */
  bandMaxFor: (group: string) => number;
  volume: () => Record<string, { weighted: number }>;
  notes: string[];
  /**
   * The allocation runs before the progression and works toward a lowered
   * ceiling (block headroom); it takes sets down to the floors and the main
   * lift down to four, and stops there. Only the post-progression trim may
   * drop a row (rig run 8: the headroom ceiling dropped every accessory and
   * left two- and three-row days).
   */
  allowDrop: boolean;
}): number {
  const { sessions, idx, findMeta, bandMaxFor, volume, notes, allowDrop } = ctx;
  let removed = 0;
  const weekSessions = () => idx.map((i) => sessions[i]!);
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const vol = volume();
    const over = Object.entries(vol).filter(
      ([g, v]) => g !== 'Core' && v.weighted > bandMaxFor(g),
    );
    if (over.length === 0) break;
    const refs = classifyRows(weekSessions(), findMeta).map((r) => ({
      ...r,
      sessionIndex: idx[r.sessionIndex]!,
    }));
    let trimmed = false;
    for (const [group] of over) {
      const rowOf = (r: RowRef) =>
        sessions[r.sessionIndex]!.exercises[r.rowIndex]!;
      const rank = (r: RowRef) =>
        r.role === 'isolation'
          ? 0
          : r.role === 'core' || r.role === 'hold'
            ? 1
            : 2;
      const candidates = refs
        .filter((r) => r.group === group && r.role !== 'main')
        .filter((r) => (rowOf(r).sets ?? 0) > ROLE_SET_FLOOR[r.role])
        .sort(
          (a, b) =>
            rank(a) - rank(b) || (rowOf(b).sets ?? 0) - (rowOf(a).sets ?? 0),
        );
      const pick = candidates[0];
      if (pick) {
        const row = rowOf(pick);
        row.sets = (row.sets ?? 0) - 1;
        removed += 1;
        trimmed = true;
        notes.push(
          `-1 set ${row.name ?? row.exerciseId} (${group} over ${bandMaxFor(group)}/wk)`,
        );
        break;
      }
      // Every accessory is at its floor: a main lift above the cap gives a
      // set back before any row is dropped.
      const liftRows = (i: number) =>
        sessions[i]!.exercises.filter(
          (e) =>
            (e.exerciseId
              ? findMeta(e.exerciseId)?.primaryMuscleGroup
              : undefined) !== 'Cardio' && e.prescriptionType !== 'time',
        ).length;
      const capFor = (r: RowRef) =>
        !allowDrop || liftRows(r.sessionIndex) - 1 <= THIN_DAY_ROWS
          ? MAIN_TRIM_CAP_THIN_DAY
          : MAIN_TRIM_CAP;
      const mainOverCap = refs
        .filter((r) => r.group === group && r.role === 'main')
        .filter((r) => (rowOf(r).sets ?? 0) > capFor(r))
        .sort((a, b) => (rowOf(b).sets ?? 0) - (rowOf(a).sets ?? 0))[0];
      if (mainOverCap) {
        const row = rowOf(mainOverCap);
        row.sets = (row.sets ?? 0) - 1;
        removed += 1;
        trimmed = true;
        notes.push(
          `-1 set ${row.name ?? row.exerciseId} (${group} over ${bandMaxFor(group)}/wk, main lift above ${capFor(mainOverCap)})`,
        );
        break;
      }
      // Then drop one row rather than cut a compound to two sets. Isolation
      // first, then core, then the day's last secondary compound; a session
      // keeps at least two rows.
      if (!allowDrop) continue;
      const droppable = refs
        .filter((r) => r.group === group && r.role !== 'main')
        .filter((r) => (sessions[r.sessionIndex]!.exercises?.length ?? 0) > 2)
        .sort((a, b) => rank(a) - rank(b) || b.rowIndex - a.rowIndex);
      const drop = droppable[0];
      if (!drop) continue;
      const session = sessions[drop.sessionIndex]!;
      const row = session.exercises[drop.rowIndex]!;
      removed += Math.max(0, row.sets ?? 0);
      session.exercises = session.exercises.filter(
        (_, j) => j !== drop.rowIndex,
      );
      trimmed = true;
      notes.push(
        `dropped ${row.name ?? row.exerciseId} (${group} over ${bandMaxFor(group)}/wk, accessories at their floor)`,
      );
      break;
    }
    if (!trimmed) break;
  }
  return removed;
}

/**
 * The over-band trim on its own, for after the week progression has
 * multiplied sets: a peak week keeps its extra sets up to the band and no
 * further (rig run 2026-09-17: Legs at 22 in week 1 became 26.5 in week 4).
 */
export function trimWeeklyVolumeToBand(args: {
  sessions: GeneratedSession[];
  specs: AllocationSpec[];
  findMeta: (id: string) => CoachMeta | undefined;
  prefs: { goal?: string; difficulty?: string };
}): AllocationResult {
  const { specs, findMeta, prefs } = args;
  if (args.sessions.length !== specs.length) {
    return { sessions: args.sessions, adjustments: [] };
  }
  const sessions = args.sessions.map((s) => ({
    ...s,
    exercises: (s.exercises ?? []).map((e) => ({ ...e })),
  }));
  const band = weeklyVolumeBand(prefs.goal, prefs.difficulty);
  const adjustments: AllocationResult['adjustments'] = [];
  for (const weekIndex of [...new Set(specs.map((s) => s.weekIndex))]) {
    const idx = specs
      .map((s, i) =>
        s.weekIndex === weekIndex && s.type === 'strength' ? i : -1,
      )
      .filter((i) => i >= 0);
    if (idx.length === 0) continue;
    const notes: string[] = [];
    const volume = () =>
      coachCheckWeek({
        weekIndex,
        sessions: idx.map((i) => ({ session: sessions[i]!, spec: specs[i]! })),
        findMeta,
        prefs,
      }).volumeByMuscle;
    const removed = trimWeekOverBand({
      sessions,
      idx,
      findMeta,
      bandMaxFor: (g) => groupBandMax(g, band),
      volume,
      notes,
      allowDrop: true,
    });
    if (removed > 0) adjustments.push({ weekIndex, added: 0, removed, notes });
  }
  const out = sessions.map((s, i) => {
    const before = args.sessions[i]!;
    const changed =
      (s.exercises ?? []).length !== (before.exercises ?? []).length ||
      (s.exercises ?? []).some(
        (e, j) => e.sets !== before.exercises?.[j]?.sets,
      );
    return changed ? s : before;
  });
  return { sessions: out, adjustments };
}

export function allocateWeeklyVolume(args: {
  sessions: GeneratedSession[];
  specs: AllocationSpec[];
  findMeta: (id: string) => CoachMeta | undefined;
  prefs: { goal?: string; difficulty?: string; priorityMuscle?: string };
  /**
   * The block's largest set multiplier (progression-profile.ts). The
   * allocation runs before the progression multiplies sets, so a week
   * allocated to the ceiling had nowhere to grow: the peak week overflowed
   * the band and the trim cut rows back out (rig runs 4-7, Legs at 22 in
   * week 1 and a three-row lower day in week 4). The block now starts at
   * ceiling ÷ peak and grows into the ceiling. 1 when omitted.
   */
  peakVolumeMultiplier?: number;
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
  const peak = Math.max(1, args.peakVolumeMultiplier ?? 1);
  // The ceiling this allocation works toward: the group's own band max,
  // divided by the block's peak multiplier so the peak week lands on it.
  const ceilingFor = (g: string) =>
    Math.max(band.min + 2, Math.floor(groupBandMax(g, band) / peak));
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
      sessionBudgetSeconds(
        specs[i]!,
        cardioTailSeconds(sessions[i]!, findMeta),
      ) - sessionCostSeconds(sessions[i]!, findMeta);
    // The priority muscle is filled toward the top of its band (two sets
    // under the ceiling), every other group to the floor.
    const groupMin = (g: string) =>
      g === prefs.priorityMuscle
        ? Math.max(band.min, ceilingFor(g) - 2)
        : g === 'Arms' || g === 'Core'
          ? Math.round(band.min / 2)
          : band.min;

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

    // 2b. The priority muscle on a full day: when no session has spare time
    // for another set, move one from the biggest non-priority accessory in
    // the same session, as long as that muscle stays inside the band (rig
    // run 4: Back, the "bring up" choice, landed at 13.5 sets while
    // Shoulders sat at the 22-set ceiling on 30-45 minute days).
    if (prefs.priorityMuscle) {
      const priority = prefs.priorityMuscle;
      for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        const vol = volume();
        const pv = vol[priority];
        if (!pv || pv.direct <= 0 || pv.weighted >= groupMin(priority)) break;
        const refs = classifyRows(weekSessions(), findMeta).map((r) => ({
          ...r,
          sessionIndex: idx[r.sessionIndex]!,
        }));
        const rowOf = (r: RowRef) =>
          sessions[r.sessionIndex]!.exercises[r.rowIndex]!;
        const receivers = refs
          .filter((r) => r.group === priority)
          .filter((r) => (rowOf(r).sets ?? 0) < ROLE_SET_CEILING[r.role])
          .sort((a, b) => {
            const rank = (r: RowRef) =>
              r.role === 'main' ? 0 : r.role === 'compound' ? 1 : 2;
            return rank(a) - rank(b);
          });
        let moved = false;
        for (const receiver of receivers) {
          const donor = refs
            .filter(
              (r) =>
                r.sessionIndex === receiver.sessionIndex &&
                r.group !== priority &&
                r.group !== 'Core' &&
                r.role !== 'main' &&
                (rowOf(r).sets ?? 0) > ROLE_SET_FLOOR[r.role] &&
                (vol[r.group]?.weighted ?? 0) - 1 >= groupMin(r.group),
            )
            .sort(
              (a, b) =>
                (vol[b.group]?.weighted ?? 0) - (vol[a.group]?.weighted ?? 0) ||
                (rowOf(b).sets ?? 0) - (rowOf(a).sets ?? 0),
            )[0];
          if (!donor) continue;
          const from = rowOf(donor);
          const to = rowOf(receiver);
          from.sets = (from.sets ?? 0) - 1;
          to.sets = (to.sets ?? 0) + 1;
          removed += 1;
          added += 1;
          moved = true;
          notes.push(
            `moved 1 set ${from.name ?? from.exerciseId} → ${to.name ?? to.exerciseId} (${priority} is the priority, under ${groupMin(priority)}/wk)`,
          );
          break;
        }
        if (!moved) break;
      }
    }

    // 3. Trim muscles over the band, from accessory rows only.
    removed += trimWeekOverBand({
      sessions,
      idx,
      findMeta,
      bandMaxFor: ceilingFor,
      volume,
      notes,
      allowDrop: false,
    });

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
      if (v && v.weighted + 1 > ceilingFor(g)) continue;
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
    const changed =
      (s.exercises ?? []).length !== (before.exercises ?? []).length ||
      (s.exercises ?? []).some(
        (e, j) => e.sets !== before.exercises?.[j]?.sets,
      );
    return changed ? s : before;
  });
  return { sessions: out, adjustments };
}
