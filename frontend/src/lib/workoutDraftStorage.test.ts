import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Workout } from '../types/workout';
import {
  clearWorkoutDraft,
  loadWorkoutDraft,
  resumedSessionStartTime,
  saveWorkoutDraft,
  type PersistedWorkoutDraft,
} from './workoutDraftStorage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const HOUR_MS = 60 * 60 * 1000;

const workout = { id: 'w-1', name: 'Upper A', exercises: [] } as unknown as Workout;

const payload: Omit<PersistedWorkoutDraft, 'version' | 'savedAtIso'> = {
  workout,
  startTimeIso: '2026-08-05T18:00:00.000Z',
  currentExerciseIndex: 0,
  exerciseSessions: [],
  exerciseNotes: {},
  overallNotes: '',
  expandedExerciseIndex: null,
  focusedSetIndex: null,
  showAdvancedLogging: false,
};

const USER_A = 'user-a';
const USER_B = 'user-b';
const KEY_A = `jim_workout_draft_v1:${USER_A}`;
const LEGACY_KEY = 'jim_workout_draft_v1';

describe('workoutDraftStorage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('stamps savedAtIso on write and round-trips it', async () => {
    await saveWorkoutDraft(USER_A, payload);
    const loaded = await loadWorkoutDraft(USER_A);
    expect(loaded).not.toBeNull();
    expect(typeof loaded?.savedAtIso).toBe('string');
    expect(Number.isFinite(Date.parse(loaded!.savedAtIso!))).toBe(true);
  });

  it('still loads drafts that predate savedAtIso', async () => {
    await saveWorkoutDraft(USER_A, payload);
    const raw = JSON.parse((await AsyncStorage.getItem(KEY_A)) ?? '{}') as Record<string, unknown>;
    delete raw.savedAtIso;
    await AsyncStorage.setItem(KEY_A, JSON.stringify(raw));
    const loaded = await loadWorkoutDraft(USER_A);
    expect(loaded).not.toBeNull();
    expect(loaded?.savedAtIso).toBeUndefined();
  });

  it("never serves one account's draft to another", async () => {
    await saveWorkoutDraft(USER_A, payload);
    expect(await loadWorkoutDraft(USER_B)).toBeNull();
    expect(await loadWorkoutDraft(USER_A)).not.toBeNull();
  });

  it('discards drafts left under the old shared key instead of resuming them', async () => {
    // A pre-fix draft has no owner on record; resuming it into whoever signs
    // in next is exactly the leak, so it is deleted on sight.
    await AsyncStorage.setItem(LEGACY_KEY, JSON.stringify({ version: 1, ...payload }));
    expect(await loadWorkoutDraft(USER_A)).toBeNull();
    expect(await AsyncStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('is inert without a signed-in user', async () => {
    await saveWorkoutDraft(undefined, payload);
    expect(await loadWorkoutDraft(undefined)).toBeNull();
    await expect(clearWorkoutDraft(undefined)).resolves.toBeUndefined();
  });

  it('clears only the given account', async () => {
    await saveWorkoutDraft(USER_A, payload);
    await saveWorkoutDraft(USER_B, payload);
    await clearWorkoutDraft(USER_B);
    expect(await loadWorkoutDraft(USER_B)).toBeNull();
    expect(await loadWorkoutDraft(USER_A)).not.toBeNull();
  });
});

describe('resumedSessionStartTime', () => {
  const startIso = '2026-08-05T18:00:00.000Z';
  const startMs = Date.parse(startIso);

  it('resuming a day later carries only the active time, not the idle night', () => {
    // 40 active minutes before the last save, resumed ~14 hours later: the
    // old behavior restored the original start and booked a ~14-hour workout.
    const savedIso = new Date(startMs + 40 * 60 * 1000).toISOString();
    const nowMs = startMs + 14 * HOUR_MS;
    const resumed = resumedSessionStartTime(
      { startTimeIso: startIso, savedAtIso: savedIso },
      nowMs,
    );
    expect(nowMs - resumed.getTime()).toBe(40 * 60 * 1000);
  });

  it('a legacy draft without savedAtIso resumes with zero accrued time', () => {
    const nowMs = startMs + 14 * HOUR_MS;
    const resumed = resumedSessionStartTime({ startTimeIso: startIso }, nowMs);
    expect(resumed.getTime()).toBe(nowMs);
  });

  it('never accrues negative time from a save stamped before the start', () => {
    const savedIso = new Date(startMs - 5 * 60 * 1000).toISOString();
    const nowMs = startMs + HOUR_MS;
    const resumed = resumedSessionStartTime(
      { startTimeIso: startIso, savedAtIso: savedIso },
      nowMs,
    );
    expect(resumed.getTime()).toBe(nowMs);
  });

  it('treats garbled timestamps as zero accrued time', () => {
    const nowMs = startMs + HOUR_MS;
    expect(
      resumedSessionStartTime(
        { startTimeIso: 'not-a-date', savedAtIso: '2026-08-05T19:00:00.000Z' },
        nowMs,
      ).getTime(),
    ).toBe(nowMs);
  });
});
