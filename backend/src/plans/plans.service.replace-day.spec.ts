import { NotFoundException } from '@nestjs/common';
import { PlansService } from './plans.service';
import type { ReplaceDayDto } from './dto/replace-day.dto';

/**
 * POST /plans/:id/days/replace — the atomic day rebuild behind the
 * calendar's day edits. What matters: everything on the day goes and the new
 * slot arrives inside ONE transaction, the linked Workout rows are unlinked
 * (as removeSlot does), and a null slot clears the day.
 */

type Call = { name: string; args: unknown };

function fakePrisma(plan: { id: string; userId: string } | null) {
  const calls: Call[] = [];
  const op = (name: string, result: unknown = { count: 1 }) =>
    jest.fn(async (args: unknown) => {
      calls.push({ name, args });
      return result;
    });
  const created = {
    id: 'slot-new',
    title: 'Push',
    dayOfWeek: 'Monday',
    detailLine: null,
    durationMinutes: 45,
    exercises: [{ exerciseId: 'bench', name: 'Bench', sets: 3, reps: 8 }],
  };
  const tx = {
    workout: { updateMany: op('tx.workout.updateMany') },
    planWorkout: {
      deleteMany: op('tx.planWorkout.deleteMany'),
      create: op('tx.planWorkout.create', created),
    },
  };
  const prisma = {
    workoutPlan: { findUnique: jest.fn(async () => plan) },
    workout: {
      findFirst: jest.fn(async () => null),
      create: op('workout.create'),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
      calls.push({ name: 'tx.begin', args: null });
      const out = await fn(tx);
      calls.push({ name: 'tx.commit', args: null });
      return out;
    }),
  };
  return { prisma, calls };
}

function makeService(prisma: unknown) {
  const svc = Object.create(PlansService.prototype) as PlansService;
  const anySvc = svc as unknown as Record<string, unknown>;
  anySvc.prisma = prisma;
  anySvc.logger = { log: jest.fn(), warn: jest.fn(), debug: jest.fn() };
  anySvc.getById = jest.fn(async (id: string) => ({ id }));
  return svc;
}

const DTO: ReplaceDayDto = {
  weekNumber: 2,
  dayOfWeek: 'Monday',
  slot: {
    weekNumber: 99, // ignored: the day is named by the top-level fields
    dayOfWeek: 'Friday',
    title: 'Push',
    type: 'strength',
    durationMinutes: 45,
    exercises: [{ exerciseId: 'bench', name: 'Bench', sets: 3, reps: 8 }],
  },
};

describe('PlansService.replaceDay', () => {
  it('refuses a plan that is not the caller’s', async () => {
    const { prisma } = fakePrisma({ id: 'plan-1', userId: 'someone-else' });
    await expect(
      makeService(prisma).replaceDay('plan-1', DTO, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('unlinks, deletes and creates inside one transaction, on the named day', async () => {
    const { prisma, calls } = fakePrisma({ id: 'plan-1', userId: 'user-1' });
    const result = await makeService(prisma).replaceDay(
      'plan-1',
      DTO,
      'user-1',
    );

    const day = { workoutPlanId: 'plan-1', weekNumber: 2, dayOfWeek: 'Monday' };
    expect(calls.map((c) => c.name)).toEqual([
      'tx.begin',
      'tx.workout.updateMany',
      'tx.planWorkout.deleteMany',
      'tx.planWorkout.create',
      'tx.commit',
      'workout.create', // the linked Workout row, after the commit (as addSlot does)
    ]);
    expect(calls[1].args).toEqual({
      where: { planWorkout: day },
      data: { workoutPlanId: null, planWorkoutId: null },
    });
    expect(calls[2].args).toEqual({ where: day });
    const create = calls[3].args as { data: Record<string, unknown> };
    expect(create.data).toMatchObject({ ...day, title: 'Push', orderInDay: 0 });
    expect(create.data.exercises).toEqual({
      create: [expect.objectContaining({ exerciseId: 'bench', orderIndex: 0 })],
    });
    expect(result).toEqual({ id: 'plan-1' });
  });

  it('a null slot clears the day and creates nothing', async () => {
    const { prisma, calls } = fakePrisma({ id: 'plan-1', userId: 'user-1' });
    await makeService(prisma).replaceDay(
      'plan-1',
      { weekNumber: 2, dayOfWeek: 'Monday', slot: null },
      'user-1',
    );
    expect(calls.map((c) => c.name)).toEqual([
      'tx.begin',
      'tx.workout.updateMany',
      'tx.planWorkout.deleteMany',
      'tx.commit',
    ]);
  });
});
