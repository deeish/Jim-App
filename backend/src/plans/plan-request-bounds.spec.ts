import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreatePlanDto } from './dto/create-plan.dto';

/**
 * `POST /plans` and `PATCH /plans/:id` fill every EMPTY slot with a generated
 * workout, one sequential Groq call each, and the slot list came straight off
 * the wire with no size limit. These bounds are the cheap half of the fix; the
 * other half is the per-request generation cap in `createWorkoutsForPlan`.
 */
const slot = (i: number) => ({
  weekNumber: (i % 12) + 1,
  dayOfWeek: 'Monday',
  title: 'Push',
  type: 'strength',
  durationMinutes: 45,
});

const errorsFor = async (body: Record<string, unknown>) =>
  validate(plainToInstance(CreatePlanDto, body), { whitelist: true });

describe('CreatePlanDto request bounds', () => {
  it('accepts the largest plan the app can actually express', async () => {
    // 12 weeks x 7 days is the ceiling in the generation inputs.
    const errors = await errorsFor({
      slots: Array.from({ length: 84 }, (_, i) => slot(i)),
    });
    expect(errors).toHaveLength(0);
  });

  it('REJECTS a slot list past the cap, rather than generating from it', async () => {
    const errors = await errorsFor({
      slots: Array.from({ length: 121 }, (_, i) => slot(i)),
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('slots');
    expect(errors[0].constraints).toHaveProperty('arrayMaxSize');
  });

  it('bounds exercises within a single slot too', async () => {
    const exercise = { exerciseId: 'bench-press', sets: 3, reps: 10 };
    const under = await errorsFor({
      slots: [
        { ...slot(0), exercises: Array.from({ length: 60 }, () => exercise) },
      ],
    });
    expect(under).toHaveLength(0);

    const over = await errorsFor({
      slots: [
        { ...slot(0), exercises: Array.from({ length: 61 }, () => exercise) },
      ],
    });
    expect(over).toHaveLength(1);
  });
});
