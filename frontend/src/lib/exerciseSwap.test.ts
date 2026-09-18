jest.mock('./planCalendarPrototypeStore', () => ({
  plannedDayForDate: jest.fn(() => ({ exercises: [] })),
  plannedExerciseFromCatalog: jest.fn(),
  replaceExercise: jest.fn(),
  weekExerciseContext: jest.fn(() => ({ ids: [], names: [] })),
}));
jest.mock('../services/exerciseService', () => ({ replaceExercise: jest.fn() }));
jest.mock('../services/planService', () => ({ generateSessions: jest.fn(), repairProgramSessions: jest.fn() }));

import type { Exercise } from '../services/exerciseService';
import type { PlanDraft, PlanInputs, SessionDraft } from '../types/plan';
import { applySwapTarget, outgoingForSwapTarget } from './exerciseSwap';
import { getPreviewSession, resetPreviewSession, setPreviewSession } from './planPreviewSession';
import * as store from './planCalendarPrototypeStore';

const upper: SessionDraft = {
  type: 'strength',
  title: 'Upper',
  focusTags: [],
  durationMin: 30,
  durationMax: 45,
  isHardDay: false,
  exercises: [
    { exerciseId: 'bench', name: 'Flat Barbell Bench Press', sets: 4, reps: '8–12', repsMin: 8, repsMax: 12 },
    { exerciseId: 'row', name: 'Barbell Bent-Over Row', sets: 4, reps: '8–12', repsMin: 8, repsMax: 12 },
  ],
};
const lower: SessionDraft = {
  ...upper,
  title: 'Lower',
  exercises: [{ exerciseId: 'squat', name: 'Back Squat', sets: 4, reps: '6–8', repsMin: 6, repsMax: 8 }],
};
const draft = (): PlanDraft => ({
  draftId: 'd',
  inputsSnapshot: {} as PlanInputs,
  metrics: { sessionsPerWeek: 2, strengthCount: 2, cardioCount: 0, hardDaysCount: 0 },
  debugMeta: { effectiveSplitId: 'upper_lower' },
  weeks: [
    {
      weekIndex: 1,
      days: [
        { weekday: 'Monday', dateOrLabel: 'Week 1', session: upper },
        { weekday: 'Tuesday', dateOrLabel: 'Week 1', session: lower },
      ],
    },
    {
      weekIndex: 2,
      days: [
        { weekday: 'Monday', dateOrLabel: 'Week 2', session: upper },
        { weekday: 'Tuesday', dateOrLabel: 'Week 2', session: lower },
      ],
    },
  ],
});
const chosen = {
  id: 'db_bench',
  name: 'Dumbbell Bench Press',
  primaryMuscleGroup: 'Chest',
  secondaryMuscleGroups: [],
} as unknown as Exercise;
const target = { kind: 'preview', weekIndex: 1, weekday: 'Monday', exerciseName: 'Flat Barbell Bench Press' } as const;

beforeEach(() => {
  resetPreviewSession();
  jest.clearAllMocks();
});

describe('preview swap target', () => {
  it('describes the slot with the rest of the day and the rest of the week', () => {
    setPreviewSession({ planDraft: draft(), recordedSwaps: [] });
    expect(outgoingForSwapTarget(target)).toEqual({
      id: 'bench',
      name: 'Flat Barbell Bench Press',
      dayIds: ['bench', 'row'],
      dayNames: ['Flat Barbell Bench Press', 'Barbell Bent-Over Row'],
      weekIds: ['squat'],
      weekNames: ['Back Squat'],
    });
  });

  it('is null when there is no draft or the row is gone', () => {
    expect(outgoingForSwapTarget(target)).toBeNull();
    setPreviewSession({ planDraft: draft() });
    expect(outgoingForSwapTarget({ ...target, exerciseName: 'Gone' })).toBeNull();
  });

  it('applies to every week and records the swap on the session', () => {
    setPreviewSession({ planDraft: draft(), recordedSwaps: [] });
    expect(applySwapTarget(target, chosen)).toBe(true);
    const s = getPreviewSession();
    expect(s.planDraft!.weeks[0]!.days[0]!.session!.exercises[0]!.exerciseId).toBe('db_bench');
    expect(s.planDraft!.weeks[1]!.days[0]!.session!.exercises[0]!.exerciseId).toBe('db_bench');
    // the slot keeps its prescription
    expect(s.planDraft!.weeks[0]!.days[0]!.session!.exercises[0]!.repsMax).toBe(12);
    expect(s.recordedSwaps).toHaveLength(1);
    expect(s.recordedSwaps[0]!.weeks).toBe('all');
  });

  it('refuses when the slot is gone and leaves the session alone', () => {
    setPreviewSession({ planDraft: draft(), recordedSwaps: [] });
    expect(applySwapTarget({ ...target, exerciseName: 'Gone' }, chosen)).toBe(false);
    expect(getPreviewSession().recordedSwaps).toHaveLength(0);
  });
});

describe('calendar swap target', () => {
  const cal = { kind: 'calendar', dateIso: '2026-09-21', exerciseIndex: 0 } as const;

  it('reads the slot from the store and replaces through it', () => {
    const outgoingRow = { exerciseId: 'bench', name: 'Flat Barbell Bench Press' };
    (store.plannedDayForDate as jest.Mock).mockReturnValue({
      exercises: [outgoingRow, { exerciseId: 'row', name: 'Row' }],
    });
    (store.weekExerciseContext as jest.Mock).mockReturnValue({ ids: ['squat'], names: ['Back Squat'] });
    (store.plannedExerciseFromCatalog as jest.Mock).mockReturnValue({ name: 'Dumbbell Bench Press' });
    expect(outgoingForSwapTarget(cal)).toEqual({
      id: 'bench',
      name: 'Flat Barbell Bench Press',
      dayIds: ['bench', 'row'],
      dayNames: ['Flat Barbell Bench Press', 'Row'],
      weekIds: ['squat'],
      weekNames: ['Back Squat'],
    });
    expect(applySwapTarget(cal, chosen)).toBe(true);
    expect(store.plannedExerciseFromCatalog).toHaveBeenCalledWith(chosen, outgoingRow);
    expect(store.replaceExercise).toHaveBeenCalledWith('2026-09-21', 0, { name: 'Dumbbell Bench Press' });
  });

  it('is null and refuses when the index is past the day', () => {
    (store.plannedDayForDate as jest.Mock).mockReturnValue({ exercises: [] });
    expect(outgoingForSwapTarget({ ...cal, exerciseIndex: 3 })).toBeNull();
    expect(applySwapTarget({ ...cal, exerciseIndex: 3 }, chosen)).toBe(false);
    expect(store.replaceExercise).not.toHaveBeenCalled();
  });
});
