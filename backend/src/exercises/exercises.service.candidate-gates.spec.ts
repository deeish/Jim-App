import { ExercisesService } from './exercises.service';
import { getJointDemands } from '../data/exercise-joint-demands';
import { TECHNICAL_LIFT_NAME } from '../data/technical-lifts';

/**
 * Selection-side gates on the generator's candidate pool (Tier 2c of the
 * 2026-09-16 plan): joints the user is working around, and technical lifts
 * for beginners. Real catalog, so the assertions hold against the ids the
 * generator actually sees.
 */
describe('ExercisesService.getCandidatesForGenerator gates (real catalog)', () => {
  let service: ExercisesService;
  beforeAll(async () => {
    service = new ExercisesService();
    await service.onModuleInit();
  });

  it('keeps technical lifts out of a beginner pool and leaves them for everyone else', () => {
    const open = service.getCandidatesForGenerator({
      focus: 'lower body',
      limit: 400,
    });
    const gated = service.getCandidatesForGenerator({
      focus: 'lower body',
      limit: 400,
      excludeTechnical: true,
    });
    const technicalInOpen = open.filter((e) =>
      TECHNICAL_LIFT_NAME.test(e.name),
    );
    expect(technicalInOpen.length).toBeGreaterThan(0); // the catalog has them
    expect(gated.some((e) => TECHNICAL_LIFT_NAME.test(e.name))).toBe(false);
    expect(gated.some((e) => e.id === 'back_squat')).toBe(true); // the basics stay
  });

  it('drops every row the joint audit marks as loading an avoided joint', () => {
    const pool = service.getCandidatesForGenerator({
      focus: 'lower body',
      limit: 400,
      avoidJoints: ['knee'],
    });
    for (const e of pool) {
      expect(getJointDemands(e.id) ?? []).not.toContain('knee');
    }
    // A knee-heavy staple is gone; a hinge stays.
    expect(pool.some((e) => e.id === 'back_squat')).toBe(
      !(getJointDemands('back_squat') ?? []).includes('knee'),
    );
    expect(pool.length).toBeGreaterThan(10);
  });

  it('is a no-op with empty gates', () => {
    const a = service.getCandidatesForGenerator({
      focus: 'upper body',
      limit: 60,
    });
    const b = service.getCandidatesForGenerator({
      focus: 'upper body',
      limit: 60,
      avoidJoints: [],
      excludeTechnical: false,
    });
    expect(b.map((e) => e.id)).toEqual(a.map((e) => e.id));
  });
});
