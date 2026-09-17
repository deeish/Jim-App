import type { ExerciseDraft, PlanDraft, PlanInputs, SessionDraft, Weekday } from '../types/plan';
import { replaceExercise } from '../services/exerciseService';
import { applyRecordedSwaps, type RecordedSwap } from './planPipeline';
import { weekProgressionForGenerateSessions } from './planGenerationSummary';
import { formatRepRange } from './formatExerciseRepsDisplay';
import { exerciseUsesTimeDisplay } from './exercisePrescription';

/**
 * Draft edits and card copy for the redesigned plan preview (2026-09-17).
 * Pure where it can be; the one network call (a catalog swap) is isolated
 * in `swapExerciseInDraft` so the screens stay thin.
 */

const WEEKDAYS: Weekday[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function findSession(
  draft: PlanDraft | null | undefined,
  weekIndex: number,
  weekday: string,
): SessionDraft | null {
  return (
    draft?.weeks.find((w) => w.weekIndex === weekIndex)?.days.find((d) => d.weekday === weekday)?.session ??
    null
  );
}

/** Replaces one day's session (or clears it with null). */
export function withSession(
  draft: PlanDraft,
  weekIndex: number,
  weekday: string,
  session: SessionDraft | null,
): PlanDraft {
  return {
    ...draft,
    weeks: draft.weeks.map((w) =>
      w.weekIndex === weekIndex
        ? { ...w, days: w.days.map((d) => (d.weekday === weekday ? { ...d, session } : d)) }
        : w,
    ),
  };
}

export function removeDayFromDraft(draft: PlanDraft, weekIndex: number, weekday: string): PlanDraft {
  return withSession(draft, weekIndex, weekday, null);
}

/**
 * Swaps one exercise for a catalog alternative that fits the day (same
 * muscle, not already in the day, a different movement). The slot's
 * prescription is kept; only the identity changes. `scope: 'all'` also swaps
 * it on the same weekday of every other week. Resolves null when the
 * catalog has no fit.
 */
export async function swapExerciseInDraft(args: {
  draft: PlanDraft;
  planInputs: PlanInputs;
  weekIndex: number;
  weekday: Weekday;
  exerciseName: string;
  scope: 'week' | 'all';
}): Promise<{ draft: PlanDraft; swap: RecordedSwap } | null> {
  const { draft, planInputs, weekIndex, weekday, exerciseName, scope } = args;
  const session = findSession(draft, weekIndex, weekday);
  if (!session) return null;
  const targetIndex = session.exercises.findIndex((e) => e.name === exerciseName);
  if (targetIndex < 0) return null;
  const target = session.exercises[targetIndex]!;
  const avoid = [
    ...(planInputs.injuriesAvoid?.bodyAreas ?? []),
    ...(planInputs.injuriesAvoid?.movementsOrEquipment ?? []),
  ];
  const picked = await replaceExercise({
    targetName: target.name,
    targetExerciseId: target.exerciseId ?? undefined,
    dayExerciseNames: session.exercises.map((e) => e.name).filter(Boolean),
    dayExerciseIds: session.exercises.map((e) => e.exerciseId).filter((id): id is string => !!id),
    location: planInputs.location,
    avoid: avoid.length ? avoid : undefined,
  });
  if (!picked) return null;
  const replacement: ExerciseDraft = {
    ...target,
    exerciseId: picked.id,
    name: picked.name,
    primaryMuscleGroup: picked.primaryMuscleGroup,
    secondaryMuscleGroups: picked.secondaryMuscleGroups?.length ? [...picked.secondaryMuscleGroups] : undefined,
    notes: undefined,
  };
  const swap: RecordedSwap = {
    weeks: scope === 'all' ? 'all' : weekIndex,
    weekday,
    fromName: target.name,
    to: {
      exerciseId: replacement.exerciseId,
      name: replacement.name,
      primaryMuscleGroup: replacement.primaryMuscleGroup,
      secondaryMuscleGroups: replacement.secondaryMuscleGroups,
    },
  };
  const thisWeek = withSession(draft, weekIndex, weekday, {
    ...session,
    exercises: session.exercises.map((ex, i) => (i === targetIndex ? replacement : ex)),
  });
  return { draft: scope === 'all' ? applyRecordedSwaps(thisWeek, [swap]) : thisWeek, swap };
}

// ---- copy for the list ---------------------------------------------------

/** "4 × 8–12" for a strength row, "25 min" for a timed one. */
export function shortPrescription(e: ExerciseDraft): string {
  const timed = exerciseUsesTimeDisplay(e.prescriptionType, e.name, e.primaryMuscleGroup);
  if (timed) {
    const s = e.durationSeconds ?? e.repsRaw;
    if (s && s >= 60) return `${Math.round(s / 60)} min`;
    if (s) return `${e.sets} × ${s} sec`;
    return `${e.sets} × ${e.reps}`;
  }
  const range = formatRepRange(e.repsMin, e.repsMax);
  return `${e.sets} × ${range ?? e.reps}`;
}

/** A short movement name for a card: "Flat Barbell Bench Press" → "Bench press". */
export function leadLiftName(name: string): string {
  let n = name
    .replace(/\((.*?)\)/g, '')
    .replace(/\b(flat|barbell|dumbbell|conventional|seated|standing|wide-grip|close-grip|machine|cable|bodyweight)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!n) n = name;
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
}

/**
 * The one line under a day card. Strength: the lift that leads with its
 * sets and reps, then the count. Cardio: the block. Recovery: the block or
 * the count. Never the day's title again.
 */
export function daySummaryLine(session: SessionDraft): string {
  const rows = session.exercises.filter((e) => (e.sets ?? 0) > 0 && (e.name ?? '').trim());
  const n = rows.length;
  const count = `${n} exercise${n === 1 ? '' : 's'}`;
  if (session.type === 'cardio') {
    const main = rows.find((e) => (e.primaryMuscleGroup ?? '').toLowerCase() === 'cardio') ?? rows[0];
    if (!main) return 'Cardio';
    const rest = n - 1;
    return `${shortPrescription(main)} ${leadLiftName(main.name).toLowerCase()}${rest > 0 ? ` · ${rest} core move${rest === 1 ? '' : 's'}` : ''}`;
  }
  if (session.type === 'recovery') {
    return rows.length ? `${count} · easy` : 'Mobility and easy movement';
  }
  const lead = rows[0];
  if (!lead) return count;
  return `${leadLiftName(lead.name)} ${shortPrescription(lead)} leads · ${count}`;
}

/** Minutes for a card: "45 min" for a fixed slot, "30–45 min" for a window. */
export function minutesLabel(session: Pick<SessionDraft, 'durationMin' | 'durationMax'>): string {
  return session.durationMin === session.durationMax
    ? `${session.durationMin} min`
    : `${session.durationMin}–${session.durationMax} min`;
}

const SPLIT_LABEL: Record<string, string> = {
  full_body: 'Full body',
  'full body': 'Full body',
  upper_lower: 'Upper/Lower',
  'upper-lower': 'Upper/Lower',
  ppl: 'Push/Pull/Legs',
  body_part: 'Body part',
  'body part': 'Body part',
  custom: 'Custom split',
};

/**
 * The plan stated back in one line, from what was actually built (the
 * draft), not from the form: "4 weeks · Upper/Lower · 4 days · 30–45 min".
 */
export function statedPlanLine(draft: PlanDraft, planInputs: PlanInputs | undefined): string {
  const weeks = draft.weeks.length;
  const splitId = (draft.debugMeta?.effectiveSplitId ?? '').toLowerCase();
  const split = SPLIT_LABEL[splitId] ?? (splitId ? splitId.replace(/_/g, ' ') : null);
  const firstWeek = draft.weeks[0];
  const trainingDays = firstWeek ? firstWeek.days.filter((d) => d.session).length : (planInputs?.daysPerWeek ?? 0);
  const minutes = planInputs
    ? minutesLabel({ durationMin: planInputs.durationMin, durationMax: planInputs.durationMax })
    : null;
  return [
    `${weeks} week${weeks === 1 ? '' : 's'}`,
    split,
    `${trainingDays} day${trainingDays === 1 ? '' : 's'}`,
    minutes,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The phase of each week ('foundation' | 'progression' | 'peak' | 'deload' | 'maintain'), from the same table the request used. */
export function weekPhases(draft: PlanDraft, planInputs: PlanInputs | undefined): Record<number, string> {
  if (!planInputs) return {};
  const indices = draft.weeks.map((w) => w.weekIndex);
  const out: Record<number, string> = {};
  for (const p of weekProgressionForGenerateSessions(planInputs, indices)) out[p.weekIndex] = p.phase;
  return out;
}

/** Weekdays in order, so a rest row can sit between training days. */
export function orderedWeekdays(): Weekday[] {
  return [...WEEKDAYS];
}

/** One-line progression rule for a day's footer, by the plan's progression style. */
export function progressionLine(planInputs: PlanInputs | undefined): string {
  switch (planInputs?.progressionStyle) {
    case 'build_deload':
      return 'Progression: build for a few weeks, then a lighter deload week before ramping again.';
    case 'maintain':
      return 'Progression: hold the loads steady and make every rep cleaner.';
    default:
      return 'Progression: add weight or reps when you hit the top of each rep range on all sets.';
  }
}
