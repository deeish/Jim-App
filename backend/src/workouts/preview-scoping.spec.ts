import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { GenerateWorkoutDto } from './dto/generate-workout.dto';
import { WorkoutsService } from './workouts.service';

/**
 * Regression cover for the preview IDOR.
 *
 * `POST /workouts/preview` took only `@Body()`, and `GenerateWorkoutDto.userId`
 * carried validators — so the global `whitelist: true` pipe KEPT a
 * caller-supplied id and the generator read that user's recent workouts and
 * last logged weights. Crew summaries publish every crewmate's `userId`, so the
 * targets were not secret.
 *
 * Two independent defences, one test each: the field cannot arrive over the
 * wire, and the service overwrites it regardless.
 */
describe('preview scoping', () => {
  describe('the wire cannot carry a userId', () => {
    it('strips it under whitelist, the way the global pipe runs', async () => {
      // `whitelist: true` drops any property with no validation decorator.
      // That bare `userId?: string` is deliberate — see the DTO's comment.
      const dto = plainToInstance(GenerateWorkoutDto, {
        day: 'Monday',
        userId: 'victim-user-id',
        preferences: { focus: 'push' },
      });
      const errors = await validate(dto, { whitelist: true });
      expect(errors).toHaveLength(0);
      expect((dto as GenerateWorkoutDto).userId).toBeUndefined();
    });

    it('still accepts the fields a client legitimately sends', async () => {
      const dto = plainToInstance(GenerateWorkoutDto, {
        day: 'Monday',
        preferences: { focus: 'push' },
      });
      const errors = await validate(dto, { whitelist: true });
      expect(errors).toHaveLength(0);
      expect(dto.day).toBe('Monday');
      expect(dto.preferences).toEqual({ focus: 'push' });
    });
  });

  describe('the service overwrites it anyway', () => {
    it('personalises the preview from the CALLER, never the body', async () => {
      const generateWorkout = jest.fn().mockResolvedValue({ name: 'w' });
      const service = new WorkoutsService(
        {} as never,
        { generateWorkout } as never,
        {} as never,
      );

      await service.previewGenerate(
        { day: 'Monday', userId: 'victim-user-id' } as GenerateWorkoutDto,
        'caller-user-id',
      );

      expect(generateWorkout).toHaveBeenCalledTimes(1);
      expect(generateWorkout.mock.calls[0][0].userId).toBe('caller-user-id');
    });
  });
});
