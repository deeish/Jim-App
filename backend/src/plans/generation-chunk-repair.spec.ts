import type { GenerateSessionsDto } from './dto/generate-sessions.dto';
import type { GeneratedSession } from './session-enrichment';
import {
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
    expect(notes.some((n) => /upper-focus/i.test(n))).toBe(true);
    expect(out[0]!.exercises[0]!.exerciseId).toBe('upper-safe');
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
