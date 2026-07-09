import type { GenerateSessionsDto } from './dto/generate-sessions.dto';
import type { GeneratedSession } from './session-enrichment';
import {
  dedupeEnrichedProgramSessions,
  repairChunkGeneratedSessions,
  type ChunkRepairExerciseLibrary,
} from './generation-chunk-repair';

function mockLibrary(): ChunkRepairExerciseLibrary {
  const byId = new Map(
    [
      {
        id: 'dup-a',
        name: 'Bench Press',
        movementPatterns: ['Push'],
        primaryMuscleGroup: 'Chest',
      },
      {
        id: 'alt-push',
        name: 'Incline DB Press',
        movementPatterns: ['Push'],
        primaryMuscleGroup: 'Chest',
      },
      {
        id: 'hinge-bad',
        name: 'Romanian Deadlift',
        movementPatterns: ['Hinge', 'Pull'],
        primaryMuscleGroup: 'Hamstrings',
      },
      {
        id: 'upper-safe',
        name: 'Lat Pulldown',
        movementPatterns: ['Pull'],
        primaryMuscleGroup: 'Back',
      },
      {
        id: 'squat-leg',
        name: 'Back Squat',
        movementPatterns: ['Squat'],
        primaryMuscleGroup: 'Legs',
      },
      {
        // Filed under Back (catalog quirk) but a legitimate lower-day hinge.
        id: 'dl-back',
        name: 'Conventional Deadlift',
        movementPatterns: ['Hinge', 'Pull'],
        primaryMuscleGroup: 'Back',
      },
      {
        id: 'lunge-leg',
        name: 'Walking Lunge',
        movementPatterns: ['Lunge'],
        primaryMuscleGroup: 'Legs',
      },
    ].map((e) => [e.id, e]),
  );

  return {
    findOne: (id: string) => byId.get(id),
    getCandidatesForGenerator: ({ excludeIds }) => {
      const ex = new Set(excludeIds ?? []);
      return [...byId.values()].filter((e) => !ex.has(e.id));
    },
  };
}

function strengthSpec(
  weekday: string,
  title: string,
): GenerateSessionsDto['sessions'][number] {
  return {
    weekIndex: 0,
    weekday,
    type: 'strength',
    title,
    durationMin: 45,
    durationMax: 60,
    isHardDay: false,
  };
}

describe('repairChunkGeneratedSessions cardio + near-duplicate handling', () => {
  function cardioAwareLibrary(): ChunkRepairExerciseLibrary {
    const byId = new Map(
      [
        {
          id: 'treadmill_run',
          name: 'Treadmill Run',
          movementPatterns: [],
          primaryMuscleGroup: 'Cardio',
        },
        {
          id: 'bike_steady',
          name: 'Stationary Bike',
          movementPatterns: [],
          primaryMuscleGroup: 'Cardio',
        },
        {
          id: 'barbell_upright_row',
          name: 'Barbell Upright Row',
          movementPatterns: ['Pull'],
          primaryMuscleGroup: 'Shoulders',
        },
        {
          id: 'ez_bar_upright_row',
          name: 'EZ-Bar Upright Row',
          movementPatterns: ['Pull'],
          primaryMuscleGroup: 'Shoulders',
        },
        {
          id: 'lateral_raise',
          name: 'Dumbbell Lateral Raise',
          movementPatterns: ['Pull'],
          primaryMuscleGroup: 'Shoulders',
        },
        {
          id: 'flat_barbell_bench_press',
          name: 'Flat Barbell Bench Press',
          movementPatterns: ['Push'],
          primaryMuscleGroup: 'Chest',
        },
      ].map((e) => [e.id, e]),
    );
    return {
      findOne: (id: string) => byId.get(id),
      getCandidatesForGenerator: ({ excludeIds }) => {
        const ex = new Set(excludeIds ?? []);
        return [...byId.values()].filter((e) => !ex.has(e.id));
      },
    };
  }

  it('leaves a repeated Cardio finisher untouched across sessions', () => {
    const specs = [
      strengthSpec('Monday', 'Push'),
      strengthSpec('Tuesday', 'Pull'),
    ];
    const finisher = () => ({
      name: 'Treadmill Run',
      sets: 1,
      reps: 600,
      exerciseId: 'treadmill_run',
    });
    const sessions: GeneratedSession[] = [
      {
        weekIndex: 0,
        weekday: 'Monday',
        name: 'Push',
        exercises: [
          {
            name: 'Flat Barbell Bench Press',
            sets: 4,
            reps: 6,
            exerciseId: 'flat_barbell_bench_press',
          },
          finisher(),
        ],
      },
      {
        weekIndex: 0,
        weekday: 'Tuesday',
        name: 'Pull',
        exercises: [
          {
            name: 'Barbell Upright Row',
            sets: 3,
            reps: 8,
            exerciseId: 'barbell_upright_row',
          },
          finisher(),
        ],
      },
    ];

    const { sessions: out, duplicateRepairs } = repairChunkGeneratedSessions({
      sessions,
      specs,
      library: cardioAwareLibrary(),
      equipment: undefined,
    });

    expect(duplicateRepairs).toBe(0);
    expect(out[0]!.exercises![1]!.exerciseId).toBe('treadmill_run');
    expect(out[1]!.exercises![1]!.exerciseId).toBe('treadmill_run');
  });

  it('swaps an equipment variant of a movement already in the session', () => {
    const specs = [strengthSpec('Monday', 'Upper')];
    const sessions: GeneratedSession[] = [
      {
        weekIndex: 0,
        weekday: 'Monday',
        name: 'Upper',
        exercises: [
          {
            name: 'Barbell Upright Row',
            sets: 3,
            reps: 8,
            exerciseId: 'barbell_upright_row',
          },
          {
            name: 'EZ-Bar Upright Row',
            sets: 3,
            reps: 8,
            exerciseId: 'ez_bar_upright_row',
          },
        ],
      },
    ];

    const {
      sessions: out,
      nearDuplicateRepairs,
      notes,
    } = repairChunkGeneratedSessions({
      sessions,
      specs,
      library: cardioAwareLibrary(),
      equipment: undefined,
    });

    expect(nearDuplicateRepairs).toBe(1);
    expect(out[0]!.exercises![0]!.exerciseId).toBe('barbell_upright_row');
    // Replacement must not be another upright-row variant or a cardio row.
    expect(out[0]!.exercises![1]!.exerciseId).toBe('lateral_raise');
    expect(notes.some((n) => /equipment variants/i.test(n))).toBe(true);
  });

  it('keeps distinct base movements in one session untouched', () => {
    const specs = [strengthSpec('Monday', 'Upper')];
    const sessions: GeneratedSession[] = [
      {
        weekIndex: 0,
        weekday: 'Monday',
        name: 'Upper',
        exercises: [
          {
            name: 'Flat Barbell Bench Press',
            sets: 4,
            reps: 6,
            exerciseId: 'flat_barbell_bench_press',
          },
          {
            name: 'Barbell Upright Row',
            sets: 3,
            reps: 8,
            exerciseId: 'barbell_upright_row',
          },
        ],
      },
    ];

    const { sessions: out, nearDuplicateRepairs } =
      repairChunkGeneratedSessions({
        sessions,
        specs,
        library: cardioAwareLibrary(),
        equipment: undefined,
      });

    expect(nearDuplicateRepairs).toBe(0);
    const ids = out[0]!.exercises!.map((e) => e.exerciseId);
    expect(ids.slice(0, 2)).toEqual([
      'flat_barbell_bench_press',
      'barbell_upright_row',
    ]);
    // Below-minimum backfill may append rows, but never an equipment variant
    // of a movement already in the session.
    expect(ids).not.toContain('ez_bar_upright_row');
  });
});

describe('dedupeEnrichedProgramSessions', () => {
  function dedupeLibrary(): ChunkRepairExerciseLibrary {
    const byId = new Map(
      [
        {
          id: 'standing_dumbbell_curl',
          name: 'Standing Dumbbell Curl',
          movementPatterns: ['Push'],
          primaryMuscleGroup: 'Arms',
        },
        {
          id: 'rope_cable_pushdown',
          name: 'Rope Cable Pushdown',
          movementPatterns: ['Push'],
          primaryMuscleGroup: 'Arms',
        },
        {
          id: 'back_squat',
          name: 'Back Squat',
          movementPatterns: ['Squat'],
          primaryMuscleGroup: 'Legs',
        },
        {
          id: 'goblet_squat',
          name: 'Goblet Squat',
          movementPatterns: ['Squat'],
          primaryMuscleGroup: 'Legs',
        },
      ].map((e) => [e.id, e]),
    );
    return {
      findOne: (id: string) => byId.get(id),
      getCandidatesForGenerator: ({ excludeIds }) => {
        const ex = new Set(excludeIds ?? []);
        return [...byId.values()].filter((e) => !ex.has(e.id));
      },
    };
  }

  function enrichedRow(id: string, name: string) {
    return {
      name,
      sets: 3,
      reps: 12,
      exerciseId: id,
      repsMin: 12,
      repsMax: 16,
      restSeconds: 60,
    };
  }

  it('swaps a same-week duplicate that enrichment introduced, keeping the stamp', () => {
    const specs = [
      strengthSpec('Monday', 'Full Body'),
      strengthSpec('Friday', 'Full Body 2'),
    ];
    const sessions: GeneratedSession[] = [
      {
        weekIndex: 0,
        weekday: 'Monday',
        name: 'Full Body',
        exercises: [
          enrichedRow('standing_dumbbell_curl', 'Standing Dumbbell Curl'),
        ],
      },
      {
        weekIndex: 0,
        weekday: 'Friday',
        name: 'Full Body 2',
        exercises: [
          enrichedRow('standing_dumbbell_curl', 'Standing Dumbbell Curl'),
        ],
      },
    ];

    const { sessions: out, repairs } = dedupeEnrichedProgramSessions({
      sessions,
      specs,
      library: dedupeLibrary(),
      equipment: undefined,
    });

    expect(repairs).toBe(1);
    expect(out[0]!.exercises![0]!.exerciseId).toBe('standing_dumbbell_curl');
    const swapped = out[1]!.exercises![0]!;
    expect(swapped.exerciseId).not.toBe('standing_dumbbell_curl');
    // Role-stamped prescription survives the like-for-like swap.
    expect(swapped.sets).toBe(3);
    expect(swapped.repsMin).toBe(12);
    expect(swapped.restSeconds).toBe(60);
  });

  it('leaves cross-week repeats alone', () => {
    const specs = [
      { ...strengthSpec('Monday', 'Lower'), weekIndex: 1 },
      { ...strengthSpec('Monday', 'Lower'), weekIndex: 2 },
    ];
    const sessions: GeneratedSession[] = [
      {
        weekIndex: 1,
        weekday: 'Monday',
        name: 'Lower',
        exercises: [enrichedRow('back_squat', 'Back Squat')],
      },
      {
        weekIndex: 2,
        weekday: 'Monday',
        name: 'Lower',
        exercises: [enrichedRow('back_squat', 'Back Squat')],
      },
    ];

    const { sessions: out, repairs } = dedupeEnrichedProgramSessions({
      sessions,
      specs,
      library: dedupeLibrary(),
      equipment: undefined,
    });

    expect(repairs).toBe(0);
    expect(out[0]!.exercises![0]!.exerciseId).toBe('back_squat');
    expect(out[1]!.exercises![0]!.exerciseId).toBe('back_squat');
  });
});

describe('repairChunkGeneratedSessions', () => {
  it('replaces second occurrence of duplicate exerciseId across chunk', () => {
    const specs: GenerateSessionsDto['sessions'] = [
      {
        weekIndex: 0,
        weekday: 'Monday',
        type: 'strength',
        title: 'Upper',
        durationMin: 45,
        durationMax: 60,
        isHardDay: false,
      },
      {
        weekIndex: 0,
        weekday: 'Tuesday',
        type: 'strength',
        title: 'Push',
        durationMin: 45,
        durationMax: 60,
        isHardDay: false,
      },
    ];
    const sessions: GeneratedSession[] = [
      {
        weekIndex: 0,
        weekday: 'Monday',
        name: 'Upper',
        exercises: [
          { name: 'Bench Press', sets: 3, reps: 8, exerciseId: 'dup-a' },
        ],
      },
      {
        weekIndex: 0,
        weekday: 'Tuesday',
        name: 'Push',
        exercises: [
          { name: 'Bench Press', sets: 3, reps: 8, exerciseId: 'dup-a' },
        ],
      },
    ];

    const {
      sessions: out,
      duplicateRepairs,
      notes,
    } = repairChunkGeneratedSessions({
      sessions,
      specs,
      library: mockLibrary(),
      equipment: undefined,
    });

    expect(duplicateRepairs).toBe(1);
    expect(notes.length).toBeGreaterThan(0);
    expect(out[0]!.exercises[0]!.exerciseId).toBe('dup-a');
    expect(out[1]!.exercises[0]!.exerciseId).toBe('alt-push');
  });

  it('replaces Squat/Hinge pattern on upper-focus strength day', () => {
    const specs: GenerateSessionsDto['sessions'] = [
      {
        weekIndex: 0,
        weekday: 'Monday',
        type: 'strength',
        title: 'Upper 1',
        durationMin: 45,
        durationMax: 60,
        isHardDay: false,
      },
    ];
    const sessions: GeneratedSession[] = [
      {
        weekIndex: 0,
        weekday: 'Monday',
        name: 'Upper 1',
        exercises: [
          {
            name: 'Romanian Deadlift',
            sets: 3,
            reps: 8,
            exerciseId: 'hinge-bad',
          },
        ],
      },
    ];

    const {
      sessions: out,
      upperLowerPatternRepairs,
      notes,
    } = repairChunkGeneratedSessions({
      sessions,
      specs,
      library: mockLibrary(),
      equipment: undefined,
    });

    expect(upperLowerPatternRepairs).toBe(1);
    expect(notes.some((n) => /focus/i.test(n))).toBe(true);
    expect(out[0]!.exercises[0]!.exerciseId).toBe('upper-safe');
  });

  it('removes an upper movement from a lower-focus day but keeps a deadlift', () => {
    const specs: GenerateSessionsDto['sessions'] = [
      {
        weekIndex: 0,
        weekday: 'Monday',
        type: 'strength',
        title: 'Lower',
        durationMin: 45,
        durationMax: 60,
        isHardDay: false,
      },
    ];
    const sessions: GeneratedSession[] = [
      {
        weekIndex: 0,
        weekday: 'Monday',
        name: 'Lower',
        exercises: [
          // Chest press on a leg day → must be swapped for a lower movement.
          { name: 'Bench Press', sets: 3, reps: 8, exerciseId: 'dup-a' },
          // Deadlift filed under Back → must be KEPT (it is lower work).
          {
            name: 'Conventional Deadlift',
            sets: 3,
            reps: 5,
            exerciseId: 'dl-back',
          },
        ],
      },
    ];

    const { sessions: out, upperLowerPatternRepairs } =
      repairChunkGeneratedSessions({
        sessions,
        specs,
        library: mockLibrary(),
        equipment: undefined,
      });

    expect(upperLowerPatternRepairs).toBe(1);
    // Bench swapped to a lower movement…
    expect(['squat-leg', 'hinge-bad', 'lunge-leg']).toContain(
      out[0]!.exercises[0]!.exerciseId,
    );
    // …deadlift untouched.
    expect(out[0]!.exercises[1]!.exerciseId).toBe('dl-back');
  });

  it('removes a lunge (Legs) from an upper-focus day — pattern the old pass missed', () => {
    const specs: GenerateSessionsDto['sessions'] = [
      {
        weekIndex: 0,
        weekday: 'Monday',
        type: 'strength',
        title: 'Upper',
        durationMin: 45,
        durationMax: 60,
        isHardDay: false,
      },
    ];
    const sessions: GeneratedSession[] = [
      {
        weekIndex: 0,
        weekday: 'Monday',
        name: 'Upper',
        exercises: [
          { name: 'Walking Lunge', sets: 3, reps: 10, exerciseId: 'lunge-leg' },
        ],
      },
    ];

    const { sessions: out, upperLowerPatternRepairs } =
      repairChunkGeneratedSessions({
        sessions,
        specs,
        library: mockLibrary(),
        equipment: undefined,
      });

    expect(upperLowerPatternRepairs).toBe(1);
    expect(['dup-a', 'alt-push', 'upper-safe']).toContain(
      out[0]!.exercises[0]!.exerciseId,
    );
  });

  it('uses catalog scavenge when focus pools return no candidates', () => {
    const specs: GenerateSessionsDto['sessions'] = [
      {
        weekIndex: 0,
        weekday: 'Monday',
        type: 'strength',
        title: 'Upper',
        durationMin: 45,
        durationMax: 60,
        isHardDay: false,
      },
      {
        weekIndex: 0,
        weekday: 'Tuesday',
        type: 'strength',
        title: 'Push',
        durationMin: 45,
        durationMax: 60,
        isHardDay: false,
      },
    ];
    const library: ChunkRepairExerciseLibrary = {
      findOne: (id: string) =>
        id === 'only-id'
          ? { id: 'only-id', name: 'Shared Move', movementPatterns: ['Push'] }
          : undefined,
      getCandidatesForGenerator: () => [],
      candidatesForChunkRepairScavenge: (excludeIds) => {
        const ex = new Set(excludeIds);
        return [
          {
            id: 'scav-replace',
            name: 'Scavenger Row',
            movementPatterns: ['Pull'],
            primaryMuscleGroup: 'Back',
          },
        ].filter((c) => !ex.has(c.id));
      },
    };
    const sessions: GeneratedSession[] = [
      {
        weekIndex: 0,
        weekday: 'Monday',
        name: 'Upper',
        exercises: [
          { name: 'Shared Move', sets: 3, reps: 8, exerciseId: 'only-id' },
        ],
      },
      {
        weekIndex: 0,
        weekday: 'Tuesday',
        name: 'Push',
        exercises: [
          { name: 'Shared Move', sets: 3, reps: 8, exerciseId: 'only-id' },
        ],
      },
    ];

    const {
      sessions: out,
      notes,
      duplicateRepairs,
    } = repairChunkGeneratedSessions({
      sessions,
      specs,
      library,
      equipment: ['Barbell'],
    });

    expect(duplicateRepairs).toBe(1);
    expect(out[1]!.exercises[0]!.exerciseId).toBe('scav-replace');
    expect(notes.some((n) => /broad catalog/i.test(n))).toBe(true);
  });

  it('does not replace duplicate strength id with catalog Cardio', () => {
    const specs: GenerateSessionsDto['sessions'] = [
      {
        weekIndex: 0,
        weekday: 'Monday',
        type: 'strength',
        title: 'Upper',
        durationMin: 45,
        durationMax: 60,
        isHardDay: false,
      },
      {
        weekIndex: 0,
        weekday: 'Tuesday',
        type: 'strength',
        title: 'Push',
        durationMin: 45,
        durationMax: 60,
        isHardDay: false,
      },
    ];
    const library: ChunkRepairExerciseLibrary = {
      findOne: (id: string) =>
        id === 'dup-a'
          ? {
              id: 'dup-a',
              name: 'Bench',
              movementPatterns: ['Push'],
              primaryMuscleGroup: 'Chest',
            }
          : id === 'tread-only'
            ? {
                id: 'tread-only',
                name: 'Treadmill',
                primaryMuscleGroup: 'Cardio',
                prescriptionType: 'time' as const,
              }
            : {
                id: 'alt-push',
                name: 'Incline Press',
                movementPatterns: ['Push'],
                primaryMuscleGroup: 'Chest',
              },
      getCandidatesForGenerator: ({ excludeIds }) => {
        const ex = new Set(excludeIds ?? []);
        return [
          {
            id: 'tread-only',
            name: 'Treadmill',
            primaryMuscleGroup: 'Cardio',
            prescriptionType: 'time' as const,
          },
          {
            id: 'alt-push',
            name: 'Incline Press',
            movementPatterns: ['Push'],
            primaryMuscleGroup: 'Chest',
          },
        ].filter((e) => !ex.has(e.id));
      },
    };
    const sessions: GeneratedSession[] = [
      {
        weekIndex: 0,
        weekday: 'Monday',
        name: 'Upper',
        exercises: [{ name: 'Bench', sets: 3, reps: 8, exerciseId: 'dup-a' }],
      },
      {
        weekIndex: 0,
        weekday: 'Tuesday',
        name: 'Push',
        exercises: [{ name: 'Bench', sets: 3, reps: 8, exerciseId: 'dup-a' }],
      },
    ];

    const { sessions: out, duplicateRepairs } = repairChunkGeneratedSessions({
      sessions,
      specs,
      library,
      equipment: undefined,
      effectiveDetailLevel: 'simple',
    });

    expect(duplicateRepairs).toBeGreaterThanOrEqual(1);
    expect(out[0]!.exercises[0]!.exerciseId).toBe('dup-a');
    expect(out[1]!.exercises[0]!.exerciseId).toBe('alt-push');
  });

  it('avoids replacement exercise names matching avoid phrases', () => {
    const specs: GenerateSessionsDto['sessions'] = [
      {
        weekIndex: 0,
        weekday: 'Monday',
        type: 'strength',
        title: 'Upper',
        durationMin: 45,
        durationMax: 60,
        isHardDay: false,
      },
      {
        weekIndex: 0,
        weekday: 'Tuesday',
        type: 'strength',
        title: 'Push',
        durationMin: 45,
        durationMax: 60,
        isHardDay: false,
      },
    ];
    const library: ChunkRepairExerciseLibrary = {
      findOne: (id: string) =>
        id === 'dup-a'
          ? {
              id: 'dup-a',
              name: 'Bench Press',
              movementPatterns: ['Push'],
              primaryMuscleGroup: 'Chest',
            }
          : undefined,
      getCandidatesForGenerator: ({ excludeIds }) => {
        const ex = new Set(excludeIds ?? []);
        return [
          {
            id: 'cable-fly',
            name: 'Cable Fly',
            movementPatterns: ['Push'],
            primaryMuscleGroup: 'Chest',
          },
          {
            id: 'incline-bench',
            name: 'Incline Bench Press',
            movementPatterns: ['Push'],
            primaryMuscleGroup: 'Chest',
          },
        ].filter((e) => !ex.has(e.id));
      },
    };
    const sessions: GeneratedSession[] = [
      {
        weekIndex: 0,
        weekday: 'Monday',
        name: 'Upper',
        exercises: [
          { name: 'Bench Press', sets: 3, reps: 8, exerciseId: 'dup-a' },
        ],
      },
      {
        weekIndex: 0,
        weekday: 'Tuesday',
        name: 'Push',
        exercises: [
          { name: 'Bench Press', sets: 3, reps: 8, exerciseId: 'dup-a' },
        ],
      },
    ];

    const { sessions: out, duplicateRepairs } = repairChunkGeneratedSessions({
      sessions,
      specs,
      library,
      equipment: undefined,
      avoidConstraintsGlobal: ['bench'],
    });

    expect(duplicateRepairs).toBeGreaterThanOrEqual(1);
    expect(out[1]!.exercises[0]!.exerciseId).toBe('cable-fly');
  });

  it('appends catalog rows when session is below min exercise count', () => {
    const specs: GenerateSessionsDto['sessions'] = [
      {
        weekIndex: 0,
        weekday: 'Monday',
        type: 'strength',
        title: 'Upper',
        durationMin: 45,
        durationMax: 60,
        isHardDay: false,
      },
    ];
    const library: ChunkRepairExerciseLibrary = {
      findOne: (id: string) =>
        id === 'a1' || id === 'b1' || id === 'u1' || id === 'u2' || id === 'u3'
          ? {
              id,
              name: id,
              movementPatterns: ['Push'],
              primaryMuscleGroup: 'Chest',
            }
          : undefined,
      getCandidatesForGenerator: ({ excludeIds }) => {
        const ex = new Set(excludeIds ?? []);
        return [
          {
            id: 'a1',
            name: 'A',
            movementPatterns: ['Push'],
            primaryMuscleGroup: 'Chest',
          },
          {
            id: 'b1',
            name: 'B',
            movementPatterns: ['Pull'],
            primaryMuscleGroup: 'Back',
          },
          {
            id: 'u1',
            name: 'U1',
            movementPatterns: ['Push'],
            primaryMuscleGroup: 'Shoulders',
          },
          {
            id: 'u2',
            name: 'U2',
            movementPatterns: ['Pull'],
            primaryMuscleGroup: 'Core',
          },
          {
            id: 'u3',
            name: 'U3',
            movementPatterns: ['Push'],
            primaryMuscleGroup: 'Arms',
          },
        ].filter((e) => !ex.has(e.id));
      },
    };
    const sessions: GeneratedSession[] = [
      {
        weekIndex: 0,
        weekday: 'Monday',
        name: 'Upper',
        exercises: [
          { name: 'A', sets: 3, reps: 8, exerciseId: 'a1' },
          { name: 'B', sets: 3, reps: 8, exerciseId: 'b1' },
        ],
      },
    ];

    const { sessions: out, belowMinRepairs } = repairChunkGeneratedSessions({
      sessions,
      specs,
      library,
      equipment: undefined,
      effectiveDetailLevel: 'simple',
    });

    expect(belowMinRepairs).toBe(3);
    expect(out[0]!.exercises).toHaveLength(5);
  });
});
