import { ExercisesService } from '../exercises/exercises.service';
import {
  buildFocusShortlist,
  renderFocusShortlist,
  SLOT_KINDS_BY_FOCUS,
  type ShortlistCandidate,
} from './slot-shortlists';
import { getSlotsForFocus } from '../data/program-templates';

const GYM = [
  'Barbell',
  'Dumbbell',
  'Machine',
  'Cable',
  'Kettlebell',
  'Pull-up Bar',
];
const HOME = ['Dumbbell', 'Resistance Band', 'Bodyweight'];

describe('slot shortlists (real catalog)', () => {
  let library: ExercisesService;
  const pool = (focus: string, equipment: string[]): ShortlistCandidate[] =>
    library
      .getCandidatesForGenerator({ focus, equipment, limit: 400 })
      .map((e) => ({
        id: e.id,
        name: e.name,
        primaryMuscleGroup: e.primaryMuscleGroup,
        movementPatterns: e.movementPatterns ?? [],
        subMuscles: e.subMuscles ?? [],
        type: (e as { type?: string }).type,
      }));
  beforeAll(async () => {
    library = new ExercisesService();
    await library.onModuleInit();
  });

  it('every focus with slots has one kind per slot', () => {
    for (const [key, kinds] of Object.entries(SLOT_KINDS_BY_FOCUS)) {
      expect(kinds.length).toBe(getSlotsForFocus(key).length);
    }
  });

  it('a gym intermediate Lower day: barbell squat leads slot 1, no goblet or bodyweight squat among the openers', () => {
    const list = buildFocusShortlist({
      focusLabel: 'Lower',
      pool: pool('lower', GYM),
      gymLike: true,
      difficulty: 'intermediate',
    })!;
    expect(list).not.toBeNull();
    const [squat, hinge, iso, calvesCore] = list.slots;
    expect(squat!.candidates[0]!.id).toBe('back_squat');
    const openers = squat!.candidates.map((c) => c.id);
    expect(openers).not.toContain('goblet_squat');
    expect(openers).not.toContain('bodyweight_squat');
    expect(openers.length).toBeLessThanOrEqual(5);
    // squats lead the opener list, then the deadlifts for a hinge-led second day
    const openerIds = squat!.candidates.map((c) => c.id);
    expect(openerIds.indexOf('back_squat')).toBeLessThan(
      openerIds.indexOf('conventional_deadlift'),
    );
    expect(openerIds).toContain('conventional_deadlift');
    expect(hinge!.candidates.map((c) => c.id)).toContain(
      'barbell_romanian_deadlift',
    );
    expect(iso!.candidates.every((c) => c.type === 'Isolation')).toBe(true);
    expect(calvesCore!.candidates.length).toBeGreaterThan(0);
    // one meaning per id: no row appears in two slots
    const all = list.slots.flatMap((s) => s.candidates.map((c) => c.id));
    expect(new Set(all).size).toBe(all.length);
  });

  it('at home the goblet squat is a legitimate opener', () => {
    const list = buildFocusShortlist({
      focusLabel: 'Lower',
      pool: pool('lower', HOME),
      gymLike: false,
      difficulty: 'intermediate',
    })!;
    expect(list.slots[0]!.candidates.map((c) => c.id)).toContain(
      'goblet_squat',
    );
  });

  it('Upper: bench leads, pulls fill slot 2, the priority muscle goes first in the accessory slot', () => {
    const list = buildFocusShortlist({
      focusLabel: 'Upper',
      pool: pool('upper', GYM),
      gymLike: true,
      difficulty: 'intermediate',
      priorityMuscle: 'Shoulders',
    })!;
    expect(list.slots[0]!.candidates[0]!.id).toBe('flat_barbell_bench_press');
    expect(
      list.slots[1]!.candidates.every((c) => c.primaryMuscleGroup === 'Back'),
    ).toBe(true);
    const accessory = list.slots[3]!.candidates;
    expect(accessory[0]!.primaryMuscleGroup).toBe('Shoulders');
  });

  it('renders numbered slots with id = Name pairs', () => {
    const list = buildFocusShortlist({
      focusLabel: 'Push',
      pool: pool('push', GYM),
      gymLike: true,
      difficulty: 'advanced',
    })!;
    const text = renderFocusShortlist(list, (n) => n);
    expect(text).toMatch(/^Push day, one id per slot/);
    expect(text).toContain('1. Horizontal push');
    expect(text).toContain(
      'flat_barbell_bench_press = Flat Barbell Bench Press',
    );
    expect(text).toContain('(optional)');
  });
});
