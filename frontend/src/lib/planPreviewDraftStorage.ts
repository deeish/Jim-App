import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PlanDraft } from '../types/plan';
import type { RootStackParamList } from '../types/navigation';

const STORAGE_KEY = 'jim_plan_preview_draft_v1';

/**
 * Generated previews stay resumable this long; older drafts are dropped on
 * load. Generous on purpose: a generation costs an AI rate-limit slot, and a
 * day-old draft is still worth applying (it anchors to its start week).
 */
export const PLAN_PREVIEW_DRAFT_MAX_AGE_MS = 48 * 60 * 60 * 1000;

/** PlanPreview route params needed to reopen the preview exactly as generated. */
export type PlanPreviewResumeParams = Omit<RootStackParamList['PlanPreview'], 'returnToPlanCard'>;

export type PersistedPlanPreviewDraft = {
  version: 1;
  savedAtIso: string;
  /** Matches `params.draftId`; PlanPreview hydrates from storage only for this id. */
  draftId: string;
  params: PlanPreviewResumeParams;
  planDraft: PlanDraft;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * Best-effort backup of the generated preview (route params + pipeline draft).
 * The preview otherwise lives only in navigation state, so killing the app
 * during preview lost the generation and burned a rate-limit slot.
 */
export async function savePlanPreviewDraft(
  payload: Omit<PersistedPlanPreviewDraft, 'version' | 'savedAtIso'>,
): Promise<void> {
  try {
    const full: PersistedPlanPreviewDraft = {
      version: 1,
      savedAtIso: new Date().toISOString(),
      ...payload,
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(full));
  } catch {
    /* losing the backup only means regenerating */
  }
}

/** Load the saved preview draft; stale or malformed entries are cleared and return null. */
export async function loadPlanPreviewDraft(
  now: Date = new Date(),
): Promise<PersistedPlanPreviewDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.version !== 1) return null;
    if (typeof parsed.draftId !== 'string' || !parsed.draftId) return null;
    if (typeof parsed.savedAtIso !== 'string') return null;
    if (!isRecord(parsed.params) || !isRecord(parsed.params.planInputs)) return null;
    if (!isRecord(parsed.planDraft) || !Array.isArray(parsed.planDraft.weeks)) return null;
    const savedAtMs = new Date(parsed.savedAtIso).getTime();
    if (!Number.isFinite(savedAtMs) || now.getTime() - savedAtMs > PLAN_PREVIEW_DRAFT_MAX_AGE_MS) {
      await clearPlanPreviewDraft();
      return null;
    }
    return parsed as unknown as PersistedPlanPreviewDraft;
  } catch {
    return null;
  }
}

export async function clearPlanPreviewDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
