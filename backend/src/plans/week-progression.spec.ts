import type {
  GenerateSessionsDto,
  WeekProgressionDto,
} from './dto/generate-sessions.dto';
import type { GeneratedSession } from './session-enrichment';
import { workingSetCap } from './session-enrichment';
import {
  applyWeekProgressionToEnrichedSessions,
  DELOAD_CARDIO_REASONING_NOTE,
  DELOAD_REASONING_NOTE,
} from './week-progression';

type Spec = GenerateSessionsDto['sessions'][number];

function spec(overrides: Partial<Spec> = {}): Spec {
  return {
    type: 'strength',
    title: 'Upper',
    durationMin: 40,
    durationMax: 60,
    isHardDay: false,
    weekIndex: 1,
    weekday: 'Monday',
    ...overrides,
  };
}

function session(overrides: Partial<GeneratedSession> = {}): GeneratedSession {
  return {
    weekIndex: 1,
    weekday: 'Monday',
    name: 'Upper',
    reasoning: 'Bench leads the session while you are freshest.',
    exercises: [
      {
        name: 'Bench Press',
        sets: 4,
        reps: 5,
        repsMin: 5,
        repsMax: 8,
        exerciseId: 'bench',
      },
      {
        name: 'Cable Row',
        sets: 3,
        reps: 10,
        repsMin: 10,
        repsMax: 15,
        exerciseId: 'row',
      },
    ],
    ...overrides,
  };
}

function progression(
  weekIndex: number,
  phase: string,
  volumeMultiplier: number,
  repModifier: number,
): WeekProgressionDto {
  return { weekIndex, phase, intensityPct: 70, volumeMultiplier, repModifier };
}

describe('applyWeekProgressionToEnrichedSessions', () => {
  it('leaves a neutral week (x1.0, +0) untouched', () => {
    const input = [session()];
    const { sessions, adjustedSessionCount } =
      applyWeekProgressionToEnrichedSessions({
        sessions: input,
        specs: [spec()],
        weekProgression: [progression(1, 'foundation', 1.0, 0)],
      });
    expect(adjustedSessionCount).toBe(0);
    expect(sessions[0]).toBe(input[0]);
  });

  it('scales sets and shifts the rep band on a progression week', () => {
    const { sessions, adjustedSessionCount } =
      applyWeekProgressionToEnrichedSessions({
        sessions: [session({ weekIndex: 2 })],
        specs: [spec({ weekIndex: 2 })],
        weekProgression: [progression(2, 'progression', 1.15, -1)],
      });
    expect(adjustedSessionCount).toBe(1);
    const [bench, row] = sessions[0].exercises;
    // round(4 * 1.15) = 5; 5-8 shifts to 4-7
    expect(bench.sets).toBe(5);
    expect(bench.reps).toBe(4);
    expect(bench.repsMin).toBe(4);
    expect(bench.repsMax).toBe(7);
    // round(3 * 1.15) = 3 — a +15% week must not add a set to every row
    expect(row.sets).toBe(3);
    expect(row.reps).toBe(9);
  });

  it('drifts the effort target with the phase and never sends a compound to failure', () => {
    const withRir = (weekIndex: number) =>
      session({
        weekIndex,
        exercises: [
          {
            name: 'Bench Press',
            sets: 4,
            reps: 5,
            repsMin: 5,
            repsMax: 8,
            exerciseId: 'bench',
            targetRir: 2,
          },
          {
            name: 'Cable Curl',
            sets: 3,
            reps: 12,
            repsMin: 12,
            repsMax: 15,
            exerciseId: 'curl',
            targetRir: 1,
          },
        ],
      });
    const run = (weekIndex: number, phase: string, mult: number, mod: number) =>
      applyWeekProgressionToEnrichedSessions({
        sessions: [withRir(weekIndex)],
        specs: [spec({ weekIndex })],
        weekProgression: [progression(weekIndex, phase, mult, mod)],
      }).sessions[0].exercises.map((e) => e.targetRir);
    expect(run(2, 'progression', 1.15, -1)).toEqual([1, 0]);
    // peak: −2, but the bench floors at 1 while the curl (isolation) may hit 0
    expect(run(3, 'peak', 1.25, -2)).toEqual([1, 0]);
    expect(run(4, 'deload', 0.7, 2)).toEqual([4, 3]);
  });

  it('trims sets, lightens reps, and appends the note on a deload week', () => {
    const { sessions } = applyWeekProgressionToEnrichedSessions({
      sessions: [session({ weekIndex: 4 })],
      specs: [spec({ weekIndex: 4 })],
      weekProgression: [progression(4, 'deload', 0.7, 2)],
    });
    const [bench] = sessions[0].exercises;
    // round(4 * 0.7) = 3; 5-8 shifts to 7-10
    expect(bench.sets).toBe(3);
    expect(bench.reps).toBe(7);
    expect(bench.repsMax).toBe(10);
    expect(sessions[0].reasoning).toContain(DELOAD_REASONING_NOTE);
  });

  it('does not duplicate the deload note when it is already present', () => {
    const already = session({
      weekIndex: 4,
      reasoning: `Something. ${DELOAD_REASONING_NOTE}`,
    });
    const { sessions } = applyWeekProgressionToEnrichedSessions({
      sessions: [already],
      specs: [spec({ weekIndex: 4 })],
      weekProgression: [progression(4, 'deload', 0.7, 2)],
    });
    const count = (sessions[0].reasoning?.split(DELOAD_REASONING_NOTE) ?? [])
      .length;
    expect(count).toBe(2); // one occurrence
  });

  it('skips cardio and time rows so durations survive a deload', () => {
    const withCardio = session({
      weekIndex: 4,
      exercises: [
        session().exercises[0],
        {
          name: 'Front Plank',
          sets: 3,
          reps: 40,
          durationSeconds: 40,
          prescriptionType: 'time',
          exerciseId: 'plank',
        },
        {
          name: 'Treadmill Jog',
          sets: 1,
          reps: 600,
          durationSeconds: 600,
          primaryMuscleGroup: 'Cardio',
          exerciseId: 'jog',
        },
      ],
    });
    const { sessions } = applyWeekProgressionToEnrichedSessions({
      sessions: [withCardio],
      specs: [spec({ weekIndex: 4 })],
      weekProgression: [progression(4, 'deload', 0.7, 2)],
    });
    const [, plank, jog] = sessions[0].exercises;
    expect(plank.sets).toBe(3);
    expect(plank.durationSeconds).toBe(40);
    expect(plank.reps).toBe(40);
    expect(jog.sets).toBe(1);
    expect(jog.durationSeconds).toBe(600);
  });

  it('leaves a cardio-type session with no timed block untouched', () => {
    const cardioDay = session({ name: 'Cardio', weekIndex: 2 });
    const { sessions, adjustedSessionCount } =
      applyWeekProgressionToEnrichedSessions({
        sessions: [cardioDay],
        specs: [spec({ type: 'cardio', title: 'Cardio', weekIndex: 2 })],
        weekProgression: [progression(2, 'progression', 1.15, -1)],
      });
    expect(adjustedSessionCount).toBe(0);
    expect(sessions[0]).toBe(cardioDay);
  });

  it('leaves weeks without a progression entry unchanged', () => {
    const input = [session({ weekIndex: 3 })];
    const { sessions } = applyWeekProgressionToEnrichedSessions({
      sessions: input,
      specs: [spec({ weekIndex: 3 })],
      weekProgression: [progression(2, 'progression', 1.15, -1)],
    });
    expect(sessions[0]).toBe(input[0]);
  });

  it('floors progressed sets at 2 (1-set rows stay 1) and clamps reps into 1..100', () => {
    const tiny = session({
      weekIndex: 4,
      exercises: [
        { name: 'A', sets: 1, reps: 1, exerciseId: 'a' },
        { name: 'B', sets: 3, reps: 99, exerciseId: 'b' },
      ],
    });
    const { sessions } = applyWeekProgressionToEnrichedSessions({
      sessions: [tiny],
      specs: [spec({ weekIndex: 4 })],
      weekProgression: [progression(4, 'deload', 0.3, 5)],
    });
    const [a, b] = sessions[0].exercises;
    expect(a.sets).toBe(1); // 1-set rows keep their shape
    expect(a.reps).toBe(6);
    expect(b.sets).toBe(2); // round(3 * 0.3) = 1 floored to 2 working sets
    expect(b.reps).toBe(100); // 99 + 5 clamped to 100
  });

  it('never deloads a 2-set accessory down to a single working set', () => {
    const twoSet = session({
      weekIndex: 4,
      exercises: [
        { name: 'Bench Press', sets: 4, reps: 5, exerciseId: 'bench' },
        {
          name: 'Seated Dumbbell Shoulder Press',
          sets: 2,
          reps: 6,
          exerciseId: 'ohp',
        },
      ],
    });
    const { sessions } = applyWeekProgressionToEnrichedSessions({
      sessions: [twoSet],
      specs: [spec({ weekIndex: 4 })],
      weekProgression: [progression(4, 'deload', 0.7, 2)],
    });
    const [bench, press] = sessions[0].exercises;
    expect(bench.sets).toBe(3); // round(4 * 0.7)
    expect(press.sets).toBe(2); // round(2 * 0.7) = 1 floored to 2
  });

  it('keeps the canonical rep band on bodyweight, unilateral, and isolation rows when the week goes heavier', () => {
    const peak = session({
      weekIndex: 3,
      exercises: [
        {
          name: 'Bench Press',
          sets: 4,
          reps: 6,
          repsMin: 6,
          repsMax: 8,
          exerciseId: 'bench',
        },
        {
          name: 'Dumbbell Bulgarian Split Squat',
          sets: 3,
          reps: 6,
          repsMin: 6,
          repsMax: 8,
          exerciseId: 'bss',
        },
        {
          name: 'Dumbbell Lateral Raise',
          sets: 3,
          reps: 8,
          repsMin: 8,
          repsMax: 12,
          exerciseId: 'raise',
        },
        {
          name: 'Glute Bridge',
          sets: 3,
          reps: 8,
          repsMin: 8,
          repsMax: 12,
          exerciseId: 'bridge',
        },
      ],
    });
    const findMeta = (id: string) =>
      id === 'bridge'
        ? { primaryEquipment: [] } // true bodyweight
        : { primaryEquipment: ['Dumbbell'] };
    const { sessions } = applyWeekProgressionToEnrichedSessions({
      sessions: [peak],
      specs: [spec({ weekIndex: 3 })],
      weekProgression: [progression(3, 'peak', 1.0, -2)],
      findMeta,
    });
    const [bench, bss, raise, bridge] = sessions[0].exercises;
    expect(bench.reps).toBe(4); // loaded bilateral compound takes the shift
    expect(bench.repsMax).toBe(6);
    expect(bss.reps).toBe(6); // unilateral keeps its band
    expect(raise.reps).toBe(8); // isolation keeps its band
    expect(bridge.reps).toBe(8); // bodyweight keeps its band
    expect(bridge.repsMax).toBe(12);
  });

  it('still lightens bodyweight and unilateral rows on a deload (+reps is always safe)', () => {
    const deload = session({
      weekIndex: 4,
      exercises: [
        {
          name: 'Dumbbell Bulgarian Split Squat',
          sets: 3,
          reps: 6,
          repsMin: 6,
          repsMax: 8,
          exerciseId: 'bss',
        },
      ],
    });
    const { sessions } = applyWeekProgressionToEnrichedSessions({
      sessions: [deload],
      specs: [spec({ weekIndex: 4 })],
      weekProgression: [progression(4, 'deload', 0.7, 2)],
    });
    expect(sessions[0].exercises[0].reps).toBe(8);
    expect(sessions[0].exercises[0].repsMax).toBe(10);
  });

  it('re-clamps a volume week into the session time budget, sparing slot 1 and the cardio tail', () => {
    const full = session({
      weekIndex: 3,
      exercises: [
        { name: 'Bench Press', sets: 4, reps: 5, exerciseId: 'bench' },
        { name: 'Barbell Bent-Over Row', sets: 4, reps: 6, exerciseId: 'row' },
        { name: 'Overhead Press', sets: 4, reps: 6, exerciseId: 'press' },
        {
          name: 'Wide-Grip Lat Pulldown',
          sets: 4,
          reps: 8,
          exerciseId: 'pulldown',
        },
        { name: 'Back Squat', sets: 4, reps: 6, exerciseId: 'squat' },
        {
          name: 'Treadmill Walk (Easy / Zone 2)',
          sets: 1,
          reps: 600,
          durationSeconds: 600,
          primaryMuscleGroup: 'Cardio',
          exerciseId: 'walk',
        },
      ],
    });
    const findMeta = (id: string) =>
      id === 'walk'
        ? { primaryMuscleGroup: 'Cardio' }
        : { primaryEquipment: ['Barbell'] };
    const { sessions } = applyWeekProgressionToEnrichedSessions({
      sessions: [full],
      specs: [spec({ weekIndex: 3, durationMin: 30, durationMax: 60 })],
      weekProgression: [progression(3, 'peak', 1.25, -2)],
      findMeta,
      prefs: { goal: 'hybrid', difficulty: 'advanced' },
    });
    const rows = sessions[0].exercises;
    const strengthSets = rows
      .filter((e) => e.exerciseId !== 'walk')
      .reduce((sum, e) => sum + e.sets, 0);
    // 20 baseline sets × 1.25 = 25; the budget-derived cap (60 min minus the
    // 10-min cardio tail) must pull the total back under the raw multiplied
    // volume so the session still fits the slot.
    expect(strengthSets).toBeLessThan(25);
    expect(strengthSets).toBeLessThanOrEqual(
      workingSetCap({
        goal: 'hybrid',
        difficulty: 'advanced',
        durationMinutes: 50,
      }),
    );
    // Slot 1 is never trimmed; the cardio tail keeps its duration.
    expect(rows[0].sets).toBe(5); // round(4 * 1.25)
    expect(rows[5].durationSeconds).toBe(600);
    expect(rows[5].sets).toBe(1);
  });

  it('does not mutate the input sessions when the volume clamp rewrites rows', () => {
    const input = session({
      weekIndex: 3,
      exercises: [
        { name: 'Bench Press', sets: 4, reps: 5, exerciseId: 'bench' },
        { name: 'Barbell Bent-Over Row', sets: 4, reps: 6, exerciseId: 'row' },
        { name: 'Overhead Press', sets: 4, reps: 6, exerciseId: 'press' },
        { name: 'Back Squat', sets: 4, reps: 6, exerciseId: 'squat' },
        { name: 'Front Squat', sets: 4, reps: 6, exerciseId: 'fsquat' },
      ],
    });
    const before = JSON.parse(JSON.stringify(input));
    applyWeekProgressionToEnrichedSessions({
      sessions: [input],
      specs: [spec({ weekIndex: 3, durationMin: 30, durationMax: 45 })],
      weekProgression: [progression(3, 'peak', 1.25, -2)],
      findMeta: () => ({ primaryEquipment: ['Barbell'] }),
      prefs: { goal: 'strength', difficulty: 'beginner' },
    });
    expect(input).toEqual(before);
  });

  it('applies each week independently in a merged 2-week program', () => {
    const { sessions } = applyWeekProgressionToEnrichedSessions({
      sessions: [session(), session({ weekIndex: 2 })],
      specs: [spec(), spec({ weekIndex: 2 })],
      weekProgression: [
        progression(1, 'foundation', 1.0, 0),
        progression(2, 'progression', 1.15, -1),
      ],
    });
    expect(sessions[0].exercises[0].sets).toBe(4);
    expect(sessions[0].exercises[0].reps).toBe(5);
    expect(sessions[1].exercises[0].sets).toBe(5);
    expect(sessions[1].exercises[0].reps).toBe(4);
  });
});

describe('cardio days across the block (Tier 2e)', () => {
  const cardioDay = (weekIndex: number): GeneratedSession =>
    session({
      name: 'Cardio',
      weekIndex,
      reasoning: 'Aerobic base day.',
      exercises: [
        {
          name: 'Treadmill Jog (Steady)',
          exerciseId: 'treadmill_jog_steady',
          sets: 1,
          reps: 1500,
          durationSeconds: 1500,
          prescriptionType: 'time',
          primaryMuscleGroup: 'Cardio',
          notes:
            "25 min at a steady, conversational pace (zone 2). If you can't talk in short sentences, ease off.",
        },
        {
          name: 'Plank',
          exerciseId: 'plank',
          sets: 3,
          reps: 40,
          durationSeconds: 40,
          prescriptionType: 'time',
          primaryMuscleGroup: 'Core',
          notes: 'Easy core work while your heart rate settles.',
        },
      ],
    });
  const cardioSpec = (weekIndex: number) =>
    spec({
      type: 'cardio',
      title: 'Cardio',
      weekIndex,
      durationMin: 30,
      durationMax: 45,
    });

  it('lengthens the main block by a tenth on a progression week and rewrites the note to match', () => {
    const { sessions, adjustedSessionCount } =
      applyWeekProgressionToEnrichedSessions({
        sessions: [cardioDay(2)],
        specs: [cardioSpec(2)],
        weekProgression: [progression(2, 'progression', 1.15, -1)],
      });
    expect(adjustedSessionCount).toBe(1);
    const main = sessions[0].exercises[0];
    expect(main.durationSeconds).toBe(28 * 60); // 25 × 1.1 = 27.5 → 28
    expect(main.reps).toBe(28 * 60);
    expect(main.notes?.startsWith('28 min at a steady')).toBe(true);
    // The core tail is untouched.
    expect(sessions[0].exercises[1].durationSeconds).toBe(40);
  });

  it('caps a peak week at the slot and shortens a deload by a quarter with its own note', () => {
    const peak = applyWeekProgressionToEnrichedSessions({
      sessions: [cardioDay(3)],
      specs: [cardioSpec(3)],
      weekProgression: [progression(3, 'peak', 1.25, -2)],
    }).sessions[0];
    // 25 × 1.2 = 30 min, the 45-min slot minus 15 of overhead allows exactly that.
    expect(peak.exercises[0].durationSeconds).toBe(30 * 60);

    const deload = applyWeekProgressionToEnrichedSessions({
      sessions: [cardioDay(4)],
      specs: [cardioSpec(4)],
      weekProgression: [progression(4, 'deload', 0.7, 2)],
    }).sessions[0];
    expect(deload.exercises[0].durationSeconds).toBe(19 * 60); // 25 × 0.75 = 18.75 → 19
    expect(deload.exercises[0].notes?.startsWith('19 min')).toBe(true);
    expect(deload.reasoning).toContain(DELOAD_CARDIO_REASONING_NOTE);
  });

  it('keeps interval copy as intervals and leaves a model-written note that names no minutes alone', () => {
    const day = cardioDay(2);
    day.exercises[0] = {
      ...day.exercises[0],
      name: 'Treadmill Run (Intervals)',
      notes: 'Keep the brisk minutes honest.',
    };
    const out = applyWeekProgressionToEnrichedSessions({
      sessions: [day],
      specs: [cardioSpec(2)],
      weekProgression: [progression(2, 'progression', 1.15, -1)],
    }).sessions[0];
    expect(out.exercises[0].durationSeconds).toBe(28 * 60);
    expect(out.exercises[0].notes).toBe('Keep the brisk minutes honest.');
  });

  it('leaves a foundation week and a cardio day with no timed block untouched', () => {
    const day = cardioDay(1);
    const same = applyWeekProgressionToEnrichedSessions({
      sessions: [day],
      specs: [cardioSpec(1)],
      weekProgression: [progression(1, 'foundation', 1, 0)],
    });
    expect(same.sessions[0]).toBe(day);
    expect(same.adjustedSessionCount).toBe(0);
  });
});
