import {
  allocateWeeklyVolume,
  trimWeeklyVolumeToBand,
  type AllocationSpec,
} from './weekly-volume-allocation';
import type { CoachMeta } from './coach-check';
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
  rdl: {
    primaryMuscleGroup: 'Legs',
    movementPatterns: ['Hinge'],
    type: 'Compound',
  },
  legext: {
    primaryMuscleGroup: 'Legs',
    movementPatterns: [],
    type: 'Isolation',
  },
  curl: { primaryMuscleGroup: 'Arms', movementPatterns: [], type: 'Isolation' },
  facepull: {
    primaryMuscleGroup: 'Shoulders',
    movementPatterns: ['Pull'],
    type: 'Isolation',
  },
  jog: { primaryMuscleGroup: 'Cardio', movementPatterns: ['Cardio'] },
};
const findMeta = (id: string) => CATALOG[id];

type Row = GeneratedSession['exercises'][number];
const row = (
  exerciseId: string,
  name: string,
  sets: number,
  restSeconds = 90,
  over: Partial<Row> = {},
): Row => ({
  exerciseId,
  name,
  sets,
  reps: 8,
  repsMin: 8,
  repsMax: 12,
  restSeconds,
  ...over,
});
const session = (
  weekday: string,
  name: string,
  exercises: Row[],
  weekIndex = 1,
): GeneratedSession => ({
  weekIndex,
  weekday,
  name,
  exercises,
});
const spec = (
  weekday: string,
  title: string,
  minutes: number,
  weekIndex = 1,
): AllocationSpec => ({
  type: 'strength',
  weekday,
  title,
  weekIndex,
  durationMin: minutes,
  durationMax: minutes,
});

const prefs = { goal: 'hypertrophy', difficulty: 'intermediate' }; // band 8–22, arms/core 4

describe('allocateWeeklyVolume', () => {
  it("the review's shape: two-set accessories in a 60-minute slot get sets until the muscle is in band", () => {
    // Upper: bench 5×@180s, row 2×@150s, ohp 2×@150s, face pull 2×@60s
    const sessions = [
      session('Monday', 'Upper', [
        row('bench', 'Bench', 5, 180),
        row('row', 'Row', 2, 150),
        row('ohp', 'OHP', 2, 150),
        row('facepull', 'Face Pull', 2, 60),
      ]),
      session('Thursday', 'Upper', [
        row('bench', 'DB Bench', 5, 180),
        row('pulldown', 'Pulldown', 2, 150),
        row('ohp', 'DB Press', 2, 150),
        row('curl', 'Curl', 2, 60),
      ]),
    ];
    const out = allocateWeeklyVolume({
      sessions,
      specs: [spec('Monday', 'Upper', 60), spec('Thursday', 'Upper', 60)],
      findMeta,
      prefs,
    });
    const mon = out.sessions[0]!.exercises;
    const thu = out.sessions[1]!.exercises;
    // Back: 2 + 2 = 4 → needs 8 → rows and pulldown grow toward their compound ceiling
    const back = (mon[1]!.sets ?? 0) + (thu[1]!.sets ?? 0);
    expect(back).toBeGreaterThanOrEqual(8);
    // Never past the role ceilings
    expect(mon[1]!.sets).toBeLessThanOrEqual(5);
    expect(thu[1]!.sets).toBeLessThanOrEqual(5);
    expect(out.adjustments[0]!.added).toBeGreaterThan(0);
    expect(out.adjustments[0]!.removed).toBe(0);
  });

  it("respects the session's time budget: a 30-minute slot cannot absorb the sets", () => {
    // 30 min − 6 warm-up = 24 min = 1440 s. Bench 5 × (180+35) = 1075 s already; row 2 × 185 = 370 → 1445 s: no room.
    const sessions = [
      session('Monday', 'Upper', [
        row('bench', 'Bench', 5, 180),
        row('row', 'Row', 2, 150),
      ]),
    ];
    const out = allocateWeeklyVolume({
      sessions,
      specs: [spec('Monday', 'Upper', 30)],
      findMeta,
      prefs,
    });
    expect(out.sessions[0]!.exercises[1]!.sets).toBe(2);
    expect(out.adjustments).toEqual([]);
  });

  it('a cardio finisher rides on the spare window: it does not eat the lifting budget unless the window is fixed', () => {
    const lifts = () => [
      row('bench', 'Bench', 5, 180),
      row('row', 'Row', 2, 150),
    ];
    const tail = (): Row => ({
      exerciseId: 'jog',
      name: 'Treadmill Jog',
      sets: 1,
      reps: 600,
      durationSeconds: 600,
      prescriptionType: 'time',
      primaryMuscleGroup: 'Cardio',
    });
    const window = (min: number, max: number): AllocationSpec => ({
      type: 'strength',
      weekday: 'Monday',
      title: 'Upper',
      weekIndex: 1,
      durationMin: min,
      durationMax: max,
    });
    const noTail = allocateWeeklyVolume({
      sessions: [session('Monday', 'Upper', lifts())],
      specs: [window(30, 60)],
      findMeta,
      prefs,
    });
    const withTail = allocateWeeklyVolume({
      sessions: [session('Monday', 'Upper', [...lifts(), tail()])],
      specs: [window(30, 60)],
      findMeta,
      prefs,
    });
    const rowSets = (out: typeof noTail) => out.sessions[0]!.exercises[1]!.sets;
    expect(rowSets(noTail)).toBeGreaterThan(2);
    expect(rowSets(withTail)).toBe(rowSets(noTail));

    // A fixed 45-minute slot has no spare window: the tail costs lifting sets.
    const fixed = allocateWeeklyVolume({
      sessions: [session('Monday', 'Upper', [...lifts(), tail()])],
      specs: [window(45, 45)],
      findMeta,
      prefs,
    });
    expect(rowSets(fixed)).toBeLessThan(rowSets(withTail));
    expect(fixed.sessions[0]!.exercises[2]!.durationSeconds).toBe(600);
  });

  it('the priority muscle is filled toward the top of its band, the others to the floor', () => {
    // Two back rows: plain allocation stops at the band's floor (8), the
    // priority target reaches for the ceiling and adds where ceilings allow.
    const lifts = () => [
      row('bench', 'Bench', 4, 120),
      row('row', 'Row', 3, 120),
      row('pulldown', 'Pulldown', 2, 90),
      row('curl', 'Curl', 2, 60),
    ];
    const window = (): AllocationSpec => ({
      type: 'strength',
      weekday: 'Monday',
      title: 'Upper',
      weekIndex: 1,
      durationMin: 60,
      durationMax: 90,
    });
    const plain = allocateWeeklyVolume({
      sessions: [session('Monday', 'Upper', lifts())],
      specs: [window()],
      findMeta,
      prefs,
    });
    const prioritised = allocateWeeklyVolume({
      sessions: [session('Monday', 'Upper', lifts())],
      specs: [window()],
      findMeta,
      prefs: { ...prefs, priorityMuscle: 'Back' },
    });
    const backSets = (out: typeof plain) =>
      out.sessions[0]!.exercises[1]!.sets + out.sessions[0]!.exercises[2]!.sets;
    expect(backSets(plain)).toBe(8);
    expect(backSets(prioritised)).toBeGreaterThan(8);
    expect(prioritised.sessions[0]!.exercises[0]!.sets).toBe(
      plain.sessions[0]!.exercises[0]!.sets,
    );
  });

  it('trims a muscle over the band from isolation first, never the main lift, never below two', () => {
    // Legs: 6 + 5 + 5 + 5 on two lower days = 42 weighted (Legs ceiling 33);
    // the accessories alone can give back 16, so the squats stay at six.
    const sessions = [
      session('Tuesday', 'Lower', [
        row('squat', 'Squat', 6, 180),
        row('rdl', 'RDL', 5, 150),
        row('legext', 'Leg Extension', 5, 60),
        row('legext', 'Leg Curl', 5, 60),
      ]),
      session('Friday', 'Lower', [
        row('squat', 'Front Squat', 6, 180),
        row('rdl', 'DB RDL', 5, 150),
        row('legext', 'Leg Extension', 5, 60),
        row('legext', 'Nordic Curl', 5, 60),
      ]),
    ];
    const out = allocateWeeklyVolume({
      sessions,
      specs: [spec('Tuesday', 'Lower', 90), spec('Friday', 'Lower', 90)],
      findMeta,
      prefs,
    });
    const legs = out.sessions
      .flatMap((s) => s.exercises)
      .reduce((n, e) => n + (e.sets ?? 0), 0);
    expect(legs).toBeLessThanOrEqual(33);
    for (const s of out.sessions) {
      expect(s.exercises[0]!.sets).toBe(6); // main lift untouched
      for (const e of s.exercises) expect(e.sets).toBeGreaterThanOrEqual(2);
    }
    expect(out.adjustments[0]!.removed).toBeGreaterThan(0);
  });

  it('leaves a balanced week alone and returns the same objects', () => {
    const sessions = [
      session('Monday', 'Upper', [
        row('bench', 'Bench', 4, 120),
        row('row', 'Row', 4, 90),
        row('ohp', 'OHP', 3, 90),
        row('curl', 'Curl', 3, 60),
      ]),
      session('Tuesday', 'Lower', [
        row('squat', 'Squat', 4, 120),
        row('rdl', 'RDL', 4, 90),
      ]),
      session('Thursday', 'Upper', [
        row('ohp', 'OHP', 4, 120),
        row('pulldown', 'Pulldown', 4, 90),
        row('bench', 'Incline', 4, 90),
        row('curl', 'Curl', 3, 60),
      ]),
      session('Friday', 'Lower', [
        row('rdl', 'Deadlift', 4, 120),
        row('squat', 'Front Squat', 4, 90),
        row('legext', 'Leg Extension', 3, 60),
      ]),
    ];
    const specs = ['Monday', 'Tuesday', 'Thursday', 'Friday'].map((d) =>
      spec(d, 'x', 45),
    );
    const out = allocateWeeklyVolume({ sessions, specs, findMeta, prefs });
    // Nothing under, nothing over; only the spare-time rule may add to a main lift.
    for (const a of out.adjustments) expect(a.removed).toBe(0);
    for (let i = 0; i < sessions.length; i++) {
      for (let j = 0; j < sessions[i]!.exercises.length; j++) {
        const before = sessions[i]!.exercises[j]!.sets;
        const after = out.sessions[i]!.exercises[j]!.sets;
        expect(after).toBeGreaterThanOrEqual(before);
        if (j > 0) expect(after).toBe(before);
      }
    }
  });

  it('does not create work for a muscle the week never trains, and ignores cardio rows', () => {
    const sessions = [
      session('Monday', 'Upper', [
        row('bench', 'Bench', 4, 120),
        row('jog', 'Treadmill Jog', 1, 0, {
          prescriptionType: 'time',
          durationSeconds: 600,
        }),
      ]),
    ];
    const out = allocateWeeklyVolume({
      sessions,
      specs: [spec('Monday', 'Upper', 45)],
      findMeta,
      prefs,
    });
    // Back and Legs are untrained: no rows appear, nothing changes but maybe the main lift's spare-time set.
    expect(out.sessions[0]!.exercises).toHaveLength(2);
    expect(out.sessions[0]!.exercises[1]!.sets).toBe(1);
  });

  it('works per week on a multi-week program', () => {
    const wk = (w: number) => [
      session(
        'Monday',
        'Upper',
        [row('bench', 'Bench', 4, 120), row('row', 'Row', 2, 90)],
        w,
      ),
      session(
        'Thursday',
        'Upper',
        [row('ohp', 'OHP', 4, 120), row('pulldown', 'Pulldown', 2, 90)],
        w,
      ),
    ];
    const sessions = [...wk(1), ...wk(2)];
    const specs = [
      spec('Monday', 'Upper', 60, 1),
      spec('Thursday', 'Upper', 60, 1),
      spec('Monday', 'Upper', 60, 2),
      spec('Thursday', 'Upper', 60, 2),
    ];
    const out = allocateWeeklyVolume({ sessions, specs, findMeta, prefs });
    expect(out.adjustments.map((a) => a.weekIndex)).toEqual([1, 2]);
  });
});

describe('after the progression (rig run 2026-09-17)', () => {
  it('trims a peak week back to the band from the accessories, never the main lift', () => {
    // Legs: squat 6 + rdl 5 + leg extension 5 = 16 direct; band max 22 for hypertrophy intermediate
    // is exceeded once secondary credit is counted, so the trim has to give sets back.
    const sessions = [
      session('Monday', 'Lower', [
        row('squat', 'Back Squat', 5, 150),
        row('rdl', 'RDL', 5, 120),
        row('legext', 'Leg Extension', 5, 60),
        row('legext', 'Leg Curl', 5, 60),
      ]),
      session('Thursday', 'Lower 2', [
        row('squat', 'Front Squat', 5, 150),
        row('rdl', 'Hip Thrust', 5, 120),
        row('legext', 'Leg Extension', 5, 60),
        row('legext', 'Leg Curl', 5, 60),
      ]),
    ];
    const out = trimWeeklyVolumeToBand({
      sessions,
      specs: [spec('Monday', 'Lower', 60), spec('Thursday', 'Lower 2', 60)],
      findMeta,
      prefs,
    });
    expect(out.adjustments[0]!.removed).toBeGreaterThan(0);
    for (const s of out.sessions) {
      expect(s.exercises[0]!.sets).toBe(5); // main at the cap, untouched
      for (const e of s.exercises.slice(1))
        expect(e.sets).toBeGreaterThanOrEqual(2);
    }
    const legs = coachLegs(out.sessions);
    expect(legs).toBeLessThanOrEqual(33);
  });

  it('never cuts a secondary compound below three; the main lift gives sets back, then an isolation at its floor is dropped', () => {
    const sessions = [
      session('Monday', 'Lower', [
        row('squat', 'Back Squat', 6, 150),
        row('rdl', 'RDL', 3, 120),
        row('legext', 'Leg Extension', 2, 60),
        row('legext', 'Leg Curl', 2, 60),
      ]),
      session('Wednesday', 'Lower 2', [
        row('squat', 'Hack Squat', 6, 150),
        row('rdl', 'Good Morning', 3, 120),
        row('legext', 'Leg Extension', 2, 60),
        row('legext', 'Leg Curl', 2, 60),
      ]),
      session('Thursday', 'Lower 3', [
        row('squat', 'Front Squat', 6, 150),
        row('rdl', 'Hip Thrust', 3, 120),
        row('legext', 'Sissy Squat', 2, 60),
        row('legext', 'Nordic Curl', 2, 60),
      ]),
    ];
    const out = trimWeeklyVolumeToBand({
      sessions,
      specs: [
        spec('Monday', 'Lower', 60),
        spec('Wednesday', 'Lower 2', 60),
        spec('Thursday', 'Lower 3', 60),
      ],
      findMeta,
      prefs,
    });
    for (const s of out.sessions) {
      const compounds = s.exercises.filter((e) =>
        /RDL|Hip Thrust/.test(e.name ?? ''),
      );
      for (const c of compounds) expect(c.sets).toBeGreaterThanOrEqual(3);
      expect(s.exercises.length).toBeGreaterThanOrEqual(2);
    }
    const notes = out.adjustments.flatMap((a) => a.notes);
    // 39 direct sets against a Legs ceiling of 33: the three 6-set squats
    // give sets back (down to four on these four-row days) before any row
    // is dropped, and nothing else is cut.
    expect(
      notes.filter((n) => n.includes('main lift above')).length,
    ).toBeGreaterThanOrEqual(3);
    expect(notes.some((n) => n.startsWith('dropped'))).toBe(false);
    expect(coachLegs(out.sessions)).toBeLessThanOrEqual(33);
  });
});

function coachLegs(sessions: GeneratedSession[]): number {
  let direct = 0;
  for (const s of sessions)
    for (const e of s.exercises)
      if (findMeta(e.exerciseId!)?.primaryMuscleGroup === 'Legs')
        direct += e.sets;
  return direct;
}
