import { WorkoutLogsController } from './workout-logs.controller';
import { WorkoutLogsService } from './workout-logs.service';

describe('WorkoutLogsController', () => {
  let controller: WorkoutLogsController;
  const serviceMock = {
    getLastPerformanceForExercises: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new WorkoutLogsController(
      serviceMock as unknown as WorkoutLogsService,
    );
  });

  describe('getLastPerformance', () => {
    it('splits and trims the comma-separated id list, dropping empties', async () => {
      serviceMock.getLastPerformanceForExercises.mockResolvedValue({
        results: {},
      });
      await controller.getLastPerformance(
        { exerciseIds: ' bench_press, back_squat ,, deadlift ' },
        'user-1',
      );
      expect(serviceMock.getLastPerformanceForExercises).toHaveBeenCalledWith(
        'user-1',
        ['bench_press', 'back_squat', 'deadlift'],
      );
    });

    it('returns the service envelope untouched', async () => {
      const envelope = { results: { bench_press: { sets: [] } } };
      serviceMock.getLastPerformanceForExercises.mockResolvedValue(envelope);
      await expect(
        controller.getLastPerformance({ exerciseIds: 'bench_press' }, 'user-1'),
      ).resolves.toBe(envelope);
    });
  });
});
