/**
 * Simulations of the tester's report (2026-09-09): "workouts I added stop
 * sticking and disappear after a while, sometimes within hours".
 *
 * Each test drives the REAL calendar store through a fake server and a fake
 * AsyncStorage, then simulates the thing that actually happens to a phone a
 * couple of hours later — iOS evicts the app and the user opens it cold
 * (`jest.resetModules()` + re-require, with the fake AsyncStorage kept) — and
 * asks what the user would see.
 *
 * History: on 2026-09-09 twelve of these scenarios were written as
 * `it.failing` against the store as it was (docs/worklog.md, that day's
 * block, findings 1–5 and 8) and verified to fail on the user-facing
 * assertion; the fix that followed flipped them to plain `it`. Keep the
 * convention: a NEW loss scenario that is not fixed yet goes in as
 * `it.failing` — Jest passes it while it throws and fails it the day it
 * starts passing, which is the cue to flip it. Never delete one to make the
 * suite green.
 */

jest.mock('react-native', () => ({
  Platform: { OS: 'test', select: (o: { default?: unknown }) => o.default ?? {} },
}));
jest.mock('expo-haptics', () => ({}));

// A device's storage: lives on globalThis so it survives jest.resetModules()
// (a simulated cold start) but is wiped between tests.
jest.mock('@react-native-async-storage/async-storage', () => {
  const g = globalThis as { __jimDisk?: Map<string, string> };
  g.__jimDisk = g.__jimDisk ?? new Map<string, string>();
  return {
    getItem: async (k: string) => g.__jimDisk!.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      g.__jimDisk!.set(k, v);
    },
    removeItem: async (k: string) => {
      g.__jimDisk!.delete(k);
    },
  };
});

// Every network call the store can make delegates, AT CALL TIME, to the fake
// server on globalThis — so a module reset never detaches the spies.
type AnyFn = (...args: never[]) => unknown;
function delegate(name: string): AnyFn {
  return (...args: never[]) =>
    (globalThis as unknown as { __jimServer: Record<string, AnyFn> }).__jimServer[name](...args);
}
jest.mock('../services/planService', () => ({
  addPlanSlot: delegate('addPlanSlot'),
  addPlanSlotToCurrent: delegate('addPlanSlotToCurrent'),
  createPlan: delegate('createPlan'),
  removePlanSlot: delegate('removePlanSlot'),
  replacePlanDay: delegate('replacePlanDay'),
  movePlanSlot: delegate('movePlanSlot'),
  getCurrentPlanWithWeekly: delegate('getCurrentPlanWithWeekly'),
  getCurrentPlan: delegate('getCurrentPlan'),
}));
jest.mock('../services/workoutService', () => ({
  createWorkout: delegate('createWorkout'),
  materializePlanSlotWorkout: delegate('materializePlanSlotWorkout'),
  saveWorkout: delegate('saveWorkout'),
  getWorkoutLogs: delegate('getWorkoutLogs'),
  getLastPerformance: delegate('getLastPerformance'),
  getPersonalBestRecords: delegate('getPersonalBestRecords'),
  getWorkoutStats: delegate('getWorkoutStats'),
}));
jest.mock('../services/exerciseService', () => ({
  getExerciseById: delegate('getExerciseById'),
}));
jest.mock('../api/client', () => ({
  api: {
    get: delegate('apiGet'),
    post: delegate('apiPost'),
    patch: delegate('apiPatch'),
    put: delegate('apiPut'),
    delete: delegate('apiDelete'),
  },
}));

import type {
  ApiPlan,
  ApiPlanExercise,
  ApiPlanWorkout,
  PlanSlot,
  PlanSlotExercise,
} from '../services/planService';
import type { QuickSession } from '../services/workoutService';
import type { PlannedExercise } from './planCalendarPrototype';
import {
  addDays,
  fromIso,
  mondayOf,
  todayIso,
  toIso,
  weekdayIndex,
  WEEKDAYS,
} from './planCalendarPrototype';
import { resolveHomeToday } from './homeToday';

type Store = typeof import('./planCalendarPrototypeStore');

// ---------------------------------------------------------------------------
// Dates: everything is relative to the real "today", the way the store is.
// ---------------------------------------------------------------------------

const THIS_MONDAY = mondayOf(new Date());
const MONDAY_ISO = toIso(THIS_MONDAY);
const WEDNESDAY_ISO = toIso(addDays(THIS_MONDAY, 2));
const THURSDAY_ISO = toIso(addDays(THIS_MONDAY, 3));
const NEXT_WEDNESDAY_ISO = toIso(addDays(THIS_MONDAY, 9));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function apiExercise(over: Partial<ApiPlanExercise> & { exerciseId: string; name: string }): ApiPlanExercise {
  return {
    id: `pe-${over.exerciseId}`,
    planWorkoutId: 'slot-1',
    sets: 3,
    reps: 8,
    repsMin: 8,
    repsMax: 12,
    weight: null,
    notes: null,
    orderIndex: 0,
    ...over,
  };
}

const BENCH = apiExercise({ exerciseId: 'flat-barbell-bench-press', name: 'Barbell Bench Press', orderIndex: 0 });
const ROW = apiExercise({ exerciseId: 'barbell-bent-over-row', name: 'Barbell Row', orderIndex: 1 });

function slot(over: Partial<ApiPlanWorkout> = {}): ApiPlanWorkout {
  return {
    id: 'slot-1',
    workoutPlanId: 'plan-1',
    weekNumber: 1,
    dayOfWeek: 'Monday',
    title: 'Push',
    detailLine: null,
    type: 'strength',
    durationMinutes: 45,
    intensity: 'Medium',
    orderInDay: 0,
    exercises: [BENCH, ROW],
    ...over,
  };
}

function plan(over: Partial<ApiPlan> = {}): ApiPlan {
  return {
    id: 'plan-1',
    name: 'Strength · 3d/wk · 1 wk',
    userId: 'user-1',
    weekAnchorMonday: MONDAY_ISO,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    planWorkouts: [slot()],
    ...over,
  };
}

/** What "+ Add Exercise" hands the store after a catalog pick. */
const CABLE_FLY: PlannedExercise = {
  name: 'Cable Fly',
  exerciseId: 'cable-fly',
  muscle: 'Chest',
  sets: 3,
  reps: '8–12',
  weight: '—',
  rest: '2:00',
  equipment: 'Cable',
  note: '',
};

/** What the Quick Workout builder returns for a two-muscle pick. */
const QUICK_PUSH: QuickSession = {
  title: 'Push Quick Session',
  type: 'strength',
  durationMinutes: 30,
  exercises: [
    { exerciseId: 'push-up', name: 'Push-Up', muscle: 'Chest', sets: 2, reps: 10, repsMin: 8, repsMax: 12, orderIndex: 0 },
    { exerciseId: 'lateral-raise', name: 'Lateral Raise', muscle: 'Shoulders', sets: 2, reps: 12, repsMin: 10, repsMax: 15, orderIndex: 1 },
  ],
};

// ---------------------------------------------------------------------------
// The fake server: a plan that add/remove-slot mutate the way the API does.
// ---------------------------------------------------------------------------

type FakeServer = {
  plan: ApiPlan | null;
  addPlanSlot: jest.Mock;
  addPlanSlotToCurrent: jest.Mock;
  createPlan: jest.Mock;
  removePlanSlot: jest.Mock;
  replacePlanDay: jest.Mock;
  movePlanSlot: jest.Mock;
  getCurrentPlanWithWeekly: jest.Mock;
  getCurrentPlan: jest.Mock;
  createWorkout: jest.Mock;
  materializePlanSlotWorkout: jest.Mock;
  saveWorkout: jest.Mock;
  getWorkoutLogs: jest.Mock;
  getLastPerformance: jest.Mock;
  getPersonalBestRecords: jest.Mock;
  getWorkoutStats: jest.Mock;
  getExerciseById: jest.Mock;
  apiGet: jest.Mock;
  apiPost: jest.Mock;
  apiPatch: jest.Mock;
  apiPut: jest.Mock;
  apiDelete: jest.Mock;
};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function makeServer(initialPlan: ApiPlan | null): FakeServer {
  let nextSlot = 100;
  const server: FakeServer = {
    plan: initialPlan ? clone(initialPlan) : null,
    addPlanSlot: jest.fn(async (_planId: string, s: PlanSlot) => appendSlot(s)),
    addPlanSlotToCurrent: jest.fn(async (s: PlanSlot) => appendSlot(s)),
    createPlan: jest.fn(async (body: { name?: string; weekAnchorMonday?: string; slots: PlanSlot[] }) => {
      server.plan = plan({
        id: 'plan-on-demand',
        name: body.name ?? 'My Plan',
        weekAnchorMonday: body.weekAnchorMonday ?? MONDAY_ISO,
        planWorkouts: [],
      });
      for (const s of body.slots) appendSlot(s);
      return clone(server.plan);
    }),
    removePlanSlot: jest.fn(async (_planId: string, slotId: string) => {
      if (!server.plan) throw new Error('404');
      if (!server.plan.planWorkouts.some((pw) => pw.id === slotId)) throw new Error('404 slot');
      server.plan.planWorkouts = server.plan.planWorkouts.filter((pw) => pw.id !== slotId);
      return clone(server.plan);
    }),
    // POST /plans/:id/days/replace — one transaction: the day's slots go,
    // the new one (if any) arrives. Repeating it lands the same day.
    replacePlanDay: jest.fn(
      async (
        _planId: string,
        body: { weekNumber: number; dayOfWeek: string; slot: PlanSlot | null },
      ) => {
        if (!server.plan) throw new Error('404');
        server.plan.planWorkouts = server.plan.planWorkouts.filter(
          (pw) => !(pw.weekNumber === body.weekNumber && pw.dayOfWeek === body.dayOfWeek),
        );
        if (body.slot) {
          appendSlot({ ...body.slot, weekNumber: body.weekNumber, dayOfWeek: body.dayOfWeek });
        }
        return clone(server.plan);
      },
    ),
    movePlanSlot: jest.fn(async () => clone(server.plan)),
    getCurrentPlanWithWeekly: jest.fn(async () => ({
      plan: server.plan ? clone(server.plan) : null,
      weeklyWorkouts: [],
    })),
    getCurrentPlan: jest.fn(async () => (server.plan ? clone(server.plan) : null)),
    createWorkout: jest.fn(async (w: { name: string }) => ({ id: 'workout-adhoc', name: w.name, exercises: [] })),
    materializePlanSlotWorkout: jest.fn(async (id: string) => ({ id: `workout-${id}`, planWorkoutId: id, exercises: [] })),
    saveWorkout: jest.fn(async () => undefined),
    getWorkoutLogs: jest.fn(async () => []),
    getLastPerformance: jest.fn(async () => ({})),
    getPersonalBestRecords: jest.fn(async () => ({ byWeight: {}, byE1rm: {} })),
    getWorkoutStats: jest.fn(async () => ({ sessions: [] })),
    // Rejecting keeps the name heuristic in charge of colours — one less moving part.
    getExerciseById: jest.fn(async () => {
      throw new Error('catalog offline in this test');
    }),
    apiGet: jest.fn(async () => ({ data: { dates: [] } })),
    apiPost: jest.fn(async (url: string, body?: { entries?: Array<Record<string, unknown>> }) => ({
      data:
        url === '/workout-logs'
          ? {
              id: 'log-1',
              completedAt: new Date().toISOString(),
              // The server echoes the entries it stored, ids and all.
              entries: (body?.entries ?? []).map((e, i) => ({
                id: `entry-${i}`,
                exerciseId: (e.exerciseId as string | undefined) ?? 'manual',
                name: e.name,
                orderIndex: e.orderIndex,
                notes: null,
                completedSets: e.sets,
              })),
            }
          : {},
    })),
    apiPatch: jest.fn(async (url: string, body?: { entries?: Array<Record<string, unknown>> }) => ({
      data: url.endsWith('/sets')
        ? {
            id: url.split('/')[2],
            entries: (body?.entries ?? []).map((e, i) => ({
              id: `entry-${i}`,
              exerciseId: (e.exerciseId as string | undefined) ?? 'manual',
              name: e.name,
              orderIndex: e.orderIndex,
              notes: null,
              completedSets: e.sets,
            })),
          }
        : {},
    })),
    apiPut: jest.fn(async () => ({ data: {} })),
    apiDelete: jest.fn(async () => ({ data: {} })),
  };

  function appendSlot(s: PlanSlot): ApiPlan {
    if (!server.plan) throw new Error('404 NO_CURRENT_PLAN');
    const id = `slot-${nextSlot++}`;
    const exercises: ApiPlanExercise[] = (s.exercises ?? []).map((e: PlanSlotExercise, i) => ({
      id: `${id}-pe-${i}`,
      planWorkoutId: id,
      exerciseId: e.exerciseId,
      name: e.name ?? null,
      sets: e.sets,
      reps: e.reps,
      repsMin: e.repsMin ?? null,
      repsMax: e.repsMax ?? null,
      durationSeconds: e.durationSeconds ?? null,
      prescriptionType: e.prescriptionType ?? null,
      weight: e.weight ?? null,
      notes: e.notes ?? null,
      orderIndex: e.orderIndex ?? i,
    }));
    server.plan.planWorkouts.push({
      id,
      workoutPlanId: server.plan.id,
      weekNumber: s.weekNumber,
      dayOfWeek: s.dayOfWeek,
      title: s.title,
      detailLine: s.detailLine ?? null,
      type: s.type,
      durationMinutes: s.durationMinutes,
      intensity: s.intensity ?? null,
      orderInDay: s.orderInDay ?? 0,
      exercises,
    });
    return clone(server.plan);
  }

  return server;
}

function installServer(initialPlan: ApiPlan | null): FakeServer {
  const server = makeServer(initialPlan);
  (globalThis as unknown as { __jimServer: FakeServer }).__jimServer = server;
  return server;
}

/** Slot titles + exercise names on one server day, for readable assertions. */
function serverDay(server: FakeServer, weekNumber: number, dayOfWeek: string): string[][] {
  return (server.plan?.planWorkouts ?? [])
    .filter((pw) => pw.weekNumber === weekNumber && pw.dayOfWeek === dayOfWeek)
    .sort((a, b) => a.orderInDay - b.orderInDay)
    .map((pw) => (pw.exercises ?? []).map((e) => e.name ?? '?'));
}

// ---------------------------------------------------------------------------
// The phone
// ---------------------------------------------------------------------------

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
async function flush(n = 12): Promise<void> {
  for (let i = 0; i < n; i++) await tick();
}
/** Wait out the store's 300ms snapshot debounce, then drain. */
async function settle(): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, 350));
  await flush();
}

/** Cold start: fresh module state, same disk, the signed-in account noted
 *  (Home does this on mount), plan fetched. */
async function coldStart(userId = 'user-1'): Promise<Store> {
  jest.resetModules();
  const store = require('./planCalendarPrototypeStore') as Store;
  store.noteCalendarAccount(userId);
  store.ensureLiveCalendarData();
  await flush(20);
  return store;
}

/** The app is evicted from memory, hours pass, the user opens it again. */
async function hoursLaterReopen(userId = 'user-1'): Promise<Store> {
  await settle();
  return coldStart(userId);
}

function names(store: Store, dateIso: string): string[] {
  return store.plannedDayForDate(dateIso).exercises.map((e) => e.name);
}

beforeEach(() => {
  (globalThis as { __jimDisk?: Map<string, string> }).__jimDisk?.clear();
  // The store reports a dropped write with console.warn; that is the very
  // thing several scenarios provoke, so keep it out of the test output.
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ===========================================================================
// Controls — the paths that work today
// ===========================================================================

describe('control: a healthy server, an in-program day', () => {
  it('an exercise added to a plan day is written into the plan and survives a restart', async () => {
    const server = installServer(plan());
    let store = await coldStart();
    expect(names(store, MONDAY_ISO)).toEqual(['Barbell Bench Press', 'Barbell Row']);

    store.addExercisesToDay(MONDAY_ISO, [CABLE_FLY]);
    await flush();

    // Rebuilt as one slot, in one request.
    expect(server.replacePlanDay).toHaveBeenCalledTimes(1);
    expect(server.replacePlanDay).toHaveBeenCalledWith(
      'plan-1',
      expect.objectContaining({ weekNumber: 1, dayOfWeek: 'Monday' }),
    );
    expect(server.addPlanSlot).not.toHaveBeenCalled();
    expect(server.removePlanSlot).not.toHaveBeenCalled();
    expect(serverDay(server, 1, 'Monday')).toEqual([
      ['Barbell Bench Press', 'Barbell Row', 'Cable Fly'],
    ]);

    store = await hoursLaterReopen();
    expect(names(store, MONDAY_ISO)).toEqual(['Barbell Bench Press', 'Barbell Row', 'Cable Fly']);
  });

  it('an exercise added to an in-program rest day creates a slot on that day and survives a restart', async () => {
    const server = installServer(plan());
    let store = await coldStart();
    expect(names(store, THURSDAY_ISO)).toEqual([]);

    store.addExercisesToDay(THURSDAY_ISO, [CABLE_FLY]);
    await flush();

    expect(serverDay(server, 1, 'Thursday')).toEqual([['Cable Fly']]);
    store = await hoursLaterReopen();
    expect(names(store, THURSDAY_ISO)).toEqual(['Cable Fly']);
  });

  it('Home reports a finished one-week plan as ended, never repeating it (the Calendar agrees — see finding 5)', () => {
    const twoWeeksAgo = toIso(addDays(THIS_MONDAY, -14));
    const finished = plan({ weekAnchorMonday: twoWeeksAgo });
    expect(resolveHomeToday(finished, []).status).toBe('plan_ended');
  });
});

// ===========================================================================
// Finding 1 — day edits live only in memory
// ===========================================================================

describe('finding 1: the edit is on screen but never made it to disk', () => {
  it('an added exercise survives a restart while the server write is still pending', async () => {
    const server = installServer(plan());
    // Slow backend (a cold Render instance): the write is still out when the
    // user leaves the app.
    server.replacePlanDay.mockImplementation(() => new Promise(() => {}));
    let store = await coldStart();

    store.addExercisesToDay(MONDAY_ISO, [CABLE_FLY]);
    await flush();
    expect(names(store, MONDAY_ISO)).toContain('Cable Fly'); // what the user saw

    store = await hoursLaterReopen();
    expect(names(store, MONDAY_ISO)).toContain('Cable Fly'); // what they expect to still see
  });

  it('an added exercise survives a restart after the server write failed', async () => {
    const server = installServer(plan());
    server.replacePlanDay.mockRejectedValueOnce(new Error('Network Error'));
    let store = await coldStart();

    store.addExercisesToDay(MONDAY_ISO, [CABLE_FLY]);
    await flush();
    expect(names(store, MONDAY_ISO)).toContain('Cable Fly');

    store = await hoursLaterReopen();
    expect(names(store, MONDAY_ISO)).toContain('Cable Fly');
  });

  it('a failed write is retried once the server is reachable again', async () => {
    const server = installServer(plan());
    server.replacePlanDay.mockRejectedValueOnce(new Error('Network Error'));
    let store = await coldStart();

    store.addExercisesToDay(MONDAY_ISO, [CABLE_FLY]);
    await flush();
    expect(serverDay(server, 1, 'Monday')).toEqual([['Barbell Bench Press', 'Barbell Row']]);

    store = await hoursLaterReopen();
    await flush(20);
    expect(serverDay(server, 1, 'Monday')).toEqual([
      ['Barbell Bench Press', 'Barbell Row', 'Cable Fly'],
    ]);
  });

  it('a replaced exercise survives a restart after the server write failed', async () => {
    const server = installServer(plan());
    server.replacePlanDay.mockRejectedValueOnce(new Error('Network Error'));
    let store = await coldStart();

    store.replaceExercise(MONDAY_ISO, 0, CABLE_FLY);
    await flush();
    expect(names(store, MONDAY_ISO)).toEqual(['Cable Fly', 'Barbell Row']);

    store = await hoursLaterReopen();
    expect(names(store, MONDAY_ISO)).toEqual(['Cable Fly', 'Barbell Row']);
  });
});

// ===========================================================================
// Finding 2 — no active plan: nothing is ever written
// ===========================================================================

describe('finding 2: a user with no active plan', () => {
  it('an exercise added to today survives a restart', async () => {
    installServer(null);
    let store = await coldStart();
    expect(store.calendarDataMode()).toBe('empty');

    store.addExercisesToDay(todayIso(), [CABLE_FLY]);
    await flush();
    expect(names(store, todayIso())).toEqual(['Cable Fly']);

    store = await hoursLaterReopen();
    expect(names(store, todayIso())).toEqual(['Cable Fly']);
  });

  it('a Quick Workout built for today survives a restart', async () => {
    installServer(null);
    let store = await coldStart();

    await store.addQuickSessionToday(QUICK_PUSH);
    await flush();
    expect(names(store, todayIso())).toEqual(['Push-Up', 'Lateral Raise']);

    store = await hoursLaterReopen();
    expect(names(store, todayIso())).toEqual(['Push-Up', 'Lateral Raise']);
  });

  it('completing a Quick Workout posts a workout log', async () => {
    const server = installServer(null);
    const store = await coldStart();
    const today = todayIso();

    await store.addQuickSessionToday(QUICK_PUSH);
    const day = store.plannedDayForDate(today);
    day.exercises.forEach((ex, i) => {
      for (let s = 0; s < ex.sets; s++) store.logSet(today, i, { reps: '10', weight: '' });
    });
    expect(store.isDayFullyLogged(today)).toBe(true);

    store.finishDaySession(today);
    await flush();

    const logPosts = server.apiPost.mock.calls.filter(([url]) => url === '/workout-logs');
    expect(logPosts).toHaveLength(1);
  });
});

// ===========================================================================
// Finding 3 — a day with two sessions never persists an edit again
// ===========================================================================

describe('finding 3: a day that holds two sessions', () => {
  const twoSessionMonday = () =>
    plan({
      planWorkouts: [
        slot(),
        slot({
          id: 'slot-2',
          title: 'Arms',
          orderInDay: 1,
          exercises: [
            apiExercise({ planWorkoutId: 'slot-2', exerciseId: 'barbell-curl', name: 'Barbell Curl', orderIndex: 0 }),
          ],
        }),
      ],
    });

  it('shows both sessions merged into one list (control)', async () => {
    installServer(twoSessionMonday());
    const store = await coldStart();
    expect(names(store, MONDAY_ISO)).toEqual(['Barbell Bench Press', 'Barbell Row', 'Barbell Curl']);
  });

  it('removing an exercise is written to the server', async () => {
    const server = installServer(twoSessionMonday());
    const store = await coldStart();

    store.removeExerciseFromDay(MONDAY_ISO, 0);
    await flush();
    expect(names(store, MONDAY_ISO)).toEqual(['Barbell Row', 'Barbell Curl']);

    expect(server.replacePlanDay).toHaveBeenCalledTimes(1);
  });

  it('a removed exercise stays removed after a restart', async () => {
    installServer(twoSessionMonday());
    let store = await coldStart();

    store.removeExerciseFromDay(MONDAY_ISO, 0);
    await flush();

    store = await hoursLaterReopen();
    expect(names(store, MONDAY_ISO)).not.toContain('Barbell Bench Press');
  });
});

// ===========================================================================
// Finding 4 — an edit made while the plan is being refetched is dropped
// ===========================================================================

describe('finding 4: an edit during a plan refetch', () => {
  it('still reaches the server once the refetch lands', async () => {
    const server = installServer(plan());
    const store = await coldStart();

    // The Week screen refetches on focus; make that fetch slow.
    let landFetch!: (v: { plan: ApiPlan | null; weeklyWorkouts: never[] }) => void;
    server.getCurrentPlanWithWeekly.mockImplementationOnce(
      () => new Promise((r) => { landFetch = r; }),
    );
    store.refreshLiveCalendarData(true);
    await flush();
    // The plan already on screen stays readable while the refetch is out.
    expect(store.calendarDataMode()).toBe('live');

    store.addExercisesToDay(MONDAY_ISO, [CABLE_FLY]);
    await flush();

    landFetch({ plan: clone(server.plan), weeklyWorkouts: [] });
    await flush(20);
    expect(store.calendarDataMode()).toBe('live');
    expect(names(store, MONDAY_ISO)).toContain('Cable Fly');
    expect(serverDay(server, 1, 'Monday')).toEqual([
      ['Barbell Bench Press', 'Barbell Row', 'Cable Fly'],
    ]);
  });
});

// ===========================================================================
// Finding 5 — a plan past its last week goes blank
// ===========================================================================

describe('finding 5: a one-week plan after its week has ended', () => {
  // Dylan's call (2026-09-09): an empty week is honest — travel, a break, a
  // plan not generated yet — so nothing repeats. What must NOT depend on the
  // plan's window is saving: anything added to such a week extends the plan.
  const twoWeeksAgo = () => toIso(addDays(THIS_MONDAY, -14));

  it('the week is empty and reported as past the plan, and Home says the same', async () => {
    installServer(plan({ weekAnchorMonday: twoWeeksAgo() }));
    const store = await coldStart();

    expect(store.calendarDataMode()).toBe('live');
    expect(names(store, MONDAY_ISO)).toEqual([]);
    expect(store.programWeekInfoFor(MONDAY_ISO)).toMatchObject({ state: 'after', totalWeeks: 1 });
    expect(resolveHomeToday(plan({ weekAnchorMonday: twoWeeksAgo() }), []).status).toBe('plan_ended');
  });

  it('an exercise added to that empty week still reaches the server, extending the plan', async () => {
    const server = installServer(plan({ weekAnchorMonday: twoWeeksAgo() }));
    let store = await coldStart();

    store.addExercisesToDay(MONDAY_ISO, [CABLE_FLY]);
    await flush();
    expect(serverDay(server, 3, 'Monday')).toEqual([['Cable Fly']]);
    expect(store.isDayEditPending(MONDAY_ISO)).toBe(false);
    expect(store.programWeekInfoFor(MONDAY_ISO)).toMatchObject({ state: 'in', week: 3, totalWeeks: 3 });

    store = await hoursLaterReopen();
    expect(names(store, MONDAY_ISO)).toEqual(['Cable Fly']);
  });

  it('a Quick Workout on a day past the plan is written as a slot on that day', async () => {
    const server = installServer(plan({ weekAnchorMonday: twoWeeksAgo() }));
    const store = await coldStart();
    const today = todayIso();

    await store.addQuickSessionToday(QUICK_PUSH);
    await flush(20);
    expect(serverDay(server, 3, WEEKDAYS[weekdayIndex(fromIso(today))])).toEqual([
      ['Push-Up', 'Lateral Raise'],
    ]);
    expect(names(store, today)).toEqual(['Push-Up', 'Lateral Raise']);
    expect(store.isDayEditPending(today)).toBe(false);
  });
});

// ===========================================================================
// Finding 8 — an edit before the plan starts lands on the wrong date
// ===========================================================================

describe('finding 8: adding to a day before the plan anchor', () => {
  it('the exercise stays on the day it was added to', async () => {
    const nextMonday = toIso(addDays(THIS_MONDAY, 7));
    const server = installServer(plan({ weekAnchorMonday: nextMonday }));
    const store = await coldStart();
    expect(store.programWeekInfoFor(MONDAY_ISO)?.state).toBe('before');

    store.addExercisesToDay(WEDNESDAY_ISO, [CABLE_FLY]);
    await flush();

    expect(names(store, WEDNESDAY_ISO)).toEqual(['Cable Fly']);
    expect(names(store, NEXT_WEDNESDAY_ISO)).toEqual([]);
    // No slot is created for a date the plan cannot hold; the exercise is
    // kept on the phone and is no longer owed to the server.
    expect(server.replacePlanDay).not.toHaveBeenCalled();
    expect(store.isDayEditPending(WEDNESDAY_ISO)).toBe(false);
  });

  it('and it is still there after a restart', async () => {
    const nextMonday = toIso(addDays(THIS_MONDAY, 7));
    installServer(plan({ weekAnchorMonday: nextMonday }));
    let store = await coldStart();
    store.addExercisesToDay(WEDNESDAY_ISO, [CABLE_FLY]);
    await flush();

    store = await hoursLaterReopen();
    expect(names(store, WEDNESDAY_ISO)).toEqual(['Cable Fly']);
    expect(WEEKDAYS[2]).toBe('Wednesday');
  });
});

// ===========================================================================
// The whole gym story: no signal, no plan yet, a session built and finished
// ===========================================================================

describe('at the gym with no signal and no plan yet', () => {
  it('the session and its log both reach the server once the app reconnects', async () => {
    const server = installServer(null);
    server.getCurrentPlanWithWeekly.mockRejectedValueOnce(new Error('Network Error'));
    let store = await coldStart();
    expect(store.calendarDataMode()).toBe('offline');
    const today = todayIso();
    const todayWeekday = WEEKDAYS[weekdayIndex(fromIso(today))];

    await store.addQuickSessionToday(QUICK_PUSH);
    expect(names(store, today)).toEqual(['Push-Up', 'Lateral Raise']);
    expect(store.isDayEditPending(today)).toBe(true);
    store.plannedDayForDate(today).exercises.forEach((ex, i) => {
      for (let s = 0; s < ex.sets; s++) store.logSet(today, i, { reps: '10', weight: '' });
    });
    store.finishDaySession(today);
    await flush();
    // Sealed on the phone, owed to the server.
    expect(store.isDayLogged(today)).toBe(true);
    expect(store.isDayCompletionPending(today)).toBe(true);
    expect(server.apiPost.mock.calls.filter(([url]) => url === '/workout-logs')).toHaveLength(0);

    // Opened again at home, on wifi.
    store = await hoursLaterReopen();
    await flush(20);
    expect(serverDay(server, 1, todayWeekday)).toEqual([['Push-Up', 'Lateral Raise']]);
    expect(server.apiPost.mock.calls.filter(([url]) => url === '/workout-logs')).toHaveLength(1);
    expect(store.isDayEditPending(today)).toBe(false);
    expect(store.isDayCompletionPending(today)).toBe(false);
    expect(names(store, today)).toEqual(['Push-Up', 'Lateral Raise']);
    expect(store.isDayLogged(today)).toBe(true);
  });
});

// ===========================================================================
// Writes that overlap
// ===========================================================================

/** Hold the next day write until `release()` — a slow backend. */
function holdNextAdd(server: FakeServer): () => void {
  const realWrite = server.replacePlanDay.getMockImplementation()!;
  let release!: () => void;
  server.replacePlanDay.mockImplementationOnce(
    (planId: string, body: unknown) =>
      new Promise((resolve) => {
        release = () => resolve(realWrite(planId, body));
      }),
  );
  return () => release();
}

describe('an edit made while the previous write is still out', () => {
  it('survives that write landing', async () => {
    const server = installServer(plan());
    const store = await coldStart();
    const release = holdNextAdd(server);

    store.addExercisesToDay(MONDAY_ISO, [CABLE_FLY]);
    await flush();
    // The write is out. Meanwhile the user removes Bench Press.
    store.removeExerciseFromDay(MONDAY_ISO, 0);
    expect(names(store, MONDAY_ISO)).toEqual(['Barbell Row', 'Cable Fly']);

    release();
    await flush(20);
    expect(names(store, MONDAY_ISO)).toEqual(['Barbell Row', 'Cable Fly']);
    expect(serverDay(server, 1, 'Monday')).toEqual([['Barbell Row', 'Cable Fly']]);
    expect(store.isDayEditPending(MONDAY_ISO)).toBe(false);
  });
});

describe('a plan refetch served before a write landed', () => {
  it('does not show the day as it was before the edit', async () => {
    const server = installServer(plan());
    const store = await coldStart();
    const release = holdNextAdd(server);
    store.addExercisesToDay(MONDAY_ISO, [CABLE_FLY]);
    await flush();

    // The Week screen focuses; its refetch is answered from BEFORE the write.
    const stale = { plan: clone(server.plan), weeklyWorkouts: [] as never[] };
    let land!: () => void;
    server.getCurrentPlanWithWeekly.mockImplementationOnce(
      () => new Promise((resolve) => { land = () => resolve(stale); }),
    );
    store.refreshLiveCalendarData(true);
    await flush();

    release();
    await flush(20);
    expect(serverDay(server, 1, 'Monday')).toEqual([
      ['Barbell Bench Press', 'Barbell Row', 'Cable Fly'],
    ]);
    land();
    await flush(20);
    expect(store.calendarDataMode()).toBe('live');
    expect(names(store, MONDAY_ISO)).toEqual(['Barbell Bench Press', 'Barbell Row', 'Cable Fly']);
  });
});

describe('the "kept on this phone" indicator', () => {
  it('is on after a failed write and off once the retry lands', async () => {
    const server = installServer(plan());
    server.replacePlanDay.mockRejectedValueOnce(new Error('Network Error'));
    let store = await coldStart();

    store.addExercisesToDay(MONDAY_ISO, [CABLE_FLY]);
    await flush();
    expect(store.isDayEditPending(MONDAY_ISO)).toBe(true);

    store = await hoursLaterReopen();
    await flush(20);
    expect(store.isDayEditPending(MONDAY_ISO)).toBe(false);
  });
});

// ===========================================================================
// Finding 7 — the day changed on the server since the last fetch
// ===========================================================================

describe('finding 7: another surface wrote to the day since the last fetch', () => {
  it('an exercise added elsewhere is kept when the calendar removes a different one', async () => {
    const server = installServer(plan());
    const store = await coldStart();
    // Workout detail's add-to-workout synced Cable Fly onto Monday's slot.
    server.plan!.planWorkouts[0].exercises!.push(
      apiExercise({ planWorkoutId: 'slot-1', exerciseId: 'cable-fly', name: 'Cable Fly', orderIndex: 2 }),
    );

    store.removeExerciseFromDay(MONDAY_ISO, 0); // Bench, as the calendar still shows it
    await flush(20);
    expect(serverDay(server, 1, 'Monday')).toEqual([['Barbell Row', 'Cable Fly']]);
    expect(names(store, MONDAY_ISO)).toEqual(['Barbell Row', 'Cable Fly']);
  });

  it('a removal targets the exercise, not the row, when rows shifted underneath', async () => {
    const server = installServer(plan());
    const store = await coldStart();
    // Elsewhere, Bench Press was already removed from the slot.
    server.plan!.planWorkouts[0].exercises = [{ ...ROW, orderIndex: 0 }];

    store.removeExerciseFromDay(MONDAY_ISO, 0); // still Bench in the calendar's view
    await flush(20);
    // Row must survive: the user never asked to remove it.
    expect(serverDay(server, 1, 'Monday')).toEqual([['Barbell Row']]);
    expect(names(store, MONDAY_ISO)).toEqual(['Barbell Row']);
  });

  it('a replacement follows the exercise it targeted', async () => {
    const server = installServer(plan());
    const store = await coldStart();
    // Elsewhere, an exercise was inserted BEFORE Row.
    server.plan!.planWorkouts[0].exercises = [
      { ...BENCH, orderIndex: 0 },
      apiExercise({ planWorkoutId: 'slot-1', exerciseId: 'incline-press', name: 'Incline Press', orderIndex: 1 }),
      { ...ROW, orderIndex: 2 },
    ];

    store.replaceExercise(MONDAY_ISO, 1, CABLE_FLY); // Row, as the calendar shows it at row 1
    await flush(20);
    expect(serverDay(server, 1, 'Monday')).toEqual([
      ['Barbell Bench Press', 'Incline Press', 'Cable Fly'],
    ]);
  });
});

// ===========================================================================
// Two accounts on one phone
// ===========================================================================

describe('a second account signing in on the same phone', () => {
  it('does not inherit the first account\'s pending edits, and nothing is written for it', async () => {
    const serverA = installServer(plan());
    serverA.replacePlanDay.mockRejectedValueOnce(new Error('Network Error'));
    let store = await coldStart('user-A');
    store.addExercisesToDay(MONDAY_ISO, [CABLE_FLY]);
    await flush();
    expect(store.isDayEditPending(MONDAY_ISO)).toBe(true);

    // User B, who has no plan at all, signs in on this phone. Without the
    // account check A's owed edit would be persisted as B's first plan.
    const serverB = installServer(null);
    store = await hoursLaterReopen('user-B');
    await flush(20);
    expect(names(store, MONDAY_ISO)).toEqual([]);
    expect(store.isDayEditPending(MONDAY_ISO)).toBe(false);
    expect(serverB.createPlan).not.toHaveBeenCalled();
    expect(serverB.replacePlanDay).not.toHaveBeenCalled();
  });

  it('the same account signing back in keeps what it is owed', async () => {
    const server = installServer(plan());
    server.replacePlanDay.mockRejectedValueOnce(new Error('Network Error'));
    let store = await coldStart('user-A');
    store.addExercisesToDay(MONDAY_ISO, [CABLE_FLY]);
    await flush();

    store = await hoursLaterReopen('user-A');
    await flush(20);
    expect(serverDay(server, 1, 'Monday')).toEqual([
      ['Barbell Bench Press', 'Barbell Row', 'Cable Fly'],
    ]);
  });
});

// ===========================================================================
// Quick Workout landing on a plan day
// ===========================================================================

describe('a Quick Workout on a day that already has a plan session', () => {
  const todayWeekday = () => WEEKDAYS[weekdayIndex(fromIso(todayIso()))];
  const planWithToday = () => plan({ planWorkouts: [slot({ dayOfWeek: todayWeekday() })] });
  const todaySlot = (server: FakeServer) =>
    (server.plan?.planWorkouts ?? []).filter(
      (pw) => pw.weekNumber === 1 && pw.dayOfWeek === todayWeekday(),
    );

  it('"add" keeps the plan session and writes the day as a two-a-day', async () => {
    const server = installServer(planWithToday());
    const store = await coldStart();
    const today = todayIso();

    await store.addQuickSessionToday(QUICK_PUSH, 'add');
    expect(names(store, today)).toEqual([
      'Barbell Bench Press', 'Barbell Row', 'Push-Up', 'Lateral Raise',
    ]);
    expect(store.plannedDayForDate(today).title).toBe('Push + Push Quick Session');

    await flush(20);
    expect(todaySlot(server).map((pw) => pw.title)).toEqual(['Push + Push Quick Session']);
    expect(serverDay(server, 1, todayWeekday())).toEqual([
      ['Barbell Bench Press', 'Barbell Row', 'Push-Up', 'Lateral Raise'],
    ]);
    expect(store.isDayEditPending(today)).toBe(false);
  });

  it('"replace" swaps the plan session for the new one', async () => {
    const server = installServer(planWithToday());
    const store = await coldStart();
    const today = todayIso();

    await store.addQuickSessionToday(QUICK_PUSH, 'replace');
    expect(names(store, today)).toEqual(['Push-Up', 'Lateral Raise']);
    expect(store.plannedDayForDate(today).title).toBe('Push Quick Session');

    await flush(20);
    expect(todaySlot(server).map((pw) => pw.title)).toEqual(['Push Quick Session']);
    expect(serverDay(server, 1, todayWeekday())).toEqual([['Push-Up', 'Lateral Raise']]);
    expect(server.replacePlanDay).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// Build-32 tester report (2026-09-15): a day shows its session twice — the
// same exercises, in the same order, listed again below the first set.
// ===========================================================================

describe('finding 9: the day write lands on the server but its response never reaches the phone', () => {
  // Before 2026-09-15 the rebuild was add-slot then remove-slot. This
  // scenario — the server applied the write, the phone saw a failure — left
  // the day holding both slots, and the retry read the doubled day back as
  // "the day" and wrote it into one slot for good: Bench, Row, Bench, Row,
  // Cable Fly, Cable Fly. With one atomic request the retry lands the same
  // day again.
  it('the retry does not double the day, on the server or on screen', async () => {
    const server = installServer(plan());
    const realWrite = server.replacePlanDay.getMockImplementation()!;
    server.replacePlanDay.mockImplementationOnce(async (planId: string, body: unknown) => {
      await realWrite(planId, body); // the server commits…
      throw new Error('Network Error'); // …and the phone never hears back
    });
    let store = await coldStart();

    store.addExercisesToDay(MONDAY_ISO, [CABLE_FLY]);
    await flush();
    expect(serverDay(server, 1, 'Monday')).toEqual([
      ['Barbell Bench Press', 'Barbell Row', 'Cable Fly'],
    ]);
    expect(store.isDayEditPending(MONDAY_ISO)).toBe(true);

    // The retry (cold start → plan fetch → drain owed dates).
    store = await hoursLaterReopen();
    await flush(20);
    expect(serverDay(server, 1, 'Monday')).toEqual([
      ['Barbell Bench Press', 'Barbell Row', 'Cable Fly'],
    ]);
    expect(names(store, MONDAY_ISO)).toEqual(['Barbell Bench Press', 'Barbell Row', 'Cable Fly']);
    expect(store.isDayEditPending(MONDAY_ISO)).toBe(false);
  });

  it('a refetch in the same session recognises the landed write: no doubling on screen, nothing owed', async () => {
    const server = installServer(plan());
    const realWrite = server.replacePlanDay.getMockImplementation()!;
    server.replacePlanDay.mockImplementationOnce(async (planId: string, body: unknown) => {
      await realWrite(planId, body);
      throw new Error('Network Error');
    });
    const store = await coldStart();

    store.addExercisesToDay(MONDAY_ISO, [CABLE_FLY]);
    await flush();
    expect(store.isDayEditPending(MONDAY_ISO)).toBe(true);

    // The user comes back to the tab: the focus refetch lands the plan that
    // already holds the write.
    store.refreshLiveCalendarData(true);
    await flush(20);
    expect(names(store, MONDAY_ISO)).toEqual(['Barbell Bench Press', 'Barbell Row', 'Cable Fly']);
    expect(store.isDayEditPending(MONDAY_ISO)).toBe(false);
    expect(server.replacePlanDay).toHaveBeenCalledTimes(1);
  });

  it('an edit made after the lost write is carried onto the landed day, not applied twice', async () => {
    const server = installServer(plan());
    const realWrite = server.replacePlanDay.getMockImplementation()!;
    server.replacePlanDay.mockImplementationOnce(async (planId: string, body: unknown) => {
      await realWrite(planId, body);
      throw new Error('Network Error');
    });
    const store = await coldStart();

    store.addExercisesToDay(MONDAY_ISO, [CABLE_FLY]);
    await flush();
    // Still on the old base as far as the phone knows; the user removes Row.
    store.removeExerciseFromDay(MONDAY_ISO, 1);
    await flush();
    expect(names(store, MONDAY_ISO)).toEqual(['Barbell Bench Press', 'Cable Fly']);

    store.refreshLiveCalendarData(true);
    await flush(30);
    expect(names(store, MONDAY_ISO)).toEqual(['Barbell Bench Press', 'Cable Fly']);
    expect(serverDay(server, 1, 'Monday')).toEqual([['Barbell Bench Press', 'Cable Fly']]);
    expect(store.isDayEditPending(MONDAY_ISO)).toBe(false);
  });

  it('a day the old two-step write already doubled is written back as it is, never doubled again', async () => {
    // What a build-32 phone may have left on the server: the old slot and
    // the rebuilt one, side by side. The next edit consolidates the day but
    // must not compound it.
    const server = installServer(
      plan({
        planWorkouts: [
          slot({ id: 'slot-old', exercises: [BENCH, ROW] }),
          slot({
            id: 'slot-new',
            orderInDay: 1,
            exercises: [
              BENCH,
              ROW,
              apiExercise({ exerciseId: 'cable-fly', name: 'Cable Fly', orderIndex: 2 }),
            ],
          }),
        ],
      }),
    );
    let store = await coldStart();
    expect(names(store, MONDAY_ISO)).toEqual([
      'Barbell Bench Press', 'Barbell Row', 'Barbell Bench Press', 'Barbell Row', 'Cable Fly',
    ]);

    store.removeExerciseFromDay(MONDAY_ISO, 2);
    await flush();
    expect(serverDay(server, 1, 'Monday')).toEqual([
      ['Barbell Bench Press', 'Barbell Row', 'Barbell Row', 'Cable Fly'],
    ]);

    store = await hoursLaterReopen();
    await flush(20);
    expect(serverDay(server, 1, 'Monday')).toEqual([
      ['Barbell Bench Press', 'Barbell Row', 'Barbell Row', 'Cable Fly'],
    ]);
  });
});

// ===========================================================================
// GitHub #53 / #54 — lock the phone mid-workout, come back: "not in the plan"
// ===========================================================================

describe('issue 53: coming back to a running workout refetches the plan', () => {
  it('the workout stays on screen while the foreground refetch is out', async () => {
    const server = installServer(plan());
    const store = await coldStart();
    expect(names(store, MONDAY_ISO)).toEqual(['Barbell Bench Press', 'Barbell Row']);

    // Home refetches on every foreground; the phone is slow to answer.
    let landFetch!: (v: { plan: ApiPlan | null; weeklyWorkouts: never[] }) => void;
    server.getCurrentPlanWithWeekly.mockImplementationOnce(
      () => new Promise((r) => { landFetch = r; }),
    );
    store.refreshLiveCalendarData(true);
    await flush();
    // What the workout screen reads every second while the rest timer runs.
    expect(store.calendarDataMode()).toBe('live');
    expect(names(store, MONDAY_ISO)).toEqual(['Barbell Bench Press', 'Barbell Row']);
    expect(store.getLivePlan()).not.toBeNull();

    landFetch({ plan: clone(server.plan), weeklyWorkouts: [] });
    await flush(20);
    expect(store.calendarDataMode()).toBe('live');
    expect(names(store, MONDAY_ISO)).toEqual(['Barbell Bench Press', 'Barbell Row']);
  });

  it('a refetch that fails (no signal at the gym) keeps the plan on screen', async () => {
    const server = installServer(plan());
    const store = await coldStart();

    server.getCurrentPlanWithWeekly.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    store.refreshLiveCalendarData(true);
    await flush(20);
    expect(store.calendarDataMode()).toBe('live');
    expect(names(store, MONDAY_ISO)).toEqual(['Barbell Bench Press', 'Barbell Row']);

    // Signal returns: the next foreground refetch lands normally.
    store.refreshLiveCalendarData(true);
    await flush(20);
    expect(store.calendarDataMode()).toBe('live');
  });

  it('only one refetch is out at a time, and a first load that fails still reads as offline', async () => {
    const server = installServer(plan());
    server.getCurrentPlanWithWeekly.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    const store = await coldStart();
    expect(store.calendarDataMode()).toBe('offline');

    let calls = 0;
    server.getCurrentPlanWithWeekly.mockImplementation(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 5));
      return { plan: clone(server.plan), weeklyWorkouts: [] };
    });
    store.refreshLiveCalendarData(true);
    store.refreshLiveCalendarData(true);
    store.refreshLiveCalendarData(true);
    await flush(20);
    expect(calls).toBe(1);
    expect(store.calendarDataMode()).toBe('live');
  });
});

// ===========================================================================
// GitHub #57 — a set checked with the wrong number, corrected after the finish
// ===========================================================================

describe('issue 57: correcting a set after Complete Workout', () => {
  async function finishedMonday() {
    const server = installServer(plan());
    const store = await coldStart();
    // Bench 8×135, 8×135, 8×145 ; Row 10×95 ×3
    for (const w of ['135 lb', '135 lb', '145 lb']) store.logSet(MONDAY_ISO, 0, { reps: '8', weight: w });
    for (let i = 0; i < 3; i++) store.logSet(MONDAY_ISO, 1, { reps: '10', weight: '95 lb' });
    store.finishDaySession(MONDAY_ISO);
    await flush(20);
    expect(server.apiPost.mock.calls.filter(([url]) => url === '/workout-logs')).toHaveLength(1);
    return { server, store };
  }

  it('changes the set here and sends the whole corrected entry list to the server', async () => {
    const { server, store } = await finishedMonday();
    expect(store.canEditLoggedSets(MONDAY_ISO)).toBe(true);
    // Set 2 of the bench was 10 reps, not 8.
    expect(store.editLoggedSet(MONDAY_ISO, 0, 1, { count: 10, weightLb: 135 })).toBe(true);
    await flush();
    expect(store.getSetLogs(MONDAY_ISO, 0).map((l) => l.reps)).toEqual(['8', '10', '8']);
    const patches = server.apiPatch.mock.calls.filter(([url]) => url === '/workout-logs/log-1/sets');
    expect(patches).toHaveLength(1);
    const body = patches[0][1] as { entries: Array<{ orderIndex: number; sets: Array<{ reps: number; weight?: number }> }> };
    expect(body.entries.map((e) => e.orderIndex)).toEqual([0, 1]);
    expect(body.entries[0].sets.map((x) => [x.reps, x.weight])).toEqual([[8, 135], [10, 135], [8, 145]]);
    expect(body.entries[1].sets).toHaveLength(3);
    // The stored copy of the log carries the correction too (the recap reads it).
    const stored = store.loggedSessionsFor(MONDAY_ISO)[0];
    expect(stored.entries[0].completedSets[1]).toMatchObject({ reps: 10, weight: 135 });
  });

  it('a blank weight clears the load; a failed PATCH is retried after the next plan fetch and survives a restart', async () => {
    let { server, store } = await finishedMonday();
    server.apiPatch.mockRejectedValueOnce(new Error('offline'));
    store.editLoggedSet(MONDAY_ISO, 1, 2, { count: 12, weightLb: null });
    await flush();
    expect(store.getSetLogs(MONDAY_ISO, 1)[2]).toEqual({ reps: '12', weight: 'Bodyweight' });
    expect(server.apiPatch).toHaveBeenCalledTimes(1);

    // Hours later, a cold start: the owed correction is still known here.
    store = await hoursLaterReopen();
    expect(store.getSetLogs(MONDAY_ISO, 1)[2]).toEqual({ reps: '12', weight: 'Bodyweight' });
    store.refreshLiveCalendarData(true);
    await flush(20);
    const patches = server.apiPatch.mock.calls.filter(([url]) => url === '/workout-logs/log-1/sets');
    expect(patches).toHaveLength(2);
    const body = patches[1][1] as { entries: Array<{ sets: Array<{ reps: number; weight?: number }> }> };
    expect(body.entries[1].sets[2]).toEqual({ setNumber: 3, reps: 12, completed: true });
  });

  it('a set logged before the finish posts corrected, with no PATCH at all', async () => {
    const server = installServer(plan());
    const store = await coldStart();
    for (let i = 0; i < 3; i++) store.logSet(MONDAY_ISO, 0, { reps: '8', weight: '135 lb' });
    // Nothing stored yet: the edit is local, and the completion carries it.
    expect(store.editLoggedSet(MONDAY_ISO, 0, 0, { count: 9, weightLb: 135 })).toBe(true);
    store.finishDaySession(MONDAY_ISO);
    await flush(20);
    const post = server.apiPost.mock.calls.find(([url]) => url === '/workout-logs')![1] as {
      entries: Array<{ sets: Array<{ reps: number }> }>;
    };
    expect(post.entries[0].sets.map((x) => x.reps)).toEqual([9, 8, 8]);
    expect(server.apiPatch).not.toHaveBeenCalled();
  });
});
