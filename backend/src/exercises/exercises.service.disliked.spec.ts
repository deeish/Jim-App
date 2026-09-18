import { ExercisesService } from './exercises.service';
import { runWithExcludedExerciseIds } from '../common/excluded-exercises.context';

/**
 * The disliked list (2026-09-17) is applied on the server through the
 * excluded-exercises context. Real catalog: the ids below are the ones the
 * generator and the swap picker actually see.
 */
describe('ExercisesService honours the excluded-exercises context (real catalog)', () => {
  let service: ExercisesService;
  beforeAll(async () => {
    service = new ExercisesService();
    await service.onModuleInit();
  });

  const DISLIKED = [
    'conventional_deadlift',
    'trap_bar_deadlift',
    'barbell_sumo_deadlift',
    'dumbbell_romanian_deadlift',
    'barbell_romanian_deadlift',
  ];

  it('keeps disliked ids out of the generator pool inside a scope, and in it outside', () => {
    const open = service.getCandidatesForGenerator({
      focus: 'lower body',
      limit: 400,
    });
    expect(open.some((e) => e.id === 'conventional_deadlift')).toBe(true);

    const scoped = runWithExcludedExerciseIds(DISLIKED, () =>
      service.getCandidatesForGenerator({ focus: 'lower body', limit: 400 }),
    );
    expect(scoped.some((e) => DISLIKED.includes(e.id))).toBe(false);
    expect(scoped.some((e) => e.id === 'back_squat')).toBe(true);
  });

  it('never suggests a disliked lift as a replacement', () => {
    const dto = {
      targetExerciseId: 'barbell_romanian_deadlift',
      dayExerciseIds: ['back_squat'],
      location: 'gym',
    } as never;
    const picks = runWithExcludedExerciseIds(DISLIKED, () =>
      service.pickReplacementSuggestions(dto, undefined),
    );
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.some((p) => DISLIKED.includes(p.exercise.id))).toBe(false);
    const one = runWithExcludedExerciseIds(DISLIKED, () =>
      service.pickReplacement(dto, undefined),
    );
    expect(one && DISLIKED.includes(one.id)).toBe(false);
  });

  it('leaves the catalog browse and findByIds alone so the hidden list can still be shown', () => {
    const rows = runWithExcludedExerciseIds(DISLIKED, () =>
      service.findByIds(['conventional_deadlift']),
    );
    expect(rows.map((r) => r.id)).toEqual(['conventional_deadlift']);
    const browse = service.search({ query: 'deadlift' } as never);
    expect(browse.some((e) => e.id === 'conventional_deadlift')).toBe(true);
  });
});
