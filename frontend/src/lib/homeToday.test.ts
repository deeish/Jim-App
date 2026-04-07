import type { ApiPlan } from '../services/planService';
import type { Workout } from '../types/workout';
import { planSlotLinksWeeklyWorkout, resolveHomeToday } from './homeToday';

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
});
