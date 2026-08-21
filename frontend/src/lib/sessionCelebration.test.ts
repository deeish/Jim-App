import {
  calendarSessionsFromLogs,
  dominantMuscle,
  formatClock,
  parseRepsCount,
  parseWeightLb,
  streakWithSession,
  type CelebrationExercise,
  type LoggedSetStrings,
} from './sessionCelebration';
import { summarizeSessionTotals } from './sessionAchievements';
import type { WorkoutStatsSession } from '../types/workout';

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
