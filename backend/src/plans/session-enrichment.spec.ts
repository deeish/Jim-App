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

  /**
   * Regression for the Tuesday-Lower capture
   * (`backend/logs/generation-captures/generation-1776722579925-cc734d2b.json`)
   * where a hinge fill-in landed in slot 3 behind two isolations because the
   * pull/squat/hinge balance pass inserted *after* the compound-first sort and
   * no follow-up sort ran. With the post-fill-in re-sort in place, the inserted
   * compound must end up at slot 0 or 1, not buried.
   */
  it('keeps compound first after squat/hinge fill-in even when pre-enrichment is isolation-heavy', async () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Tuesday',
      name: 'Lower',
      exercises: [
        { name: 'Seated Leg Extension', sets: 4, reps: 12, exerciseId: 'iso_quad' },
        { name: 'Standing Calf Raise', sets: 4, reps: 12, exerciseId: 'iso_calf' },
        { name: 'Overhead March', sets: 4, reps: 8, exerciseId: 'core_carry' },
        { name: 'Rotational Sit-Up', sets: 4, reps: 10, exerciseId: 'core_rot1' },
        { name: 'Landmine Rotation', sets: 4, reps: 10, exerciseId: 'core_rot2' },
        { name: '45-Degree Leg Press', sets: 4, reps: 12, exerciseId: 'leg_press' },
      ],
    };

    const hingePick = {
      id: 'conv_dl',
      name: 'Conventional Deadlift',
      prescriptionType: 'reps' as const,
      movementPatterns: ['Hinge'],
      primaryMuscleGroup: 'Legs',
      secondaryMuscleGroups: ['Back', 'Core'],
    };

    const exercisesService = {
      findOne: (id: string) => {
        switch (id) {
          case 'iso_quad':
            return {
              id,
              movementPatterns: [],
              primaryMuscleGroup: 'Legs',
            };
          case 'iso_calf':
            return {
              id,
              movementPatterns: [],
              primaryMuscleGroup: 'Legs',
            };
          case 'core_carry':
            return {
              id,
              movementPatterns: ['Carry'],
              primaryMuscleGroup: 'Core',
            };
          case 'core_rot1':
          case 'core_rot2':
            return {
              id,
              movementPatterns: [],
              primaryMuscleGroup: 'Core',
            };
          case 'leg_press':
            return {
              id,
              movementPatterns: ['Squat'],
              primaryMuscleGroup: 'Legs',
            };
          case 'conv_dl':
            return {
              id,
              movementPatterns: ['Hinge'],
              primaryMuscleGroup: 'Legs',
            };
          default:
            return undefined;
        }
      },
      getCandidatesForGenerator: (opts: { focus?: string }) =>
        opts?.focus === 'lower' ? [hingePick] : [],
    };

    const out = await enrichGeneratedSession(
      session,
      { type: 'strength', title: 'Lower' },
      exercisesService as any,
      [],
      [],
    );

    const ids = out.exercises.map((e) => e.exerciseId);
    expect(ids).toContain('conv_dl');
    expect(ids).toContain('leg_press');
    // Both compounds (Hinge + Squat) must be ahead of all isolations / core movements.
    const compoundsFirst = ids.slice(0, 2).sort();
    expect(compoundsFirst).toEqual(['conv_dl', 'leg_press'].sort());
    // Specifically: leg extension and the rotational core moves must NOT be in slot 0.
    expect(ids[0]).not.toBe('iso_quad');
    expect(ids[0]).not.toBe('core_rot1');
    expect(ids[0]).not.toBe('core_rot2');
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

  /**
   * Phase 5 — slot-1 anchor swap. The deterministic post-pass replaces a
   * non-anchor opener (e.g. landmine_press) with a curated staple compound
   * (flat_barbell_bench_press) when one is available in the candidate pool
   * and shares a movement pattern.
   */
  it('swaps a non-anchor slot 1 (landmine_press) for a curated anchor on Upper', async () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Upper',
      exercises: [
        { name: 'Landmine Press', sets: 4, reps: 8, exerciseId: 'landmine_press' },
        { name: 'Lat Pulldown', sets: 3, reps: 10, exerciseId: 'lat_pulldown_wide' },
        { name: 'Curl', sets: 3, reps: 12, exerciseId: 'curl' },
        { name: 'Pushdown', sets: 3, reps: 12, exerciseId: 'pushdown' },
      ],
    };
    const exercisesService = {
      findOne: (id: string) => {
        if (id === 'landmine_press') {
          return {
            id,
            name: 'Landmine Press',
            movementPatterns: ['Push'],
            primaryMuscleGroup: 'Shoulders',
            secondaryMuscleGroups: [],
          };
        }
        if (id === 'lat_pulldown_wide') {
          return {
            id,
            name: 'Lat Pulldown',
            movementPatterns: ['Pull'],
            primaryMuscleGroup: 'Back',
            secondaryMuscleGroups: [],
          };
        }
        if (id === 'flat_barbell_bench_press') {
          return {
            id,
            name: 'Flat Barbell Bench Press',
            movementPatterns: ['Push'],
            primaryMuscleGroup: 'Chest',
            secondaryMuscleGroups: ['Triceps', 'Shoulders'],
          };
        }
        return { id, movementPatterns: [], primaryMuscleGroup: 'Arms', name: id, secondaryMuscleGroups: [] };
      },
      getCandidatesForGenerator: () => [],
    };
    const out = await enrichGeneratedSession(
      session,
      { type: 'strength', title: 'Upper' },
      exercisesService as any,
      [],
      [],
      { goal: 'hypertrophy', durationMinutes: 45, detailLevel: 'detailed' },
    );
    const ids = out.exercises.map((e) => e.exerciseId);
    expect(ids[0]).toBe('flat_barbell_bench_press');
    expect(ids).not.toContain('landmine_press');
    expect(out.reasoning ?? '').toMatch(/staple compound/i);
  });

  it('keeps slot 1 untouched when it is already a curated anchor', async () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Upper',
      exercises: [
        { name: 'Flat Barbell Bench Press', sets: 4, reps: 6, exerciseId: 'flat_barbell_bench_press' },
        { name: 'Lat Pulldown', sets: 3, reps: 10, exerciseId: 'lat_pulldown_wide' },
      ],
    };
    const exercisesService = {
      findOne: (id: string) => ({
        id,
        name: id,
        movementPatterns: id === 'flat_barbell_bench_press' ? ['Push'] : ['Pull'],
        primaryMuscleGroup: id === 'flat_barbell_bench_press' ? 'Chest' : 'Back',
        secondaryMuscleGroups: [],
      }),
      getCandidatesForGenerator: () => [],
    };
    const out = await enrichGeneratedSession(
      session,
      { type: 'strength', title: 'Upper' },
      exercisesService as any,
      [],
      [],
      { goal: 'hypertrophy', durationMinutes: 45, detailLevel: 'detailed' },
    );
    expect(out.exercises[0]?.exerciseId).toBe('flat_barbell_bench_press');
  });

  it('skips the swap when no candidate anchor shares a movement pattern with slot 1', async () => {
    // Slot 1 is a Pull move; there is no Pull-pattern anchor available because
    // every candidate the helper inspects is exclude-listed via the chunk set.
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Lower',
      exercises: [
        { name: 'Cable Crunch', sets: 3, reps: 12, exerciseId: 'cable_crunch' },
        { name: 'Calf Raise', sets: 3, reps: 15, exerciseId: 'standing_calf_raise_machine' },
      ],
    };
    const exercisesService = {
      findOne: (id: string) => {
        if (id === 'cable_crunch') {
          return {
            id,
            name: 'Cable Crunch',
            // No tracked movement pattern — defeats the overlap check.
            movementPatterns: [],
            primaryMuscleGroup: 'Core',
            secondaryMuscleGroups: [],
          };
        }
        return { id, name: id, movementPatterns: [], primaryMuscleGroup: 'Legs', secondaryMuscleGroups: [] };
      },
      getCandidatesForGenerator: () => [],
    };
    const out = await enrichGeneratedSession(
      session,
      { type: 'strength', title: 'Lower' },
      exercisesService as any,
      [],
      [],
      // Every Lower anchor pre-loaded into the chunk-exclude set so the helper
      // exhausts its candidate list and bails out.
      {
        goal: 'hypertrophy',
        durationMinutes: 45,
        detailLevel: 'detailed',
        chunkExcludeExerciseIds: [
          'back_squat',
          'front_squat',
          'forty_five_degree_leg_press',
          'conventional_deadlift',
          'sumo_deadlift',
          'lying_leg_curl',
          'seated_leg_extension',
          'standing_calf_raise_machine',
        ],
      },
    );
    expect(out.exercises[0]?.exerciseId).toBe('cable_crunch');
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

  it('stamps the cardio finisher row as time-based with reps=600 (10 min)', async () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Upper',
      exercises: [
        { name: 'Bench', sets: 3, reps: 8, exerciseId: 'a_bp' },
        { name: 'Row', sets: 3, reps: 8, exerciseId: 'a_row' },
      ],
    };
    const exercisesService = {
      findOne: (exId: string) => {
        if (exId === 'a_bp')
          return {
            id: 'a_bp',
            name: 'Bench',
            movementPatterns: ['Push'],
            primaryMuscleGroup: 'Chest',
          };
        if (exId === 'a_row')
          return {
            id: 'a_row',
            name: 'Row',
            movementPatterns: ['Pull'],
            primaryMuscleGroup: 'Back',
          };
        if (exId === 'tread_no_pt')
          return {
            id: 'tread_no_pt',
            name: 'Treadmill Walk',
            primaryMuscleGroup: 'Cardio',
            // No `prescriptionType` on the library row — the finisher append
            // should still force `time` because primaryMuscleGroup is Cardio.
          };
        return undefined;
      },
      getCandidatesForGenerator: (opts: { focus?: string }) =>
        opts?.focus === 'cardio'
          ? [
              {
                id: 'tread_no_pt',
                name: 'Treadmill Walk',
                primaryMuscleGroup: 'Cardio',
              },
            ]
          : [],
    };

    const out = await enrichGeneratedSessionsInChunkOrder([session], {
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

    const last = out[0]!.exercises[out[0]!.exercises.length - 1]!;
    expect(last.exerciseId).toBe('tread_no_pt');
    expect(last.prescriptionType).toBe('time');
    expect(last.reps).toBe(600);
    expect(last.sets).toBe(1);
  });

  it('stamps restSeconds on each strength row from the goal+difficulty scheme (anchor +30s)', async () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Upper',
      exercises: [
        { name: 'Bench', sets: 4, reps: 6, exerciseId: 'a_bp' },
        { name: 'Row', sets: 3, reps: 8, exerciseId: 'a_row' },
        { name: 'Curl', sets: 3, reps: 12, exerciseId: 'a_curl' },
      ],
    };
    const exercisesService = {
      findOne: (exId: string) => ({
        id: exId,
        name: exId,
        movementPatterns: exId === 'a_bp' ? ['Push'] : ['Pull'],
        primaryMuscleGroup:
          exId === 'a_bp' ? 'Chest' : exId === 'a_row' ? 'Back' : 'Biceps',
      }),
      getCandidatesForGenerator: () => [],
    };

    const out = await enrichGeneratedSessionsInChunkOrder([session], {
      getSpec: () => ({ type: 'strength', title: 'Upper' }),
      getAvoidPhrases: () => [],
      getGenerationPrefs: () => ({
        goal: 'strength',
        difficulty: 'intermediate',
        durationMinutes: 45,
        detailLevel: 'simple',
      }),
      exercisesService: exercisesService as any,
      equipment: ['Barbell'],
    });

    // strength + intermediate → 120s base rest. Anchor (slot 1) gets +30s.
    const rows = out[0]!.exercises;
    expect(rows[0]!.restSeconds).toBe(150);
    expect(rows[1]!.restSeconds).toBe(120);
    expect(rows[2]!.restSeconds).toBe(120);
  });

  it('does not stamp restSeconds on the cardio finisher row', async () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Upper',
      exercises: [
        { name: 'Bench', sets: 3, reps: 8, exerciseId: 'a_bp' },
        { name: 'Row', sets: 3, reps: 8, exerciseId: 'a_row' },
      ],
    };
    const exercisesService = {
      findOne: (exId: string) => {
        if (exId === 'a_bp')
          return {
            id: 'a_bp',
            name: 'Bench',
            movementPatterns: ['Push'],
            primaryMuscleGroup: 'Chest',
          };
        if (exId === 'a_row')
          return {
            id: 'a_row',
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
        return undefined;
      },
      getCandidatesForGenerator: (opts: { focus?: string }) =>
        opts?.focus === 'cardio'
          ? [
              {
                id: 'tread1',
                name: 'Treadmill Walk Easy',
                primaryMuscleGroup: 'Cardio',
                prescriptionType: 'time',
              },
            ]
          : [],
    };

    const out = await enrichGeneratedSessionsInChunkOrder([session], {
      getSpec: () => ({ type: 'strength', title: 'Upper' }),
      getAvoidPhrases: () => [],
      getGenerationPrefs: () => ({
        goal: 'hybrid',
        difficulty: 'intermediate',
        durationMinutes: 45,
        detailLevel: 'simple',
      }),
      exercisesService: exercisesService as any,
      equipment: ['Machine'],
    });

    const rows = out[0]!.exercises;
    const cardio = rows[rows.length - 1]!;
    expect(cardio.exerciseId).toBe('tread1');
    expect(cardio.restSeconds).toBeUndefined();
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
