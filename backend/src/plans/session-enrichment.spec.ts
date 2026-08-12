import {
  buildStrengthReasoning,
  enrichGeneratedSession,
  enrichGeneratedSessionsInChunkOrder,
  humanizeExerciseIdsInCopy,
  inferMainLiftName,
  sessionTitleIsLowerEmphasis,
  sessionTitleIsUpperEmphasis,
  sessionTitleNeedsSquatHingeBalance,
  shouldAppendHybridCardioFinisher,
  workingSetCap,
  type GeneratedSession,
} from './session-enrichment';

describe('cardio-day template routing', () => {
  it('replaces cardio-day LLM rows with the deterministic template', async () => {
    const exercisesService = {
      findOne: (id: string) =>
        id === 'treadmill_jog_steady'
          ? {
              id,
              name: 'Treadmill Jog (Steady State)',
              primaryMuscleGroup: 'Cardio',
            }
          : undefined,
      getCandidatesForGenerator: () => [],
    };
    const out = await enrichGeneratedSession(
      {
        weekIndex: 1,
        weekday: 'Wednesday',
        name: 'Cardio',
        exercises: [
          { name: 'Trail Hiking (Brisk)', sets: 2, reps: 15, exerciseId: 'x' },
        ],
      },
      { type: 'cardio', title: 'Cardio' },
      exercisesService as any,
      undefined,
      [],
      { cardioModalities: ['run'], durationMinutes: 25, cardioDayIndex: 0 },
    );
    expect(out.exercises[0]?.exerciseId).toBe('treadmill_jog_steady');
    expect(out.exercises[0]?.prescriptionType).toBe('time');
    expect(out.warmUp).toBeTruthy();
    expect(out.coolDown).toBeTruthy();
  });
});

describe('strength-day cardio finisher conformance', () => {
  const compound = {
    id: 'bench',
    name: 'Barbell Bench Press',
    prescriptionType: 'reps' as const,
    movementPatterns: ['Push'],
    primaryMuscleGroup: 'Chest',
  };
  const rower = {
    id: 'rowing_machine_steady',
    name: 'Rowing Machine (Steady State)',
    prescriptionType: 'time' as const,
    primaryMuscleGroup: 'Cardio',
  };
  const treadmill = {
    id: 'treadmill_jog_steady',
    name: 'Treadmill Jog (Steady State)',
    prescriptionType: 'time' as const,
    primaryMuscleGroup: 'Cardio',
  };
  const byId = new Map<
    string,
    { id: string; name: string; primaryMuscleGroup: string }
  >([
    [compound.id, compound],
    [rower.id, rower],
    [treadmill.id, treadmill],
  ]);
  const exercisesService = {
    findOne: (id: string) => byId.get(id),
    getCandidatesForGenerator: ({ excludeIds }: { excludeIds?: string[] }) => {
      const ex = new Set(excludeIds ?? []);
      return [...byId.values()].filter((r) => !ex.has(r.id));
    },
  };

  it('keeps only one cardio row and prefers the modality match', async () => {
    const out = await enrichGeneratedSession(
      {
        weekIndex: 1,
        weekday: 'Monday',
        name: 'Upper',
        exercises: [
          { name: compound.name, sets: 4, reps: 6, exerciseId: compound.id },
          { name: rower.name, sets: 1, reps: 600, exerciseId: rower.id },
          {
            name: treadmill.name,
            sets: 1,
            reps: 600,
            exerciseId: treadmill.id,
          },
        ],
      },
      { type: 'strength', title: 'Upper' },
      exercisesService as any,
      undefined,
      [],
      { goal: 'hybrid', cardioModalities: ['run'], durationMinutes: 45 },
    );
    const cardioRows = out.exercises.filter(
      (e) => e.primaryMuscleGroup === 'Cardio',
    );
    expect(cardioRows).toHaveLength(1);
    expect(cardioRows[0]!.exerciseId).toBe('treadmill_jog_steady');
  });

  it('swaps an off-modality finisher to the preferred modality', async () => {
    const out = await enrichGeneratedSession(
      {
        weekIndex: 1,
        weekday: 'Monday',
        name: 'Upper',
        exercises: [
          { name: compound.name, sets: 4, reps: 6, exerciseId: compound.id },
          { name: rower.name, sets: 1, reps: 600, exerciseId: rower.id },
        ],
      },
      { type: 'strength', title: 'Upper' },
      exercisesService as any,
      undefined,
      [],
      { goal: 'hybrid', cardioModalities: ['run'], durationMinutes: 45 },
    );
    const cardioRows = out.exercises.filter(
      (e) => e.primaryMuscleGroup === 'Cardio',
    );
    expect(cardioRows).toHaveLength(1);
    expect(cardioRows[0]!.exerciseId).toBe('treadmill_jog_steady');
    expect(cardioRows[0]!.prescriptionType).toBe('time');
  });

  it('leaves a modality-matching single finisher untouched', async () => {
    const out = await enrichGeneratedSession(
      {
        weekIndex: 1,
        weekday: 'Monday',
        name: 'Upper',
        exercises: [
          { name: compound.name, sets: 4, reps: 6, exerciseId: compound.id },
          {
            name: treadmill.name,
            sets: 1,
            reps: 600,
            exerciseId: treadmill.id,
          },
        ],
      },
      { type: 'strength', title: 'Upper' },
      exercisesService as any,
      undefined,
      [],
      { goal: 'hybrid', cardioModalities: ['run'], durationMinutes: 45 },
    );
    const cardioRows = out.exercises.filter(
      (e) => e.primaryMuscleGroup === 'Cardio',
    );
    expect(cardioRows).toHaveLength(1);
    expect(cardioRows[0]!.exerciseId).toBe('treadmill_jog_steady');
  });
});

describe('buildStrengthReasoning', () => {
  const meta = new Map([
    ['fs', { primaryMuscleGroup: 'Legs' }],
    ['rdl', { primaryMuscleGroup: 'Legs' }],
    ['row', { primaryMuscleGroup: 'Back' }],
    ['jog', { primaryMuscleGroup: 'Cardio' }],
  ]);
  const findMeta = (id: string) => meta.get(id);

  it('describes the final list: opener, supporting count, muscles, cardio close', () => {
    const text = buildStrengthReasoning(
      [
        { name: 'Front Squat', sets: 4, reps: 5, exerciseId: 'fs' },
        { name: 'Romanian Deadlift', sets: 3, reps: 8, exerciseId: 'rdl' },
        {
          name: 'Single-Arm Dumbbell Row',
          sets: 3,
          reps: 10,
          exerciseId: 'row',
        },
        { name: 'Treadmill Jog', sets: 1, reps: 600, exerciseId: 'jog' },
      ],
      findMeta,
    );
    expect(text).toMatch(/^Front Squat leads the session/);
    expect(text).toMatch(/2 supporting moves/);
    expect(text).toMatch(/legs and back/);
    expect(text).toMatch(/cardio block closes the day/);
  });

  it('returns undefined when there are no strength rows to describe', () => {
    expect(
      buildStrengthReasoning(
        [{ name: 'Treadmill Jog', sets: 1, reps: 600, exerciseId: 'jog' }],
        findMeta,
      ),
    ).toBeUndefined();
  });
});

describe('post-LLM equipment gate', () => {
  const mkService = (rows: Array<Record<string, unknown>>) => {
    const byId = new Map(rows.map((r) => [r.id as string, r]));
    return {
      findOne: (id: string) => byId.get(id),
      getCandidatesForGenerator: ({
        excludeIds,
      }: {
        excludeIds?: string[];
      }) => {
        const ex = new Set(excludeIds ?? []);
        return rows.filter((r) => !ex.has(r.id as string));
      },
    } as any;
  };
  const dbRow = {
    id: 'single_arm_dumbbell_row',
    name: 'Single-Arm Dumbbell Row',
    primaryMuscleGroup: 'Back',
    movementPatterns: ['Pull'],
    primaryEquipment: ['Dumbbell'],
    prescriptionType: 'reps' as const,
  };
  const dbBench = {
    id: 'flat_dumbbell_bench_press',
    name: 'Flat Dumbbell Bench Press',
    primaryMuscleGroup: 'Chest',
    movementPatterns: ['Push'],
    primaryEquipment: ['Dumbbell'],
    prescriptionType: 'reps' as const,
  };
  const cablePushdown = {
    id: 'cable_pushdown',
    name: 'Cable Pushdown',
    primaryMuscleGroup: 'Arms',
    movementPatterns: ['Push'],
    primaryEquipment: ['Cable'],
    prescriptionType: 'reps' as const,
  };
  const bandPushdown = {
    id: 'band_pushdown',
    name: 'Band Pushdown',
    primaryMuscleGroup: 'Arms',
    movementPatterns: ['Push'],
    primaryEquipment: ['Resistance Band'],
    prescriptionType: 'reps' as const,
  };
  const pinchCarry = {
    id: 'pinch_block_carry',
    name: 'Pinch Block Carry',
    primaryMuscleGroup: 'Arms',
    movementPatterns: ['Carry'],
    primaryEquipment: ['Unmodeled'],
    prescriptionType: 'time' as const,
  };
  const homeEquipment = ['Dumbbell', 'Resistance Band', 'Bodyweight'];
  const rowOf = (r: { id: string; name: string }, sets = 3, reps = 10) => ({
    name: r.name,
    sets,
    reps,
    exerciseId: r.id,
  });

  it('swaps a row needing unavailable equipment for a same-pattern candidate', async () => {
    const out = await enrichGeneratedSession(
      {
        weekIndex: 1,
        weekday: 'Monday',
        name: 'Upper',
        exercises: [rowOf(dbRow, 4, 6), rowOf(dbBench), rowOf(cablePushdown)],
      },
      { type: 'strength', title: 'Upper' },
      mkService([dbRow, dbBench, cablePushdown, bandPushdown]),
      homeEquipment,
      [],
      {},
    );
    const ids = out.exercises.map((e) => e.exerciseId);
    expect(ids).not.toContain('cable_pushdown');
    expect(ids).toContain('band_pushdown');
    const swapped = out.exercises.find(
      (e) => e.exerciseId === 'band_pushdown',
    )!;
    expect(swapped.notes).toMatch(/equipment you have available/i);
    expect(out.reasoning).toMatch(/equipment you have available/i);
  });

  it('drops an unmodeled-gear row when no candidate fits and enough lifts remain', async () => {
    const out = await enrichGeneratedSession(
      {
        weekIndex: 1,
        weekday: 'Monday',
        name: 'Upper',
        exercises: [
          rowOf(dbRow, 4, 6),
          rowOf(dbBench),
          rowOf(bandPushdown),
          rowOf(pinchCarry),
        ],
      },
      { type: 'strength', title: 'Upper' },
      mkService([dbRow, dbBench, bandPushdown, pinchCarry]),
      homeEquipment,
      [],
      {},
    );
    const ids = out.exercises.map((e) => e.exerciseId);
    expect(ids).not.toContain('pinch_block_carry');
  });

  it('keeps an offending row rather than hollow out a short session', async () => {
    const out = await enrichGeneratedSession(
      {
        weekIndex: 1,
        weekday: 'Monday',
        name: 'Upper',
        exercises: [rowOf(dbRow, 4, 6), rowOf(pinchCarry)],
      },
      { type: 'strength', title: 'Upper' },
      mkService([dbRow, pinchCarry]),
      homeEquipment,
      [],
      {},
    );
    const ids = out.exercises.map((e) => e.exerciseId);
    expect(ids).toContain('pinch_block_carry');
  });

  it('replaces garbled model reasoning with list-grounded copy', async () => {
    const out = await enrichGeneratedSession(
      {
        weekIndex: 1,
        weekday: 'Monday',
        name: 'Upper',
        reasoning:
          'The arnold press is replaced with a different vertical press, the waiter carry is not a press so we use the Farmer Handle Carry is not a press either.',
        exercises: [rowOf(dbRow, 4, 6), rowOf(dbBench)],
      },
      { type: 'strength', title: 'Upper' },
      mkService([dbRow, dbBench]),
      homeEquipment,
      [],
      {},
    );
    expect(out.reasoning).not.toMatch(/arnold press|waiter carry/i);
    expect(out.reasoning).toMatch(/leads the session while you are freshest/);
  });

  it('is inert without an equipment list (eval mocks, legacy calls)', async () => {
    const out = await enrichGeneratedSession(
      {
        weekIndex: 1,
        weekday: 'Monday',
        name: 'Upper',
        exercises: [rowOf(dbRow, 4, 6), rowOf(cablePushdown)],
      },
      { type: 'strength', title: 'Upper' },
      mkService([dbRow, cablePushdown]),
      undefined,
      [],
      {},
    );
    const ids = out.exercises.map((e) => e.exerciseId);
    expect(ids).toContain('cable_pushdown');
  });
});

describe('workingSetCap', () => {
  it('caps by experience when the session is long enough to fit it', () => {
    expect(
      workingSetCap({
        difficulty: 'advanced',
        goal: 'hybrid',
        durationMinutes: 90,
      }),
    ).toBe(22);
  });

  it('caps by duration for a short/medium session', () => {
    // 45-min advanced strength (~150s rest) fits ~15 working sets, not 22.
    expect(
      workingSetCap({
        difficulty: 'advanced',
        goal: 'strength',
        durationMinutes: 45,
      }),
    ).toBe(15);
    // Shorter hybrid rest fits more in the same 45 minutes.
    expect(
      workingSetCap({
        difficulty: 'advanced',
        goal: 'hybrid',
        durationMinutes: 45,
      }),
    ).toBe(19);
  });

  it('falls back to the experience cap when duration is unknown', () => {
    expect(workingSetCap({ difficulty: 'beginner' })).toBe(14);
    expect(workingSetCap(undefined)).toBe(18);
  });
});

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

describe('sessionTitleIsLowerEmphasis', () => {
  it('is true for Lower, Lower 2, Legs and Leg Day titles', () => {
    expect(sessionTitleIsLowerEmphasis('Lower')).toBe(true);
    expect(sessionTitleIsLowerEmphasis('Lower 2')).toBe(true);
    expect(sessionTitleIsLowerEmphasis('Legs')).toBe(true);
    expect(sessionTitleIsLowerEmphasis('Leg Day')).toBe(true);
  });

  it('is false for upper, push/pull, full body and cardio', () => {
    expect(sessionTitleIsLowerEmphasis('Upper')).toBe(false);
    expect(sessionTitleIsLowerEmphasis('Push')).toBe(false);
    expect(sessionTitleIsLowerEmphasis('Pull')).toBe(false);
    expect(sessionTitleIsLowerEmphasis('Full Body')).toBe(false);
    expect(sessionTitleIsLowerEmphasis('Cardio')).toBe(false);
  });

  it('is mutually exclusive with upper emphasis on Upper/Lower titles', () => {
    expect(sessionTitleIsUpperEmphasis('Lower')).toBe(false);
    expect(sessionTitleIsLowerEmphasis('Upper')).toBe(false);
  });
});

describe('inferMainLiftName', () => {
  it('returns the slot-1 exercise after ordering (never out-guesses the opener)', () => {
    const main = inferMainLiftName(
      [
        { name: 'Front Squat', sets: 4, reps: 5, exerciseId: 'fs1' },
        {
          name: 'Axle Bar Deadlift Hold',
          sets: 4,
          reps: 9,
          exerciseId: 'axle1',
          prescriptionType: 'time',
        },
      ],
      {
        findMeta: (id) =>
          id === 'fs1'
            ? { primaryEquipment: ['Barbell'] }
            : { primaryEquipment: ['Axle Bar'] },
      },
    );
    expect(main).toBe('Front Squat');
  });

  it('skips a leading cardio row when locating the main lift', () => {
    const main = inferMainLiftName([
      {
        name: 'Treadmill Jog (Steady State)',
        sets: 1,
        reps: 600,
        prescriptionType: 'time',
        primaryMuscleGroup: 'Cardio',
      },
      { name: 'Barbell Overhead Press', sets: 4, reps: 5, exerciseId: 'ohp1' },
    ]);
    expect(main).toBe('Barbell Overhead Press');
  });

  it('returns null (no ramp line) when the opener is a timed hold or carry', () => {
    const main = inferMainLiftName([
      {
        name: 'Waiter Carry',
        sets: 3,
        reps: 40,
        exerciseId: 'wc1',
        prescriptionType: 'time',
      },
      { name: 'Flat Dumbbell Bench Press', sets: 4, reps: 5 },
    ]);
    expect(main).toBeNull();
  });

  it('returns null when the opener needs no external load (no "working weight" on a push-up)', () => {
    const main = inferMainLiftName(
      [
        {
          name: 'Band-Resisted Close-Grip Push-Up',
          sets: 3,
          reps: 10,
          exerciseId: 'pu1',
        },
      ],
      { findMeta: () => ({ primaryEquipment: [] }) },
    );
    expect(main).toBeNull();
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
    expect(sessionTitleNeedsSquatHingeBalance('Upper', 'strength')).toBe(false);
    expect(sessionTitleNeedsSquatHingeBalance('Push', 'strength')).toBe(false);
    expect(sessionTitleNeedsSquatHingeBalance('Legs', 'cardio')).toBe(false);
  });
});

describe('enrichGeneratedSession cardio row normalization', () => {
  const cardioService = {
    findOne: (id: string) => {
      if (id === 'tm1')
        return {
          id: 'tm1',
          name: 'Treadmill Incline Walk',
          primaryMuscleGroup: 'Cardio',
          movementPatterns: [],
        };
      if (id === 'bench1')
        return {
          id: 'bench1',
          name: 'Bench Press',
          primaryMuscleGroup: 'Chest',
          movementPatterns: ['Push'],
          prescriptionType: 'reps' as const,
        };
      if (id === 'plank1')
        return {
          id: 'plank1',
          name: 'Forearm Plank',
          primaryMuscleGroup: 'Core',
          movementPatterns: [],
          prescriptionType: 'time' as const,
        };
      return undefined;
    },
    getCandidatesForGenerator: () => [],
  };

  it('forces a model-placed cardio row to 1 × 600s (renders "10 min")', async () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Upper',
      exercises: [
        { name: 'Bench Press', sets: 4, reps: 8, exerciseId: 'bench1' },
        {
          name: 'Treadmill Incline Walk',
          sets: 5,
          reps: 11,
          exerciseId: 'tm1',
        },
      ],
    };

    const out = await enrichGeneratedSession(
      session,
      { type: 'strength', title: 'Upper' },
      cardioService as any,
      [],
      [],
    );

    const cardio = out.exercises.find(
      (e) => e.name === 'Treadmill Incline Walk',
    )!;
    expect(cardio.sets).toBe(1);
    expect(cardio.reps).toBe(600);
    expect(cardio.prescriptionType).toBe('time');
    // non-cardio row stays a reps prescription with a stamped range (not turned
    // into a duration). 4 × 8 is the role-aware primary-compound stamp here.
    const bench = out.exercises.find((e) => e.name === 'Bench Press')!;
    expect(bench.prescriptionType).not.toBe('time');
    expect(bench.repsMin).toBeDefined();
    expect(bench.repsMax!).toBeGreaterThanOrEqual(bench.repsMin!);
  });

  it('catches a cardio machine by name when its id does not resolve', async () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Upper',
      exercises: [
        { name: 'Bench Press', sets: 4, reps: 8, exerciseId: 'bench1' },
        { name: 'Assault / Air Bike', sets: 5, reps: 12 },
      ],
    };

    const out = await enrichGeneratedSession(
      session,
      { type: 'strength', title: 'Upper' },
      cardioService as any,
      [],
      [],
    );

    const bike = out.exercises.find((e) => e.name === 'Assault / Air Bike')!;
    expect(bike.sets).toBe(1);
    expect(bike.reps).toBe(600);
    expect(bike.prescriptionType).toBe('time');
  });

  it('clamps a high-volume advanced session to the working-set cap, sparing the anchor and cardio', async () => {
    // 6 strength lifts × 5 sets = 30 working sets; advanced cap is 22.
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Lower',
      exercises: [
        { name: 'Back Squat', sets: 5, reps: 6, exerciseId: 'sq1' },
        { name: 'Romanian Deadlift', sets: 5, reps: 8, exerciseId: 'rdl1' },
        { name: 'Leg Press', sets: 5, reps: 10, exerciseId: 'lp1' },
        { name: 'Walking Lunge', sets: 5, reps: 10, exerciseId: 'lun1' },
        { name: 'Leg Extension', sets: 5, reps: 12, exerciseId: 'ext1' },
        { name: 'Standing Calf Raise', sets: 5, reps: 15, exerciseId: 'calf1' },
        { name: 'Treadmill Jog', sets: 5, reps: 11, exerciseId: 'tm1' },
      ],
    };

    const legService = {
      findOne: (id: string) => {
        if (id === 'tm1')
          return { id, name: 'Treadmill Jog', primaryMuscleGroup: 'Cardio' };
        const names: Record<string, string> = {
          sq1: 'Back Squat',
          rdl1: 'Romanian Deadlift',
          lp1: 'Leg Press',
          lun1: 'Walking Lunge',
          ext1: 'Leg Extension',
          calf1: 'Standing Calf Raise',
        };
        return names[id]
          ? {
              id,
              name: names[id]!,
              primaryMuscleGroup: 'Legs',
              movementPatterns: ['Squat'],
            }
          : undefined;
      },
      getCandidatesForGenerator: () => [],
    };

    const out = await enrichGeneratedSession(
      session,
      { type: 'strength', title: 'Lower' },
      legService as any,
      [],
      [],
      { difficulty: 'advanced', durationMinutes: 70, detailLevel: 'detailed' },
    );

    const strength = out.exercises.filter((e) => e.name !== 'Treadmill Jog');
    const totalSets = strength.reduce((s, e) => s + (e.sets ?? 0), 0);
    expect(totalSets).toBeLessThanOrEqual(22);
    // anchor (slot 0) keeps its full 5 sets
    expect(out.exercises[0]!.sets).toBe(5);
    // no row trimmed below the floor of 2
    expect(strength.every((e) => (e.sets ?? 0) >= 2)).toBe(true);
    // cardio finisher untouched by the clamp (already normalized to 1 set)
    const cardio = out.exercises.find((e) => e.name === 'Treadmill Jog')!;
    expect(cardio.sets).toBe(1);
  });

  it('leaves an isometric hold (time, but NOT cardio) untouched', async () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Upper',
      exercises: [
        { name: 'Bench Press', sets: 4, reps: 8, exerciseId: 'bench1' },
        { name: 'Forearm Plank', sets: 3, reps: 45, exerciseId: 'plank1' },
      ],
    };

    const out = await enrichGeneratedSession(
      session,
      { type: 'strength', title: 'Upper' },
      cardioService as any,
      [],
      [],
    );

    const plank = out.exercises.find((e) => e.name === 'Forearm Plank')!;
    // regression guard: a 3 × 45 sec plank must not become 1 × 10 min, and the
    // rep-range stamp must skip time rows (no repsMin/repsMax invented).
    expect(plank.sets).toBe(3);
    expect(plank.reps).toBe(45);
    expect(plank.prescriptionType).toBe('time');
    expect(plank.repsMin).toBeUndefined();
  });
});

describe('enrichGeneratedSession role-aware sets + rep ranges', () => {
  const svc = {
    findOne: (id: string) => {
      if (id === 'bench')
        return {
          id,
          name: 'Barbell Bench Press',
          primaryMuscleGroup: 'Chest',
          movementPatterns: ['Push'],
          type: 'Compound',
          prescriptionType: 'reps' as const,
        };
      if (id === 'curl')
        return {
          id,
          name: 'Dumbbell Biceps Curl',
          primaryMuscleGroup: 'Arms',
          movementPatterns: [],
          type: 'Isolation',
          prescriptionType: 'reps' as const,
        };
      if (id === 'tm')
        return { id, name: 'Treadmill Walk', primaryMuscleGroup: 'Cardio' };
      if (id === 'hold')
        return {
          id,
          name: 'Barbell Static Hold',
          primaryMuscleGroup: 'Back',
          movementPatterns: [],
        };
      return undefined;
    },
    getCandidatesForGenerator: () => [],
  };

  it('treats a "static hold" as time (duration, no rep range) even when the model wrote reps', async () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Pull',
      exercises: [
        {
          name: 'Barbell Bent-Over Row',
          sets: 4,
          reps: 8,
          exerciseId: 'bench',
        },
        { name: 'Barbell Static Hold', sets: 4, reps: 10, exerciseId: 'hold' },
      ],
    };

    const out = await enrichGeneratedSession(
      session,
      { type: 'strength', title: 'Pull' },
      svc as any,
      [],
      [],
      {
        goal: 'strength',
        difficulty: 'intermediate',
        durationMinutes: 60,
        detailLevel: 'detailed',
      },
    );

    const hold = out.exercises.find((e) => e.name === 'Barbell Static Hold')!;
    expect(hold.prescriptionType).toBe('time');
    expect(hold.durationSeconds).toBeGreaterThan(0);
    expect(hold.repsMin).toBeUndefined();
    expect(hold.repsMax).toBeUndefined();
  });

  it('stamps lower reps on the compound than the isolation, and a duration on cardio', async () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Upper',
      exercises: [
        { name: 'Barbell Bench Press', sets: 3, reps: 10, exerciseId: 'bench' },
        { name: 'Dumbbell Biceps Curl', sets: 5, reps: 5, exerciseId: 'curl' },
        { name: 'Treadmill Walk', sets: 4, reps: 12, exerciseId: 'tm' },
      ],
    };

    const out = await enrichGeneratedSession(
      session,
      { type: 'strength', title: 'Upper' },
      svc as any,
      [],
      [],
      {
        goal: 'strength',
        difficulty: 'intermediate',
        durationMinutes: 60,
        detailLevel: 'detailed',
      },
    );

    const bench = out.exercises.find((e) => e.name === 'Barbell Bench Press')!;
    const curl = out.exercises.find((e) => e.name === 'Dumbbell Biceps Curl')!;
    const tm = out.exercises.find((e) => e.name === 'Treadmill Walk')!;

    // Compound sits in the strength band (low reps); reps = repsMin (working default).
    expect(bench.repsMin).toBeGreaterThanOrEqual(3);
    expect(bench.repsMax!).toBeLessThanOrEqual(6);
    expect(bench.reps).toBe(bench.repsMin);
    // Isolation runs higher reps with no more sets than the heavy compound.
    expect(curl.repsMin!).toBeGreaterThan(bench.repsMin!);
    expect(curl.sets).toBeLessThanOrEqual(bench.sets);
    expect(curl.repsMax!).toBeGreaterThanOrEqual(10);
    // Cardio carries an explicit duration, not a rep range.
    expect(tm.prescriptionType).toBe('time');
    expect(tm.durationSeconds).toBe(600);
    expect(tm.repsMin).toBeUndefined();
  });
});

describe('enrichGeneratedSession prescriptionType', () => {
  it('uses library prescriptionType when exerciseId resolves', async () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Upper Strength',
      exercises: [
        {
          name: 'Custom Bracing Drill',
          sets: 3,
          reps: 10,
          exerciseId: 'hold_1',
        },
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
        {
          name: 'Seated Leg Extension',
          sets: 4,
          reps: 12,
          exerciseId: 'iso_quad',
        },
        {
          name: 'Standing Calf Raise',
          sets: 4,
          reps: 12,
          exerciseId: 'iso_calf',
        },
        { name: 'Overhead March', sets: 4, reps: 8, exerciseId: 'core_carry' },
        {
          name: 'Rotational Sit-Up',
          sets: 4,
          reps: 10,
          exerciseId: 'core_rot1',
        },
        {
          name: 'Landmine Rotation',
          sets: 4,
          reps: 10,
          exerciseId: 'core_rot2',
        },
        {
          name: '45-Degree Leg Press',
          sets: 4,
          reps: 12,
          exerciseId: 'leg_press',
        },
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
      exercises: [{ name: 'Squat', sets: 3, reps: 5, exerciseId: 'sq1' }],
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
        if (id === 'bench')
          return {
            id,
            movementPatterns: ['Push'],
            primaryMuscleGroup: 'Chest',
          };
        if (id === 'row')
          return { id, movementPatterns: ['Pull'], primaryMuscleGroup: 'Back' };
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
        {
          name: 'Landmine Press',
          sets: 4,
          reps: 8,
          exerciseId: 'landmine_press',
        },
        {
          name: 'Lat Pulldown',
          sets: 3,
          reps: 10,
          exerciseId: 'lat_pulldown_wide',
        },
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
        return {
          id,
          movementPatterns: [],
          primaryMuscleGroup: 'Arms',
          name: id,
          secondaryMuscleGroups: [],
        };
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
        {
          name: 'Flat Barbell Bench Press',
          sets: 4,
          reps: 6,
          exerciseId: 'flat_barbell_bench_press',
        },
        {
          name: 'Lat Pulldown',
          sets: 3,
          reps: 10,
          exerciseId: 'lat_pulldown_wide',
        },
      ],
    };
    const exercisesService = {
      findOne: (id: string) => ({
        id,
        name: id,
        movementPatterns:
          id === 'flat_barbell_bench_press' ? ['Push'] : ['Pull'],
        primaryMuscleGroup:
          id === 'flat_barbell_bench_press' ? 'Chest' : 'Back',
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

  it('swaps in a home-capable anchor when equipment excludes barbells', async () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Friday',
      name: 'Lower',
      exercises: [
        {
          name: 'B-Stance Hip Thrust',
          sets: 3,
          reps: 10,
          exerciseId: 'b_stance_hip_thrust',
        },
        {
          name: 'Bodyweight Calf Raise',
          sets: 3,
          reps: 15,
          exerciseId: 'bodyweight_calf_raise',
        },
      ],
    };
    const metaById: Record<
      string,
      { patterns: string[]; muscle: string; equipment: string[] }
    > = {
      b_stance_hip_thrust: {
        patterns: ['Hinge'],
        muscle: 'Legs',
        equipment: ['Dumbbell'],
      },
      back_squat: {
        patterns: ['Squat'],
        muscle: 'Legs',
        equipment: ['Barbell'],
      },
      front_squat: {
        patterns: ['Squat'],
        muscle: 'Legs',
        equipment: ['Barbell'],
      },
      forty_five_degree_leg_press: {
        patterns: ['Squat'],
        muscle: 'Legs',
        equipment: ['Machine'],
      },
      conventional_deadlift: {
        patterns: ['Hinge'],
        muscle: 'Legs',
        equipment: ['Barbell'],
      },
      sumo_deadlift: {
        patterns: ['Hinge'],
        muscle: 'Legs',
        equipment: ['Barbell'],
      },
      goblet_squat: {
        patterns: ['Squat'],
        muscle: 'Legs',
        equipment: ['Dumbbell'],
      },
      dumbbell_romanian_deadlift: {
        patterns: ['Hinge'],
        muscle: 'Legs',
        equipment: ['Dumbbell'],
      },
    };
    const exercisesService = {
      findOne: (id: string) => {
        const m = metaById[id];
        return {
          id,
          name: id,
          movementPatterns: m?.patterns ?? [],
          primaryMuscleGroup: m?.muscle ?? 'Legs',
          secondaryMuscleGroups: [],
          equipment: m?.equipment ?? [],
        };
      },
      getCandidatesForGenerator: () => [],
    };
    const out = await enrichGeneratedSession(
      session,
      { type: 'strength', title: 'Lower' },
      exercisesService as any,
      ['Dumbbell', 'Resistance Band', 'Bodyweight'],
      [],
      { goal: 'hypertrophy', durationMinutes: 45, detailLevel: 'detailed' },
    );
    // Barbell/machine anchors are filtered by equipment; the hinge-pattern
    // dumbbell RDL is the first anchor the home list can actually perform.
    expect(out.exercises[0]?.exerciseId).toBe('dumbbell_romanian_deadlift');
    const ids = out.exercises.map((e) => e.exerciseId);
    expect(ids).not.toContain('back_squat');
    expect(ids).not.toContain('conventional_deadlift');
  });

  it('pull-balance insert skips non-pull arm moves offered by the pull pool', async () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Upper',
      exercises: [
        {
          name: 'Flat Barbell Bench Press',
          sets: 4,
          reps: 8,
          exerciseId: 'flat_barbell_bench_press',
        },
        {
          name: 'Incline Dumbbell Bench Press',
          sets: 3,
          reps: 10,
          exerciseId: 'incline_dumbbell_bench_press',
        },
      ],
    };
    const exercisesService = {
      findOne: (id: string) => ({
        id,
        name: id,
        movementPatterns: ['Push'],
        primaryMuscleGroup: 'Chest',
        secondaryMuscleGroups: [],
      }),
      // The 'pull' focus pool is muscle-group based (Back + Arms) so it leads
      // with triceps/biceps isolation here — the insert must skip to the row.
      getCandidatesForGenerator: ({ focus }: { focus: string }) =>
        focus === 'pull'
          ? [
              {
                id: 'straight_bar_cable_pushdown',
                name: 'Straight-Bar Cable Pushdown',
                primaryMuscleGroup: 'Arms',
                secondaryMuscleGroups: ['Shoulders'],
                movementPatterns: ['Push'],
              },
              {
                id: 'standing_dumbbell_curl',
                name: 'Standing Dumbbell Curl',
                primaryMuscleGroup: 'Arms',
                secondaryMuscleGroups: [],
                movementPatterns: ['Pull'],
              },
              {
                id: 'barbell_bent_over_row',
                name: 'Barbell Bent-Over Row',
                primaryMuscleGroup: 'Back',
                secondaryMuscleGroups: ['Arms'],
                movementPatterns: ['Pull'],
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
      { goal: 'hypertrophy', durationMinutes: 45, detailLevel: 'detailed' },
    );
    const ids = out.exercises.map((e) => e.exerciseId);
    expect(ids).toContain('barbell_bent_over_row');
    expect(ids).not.toContain('straight_bar_cable_pushdown');
    expect(ids).not.toContain('standing_dumbbell_curl');
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
        {
          name: 'Calf Raise',
          sets: 3,
          reps: 15,
          exerciseId: 'standing_calf_raise_machine',
        },
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
        return {
          id,
          name: id,
          movementPatterns: [],
          primaryMuscleGroup: 'Legs',
          secondaryMuscleGroups: [],
        };
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
          // Catalog audit Task 3 re-pointed the sumo anchor to the legs-side id.
          'barbell_sumo_deadlift',
          'goblet_squat',
          'dumbbell_romanian_deadlift',
          // Catalog audit Task 4 added the bodyweight fallback anchor.
          'bodyweight_squat',
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

  it('scopes the cross-session exclude list per week — cloned weeks resolve identically', async () => {
    const mkSession = (weekIndex: number): GeneratedSession => ({
      weekIndex,
      weekday: 'Monday',
      name: 'Upper',
      exercises: [
        { name: 'Bench', sets: 3, reps: 8, exerciseId: 'a_bp' },
        { name: 'Row', sets: 3, reps: 8, exerciseId: 'a_row' },
      ],
    });
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
    const enrich = (weekIndices: [number, number]) =>
      enrichGeneratedSessionsInChunkOrder(
        [mkSession(weekIndices[0]), mkSession(weekIndices[1])],
        {
          getSpec: (i) => ({
            type: 'strength',
            title: 'Upper',
            weekIndex: weekIndices[i]!,
          }),
          getAvoidPhrases: () => [],
          getGenerationPrefs: () => ({
            goal: 'hybrid',
            durationMinutes: 45,
            detailLevel: 'simple',
          }),
          exercisesService: exercisesService as any,
          equipment: ['Machine'],
        },
      );

    // Week-2 clone of a week-1 session must resolve to the SAME finisher —
    // a program-wide exclude list re-anchored cloned weeks into worse picks.
    const cloned = await enrich([1, 2]);
    const lastOf = (s: GeneratedSession) =>
      s.exercises[s.exercises.length - 1]!.exerciseId;
    expect(lastOf(cloned[0]!)).toBe('tread1');
    expect(lastOf(cloned[1]!)).toBe('tread1');

    // Two sessions in the SAME week still get distinct picks.
    const sameWeek = await enrich([1, 1]);
    expect(lastOf(sameWeek[0]!)).toBe('tread1');
    expect(lastOf(sameWeek[1]!)).toBe('bike1');
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

describe('enrichGeneratedSession within-session redundancy cap', () => {
  const LUNGE_RX =
    /\b(lunge|step[-\s]?up|split\s+squat|bulgarian|reverse\s+lunge|walking\s+lunge|side\s+lunge|cossack)\b/i;

  const meta: Record<string, any> = {
    sq: {
      id: 'sq',
      name: 'Back Squat',
      primaryMuscleGroup: 'Legs',
      movementPatterns: ['Squat'],
      type: 'Compound',
    },
    wl: {
      id: 'wl',
      name: 'Walking Lunge',
      primaryMuscleGroup: 'Legs',
      movementPatterns: ['Squat'],
    },
    rl: {
      id: 'rl',
      name: 'Reverse Lunge',
      primaryMuscleGroup: 'Legs',
      movementPatterns: ['Squat'],
    },
    bss: {
      id: 'bss',
      name: 'Bulgarian Split Squat',
      primaryMuscleGroup: 'Legs',
      movementPatterns: ['Squat'],
    },
    rdl: {
      id: 'rdl',
      name: 'Romanian Deadlift',
      primaryMuscleGroup: 'Legs',
      movementPatterns: ['Hinge'],
      type: 'Compound',
      secondaryMuscleGroups: [],
    },
    lc: {
      id: 'lc',
      name: 'Lying Leg Curl',
      primaryMuscleGroup: 'Legs',
      movementPatterns: [],
      type: 'Isolation',
      secondaryMuscleGroups: [],
    },
  };

  const svc = {
    findOne: (id: string) => meta[id],
    // Pool offers non-lunge lower movements to swap in.
    getCandidatesForGenerator: () => [meta.rdl, meta.lc],
  };

  it('caps a lower session at 2 of the same dominance (swaps the 3rd lunge)', async () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Lower',
      exercises: [
        { name: 'Back Squat', sets: 4, reps: 6, exerciseId: 'sq' },
        { name: 'Walking Lunge', sets: 3, reps: 10, exerciseId: 'wl' },
        { name: 'Reverse Lunge', sets: 3, reps: 10, exerciseId: 'rl' },
        { name: 'Bulgarian Split Squat', sets: 3, reps: 10, exerciseId: 'bss' },
      ],
    };

    const out = await enrichGeneratedSession(
      session,
      { type: 'strength', title: 'Lower' },
      svc as any,
      [],
      [],
      {
        goal: 'strength',
        difficulty: 'intermediate',
        durationMinutes: 60,
        detailLevel: 'detailed',
      },
    );

    const lungeCount = out.exercises.filter((e) =>
      LUNGE_RX.test(e.name),
    ).length;
    expect(lungeCount).toBeLessThanOrEqual(2);
    // A swap happened and is surfaced to the user.
    expect(
      out.exercises.some((e) => /movement variety/i.test(e.notes ?? '')),
    ).toBe(true);
  });

  it('leaves a balanced lower session unchanged (no over-saturation)', async () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Lower',
      exercises: [
        { name: 'Back Squat', sets: 4, reps: 6, exerciseId: 'sq' },
        { name: 'Romanian Deadlift', sets: 3, reps: 8, exerciseId: 'rdl' },
        { name: 'Walking Lunge', sets: 3, reps: 10, exerciseId: 'wl' },
      ],
    };

    const out = await enrichGeneratedSession(
      session,
      { type: 'strength', title: 'Lower' },
      svc as any,
      [],
      [],
      {
        goal: 'strength',
        difficulty: 'intermediate',
        durationMinutes: 60,
        detailLevel: 'detailed',
      },
    );

    // No swap note — nothing was over-saturated (1 squat, 1 hinge, 1 lunge).
    expect(
      out.exercises.some((e) => /movement variety/i.test(e.notes ?? '')),
    ).toBe(false);
  });
});

describe('humanizeExerciseIdsInCopy', () => {
  const findMeta = (id: string) =>
    id === 'front_squat' ? { name: 'Front Squat' } : undefined;

  it('maps known catalog ids to display names', () => {
    expect(
      humanizeExerciseIdsInCopy(
        'This day starts with the front_squat.',
        findMeta,
      ),
    ).toBe('This day starts with the Front Squat.');
  });

  it('de-underscores unknown snake_case tokens', () => {
    expect(
      humanizeExerciseIdsInCopy(
        'then the barbell_b_stance_rdl block',
        findMeta,
      ),
    ).toBe('then the barbell b stance rdl block');
  });

  it('leaves plain prose untouched', () => {
    const text = 'Balance push and pull; finish with easy cardio.';
    expect(humanizeExerciseIdsInCopy(text, findMeta)).toBe(text);
  });
});

describe('cardio row stale-note cleanup', () => {
  it('drops a seconds-of-work note that contradicts the stamped duration', async () => {
    const exercisesService = {
      findOne: (id: string) =>
        id === 'jumping_jack'
          ? {
              id,
              name: 'Jumping Jack',
              primaryMuscleGroup: 'Cardio',
              movementPatterns: ['Cardio'],
              secondaryMuscleGroups: [],
            }
          : {
              id,
              name: id,
              primaryMuscleGroup: 'Legs',
              movementPatterns: ['Squat'],
              secondaryMuscleGroups: [],
            },
      getCandidatesForGenerator: () => [],
    };
    const out = await enrichGeneratedSession(
      {
        weekIndex: 1,
        weekday: 'Monday',
        name: 'Full Body',
        exercises: [
          { name: 'Back Squat', sets: 3, reps: 10, exerciseId: 'back_squat' },
          {
            name: 'Jumping Jack',
            sets: 2,
            reps: 15,
            notes: '30 seconds of work',
            exerciseId: 'jumping_jack',
          },
        ],
      },
      { type: 'strength', title: 'Full Body' },
      exercisesService as any,
      [],
      [],
      { goal: 'fat loss', durationMinutes: 45, detailLevel: 'simple' },
    );
    const jack = out.exercises.find((e) => e.exerciseId === 'jumping_jack')!;
    expect(jack.durationSeconds).toBe(600);
    expect(jack.notes).toBeUndefined();
  });
});

describe('per-session press-total cap', () => {
  const mkService = (rows: Array<Record<string, unknown>>) => {
    const byId = new Map(rows.map((r) => [r.id as string, r]));
    return {
      findOne: (id: string) => byId.get(id),
      getCandidatesForGenerator: ({
        excludeIds,
      }: {
        excludeIds?: string[];
      }) => {
        const ex = new Set(excludeIds ?? []);
        return rows.filter((r) => !ex.has(r.id as string));
      },
    } as any;
  };
  const lift = (
    id: string,
    name: string,
    primaryMuscleGroup: string,
    movementPatterns: string[],
  ) => ({
    id,
    name,
    primaryMuscleGroup,
    movementPatterns,
    primaryEquipment: ['Dumbbell'],
    prescriptionType: 'reps' as const,
  });
  const flatBench = lift(
    'flat_db_bench',
    'Flat Dumbbell Bench Press',
    'Chest',
    ['Push'],
  );
  const inclineBench = lift(
    'incline_db_bench',
    'Incline Dumbbell Bench Press',
    'Chest',
    ['Push'],
  );
  const declineBench = lift(
    'decline_db_bench',
    'Decline Dumbbell Bench Press',
    'Chest',
    ['Push'],
  );
  const ohp = lift('db_ohp', 'Dumbbell Overhead Press', 'Shoulders', ['Push']);
  const pulldown = lift('lat_pulldown', 'Wide-Grip Lat Pulldown', 'Back', [
    'Pull',
  ]);
  const bentRow = lift('bent_over_row', 'Barbell Bent-Over Row', 'Back', [
    'Pull',
  ]);
  const rdl = lift('barbell_rdl', 'Barbell Romanian Deadlift', 'Legs', [
    'Hinge',
  ]);
  const convDl = lift(
    'conventional_deadlift',
    'Conventional Deadlift',
    'Legs',
    ['Hinge'],
  );
  const goodMorning = lift('good_morning', 'Barbell Good Morning', 'Legs', [
    'Hinge',
  ]);
  const backSquat = lift('back_squat', 'Barbell Back Squat', 'Legs', ['Squat']);
  const rowOf = (r: { id: string; name: string }, sets = 4, reps = 6) => ({
    name: r.name,
    sets,
    reps,
    exerciseId: r.id,
  });
  const countBy = (out: { exercises: Array<{ name: string }> }, rx: RegExp) =>
    out.exercises.filter((e) => rx.test(e.name)).length;
  const PRESS_RX = /bench press|overhead press|push-up|dip/i;
  const PULL_RX = /row|pulldown/i;

  it('caps an Upper day at 3 total presses, swapping the excess for a pull', async () => {
    const out = await enrichGeneratedSession(
      {
        weekIndex: 1,
        weekday: 'Monday',
        name: 'Upper',
        exercises: [
          rowOf(flatBench, 4, 5),
          rowOf(inclineBench),
          rowOf(declineBench),
          rowOf(ohp),
          rowOf(pulldown, 3, 10),
        ],
      },
      { type: 'strength', title: 'Upper' },
      mkService([
        flatBench,
        inclineBench,
        declineBench,
        ohp,
        pulldown,
        bentRow,
      ]),
      undefined,
      [],
      undefined,
    );
    expect(countBy(out, PRESS_RX)).toBe(3);
    expect(countBy(out, PULL_RX)).toBe(2);
    expect(out.exercises.map((e) => e.exerciseId)).toContain('bent_over_row');
  });

  it('leaves a press-focused day (Push) alone', async () => {
    const out = await enrichGeneratedSession(
      {
        weekIndex: 1,
        weekday: 'Monday',
        name: 'Push',
        exercises: [
          rowOf(flatBench, 4, 5),
          rowOf(inclineBench),
          rowOf(declineBench),
          rowOf(ohp),
        ],
      },
      { type: 'strength', title: 'Push' },
      mkService([flatBench, inclineBench, declineBench, ohp, bentRow]),
      undefined,
      [],
      undefined,
    );
    expect(countBy(out, PRESS_RX)).toBe(4);
  });

  it('press-cap swap-ins prefer a pull angle still under the per-angle cap', async () => {
    // 4 presses + 2 horizontal rows: the excess press must not become a third
    // horizontal row just because one is next in the pool — the pull-angle cap
    // already ran and will not re-check inserts.
    const chestRow = lift(
      'chest_supported_row',
      'Chest-Supported Row',
      'Back',
      ['Pull'],
    );
    const cableRow = lift('seated_cable_row', 'Seated Cable Row', 'Back', [
      'Pull',
    ]);
    const out = await enrichGeneratedSession(
      {
        weekIndex: 1,
        weekday: 'Monday',
        name: 'Upper',
        exercises: [
          rowOf(flatBench, 4, 5),
          rowOf(inclineBench),
          rowOf(declineBench),
          rowOf(ohp),
          rowOf(bentRow, 3, 8),
          rowOf(chestRow, 3, 8),
        ],
      },
      { type: 'strength', title: 'Upper' },
      mkService([
        flatBench,
        inclineBench,
        declineBench,
        ohp,
        bentRow,
        chestRow,
        cableRow, // horizontal candidate first in pool order — must be skipped
        pulldown, // vertical candidate — the correct pick
      ]),
      undefined,
      [],
      undefined,
    );
    const horizontals = out.exercises.filter((e) =>
      /row\b/i.test(e.name),
    ).length;
    expect(countBy(out, PRESS_RX)).toBe(3);
    expect(horizontals).toBeLessThanOrEqual(2);
    expect(out.exercises.map((e) => e.exerciseId)).toContain('lat_pulldown');
  });

  it('never swaps a capped family into a sibling family already at cap', async () => {
    // Live case: 3 squats on a Lower day; the excess squat must not become a
    // third hinge just because a deadlift is the next candidate in the pool.
    const frontSquat = lift('front_squat', 'Front Squat', 'Legs', ['Squat']);
    const hackSquat = lift('hack_squat', 'Machine Hack Squat', 'Legs', [
      'Squat',
    ]);
    const gobletSquat = lift('goblet_squat', 'Goblet Squat', 'Legs', ['Squat']);
    const lunge = lift('walking_lunge', 'Walking Lunge', 'Legs', ['Lunge']);
    const out = await enrichGeneratedSession(
      {
        weekIndex: 1,
        weekday: 'Tuesday',
        name: 'Lower',
        exercises: [
          rowOf(frontSquat, 4, 5),
          rowOf(hackSquat),
          rowOf(gobletSquat),
          rowOf(rdl),
          rowOf(convDl),
        ],
      },
      { type: 'strength', title: 'Lower' },
      mkService([
        frontSquat,
        hackSquat,
        gobletSquat,
        rdl,
        convDl,
        goodMorning, // hinge candidate first in pool order — must be skipped
        lunge,
      ]),
      undefined,
      [],
      undefined,
    );
    const hinges = out.exercises.filter((e) =>
      /deadlift|good morning/i.test(e.name),
    ).length;
    const squats = out.exercises.filter((e) => /squat/i.test(e.name)).length;
    expect(squats).toBeLessThanOrEqual(2);
    expect(hinges).toBeLessThanOrEqual(2);
  });

  it('caps hinge variants on a Full Body day now that dominance caps run everywhere', async () => {
    const out = await enrichGeneratedSession(
      {
        weekIndex: 1,
        weekday: 'Monday',
        name: 'Full Body',
        exercises: [
          rowOf(rdl, 4, 5),
          rowOf(convDl),
          rowOf(goodMorning),
          rowOf(pulldown, 3, 10),
        ],
      },
      { type: 'strength', title: 'Full Body' },
      mkService([rdl, convDl, goodMorning, pulldown, backSquat, bentRow]),
      undefined,
      [],
      undefined,
    );
    const hinges = out.exercises.filter((e) =>
      /deadlift|good morning/i.test(e.name),
    ).length;
    expect(hinges).toBeLessThanOrEqual(2);
  });
});
