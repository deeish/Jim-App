import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PlanDraft } from '../types/plan';
import {
  PLAN_PREVIEW_DRAFT_MAX_AGE_MS,
  clearPlanPreviewDraft,
  loadPlanPreviewDraft,
  savePlanPreviewDraft,
  type PersistedPlanPreviewDraft,
} from './planPreviewDraftStorage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const STORAGE_KEY = 'jim_plan_preview_draft_v1';

const planDraft = {
  draftId: 'draft-123',
  inputsSnapshot: { goal: 'strength' },
  weeks: [{ weekIndex: 1, days: [] }],
  metrics: { sessionsPerWeek: 3, strengthCount: 3, cardioCount: 0, hardDaysCount: 2 },
} as unknown as PlanDraft;

const payload: Omit<PersistedPlanPreviewDraft, 'version' | 'savedAtIso'> = {
  draftId: 'draft-123',
  params: {
    planInputs: { goal: 'strength', weeksCount: 1, daysPerWeek: 3 },
    inputs: { goal: 'strength' },
    draftId: 'draft-123',
  } as unknown as PersistedPlanPreviewDraft['params'],
  planDraft,
};

describe('planPreviewDraftStorage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('round-trips a saved draft', async () => {
    await savePlanPreviewDraft(payload);
    const loaded = await loadPlanPreviewDraft();
    expect(loaded).not.toBeNull();
    expect(loaded?.draftId).toBe('draft-123');
    expect(loaded?.planDraft.weeks).toHaveLength(1);
    expect(loaded?.params.draftId).toBe('draft-123');
  });

  it('returns null when nothing is saved', async () => {
    expect(await loadPlanPreviewDraft()).toBeNull();
  });

  it('drops drafts older than the max age (and clears them)', async () => {
    await savePlanPreviewDraft(payload);
    const saved = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? '{}') as {
      savedAtIso: string;
    };
    const savedAt = new Date(saved.savedAtIso).getTime();
    const justFresh = new Date(savedAt + PLAN_PREVIEW_DRAFT_MAX_AGE_MS - 1000);
    const stale = new Date(savedAt + PLAN_PREVIEW_DRAFT_MAX_AGE_MS + 1000);

    expect(await loadPlanPreviewDraft(justFresh)).not.toBeNull();
    expect(await loadPlanPreviewDraft(stale)).toBeNull();
    // Stale load cleared the entry, so even a fresh clock finds nothing.
    expect(await loadPlanPreviewDraft(justFresh)).toBeNull();
  });

  it('rejects malformed or wrong-version payloads', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'not json');
    expect(await loadPlanPreviewDraft()).toBeNull();

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, draftId: 'x' }));
    expect(await loadPlanPreviewDraft()).toBeNull();

    // planDraft.weeks missing → unusable for hydration.
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        savedAtIso: new Date().toISOString(),
        draftId: 'draft-1',
        params: { planInputs: {} },
        planDraft: {},
      }),
    );
    expect(await loadPlanPreviewDraft()).toBeNull();
  });

  it('clearPlanPreviewDraft removes the entry', async () => {
    await savePlanPreviewDraft(payload);
    await clearPlanPreviewDraft();
    expect(await loadPlanPreviewDraft()).toBeNull();
  });
});
