import {
  calendarSessionsFromLogs,
  dominantMuscle,
  formatClock,
  loggedSetDetail,
  storedSetDetail,
  loggedDurationSeconds,
  parseRepsCount,
  parseWeightLb,
  sessionsFromWorkoutLogs,
  streakWithSession,
  type CelebrationExercise,
  type LoggedSetStrings,
} from './sessionCelebration';
import { summarizeSessionTotals } from './sessionAchievements';
import type { WorkoutLog, WorkoutStatsSession } from '../types/workout';

describe('parseRepsCount', () => {
  it('takes the top of a band and plain numbers', () => {
    expect(parseRepsCount('5–8')).toBe(8);
    expect(parseRepsCount('12')).toBe(12);
  });

  it('treats timed prescriptions as zero reps, like the log POST does', () => {
    expect(parseRepsCount('10 min')).toBe(0);
    expect(parseRepsCount('45 sec')).toBe(0);
  });

  it('returns 0 when no digits exist', () => {
    expect(parseRepsCount('AMRAP')).toBe(0);
  });
});

describe('parseWeightLb', () => {
  it('reads the number out of a display weight', () => {
    expect(parseWeightLb('185 lb')).toBe(185);
    expect(parseWeightLb('22.5 lb')).toBe(22.5);
  });

  it('reads Bodyweight and the em dash as unweighted', () => {
    expect(parseWeightLb('Bodyweight')).toBeUndefined();
    expect(parseWeightLb('—')).toBeUndefined();
  });
});

describe('calendarSessionsFromLogs', () => {
  const exercises: CelebrationExercise[] = [
    { name: 'Bench Press', muscle: 'Chest', exerciseId: 'bench', sets: 3, reps: '5–8', weight: '145 lb' },
    { name: 'Pull-Up', muscle: 'Back', exerciseId: 'pullup', sets: 3, reps: '8–10', weight: 'Bodyweight' },
    { name: 'Plank', muscle: 'Core', exerciseId: 'plank', sets: 3, reps: '45 sec', weight: '—' },
    { name: 'Skipped Fly', muscle: 'Chest', exerciseId: 'fly', sets: 3, reps: '12', weight: '40 lb' },
  ];
  const logs: Record<number, LoggedSetStrings[]> = {
    0: [
      { reps: '8', weight: '135 lb' },
      { reps: '5', weight: '145 lb' },
    ],
    1: [{ reps: '9', weight: 'Bodyweight' }],
    2: [{ reps: '45 sec', weight: '—' }],
    3: [],
  };
  const sessions = calendarSessionsFromLogs(exercises, (i) => logs[i] ?? []);

  it('drops exercises with no logged sets, matching the POSTed entries', () => {
    expect(sessions.map((s) => s.exercise.name)).toEqual([
      'Bench Press',
      'Pull-Up',
      'Plank',
    ]);
    // The original slot index survives for anyone keying back into the day.
    expect(sessions.map((s) => s.exerciseIndex)).toEqual([0, 1, 2]);
  });

  it('parses sets exactly the way the workout-log POST does', () => {
    expect(sessions[0].completedSets).toEqual([
      { setNumber: 1, reps: 8, weight: 135, completed: true },
      { setNumber: 2, reps: 5, weight: 145, completed: true },
    ]);
    // Bodyweight carries no weight key at all — not weight: 0.
    expect(sessions[1].completedSets[0]).toEqual({
      setNumber: 1,
      reps: 9,
      completed: true,
    });
    // Timed sets log zero reps, same as the server record.
    expect(sessions[2].completedSets[0].reps).toBe(0);
  });

  it('marks timed prescriptions so achievement rendering reads seconds', () => {
    expect(sessions[2].exercise.prescriptionType).toBe('time');
    expect(sessions[0].exercise.prescriptionType).toBe('reps');
  });

  it('feeds summarizeSessionTotals the numbers the log would carry', () => {
    const totals = summarizeSessionTotals(sessions);
    expect(totals.completedSets).toBe(4);
    expect(totals.exercisesWorked).toBe(3);
    // 8×135 + 5×145 = 1805; bodyweight and timed sets add nothing.
    expect(totals.volumeLb).toBe(1805);
    expect(totals.hasWeightedWork).toBe(true);
  });
});

describe('streakWithSession', () => {
  // Wednesday Aug 19 2026, local. Its Monday is Aug 17.
  const now = new Date(2026, 7, 19, 18, 0, 0);
  const statsSession = (startedAt: Date): WorkoutStatsSession => ({
    id: startedAt.toISOString(),
    startedAt: startedAt.toISOString(),
    completedAt: null,
    totalTimeSeconds: null,
    totalSets: null,
    totalVolume: null,
    workoutName: null,
  });

  it("counts today's unposted session as this week", () => {
    // History covers last week only; the session being celebrated is what
    // makes it a 2-week streak.
    const stats = [statsSession(new Date(2026, 7, 12, 18, 0, 0))];
    expect(streakWithSession(stats, now, now)).toBe(2);
    expect(streakWithSession([], now, now)).toBe(1);
  });

  it('credits a backdated log to its own week, not this one', () => {
    // Logging "for" two weeks ago with no other history: that week does not
    // reach the current one, so no live streak is claimed.
    expect(streakWithSession([], new Date(2026, 7, 4), now)).toBe(0);
    // But logging for LAST week keeps a current streak alive via the
    // one-week grace the Progress screen already gives.
    expect(streakWithSession([], new Date(2026, 7, 12), now)).toBe(1);
  });
});

describe('formatClock', () => {
  it('renders mm:ss under an hour and h:mm:ss past it', () => {
    expect(formatClock(2538)).toBe('42:18');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatClock(0)).toBe('0:00');
  });
});

describe('dominantMuscle', () => {
  it('picks the most frequent logged muscle, ignoring unlogged rows', () => {
    expect(
      dominantMuscle([
        { muscle: 'Chest', logged: true },
        { muscle: 'Shoulders', logged: true },
        { muscle: 'Chest', logged: true },
        { muscle: 'Triceps', logged: false },
      ]),
    ).toBe('Chest');
  });

  it('breaks ties toward the session opener and handles empty days', () => {
    expect(
      dominantMuscle([
        { muscle: 'Back', logged: true },
        { muscle: 'Biceps', logged: true },
      ]),
    ).toBe('Back');
    expect(dominantMuscle([])).toBeNull();
  });
});

/** Minimal stored log — only the fields the recap reads. */
function makeLog(
  id: string,
  startedAt: string,
  totalTimeSeconds: number | null,
  entries: Array<{
    exerciseId: string;
    name: string | null;
    orderIndex: number;
    sets: Array<{ reps: number; weight?: number; completed?: boolean }>;
  }>,
): WorkoutLog {
  return {
    id,
    workoutId: `w-${id}`,
    startedAt,
    completedAt: startedAt,
    totalTimeSeconds,
    totalSets: null,
    totalVolume: null,
    overallNotes: null,
    workout: { id: `w-${id}`, name: 'Session', exercises: [] } as unknown as WorkoutLog['workout'],
    entries: entries.map((e, i) => ({
      id: `${id}-e${i}`,
      exerciseId: e.exerciseId,
      name: e.name,
      orderIndex: e.orderIndex,
      notes: null,
      completedSets: e.sets.map((s, si) => ({
        setNumber: si + 1,
        reps: s.reps,
        ...(s.weight != null ? { weight: s.weight } : null),
        completed: s.completed ?? true,
      })),
    })),
  };
}

describe('sessionsFromWorkoutLogs', () => {
  it('reads a stored log back into the shape the finish screen consumes', () => {
    const sessions = sessionsFromWorkoutLogs([
      makeLog('a', '2026-08-20T12:00:00.000Z', 2700, [
        {
          exerciseId: 'flat_barbell_bench_press',
          name: 'Flat Barbell Bench Press',
          orderIndex: 0,
          sets: [
            { reps: 8, weight: 135 },
            { reps: 6, weight: 145 },
          ],
        },
      ]),
    ]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].exercise.name).toBe('Flat Barbell Bench Press');
    expect(sessions[0].exercise.exerciseId).toBe('flat_barbell_bench_press');
    expect(sessions[0].completedSets).toEqual([
      { setNumber: 1, reps: 8, weight: 135, completed: true },
      { setNumber: 2, reps: 6, weight: 145, completed: true },
    ]);
    // Totals must match what the same session produced when it was live.
    expect(summarizeSessionTotals(sessions)).toMatchObject({
      completedSets: 2,
      exercisesWorked: 1,
      volumeLb: 8 * 135 + 6 * 145,
      hasWeightedWork: true,
    });
  });

  it('orders entries by orderIndex and concatenates a reopened day by start time', () => {
    const later = makeLog('later', '2026-08-20T18:00:00.000Z', 600, [
      { exerciseId: 'pull_up', name: 'Pull-Up', orderIndex: 0, sets: [{ reps: 9 }] },
    ]);
    const earlier = makeLog('earlier', '2026-08-20T09:00:00.000Z', 1800, [
      { exerciseId: 'b', name: 'Second', orderIndex: 1, sets: [{ reps: 5, weight: 50 }] },
      { exerciseId: 'a', name: 'First', orderIndex: 0, sets: [{ reps: 5, weight: 60 }] },
    ]);
    const names = sessionsFromWorkoutLogs([later, earlier]).map((s) => s.exercise.name);
    expect(names).toEqual(['First', 'Second', 'Pull-Up']);
  });

  it('drops entries with no completed sets and survives a missing name', () => {
    const sessions = sessionsFromWorkoutLogs([
      makeLog('a', '2026-08-20T12:00:00.000Z', null, [
        { exerciseId: 'skipped', name: 'Skipped', orderIndex: 0, sets: [] },
        {
          exerciseId: 'unnamed',
          name: null,
          orderIndex: 1,
          sets: [{ reps: 10 }, { reps: 10, completed: false }],
        },
      ]),
    ]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].exercise.name).toBe('Exercise');
    expect(sessions[0].completedSets).toHaveLength(1);
  });

  it('returns nothing for an empty history', () => {
    expect(sessionsFromWorkoutLogs([])).toEqual([]);
  });
});

describe('loggedDurationSeconds', () => {
  it('sums the stored elapsed time across a day of logs', () => {
    expect(
      loggedDurationSeconds([
        makeLog('a', '2026-08-20T09:00:00.000Z', 2700, []),
        makeLog('b', '2026-08-20T18:00:00.000Z', 900, []),
      ]),
    ).toBe(3600);
  });

  it('is null when nothing carries a duration, so the hero falls back', () => {
    expect(loggedDurationSeconds([])).toBeNull();
    expect(loggedDurationSeconds([makeLog('a', '2026-08-20T09:00:00.000Z', null, [])])).toBeNull();
  });
});

describe('loggedSetDetail', () => {
  it('splits the load so the unit can render quieter than the value', () => {
    expect(loggedSetDetail('8', '135 lb', 'lb')).toEqual({ text: '8 × 135', unit: 'lb' });
    // Stored weights are always pounds, so kg is a conversion, not a relabel.
    expect(loggedSetDetail('8', '135 lb', 'kg')).toEqual({ text: '8 × 61', unit: 'kg' });
  });

  it('treats "reps" as the unit for unweighted work', () => {
    expect(loggedSetDetail('9', 'Bodyweight', 'lb')).toEqual({ text: '9', unit: 'reps' });
    expect(loggedSetDetail('9', '—', 'lb')).toEqual({ text: '9', unit: 'reps' });
  });

  it('keeps a timed set whole rather than inventing a second unit slot', () => {
    expect(loggedSetDetail('45 sec', '—', 'lb')).toEqual({ text: '45 sec' });
    expect(loggedSetDetail('45 sec', '25 lb', 'lb')).toEqual({ text: '45 sec @ 25 lb' });
    expect(loggedSetDetail('10 min', 'Bodyweight', 'lb')).toEqual({ text: '10 min' });
  });

  it('falls back to the load, then a dash, when no rep count survives', () => {
    expect(loggedSetDetail('AMRAP', '95 lb', 'lb')).toEqual({ text: '95', unit: 'lb' });
    expect(loggedSetDetail('AMRAP', 'Bodyweight', 'lb')).toEqual({ text: '—' });
  });

  it('reads a zero load as no load, not a blank one', () => {
    expect(loggedSetDetail('8', '0 lb', 'lb')).toEqual({ text: '8', unit: 'reps' });
  });
});

describe('storedSetDetail', () => {
  it('prints a stored set in the same grammar as a live one', () => {
    expect(storedSetDetail(8, 135, 'lb')).toEqual({ text: '8 × 135', unit: 'lb' });
    expect(storedSetDetail(9, undefined, 'lb')).toEqual({ text: '9', unit: 'reps' });
  });

  it('never prints "0 reps" for the zero a timed set stores', () => {
    expect(storedSetDetail(0, undefined, 'lb')).toEqual({ text: '—' });
    expect(storedSetDetail(0, 25, 'lb')).toEqual({ text: '25', unit: 'lb' });
  });

  it('describes a set that changed weight mid-exercise on its own terms', () => {
    // The case a one-line summary cannot show: four sets, two loads.
    const sets = [
      { reps: 8, weight: 135 },
      { reps: 8, weight: 135 },
      { reps: 6, weight: 145 },
      { reps: 5, weight: 145 },
    ];
    expect(sets.map((s) => storedSetDetail(s.reps, s.weight, 'lb'))).toEqual([
      { text: '8 × 135', unit: 'lb' },
      { text: '8 × 135', unit: 'lb' },
      { text: '6 × 145', unit: 'lb' },
      { text: '5 × 145', unit: 'lb' },
    ]);
  });
});
