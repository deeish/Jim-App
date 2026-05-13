/**
 * Contract + regression: Home / Workout tab ETA must use the same numbers as Plan
 * (detail sheet + day rollup use `getPlanSlotDisplayMinutes` with
 * `linked.estimatedDuration ?? slot.durationMinutes`).
 */

import {
  exercisesLikeFromPrescription,
  getPlanSlotDisplayMinutes,
  getWorkoutDisplayEstimateMinutes,
  resolveWorkoutEtaMinutes,
  type EtaPlanSlotLike,
  type EtaWorkoutLike,
} from './estimateWorkoutMinutes';

/** Mirrors `PlanScreen` detail meta: `linked?.estimatedDuration ?? slot.durationMinutes` + slot vs linked exercises */
function etaAsPlanDetailScreen(linked: EtaWorkoutLike, slot: EtaPlanSlotLike): number {
  const plannedBlend = linked.estimatedDuration ?? slot.durationMinutes;
  const fromPlanRows = exercisesLikeFromPrescription(slot.exercises);
  const linkedRows = exercisesLikeFromPrescription(linked.exercises);
  return getPlanSlotDisplayMinutes(plannedBlend, fromPlanRows, linkedRows);
}

describe('estimate sync: resolveWorkoutEtaMinutes ↔ Plan tab', () => {
  const fixtures: Array<{
    name: string;
    linked: EtaWorkoutLike;
    slot: EtaPlanSlotLike;
  }> = [
      {
        name: 'blend uses slot duration when estimatedDuration missing',
        linked: {
          exercises: [
            { sets: 4, reps: 8 },
            { sets: 3, reps: 10 },
          ],
        },
        slot: {
          durationMinutes: 52,
          exercises: [{ sets: 3, reps: 8 }],
        },
      },
      {
        name: 'blend prefers workout estimatedDuration when set',
        linked: {
          estimatedDuration: 48,
          exercises: [{ sets: 3, reps: 12 }],
        },
        slot: {
          durationMinutes: 60,
          exercises: [{ sets: 5, reps: 5 }],
        },
      },
      {
        name: 'string reps coerces consistently',
        linked: {
          exercises: [{ sets: 3, reps: '10' }],
        },
        slot: {
          durationMinutes: 35,
          exercises: [{ sets: 2, reps: 12 }],
        },
      },
      {
        name: 'no linked lifts → fallback to slot prescription',
        linked: { exercises: [] },
        slot: {
          durationMinutes: 30,
          exercises: [
            { sets: 3, reps: 10 },
            { sets: 3, reps: 10 },
          ],
        },
      },
      {
        name: 'string reps on slot-only prescription (Plan uses same coercion as Home)',
        linked: { exercises: [] },
        slot: {
          durationMinutes: 40,
          exercises: [{ sets: 3, reps: '12' }, { sets: 3, reps: '12' }],
        },
      },
    ];

  fixtures.forEach(({ name, linked, slot }) => {
    test(name, () => {
      const fromResolver = resolveWorkoutEtaMinutes(linked, slot);
      const fromPlan = etaAsPlanDetailScreen(linked, slot);
      expect(fromResolver).not.toBeNull();
      expect(fromResolver).toBe(fromPlan);
    });
  });

  test('legacy Home-style path differs when slot duration matters and estimatedDuration is missing', () => {
    const linked: EtaWorkoutLike = {
      exercises: [{ sets: 4, reps: 10 }],
    };
    const slot = {
      durationMinutes: 58,
      exercises: [{ sets: 3, reps: 8 }],
    };
    const synced = resolveWorkoutEtaMinutes(linked, slot)!;
    const legacyHomeIgnoringSlot = getWorkoutDisplayEstimateMinutes(
      exercisesLikeFromPrescription(linked.exercises),
      linked.estimatedDuration ?? null,
    )!;
    const planDetail = etaAsPlanDetailScreen(linked, slot);
    expect(synced).toBe(planDetail);
    expect(legacyHomeIgnoringSlot).not.toBe(synced);
  });

  test('prescription override (live session exercises) stays on same formula as explicit third arg', () => {
    const workout = {
      estimatedDuration: 42,
      exercises: [{ sets: 5, reps: 5 }],
    };
    const slot = {
      durationMinutes: 50,
      exercises: [{ sets: 3, reps: 8 }],
    };
    const livePrescription = [
      { sets: 4, reps: 10 },
      { sets: 3, reps: 8 },
    ];
    const fromResolver = resolveWorkoutEtaMinutes(workout, slot, livePrescription);
    const plannedBlend = workout.estimatedDuration ?? slot.durationMinutes;
    const explicit = getPlanSlotDisplayMinutes(
      plannedBlend,
      exercisesLikeFromPrescription(slot.exercises),
      exercisesLikeFromPrescription(livePrescription),
    );
    expect(fromResolver).toBe(explicit);
  });

  test('without plan slot behaves like heuristic + workout estimatedDuration only', () => {
    const workout = {
      estimatedDuration: 40,
      exercises: [{ sets: 3, reps: 12 }],
    };
    expect(resolveWorkoutEtaMinutes(workout, null)).toBe(
      getWorkoutDisplayEstimateMinutes(exercisesLikeFromPrescription(workout.exercises), 40),
    );
    expect(resolveWorkoutEtaMinutes(workout, undefined)).toBe(
      getWorkoutDisplayEstimateMinutes(exercisesLikeFromPrescription(workout.exercises), 40),
    );
  });
});
