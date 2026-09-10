import { NotFoundException } from '@nestjs/common';
import { PlansService } from './plans.service';
import type { ApplyWorkaroundsDto } from './dto/apply-workarounds.dto';

/**
 * `applyWorkaroundsToCurrentPlan` is the one path that rewrites a saved
 * plan's rows, so what it touches — and what it leaves alone — is pinned
 * here with a hand-rolled Prisma and catalog. The substitution itself is
 * covered in plan-avoid-substitution.spec.ts.
 */

type Row = { id: string; name: string; knee?: boolean };
const CATALOG: Row[] = [
  { id: 'back_squat', name: 'Back Squat', knee: true },
  { id: 'flat_barbell_bench_press', name: 'Flat Barbell Bench Press' },
  { id: 'glute_bridge', name: 'Glute Bridge' },
];

function fakeCatalog() {
  const byId = new Map(CATALOG.map((r) => [r.id, r]));
  return {
    findOne: (id: string) => byId.get(id),
    avoidPredicate: (avoid: string[] | undefined) => (e: Row) =>
      (avoid ?? []).includes('knees') ? !!e.knee : false,
    pickReplacement: jest.fn(() => byId.get('glute_bridge') ?? null),
  };
}

function exercise(exerciseId: string, orderIndex: number) {
  return {
    exerciseId,
    name: CATALOG.find((r) => r.id === exerciseId)?.name ?? null,
    sets: 3,
    reps: 5,
    repsMin: null,
    repsMax: null,
    durationSeconds: null,
    prescriptionType: null,
    weight: null,
    notes: 'Rest 3 min.',
    orderIndex,
  };
}

function slot(id: string, weekNumber: number, exerciseIds: string[]) {
  return {
    id,
    weekNumber,
    dayOfWeek: 'Monday',
    title: 'Lower A',
    detailLine: 'Wk detail',
    type: 'strength',
    durationMinutes: 45,
    intensity: null,
    orderInDay: 0,
    exercises: exerciseIds.map((e, i) => exercise(e, i)),
  };
}

function fakePrisma(plan: unknown, mirrorFor: Record<string, string | null>) {
  const op = (name: string) => jest.fn((args: unknown) => ({ name, args }));
  return {
    workoutPlan: { findFirst: jest.fn(async () => plan) },
    workout: {
      findFirst: jest.fn(
        async ({ where }: { where: { planWorkoutId: string } }) => {
          const id = mirrorFor[where.planWorkoutId];
          return id ? { id } : null;
        },
      ),
      update: op('workout.update'),
    },
    workoutExercise: { deleteMany: op('workoutExercise.deleteMany') },
    planExercise: { deleteMany: op('planExercise.deleteMany') },
    planWorkout: { update: op('planWorkout.update') },
    $transaction: jest.fn(async (ops: unknown[]) => ops),
  };
}

function makeService(prisma: ReturnType<typeof fakePrisma>) {
  const svc = Object.create(PlansService.prototype) as PlansService;
  const anySvc = svc as unknown as Record<string, unknown>;
  anySvc.prisma = prisma;
  anySvc.exercises = fakeCatalog();
  anySvc.logger = { log: jest.fn(), warn: jest.fn(), debug: jest.fn() };
  anySvc.getById = jest.fn(async (id: string) => ({ id }));
  return svc;
}

const DTO: ApplyWorkaroundsDto = { limitations: ['knees'], fromWeekNumber: 2 };

describe('PlansService.applyWorkaroundsToCurrentPlan', () => {
  it('refuses when the user has no plan', async () => {
    const svc = makeService(fakePrisma(null, {}));
    await expect(
      svc.applyWorkaroundsToCurrentPlan('u1', DTO),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('writes nothing when no slot in range loads the joint', async () => {
    const prisma = fakePrisma(
      { id: 'p1', planWorkouts: [slot('s1', 2, ['flat_barbell_bench_press'])] },
      {},
    );
    const r = await makeService(prisma).applyWorkaroundsToCurrentPlan(
      'u1',
      DTO,
    );
    expect(r).toMatchObject({ swapped: 0, dropped: 0, slotsTouched: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('leaves weeks before fromWeekNumber as history and rewrites the rest, mirror included', async () => {
    const prisma = fakePrisma(
      {
        id: 'p1',
        planWorkouts: [
          slot('s1', 1, ['back_squat', 'flat_barbell_bench_press']),
          slot('s2', 2, ['back_squat', 'flat_barbell_bench_press']),
        ],
      },
      { s2: 'w2' },
    );
    const r = await makeService(prisma).applyWorkaroundsToCurrentPlan(
      'u1',
      DTO,
    );
    expect(r).toMatchObject({
      swapped: 1,
      dropped: 0,
      slotsTouched: 1,
      plan: { id: 'p1' },
    });

    // One transaction, for the week-2 slot only: plan rows + the mirrored workout.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const ops = prisma.$transaction.mock.calls[0][0] as {
      name: string;
      args: any;
    }[];
    expect(ops.map((o) => o.name)).toEqual([
      'planExercise.deleteMany',
      'planWorkout.update',
      'workoutExercise.deleteMany',
      'workout.update',
    ]);
    expect(ops[0].args).toEqual({ where: { planWorkoutId: 's2' } });
    expect(prisma.planExercise.deleteMany).not.toHaveBeenCalledWith({
      where: { planWorkoutId: 's1' },
    });

    const created = ops[1].args.data.exercises.create;
    expect(created.map((e: { exerciseId: string }) => e.exerciseId)).toEqual([
      'glute_bridge',
      'flat_barbell_bench_press',
    ]);
    expect(created[0]).toMatchObject({
      sets: 3,
      reps: 5,
      orderIndex: 0,
      notes: 'Swapped in for Back Squat (your work-arounds). Rest 3 min.',
    });
    expect(ops[2].args).toEqual({ where: { workoutId: 'w2' } });
    expect(ops[3].args.where).toEqual({ id: 'w2' });
    expect(
      ops[3].args.data.exercises.create.map(
        (e: { exerciseId: string }) => e.exerciseId,
      ),
    ).toEqual(['glute_bridge', 'flat_barbell_bench_press']);
  });

  it('skips the mirror when the slot has no workout yet', async () => {
    const prisma = fakePrisma(
      { id: 'p1', planWorkouts: [slot('s2', 3, ['back_squat'])] },
      {},
    );
    await makeService(prisma).applyWorkaroundsToCurrentPlan('u1', {
      limitations: ['knees'],
    });
    const ops = prisma.$transaction.mock.calls[0][0] as { name: string }[];
    expect(ops.map((o) => o.name)).toEqual([
      'planExercise.deleteMany',
      'planWorkout.update',
    ]);
  });
});
