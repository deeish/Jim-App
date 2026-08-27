import {
  bestWeightedSetOfSession,
  collectSessionAchievements,
  formatAchievementDetail,
  formatAchievementLabel,
  summarizeSessionTotals,
} from './sessionAchievements';
import type {
  Exercise,
  ExerciseSession,
  LastExercisePerformance,
  LastPerformanceMap,
  PersonalBest,
  PersonalBestE1rm,
  PersonalBestMap,
} from '../types/workout';

const exercise = (name: string, exerciseId?: string): Exercise => ({
  name,
  sets: 3,
  reps: 8,
  exerciseId,
});

const session = (
  name: string,
  exerciseId: string | undefined,
  sets: Array<{ reps: number; weight?: number; completed?: boolean }>,
  opts: { skipped?: boolean } = {},
): ExerciseSession => ({
  exerciseIndex: 0,
  exercise: exercise(name, exerciseId),
  skipped: opts.skipped,
  completedSets: sets.map((s, i) => ({
    setNumber: i + 1,
    reps: s.reps,
    weight: s.weight,
    completed: s.completed ?? true,
  })),
});

const perf = (
  sets: Array<{ reps: number; weight: number | null }>,
): LastExercisePerformance => ({
  workoutLogId: 'log-1',
  performedAt: '2026-07-20T12:00:00.000Z',
  sets: sets.map((s, i) => ({ setNumber: i + 1, reps: s.reps, weight: s.weight })),
});

const record = (weightLb: number, reps = 5): PersonalBest => ({
  weightLb,
  reps,
  performedAt: '2026-01-05T12:00:00.000Z',
});

const NO_LAST: LastPerformanceMap = {};
/** No strongest-set records: the map the server sends for a new lift. */
const NO_E1RM = {};
const NO_BESTS: PersonalBestMap = {};

describe('bestWeightedSetOfSession', () => {
  it('picks the heaviest completed set', () => {
    const es = session('Bench Press', 'ex-bench', [
      { reps: 8, weight: 135 },
      { reps: 6, weight: 155 },
      { reps: 8, weight: 145 },
    ]);
    expect(bestWeightedSetOfSession(es)).toEqual({ weightLb: 155, reps: 6 });
  });

  it('breaks ties on weight by preferring more reps', () => {
    const es = session('Bench Press', 'ex-bench', [
      { reps: 5, weight: 135 },
      { reps: 9, weight: 135 },
      { reps: 7, weight: 135 },
    ]);
    expect(bestWeightedSetOfSession(es)).toEqual({ weightLb: 135, reps: 9 });
  });

  it('ignores sets that were never completed', () => {
    const es = session('Bench Press', 'ex-bench', [
      { reps: 8, weight: 135 },
      { reps: 1, weight: 500, completed: false },
    ]);
    expect(bestWeightedSetOfSession(es)).toEqual({ weightLb: 135, reps: 8 });
  });

  it('returns null for a bodyweight exercise', () => {
    const es = session('Push-up', 'ex-pushup', [{ reps: 20 }, { reps: 18 }]);
    expect(bestWeightedSetOfSession(es)).toBeNull();
  });
});

describe('summarizeSessionTotals', () => {
  it('counts completed sets, exercises and volume', () => {
    const totals = summarizeSessionTotals([
      session('Bench Press', 'ex-bench', [
        { reps: 8, weight: 100 },
        { reps: 8, weight: 100 },
      ]),
      session('Row', 'ex-row', [{ reps: 10, weight: 50 }]),
    ]);
    expect(totals).toEqual({
      completedSets: 3,
      exercisesWorked: 2,
      volumeLb: 2100,
      hasWeightedWork: true,
    });
  });

  it('excludes skipped exercises entirely', () => {
    const totals = summarizeSessionTotals([
      session('Bench Press', 'ex-bench', [{ reps: 8, weight: 100 }]),
      session('Row', 'ex-row', [{ reps: 10, weight: 500 }], { skipped: true }),
    ]);
    expect(totals.completedSets).toBe(1);
    expect(totals.exercisesWorked).toBe(1);
    expect(totals.volumeLb).toBe(800);
  });

  it('excludes sets the user never completed', () => {
    const totals = summarizeSessionTotals([
      session('Bench Press', 'ex-bench', [
        { reps: 8, weight: 100 },
        { reps: 8, weight: 100, completed: false },
      ]),
    ]);
    expect(totals.completedSets).toBe(1);
    expect(totals.volumeLb).toBe(800);
  });

  it('reports no weighted work for a bodyweight-only session', () => {
    const totals = summarizeSessionTotals([
      session('Push-up', 'ex-pushup', [{ reps: 20 }, { reps: 15 }]),
      session('Plank', 'ex-plank', [{ reps: 60 }]),
    ]);
    expect(totals.hasWeightedWork).toBe(false);
    expect(totals.volumeLb).toBe(0);
    // The session still happened — these are the numbers the screen leads with.
    expect(totals.completedSets).toBe(3);
    expect(totals.exercisesWorked).toBe(2);
  });

  it('does not count an exercise with zero completed sets as worked', () => {
    const totals = summarizeSessionTotals([
      session('Bench Press', 'ex-bench', [{ reps: 8, weight: 100 }]),
      session('Row', 'ex-row', [{ reps: 10, weight: 50, completed: false }]),
    ]);
    expect(totals.exercisesWorked).toBe(1);
    expect(totals.completedSets).toBe(1);
  });

  // The same lift can fill two slots (an opener plus a back-off block, or
  // re-added from the library). The tile says "Exercises", so it counts
  // movements: Bench + Bench back-off + Squat is 2, not 3.
  it('counts a movement once when it fills two slots', () => {
    const totals = summarizeSessionTotals([
      session('Bench Press', 'ex-bench', [{ reps: 5, weight: 155 }]),
      session('Bench Press', 'ex-bench', [{ reps: 8, weight: 125 }]),
      session('Squat', 'ex-squat', [{ reps: 5, weight: 225 }]),
    ]);
    expect(totals.exercisesWorked).toBe(2);
    // Set and volume totals still credit everything both slots did.
    expect(totals.completedSets).toBe(3);
    expect(totals.volumeLb).toBe(5 * 155 + 8 * 125 + 5 * 225);
  });

  // 'manual' is the log service's shared bucket for entries saved without a
  // library id — a non-identity. Two hand-added movements land on the same
  // value and must not collapse into one, and a slot with no id at all has
  // nothing to merge with either.
  it('counts manual and id-less slots individually, never merged', () => {
    const totals = summarizeSessionTotals([
      session('Weird cable thing', 'manual', [{ reps: 10, weight: 30 }]),
      session('Odd machine press', 'manual', [{ reps: 12, weight: 45 }]),
      session('Hand-added carry', undefined, [{ reps: 40, weight: 50 }]),
    ]);
    expect(totals.exercisesWorked).toBe(3);
  });
});

describe('collectSessionAchievements', () => {
  it('celebrates a personal best when the all-time record is broken', () => {
    const found = collectSessionAchievements(
      [session('Bench Press', 'ex-bench', [{ reps: 5, weight: 145 }])],
      { 'ex-bench': perf([{ reps: 5, weight: 140 }]) },
      { 'ex-bench': record(140) },
    );
    expect(found).toEqual([
      {
        exerciseId: 'ex-bench',
        exerciseName: 'Bench Press',
        exerciseIndex: 0,
        kind: 'personal-best',
        basis: 'weight',
        weightLb: 145,
        reps: 5,
        previousLb: 140,
        previousReps: 5,
        gainLb: 5,
        gainReps: 0,
        // Zero on a weight claim: the estimate only carries an estimated one.
        e1rmLb: 0,
        previousE1rmLb: 0,
        isTimeBased: false,
      },
    ]);
  });

  // The finding this whole design turns on: the last-performance map only
  // covers the 30 most recent logs, so beating it says nothing about an
  // all-time record. Someone who benched 225 six months ago and hits 140 today
  // must never be told they set a PR.
  it('does not call a lift a personal best just because it beat last time', () => {
    const found = collectSessionAchievements(
      [session('Bench Press', 'ex-bench', [{ reps: 5, weight: 140 }])],
      { 'ex-bench': perf([{ reps: 5, weight: 135 }]) },
      { 'ex-bench': record(225) },
    );
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe('beat-last-time');
    expect(found[0].previousLb).toBe(135);
  });

  it('claims nothing when there is no prior weighted history to beat', () => {
    const found = collectSessionAchievements(
      [session('Bench Press', 'ex-bench', [{ reps: 5, weight: 315 }])],
      NO_LAST,
      NO_BESTS,
    );
    expect(found).toEqual([]);
  });

  it('does not celebrate matching a record', () => {
    const found = collectSessionAchievements(
      [session('Bench Press', 'ex-bench', [{ reps: 8, weight: 140 }])],
      { 'ex-bench': perf([{ reps: 8, weight: 140 }]) },
      { 'ex-bench': record(140, 8) },
    );
    expect(found).toEqual([]);
  });

  // The gap this closes: the app's own Target line asks for a rep before it
  // asks for a plate, so the session that follows that instruction has to be
  // able to win something.
  it('celebrates more reps at the record weight as a personal best', () => {
    const found = collectSessionAchievements(
      [session('Bench Press', 'ex-bench', [{ reps: 8, weight: 140 }])],
      { 'ex-bench': perf([{ reps: 5, weight: 140 }]) },
      { 'ex-bench': record(140, 5) },
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      kind: 'personal-best',
      basis: 'reps',
      reps: 8,
      previousReps: 5,
      gainReps: 3,
      gainLb: 0,
    });
  });

  it('does not celebrate dropping the weight to rep it out', () => {
    // 20 reps at 95 is more total work than 5 at 140 and is not a better set:
    // load is compared first, so repping out a lighter bar claims nothing.
    const found = collectSessionAchievements(
      [session('Bench Press', 'ex-bench', [{ reps: 20, weight: 95 }])],
      { 'ex-bench': perf([{ reps: 5, weight: 140 }]) },
      { 'ex-bench': record(140, 5) },
    );
    expect(found).toEqual([]);
  });

  it('does not celebrate fewer reps at the record weight', () => {
    const found = collectSessionAchievements(
      [session('Bench Press', 'ex-bench', [{ reps: 3, weight: 140 }])],
      { 'ex-bench': perf([{ reps: 5, weight: 140 }]) },
      { 'ex-bench': record(140, 5) },
    );
    expect(found).toEqual([]);
  });

  it('reports a broken record once, not also as beating last time', () => {
    const found = collectSessionAchievements(
      [session('Bench Press', 'ex-bench', [{ reps: 3, weight: 200 }])],
      { 'ex-bench': perf([{ reps: 5, weight: 150 }]) },
      { 'ex-bench': record(185) },
    );
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe('personal-best');
    expect(found[0].previousLb).toBe(185);
  });

  it('ignores skipped exercises', () => {
    const found = collectSessionAchievements(
      [
        session('Bench Press', 'ex-bench', [{ reps: 5, weight: 145 }], {
          skipped: true,
        }),
      ],
      { 'ex-bench': perf([{ reps: 5, weight: 100 }]) },
      { 'ex-bench': record(140) },
    );
    expect(found).toEqual([]);
  });

  // The server keeps no LOAD record for unweighted work, so bodyweight
  // exercises can never break a personal best — last time is the only record
  // they have, and reps are the only thing there is to beat.
  it('celebrates rep progress on bodyweight work', () => {
    const found = collectSessionAchievements(
      [session('Push-up', 'ex-pushup', [{ reps: 40 }])],
      { 'ex-pushup': perf([{ reps: 20, weight: null }]) },
      NO_BESTS,
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      kind: 'beat-last-time',
      basis: 'reps',
      weightLb: 0,
      reps: 40,
      previousReps: 20,
      gainReps: 20,
    });
  });

  it('claims nothing for bodyweight work with no last session to beat', () => {
    const found = collectSessionAchievements(
      [session('Push-up', 'ex-pushup', [{ reps: 40 }])],
      NO_LAST,
      NO_BESTS,
    );
    expect(found).toEqual([]);
  });

  it('does not celebrate matching last time on bodyweight work', () => {
    const found = collectSessionAchievements(
      [session('Pull-Up', 'ex-pullup', [{ reps: 9 }, { reps: 8 }])],
      { 'ex-pullup': perf([{ reps: 9, weight: null }, { reps: 7, weight: null }]) },
      NO_BESTS,
    );
    expect(found).toEqual([]);
  });

  it('ignores exercises with no library id', () => {
    const found = collectSessionAchievements(
      [session('Some hand-added lift', undefined, [{ reps: 5, weight: 200 }])],
      NO_LAST,
      NO_BESTS,
    );
    expect(found).toEqual([]);
  });

  // Placeholder ids are filtered server-side, so they are simply absent from
  // both maps — and a claim always needs a prior number, which is what keeps
  // them out of the highlight list.
  it('ignores generated placeholder ids, which carry no history', () => {
    const found = collectSessionAchievements(
      [session('Generated Row', 'generated_abc_1', [{ reps: 5, weight: 200 }])],
      NO_LAST,
      NO_BESTS,
    );
    expect(found).toEqual([]);
  });

  it('puts personal bests first, then the biggest gains', () => {
    const found = collectSessionAchievements(
      [
        session('Row', 'ex-row', [{ reps: 8, weight: 110 }]),
        session('Squat', 'ex-squat', [{ reps: 5, weight: 250 }]),
        session('Curl', 'ex-curl', [{ reps: 10, weight: 45 }]),
      ],
      {
        'ex-row': perf([{ reps: 8, weight: 100 }]),
        'ex-squat': perf([{ reps: 5, weight: 225 }]),
        'ex-curl': perf([{ reps: 10, weight: 40 }]),
      },
      {
        // Row beat last time but not its record; squat and curl set records.
        'ex-row': record(135),
        'ex-squat': record(245),
        'ex-curl': record(35),
      },
    );
    // Row has the largest raw gain but is the smaller claim, so it ranks last.
    expect(
      found.map((a) => [a.exerciseName, a.kind, a.gainLb]),
    ).toEqual([
      ['Curl', 'personal-best', 10],
      ['Squat', 'personal-best', 5],
      ['Row', 'beat-last-time', 10],
    ]);
  });

  // The same exercise can appear twice in one session (a back-off block, or
  // re-added from the library). Two rows would duplicate a React key and claim
  // the same lift twice.
  it('claims an exercise once even when it appears twice in the session', () => {
    const found = collectSessionAchievements(
      [
        session('Bench Press', 'ex-bench', [{ reps: 5, weight: 145 }]),
        session('Bench Press', 'ex-bench', [{ reps: 3, weight: 155 }]),
      ],
      NO_LAST,
      { 'ex-bench': record(140) },
    );
    expect(found).toHaveLength(1);
    // Best across both appearances, not just the first.
    expect(found[0].weightLb).toBe(155);
    expect(found[0].reps).toBe(3);
  });

  it('ignores a repeat appearance that was skipped', () => {
    const found = collectSessionAchievements(
      [
        session('Bench Press', 'ex-bench', [{ reps: 5, weight: 145 }]),
        session('Bench Press', 'ex-bench', [{ reps: 3, weight: 500 }], {
          skipped: true,
        }),
      ],
      NO_LAST,
      { 'ex-bench': record(140) },
    );
    expect(found).toHaveLength(1);
    expect(found[0].weightLb).toBe(145);
  });

  it('keeps workout order when gains tie', () => {
    const found = collectSessionAchievements(
      [
        session('Squat', 'ex-squat', [{ reps: 5, weight: 250 }]),
        session('Curl', 'ex-curl', [{ reps: 10, weight: 45 }]),
      ],
      NO_LAST,
      { 'ex-squat': record(245), 'ex-curl': record(40) },
    );
    expect(found.map((a) => a.exerciseName)).toEqual(['Squat', 'Curl']);
  });
});

describe('achievement formatting', () => {
  const achievement = collectSessionAchievements(
    [session('Bench Press', 'ex-bench', [{ reps: 5, weight: 140 }])],
    NO_LAST,
    { 'ex-bench': record(135) },
  )[0];

  it('labels each kind plainly', () => {
    expect(formatAchievementLabel('personal-best')).toBe('Personal best');
    expect(formatAchievementLabel('beat-last-time')).toBe('Beat last time');
  });

  it('shows what was lifted and what it beat', () => {
    expect(formatAchievementDetail(achievement, 'lb')).toBe(
      '5×140 lb · up from 135 lb',
    );
  });

  it('converts to kg for kg users', () => {
    expect(formatAchievementDetail(achievement, 'kg')).toBe(
      '5×64 kg · up from 61 kg',
    );
  });

  // Loaded carries and weighted holds are timed *and* weighted, and timed sets
  // log their seconds in the reps field. "45×70 lb" would read as 45 reps.
  it('renders a loaded carry as a duration at a load', () => {
    const carry = collectSessionAchievements(
      [session("Farmer's Carry", 'ex-carry', [{ reps: 45, weight: 70 }])],
      NO_LAST,
      { 'ex-carry': record(65) },
    )[0];
    expect(carry.isTimeBased).toBe(true);
    expect(formatAchievementDetail(carry, 'lb')).toBe(
      '45s @ 70 lb · up from 65 lb',
    );
  });

  it('omits an implausible duration rather than rendering it as seconds', () => {
    const legacy = collectSessionAchievements(
      [session("Farmer's Carry", 'ex-carry', [{ reps: 10, weight: 70 }])],
      NO_LAST,
      { 'ex-carry': record(65) },
    )[0];
    expect(formatAchievementDetail(legacy, 'lb')).toBe('70 lb · up from 65 lb');
  });

  it('keeps reps×weight for an ordinary lift', () => {
    expect(achievement.isTimeBased).toBe(false);
  });

  // 141 lb and 140 lb both round to 64 kg; "up from 64 kg" would look broken.
  it('drops the comparison when the unit rounds both to the same number', () => {
    const tiny = collectSessionAchievements(
      [session('Bench Press', 'ex-bench', [{ reps: 5, weight: 141 }])],
      NO_LAST,
      { 'ex-bench': record(140) },
    )[0];
    expect(formatAchievementDetail(tiny, 'kg')).toBe('5×64 kg');
    // The same achievement still reads correctly in pounds.
    expect(formatAchievementDetail(tiny, 'lb')).toBe('5×141 lb · up from 140 lb');
  });
});

describe('achievement formatting — rep progress', () => {
  it('names the reps that moved, not the weight that did not', () => {
    const repPb = collectSessionAchievements(
      [session('Bench Press', 'ex-bench', [{ reps: 8, weight: 140 }])],
      { 'ex-bench': perf([{ reps: 5, weight: 140 }]) },
      { 'ex-bench': record(140, 5) },
    )[0];
    expect(formatAchievementDetail(repPb, 'lb')).toBe('8×140 lb · up from 5 reps');
  });

  it('carries a bodyweight claim on reps alone', () => {
    const bw = collectSessionAchievements(
      [session('Pull-Up', 'ex-pullup', [{ reps: 10 }])],
      { 'ex-pullup': perf([{ reps: 9, weight: null }]) },
      NO_BESTS,
    )[0];
    expect(formatAchievementDetail(bw, 'lb')).toBe('10 reps · up from 9 reps');
  });
});

describe('collectSessionAchievements — the session must have come last', () => {
  // Backdating is supported: train Monday, forget to finish, train and finish
  // Tuesday, then open Monday and press Complete. Monday is still unlogged so
  // the pre-log gate is open — but the records now describe Tuesday.
  const MONDAY = '2026-08-24T00:00:00.000Z';
  const tuesdayPerf = (): LastExercisePerformance => ({
    workoutLogId: 'log-tue',
    performedAt: '2026-08-25T12:00:00.000Z',
    sets: [{ setNumber: 1, reps: 5, weight: 100 }],
  });

  it('ignores a session performed after the one being celebrated', () => {
    const found = collectSessionAchievements(
      [session('Bench Press', 'ex-bench', [{ reps: 5, weight: 140 }])],
      { 'ex-bench': tuesdayPerf() },
      NO_BESTS,
      NO_E1RM,
      MONDAY,
    );
    expect(found).toEqual([]);
  });

  it('ignores a record set after the one being celebrated', () => {
    const found = collectSessionAchievements(
      [session('Bench Press', 'ex-bench', [{ reps: 5, weight: 300 }])],
      NO_LAST,
      { 'ex-bench': { weightLb: 140, reps: 5, performedAt: '2026-08-25T12:00:00.000Z' } },
      NO_E1RM,
      MONDAY,
    );
    expect(found).toEqual([]);
  });

  it('still celebrates against anything genuinely earlier', () => {
    const found = collectSessionAchievements(
      [session('Bench Press', 'ex-bench', [{ reps: 5, weight: 140 }])],
      { 'ex-bench': perf([{ reps: 5, weight: 135 }]) },
      NO_BESTS,
      NO_E1RM,
      MONDAY,
    );
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe('beat-last-time');
  });
});

describe('collectSessionAchievements — a lift filling two slots', () => {
  it('decorates the slot that set the mark, not the other one', () => {
    const found = collectSessionAchievements(
      [
        { ...session('Bench Press', 'ex-bench', [{ reps: 5, weight: 225 }]), exerciseIndex: 0 },
        { ...session('Bench Press', 'ex-bench', [{ reps: 12, weight: 155 }]), exerciseIndex: 3 },
      ],
      NO_LAST,
      { 'ex-bench': record(200) },
    );
    expect(found).toHaveLength(1);
    // The opener won it; the back-off block must not wear the same chip.
    expect(found[0].exerciseIndex).toBe(0);
  });
});

/** A strongest-set record, as the server now sends it. */
const e1rmRecord = (
  weightLb: number,
  reps: number,
  e1rmLb: number,
): PersonalBestE1rm => ({
  weightLb,
  reps,
  e1rmLb,
  performedAt: '2026-01-05T12:00:00.000Z',
});

describe('collectSessionAchievements — records won on a lighter bar', () => {
  it('celebrates a session that was silent before', () => {
    // 185x5 estimates 216. Today: 175x12, which estimates 245 — plainly
    // stronger, and it beat NOTHING under the old rules: 175 < 185 so it
    // failed the record, and it did not outrank last time either. The app
    // said nothing at all for a clear step forward.
    const found = collectSessionAchievements(
      [session('Bench Press', 'ex-bench', [{ reps: 12, weight: 175 }])],
      { 'ex-bench': perf([{ reps: 5, weight: 185 }]) },
      { 'ex-bench': record(185) },
      { 'ex-bench': e1rmRecord(185, 5, 216) },
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      kind: 'personal-best',
      basis: 'estimated',
      weightLb: 175,
      reps: 12,
      e1rmLb: 245,
      previousE1rmLb: 216,
    });
  });

  it('prefers the heavier-bar claim when the session earns both', () => {
    // A genuine weight PR must not be downgraded to an estimate claim.
    const found = collectSessionAchievements(
      [session('Bench Press', 'ex-bench', [{ reps: 5, weight: 200 }])],
      NO_LAST,
      { 'ex-bench': record(185) },
      { 'ex-bench': e1rmRecord(185, 5, 216) },
    );
    expect(found).toHaveLength(1);
    expect(found[0].basis).toBe('weight');
  });

  it('claims nothing when the estimate does not actually beat the record', () => {
    // 170x8 estimates 215, just under the standing 216.
    const found = collectSessionAchievements(
      [session('Bench Press', 'ex-bench', [{ reps: 8, weight: 170 }])],
      NO_LAST,
      { 'ex-bench': record(185) },
      { 'ex-bench': e1rmRecord(185, 5, 216) },
    );
    expect(found).toEqual([]);
  });

  it('ignores an estimated record set after the session being celebrated', () => {
    const found = collectSessionAchievements(
      [session('Bench Press', 'ex-bench', [{ reps: 12, weight: 175 }])],
      NO_LAST,
      NO_BESTS,
      {
        'ex-bench': {
          weightLb: 185,
          reps: 5,
          e1rmLb: 216,
          performedAt: '2026-08-25T12:00:00.000Z',
        },
      },
      '2026-08-24T00:00:00.000Z',
    );
    expect(found).toEqual([]);
  });

  it('finds the strongest set even when another slot held the heaviest', () => {
    // An opener at 200x2 (213) and a back-off block at 175x12 (245): the
    // estimate belongs to the back-off, and the claim must follow it.
    const found = collectSessionAchievements(
      [
        session('Bench Press', 'ex-bench', [{ reps: 2, weight: 200 }]),
        session('Bench Press', 'ex-bench', [{ reps: 12, weight: 175 }]),
      ],
      NO_LAST,
      { 'ex-bench': record(210) },
      { 'ex-bench': e1rmRecord(210, 1, 210) },
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ basis: 'estimated', weightLb: 175, e1rmLb: 245 });
  });

  it('does nothing at all without the estimated records', () => {
    // An older API sends no `e1rm`, so the map is empty and this branch is
    // simply inert — it must never throw on the finish screen.
    const found = collectSessionAchievements(
      [session('Bench Press', 'ex-bench', [{ reps: 12, weight: 175 }])],
      NO_LAST,
      { 'ex-bench': record(185) },
    );
    expect(found).toEqual([]);
  });
});

describe('formatAchievementDetail — estimated claims', () => {
  const estimatedClaim = {
    exerciseId: 'ex-bench',
    exerciseName: 'Bench Press',
    exerciseIndex: 0,
    kind: 'personal-best' as const,
    basis: 'estimated' as const,
    weightLb: 175,
    reps: 12,
    previousLb: 185,
    previousReps: 5,
    gainLb: 0,
    gainReps: 0,
    e1rmLb: 245,
    previousE1rmLb: 216,
    isTimeBased: false,
  };

  it('names the set performed and compares the ESTIMATES, not the bars', () => {
    // "up from 185 lb" beside a 175 lb set would read as a bug.
    expect(formatAchievementDetail(estimatedClaim, 'lb')).toBe(
      '12×175 lb · est. 245 lb, up from 216 lb',
    );
  });

  it('drops the comparison when rounding collapses it onto one number', () => {
    expect(
      formatAchievementDetail({ ...estimatedClaim, previousE1rmLb: 245 }, 'lb'),
    ).toBe('12×175 lb · est. 245 lb');
  });
});
