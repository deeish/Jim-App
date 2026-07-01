import { ExercisesController } from './exercises.controller';
import { ExercisesService } from './exercises.service';
import { SavedExercisesService } from './saved-exercises.service';

describe('ExercisesController search limit', () => {
  const fakeExercises = Array.from({ length: 10 }, (_, i) => ({
    id: `ex-${i}`,
    name: `Exercise ${i}`,
  })) as unknown as ReturnType<ExercisesService['search']>;

  let controller: ExercisesController;

  beforeEach(() => {
    const exercisesService = {
      search: jest.fn().mockReturnValue(fakeExercises),
    } as unknown as ExercisesService;
    controller = new ExercisesController(
      exercisesService,
      {} as SavedExercisesService,
    );
  });

  it('returns all matches with the full count when no limit is given', () => {
    const res = controller.search({});
    expect(res.exercises).toHaveLength(10);
    expect(res.count).toBe(10);
  });

  it('caps exercises at limit but keeps count = total matches', () => {
    const res = controller.search({ limit: 3 });
    expect(res.exercises).toHaveLength(3);
    expect(res.count).toBe(10);
    expect(res.exercises[0].id).toBe('ex-0');
  });

  it('applies the same cap on the GET variant', () => {
    const res = controller.searchGet({ limit: 4 });
    expect(res.exercises).toHaveLength(4);
    expect(res.count).toBe(10);
  });
});
