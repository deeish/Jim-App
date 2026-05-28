import type { GenerateSessionsDto } from './dto/generate-sessions.dto';
import type { GeneratedSession } from './session-enrichment';
import {
  buildRetryPriorExerciseIds,
  type ChunkValidatorIssue,
  validateGeneratedProgramChunk,
} from './generated-chunk-validators';

function spec(
  overrides: Partial<GenerateSessionsDto['sessions'][number]> = {},
): GenerateSessionsDto['sessions'][number] {
  return {
    type: 'strength',
    durationMin: 45,
    durationMax: 60,
    isHardDay: false,
    weekIndex: 1,
    weekday: 'Monday',
    ...overrides,
  };
}

function session(
  exercises: GeneratedSession['exercises'],
  overrides: Partial<GeneratedSession> = {},
): GeneratedSession {
  return {
    weekIndex: 1,
    weekday: 'Monday',
    name: 'Test',
    exercises,
    ...overrides,
  };
}

describe('validateGeneratedProgramChunk', () => {
  it('passes for distinct ids and enough exercises', () => {
    const specs = [spec({ weekday: 'Mon' }), spec({ weekday: 'Tue' })];
    const six = (offset: number) =>
      Array.from({ length: 6 }, (_, i) => ({
        name: `E${offset}-${i}`,
        sets: 3,
        reps: 8,
        exerciseId: `id${offset * 10 + i}`,
      }));
    const sessions = [session(six(0)), session(six(1), { weekday: 'Tuesday' })];
    const r = validateGeneratedProgramChunk(specs, sessions, 'detailed');
    expect(r.ok).toBe(true);
    expect(r.duplicateExerciseIds).toEqual([]);
  });

  it('fails when same id appears in two sessions', () => {
    const specs = [spec({ weekday: 'Mon' }), spec({ weekday: 'Tue' })];
    const dup = 'same-id';
    const fill = (prefix: string, dupId: string | null, start: number) =>
      Array.from({ length: 6 }, (_, i) => ({
        name: `${prefix}${i}`,
        sets: 3,
        reps: 8,
        exerciseId: i === 0 && dupId ? dupId : `${prefix}-id-${start + i}`,
      }));
    const sessions = [
      session(fill('A', dup, 1)),
      session(fill('B', dup, 20), { weekday: 'Tuesday' }),
    ];
    const r = validateGeneratedProgramChunk(specs, sessions, 'detailed');
    expect(r.ok).toBe(false);
    expect(r.issues).toContain('duplicate_exercise_id_across_chunk');
    expect(r.duplicateExerciseIds).toContain(dup);
  });

  it('fails when same id twice in one session', () => {
    const specs = [spec()];
    const dup = 'twice';
    const sessions = [
      session([
        { name: 'A', sets: 3, reps: 8, exerciseId: dup },
        { name: 'B', sets: 3, reps: 8, exerciseId: dup },
        { name: 'C', sets: 3, reps: 8, exerciseId: 'c' },
        { name: 'D', sets: 3, reps: 8, exerciseId: 'd' },
        { name: 'E', sets: 3, reps: 8, exerciseId: 'e' },
        { name: 'F', sets: 3, reps: 8, exerciseId: 'f' },
      ]),
    ];
    const r = validateGeneratedProgramChunk(specs, sessions, 'detailed');
    expect(r.ok).toBe(false);
    expect(r.issues).toContain('duplicate_exercise_id_in_session');
  });

  it('fails below min exercises for strength detailed', () => {
    const specs = [spec()];
    const sessions = [
      session([
        { name: 'A', sets: 3, reps: 8, exerciseId: 'a' },
        { name: 'B', sets: 3, reps: 8, exerciseId: 'b' },
      ]),
    ];
    const r = validateGeneratedProgramChunk(specs, sessions, 'detailed');
    expect(r.ok).toBe(false);
    expect(r.issues).toContain('below_min_exercises');
  });

  it('fails when upper-focus strength day includes library Squat/Hinge (with metadata map)', () => {
    const specs = [spec({ title: 'Upper' })];
    const meta = new Map<string, string[]>([
      ['hinge1', ['Hinge', 'Pull']],
      ['push1', ['Push']],
    ]);
    const sessions = [
      session([
        { name: 'Sumo DL', sets: 4, reps: 5, exerciseId: 'hinge1' },
        { name: 'Bench', sets: 4, reps: 8, exerciseId: 'push1' },
        { name: 'C', sets: 3, reps: 10, exerciseId: 'c' },
        { name: 'D', sets: 3, reps: 10, exerciseId: 'd' },
        { name: 'E', sets: 3, reps: 10, exerciseId: 'e' },
        { name: 'F', sets: 3, reps: 10, exerciseId: 'f' },
      ]),
    ];
    const r = validateGeneratedProgramChunk(specs, sessions, 'detailed', meta);
    expect(r.ok).toBe(false);
    expect(r.issues).toContain('primary_lower_pattern_on_upper_focus');
    expect(r.patternClashExerciseIds).toContain('hinge1');
    expect(r.patternClashExerciseIds).not.toContain('push1');
  });

  it('passes upper-focus when metadata map omitted (backward compatible)', () => {
    const specs = [spec({ title: 'Upper' })];
    const six = Array.from({ length: 6 }, (_, i) => ({
      name: `E${i}`,
      sets: 3,
      reps: 8,
      exerciseId: `id${i}`,
    }));
    const sessions = [session(six)];
    const r = validateGeneratedProgramChunk(specs, sessions, 'detailed');
    expect(r.ok).toBe(true);
    expect(r.patternClashExerciseIds).toEqual([]);
  });

  it('passes upper-focus when hinge exercise has no metadata entry', () => {
    const specs = [spec({ title: 'Push' })];
    const meta = new Map<string, string[]>([['push1', ['Push']]]);
    const sessions = [
      session([
        { name: 'Mystery', sets: 4, reps: 5, exerciseId: 'unknown' },
        ...Array.from({ length: 5 }, (_, i) => ({
          name: `E${i}`,
          sets: 3,
          reps: 8,
          exerciseId: `id${i}`,
        })),
      ]),
    ];
    const r = validateGeneratedProgramChunk(specs, sessions, 'detailed', meta);
    expect(r.ok).toBe(true);
  });

  /**
   * Phase 3 — per-session movement-pattern budget. Caps mirror the table in
   * `backend/docs/PLAN_OUTPUT_QUALITY_FIX_PLAN.md` Phase 3.
   */
  describe('per-session pattern budget', () => {
    function buildLowerSession(overrides?: Partial<GeneratedSession>) {
      return session(
        [
          { name: 'Back Squat', sets: 4, reps: 6, exerciseId: 'sq' },
          { name: 'Romanian DL', sets: 3, reps: 8, exerciseId: 'hinge' },
          { name: 'Leg Press', sets: 3, reps: 10, exerciseId: 'press' },
          { name: 'Plank', sets: 3, reps: 30, exerciseId: 'core1' },
          { name: 'Hanging Leg Raise', sets: 3, reps: 12, exerciseId: 'core2' },
          { name: 'Cable Crunch', sets: 3, reps: 12, exerciseId: 'core3' },
        ],
        overrides,
      );
    }

    it('flags 3 core moves on a Lower day and marks the trailing core ids as overflow', () => {
      const specs = [spec({ title: 'Lower' })];
      const movement = new Map<string, string[]>([
        ['sq', ['Squat']],
        ['hinge', ['Hinge']],
        ['press', ['Squat']],
      ]);
      const primary = new Map<string, string>([
        ['sq', 'Legs'],
        ['hinge', 'Legs'],
        ['press', 'Legs'],
        ['core1', 'Core'],
        ['core2', 'Core'],
        ['core3', 'Core'],
      ]);
      const r = validateGeneratedProgramChunk(
        specs,
        [buildLowerSession()],
        'detailed',
        movement,
        primary,
      );
      expect(r.ok).toBe(false);
      expect(r.issues).toContain('over_concentrated_pattern');
      // First core stays in budget (cap 1); the 2nd and 3rd are flagged.
      expect(r.patternOverflowExerciseIds).toEqual(
        expect.arrayContaining(['core2', 'core3']),
      );
      expect(r.patternOverflowExerciseIds).not.toContain('core1');
    });

    it('does not flag pattern budget when only the movement map is provided (backward compatible)', () => {
      const specs = [spec({ title: 'Lower' })];
      const movement = new Map<string, string[]>([
        ['sq', ['Squat']],
        ['hinge', ['Hinge']],
      ]);
      const r = validateGeneratedProgramChunk(
        specs,
        [buildLowerSession()],
        'detailed',
        movement,
      );
      // primary_lower_pattern_on_upper_focus only fires for Upper titles, not Lower.
      expect(r.issues).not.toContain('over_concentrated_pattern');
    });

    it('does not flag exempt primary groups (3 calf-raise rows on a Lower day)', () => {
      const specs = [spec({ title: 'Lower' })];
      const movement = new Map<string, string[]>([
        ['sq', ['Squat']],
        ['hinge', ['Hinge']],
      ]);
      const primary = new Map<string, string>([
        ['sq', 'Legs'],
        ['hinge', 'Legs'],
        ['calf1', 'Calves'],
        ['calf2', 'Calves'],
        ['calf3', 'Calves'],
      ]);
      const sessions = [
        session([
          { name: 'Back Squat', sets: 4, reps: 6, exerciseId: 'sq' },
          { name: 'Romanian DL', sets: 3, reps: 8, exerciseId: 'hinge' },
          {
            name: 'Standing Calf Raise',
            sets: 3,
            reps: 12,
            exerciseId: 'calf1',
          },
          { name: 'Seated Calf Raise', sets: 3, reps: 12, exerciseId: 'calf2' },
          { name: 'Donkey Calf Raise', sets: 3, reps: 12, exerciseId: 'calf3' },
        ]),
      ];
      const r = validateGeneratedProgramChunk(
        specs,
        sessions,
        'detailed',
        movement,
        primary,
      );
      expect(r.issues).not.toContain('over_concentrated_pattern');
      expect(r.patternOverflowExerciseIds).toEqual([]);
    });

    it('flags 4+ same-pattern (4 push moves) on an Upper day', () => {
      const specs = [spec({ title: 'Upper' })];
      const movement = new Map<string, string[]>([
        ['p1', ['Push']],
        ['p2', ['Push']],
        ['p3', ['Push']],
        ['p4', ['Push']],
        ['pull1', ['Pull']],
        ['pull2', ['Pull']],
      ]);
      const primary = new Map<string, string>([
        ['p1', 'Chest'],
        ['p2', 'Chest'],
        ['p3', 'Shoulders'],
        ['p4', 'Triceps'],
        ['pull1', 'Back'],
        ['pull2', 'Back'],
      ]);
      const sessions = [
        session([
          { name: 'Bench', sets: 4, reps: 6, exerciseId: 'p1' },
          { name: 'Incline DB Press', sets: 4, reps: 8, exerciseId: 'p2' },
          { name: 'OHP', sets: 4, reps: 8, exerciseId: 'p3' },
          { name: 'Close-Grip Bench', sets: 3, reps: 10, exerciseId: 'p4' },
          { name: 'Row', sets: 4, reps: 8, exerciseId: 'pull1' },
          { name: 'Lat Pulldown', sets: 3, reps: 10, exerciseId: 'pull2' },
        ]),
      ];
      const r = validateGeneratedProgramChunk(
        specs,
        sessions,
        'detailed',
        movement,
        primary,
      );
      expect(r.ok).toBe(false);
      expect(r.issues).toContain('over_concentrated_pattern');
      // 4th push (p4) is the one beyond the cap.
      expect(r.patternOverflowExerciseIds).toContain('p4');
    });

    it('passes Full Body with 2 squats + 2 hinges (cap 2 same pattern)', () => {
      // Use real anchor ids for slot 1 so the Phase 5 anchor check passes —
      // this test is scoped to the pattern budget, not anchor enforcement.
      const specs = [spec({ title: 'Full Body' })];
      const movement = new Map<string, string[]>([
        ['back_squat', ['Squat']],
        ['front_squat', ['Squat']],
        ['conventional_deadlift', ['Hinge']],
        ['h2', ['Hinge']],
        ['push', ['Push']],
        ['pull', ['Pull']],
      ]);
      const primary = new Map<string, string>([
        ['back_squat', 'Legs'],
        ['front_squat', 'Legs'],
        ['conventional_deadlift', 'Legs'],
        ['h2', 'Legs'],
        ['push', 'Chest'],
        ['pull', 'Back'],
      ]);
      const sessions = [
        session([
          { name: 'Back Squat', sets: 4, reps: 6, exerciseId: 'back_squat' },
          { name: 'Front Squat', sets: 3, reps: 10, exerciseId: 'front_squat' },
          {
            name: 'Conventional Deadlift',
            sets: 3,
            reps: 8,
            exerciseId: 'conventional_deadlift',
          },
          { name: 'Hip Thrust', sets: 3, reps: 8, exerciseId: 'h2' },
          { name: 'Bench', sets: 3, reps: 8, exerciseId: 'push' },
          { name: 'Row', sets: 3, reps: 8, exerciseId: 'pull' },
        ]),
      ];
      const r = validateGeneratedProgramChunk(
        specs,
        sessions,
        'detailed',
        movement,
        primary,
      );
      expect(r.ok).toBe(true);
      expect(r.issues).not.toContain('over_concentrated_pattern');
    });

    it('does not check the budget on Cardio/Recovery days', () => {
      const specs = [
        spec({
          title: 'Cardio',
          type: 'cardio',
          durationMin: 30,
          durationMax: 30,
        }),
      ];
      const movement = new Map<string, string[]>();
      const primary = new Map<string, string>([
        ['c1', 'Cardio'],
        ['c2', 'Cardio'],
        ['c3', 'Cardio'],
      ]);
      const sessions = [
        session([
          { name: 'Treadmill', sets: 1, reps: 20, exerciseId: 'c1' },
          { name: 'Bike', sets: 1, reps: 20, exerciseId: 'c2' },
          { name: 'Rower', sets: 1, reps: 20, exerciseId: 'c3' },
        ]),
      ];
      const r = validateGeneratedProgramChunk(
        specs,
        sessions,
        'detailed',
        movement,
        primary,
      );
      expect(r.issues).not.toContain('over_concentrated_pattern');
    });
  });

  /**
   * Phase 4 — per-session sub-muscle cap. Caps mirror the table in
   * `backend/docs/PLAN_OUTPUT_QUALITY_FIX_PLAN.md` Phase 4
   * (simple = 2, detailed = 3, Full Body = 3, primary mover = first sub-muscle,
   * Calves/Forearms/Core/Cardio exempt at the primary-group level).
   */
  describe('per-session sub-muscle cap', () => {
    function lowerSpec() {
      return [spec({ title: 'Lower' })];
    }
    const lowerMovement = new Map<string, string[]>([
      ['ham1', ['Hinge']],
      ['ham2', ['Hinge']],
      ['ham3', ['Hinge']],
      ['quad1', ['Squat']],
    ]);
    const lowerPrimary = new Map<string, string>([
      ['ham1', 'Legs'],
      ['ham2', 'Legs'],
      ['ham3', 'Legs'],
      ['quad1', 'Legs'],
    ]);

    it('flags 3 hamstring lifts on a Lower day in simple mode (cap 2)', () => {
      const subs = new Map<string, string[]>([
        ['ham1', ['Hamstrings', 'Glutes']],
        ['ham2', ['Hamstrings']],
        ['ham3', ['Hamstrings', 'Lower Back']],
        ['quad1', ['Quadriceps']],
      ]);
      const sessions = [
        session([
          { name: 'Romanian DL', sets: 4, reps: 8, exerciseId: 'ham1' },
          { name: 'Lying Leg Curl', sets: 3, reps: 10, exerciseId: 'ham2' },
          { name: 'Seated Leg Curl', sets: 3, reps: 10, exerciseId: 'ham3' },
          { name: 'Back Squat', sets: 4, reps: 6, exerciseId: 'quad1' },
          { name: 'Filler1', sets: 3, reps: 8, exerciseId: 'f1' },
          { name: 'Filler2', sets: 3, reps: 8, exerciseId: 'f2' },
        ]),
      ];
      const r = validateGeneratedProgramChunk(
        lowerSpec(),
        sessions,
        'simple',
        lowerMovement,
        lowerPrimary,
        subs,
      );
      expect(r.ok).toBe(false);
      expect(r.issues).toContain('over_concentrated_sub_muscle');
      expect(r.subMuscleOverflowExerciseIds).toContain('ham3');
      expect(r.subMuscleOverflowExerciseIds).not.toContain('ham1');
      expect(r.subMuscleOverflowExerciseIds).not.toContain('ham2');
    });

    it('passes 3 hamstring lifts on a Lower day in detailed mode (cap 3)', () => {
      const subs = new Map<string, string[]>([
        ['ham1', ['Hamstrings']],
        ['ham2', ['Hamstrings']],
        ['ham3', ['Hamstrings']],
        ['quad1', ['Quadriceps']],
      ]);
      const sessions = [
        session([
          { name: 'Romanian DL', sets: 4, reps: 8, exerciseId: 'ham1' },
          { name: 'Lying Leg Curl', sets: 3, reps: 10, exerciseId: 'ham2' },
          { name: 'Seated Leg Curl', sets: 3, reps: 10, exerciseId: 'ham3' },
          { name: 'Back Squat', sets: 4, reps: 6, exerciseId: 'quad1' },
          { name: 'Filler1', sets: 3, reps: 8, exerciseId: 'f1' },
          { name: 'Filler2', sets: 3, reps: 8, exerciseId: 'f2' },
          { name: 'Filler3', sets: 3, reps: 8, exerciseId: 'f3' },
        ]),
      ];
      const r = validateGeneratedProgramChunk(
        lowerSpec(),
        sessions,
        'detailed',
        lowerMovement,
        lowerPrimary,
        subs,
      );
      expect(r.issues).not.toContain('over_concentrated_sub_muscle');
      expect(r.subMuscleOverflowExerciseIds).toEqual([]);
    });

    it('flags 3 upper-chest pushes on an Upper day in simple mode', () => {
      const specs = [spec({ title: 'Upper' })];
      const movement = new Map<string, string[]>([
        ['p1', ['Push']],
        ['p2', ['Push']],
        ['p3', ['Push']],
        ['pull1', ['Pull']],
      ]);
      const primary = new Map<string, string>([
        ['p1', 'Chest'],
        ['p2', 'Chest'],
        ['p3', 'Chest'],
        ['pull1', 'Back'],
      ]);
      const subs = new Map<string, string[]>([
        ['p1', ['Upper Chest']],
        ['p2', ['Upper Chest']],
        ['p3', ['Upper Chest']],
        ['pull1', ['Lats']],
      ]);
      const sessions = [
        session([
          { name: 'Incline BB Press', sets: 4, reps: 6, exerciseId: 'p1' },
          { name: 'Incline DB Press', sets: 3, reps: 8, exerciseId: 'p2' },
          {
            name: 'Low-to-High Cable Fly',
            sets: 3,
            reps: 10,
            exerciseId: 'p3',
          },
          { name: 'Lat Pulldown', sets: 3, reps: 10, exerciseId: 'pull1' },
          { name: 'Filler1', sets: 3, reps: 8, exerciseId: 'f1' },
          { name: 'Filler2', sets: 3, reps: 8, exerciseId: 'f2' },
        ]),
      ];
      const r = validateGeneratedProgramChunk(
        specs,
        sessions,
        'simple',
        movement,
        primary,
        subs,
      );
      expect(r.ok).toBe(false);
      expect(r.issues).toContain('over_concentrated_sub_muscle');
      expect(r.subMuscleOverflowExerciseIds).toContain('p3');
    });

    it('exempts Core/Calves/Forearms/Cardio at the primary-group level', () => {
      const specs = [spec({ title: 'Lower' })];
      const movement = new Map<string, string[]>([
        ['sq', ['Squat']],
        ['hinge', ['Hinge']],
      ]);
      const primary = new Map<string, string>([
        ['sq', 'Legs'],
        ['hinge', 'Legs'],
        ['core1', 'Core'],
        ['core2', 'Core'],
        ['core3', 'Core'],
      ]);
      const subs = new Map<string, string[]>([
        ['sq', ['Quadriceps']],
        ['hinge', ['Hamstrings']],
        // 3 core rows all share the same primary mover but should be exempt.
        ['core1', ['Rectus Abdominis']],
        ['core2', ['Rectus Abdominis']],
        ['core3', ['Rectus Abdominis']],
      ]);
      const sessions = [
        session([
          { name: 'Back Squat', sets: 4, reps: 6, exerciseId: 'sq' },
          { name: 'Romanian DL', sets: 3, reps: 8, exerciseId: 'hinge' },
          { name: 'Plank', sets: 3, reps: 30, exerciseId: 'core1' },
          { name: 'Hanging Leg Raise', sets: 3, reps: 12, exerciseId: 'core2' },
          { name: 'Cable Crunch', sets: 3, reps: 12, exerciseId: 'core3' },
        ]),
      ];
      const r = validateGeneratedProgramChunk(
        specs,
        sessions,
        'simple',
        movement,
        primary,
        subs,
      );
      expect(r.issues).not.toContain('over_concentrated_sub_muscle');
      expect(r.subMuscleOverflowExerciseIds).toEqual([]);
    });

    it('relaxes the cap to 3 for Full Body sessions (simple mode)', () => {
      const specs = [spec({ title: 'Full Body' })];
      const movement = new Map<string, string[]>([
        ['ham1', ['Hinge']],
        ['ham2', ['Hinge']],
        ['ham3', ['Hinge']],
        ['push', ['Push']],
        ['pull', ['Pull']],
      ]);
      const primary = new Map<string, string>([
        ['ham1', 'Legs'],
        ['ham2', 'Legs'],
        ['ham3', 'Legs'],
        ['push', 'Chest'],
        ['pull', 'Back'],
      ]);
      const subs = new Map<string, string[]>([
        ['ham1', ['Hamstrings']],
        ['ham2', ['Hamstrings']],
        ['ham3', ['Hamstrings']],
        ['push', ['Pectoralis Major']],
        ['pull', ['Lats']],
      ]);
      const sessions = [
        session([
          { name: 'Romanian DL', sets: 4, reps: 8, exerciseId: 'ham1' },
          { name: 'Lying Leg Curl', sets: 3, reps: 10, exerciseId: 'ham2' },
          { name: 'Glute Ham Raise', sets: 3, reps: 10, exerciseId: 'ham3' },
          { name: 'Bench', sets: 3, reps: 8, exerciseId: 'push' },
          { name: 'Row', sets: 3, reps: 8, exerciseId: 'pull' },
        ]),
      ];
      const r = validateGeneratedProgramChunk(
        specs,
        sessions,
        'simple',
        movement,
        primary,
        subs,
      );
      expect(r.issues).not.toContain('over_concentrated_sub_muscle');
    });

    it('does not run the sub-muscle check when subMusclesByExerciseId is missing', () => {
      const subs = new Map<string, string[]>();
      const sessions = [
        session([
          { name: 'Romanian DL', sets: 4, reps: 8, exerciseId: 'ham1' },
          { name: 'Lying Leg Curl', sets: 3, reps: 10, exerciseId: 'ham2' },
          { name: 'Seated Leg Curl', sets: 3, reps: 10, exerciseId: 'ham3' },
          { name: 'Back Squat', sets: 4, reps: 6, exerciseId: 'quad1' },
          { name: 'Filler1', sets: 3, reps: 8, exerciseId: 'f1' },
          { name: 'Filler2', sets: 3, reps: 8, exerciseId: 'f2' },
        ]),
      ];
      const r = validateGeneratedProgramChunk(
        lowerSpec(),
        sessions,
        'simple',
        lowerMovement,
        lowerPrimary,
        // Empty map — keys missing means the validator can't infer the mover.
        subs,
      );
      expect(r.issues).not.toContain('over_concentrated_sub_muscle');
      expect(r.subMuscleOverflowExerciseIds).toEqual([]);
    });
  });

  /**
   * Phase 5 — anchor-or-staple in slot 1. Catches landmine / novelty drift in
   * the opening compound. Acceptable anchors per focus live in
   * `backend/src/data/anchor-exercises.ts → getAcceptedAnchorIdsForFocus`.
   */
  describe('slot-1 anchor enforcement', () => {
    it('flags an Upper day that opens with a non-anchor (e.g. landmine_press)', () => {
      const specs = [spec({ title: 'Upper' })];
      const movement = new Map<string, string[]>([
        ['landmine_press', ['Push']],
        ['lat_pulldown_wide', ['Pull']],
      ]);
      const primary = new Map<string, string>([
        ['landmine_press', 'Shoulders'],
        ['lat_pulldown_wide', 'Back'],
      ]);
      const sessions = [
        session([
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
          { name: 'Filler1', sets: 3, reps: 8, exerciseId: 'f1' },
          { name: 'Filler2', sets: 3, reps: 8, exerciseId: 'f2' },
          { name: 'Filler3', sets: 3, reps: 8, exerciseId: 'f3' },
          { name: 'Filler4', sets: 3, reps: 8, exerciseId: 'f4' },
        ]),
      ];
      const r = validateGeneratedProgramChunk(
        specs,
        sessions,
        'detailed',
        movement,
        primary,
        undefined,
        true,
      );
      expect(r.ok).toBe(false);
      expect(r.issues).toContain('slot_one_not_anchor');
      expect(r.nonAnchorSlotOneExerciseIds).toEqual(['landmine_press']);
    });

    it('does not run by default (flag opt-in) — synthetic eval fixtures stay focused', () => {
      const specs = [spec({ title: 'Upper' })];
      const movement = new Map<string, string[]>([
        ['landmine_press', ['Push']],
      ]);
      const primary = new Map<string, string>([
        ['landmine_press', 'Shoulders'],
      ]);
      const sessions = [
        session([
          {
            name: 'Landmine Press',
            sets: 4,
            reps: 8,
            exerciseId: 'landmine_press',
          },
          { name: 'Filler1', sets: 3, reps: 8, exerciseId: 'f1' },
          { name: 'Filler2', sets: 3, reps: 8, exerciseId: 'f2' },
          { name: 'Filler3', sets: 3, reps: 8, exerciseId: 'f3' },
          { name: 'Filler4', sets: 3, reps: 8, exerciseId: 'f4' },
          { name: 'Filler5', sets: 3, reps: 8, exerciseId: 'f5' },
        ]),
      ];
      const r = validateGeneratedProgramChunk(
        specs,
        sessions,
        'detailed',
        movement,
        primary,
      );
      expect(r.issues).not.toContain('slot_one_not_anchor');
    });

    it('passes an Upper day that opens with a curated anchor (flat_barbell_bench_press)', () => {
      const specs = [spec({ title: 'Upper' })];
      const movement = new Map<string, string[]>([
        ['flat_barbell_bench_press', ['Push']],
        ['lat_pulldown_wide', ['Pull']],
      ]);
      const primary = new Map<string, string>([
        ['flat_barbell_bench_press', 'Chest'],
        ['lat_pulldown_wide', 'Back'],
      ]);
      const sessions = [
        session([
          {
            name: 'Flat Bench',
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
          { name: 'Filler1', sets: 3, reps: 8, exerciseId: 'f1' },
          { name: 'Filler2', sets: 3, reps: 8, exerciseId: 'f2' },
          { name: 'Filler3', sets: 3, reps: 8, exerciseId: 'f3' },
          { name: 'Filler4', sets: 3, reps: 8, exerciseId: 'f4' },
        ]),
      ];
      const r = validateGeneratedProgramChunk(
        specs,
        sessions,
        'detailed',
        movement,
        primary,
        undefined,
        true,
      );
      expect(r.issues).not.toContain('slot_one_not_anchor');
      expect(r.nonAnchorSlotOneExerciseIds).toEqual([]);
    });

    it('accepts a Push anchor on an Upper day (union semantics)', () => {
      const specs = [spec({ title: 'Upper' })];
      const movement = new Map<string, string[]>([
        // incline_barbell_bench_press is in `push` anchors but not `upper` —
        // the union helper accepts it on Upper.
        ['incline_barbell_bench_press', ['Push']],
      ]);
      const primary = new Map<string, string>([
        ['incline_barbell_bench_press', 'Chest'],
      ]);
      const sessions = [
        session([
          {
            name: 'Incline Bench',
            sets: 4,
            reps: 6,
            exerciseId: 'incline_barbell_bench_press',
          },
          { name: 'Filler1', sets: 3, reps: 8, exerciseId: 'f1' },
          { name: 'Filler2', sets: 3, reps: 8, exerciseId: 'f2' },
          { name: 'Filler3', sets: 3, reps: 8, exerciseId: 'f3' },
          { name: 'Filler4', sets: 3, reps: 8, exerciseId: 'f4' },
          { name: 'Filler5', sets: 3, reps: 8, exerciseId: 'f5' },
        ]),
      ];
      const r = validateGeneratedProgramChunk(
        specs,
        sessions,
        'detailed',
        movement,
        primary,
        undefined,
        true,
      );
      expect(r.issues).not.toContain('slot_one_not_anchor');
    });

    it('skips a leading cardio row when locating slot 1 (cardio finishers can be misplaced)', () => {
      const specs = [spec({ title: 'Lower' })];
      const movement = new Map<string, string[]>([
        ['treadmill_walk', []],
        ['back_squat', ['Squat']],
      ]);
      const primary = new Map<string, string>([
        ['treadmill_walk', 'Cardio'],
        ['back_squat', 'Legs'],
      ]);
      const sessions = [
        session([
          {
            name: 'Treadmill Walk',
            sets: 1,
            reps: 10,
            exerciseId: 'treadmill_walk',
          },
          { name: 'Back Squat', sets: 4, reps: 6, exerciseId: 'back_squat' },
          { name: 'Filler1', sets: 3, reps: 8, exerciseId: 'f1' },
          { name: 'Filler2', sets: 3, reps: 8, exerciseId: 'f2' },
          { name: 'Filler3', sets: 3, reps: 8, exerciseId: 'f3' },
          { name: 'Filler4', sets: 3, reps: 8, exerciseId: 'f4' },
        ]),
      ];
      const r = validateGeneratedProgramChunk(
        specs,
        sessions,
        'detailed',
        movement,
        primary,
        undefined,
        true,
      );
      expect(r.issues).not.toContain('slot_one_not_anchor');
    });

    it('does not flag narrow body-part focuses (Chest / Back / Shoulders / Arms) — no anchors defined', () => {
      const specs = [spec({ title: 'Chest' })];
      const movement = new Map<string, string[]>([['fly_machine', ['Push']]]);
      const primary = new Map<string, string>([['fly_machine', 'Chest']]);
      const sessions = [
        session([
          { name: 'Fly Machine', sets: 3, reps: 12, exerciseId: 'fly_machine' },
          { name: 'Filler1', sets: 3, reps: 8, exerciseId: 'f1' },
          { name: 'Filler2', sets: 3, reps: 8, exerciseId: 'f2' },
          { name: 'Filler3', sets: 3, reps: 8, exerciseId: 'f3' },
          { name: 'Filler4', sets: 3, reps: 8, exerciseId: 'f4' },
        ]),
      ];
      const r = validateGeneratedProgramChunk(
        specs,
        sessions,
        'detailed',
        movement,
        primary,
        undefined,
        true,
      );
      expect(r.issues).not.toContain('slot_one_not_anchor');
    });

    it('does not run when no primary muscle group map is provided (backward compatible)', () => {
      const specs = [spec({ title: 'Upper' })];
      const movement = new Map<string, string[]>([
        ['landmine_press', ['Push']],
      ]);
      const sessions = [
        session([
          {
            name: 'Landmine Press',
            sets: 4,
            reps: 8,
            exerciseId: 'landmine_press',
          },
          { name: 'Filler1', sets: 3, reps: 8, exerciseId: 'f1' },
          { name: 'Filler2', sets: 3, reps: 8, exerciseId: 'f2' },
          { name: 'Filler3', sets: 3, reps: 8, exerciseId: 'f3' },
          { name: 'Filler4', sets: 3, reps: 8, exerciseId: 'f4' },
          { name: 'Filler5', sets: 3, reps: 8, exerciseId: 'f5' },
        ]),
      ];
      const r = validateGeneratedProgramChunk(
        specs,
        sessions,
        'detailed',
        movement,
      );
      expect(r.issues).not.toContain('slot_one_not_anchor');
    });
  });

  describe('cross-session diversity (Phase 7)', () => {
    it('flags two flat-bench-led Upper days and demotes the second slot 1', () => {
      const specs = [
        spec({ title: 'Upper A', weekday: 'Mon' }),
        spec({ title: 'Upper B', weekday: 'Thu' }),
      ];
      const movement = new Map<string, string[]>([
        ['bench_a', ['Push']],
        ['bench_b', ['Push']],
      ]);
      const primary = new Map<string, string>([
        ['bench_a', 'Chest'],
        ['bench_b', 'Chest'],
      ]);
      const sessions = [
        session(
          [
            {
              name: 'Barbell Bench Press',
              sets: 4,
              reps: 6,
              exerciseId: 'bench_a',
            },
          ],
          { weekday: 'Mon' },
        ),
        session(
          [
            {
              name: 'Dumbbell Bench Press',
              sets: 4,
              reps: 8,
              exerciseId: 'bench_b',
            },
          ],
          { weekday: 'Thu' },
        ),
      ];
      const r = validateGeneratedProgramChunk(
        specs,
        sessions,
        'detailed',
        movement,
        primary,
      );
      expect(r.ok).toBe(false);
      expect(r.issues).toContain('under_diversified_across_focus');
      expect(r.crossSessionOverlapExerciseIds).toContain('bench_b');
      expect(r.crossSessionOverlapExerciseIds).not.toContain('bench_a');
    });

    it('passes Upper × 2 when angles contrast (flat then incline)', () => {
      const specs = [
        spec({ title: 'Upper A', weekday: 'Mon' }),
        spec({ title: 'Upper B', weekday: 'Thu' }),
      ];
      const movement = new Map<string, string[]>([
        ['bench_a', ['Push']],
        ['incline_b', ['Push']],
      ]);
      const primary = new Map<string, string>([
        ['bench_a', 'Chest'],
        ['incline_b', 'Chest'],
      ]);
      const sessions = [
        session(
          [
            {
              name: 'Barbell Bench Press',
              sets: 4,
              reps: 6,
              exerciseId: 'bench_a',
            },
          ],
          { weekday: 'Mon' },
        ),
        session(
          [
            {
              name: 'Incline Dumbbell Press',
              sets: 4,
              reps: 8,
              exerciseId: 'incline_b',
            },
          ],
          { weekday: 'Thu' },
        ),
      ];
      const r = validateGeneratedProgramChunk(
        specs,
        sessions,
        'detailed',
        movement,
        primary,
      );
      expect(r.issues).not.toContain('under_diversified_across_focus');
      expect(r.crossSessionOverlapExerciseIds).toEqual([]);
    });

    it('flags two squat-led Lower days; passes when one is hinge-led', () => {
      const specsBoth = [
        spec({ title: 'Lower A', weekday: 'Tue' }),
        spec({ title: 'Lower B', weekday: 'Fri' }),
      ];
      const movement = new Map<string, string[]>([
        ['sq1', ['Squat']],
        ['sq2', ['Squat']],
        ['rdl', ['Hinge']],
      ]);
      const primary = new Map<string, string>([
        ['sq1', 'Quadriceps'],
        ['sq2', 'Quadriceps'],
        ['rdl', 'Hamstrings'],
      ]);
      const bothSquats = [
        session([{ name: 'Back Squat', sets: 4, reps: 6, exerciseId: 'sq1' }], {
          weekday: 'Tue',
        }),
        session(
          [{ name: 'Front Squat', sets: 4, reps: 6, exerciseId: 'sq2' }],
          { weekday: 'Fri' },
        ),
      ];
      const r1 = validateGeneratedProgramChunk(
        specsBoth,
        bothSquats,
        'detailed',
        movement,
        primary,
      );
      expect(r1.issues).toContain('under_diversified_across_focus');
      expect(r1.crossSessionOverlapExerciseIds).toContain('sq2');

      const squatThenHinge = [
        session([{ name: 'Back Squat', sets: 4, reps: 6, exerciseId: 'sq1' }], {
          weekday: 'Tue',
        }),
        session(
          [{ name: 'Romanian Deadlift', sets: 4, reps: 8, exerciseId: 'rdl' }],
          { weekday: 'Fri' },
        ),
      ];
      const r2 = validateGeneratedProgramChunk(
        specsBoth,
        squatThenHinge,
        'detailed',
        movement,
        primary,
      );
      expect(r2.issues).not.toContain('under_diversified_across_focus');
    });

    it('does not flag a single Upper day (no pair to compare)', () => {
      const specs = [spec({ title: 'Upper', weekday: 'Mon' })];
      const movement = new Map<string, string[]>([['bench', ['Push']]]);
      const primary = new Map<string, string>([['bench', 'Chest']]);
      const sessions = [
        session(
          [
            {
              name: 'Barbell Bench Press',
              sets: 4,
              reps: 6,
              exerciseId: 'bench',
            },
          ],
          { weekday: 'Mon' },
        ),
      ];
      const r = validateGeneratedProgramChunk(
        specs,
        sessions,
        'detailed',
        movement,
        primary,
      );
      expect(r.issues).not.toContain('under_diversified_across_focus');
    });
  });
});

describe('buildRetryPriorExerciseIds', () => {
  it('places pattern clash ids on tail like duplicates', () => {
    const prior = ['p1'];
    const sessions: GeneratedSession[] = [
      session([
        { name: 'A', sets: 3, reps: 8, exerciseId: 'hinge1' },
        { name: 'B', sets: 3, reps: 8, exerciseId: 'b' },
      ]),
    ];
    const validation = {
      ok: false,
      issues: ['primary_lower_pattern_on_upper_focus'] as ChunkValidatorIssue[],
      duplicateExerciseIds: [] as string[],
      patternClashExerciseIds: ['hinge1'],
      patternOverflowExerciseIds: [] as string[],
      subMuscleOverflowExerciseIds: [] as string[],
      nonAnchorSlotOneExerciseIds: [] as string[],
      crossSessionOverlapExerciseIds: [] as string[],
    };
    const out = buildRetryPriorExerciseIds({
      cappedPrior: prior,
      validation,
      sessions,
    });
    expect(out.includes('hinge1')).toBe(true);
    expect(out[out.length - 1]).toBe('hinge1');
  });

  it('places duplicate ids after base so they survive slice', () => {
    const prior = ['p1', 'p2'];
    const sessions: GeneratedSession[] = [
      session([
        { name: 'A', sets: 3, reps: 8, exerciseId: 'x' },
        { name: 'B', sets: 3, reps: 8, exerciseId: 'y' },
      ]),
    ];
    const validation = {
      ok: false,
      issues: ['duplicate_exercise_id_across_chunk'] as ChunkValidatorIssue[],
      duplicateExerciseIds: ['x'],
      patternClashExerciseIds: [] as string[],
      patternOverflowExerciseIds: [] as string[],
      subMuscleOverflowExerciseIds: [] as string[],
      nonAnchorSlotOneExerciseIds: [] as string[],
      crossSessionOverlapExerciseIds: [] as string[],
    };
    const out = buildRetryPriorExerciseIds({
      cappedPrior: prior,
      validation,
      sessions,
    });
    expect(out.includes('x')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(48);
  });

  it('places pattern overflow ids on tail like duplicates', () => {
    const prior = ['p1'];
    const sessions: GeneratedSession[] = [
      session([
        { name: 'Core1', sets: 3, reps: 12, exerciseId: 'core1' },
        { name: 'Core2', sets: 3, reps: 12, exerciseId: 'core2' },
        { name: 'Squat', sets: 4, reps: 6, exerciseId: 'sq' },
      ]),
    ];
    const validation = {
      ok: false,
      issues: ['over_concentrated_pattern'] as ChunkValidatorIssue[],
      duplicateExerciseIds: [] as string[],
      patternClashExerciseIds: [] as string[],
      patternOverflowExerciseIds: ['core2'],
      subMuscleOverflowExerciseIds: [] as string[],
      nonAnchorSlotOneExerciseIds: [] as string[],
      crossSessionOverlapExerciseIds: [] as string[],
    };
    const out = buildRetryPriorExerciseIds({
      cappedPrior: prior,
      validation,
      sessions,
    });
    expect(out.includes('core2')).toBe(true);
    expect(out[out.length - 1]).toBe('core2');
  });

  it('places sub-muscle overflow ids on the very tail (after pattern overflow)', () => {
    const prior = ['p1'];
    const sessions: GeneratedSession[] = [
      session([
        { name: 'Romanian DL', sets: 4, reps: 8, exerciseId: 'ham1' },
        { name: 'Lying Leg Curl', sets: 3, reps: 10, exerciseId: 'ham2' },
        { name: 'Seated Leg Curl', sets: 3, reps: 10, exerciseId: 'ham3' },
      ]),
    ];
    const validation = {
      ok: false,
      issues: ['over_concentrated_sub_muscle'] as ChunkValidatorIssue[],
      duplicateExerciseIds: [] as string[],
      patternClashExerciseIds: [] as string[],
      patternOverflowExerciseIds: [] as string[],
      subMuscleOverflowExerciseIds: ['ham3'],
      nonAnchorSlotOneExerciseIds: [] as string[],
      crossSessionOverlapExerciseIds: [] as string[],
    };
    const out = buildRetryPriorExerciseIds({
      cappedPrior: prior,
      validation,
      sessions,
    });
    expect(out.includes('ham3')).toBe(true);
    expect(out[out.length - 1]).toBe('ham3');
  });

  it('places non-anchor slot-1 ids on the very tail (after sub-muscle overflow)', () => {
    const prior = ['p1'];
    const sessions: GeneratedSession[] = [
      session([
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
      ]),
    ];
    const validation = {
      ok: false,
      issues: ['slot_one_not_anchor'] as ChunkValidatorIssue[],
      duplicateExerciseIds: [] as string[],
      patternClashExerciseIds: [] as string[],
      patternOverflowExerciseIds: [] as string[],
      subMuscleOverflowExerciseIds: [] as string[],
      nonAnchorSlotOneExerciseIds: ['landmine_press'],
      crossSessionOverlapExerciseIds: [] as string[],
    };
    const out = buildRetryPriorExerciseIds({
      cappedPrior: prior,
      validation,
      sessions,
    });
    expect(out.includes('landmine_press')).toBe(true);
    expect(out[out.length - 1]).toBe('landmine_press');
  });

  it('places cross-session overlap ids on the very tail (after slot-1 anchor)', () => {
    const prior = ['p1'];
    const sessions: GeneratedSession[] = [
      session([
        {
          name: 'Barbell Bench Press',
          sets: 4,
          reps: 6,
          exerciseId: 'bench_a',
        },
      ]),
      session(
        [
          {
            name: 'Dumbbell Bench Press',
            sets: 4,
            reps: 8,
            exerciseId: 'bench_b',
          },
        ],
        { weekday: 'Thu' },
      ),
    ];
    const validation = {
      ok: false,
      issues: ['under_diversified_across_focus'] as ChunkValidatorIssue[],
      duplicateExerciseIds: [] as string[],
      patternClashExerciseIds: [] as string[],
      patternOverflowExerciseIds: [] as string[],
      subMuscleOverflowExerciseIds: [] as string[],
      nonAnchorSlotOneExerciseIds: [] as string[],
      crossSessionOverlapExerciseIds: ['bench_b'],
    };
    const out = buildRetryPriorExerciseIds({
      cappedPrior: prior,
      validation,
      sessions,
    });
    expect(out.includes('bench_b')).toBe(true);
    expect(out[out.length - 1]).toBe('bench_b');
  });
});
