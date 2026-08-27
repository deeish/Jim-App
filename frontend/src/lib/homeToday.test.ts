import type { ApiPlan, ApiPlanWorkout } from '../services/planService';
import type { Workout } from '../types/workout';
import {
  latestCompletedSession,
  planSlotLinksWeeklyWorkout,
  recentDayLabel,
  resolveHomeToday,
  weekTileLabel,
} from './homeToday';

describe('planSlotLinksWeeklyWorkout', () => {
  it('returns true when string ids match', () => {
    expect(planSlotLinksWeeklyWorkout('slot-1', 'slot-1')).toBe(true);
  });

  it('returns false when planWorkoutId is missing', () => {
    expect(planSlotLinksWeeklyWorkout('slot-1', '')).toBe(false);
    expect(planSlotLinksWeeklyWorkout('slot-1', null)).toBe(false);
    expect(planSlotLinksWeeklyWorkout('slot-1', undefined)).toBe(false);
  });

  it('matches when planWorkoutId is a number at runtime', () => {
    expect(planSlotLinksWeeklyWorkout('42', 42)).toBe(true);
  });
});

describe('resolveHomeToday', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Monday Apr 6, 2026 (local) — matches planCalendar tests
    jest.setSystemTime(new Date(2026, 3, 6, 12, 0, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('maps abbreviated dayOfWeek into the Monday column on that day', () => {
    const plan: ApiPlan = {
      id: 'p1',
      name: 'Test',
      userId: 'u1',
      createdAt: '',
      updatedAt: '',
      planWorkouts: [
        {
          id: 'slot1',
          workoutPlanId: 'p1',
          weekNumber: 1,
          dayOfWeek: 'mon',
          title: 'Push',
          detailLine: null,
          type: 'strength',
          durationMinutes: 45,
          intensity: null,
          orderInDay: 0,
        },
      ],
    };
    const r = resolveHomeToday(plan, []);
    expect(r.status).toBe('planned_pending');
  });

  it('links scheduled workout when planWorkoutId matches slot id', () => {
    const plan: ApiPlan = {
      id: 'p1',
      name: 'Test',
      userId: 'u1',
      createdAt: '',
      updatedAt: '',
      planWorkouts: [
        {
          id: 'slot1',
          workoutPlanId: 'p1',
          weekNumber: 1,
          dayOfWeek: 'Monday',
          title: 'Push',
          detailLine: null,
          type: 'strength',
          durationMinutes: 45,
          intensity: null,
          orderInDay: 0,
        },
      ],
    };
    const weekly: Workout[] = [
      {
        id: 'w1',
        name: 'Push',
        exercises: [],
        planWorkoutId: 'slot1',
      },
    ];
    const r = resolveHomeToday(plan, weekly);
    expect(r.status).toBe('scheduled');
    if (r.status === 'scheduled') expect(r.workout.id).toBe('w1');
  });

  it('repeats the last program week after the program ends instead of going out_of_program', () => {
    // 1-week plan anchored to LAST Monday — the "my plan disappeared" repro.
    const plan: ApiPlan = {
      id: 'p1',
      name: 'Test',
      userId: 'u1',
      createdAt: '',
      updatedAt: '',
      weekAnchorMonday: '2026-03-30',
      planWorkouts: [
        {
          id: 'slot1',
          workoutPlanId: 'p1',
          weekNumber: 1,
          dayOfWeek: 'Monday',
          title: 'Push',
          detailLine: null,
          type: 'strength',
          durationMinutes: 45,
          intensity: null,
          orderInDay: 0,
        },
      ],
    };
    const r = resolveHomeToday(plan, []);
    expect(r.status).toBe('planned_pending');
    expect(r.repeatingWeek).toBe(1);
  });

  it('repeats the last contiguous week, not an isolated far-future week', () => {
    // Week 1 is the real routine; a single workout was added to week 5
    // (maxProgramWeek 5). Past the program end, repeat week 1, not the sparse week 5.
    const slot = (id: string, weekNumber: number, title: string): ApiPlanWorkout => ({
      id,
      workoutPlanId: 'p1',
      weekNumber,
      dayOfWeek: 'Monday',
      title,
      detailLine: null,
      type: 'strength',
      durationMinutes: 45,
      intensity: null,
      orderInDay: 0,
    });
    const plan: ApiPlan = {
      id: 'p1',
      name: 'Test',
      userId: 'u1',
      createdAt: '',
      updatedAt: '',
      // 6+ weeks before Apr 6, 2026 → today is past both week 1 and week 5.
      weekAnchorMonday: '2026-02-16',
      planWorkouts: [slot('slot1', 1, 'Push'), slot('slot5', 5, 'Legs')],
    };
    const r = resolveHomeToday(plan, []);
    expect(r.status).toBe('planned_pending');
    expect(r.repeatingWeek).toBe(1);
    if (r.status === 'planned_pending') expect(r.slot.title).toBe('Push');
  });

  it('stays out_of_program when the anchor is in the future (no backward roll)', () => {
    const plan: ApiPlan = {
      id: 'p1',
      name: 'Test',
      userId: 'u1',
      createdAt: '',
      updatedAt: '',
      weekAnchorMonday: '2026-04-13',
      planWorkouts: [
        {
          id: 'slot1',
          workoutPlanId: 'p1',
          weekNumber: 1,
          dayOfWeek: 'Monday',
          title: 'Push',
          detailLine: null,
          type: 'strength',
          durationMinutes: 45,
          intensity: null,
          orderInDay: 0,
        },
      ],
    };
    const r = resolveHomeToday(plan, []);
    expect(r.status).toBe('out_of_program');
    expect(r.repeatingWeek).toBeUndefined();
  });
});

describe('weekTileLabel', () => {
  it('names the classic splits from the muscle set', () => {
    expect(weekTileLabel(['Chest', 'Shoulders', 'Triceps'])).toBe('Push');
    expect(weekTileLabel(['Chest', 'Triceps'])).toBe('Push');
    expect(weekTileLabel(['Back', 'Biceps'])).toBe('Pull');
    expect(weekTileLabel(['Quads', 'Hamstrings', 'Glutes', 'Calves'])).toBe('Legs');
    expect(weekTileLabel(['Biceps', 'Triceps'])).toBe('Arms');
  });

  it('names upper mixes Upper and upper+lower mixes Full', () => {
    expect(weekTileLabel(['Chest', 'Back', 'Shoulders'])).toBe('Upper');
    // Dylan's 3-muscle concern: back + chest + legs must not read as one muscle.
    expect(weekTileLabel(['Chest', 'Back', 'Quads'])).toBe('Full');
    expect(weekTileLabel(['Shoulders', 'Hamstrings'])).toBe('Full');
  });

  it('falls back to a muscle code only for genuine single-muscle days', () => {
    expect(weekTileLabel(['Shoulders'])).toBe('Delts');
    expect(weekTileLabel(['Hamstrings'])).toBe('Hams');
    expect(weekTileLabel(['Forearms'])).toBe('Grip');
    expect(weekTileLabel(['Back'])).toBe('Back');
  });

  it('treats core and cardio as garnish unless they are the whole day', () => {
    expect(weekTileLabel(['Chest', 'Core'])).toBe('Chest');
    expect(weekTileLabel(['Quads', 'Glutes', 'Cardio'])).toBe('Legs');
    expect(weekTileLabel(['Core'])).toBe('Core');
    expect(weekTileLabel(['Cardio'])).toBe('Cardio');
    expect(weekTileLabel(['Core', 'Cardio'])).toBe('Core');
  });

  it('never exceeds six characters, for every possible muscle combination class', () => {
    const all = [
      'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads',
      'Hamstrings', 'Glutes', 'Calves', 'Core', 'Cardio', 'Forearms',
    ] as const;
    for (const m of all) expect(weekTileLabel([m]).length).toBeLessThanOrEqual(6);
    for (const a of all) {
      for (const b of all) {
        expect(weekTileLabel([a, b]).length).toBeLessThanOrEqual(6);
      }
    }
    expect(weekTileLabel([...all]).length).toBeLessThanOrEqual(6);
    expect(weekTileLabel([])).toBe('');
  });
});

describe('latestCompletedSession', () => {
  const s = (startedAt: string, completedAt: string | null) => ({ startedAt, completedAt });

  it('picks the newest completed session even when the list is unsorted', () => {
    const older = s('2026-04-01T10:00:00.000Z', '2026-04-01T11:00:00.000Z');
    const newest = s('2026-04-05T10:00:00.000Z', '2026-04-05T11:00:00.000Z');
    const inProgress = s('2026-04-06T10:00:00.000Z', null);
    expect(latestCompletedSession([older, inProgress, newest])).toBe(newest);
  });

  it('returns null when nothing has completed', () => {
    expect(latestCompletedSession([s('2026-04-06T10:00:00.000Z', null)])).toBeNull();
    expect(latestCompletedSession([])).toBeNull();
  });
});

describe('recentDayLabel', () => {
  const today = '2026-04-06'; // Monday

  it('names today and yesterday', () => {
    expect(recentDayLabel('2026-04-06', today)).toBe('Today');
    expect(recentDayLabel('2026-04-05', today)).toBe('Yesterday');
  });

  it('uses the short weekday inside the past week', () => {
    expect(recentDayLabel('2026-04-04', today)).toBe('Sat');
    expect(recentDayLabel('2026-03-31', today)).toBe('Tue');
  });

  it('falls back to a short date beyond a week', () => {
    expect(recentDayLabel('2026-03-12', today)).toBe('Mar 12');
  });
});
