import type { ApiPlan, ApiPlanWorkout } from '../services/planService';
import type { Workout } from '../types/workout';
import { buildHomeWeekDots, planSlotLinksWeeklyWorkout, resolveHomeToday } from './homeToday';

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

describe('buildHomeWeekDots', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Monday Apr 6, 2026 (local) — matches planCalendar tests
    jest.setSystemTime(new Date(2026, 3, 6, 12, 0, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const slot = (id: string, dayOfWeek: string, title = 'Push'): ApiPlanWorkout => ({
    id,
    workoutPlanId: 'p1',
    weekNumber: 1,
    dayOfWeek,
    title,
    detailLine: null,
    type: 'strength',
    durationMinutes: 45,
    intensity: null,
    orderInDay: 0,
  });

  const planWith = (slots: ApiPlanWorkout[]): ApiPlan => ({
    id: 'p1',
    name: 'Test',
    userId: 'u1',
    createdAt: '',
    updatedAt: '',
    planWorkouts: slots,
  });

  const linked = (workoutId: string, slotId: string): Workout => ({
    id: workoutId,
    name: 'Push',
    exercises: [],
    planWorkoutId: slotId,
  });

  it('does not mark a day completed just because its workout row was materialized', () => {
    // Applying an AI plan materializes Workout rows for every slot upfront —
    // with no completed log, today must stay "today", not flip to "completed".
    const plan = planWith([slot('slot-mon', 'Monday'), slot('slot-wed', 'Wednesday')]);
    const weekly = [linked('w-mon', 'slot-mon'), linked('w-wed', 'slot-wed')];
    const dots = buildHomeWeekDots(plan, weekly, [], 1);
    expect(dots[0]).toEqual({ status: 'today', name: 'Push' });
    expect(dots[2]).toEqual({ status: 'scheduled', name: 'Push' });
  });

  it('marks a day completed only from a completed log for its linked workout', () => {
    const plan = planWith([slot('slot-mon', 'Monday'), slot('slot-wed', 'Wednesday')]);
    const weekly = [linked('w-mon', 'slot-mon'), linked('w-wed', 'slot-wed')];
    const dots = buildHomeWeekDots(
      plan,
      weekly,
      [{ workoutId: 'w-mon', completedAt: '2026-04-06T10:00:00.000Z' }],
      1,
    );
    expect(dots[0]).toEqual({ status: 'completed', name: 'Push' });
    expect(dots[2]).toEqual({ status: 'scheduled', name: 'Push' });
  });

  it('ignores logs without completedAt and logs for unrelated workouts', () => {
    const plan = planWith([slot('slot-mon', 'Monday')]);
    const weekly = [linked('w-mon', 'slot-mon')];
    const dots = buildHomeWeekDots(
      plan,
      weekly,
      [
        { workoutId: 'w-mon', completedAt: null },
        { workoutId: 'w-other', completedAt: '2026-04-06T10:00:00.000Z' },
      ],
      1,
    );
    expect(dots[0].status).toBe('today');
  });

  it('renders rest for days without slots and returns [] outside the program', () => {
    const plan = planWith([slot('slot-mon', 'Monday')]);
    const dots = buildHomeWeekDots(plan, [], [], 1);
    expect(dots[1]).toEqual({ status: 'rest', name: null });
    expect(buildHomeWeekDots(plan, [], [], null)).toEqual([]);
    expect(buildHomeWeekDots(null, [], [], 1)).toEqual([]);
  });
});
