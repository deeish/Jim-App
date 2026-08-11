import { ExercisesService } from './exercises.service';
import { EXERCISE_TIERS, TIER_ORDER } from '../data/exercise-tiers';
import { isCommonExercise } from '../data/common-exercise-ids';
import { getJointDemands } from '../data/exercise-joint-demands';

/**
 * End-to-end search against the real catalog (data/exercises_5000plus.json),
 * covering the exact queries that used to return nothing. Runs with the backend
 * dir as cwd, so the service loads the real data file the same way it does in prod.
 */
describe('ExercisesService.search (real catalog)', () => {
  let service: ExercisesService;

  beforeAll(async () => {
    service = new ExercisesService();
    await service.onModuleInit();
  });

  const ids = (query: string) =>
    service.search({ searchQuery: query }).map((e) => e.id);

  it('finds Romanian Deadlifts regardless of word order or equipment placement', () => {
    const found = ids('romanian deadlift barbell');
    expect(found).toContain('barbell_romanian_deadlift');
    // The back-side twin was retired by the catalog audit (Task 3) and must
    // no longer surface in search.
    expect(found).not.toContain('romanian_deadlift');
  });

  it('finds the machine leg extension despite "machine" + plural', () => {
    const found = ids('machine leg extensions');
    expect(found).toContain('seated_leg_extension');
  });

  it('ranks a name match above a result that only matched another field', () => {
    const found = ids('romanian deadlift');
    const rdlIndex = found.indexOf('barbell_romanian_deadlift');
    expect(rdlIndex).toBeGreaterThanOrEqual(0);
    // Should sit at/near the top, well above the long tail of variants/related hits.
    expect(rdlIndex).toBeLessThan(5);
  });

  it('resolves an alias', () => {
    expect(ids('rdl')).toContain('barbell_romanian_deadlift');
  });
});

describe('ExercisesService.search tier ordering (Task 13 Phase B)', () => {
  let service: ExercisesService;

  beforeAll(async () => {
    service = new ExercisesService();
    await service.onModuleInit();
  });

  const tierOf = (id: string): string => EXERCISE_TIERS[id] ?? '?';
  const tierRank = (id: string): number => TIER_ORDER[EXERCISE_TIERS[id]] ?? 5;

  it('browse lists are non-increasing in tier (default ordering)', () => {
    for (const filter of [
      { subMuscles: ['Calves'] },
      { subMuscles: ['Forearms'] },
      { muscleGroups: ['Chest'] },
      { muscleGroups: ['Back'] },
    ]) {
      const ranks = service.search(filter).map((e) => tierRank(e.id));
      expect(ranks.length).toBeGreaterThan(0);
      const sorted = [...ranks].sort((a, b) => a - b);
      expect(ranks).toEqual(sorted);
    }
  });

  it('a capped category still surfaces its own leaders first (calves has no S)', () => {
    const found = service.search({ subMuscles: ['Calves'] });
    expect(found.length).toBeGreaterThan(0);
    expect(tierOf(found[0].id)).toBe('A');
    expect(
      [
        'standing_calf_raise_machine',
        'seated_calf_raise_machine',
        'bodyweight_calf_raise',
      ].includes(found[0].id),
    ).toBe(true);
  });

  it('group browse leads with an S-tier row', () => {
    const found = service.search({ muscleGroups: ['Chest'] });
    expect(tierOf(found[0].id)).toBe('S');
  });

  it('generator candidate pools lead with S-tier rows (Phase C)', () => {
    const pool = service.getCandidatesForGenerator({ focus: 'chest' });
    expect(pool.length).toBeGreaterThan(0);
    expect(tierOf(pool[0].id)).toBe('S');
    // Common staples are the within-tier tiebreak, so the head of the pool
    // is still recognizable gym canon.
    expect(isCommonExercise(pool[0].id)).toBe(true);
  });

  it('recommendedOnly returns only S/A rows and flags them recommended', () => {
    const found = service.search({
      muscleGroups: ['Chest'],
      recommendedOnly: true,
    });
    expect(found.length).toBeGreaterThan(0);
    for (const e of found) {
      expect(['S', 'A']).toContain(EXERCISE_TIERS[e.id]);
      expect(e.recommended).toBe(true);
    }
  });

  it('marks S/A rows recommended in normal browse and leaves the tail unmarked', () => {
    const found = service.search({ muscleGroups: ['Chest'] });
    const flat = found.find((e) => e.id === 'flat_barbell_bench_press');
    const tail = found.find((e) => e.id === 'svend_press'); // C tier
    expect(flat?.recommended).toBe(true);
    expect(tail).toBeDefined();
    expect(tail?.recommended).toBeUndefined();
  });

  it('joint-naming avoid phrases exclude joint-tagged replacement candidates', () => {
    for (let i = 0; i < 10; i++) {
      const replacement = service.pickReplacement({
        targetName: 'Barbell Overhead Press',
        avoid: ['bad shoulder'],
      } as Parameters<ExercisesService['pickReplacement']>[0]);
      if (!replacement) continue;
      expect(getJointDemands(replacement.id) ?? []).not.toContain('shoulder');
    }
  });
});
