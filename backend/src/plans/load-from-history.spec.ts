import type { GenerateSessionsDto } from './dto/generate-sessions.dto';
import type { GeneratedSession } from './session-enrichment';
import type { LastExercisePerformance } from '../workout-logs/last-performance';
import {
  estimateOneRepMax,
  loadForTarget,
  loadFromPerformance,
  roundLoadLb,
  stampLoadsFromHistory,
  isPlateaued,
  PLATEAU_NOTE,
  type LoadExerciseMeta,
} from './load-from-history';

type Spec = GenerateSessionsDto['sessions'][number];

function spec(overrides: Partial<Spec> = {}): Spec {
  return {
    type: 'strength',
    title: 'Upper',
    durationMin: 45,
    durationMax: 60,
    isHardDay: false,
    weekIndex: 0,
    weekday: 'Monday',
    ...overrides,
  };
}

function perf(
  sets: Array<[reps: number, weight: number | null]>,
): LastExercisePerformance {
  return {
    workoutLogId: 'log',
    performedAt: new Date('2026-09-10T10:00:00Z'),
    sets: sets.map(([reps, weight], i) => ({
      setNumber: i + 1,
      reps,
      weight,
    })),
  };
}

const META: Record<string, LoadExerciseMeta> = {
  bench: {
    primaryMuscleGroup: 'Chest',
    type: 'compound',
    equipment: ['barbell'],
    movementPatterns: ['horizontal_push'],
  },
  row: {
    primaryMuscleGroup: 'Back',
    type: 'compound',
    equipment: ['barbell'],
    movementPatterns: ['horizontal_pull'],
  },
  curl: {
    primaryMuscleGroup: 'Biceps',
    type: 'isolation',
    equipment: ['dumbbell'],
  },
  pushup: {
    primaryMuscleGroup: 'Chest',
    type: 'compound',
    equipment: ['bodyweight'],
    movementPatterns: ['horizontal_push'],
  },
  plank: {
    primaryMuscleGroup: 'Core',
    type: 'isolation',
    equipment: ['bodyweight'],
  },
};
const findMeta = (id: string) => META[id];

function session(
  weekIndex: number,
  exercises: GeneratedSession['exercises'],
): GeneratedSession {
  return { weekIndex, weekday: 'Monday', name: 'Upper', exercises };
}

describe('estimateOneRepMax', () => {
  it('reads a logged working set as taken with 2 in reserve and a single as a tested max', () => {
    // 10 reps at 100 → (10 + 2) / 30 → 140
    expect(estimateOneRepMax(perf([[10, 100]]).sets)).toBeCloseTo(140, 5);
    expect(estimateOneRepMax(perf([[1, 200]]).sets)).toBe(200);
  });

  it('ignores unloaded sets and sets above the rep window', () => {
    expect(estimateOneRepMax(perf([[8, null]]).sets)).toBeUndefined();
    expect(estimateOneRepMax(perf([[15, 100]]).sets)).toBeUndefined();
    expect(
      estimateOneRepMax(
        perf([
          [15, 100],
          [8, 120],
        ]).sets,
      ),
    ).toBeCloseTo(120 * (1 + 10 / 30), 5);
  });
});

describe('loadForTarget / roundLoadLb', () => {
  it('hands back what the user just did for the same reps at the same effort', () => {
    const e1rm = estimateOneRepMax(perf([[10, 100]]).sets)!;
    expect(loadForTarget(e1rm, 10, 2)).toBe(100);
  });

  it('moves with the phase: fewer reps and less in reserve is heavier, a deload is lighter', () => {
    const e1rm = estimateOneRepMax(perf([[10, 100]]).sets)!;
    expect(loadForTarget(e1rm, 9, 1)).toBeGreaterThan(100);
    expect(loadForTarget(e1rm, 12, 4)).toBeLessThan(100);
  });

  it('rounds to plates', () => {
    expect(roundLoadLb(101.9)).toBe(100);
    expect(roundLoadLb(102.6)).toBe(105);
    expect(roundLoadLb(13.7)).toBe(12.5);
    expect(roundLoadLb(11.1)).toBe(10);
  });
});

describe('loadFromPerformance', () => {
  it('falls back to the best set when every set was above the rep window and the plan asks for something close', () => {
    expect(
      loadFromPerformance({ reps: 12, repsMin: 12 }, perf([[15, 40]])),
    ).toBe(40);
    expect(
      loadFromPerformance({ reps: 5, repsMin: 5 }, perf([[15, 40]])),
    ).toBeUndefined();
  });
});

describe('stampLoadsFromHistory', () => {
  it('loads rows with history, calibrates a first-week main lift without it, leaves accessories bare', () => {
    const specs = [spec({ weekIndex: 0 }), spec({ weekIndex: 1 })];
    const history = new Map<string, LastExercisePerformance>([
      [
        'row',
        perf([
          [8, 135],
          [8, 135],
          [7, 135],
        ]),
      ],
    ]);
    const week = (wi: number) =>
      session(wi, [
        {
          name: 'Bench Press',
          exerciseId: 'bench',
          sets: 4,
          reps: 8,
          repsMin: 8,
          repsMax: 12,
          targetRir: 2,
          notes: 'Feet planted.',
        },
        {
          name: 'Barbell Row',
          exerciseId: 'row',
          sets: 4,
          reps: 8,
          repsMin: 8,
          repsMax: 12,
          targetRir: 2,
        },
        {
          name: 'Dumbbell Curl',
          exerciseId: 'curl',
          sets: 3,
          reps: 12,
          repsMin: 12,
          repsMax: 15,
          targetRir: 1,
        },
      ]);
    const out = stampLoadsFromHistory({
      sessions: [week(0), week(1)],
      specs,
      history,
      findMeta,
    });
    expect(out.loaded).toBe(2); // the row, both weeks
    expect(out.calibrated).toBe(1); // bench, week 0 only
    expect(out.liftsWithHistory).toBe(1);

    const [w0, w1] = out.sessions;
    expect(w0.exercises[1].weight).toBe(135);
    expect(w1.exercises[1].weight).toBe(135);
    expect(w0.exercises[0].weight).toBeUndefined();
    expect(w0.exercises[0].notes).toBe(
      'Feet planted. Calibration: no logged history for this lift yet. Work up over 2-3 sets to one set of 8 with about 2 reps left in the tank, log it, and your next plan builds its loads from it.',
    );
    expect(w1.exercises[0].notes).toBe('Feet planted.');
    expect(w0.exercises[2].weight).toBeUndefined();
    expect(w0.exercises[2].notes).toBeUndefined();
  });

  it('follows the week progression: the same history loads a peak week heavier and a deload lighter', () => {
    const specs = [spec({ weekIndex: 2 }), spec({ weekIndex: 3 })];
    const history = new Map<string, LastExercisePerformance>([
      [
        'bench',
        perf([
          [8, 155],
          [8, 155],
        ]),
      ],
    ]);
    const out = stampLoadsFromHistory({
      sessions: [
        session(2, [
          {
            name: 'Bench Press',
            exerciseId: 'bench',
            sets: 4,
            reps: 6,
            repsMin: 6,
            repsMax: 10,
            targetRir: 0,
          },
        ]),
        session(3, [
          {
            name: 'Bench Press',
            exerciseId: 'bench',
            sets: 2,
            reps: 10,
            repsMin: 10,
            repsMax: 14,
            targetRir: 4,
          },
        ]),
      ],
      specs,
      history,
      findMeta,
    });
    const peak = out.sessions[0].exercises[0].weight!;
    const deload = out.sessions[1].exercises[0].weight!;
    expect(peak).toBeGreaterThan(155);
    expect(deload).toBeLessThan(155);
  });

  it('never loads bodyweight, core, time or cardio rows, and replaces a model-guessed load when history exists', () => {
    const history = new Map<string, LastExercisePerformance>([
      ['pushup', perf([[12, null]])],
      ['bench', perf([[5, 185]])],
    ]);
    const out = stampLoadsFromHistory({
      sessions: [
        session(0, [
          {
            name: 'Bench Press',
            exerciseId: 'bench',
            sets: 4,
            reps: 5,
            repsMin: 5,
            repsMax: 8,
            targetRir: 2,
            weight: 95, // the model's guess
          },
          {
            name: 'Push-Up',
            exerciseId: 'pushup',
            sets: 3,
            reps: 12,
            repsMin: 12,
            repsMax: 15,
          },
          {
            name: 'Plank',
            exerciseId: 'plank',
            sets: 3,
            reps: 45,
            durationSeconds: 45,
            prescriptionType: 'time',
          },
          {
            name: 'Treadmill Jog',
            sets: 1,
            reps: 600,
            durationSeconds: 600,
            prescriptionType: 'time',
            primaryMuscleGroup: 'Cardio',
          },
        ]),
      ],
      specs: [spec({ weekIndex: 0 })],
      history,
      findMeta,
    });
    const rows = out.sessions[0].exercises;
    expect(rows[0].weight).toBe(185);
    expect(rows[1].weight).toBeUndefined();
    expect(rows[1].notes).toBeUndefined();
    expect(rows[2].weight).toBeUndefined();
    expect(rows[3].weight).toBeUndefined();
    expect(out.calibrated).toBe(0);
  });

  it('is a no-op on cardio sessions and returns the same session objects when nothing changes', () => {
    const s = session(0, [
      {
        name: 'Rowing Machine',
        exerciseId: 'rower',
        sets: 1,
        reps: 1200,
        durationSeconds: 1200,
        prescriptionType: 'time',
      },
    ]);
    const out = stampLoadsFromHistory({
      sessions: [s],
      specs: [spec({ type: 'cardio', weekIndex: 0 })],
      history: new Map(),
      findMeta,
    });
    expect(out.sessions[0]).toBe(s);
    expect(out.loaded).toBe(0);
  });
});

describe('plateau (Tier 4b)', () => {
  const flat = () => [
    perf([
      [8, 135],
      [8, 135],
    ]),
    perf([
      [8, 135],
      [7, 135],
    ]),
    perf([
      [8, 135],
      [8, 135],
    ]),
  ];

  it('three sessions at the same top load with no rep gained is a plateau; a rep gained or a load change is not', () => {
    expect(isPlateaued(flat())).toBe(true);
    expect(isPlateaued(flat().slice(0, 2))).toBe(false);
    expect(
      isPlateaued([perf([[9, 135]]), perf([[8, 135]]), perf([[8, 135]])]),
    ).toBe(false);
    expect(
      isPlateaued([perf([[8, 140]]), perf([[8, 135]]), perf([[8, 135]])]),
    ).toBe(false);
    expect(
      isPlateaued([perf([[8, null]]), perf([[8, 135]]), perf([[8, 135]])]),
    ).toBe(false);
  });

  it('cuts the first week by a tenth with a note and lets later weeks progress from history as usual', () => {
    const history = new Map<string, LastExercisePerformance[]>([
      ['bench', flat()],
    ]);
    const row = () => ({
      name: 'Bench Press',
      exerciseId: 'bench',
      sets: 4,
      reps: 8,
      repsMin: 8,
      repsMax: 12,
      targetRir: 2,
    });
    const out = stampLoadsFromHistory({
      sessions: [session(0, [row()]), session(1, [row()])],
      specs: [spec({ weekIndex: 0 }), spec({ weekIndex: 1 })],
      history,
      findMeta,
    });
    expect(out.deloaded).toBe(1);
    const w0 = out.sessions[0].exercises[0];
    const w1 = out.sessions[1].exercises[0];
    expect(w1.weight).toBe(135);
    expect(w0.weight).toBe(120); // 135 × 0.9 = 121.5 → nearest 5 lb
    expect(w0.notes).toBe(PLATEAU_NOTE);
    expect(w1.notes).toBeUndefined();
  });

  it('still accepts a single performance per lift', () => {
    const out = stampLoadsFromHistory({
      sessions: [
        session(0, [
          {
            name: 'Bench Press',
            exerciseId: 'bench',
            sets: 4,
            reps: 8,
            repsMin: 8,
            repsMax: 12,
            targetRir: 2,
          },
        ]),
      ],
      specs: [spec({ weekIndex: 0 })],
      history: new Map([['bench', perf([[8, 135]])]]),
      findMeta,
    });
    expect(out.sessions[0].exercises[0].weight).toBe(135);
    expect(out.deloaded).toBe(0);
  });
});
