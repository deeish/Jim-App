import {
  REST_OVERSHOOT_GRACE_MS,
  clearRest,
  getRestTimer,
  isRestOver,
  makeRestTimer,
  remainingSeconds,
  resetRestTimerForTests,
  shouldSignalRestOver,
  startRest,
  subscribeRestTimer,
  type RestTimer,
} from './restTimer';

const T0 = 1_700_000_000_000;

afterEach(() => {
  resetRestTimerForTests();
});

describe('makeRestTimer', () => {
  it('stores the end instant, not a countdown', () => {
    expect(makeRestTimer(150, T0)).toEqual({
      endsAtMs: T0 + 150_000,
      totalSeconds: 150,
    });
  });

  it('is null for the durations that mean "no rest prescribed"', () => {
    expect(makeRestTimer(0, T0)).toBeNull();
    expect(makeRestTimer(-5, T0)).toBeNull();
    expect(makeRestTimer(Number.NaN, T0)).toBeNull();
  });
});

describe('remainingSeconds', () => {
  const timer = makeRestTimer(150, T0)!;

  it('counts down against the wall clock', () => {
    expect(remainingSeconds(timer, T0)).toBe(150);
    expect(remainingSeconds(timer, T0 + 30_000)).toBe(120);
    expect(remainingSeconds(timer, T0 + 149_000)).toBe(1);
  });

  it('rounds part-seconds UP, so it never shows 0 while time is left', () => {
    expect(remainingSeconds(timer, T0 + 149_500)).toBe(1);
    expect(remainingSeconds(timer, T0 + 149_999)).toBe(1);
    expect(remainingSeconds(timer, T0 + 150_000)).toBe(0);
  });

  it('never goes negative, however long the app was asleep', () => {
    // The whole point of the wall clock: the phone was locked for ten minutes.
    expect(remainingSeconds(timer, T0 + 600_000)).toBe(0);
  });

  it('is 0 with no timer', () => {
    expect(remainingSeconds(null, T0)).toBe(0);
  });
});

describe('isRestOver', () => {
  const timer = makeRestTimer(60, T0)!;

  it('flips exactly at the end instant', () => {
    expect(isRestOver(timer, T0 + 59_999)).toBe(false);
    expect(isRestOver(timer, T0 + 60_000)).toBe(true);
  });

  it('treats "no timer" as over', () => {
    expect(isRestOver(null, T0)).toBe(true);
  });
});

describe('shouldSignalRestOver', () => {
  const timer: RestTimer = makeRestTimer(60, T0)!;

  it('fires the moment the rest ends with the app in front of you', () => {
    expect(shouldSignalRestOver(timer, T0 + 60_000, true)).toBe(true);
    expect(shouldSignalRestOver(timer, T0 + 60_000 + REST_OVERSHOOT_GRACE_MS, true)).toBe(true);
  });

  it('does NOT fire before the rest is up', () => {
    expect(shouldSignalRestOver(timer, T0 + 59_000, true)).toBe(false);
  });

  it('does NOT fire late — a buzz for something a minute gone is noise', () => {
    // This is the returning-from-a-locked-screen case: the wall clock says the
    // rest ended long ago, so we clear it silently instead of buzzing.
    expect(shouldSignalRestOver(timer, T0 + 120_000, true)).toBe(false);
  });

  it('does NOT fire while the app is backgrounded', () => {
    expect(shouldSignalRestOver(timer, T0 + 60_000, false)).toBe(false);
  });

  it('does NOT fire with no timer', () => {
    expect(shouldSignalRestOver(null, T0, true)).toBe(false);
  });
});

describe('the live timer singleton', () => {
  it('holds one timer and notifies subscribers on every change', () => {
    const seen: (RestTimer | null)[] = [];
    const unsubscribe = subscribeRestTimer(() => seen.push(getRestTimer()));

    startRest(90, T0);
    expect(getRestTimer()).toEqual({ endsAtMs: T0 + 90_000, totalSeconds: 90 });

    clearRest();
    expect(getRestTimer()).toBeNull();

    expect(seen).toEqual([{ endsAtMs: T0 + 90_000, totalSeconds: 90 }, null]);
    unsubscribe();
  });

  it('returns a reference-stable snapshot between changes', () => {
    // useSyncExternalStore re-renders forever if getSnapshot allocates.
    startRest(60, T0);
    expect(getRestTimer()).toBe(getRestTimer());
  });

  it('starting with no prescribed rest clears instead of starting', () => {
    startRest(60, T0);
    startRest(0, T0);
    expect(getRestTimer()).toBeNull();
  });

  it('clearing an already-clear timer notifies nobody', () => {
    let calls = 0;
    const unsubscribe = subscribeRestTimer(() => {
      calls++;
    });
    clearRest();
    expect(calls).toBe(0);
    unsubscribe();
  });

  it('stops notifying after unsubscribe', () => {
    let calls = 0;
    const unsubscribe = subscribeRestTimer(() => {
      calls++;
    });
    unsubscribe();
    startRest(60, T0);
    expect(calls).toBe(0);
  });
});
