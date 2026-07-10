import {
  enforceWeekPatternFloors,
  floorKeysForExercise,
  type WeekFloorLibrary,
} from './week-pattern-floors';
import { exerciseRowIsBalanceInsert } from './session-enrichment';

const CATALOG = [
  {
    id: 'flat_barbell_bench_press',
    name: 'Flat Barbell Bench Press',
    primaryMuscleGroup: 'Chest',
    movementPatterns: ['Push'],
  },
  {
    id: 'flat_dumbbell_bench_press',
    name: 'Flat Dumbbell Bench Press',
    primaryMuscleGroup: 'Chest',
    movementPatterns: ['Push'],
  },
  {
    id: 'incline_dumbbell_bench_press',
    name: 'Incline Dumbbell Bench Press',
    primaryMuscleGroup: 'Chest',
    movementPatterns: ['Push'],
  },
  {
    id: 'barbell_overhead_press',
    name: 'Barbell Overhead Press',
    primaryMuscleGroup: 'Shoulders',
    movementPatterns: ['Push'],
  },
  {
    id: 'single_arm_dumbbell_row',
    name: 'Single-Arm Dumbbell Row',
    primaryMuscleGroup: 'Back',
    movementPatterns: ['Pull'],
  },
  {
    id: 'lat_pulldown_wide',
    name: 'Wide-Grip Lat Pulldown',
    primaryMuscleGroup: 'Back',
    movementPatterns: ['Pull'],
  },
  {
    id: 'dumbbell_romanian_deadlift',
    name: 'Dumbbell Romanian Deadlift',
    primaryMuscleGroup: 'Legs',
    movementPatterns: ['Hinge'],
  },
  {
    id: 'lying_leg_curl',
    name: 'Lying Leg Curl',
    primaryMuscleGroup: 'Legs',
    movementPatterns: [],
  },
  {
    id: 'back_squat',
    name: 'Back Squat',
    primaryMuscleGroup: 'Legs',
    movementPatterns: ['Squat'],
  },
] as const;

function mockLibrary(): WeekFloorLibrary {
  const byId = new Map<string, (typeof CATALOG)[number]>(
    CATALOG.map((r) => [r.id, r]),
  );
  return {
    findOne: (id) => byId.get(id) as any,
    getCandidatesForGenerator: ({ excludeIds }) => {
      const ex = new Set(excludeIds ?? []);
      return CATALOG.filter((r) => !ex.has(r.id)) as any;
    },
  };
}

const row = (id: string, extra: Record<string, unknown> = {}) => {
  const meta = CATALOG.find((r) => r.id === id)!;
  return {
    name: meta.name,
    exerciseId: meta.id,
    sets: 3,
    reps: 8,
    primaryMuscleGroup: meta.primaryMuscleGroup,
    ...extra,
  };
};

const session = (
  name: string,
  exercises: ReturnType<typeof row>[],
  reasoning?: string,
) => ({ weekIndex: 1, weekday: 'Monday', name, exercises, reasoning });

describe('floorKeysForExercise', () => {
  it('classifies the six fundamentals', () => {
    const meta = (p: string[]) => ({ movementPatterns: p });
    expect(
      floorKeysForExercise('Barbell Overhead Press', meta(['Push'])),
    ).toContain('push_v');
    expect(
      floorKeysForExercise('Flat Barbell Bench Press', meta(['Push'])),
    ).toContain('push_h');
    expect(
      floorKeysForExercise('Wide-Grip Lat Pulldown', meta(['Pull'])),
    ).toContain('pull_v');
    expect(
      floorKeysForExercise('Single-Arm Dumbbell Row', meta(['Pull'])),
    ).toContain('pull_h');
    expect(floorKeysForExercise('Back Squat', meta(['Squat']))).toContain(
      'knee',
    );
    expect(floorKeysForExercise('Walking Lunge', meta(['Lunge']))).toContain(
      'knee',
    );
    expect(
      floorKeysForExercise('Romanian Deadlift', meta(['Hinge'])),
    ).toContain('hinge');
    // A pushdown is Push-pattern but no pressing angle — provides no floor.
    expect(
      floorKeysForExercise('Straight-Bar Cable Pushdown', meta(['Push'])).size,
    ).toBe(0);
  });
});

describe('enforceWeekPatternFloors', () => {
  it('fills a missing vertical push by swapping a redundant horizontal press', () => {
    const sessions = [
      session('Upper · A', [
        row('flat_barbell_bench_press'),
        row('single_arm_dumbbell_row'),
        row('flat_dumbbell_bench_press'),
      ]),
      session('Upper · B', [
        row('incline_dumbbell_bench_press'),
        row('lat_pulldown_wide'),
      ]),
    ];
    const specs = [
      { type: 'strength', title: 'Upper', weekIndex: 1 },
      { type: 'strength', title: 'Upper 2', weekIndex: 1 },
    ];
    const out = enforceWeekPatternFloors({
      sessions: sessions as any,
      specs,
      library: mockLibrary(),
      equipment: undefined,
    });
    expect(out.repairs).toBe(1);
    const ids = out.sessions[0]!.exercises.map((e) => e.exerciseId);
    expect(ids).toEqual([
      'flat_barbell_bench_press',
      'single_arm_dumbbell_row',
      'barbell_overhead_press',
    ]);
    const inserted = out.sessions[0]!.exercises[2]!;
    expect(inserted.notes).toMatch(/fundamental movement pattern/i);
    // The floor insert is protected from later swap passes like other inserts.
    expect(exerciseRowIsBalanceInsert(inserted)).toBe(true);
  });

  it('fills a missing knee pattern on the lower day, replacing a no-pattern accessory', () => {
    const sessions = [
      session('Lower · A', [
        row('dumbbell_romanian_deadlift'),
        row('lying_leg_curl'),
      ]),
      session('Upper · A', [
        row('flat_barbell_bench_press'),
        row('barbell_overhead_press'),
        row('single_arm_dumbbell_row'),
        row('lat_pulldown_wide'),
      ]),
    ];
    const specs = [
      { type: 'strength', title: 'Lower', weekIndex: 1 },
      { type: 'strength', title: 'Upper', weekIndex: 1 },
    ];
    const out = enforceWeekPatternFloors({
      sessions: sessions as any,
      specs,
      library: mockLibrary(),
      equipment: undefined,
    });
    expect(out.repairs).toBe(1);
    expect(out.sessions[0]!.exercises.map((e) => e.exerciseId)).toEqual([
      'dumbbell_romanian_deadlift',
      'back_squat',
    ]);
  });

  it('never forces lower-body work into an upper-only week', () => {
    const sessions = [
      session('Upper · A', [
        row('flat_barbell_bench_press'),
        row('barbell_overhead_press'),
        row('single_arm_dumbbell_row'),
      ]),
      session('Upper · B', [
        row('incline_dumbbell_bench_press'),
        row('lat_pulldown_wide'),
      ]),
    ];
    const specs = [
      { type: 'strength', title: 'Upper', weekIndex: 1 },
      { type: 'strength', title: 'Upper 2', weekIndex: 1 },
    ];
    const out = enforceWeekPatternFloors({
      sessions: sessions as any,
      specs,
      library: mockLibrary(),
      equipment: undefined,
    });
    expect(out.repairs).toBe(0);
    const allIds = out.sessions.flatMap((s) =>
      s.exercises.map((e) => e.exerciseId),
    );
    expect(allIds).not.toContain('back_squat');
  });

  it('never replaces slot-1, balance inserts, or a floor’s only provider', () => {
    const sessions = [
      session('Upper · A', [
        row('flat_barbell_bench_press'),
        row('single_arm_dumbbell_row', {
          notes: 'Added so pressing and pulling stay balanced.',
        }),
      ]),
      session('Upper · B', [
        row('incline_dumbbell_bench_press'),
        row('lat_pulldown_wide'),
      ]),
    ];
    const specs = [
      { type: 'strength', title: 'Upper', weekIndex: 1 },
      { type: 'strength', title: 'Upper 2', weekIndex: 1 },
    ];
    // push_v is missing but every non-slot-1 row is protected: the row is a
    // balance insert, and the pulldown is the week's only vertical pull.
    const out = enforceWeekPatternFloors({
      sessions: sessions as any,
      specs,
      library: mockLibrary(),
      equipment: undefined,
    });
    expect(out.repairs).toBe(0);
  });

  it('refreshes the deterministic reasoning but keeps the Note suffix', () => {
    const sessions = [
      session(
        'Upper · A',
        [
          row('flat_barbell_bench_press'),
          row('single_arm_dumbbell_row'),
          row('flat_dumbbell_bench_press'),
        ],
        'Flat Barbell Bench Press leads the session while you are freshest, then 2 supporting moves round out chest and back. Note: We led off with a staple compound.',
      ),
      session('Upper · B', [
        row('incline_dumbbell_bench_press'),
        row('lat_pulldown_wide'),
      ]),
    ];
    const specs = [
      { type: 'strength', title: 'Upper', weekIndex: 1 },
      { type: 'strength', title: 'Upper 2', weekIndex: 1 },
    ];
    const out = enforceWeekPatternFloors({
      sessions: sessions as any,
      specs,
      library: mockLibrary(),
      equipment: undefined,
    });
    expect(out.repairs).toBe(1);
    const reasoning = out.sessions[0]!.reasoning!;
    expect(reasoning).toMatch(/^Flat Barbell Bench Press leads the session/);
    expect(reasoning).toMatch(/round out chest, back, and shoulders/);
    expect(reasoning).toMatch(/Note: We led off with a staple compound\.$/);
  });

  it('is a no-op for single-session weeks and non-strength specs', () => {
    const sessions = [
      session('Full Body', [
        row('flat_barbell_bench_press'),
        row('single_arm_dumbbell_row'),
      ]),
    ];
    const out = enforceWeekPatternFloors({
      sessions: sessions as any,
      specs: [{ type: 'strength', title: 'Full Body', weekIndex: 1 }],
      library: mockLibrary(),
      equipment: undefined,
    });
    expect(out.repairs).toBe(0);
  });
});
