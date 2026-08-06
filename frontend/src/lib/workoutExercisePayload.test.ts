import { toWorkoutExercisePayloads } from './workoutExercisePayload';

describe('toWorkoutExercisePayloads', () => {
  it('carries every prescription field through (the range-collapse regression)', () => {
    const [row] = toWorkoutExercisePayloads([
      {
        name: 'Barbell Bench Press',
        sets: 4,
        reps: 6,
        repsMin: 6,
        repsMax: 8,
        prescriptionType: 'reps',
        weight: 135,
        notes: 'Rest ~2 min.',
        exerciseId: 'flat_barbell_bench_press',
      },
    ]);
    expect(row).toEqual({
      name: 'Barbell Bench Press',
      sets: 4,
      reps: 6,
      repsMin: 6,
      repsMax: 8,
      durationSeconds: undefined,
      prescriptionType: 'reps',
      weight: 135,
      notes: 'Rest ~2 min.',
      exerciseId: 'flat_barbell_bench_press',
      orderIndex: 0,
    });
  });

  it('carries time-based rows', () => {
    const [row] = toWorkoutExercisePayloads([
      { name: 'Bike Intervals', sets: 1, reps: 600, durationSeconds: 600, prescriptionType: 'time' },
    ]);
    expect(row.durationSeconds).toBe(600);
    expect(row.prescriptionType).toBe('time');
  });

  it('reindexes orderIndex from startIndex (append after existing rows)', () => {
    const rows = toWorkoutExercisePayloads(
      [
        { name: 'A', sets: 3, reps: 10 },
        { name: 'B', sets: 3, reps: 10 },
      ],
      5,
    );
    expect(rows.map((r) => r.orderIndex)).toEqual([5, 6]);
  });

  it('leaves absent optionals undefined so JSON omits them', () => {
    const [row] = toWorkoutExercisePayloads([{ name: 'Push-Up', sets: 2, reps: 12 }]);
    expect(row.repsMin).toBeUndefined();
    expect(row.repsMax).toBeUndefined();
    expect(row.durationSeconds).toBeUndefined();
    expect(row.prescriptionType).toBeUndefined();
    expect(JSON.parse(JSON.stringify(row))).toEqual({
      name: 'Push-Up',
      sets: 2,
      reps: 12,
      orderIndex: 0,
    });
  });
});
