// The store reaches for RN, AsyncStorage and the API client at module scope;
// this jest setup has no RN transform, so they are stubbed out. The
// prescription mapping under test is pure.
jest.mock('react-native', () => ({
  Platform: { OS: 'test', select: (o: { default?: unknown }) => o.default ?? {} },
}));
jest.mock('expo-haptics', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('../api/client', () => ({ api: { get: jest.fn(), post: jest.fn() } }));

import { plannedExerciseFromCatalog } from './planCalendarPrototypeStore';
import type { Exercise as CatalogExercise } from '../services/exerciseService';
import type { PlannedExercise } from './planCalendarPrototype';

function catalogRow(over: Partial<CatalogExercise>): CatalogExercise {
  return {
    id: 'x',
    name: 'Exercise',
    primaryMuscleGroup: 'Chest',
    subMuscles: [],
    secondaryMuscleGroups: [],
    equipment: ['barbell'],
    movementPatterns: [],
    ...over,
  };
}

const BENCH = catalogRow({
  id: 'barbell-bench-press',
  name: 'Barbell Bench Press',
  primaryMuscleGroup: 'Chest',
});
const PLANK = catalogRow({
  id: 'plank',
  name: 'Plank',
  primaryMuscleGroup: 'Core',
  equipment: [],
});
const TREADMILL = catalogRow({
  id: 'treadmill-run',
  name: 'Treadmill Run',
  primaryMuscleGroup: 'Cardio',
  equipment: ['treadmill'],
});

function planned(over: Partial<PlannedExercise>): PlannedExercise {
  return {
    name: 'Outgoing',
    muscle: 'Chest',
    sets: 4,
    reps: '8–12',
    weight: '135 lb',
    rest: '2:30',
    equipment: 'Barbell',
    note: '',
    ...over,
  };
}

describe('plannedExerciseFromCatalog', () => {
  it('carries the outgoing prescription when the kind matches', () => {
    const out = plannedExerciseFromCatalog(BENCH, planned({ sets: 5, reps: '3–5' }));
    expect(out.sets).toBe(5);
    expect(out.reps).toBe('3–5');
    expect(out.weight).toBe('135 lb');
  });

  it('does not hand a hold prescription to a loaded lift', () => {
    const hold = planned({ name: 'Plank', muscle: 'Core', reps: '45 sec', weight: 'Bodyweight' });
    const out = plannedExerciseFromCatalog(BENCH, hold);
    expect(out.reps).toBe('8–12');
    expect(out.rest).toBe('2:00');
  });

  it('does not hand a rep count to a hold', () => {
    const out = plannedExerciseFromCatalog(PLANK, planned({ reps: '8–12' }));
    expect(out.reps).toBe('45 sec');
    expect(out.weight).toBe('Bodyweight');
  });

  it('gives a fresh hold a duration, not a rep range', () => {
    expect(plannedExerciseFromCatalog(PLANK, null).reps).toBe('45 sec');
  });

  it('keeps cardio on minutes in both directions', () => {
    expect(plannedExerciseFromCatalog(TREADMILL, planned({ reps: '8–12' })).reps).toBe('10 min');
    const fromCardio = plannedExerciseFromCatalog(
      BENCH,
      planned({ name: 'Treadmill Run', muscle: 'Cardio', reps: '10 min', rest: '—' }),
    );
    expect(fromCardio.reps).toBe('8–12');
    expect(fromCardio.rest).toBe('2:00');
  });

  it('treats two holds as the same kind, so a swap keeps the duration', () => {
    const hold = planned({ name: 'Plank', muscle: 'Core', reps: '60 sec', weight: 'Bodyweight' });
    const sidePlank = catalogRow({
      id: 'side-plank',
      name: 'Side Plank',
      primaryMuscleGroup: 'Core',
      equipment: [],
    });
    expect(plannedExerciseFromCatalog(sidePlank, hold).reps).toBe('60 sec');
  });
});
