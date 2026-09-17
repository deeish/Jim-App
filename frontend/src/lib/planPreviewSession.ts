import type { PlanDraft, PlanInputs } from '../types/plan';
import type { RootStackParamList } from '../types/navigation';
import type { RecordedSwap } from './planPipeline';

/**
 * The plan preview's working state, shared between the preview list screen
 * and the pushed day screen (2026-09-17 preview redesign).
 *
 * The preview used to open a day as a modal, so everything lived in one
 * component. A pushed day screen needs the same draft, and its edits (swap a
 * lift, rebuild the day) have to land back on the list. This is that seam:
 * one in-memory record, one subscribe. The list screen publishes what it
 * holds; the day screen commits what it changed; both subscribe.
 */

export type PreviewRouteInputs = RootStackParamList['PlanPreview']['inputs'];

export type PreviewSession = {
  draftId: string;
  planDraft: PlanDraft | null;
  planInputs: PlanInputs | undefined;
  inputs: PreviewRouteInputs | null;
  recordedSwaps: RecordedSwap[];
  /** `day-<week>-<weekday>`, `week-<n>`, `cardio`, or null. */
  regenerating: string | null;
};

const EMPTY: PreviewSession = {
  draftId: '',
  planDraft: null,
  planInputs: undefined,
  inputs: null,
  recordedSwaps: [],
  regenerating: null,
};

let state: PreviewSession = EMPTY;
const listeners = new Set<(s: PreviewSession) => void>();

export function getPreviewSession(): PreviewSession {
  return state;
}

/** Merge and notify. Callers that only echo unchanged references cause no work in subscribers that compare by reference. */
export function setPreviewSession(patch: Partial<PreviewSession>): PreviewSession {
  state = { ...state, ...patch };
  for (const l of listeners) l(state);
  return state;
}

export function subscribePreviewSession(fn: (s: PreviewSession) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function resetPreviewSession(): void {
  state = EMPTY;
  for (const l of listeners) l(state);
}
