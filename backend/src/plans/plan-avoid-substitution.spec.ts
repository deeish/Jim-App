import { substituteAvoidedExercises } from './plan-avoid-substitution';
import type { PlanSlotDto } from './dto/create-plan.dto';

type Row = { id: string; name: string; knee?: boolean };

const CATALOG: Row[] = [
  { id: 'back_squat', name: 'Back Squat', knee: true },
  { id: 'flat_barbell_bench_press', name: 'Flat Barbell Bench Press' },
  { id: 'dumbbell_walking_lunge', name: 'Dumbbell Walking Lunge', knee: true },
  { id: 'leg_press_machine_exercise', name: '45-Degree Leg Press' },
  { id: 'barbell_romanian_deadlift', name: 'Barbell Romanian Deadlift' },
];

function fakeCatalog(replacements: Record<string, string | null>) {
  const byId = new Map(CATALOG.map((r) => [r.id, r]));
  return {
    findOne: jest.fn((id: string) => byId.get(id)),
    avoidPredicate: jest.fn(
      (avoid: string[] | undefined) => (e: Row) =>
        (avoid ?? []).includes('knees') ? !!e.knee : false,
    ),
    pickReplacement: jest.fn((dto: { targetExerciseId?: string }) => {
      const id = dto.targetExerciseId
        ? replacements[dto.targetExerciseId]
        : null;
      return id ? (byId.get(id) ?? null) : null;
    }),
  };
}

function slot(exercises: PlanSlotDto['exercises']): PlanSlotDto {
  return {
    weekNumber: 1,
    dayOfWeek: 'Monday',
    title: 'Lower A · Squat',
    type: 'strength',
    durationMinutes: 45,
    exercises,
  };
}

const LOWER = slot([
  {
    exerciseId: 'back_squat',
    name: 'Back Squat',
    sets: 4,
    reps: 6,
    repsMin: 6,
    repsMax: 8,
    notes: 'Rest ~3 min.',
    orderIndex: 0,
  },
  {
    exerciseId: 'barbell_romanian_deadlift',
    name: 'Barbell Romanian Deadlift',
    sets: 3,
    reps: 8,
    repsMin: 8,
    repsMax: 10,
    orderIndex: 1,
  },
  {
    exerciseId: 'dumbbell_walking_lunge',
    name: 'Dumbbell Walking Lunge',
    sets: 3,
    reps: 10,
    orderIndex: 2,
  },
]);

describe('substituteAvoidedExercises', () => {
  it('leaves everything alone with no work-arounds', () => {
    const catalog = fakeCatalog({});
    const r = substituteAvoidedExercises([LOWER], [], catalog);
    expect(r).toEqual({ slots: [LOWER], swapped: 0, dropped: 0 });
    expect(catalog.pickReplacement).not.toHaveBeenCalled();
  });

  it('swaps a flagged exercise for the catalog alternative, keeping the prescription', () => {
    const catalog = fakeCatalog({
      back_squat: 'leg_press_machine_exercise',
      dumbbell_walking_lunge: null,
    });
    const r = substituteAvoidedExercises([LOWER], ['knees'], catalog, {
      goal: 'strength',
      experience: 'intermediate',
    });
    expect(r.swapped).toBe(1);
    expect(r.dropped).toBe(1);
    const rows = r.slots[0].exercises!;
    expect(rows.map((e) => e.exerciseId)).toEqual([
      'leg_press_machine_exercise',
      'barbell_romanian_deadlift',
    ]);
    // The squat's sets, range and rest guidance ride on the replacement.
    expect(rows[0]).toMatchObject({
      name: '45-Degree Leg Press',
      sets: 4,
      reps: 6,
      repsMin: 6,
      repsMax: 8,
      orderIndex: 0,
    });
    expect(rows[0].notes).toBe(
      'Swapped in for Back Squat (your work-arounds). Rest ~3 min.',
    );
    // The lunge had no alternative and is gone; order is re-indexed.
    expect(rows[1].orderIndex).toBe(1);
    // The picker was told what is already on the day, and the constraints.
    expect(catalog.pickReplacement).toHaveBeenCalledWith(
      expect.objectContaining({
        targetExerciseId: 'back_squat',
        avoid: ['knees'],
        goal: 'strength',
        experience: 'intermediate',
        dayExerciseIds: expect.arrayContaining(['barbell_romanian_deadlift']),
      }),
    );
  });

  it('swaps the same exercise for the same alternative in every week of the plan', () => {
    // A picker that varies its answer call to call (the real one does).
    const catalog = fakeCatalog({});
    const options = ['leg_press_machine_exercise', 'barbell_romanian_deadlift'];
    let calls = 0;
    catalog.pickReplacement.mockImplementation(() => {
      const id = options[calls++ % options.length];
      return CATALOG.find((r) => r.id === id) ?? null;
    });
    const week = (n: number) =>
      ({
        ...slot([
          {
            exerciseId: 'back_squat',
            name: 'Back Squat',
            sets: 4,
            reps: 6,
            orderIndex: 0,
          },
        ]),
        weekNumber: n,
      }) as PlanSlotDto;
    const r = substituteAvoidedExercises(
      [week(1), week(2), week(3)],
      ['knees'],
      catalog,
    );
    expect(r.swapped).toBe(3);
    expect(r.slots.map((s) => s.exercises![0].exerciseId)).toEqual([
      'leg_press_machine_exercise',
      'leg_press_machine_exercise',
      'leg_press_machine_exercise',
    ]);
    // Only the first week asked the picker; the rest reused its answer.
    expect(catalog.pickReplacement).toHaveBeenCalledTimes(1);
  });

  it('does not reuse the plan-wide alternative when that day already has it', () => {
    const catalog = fakeCatalog({ back_squat: 'leg_press_machine_exercise' });
    const dayWithLegPress = slot([
      {
        exerciseId: 'back_squat',
        name: 'Back Squat',
        sets: 4,
        reps: 6,
        orderIndex: 0,
      },
      {
        exerciseId: 'leg_press_machine_exercise',
        name: '45-Degree Leg Press',
        sets: 3,
        reps: 10,
        orderIndex: 1,
      },
    ]);
    const r = substituteAvoidedExercises(
      [LOWER, dayWithLegPress],
      ['knees'],
      catalog,
    );
    // Week 1: squat → leg press (chosen plan-wide). Week 2 already has leg
    // press, so the picker is asked again instead of doubling it up.
    expect(r.slots[0].exercises![0].exerciseId).toBe(
      'leg_press_machine_exercise',
    );
    expect(catalog.pickReplacement).toHaveBeenCalledTimes(3);
    expect(catalog.pickReplacement).toHaveBeenLastCalledWith(
      expect.objectContaining({
        targetExerciseId: 'back_squat',
        dayExerciseIds: expect.arrayContaining(['leg_press_machine_exercise']),
      }),
    );
  });

  it('never empties a slot: with nothing to swap in, the slot is left as written', () => {
    const catalog = fakeCatalog({});
    const only = slot([
      {
        exerciseId: 'back_squat',
        name: 'Back Squat',
        sets: 4,
        reps: 6,
        orderIndex: 0,
      },
    ]);
    const r = substituteAvoidedExercises([only], ['knees'], catalog);
    expect(r.slots[0]).toBe(only);
    expect(r.dropped).toBe(0);
    expect(r.swapped).toBe(0);
  });

  it('ignores rows the catalog does not know (synthetic ids from a preview)', () => {
    const catalog = fakeCatalog({});
    const synthetic = slot([
      {
        exerciseId: 'applied_1_Monday_0',
        name: 'Knee-Friendly Mystery',
        sets: 3,
        reps: 10,
        orderIndex: 0,
      },
    ]);
    const r = substituteAvoidedExercises([synthetic], ['knees'], catalog);
    expect(r.slots[0]).toBe(synthetic);
    expect(catalog.pickReplacement).not.toHaveBeenCalled();
  });

  it('leaves slots without exercises untouched', () => {
    const catalog = fakeCatalog({});
    const empty = slot(undefined);
    const r = substituteAvoidedExercises([empty], ['knees'], catalog);
    expect(r.slots[0]).toBe(empty);
  });
});
