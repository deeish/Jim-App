import {
  enrichGeneratedSession,
  enrichGeneratedSessionsInChunkOrder,
  inferMainLiftName,
  sessionTitleIsUpperEmphasis,
  sessionTitleNeedsSquatHingeBalance,
  shouldAppendHybridCardioFinisher,
  type GeneratedSession,
} from './session-enrichment';

describe('sessionTitleIsUpperEmphasis', () => {
  it('is true for Upper 2 and Push titles', () => {
    expect(sessionTitleIsUpperEmphasis('Upper 2')).toBe(true);
    expect(sessionTitleIsUpperEmphasis('Push')).toBe(true);
  });

  it('is false for legs-only and full body', () => {
    expect(sessionTitleIsUpperEmphasis('Legs')).toBe(false);
    expect(sessionTitleIsUpperEmphasis('Full Body')).toBe(false);
  });
});

describe('inferMainLiftName', () => {
  it('prefers a compound press over fly for warm-up anchor on Upper', () => {
    const main = inferMainLiftName(
      [
        { name: 'Flat Dumbbell Fly', sets: 5, reps: 10, exerciseId: 'fly1' },
        {
          name: 'Incline Barbell Bench Press',
          sets: 4,
          reps: 8,
          exerciseId: 'bench1',
        },
      ],
      {
        sessionTitle: 'Upper',
        findMeta: () => ({ movementPatterns: ['Push'] }),
      },
    );
    expect(main).toMatch(/Bench/i);
  });

  it('deprioritizes sumo deadlift vs upper-body press on Upper', () => {
    const main = inferMainLiftName(
      [
        { name: 'Sumo Deadlift', sets: 4, reps: 5, exerciseId: 'dl1' },
        { name: 'Chest Dip', sets: 4, reps: 8, exerciseId: 'dip1' },
      ],
      {
        sessionTitle: 'Upper 2',
        findMeta: (id) =>
          id === 'dl1'
            ? { movementPatterns: ['Hinge', 'Pull'] }
            : { movementPatterns: ['Push'] },
      },
    );
    expect(main).toMatch(/Dip/i);
  });
});

describe('sessionTitleNeedsSquatHingeBalance', () => {
  it('is true for legs or lower strength titles', () => {
    expect(sessionTitleNeedsSquatHingeBalance('Legs', 'strength')).toBe(true);
    expect(sessionTitleNeedsSquatHingeBalance('Lower', 'strength')).toBe(true);
    expect(sessionTitleNeedsSquatHingeBalance('Leg day', 'strength')).toBe(
      true,
    );
  });

  it('is false for upper-only days and non-strength', () => {
    expect(sessionTitleNeedsSquatHingeBalance('Upper', 'strength')).toBe(
      false,
    );
    expect(sessionTitleNeedsSquatHingeBalance('Push', 'strength')).toBe(false);
    expect(sessionTitleNeedsSquatHingeBalance('Legs', 'cardio')).toBe(false);
  });
});

describe('enrichGeneratedSession prescriptionType', () => {
  it('uses library prescriptionType when exerciseId resolves', async () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Upper Strength',
      exercises: [
        { name: 'Custom Bracing Drill', sets: 3, reps: 10, exerciseId: 'hold_1' },
      ],
    };

    const exercisesService = {
      findOne: (id: string) => {
        if (id === 'hold_1') {
          return {
            id: 'hold_1',
            name: 'Custom Bracing Drill',
            prescriptionType: 'time' as const,
            movementPatterns: ['Push'],
            primaryMuscleGroup: 'Core',
          };
        }
        return undefined;
      },
      getCandidatesForGenerator: () => [],
    };

    const out = await enrichGeneratedSession(
      session,
      { type: 'strength', title: 'Upper' },
      exercisesService as any,
      [],
      [],
    );

    expect(out.exercises[0]?.prescriptionType).toBe('time');
  });

  it('falls back to name inference when exerciseId is missing', async () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Grip Strength',
      exercises: [{ name: 'Dead Hang', sets: 4, reps: 30 }],
    };

    const exercisesService = {
      findOne: () => undefined,
      getCandidatesForGenerator: () => [],
    };

    const out = await enrichGeneratedSession(
      session,
      { type: 'strength', title: 'Upper Pull' },
      exercisesService as any,
      [],
      [],
    );

    expect(out.exercises[0]?.prescriptionType).toBe('time');
  });

  it('orders main compounds before small-pattern accessories when library tiers differ', async () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Push',
      exercises: [
        { name: 'Later accessory', sets: 3, reps: 12, exerciseId: 'acc1' },
        { name: 'Main press', sets: 4, reps: 8, exerciseId: 'cmp1' },
      ],
    };

    const exercisesService = {
      findOne: (id: string) => {
        if (id === 'acc1')
          return {
            id: 'acc1',
            name: 'Later accessory',
            prescriptionType: 'reps' as const,
            movementPatterns: ['Lunge'],
            primaryMuscleGroup: 'Arms',
          };
        if (id === 'cmp1')
          return {
            id: 'cmp1',
            name: 'Main press',
            prescriptionType: 'reps' as const,
            movementPatterns: ['Push'],
            primaryMuscleGroup: 'Chest',
          };
        return undefined;
      },
      getCandidatesForGenerator: () => [],
    };

    const out = await enrichGeneratedSession(
      session,
      { type: 'strength', title: 'Push' },
      exercisesService as any,
      [],
      [],
    );

    expect(out.exercises[0]?.exerciseId).toBe('cmp1');
    expect(out.exercises[1]?.exerciseId).toBe('acc1');
  });

  it('orders horizontal press before fly on Upper when both map as Push', async () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Upper',
      exercises: [
        { name: 'Flat Dumbbell Fly', sets: 5, reps: 10, exerciseId: 'fly1' },
        { name: 'Barbell Bench Press', sets: 4, reps: 8, exerciseId: 'bp1' },
      ],
    };

    const exercisesService = {
      findOne: (id: string) => {
        if (id === 'fly1')
          return {
            id: 'fly1',
            name: 'Flat Dumbbell Fly',
            prescriptionType: 'reps' as const,
            movementPatterns: ['Push'],
            primaryMuscleGroup: 'Chest',
          };
        if (id === 'bp1')
          return {
            id: 'bp1',
            name: 'Barbell Bench Press',
            prescriptionType: 'reps' as const,
            movementPatterns: ['Push'],
            primaryMuscleGroup: 'Chest',
          };
        return undefined;
      },
      getCandidatesForGenerator: () => [],
    };

    const out = await enrichGeneratedSession(
      session,
      { type: 'strength', title: 'Upper' },
      exercisesService as any,
      [],
      [],
    );

    expect(out.exercises[0]?.exerciseId).toBe('bp1');
    expect(out.exercises[1]?.exerciseId).toBe('fly1');
  });

  it('injects squat and hinge from lower pool when metadata coverage is strong but patterns miss', async () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Legs',
      reasoning: 'Quad focus today.',
      exercises: [
        { name: 'Leg ext', sets: 3, reps: 15, exerciseId: 'iso1' },
        { name: 'Leg curl', sets: 3, reps: 12, exerciseId: 'iso2' },
      ],
    };

    const squatPick = {
      id: 'sq1',
      name: 'Goblet squat',
      prescriptionType: 'reps' as const,
      movementPatterns: ['Squat'],
      primaryMuscleGroup: 'Legs',
      secondaryMuscleGroups: [],
    };
    const hingePick = {
      id: 'hg1',
      name: 'Romanian deadlift',
      prescriptionType: 'reps' as const,
      movementPatterns: ['Hinge'],
      primaryMuscleGroup: 'Legs',
      secondaryMuscleGroups: [],
    };

    const exercisesService = {
      findOne: (id: string) => {
        if (id === 'iso1')
          return {
            id: 'iso1',
            movementPatterns: ['Lunge'],
            primaryMuscleGroup: 'Legs',
          };
        if (id === 'iso2')
          return {
            id: 'iso2',
            movementPatterns: ['Lunge'],
            primaryMuscleGroup: 'Legs',
          };
        return undefined;
      },
      getCandidatesForGenerator: () => [squatPick, hingePick],
    };

    const out = await enrichGeneratedSession(
      session,
      { type: 'strength', title: 'Legs' },
      exercisesService as any,
      [],
      [],
    );

    const ids = out.exercises.map((e) => e.exerciseId);
    expect(ids).toContain('sq1');
    expect(ids).toContain('hg1');
    expect(ids[0]).toBe('sq1');
    expect(ids[1]).toBe('hg1');
    expect(out.reasoning).toContain('Note:');
    expect(out.reasoning?.toLowerCase()).toMatch(/squat|knee/);
    expect(out.reasoning?.toLowerCase()).toMatch(/hinge|hip/);
  });

  it('appends a library cardio row last for hybrid goal when no finisher or cardio exercise exists', async () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Upper',
      exercises: [
        { name: 'Bench', sets: 3, reps: 8, exerciseId: 'bp1' },
        { name: 'Row', sets: 3, reps: 8, exerciseId: 'row1' },
      ],
    };
    const exercisesService = {
      findOne: (id: string) => {
        if (id === 'bp1')
          return {
            id: 'bp1',
            name: 'Bench',
            movementPatterns: ['Push'],
            primaryMuscleGroup: 'Chest',
          };
        if (id === 'row1')
          return {
            id: 'row1',
            name: 'Row',
            movementPatterns: ['Pull'],
            primaryMuscleGroup: 'Back',
          };
        if (id === 'tread1')
          return {
            id: 'tread1',
            name: 'Treadmill Jog Steady',
            movementPatterns: [],
            primaryMuscleGroup: 'Cardio',
            prescriptionType: 'time' as const,
          };
        return undefined;
      },
      getCandidatesForGenerator: (opts: { focus?: string }) =>
        opts?.focus === 'cardio'
          ? [
              {
                id: 'tread1',
                name: 'Treadmill Jog Steady',
                primaryMuscleGroup: 'Cardio',
                prescriptionType: 'time',
              },
            ]
          : [],
    };

    const out = await enrichGeneratedSession(
      session,
      { type: 'strength', title: 'Upper' },
      exercisesService as any,
      ['Machine'],
      [],
      {
        goal: 'hybrid',
        cardioModalities: ['run'],
        durationMinutes: 45,
        detailLevel: 'simple',
      },
    );

    expect(out.exercises[out.exercises.length - 1]?.exerciseId).toBe('tread1');
    expect(out.reasoning?.toLowerCase()).toMatch(/finisher|machine/);
  });

  it('hybrid finisher avoids chunkExcludeExerciseIds when picking library cardio', async () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Tuesday',
      name: 'Lower',
      exercises: [
        { name: 'Squat', sets: 3, reps: 5, exerciseId: 'sq1' },
      ],
    };
    const exercisesService = {
      findOne: (id: string) => {
        if (id === 'sq1')
          return {
            id: 'sq1',
            name: 'Squat',
            movementPatterns: ['Squat'],
            primaryMuscleGroup: 'Legs',
          };
        if (id === 'tread1')
          return {
            id: 'tread1',
            name: 'Treadmill Walk Easy',
            movementPatterns: [],
            primaryMuscleGroup: 'Cardio',
            prescriptionType: 'time' as const,
          };
        if (id === 'bike1')
          return {
            id: 'bike1',
            name: 'Stationary Bike Easy',
            movementPatterns: [],
            primaryMuscleGroup: 'Cardio',
            prescriptionType: 'time' as const,
          };
        return undefined;
      },
      getCandidatesForGenerator: (opts: {
        focus?: string;
        excludeIds?: string[];
      }) => {
        if (opts?.focus !== 'cardio') return [];
        const all = [
          {
            id: 'tread1',
            name: 'Treadmill Walk Easy',
            primaryMuscleGroup: 'Cardio',
            prescriptionType: 'time',
          },
          {
            id: 'bike1',
            name: 'Stationary Bike Easy',
            primaryMuscleGroup: 'Cardio',
            prescriptionType: 'time',
          },
        ];
        const ex = new Set(
          (opts.excludeIds ?? []).map((x) => String(x).trim()),
        );
        return all.filter((c) => !ex.has(c.id));
      },
    };

    const out = await enrichGeneratedSession(
      session,
      { type: 'strength', title: 'Legs' },
      exercisesService as any,
      ['Machine'],
      [],
      {
        goal: 'hybrid',
        durationMinutes: 45,
        detailLevel: 'simple',
        chunkExcludeExerciseIds: ['tread1'],
      },
    );

    const ids = out.exercises.map((e) => e.exerciseId);
    expect(ids).toContain('bike1');
    expect(ids).not.toContain('tread1');
  });

  it('does not append hybrid cardio when session is short', async () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Upper',
      exercises: [
        { name: 'Bench', sets: 3, reps: 8, exerciseId: 'bp1' },
        { name: 'Row', sets: 3, reps: 8, exerciseId: 'row1' },
      ],
    };
    const exercisesService = {
      findOne: (id: string) =>
        id === 'bp1' || id === 'row1'
          ? {
              id,
              movementPatterns: ['Push'],
              primaryMuscleGroup: 'Chest',
            }
          : undefined,
      getCandidatesForGenerator: (opts: { focus?: string }) =>
        opts?.focus === 'cardio'
          ? [
              {
                id: 'tread1',
                name: 'Treadmill Jog Steady',
                primaryMuscleGroup: 'Cardio',
              },
            ]
          : [],
    };

    const out = await enrichGeneratedSession(
      session,
      { type: 'strength', title: 'Upper' },
      exercisesService as any,
      [],
      [],
      {
        goal: 'hybrid',
        durationMinutes: 32,
        detailLevel: 'simple',
      },
    );

    expect(out.exercises.map((e) => e.exerciseId)).not.toContain('tread1');
  });

  it('trims to soft cap without hybrid finisher when goal is not strength+conditioning', async () => {
    const mk = (id: string, n: string) => ({
      name: n,
      sets: 3,
      reps: 8,
      exerciseId: id,
    });
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Chest',
      exercises: [
        mk('e1', 'A'),
        mk('e2', 'B'),
        mk('e3', 'C'),
        mk('e4', 'D'),
        mk('e5', 'E'),
        mk('e6', 'F'),
        mk('e7', 'G'),
        mk('e8', 'H'),
      ],
    };
    const exercisesService = {
      findOne: (id: string) => ({
        id,
        movementPatterns: ['Push'],
        primaryMuscleGroup: 'Chest',
      }),
      getCandidatesForGenerator: (opts: { focus?: string }) =>
        opts?.focus === 'cardio'
          ? [
              {
                id: 'tread1',
                name: 'Treadmill Jog Steady',
                primaryMuscleGroup: 'Cardio',
              },
            ]
          : [],
    };

    const out = await enrichGeneratedSession(
      session,
      { type: 'strength', title: 'Chest' },
      exercisesService as any,
      [],
      [],
      {
        goal: 'hypertrophy',
        durationMinutes: 45,
        detailLevel: 'simple',
      },
    );

    expect(out.exercises).toHaveLength(6);
    expect(out.exercises.map((e) => e.exerciseId)).not.toContain('tread1');
    expect(out.reasoning?.toLowerCase()).toMatch(
      /shortened|target length|lower-priority|main lifts/,
    );
  });

  it('trims excess slots then appends hybrid cardio finisher when over soft cap', async () => {
    const mk = (id: string, n: string) => ({
      name: n,
      sets: 3,
      reps: 8,
      exerciseId: id,
    });
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Chest',
      exercises: [
        mk('e1', 'A'),
        mk('e2', 'B'),
        mk('e3', 'C'),
        mk('e4', 'D'),
        mk('e5', 'E'),
        mk('e6', 'F'),
        mk('e7', 'G'),
        mk('e8', 'H'),
      ],
    };
    const exercisesService = {
      findOne: (id: string) => ({
        id,
        movementPatterns: ['Push'],
        primaryMuscleGroup: 'Chest',
      }),
      getCandidatesForGenerator: (opts: { focus?: string }) =>
        opts?.focus === 'cardio'
          ? [
              {
                id: 'tread1',
                name: 'Treadmill Jog Steady',
                primaryMuscleGroup: 'Cardio',
                prescriptionType: 'time' as const,
              },
            ]
          : [],
    };

    const out = await enrichGeneratedSession(
      session,
      { type: 'strength', title: 'Chest' },
      exercisesService as any,
      ['Machine'],
      [],
      {
        goal: 'hybrid',
        cardioModalities: ['run'],
        durationMinutes: 45,
        detailLevel: 'simple',
      },
    );

    expect(out.exercises).toHaveLength(7);
    expect(out.exercises[out.exercises.length - 1]?.exerciseId).toBe('tread1');
  });

  it('preserves first two compound anchors when trimming to soft cap', async () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Upper',
      exercises: [
        { name: 'Bench', sets: 4, reps: 8, exerciseId: 'bench' },
        { name: 'Row', sets: 4, reps: 8, exerciseId: 'row' },
        { name: 'Fly', sets: 3, reps: 12, exerciseId: 'fly' },
        { name: 'Pushdown', sets: 3, reps: 12, exerciseId: 'pushdown' },
        { name: 'Curl', sets: 3, reps: 12, exerciseId: 'curl' },
        { name: 'Raise', sets: 3, reps: 12, exerciseId: 'raise' },
        { name: 'Extra 1', sets: 3, reps: 12, exerciseId: 'x1' },
        { name: 'Extra 2', sets: 3, reps: 12, exerciseId: 'x2' },
      ],
    };
    const exercisesService = {
      findOne: (id: string) => {
        if (id === 'bench') return { id, movementPatterns: ['Push'], primaryMuscleGroup: 'Chest' };
        if (id === 'row') return { id, movementPatterns: ['Pull'], primaryMuscleGroup: 'Back' };
        return { id, movementPatterns: [], primaryMuscleGroup: 'Arms' };
      },
      getCandidatesForGenerator: () => [],
    };
    const out = await enrichGeneratedSession(
      session,
      { type: 'strength', title: 'Upper' },
      exercisesService as any,
      [],
      [],
      {
        goal: 'hypertrophy',
        durationMinutes: 45,
        detailLevel: 'simple',
      },
    );
    const ids = out.exercises.map((e) => e.exerciseId);
    expect(ids).toContain('bench');
    expect(ids).toContain('row');
    expect(out.exercises).toHaveLength(6);
  });

  it('does not append hybrid cardio when metabolic finisher is already implied', async () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Upper',
      exercises: [
        { name: 'Bench', sets: 3, reps: 8, exerciseId: 'bp1' },
        {
          name: 'Battle Rope Waves',
          sets: 4,
          reps: 30,
          exerciseId: 'br1',
        },
      ],
    };
    const exercisesService = {
      findOne: (id: string) =>
        id === 'bp1'
          ? {
              id: 'bp1',
              movementPatterns: ['Push'],
              primaryMuscleGroup: 'Chest',
            }
          : {
              id: 'br1',
              movementPatterns: ['Pull'],
              primaryMuscleGroup: 'Arms',
            },
      getCandidatesForGenerator: (opts: { focus?: string }) =>
        opts?.focus === 'cardio'
          ? [
              {
                id: 'tread1',
                name: 'Treadmill Jog Steady',
                primaryMuscleGroup: 'Cardio',
              },
            ]
          : [],
    };

    const out = await enrichGeneratedSession(
      session,
      { type: 'strength', title: 'Upper' },
      exercisesService as any,
      [],
      [],
      {
        goal: 'hybrid',
        durationMinutes: 50,
        detailLevel: 'simple',
      },
    );

    expect(out.exercises.map((e) => e.exerciseId)).not.toContain('tread1');
  });
});

describe('enrichGeneratedSessionsInChunkOrder', () => {
  it('assigns distinct hybrid cardio finisher ids across two strength sessions', async () => {
    const mkSession = (suffix: string): GeneratedSession => ({
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Upper',
      exercises: [
        {
          name: 'Bench',
          sets: 3,
          reps: 8,
          exerciseId: `${suffix}_bp`,
        },
        { name: 'Row', sets: 3, reps: 8, exerciseId: `${suffix}_row` },
      ],
    });
    const sessions = [mkSession('a'), mkSession('b')];
    const exercisesService = {
      findOne: (exId: string) => {
        if (exId.endsWith('_bp'))
          return {
            id: exId,
            name: 'Bench',
            movementPatterns: ['Push'],
            primaryMuscleGroup: 'Chest',
          };
        if (exId.endsWith('_row'))
          return {
            id: exId,
            name: 'Row',
            movementPatterns: ['Pull'],
            primaryMuscleGroup: 'Back',
          };
        if (exId === 'tread1')
          return {
            id: 'tread1',
            name: 'Treadmill Walk Easy',
            primaryMuscleGroup: 'Cardio',
            prescriptionType: 'time' as const,
          };
        if (exId === 'bike1')
          return {
            id: 'bike1',
            name: 'Stationary Bike Easy',
            primaryMuscleGroup: 'Cardio',
            prescriptionType: 'time' as const,
          };
        return undefined;
      },
      getCandidatesForGenerator: (opts: {
        focus?: string;
        excludeIds?: string[];
      }) => {
        if (opts?.focus !== 'cardio') return [];
        const all = [
          {
            id: 'tread1',
            name: 'Treadmill Walk Easy',
            primaryMuscleGroup: 'Cardio',
            prescriptionType: 'time',
          },
          {
            id: 'bike1',
            name: 'Stationary Bike Easy',
            primaryMuscleGroup: 'Cardio',
            prescriptionType: 'time',
          },
        ];
        const ex = new Set(
          (opts.excludeIds ?? []).map((x) => String(x).trim()),
        );
        return all.filter((c) => !ex.has(c.id));
      },
    };

    const out = await enrichGeneratedSessionsInChunkOrder(sessions, {
      getSpec: () => ({ type: 'strength', title: 'Upper' }),
      getAvoidPhrases: () => [],
      getGenerationPrefs: () => ({
        goal: 'hybrid',
        durationMinutes: 45,
        detailLevel: 'simple',
      }),
      exercisesService: exercisesService as any,
      equipment: ['Machine'],
    });

    const lastA = out[0]!.exercises[out[0]!.exercises.length - 1]!.exerciseId;
    const lastB = out[1]!.exercises[out[1]!.exercises.length - 1]!.exerciseId;
    expect(lastA).toBe('tread1');
    expect(lastB).toBe('bike1');
  });
});

describe('shouldAppendHybridCardioFinisher', () => {
  it('returns true when a loaded carry is present (not metcon conditioning)', () => {
    expect(
      shouldAppendHybridCardioFinisher({
        exercises: [
          { name: 'Bench', sets: 3, reps: 8, exerciseId: 'b' },
          {
            name: 'Farmer Handle Carry',
            sets: 3,
            reps: 40,
            exerciseId: 'fc',
          },
        ],
        durationMinutes: 45,
        detailLevel: 'simple',
        hasCardioExercise: false,
        hasFinisherText: false,
      }),
    ).toBe(true);
  });

  it('returns true when waiter carry is present', () => {
    expect(
      shouldAppendHybridCardioFinisher({
        exercises: [
          { name: 'Row', sets: 3, reps: 8, exerciseId: 'r' },
          { name: 'Waiter Carry', sets: 3, reps: 30, exerciseId: 'wc' },
        ],
        durationMinutes: 45,
        detailLevel: 'simple',
        hasCardioExercise: false,
        hasFinisherText: false,
      }),
    ).toBe(true);
  });

  it('returns false when farmer walk metcon is present', () => {
    expect(
      shouldAppendHybridCardioFinisher({
        exercises: [
          { name: 'Bench', sets: 3, reps: 8, exerciseId: 'b' },
          {
            name: "Farmer's Walk",
            sets: 4,
            reps: 50,
            exerciseId: 'fw',
          },
        ],
        durationMinutes: 50,
        detailLevel: 'simple',
        hasCardioExercise: false,
        hasFinisherText: false,
      }),
    ).toBe(false);
  });

  it('returns false when duration is under threshold', () => {
    expect(
      shouldAppendHybridCardioFinisher({
        exercises: [{ name: 'Bench', sets: 3, reps: 8, exerciseId: 'b' }],
        durationMinutes: 30,
        detailLevel: 'simple',
        hasCardioExercise: false,
        hasFinisherText: false,
      }),
    ).toBe(false);
  });

  it('returns false when exercise list is longer than cap+1 for duration/detail', () => {
    const exercises = Array.from({ length: 8 }, (_, i) => ({
      name: `E${i}`,
      sets: 3,
      reps: 8,
      exerciseId: `id${i}`,
    }));
    expect(
      shouldAppendHybridCardioFinisher({
        exercises,
        durationMinutes: 45,
        detailLevel: 'simple',
        hasCardioExercise: false,
        hasFinisherText: false,
      }),
    ).toBe(false);
  });

  it('returns true at nominal high end (finisher slot reserved)', () => {
    const exercises = Array.from({ length: 6 }, (_, i) => ({
      name: `E${i}`,
      sets: 3,
      reps: 8,
      exerciseId: `id${i}`,
    }));
    expect(
      shouldAppendHybridCardioFinisher({
        exercises,
        durationMinutes: 45,
        detailLevel: 'simple',
        hasCardioExercise: false,
        hasFinisherText: false,
      }),
    ).toBe(true);
  });

  it('returns true when there is room and duration is normal', () => {
    expect(
      shouldAppendHybridCardioFinisher({
        exercises: [
          { name: 'Bench', sets: 3, reps: 8, exerciseId: 'b' },
          { name: 'Row', sets: 3, reps: 8, exerciseId: 'r' },
        ],
        durationMinutes: 45,
        detailLevel: 'simple',
        hasCardioExercise: false,
        hasFinisherText: false,
      }),
    ).toBe(true);
  });
});
