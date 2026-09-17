import { ExercisesService } from './exercises.service';
import { getJointDemands } from '../data/exercise-joint-demands';
import {
  BASIC_BODYWEIGHT_NAME,
  TECHNICAL_LIFT_NAME,
} from '../data/technical-lifts';
import { WorkoutGeneratorService } from '../workouts/workout-generator.service';

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

  it('keeps push-ups and bodyweight squats out of an advanced gym pool, but not pull-ups or dips', () => {
    const gated = service.getCandidatesForGenerator({
      focus: 'upper body',
      limit: 400,
      excludeBasicBodyweight: true,
    });
    expect(gated.some((e) => BASIC_BODYWEIGHT_NAME.test(e.name))).toBe(false);
    expect(gated.some((e) => /pull-?up/i.test(e.name))).toBe(true);
    expect(gated.some((e) => /dip/i.test(e.name))).toBe(true);
    const open = service.getCandidatesForGenerator({
      focus: 'upper body',
      limit: 400,
    });
    expect(open.some((e) => e.id === 'push_up')).toBe(true);
  });

  it('candidateGates: only an advanced lifter with gym equipment loses the bodyweight basics', () => {
    const gym = ['barbell', 'dumbbells', 'cable_machine'];
    expect(
      WorkoutGeneratorService.candidateGates([], 'advanced', gym)
        .excludeBasicBodyweight,
    ).toBe(true);
    expect(
      WorkoutGeneratorService.candidateGates([], 'advanced', ['dumbbells'])
        .excludeBasicBodyweight,
    ).toBe(false);
    expect(
      WorkoutGeneratorService.candidateGates([], 'intermediate', gym)
        .excludeBasicBodyweight,
    ).toBe(false);
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
