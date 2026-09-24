import {
  calibrationFromSoreness,
  computeMuscleRecovery,
  fatigueCurve,
  hardnessFromRpe,
  levelToStep,
  NOVELTY_FACTOR,
  PEAK_HOURS,
  peakHoursFor,
  SORE_NOTE_DAYS,
  type RecoveryExercise,
  type RecoveryLog,
} from './muscle-recovery';

const NOW = new Date('2026-09-24T18:00:00Z');
const H = 3_600_000;
const p = (region: string, sub: string, weight = 1) => ({
  region,
  sub,
  role: 'primary' as const,
  weight,
});
const s = (region: string, sub: string, weight = 0.5) => ({
  region,
  sub,
  role: 'secondary' as const,
  weight,
});
const CATALOG: Record<string, RecoveryExercise> = {
  leg_curl: {
    muscles: [
      p('Semitendinosus', 'Hamstrings', 1),
      p('Biceps Femoris', 'Hamstrings', 0.6),
    ],
  },
  bench: {
    muscles: [
      p('Mid Chest', 'Mid Chest', 1),
      s('Triceps (lateral head)', 'Triceps', 0.5),
    ],
  },
  curl: { muscles: [p('Biceps (long head)', 'Biceps', 1)] },
};
const lookup = (id: string) => CATALOG[id];
function log(
  hoursAgo: number,
  exerciseId: string,
  sets: number,
  extra: Partial<RecoveryLog> = {},
  rpe?: number,
): RecoveryLog {
  return {
    startedAt: new Date(NOW.getTime() - hoursAgo * H),
    entries: [
      {
        exerciseId,
        completedSets: Array.from({ length: sets }, () => ({
          completed: true,
          rpe,
        })),
      },
    ],
    ...extra,
  };
}
const region = (r: ReturnType<typeof computeMuscleRecovery>, name: string) =>
  r.regions.find((x) => x.region === name);

describe('muscle-recovery', () => {
  it('has a curve that is zero at the session, peaks at tau and fades', () => {
    expect(fatigueCurve(0, 40)).toBe(0);
    expect(fatigueCurve(40, 40)).toBeCloseTo(1, 5);
    expect(fatigueCurve(20, 40)).toBeLessThan(1);
    expect(fatigueCurve(160, 40)).toBeLessThan(0.25); // ~0.2 at 4 tau (a week for a large muscle)
    expect(fatigueCurve(240, 40)).toBeLessThan(0.05);
    expect(peakHoursFor('Semitendinosus')).toBe(PEAK_HOURS.large);
    expect(peakHoursFor('Soleus')).toBe(PEAK_HOURS.small);
    expect(peakHoursFor('Infraspinatus')).toBe(PEAK_HOURS.small);
  });

  it('rises after a session rather than being highest immediately', () => {
    const justNow = computeMuscleRecovery({
      logs: [log(1, 'leg_curl', 8)],
      lookup,
      notes: [],
      now: NOW,
    });
    const tomorrow = computeMuscleRecovery({
      logs: [log(30, 'leg_curl', 8)],
      lookup,
      notes: [],
      now: NOW,
    });
    expect(region(tomorrow, 'Semitendinosus')!.level).toBeGreaterThan(
      region(justNow, 'Semitendinosus')!.level,
    );
  });

  it('weights by involvement, RPE and novelty', () => {
    const r = computeMuscleRecovery({
      logs: [log(36, 'leg_curl', 8)],
      lookup,
      notes: [],
      now: NOW,
    });
    expect(region(r, 'Semitendinosus')!.level).toBeGreaterThan(
      region(r, 'Biceps Femoris')!.level,
    );
    expect(region(r, 'Semitendinosus')!.sets).toBe(8);
    expect(hardnessFromRpe([8, 8])).toBe(1);
    expect(hardnessFromRpe([10])).toBe(1.2);
    expect(hardnessFromRpe([4])).toBe(0.6);
    expect(hardnessFromRpe([null, undefined])).toBe(1);
    // the same session, seen for the first time vs repeated a month earlier
    const novel = computeMuscleRecovery({
      logs: [log(36, 'curl', 6)],
      lookup,
      notes: [],
      now: NOW,
    });
    const repeated = computeMuscleRecovery({
      logs: [log(36, 'curl', 6), log(24 * 30, 'curl', 6)],
      lookup,
      notes: [],
      now: NOW,
    });
    expect(region(novel, 'Biceps (long head)')!.level).toBeGreaterThan(
      region(repeated, 'Biceps (long head)')!.level,
    );
    expect(NOVELTY_FACTOR).toBeGreaterThan(1);
  });

  it('cuts levels into five labelled steps and estimates days to fresh', () => {
    expect(levelToStep(0)).toBe(0);
    expect(levelToStep(0.1)).toBe(1);
    expect(levelToStep(0.9)).toBe(5);
    const r = computeMuscleRecovery({
      logs: [log(30, 'leg_curl', 20)],
      lookup,
      notes: [],
      now: NOW,
    });
    const st = region(r, 'Semitendinosus')!;
    expect(st.step).toBeGreaterThanOrEqual(4);
    expect(st.label).toMatch(/fatigued/i);
    expect(st.freshInDays).toBeGreaterThan(0);
    expect(st.freshInDays).toBeLessThanOrEqual(14);
    expect(st.group).toBe('Legs');
    expect(st.muscle).toBe('Hamstrings');
  });

  it('applies corrections: sore pins the top step and fades, fine drops earlier doses', () => {
    const base = computeMuscleRecovery({
      logs: [log(30, 'bench', 4)],
      lookup,
      notes: [],
      now: NOW,
    });
    const sore = computeMuscleRecovery({
      logs: [log(30, 'bench', 4)],
      lookup,
      notes: [
        {
          region: 'Mid Chest',
          kind: 'sore',
          createdAt: new Date(NOW.getTime() - 2 * H),
        },
      ],
      now: NOW,
    });
    expect(region(sore, 'Mid Chest')!.step).toBe(5);
    expect(region(sore, 'Mid Chest')!.note).toEqual({
      kind: 'sore',
      at: new Date(NOW.getTime() - 2 * H).toISOString(),
    });
    const soreOld = computeMuscleRecovery({
      logs: [],
      lookup,
      notes: [
        {
          region: 'Mid Chest',
          kind: 'sore',
          createdAt: new Date(NOW.getTime() - (SORE_NOTE_DAYS + 1) * 24 * H),
        },
      ],
      now: NOW,
    });
    expect(region(soreOld, 'Mid Chest')!.step).toBe(0);
    const fine = computeMuscleRecovery({
      logs: [log(30, 'bench', 4)],
      lookup,
      notes: [
        {
          region: 'Mid Chest',
          kind: 'fine',
          createdAt: new Date(NOW.getTime() - 1 * H),
        },
      ],
      now: NOW,
    });
    expect(region(fine, 'Mid Chest')!.level).toBe(0);
    expect(region(base, 'Mid Chest')!.level).toBeGreaterThan(0);
  });

  it('calibrates the curve from check-in soreness and flags regions today touches', () => {
    expect(calibrationFromSoreness([])).toBe(1);
    expect(calibrationFromSoreness([2, 2])).toBeCloseTo(1.15);
    expect(calibrationFromSoreness([0])).toBeCloseTo(0.85);
    const r = computeMuscleRecovery({
      logs: [log(30, 'leg_curl', 8)],
      lookup,
      notes: [],
      now: NOW,
      exerciseIdsToday: ['bench'],
    });
    expect(region(r, 'Semitendinosus')!.touchedToday).toBe(false);
    const r2 = computeMuscleRecovery({
      logs: [log(30, 'leg_curl', 8)],
      lookup,
      notes: [],
      now: NOW,
      exerciseIdsToday: ['leg_curl'],
    });
    expect(region(r2, 'Semitendinosus')!.touchedToday).toBe(true);
  });
});
