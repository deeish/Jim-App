import type { Exercise } from '../services/exerciseService';
import type { ExerciseSwapTarget } from '../types/navigation';
import {
  plannedDayForDate,
  plannedExerciseFromCatalog,
  replaceExercise as replaceCalendarExercise,
  weekExerciseContext,
} from './planCalendarPrototypeStore';
import { getPreviewSession, setPreviewSession } from './planPreviewSession';
import { applyChosenSwapToDraft, findSession } from './planPreviewEdits';

/**
 * "Use instead" from the exercise page (2026-09-18). The page can be opened
 * from a calendar workout row or a preview day row; the opener passes a
 * `swapTarget` naming that slot, and the page's similar-exercise list can
 * then put one of its rows into the slot without a trip back through the
 * picker. Two stores, one seam: the calendar store (a live plan) and the
 * preview session (a draft before it is saved).
 */

export type SwapOutgoing = {
  /** Catalog id when the slot's row is a library exercise. */
  id?: string;
  name: string;
  /** The rest of the day, for the ranker's "not already in the day" rule. */
  dayIds: string[];
  dayNames: string[];
  /** The rest of the week, so Thursday is not handed Monday's lift. */
  weekIds: string[];
  weekNames: string[];
};

/** What sits in the slot right now, or null when the slot is gone. */
export function outgoingForSwapTarget(target: ExerciseSwapTarget): SwapOutgoing | null {
  if (target.kind === 'calendar') {
    const day = plannedDayForDate(target.dateIso);
    const row = day.exercises[target.exerciseIndex];
    if (!row) return null;
    const week = weekExerciseContext(target.dateIso);
    return {
      id: row.exerciseId ?? undefined,
      name: row.name,
      dayIds: day.exercises.map((e) => e.exerciseId).filter((id): id is string => !!id),
      dayNames: day.exercises.map((e) => e.name),
      weekIds: week.ids,
      weekNames: week.names,
    };
  }
  const draft = getPreviewSession().planDraft;
  const session = findSession(draft, target.weekIndex, target.weekday);
  const row = session?.exercises.find((e) => e.name === target.exerciseName);
  if (!draft || !session || !row) return null;
  const weekIds = new Set<string>();
  const weekNames = new Set<string>();
  for (const d of draft.weeks.find((w) => w.weekIndex === target.weekIndex)?.days ?? []) {
    if (d.weekday === target.weekday || !d.session) continue;
    for (const e of d.session.exercises) {
      if (e.exerciseId) weekIds.add(e.exerciseId);
      weekNames.add(e.name);
    }
  }
  return {
    id: row.exerciseId ?? undefined,
    name: row.name,
    dayIds: session.exercises.map((e) => e.exerciseId).filter((id): id is string => !!id),
    dayNames: session.exercises.map((e) => e.name),
    weekIds: [...weekIds],
    weekNames: [...weekNames],
  };
}

/**
 * Puts `chosen` into the slot. Calendar: the store's replace (persists, clears
 * any sets logged against the old row). Preview: every week of the draft, the
 * same as the swap sheet's "Every week", recorded so a rebuild keeps it.
 * False when the slot no longer exists.
 */
export function applySwapTarget(target: ExerciseSwapTarget, chosen: Exercise): boolean {
  if (target.kind === 'calendar') {
    const day = plannedDayForDate(target.dateIso);
    const outgoing = day.exercises[target.exerciseIndex];
    if (!outgoing) return false;
    replaceCalendarExercise(target.dateIso, target.exerciseIndex, plannedExerciseFromCatalog(chosen, outgoing));
    return true;
  }
  const s = getPreviewSession();
  if (!s.planDraft) return false;
  const out = applyChosenSwapToDraft({
    draft: s.planDraft,
    weekIndex: target.weekIndex,
    weekday: target.weekday,
    exerciseName: target.exerciseName,
    chosen,
    scope: 'all',
  });
  if (!out) return false;
  setPreviewSession({ planDraft: out.draft, recordedSwaps: [...s.recordedSwaps, out.swap] });
  return true;
}
