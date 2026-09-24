import {
  computeMuscleHeat,
  DIRECT_WEIGHT,
  HALF_LIFE_DAYS,
  HEAT_DEFAULT_DAYS,
  HEAT_MAX_DAYS,
  heatRangeStart,
  resolveHeatDays,
  type HeatExercise,
  type HeatLog,
} from './muscle-heat';

const NOW = new Date('2026-09-23T18:00:00Z');
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
const CATALOG: Record<string, HeatExercise> = {
  leg_curl: {
    muscles: [
      p('Semitendinosus', 'Hamstrings', 1),
      p('Biceps Femoris', 'Hamstrings', 0.6),
    ],
  },
  rdl: {
    muscles: [
      p('Biceps Femoris', 'Hamstrings', 1),
      p('Semitendinosus', 'Hamstrings', 0.7),
      p('Glute Max', 'Glutes', 1),
      s('Erector Spinae', 'Lower Back', 0.5),
    ],
  },
  bench: {
    muscles: [
      p('Mid Chest', 'Mid Chest', 1),
      s('Triceps (lateral head)', 'Triceps', 0.5),
      s('Front Delts', 'Front Delts', 0.5),
    ],
  },
  cardio_row: { muscles: [] },
};
const lookup = (id: string) => CATALOG[id];

function log(
  startedAt: string,
  exerciseId: string,
  sets: number,
  completed = true,
): HeatLog {
  return {
    startedAt: new Date(startedAt),
    entries: [
      {
        exerciseId,
        completedSets: Array.from({ length: sets }, () => ({ completed })),
      },
    ],
  };
}
const find = (heat: ReturnType<typeof computeMuscleHeat>, region: string) =>
  heat.muscles.find((m) => m.region === region);

describe('muscle-heat', () => {
  it('resolves the day window with a default and a cap', () => {
    expect(resolveHeatDays()).toBe(HEAT_DEFAULT_DAYS);
    expect(resolveHeatDays(3)).toBe(3);
    expect(resolveHeatDays(999)).toBe(HEAT_MAX_DAYS);
    expect(resolveHeatDays(0)).toBe(1);
    expect(heatRangeStart(7, NOW).toISOString()).toBe(
      '2026-09-16T18:00:00.000Z',
    );
  });

  it('scores each region by its involvement weight, so a leg curl lands harder on the inner hamstring', () => {
    const heat = computeMuscleHeat(
      [log('2026-09-23T17:00:00Z', 'leg_curl', 4)],
      lookup,
      NOW,
      7,
    );
    const st = find(heat, 'Semitendinosus')!;
    const bf = find(heat, 'Biceps Femoris')!;
    expect(st.score).toBeCloseTo(
      4 * Math.pow(2, -(1 / 24) / HALF_LIFE_DAYS),
      1,
    );
    expect(bf.score).toBeCloseTo(st.score * 0.6, 1);
    expect(st.muscle).toBe('Hamstrings');
    expect(st.group).toBe('Legs');
    expect(st.sets).toBe(4);
    expect(bf.sets).toBe(4); // 0.6 still counts as direct work
    expect(st.lastTrainedAt).toBe('2026-09-23T17:00:00.000Z');
  });

  it('counts light involvement as assisting, not direct', () => {
    const heat = computeMuscleHeat(
      [log('2026-09-23T17:00:00Z', 'bench', 5)],
      lookup,
      NOW,
      7,
    );
    const tri = find(heat, 'Triceps (lateral head)')!;
    expect(tri.sets).toBe(0);
    expect(tri.assistSets).toBe(5);
    expect(tri.score).toBeCloseTo(find(heat, 'Mid Chest')!.score * 0.5, 1);
    expect(DIRECT_WEIGHT).toBeGreaterThan(0.5);
  });

  it('decays by age with the stated half-life and drops sets outside the window', () => {
    const fresh = computeMuscleHeat(
      [log('2026-09-23T18:00:00Z', 'bench', 4)],
      lookup,
      NOW,
      7,
    );
    const old = computeMuscleHeat(
      [log('2026-09-20T06:00:00Z', 'bench', 4)],
      lookup,
      NOW,
      7,
    ); // 3.5 days ago
    const gone = computeMuscleHeat(
      [log('2026-09-10T18:00:00Z', 'bench', 4)],
      lookup,
      NOW,
      7,
    );
    expect(find(fresh, 'Mid Chest')!.score).toBeCloseTo(4, 5);
    expect(find(old, 'Mid Chest')!.score).toBeCloseTo(2, 1);
    expect(gone.muscles).toEqual([]);
  });

  it('ignores uncompleted sets, unknown exercises and rows with no muscles', () => {
    const heat = computeMuscleHeat(
      [
        log('2026-09-23T17:00:00Z', 'leg_curl', 3, false),
        log('2026-09-23T17:00:00Z', 'nope', 3),
        log('2026-09-23T17:00:00Z', 'cardio_row', 3),
      ],
      lookup,
      NOW,
      7,
    );
    expect(heat.muscles).toEqual([]);
  });

  it('saturates intensity into 0..1 and sorts hottest first', () => {
    const heat = computeMuscleHeat(
      [
        log('2026-09-23T17:00:00Z', 'rdl', 30),
        log('2026-09-23T17:00:00Z', 'bench', 2),
      ],
      lookup,
      NOW,
      7,
    );
    expect(heat.muscles[0].region).toBe('Biceps Femoris');
    expect(heat.muscles[0].intensity).toBeGreaterThan(0.9);
    expect(heat.muscles[0].intensity).toBeLessThanOrEqual(1);
    const chest = find(heat, 'Mid Chest')!;
    expect(chest.intensity).toBeGreaterThan(0);
    expect(chest.intensity).toBeLessThan(0.3);
    expect(heat.days).toBe(7);
    expect(heat.generatedAt).toBe(NOW.toISOString());
  });
});
