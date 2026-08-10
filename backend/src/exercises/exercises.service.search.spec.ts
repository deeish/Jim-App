import { ExercisesService } from './exercises.service';

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
