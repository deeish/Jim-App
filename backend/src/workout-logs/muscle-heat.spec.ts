import {
  computeMuscleHeat,
  HALF_LIFE_DAYS,
  HEAT_DEFAULT_DAYS,
  HEAT_MAX_DAYS,
  heatRangeStart,
  resolveHeatDays,
  SECONDARY_WEIGHT,
  type HeatExercise,
  type HeatLog,
} from './muscle-heat';

const NOW = new Date('2026-09-23T18:00:00Z');
const CATALOG: Record<string, HeatExercise> = {
  squat: {
    primaryMuscleGroup: 'Legs',
    subMuscles: ['Quads'],
    secondaryMuscleGroups: ['Back'],
  },
  bench: {
    primaryMuscleGroup: 'Chest',
    subMuscles: ['Mid Chest'],
    secondaryMuscleGroups: [],
  },
  legacy_leg_row: {
    primaryMuscleGroup: 'Legs',
    subMuscles: [],
    secondaryMuscleGroups: [],
  },
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

  it('counts completed sets for the primary sub-muscle at full weight today', () => {
    const heat = computeMuscleHeat(
      [log('2026-09-23T17:00:00Z', 'squat', 4)],
      lookup,
      NOW,
      7,
    );
    const quads = heat.muscles.find((m) => m.muscle === 'Quads');
    expect(quads).toBeDefined();
    expect(quads!.sets).toBe(4);
    expect(quads!.score).toBeCloseTo(
      4 * Math.pow(2, -(1 / 24) / HALF_LIFE_DAYS),
      1,
    );
    expect(quads!.group).toBe('Legs');
    expect(quads!.lastTrainedAt).toBe('2026-09-23T17:00:00.000Z');
  });

  it('spreads secondary groups over their sub-muscles at half weight', () => {
    const heat = computeMuscleHeat(
      [log('2026-09-23T17:00:00Z', 'squat', 4)],
      lookup,
      NOW,
      7,
    );
    const lats = heat.muscles.find((m) => m.muscle === 'Lats');
    const quads = heat.muscles.find((m) => m.muscle === 'Quads')!;
    expect(lats).toBeDefined();
    expect(lats!.assistSets).toBe(4);
    expect(lats!.sets).toBe(0);
    // scores are rounded to 2 dp in the payload, so compare loosely
    expect(lats!.score).toBeCloseTo(quads.score * SECONDARY_WEIGHT, 1);
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
    const f = fresh.muscles.find((m) => m.muscle === 'Mid Chest')!.score;
    const o = old.muscles.find((m) => m.muscle === 'Mid Chest')!.score;
    expect(f).toBeCloseTo(4, 5);
    expect(o).toBeCloseTo(2, 1);
    expect(gone.muscles).toEqual([]);
  });

  it('ignores uncompleted sets and unknown exercises', () => {
    const heat = computeMuscleHeat(
      [
        log('2026-09-23T17:00:00Z', 'squat', 3, false),
        log('2026-09-23T17:00:00Z', 'nope', 3),
      ],
      lookup,
      NOW,
      7,
    );
    expect(heat.muscles).toEqual([]);
  });

  it('falls back to the whole primary group for rows with no sub-muscles', () => {
    const heat = computeMuscleHeat(
      [log('2026-09-23T17:00:00Z', 'legacy_leg_row', 2)],
      lookup,
      NOW,
      7,
    );
    const names = heat.muscles.map((m) => m.muscle).sort();
    expect(names).toEqual([
      'Calves',
      'Glutes',
      'Hamstrings',
      'Inner Thighs',
      'Outer Thighs',
      'Quads',
    ]);
  });

  it('saturates intensity into 0..1 and sorts hottest first', () => {
    const heat = computeMuscleHeat(
      [
        log('2026-09-23T17:00:00Z', 'squat', 30),
        log('2026-09-23T17:00:00Z', 'bench', 2),
      ],
      lookup,
      NOW,
      7,
    );
    expect(heat.muscles[0].muscle).toBe('Quads');
    expect(heat.muscles[0].intensity).toBeGreaterThan(0.9);
    expect(heat.muscles[0].intensity).toBeLessThanOrEqual(1);
    const chest = heat.muscles.find((m) => m.muscle === 'Mid Chest')!;
    expect(chest.intensity).toBeGreaterThan(0);
    expect(chest.intensity).toBeLessThan(0.3);
    expect(heat.days).toBe(7);
    expect(heat.generatedAt).toBe(NOW.toISOString());
  });
});
