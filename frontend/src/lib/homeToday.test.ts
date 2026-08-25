import type { ApiPlan, ApiPlanWorkout } from '../services/planService';
import type { Workout } from '../types/workout';
import {
  heroExercisePreviewLine,
  latestCompletedSession,
  planSlotLinksWeeklyWorkout,
  recentDayLabel,
  resolveHomeToday,
  tileDayTitle,
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

describe('heroExercisePreviewLine', () => {
  it('joins up to three names and counts the rest', () => {
    expect(
      heroExercisePreviewLine(['Bench Press', 'Incline DB Press', 'Cable Fly', 'OHP', 'Lateral Raise', 'Pushdown']),
    ).toBe('Bench Press · Incline DB Press · Cable Fly +3 more');
  });

  it('omits the suffix when everything fits', () => {
    expect(heroExercisePreviewLine(['Bench Press', 'Cable Fly'])).toBe('Bench Press · Cable Fly');
  });

  it('skips blank names and returns empty for an empty day', () => {
    expect(heroExercisePreviewLine(['', '  '])).toBe('');
    expect(heroExercisePreviewLine([])).toBe('');
    expect(heroExercisePreviewLine([' Bench Press ', ''])).toBe('Bench Press');
  });
});

describe('tileDayTitle', () => {
  it('keeps the first word of the day title', () => {
    expect(tileDayTitle('Push Day A')).toBe('Push');
    expect(tileDayTitle('Upper Body')).toBe('Upper');
    expect(tileDayTitle('  Legs ')).toBe('Legs');
    expect(tileDayTitle('')).toBe('');
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
