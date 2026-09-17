import {
  COACH_CHECK_MAX,
  COACH_CHECK_MAX_TOTAL,
  coachCheckProgram,
  coachCheckWeek,
  weeklyVolumeBand,
  type CoachMeta,
} from './coach-check';
import type { GeneratedSession } from './session-enrichment';

const CATALOG: Record<string, CoachMeta> = {
  bench: {
    primaryMuscleGroup: 'Chest',
    secondaryMuscleGroups: ['Shoulders', 'Arms'],
    movementPatterns: ['Push'],
    type: 'Compound',
  },
  row: {
    primaryMuscleGroup: 'Back',
    secondaryMuscleGroups: ['Arms'],
    movementPatterns: ['Pull'],
    type: 'Compound',
  },
  ohp: {
    primaryMuscleGroup: 'Shoulders',
    secondaryMuscleGroups: ['Arms'],
    movementPatterns: ['Push'],
    type: 'Compound',
  },
  pulldown: {
    primaryMuscleGroup: 'Back',
    secondaryMuscleGroups: ['Arms'],
    movementPatterns: ['Pull'],
    type: 'Compound',
  },
  squat: {
    primaryMuscleGroup: 'Legs',
    secondaryMuscleGroups: ['Core'],
    movementPatterns: ['Squat'],
    type: 'Compound',
  },
  deadlift: {
    primaryMuscleGroup: 'Legs',
    secondaryMuscleGroups: ['Back'],
    movementPatterns: ['Hinge'],
    type: 'Compound',
  },
  rdl: {
    primaryMuscleGroup: 'Legs',
    movementPatterns: ['Hinge'],
    type: 'Compound',
  },
  backext: {
    primaryMuscleGroup: 'Legs',
    movementPatterns: ['Hinge'],
    type: 'Isolation',
  },
  curl: { primaryMuscleGroup: 'Arms', movementPatterns: [], type: 'Isolation' },
  plank: {
    primaryMuscleGroup: 'Core',
    movementPatterns: ['Core'],
    type: 'Isolation',
  },
  clean: {
    primaryMuscleGroup: 'Legs',
    movementPatterns: ['Hinge'],
    type: 'Compound',
  },
  jog: { primaryMuscleGroup: 'Cardio', movementPatterns: ['Cardio'] },
};
const findMeta = (id: string) => CATALOG[id];

type Row = GeneratedSession['exercises'][number];
const row = (
  exerciseId: string,
  name: string,
  sets: number,
  over: Partial<Row> & { targetRir?: number } = {},
): Row => ({
  exerciseId,
  name,
  sets,
  reps: 8,
  repsMin: 8,
  repsMax: 12,
  restSeconds: 90,
  ...over,
});
/** A row with an effort target, as Tier 2 will stamp it. */
const rir = (
  exerciseId: string,
  name: string,
  sets: number,
  over: Partial<Row> = {},
): Row => row(exerciseId, name, sets, { ...over, targetRir: 2 });

const session = (
  weekday: string,
  name: string,
  exercises: Row[],
): GeneratedSession => ({
  weekIndex: 1,
  weekday,
  name,
  exercises,
});
const strength = (weekday: string, title: string) =>
  ({ type: 'strength', weekday, title }) as const;

describe('weeklyVolumeBand', () => {
  it('tightens with level and lowers the floor for strength and endurance', () => {
    expect(weeklyVolumeBand('hypertrophy', 'beginner')).toEqual({
      min: 6,
      max: 18,
    });
    expect(weeklyVolumeBand('hypertrophy', 'intermediate')).toEqual({
      min: 8,
      max: 22,
    });
    expect(weeklyVolumeBand('strength', 'intermediate')).toEqual({
      min: 6,
      max: 22,
    });
    expect(weeklyVolumeBand('endurance', 'advanced')).toEqual({
      min: 7,
      max: 22,
    });
  });
});

describe('coachCheckWeek', () => {
  it('counts direct and fractional sets and exposures per muscle', () => {
    const r = coachCheckWeek({
      weekIndex: 1,
      prefs: { goal: 'hypertrophy', difficulty: 'intermediate' },
      findMeta,
      sessions: [
        {
          spec: strength('Monday', 'Upper'),
          session: session('Monday', 'Upper', [
            row('bench', 'Bench', 4),
            row('row', 'Row', 4),
          ]),
        },
        {
          spec: strength('Thursday', 'Upper'),
          session: session('Thursday', 'Upper', [
            row('ohp', 'OHP', 4),
            row('pulldown', 'Pulldown', 4),
          ]),
        },
      ],
    });
    expect(r.volumeByMuscle.Chest).toEqual({
      direct: 4,
      weighted: 4,
      exposures: 1,
    });
    expect(r.volumeByMuscle.Back).toEqual({
      direct: 8,
      weighted: 8,
      exposures: 2,
    });
    // Arms: 0 direct, 0.5 × (4 + 4 + 4 + 4) secondary
    expect(r.volumeByMuscle.Arms).toEqual({
      direct: 0,
      weighted: 8,
      exposures: 0,
    });
    expect(r.patternSets).toEqual({ Push: 8, Pull: 8, Squat: 0, Hinge: 0 });
  });

  it("the review's sample week: two-set accessories read as low volume, three hinges as stacking", () => {
    const r = coachCheckWeek({
      weekIndex: 1,
      prefs: { goal: 'strength', difficulty: 'intermediate' },
      findMeta,
      sessions: [
        {
          spec: strength('Monday', 'Upper'),
          session: session('Monday', 'Upper', [
            row('bench', 'Bench', 5, { restSeconds: 150 }),
            row('row', 'Row', 2, { restSeconds: 120 }),
            row('ohp', 'OHP', 2, { restSeconds: 120 }),
          ]),
        },
        {
          spec: strength('Tuesday', 'Lower'),
          session: session('Tuesday', 'Lower', [
            row('squat', 'Squat', 5, { restSeconds: 150 }),
            row('deadlift', 'Deadlift', 2),
            row('rdl', 'RDL', 2),
            row('backext', 'Back Extension', 2),
          ]),
        },
        {
          spec: strength('Thursday', 'Upper'),
          session: session('Thursday', 'Upper', [
            row('bench', 'DB Bench', 5, { restSeconds: 150 }),
            row('row', 'DB Row', 2),
            row('plank', 'Side Plank', 2, {
              restSeconds: 120,
              prescriptionType: 'time',
            }),
          ]),
        },
        {
          spec: strength('Friday', 'Lower'),
          session: session('Friday', 'Lower', [
            row('rdl', 'DB RDL', 5, { restSeconds: 150 }),
            row('squat', 'Goblet', 2),
            row('clean', 'Power Clean', 2),
          ]),
        },
      ],
    });
    const codes = r.findings.map((f) => f.code);
    expect(codes).toContain('stacking');
    expect(r.findings.find((f) => f.code === 'stacking')?.weekday).toBe(
      'Tuesday',
    );
    expect(codes).toContain('volume_low'); // Back: 2 + 2 direct (+1 from the deadlift) = 5 < 6
    expect(codes).toContain('rest_accessory_long'); // the plank at 120 s
    expect(r.scores.patternStacking).toBe(COACH_CHECK_MAX.patternStacking - 2);
    expect(r.scores.weeklyVolume).toBeLessThan(COACH_CHECK_MAX.weeklyVolume);
  });

  it('gates technical lifts for beginners only', () => {
    const rows = [row('clean', 'Power Clean', 3), row('squat', 'Squat', 3)];
    const beginner = coachCheckWeek({
      weekIndex: 1,
      prefs: { goal: 'strength', difficulty: 'beginner' },
      findMeta,
      sessions: [
        {
          spec: strength('Monday', 'Lower'),
          session: session('Monday', 'Lower', rows),
        },
      ],
    });
    expect(beginner.scores.skillGate).toBe(0);
    expect(
      beginner.findings.some(
        (f) => f.code === 'skill_gate' && f.severity === 'high',
      ),
    ).toBe(true);
    const advanced = coachCheckWeek({
      weekIndex: 1,
      prefs: { goal: 'strength', difficulty: 'advanced' },
      findMeta,
      sessions: [
        {
          spec: strength('Monday', 'Lower'),
          session: session('Monday', 'Lower', rows),
        },
      ],
    });
    expect(advanced.scores.skillGate).toBe(COACH_CHECK_MAX.skillGate);
  });

  it('flags a short-rested main lift and counts effort coverage', () => {
    const r = coachCheckWeek({
      weekIndex: 1,
      prefs: { goal: 'strength', difficulty: 'intermediate' },
      findMeta,
      sessions: [
        {
          spec: strength('Monday', 'Upper'),
          session: session('Monday', 'Upper', [
            row('bench', 'Bench', 4, { restSeconds: 60, weight: 185 }),
            row('row', 'Row', 4),
            row('jog', 'Treadmill Jog', 1, { prescriptionType: 'time' }),
          ]),
        },
      ],
    });
    expect(r.findings.some((f) => f.code === 'rest_main_short')).toBe(true);
    expect(r.effortCoverage).toBe(0.5); // the bench has a load, the row has neither load nor RIR; the jog is cardio
    expect(r.scores.effortTarget).toBe(2);
  });

  it('a press, a second press and a pushdown is a normal upper day, not a stack', () => {
    const r = coachCheckWeek({
      weekIndex: 1,
      prefs: { goal: 'hypertrophy', difficulty: 'intermediate' },
      findMeta: (id) =>
        id === 'pushdown'
          ? {
              primaryMuscleGroup: 'Arms',
              movementPatterns: ['Push'],
              type: 'Isolation',
            }
          : CATALOG[id],
      sessions: [
        {
          spec: strength('Monday', 'Upper'),
          session: session('Monday', 'Upper', [
            row('bench', 'Bench', 4),
            row('ohp', 'OHP', 3),
            row('pushdown', 'Triceps Pushdown', 3),
            row('row', 'Row', 4),
          ]),
        },
      ],
    });
    expect(r.findings.some((f) => f.code === 'stacking')).toBe(false);
    expect(r.scores.patternStacking).toBe(COACH_CHECK_MAX.patternStacking);
  });

  it('a clean week with effort targets scores the ceiling', () => {
    const r = coachCheckWeek({
      weekIndex: 1,
      prefs: { goal: 'hypertrophy', difficulty: 'intermediate' },
      findMeta,
      sessions: [
        {
          spec: strength('Monday', 'Upper'),
          session: session('Monday', 'Upper', [
            rir('bench', 'Bench', 4, { restSeconds: 150 }),
            rir('row', 'Row', 4),
            rir('ohp', 'OHP', 3),
            rir('curl', 'Curl', 3, { restSeconds: 60 }),
          ]),
        },
        {
          spec: strength('Tuesday', 'Lower'),
          session: session('Tuesday', 'Lower', [
            rir('squat', 'Squat', 4, { restSeconds: 150 }),
            rir('rdl', 'RDL', 4),
            row('plank', 'Plank', 3, {
              restSeconds: 60,
              prescriptionType: 'time',
            }),
          ]),
        },
        {
          spec: strength('Thursday', 'Upper'),
          session: session('Thursday', 'Upper', [
            rir('ohp', 'OHP', 4, { restSeconds: 150 }),
            rir('pulldown', 'Pulldown', 4),
            rir('bench', 'Incline', 4),
            rir('curl', 'Curl', 3, { restSeconds: 60 }),
          ]),
        },
        {
          spec: strength('Friday', 'Lower'),
          session: session('Friday', 'Lower', [
            rir('deadlift', 'Deadlift', 4, { restSeconds: 150 }),
            rir('squat', 'Front Squat', 4),
            row('plank', 'Plank', 3, {
              restSeconds: 60,
              prescriptionType: 'time',
            }),
          ]),
        },
      ],
    });
    const total = Object.values(r.scores).reduce((a, b) => a + b, 0);
    expect(r.findings.filter((f) => f.severity !== 'info')).toEqual([]);
    expect(total).toBe(COACH_CHECK_MAX_TOTAL);
  });
});

describe('coachCheckProgram', () => {
  it('groups sessions by week', () => {
    const specs = [
      {
        type: 'strength' as const,
        weekday: 'Monday',
        title: 'Full',
        weekIndex: 1,
      },
      {
        type: 'strength' as const,
        weekday: 'Monday',
        title: 'Full',
        weekIndex: 2,
      },
    ];
    const sessions = [
      session('Monday', 'Full', [row('squat', 'Squat', 3)]),
      {
        ...session('Monday', 'Full', [row('squat', 'Squat', 4)]),
        weekIndex: 2,
      },
    ];
    const reports = coachCheckProgram({
      sessions,
      specs,
      findMeta,
      prefs: { goal: 'strength', difficulty: 'beginner' },
    });
    expect(reports.map((r) => r.weekIndex)).toEqual([1, 2]);
    expect(reports[1]!.volumeByMuscle.Legs.direct).toBe(4);
  });
});
