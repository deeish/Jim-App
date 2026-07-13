import type {
  GenerateSessionsDto,
  WeekProgressionDto,
} from './dto/generate-sessions.dto';
import type { GeneratedSession } from './session-enrichment';
import {
  applyWeekProgressionToEnrichedSessions,
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

  it('skips cardio-type sessions entirely', () => {
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

  it('clamps sets to 1 and reps into 1..100', () => {
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
    expect(a.sets).toBe(1); // round(1 * 0.3) = 0 clamped to 1
    expect(a.reps).toBe(6);
    expect(b.reps).toBe(100); // 99 + 5 clamped to 100
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
