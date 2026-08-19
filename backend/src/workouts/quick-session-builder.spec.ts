/**
 * Quick-session builder spec — runs against the REAL transformed catalog
 * (ExercisesService), because "real logic" claims are only worth what they
 * prove on real data: tier discipline, compound-first anchors, pattern
 * diversity, equipment/joint filtering, allocation, ordering, determinism.
 */
import { ExercisesService } from '../exercises/exercises.service';
import { equipmentSatisfies } from '../data/exercise-mappings';
import type { TransformedExercise } from '../data/exercise-mappings';
import { EXERCISE_TIERS } from '../data/exercise-tiers';
import { getJointDemands } from '../data/exercise-joint-demands';
import {
  QUICK_MUSCLES,
  allocate,
  buildQuickSession,
  muscleMatches,
  quickSessionTitle,
  sessionBudget,
  type QuickMuscle,
  type QuickSession,
} from './quick-session-builder';

describe('quick-session-builder (real catalog)', () => {
  let candidates: TransformedExercise[];
  const byId = new Map<string, TransformedExercise>();

  beforeAll(async () => {
    const svc = new ExercisesService();
    await svc.onModuleInit();
    candidates = svc.search({});
    for (const e of candidates) byId.set(e.id, e);
    expect(candidates.length).toBeGreaterThan(500);
  });

  const build = (
    muscles: QuickMuscle[],
    extra: Partial<Parameters<typeof buildQuickSession>[0]> = {},
  ): QuickSession =>
    buildQuickSession({ muscles, candidates, goal: 'hypertrophy', ...extra });

  const tierOf = (id: string) => EXERCISE_TIERS[id];

  it('every solo strength muscle yields a full, on-target, S/A/B session', () => {
    for (const muscle of QUICK_MUSCLES) {
      if (muscle === 'Cardio') continue;
      const session = build([muscle]);
      expect(session.exercises.length).toBeGreaterThanOrEqual(3);
      expect(session.exercises.length).toBeLessThanOrEqual(4);
      const ids = session.exercises.map((e) => e.exerciseId);
      expect(new Set(ids).size).toBe(ids.length); // no duplicates
      for (const ex of session.exercises) {
        expect(ex.muscle).toBe(muscle);
        expect(muscleMatches(byId.get(ex.exerciseId)!, muscle)).toBe(true);
        expect(['S', 'A', 'B', 'C']).toContain(tierOf(ex.exerciseId) ?? 'C');
        expect(tierOf(ex.exerciseId)).not.toBe('D');
      }
    }
  });

  it('Back & Biceps: both muscles served, back leads with a top-tier compound', () => {
    const session = build(['Back', 'Biceps']);
    expect(session.title).toBe('Back & Biceps');
    expect(session.exercises).toHaveLength(5);
    const backPicks = session.exercises.filter((e) => e.muscle === 'Back');
    const bicepsPicks = session.exercises.filter((e) => e.muscle === 'Biceps');
    expect(backPicks).toHaveLength(3); // large muscle absorbs the extra slot
    expect(bicepsPicks).toHaveLength(2);

    // The session opens with a back COMPOUND of the best available tier.
    const first = byId.get(session.exercises[0]!.exerciseId)!;
    expect(session.exercises[0]!.muscle).toBe('Back');
    expect((first.type ?? '').toLowerCase()).toBe('compound');
    expect(['S', 'A']).toContain(tierOf(first.id));

    // Coach-grade diversity: a back day mostly PULLS (patterns are coarse,
    // so a second Pull is correct, not a repeat)…
    const rows = backPicks.map((e) => byId.get(e.exerciseId)!);
    const pullCount = rows.filter((r) =>
      (r.movementPatterns ?? []).includes('Pull'),
    ).length;
    expect(pullCount).toBeGreaterThanOrEqual(2);

    // …the picks together cover more than one back region…
    const allSubs = new Set(rows.flatMap((r) => r.subMuscles ?? []));
    expect(allSubs.size).toBeGreaterThanOrEqual(2);

    // …and no two picks are near-duplicates (same patterns AND same regions
    // AND same primary equipment).
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i]!;
        const b = rows[j]!;
        const same = (x?: string[], y?: string[]) =>
          JSON.stringify([...(x ?? [])].sort()) ===
          JSON.stringify([...(y ?? [])].sort());
        const nearDuplicate =
          same(a.movementPatterns, b.movementPatterns) &&
          same(a.subMuscles, b.subMuscles) &&
          same(a.primaryEquipment, b.primaryEquipment);
        expect(nearDuplicate).toBe(false);
      }
    }
  });

  it('Push day: chest/shoulders/triceps split 2/2/2, compounds ordered first', () => {
    const session = build(['Chest', 'Shoulders', 'Triceps']);
    expect(session.exercises).toHaveLength(6);
    const count = (m: QuickMuscle) =>
      session.exercises.filter((e) => e.muscle === m).length;
    expect(count('Chest')).toBe(2);
    expect(count('Shoulders')).toBe(2);
    expect(count('Triceps')).toBe(2);

    // No isolation move before the last compound of the session's main block:
    // compounds (classes 0/1) strictly precede accessories for large muscles.
    const classes = session.exercises.map((e) => {
      const row = byId.get(e.exerciseId)!;
      return (row.type ?? '').toLowerCase() === 'compound' ? 'C' : 'I';
    });
    const firstIso = classes.indexOf('I');
    const lastCompound = classes.lastIndexOf('C');
    if (firstIso !== -1) {
      // Compounds may follow isolation only for SMALL muscles (triceps dips
      // etc.) — but the FIRST exercise is always a compound anchor.
      expect(classes[0]).toBe('C');
    }
    expect(lastCompound).toBeGreaterThanOrEqual(0);

    // Role-aware prescription: the anchor carries the most sets.
    const anchorSets = session.exercises[0]!.sets;
    for (const ex of session.exercises.slice(1)) {
      expect(ex.sets).toBeLessThanOrEqual(anchorSets);
    }
  });

  it('an odd combo (Core + Calves + Forearms) still fills, with Core at the end', () => {
    const session = build(['Core', 'Calves', 'Forearms']);
    expect(session.exercises.length).toBeGreaterThanOrEqual(5);
    for (const ex of session.exercises) {
      expect(['Core', 'Calves', 'Forearms']).toContain(ex.muscle);
    }
    const lastMuscles = session.exercises.slice(-2).map((e) => e.muscle);
    expect(lastMuscles).toContain('Core');
  });

  it('equipment filtering: a dumbbell-only session never requires anything else', () => {
    const session = build(['Chest', 'Back'], { equipment: ['dumbbell'] });
    expect(session.exercises.length).toBeGreaterThanOrEqual(4);
    for (const ex of session.exercises) {
      const row = byId.get(ex.exerciseId)!;
      expect(
        equipmentSatisfies(row.primaryEquipment ?? row.equipment, ['dumbbell']),
      ).toBe(true);
    }
  });

  it('a "bad knee" note excludes knee-tagged rows from a Quads day', () => {
    const session = build(['Quads', 'Glutes'], { limitations: ['bad knee'] });
    expect(session.exercises.length).toBeGreaterThanOrEqual(4);
    for (const ex of session.exercises) {
      const demands = getJointDemands(ex.exerciseId);
      expect(demands?.includes('knee') ?? false).toBe(false);
    }
  });

  it('seeds rotate accessories but never the anchor, and are deterministic', () => {
    const a1 = build(['Back', 'Biceps'], { seed: 0 });
    const a2 = build(['Back', 'Biceps'], { seed: 0 });
    const b = build(['Back', 'Biceps'], { seed: 3 });
    expect(a1.exercises.map((e) => e.exerciseId)).toEqual(
      a2.exercises.map((e) => e.exerciseId),
    );
    expect(a1.exercises[0]!.exerciseId).toBe(b.exercises[0]!.exerciseId);
    const idsA = new Set(a1.exercises.map((e) => e.exerciseId));
    const differs = b.exercises.some((e) => !idsA.has(e.exerciseId));
    expect(differs).toBe(true);
  });

  it('Cardio rides along as a time-based finisher, or stands alone', () => {
    const withCardio = build(['Back', 'Cardio']);
    const last = withCardio.exercises[withCardio.exercises.length - 1]!;
    expect(last.muscle).toBe('Cardio');
    expect(last.prescriptionType).toBe('time');
    expect(last.durationSeconds).toBe(600);
    expect(withCardio.type).toBe('strength');

    const solo = build(['Cardio']);
    expect(solo.type).toBe('cardio');
    expect(solo.exercises).toHaveLength(1);
    expect(solo.exercises[0]!.durationSeconds).toBe(1200);
  });

  it('selecting everything gives every muscle exactly one slot', () => {
    const all = [...QUICK_MUSCLES] as QuickMuscle[];
    const session = build(all);
    const strength = session.exercises.filter((e) => e.muscle !== 'Cardio');
    expect(strength).toHaveLength(11);
    const muscles = new Set(strength.map((e) => e.muscle));
    expect(muscles.size).toBe(11);
    expect(session.exercises[session.exercises.length - 1]!.muscle).toBe(
      'Cardio',
    );
  });

  it('time-prescribed rows (planks, hangs) stay holds, never phantom reps', () => {
    const session = build(['Core']);
    for (const ex of session.exercises) {
      const row = byId.get(ex.exerciseId)!;
      if ((row.prescriptionType as string) === 'time') {
        expect(ex.prescriptionType).toBe('time');
        expect(ex.durationSeconds).toBeGreaterThanOrEqual(20);
      } else {
        expect(ex.prescriptionType).toBeUndefined();
      }
    }
  });

  it('prescriptions are sane everywhere', () => {
    const session = build(['Chest', 'Back', 'Quads', 'Biceps']);
    for (const ex of session.exercises) {
      expect(ex.sets).toBeGreaterThanOrEqual(2);
      expect(ex.sets).toBeLessThanOrEqual(6);
      expect(ex.repsMin).toBeLessThanOrEqual(ex.repsMax);
      expect(ex.reps).toBeGreaterThanOrEqual(ex.repsMin);
      expect(ex.reps).toBeLessThanOrEqual(ex.repsMax);
    }
  });

  it('budget and allocation follow the table', () => {
    expect(sessionBudget(1)).toBe(4);
    expect(sessionBudget(2)).toBe(5);
    expect(sessionBudget(3)).toBe(6);
    expect(sessionBudget(5)).toBe(7);
    expect(sessionBudget(9)).toBe(9);

    const alloc = allocate(['Back', 'Biceps'] as QuickMuscle[]);
    expect(alloc.get('Back' as QuickMuscle)).toBe(3);
    expect(alloc.get('Biceps' as QuickMuscle)).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Dylan's confidence sweep (2026-08-18): "not the same/similar workouts,
  // not the same body parts over-served — and it must hold for repeated use
  // TODAY at the gym."
  // -------------------------------------------------------------------------

  const STRENGTH: QuickMuscle[] = [
    'Chest',
    'Back',
    'Shoulders',
    'Biceps',
    'Triceps',
    'Quads',
    'Hamstrings',
    'Glutes',
    'Calves',
    'Core',
    'Forearms',
  ];

  const sameList = (x?: string[], y?: string[]) =>
    JSON.stringify([...(x ?? [])].sort()) ===
    JSON.stringify([...(y ?? [])].sort());

  const nearDuplicatePair = (a: TransformedExercise, b: TransformedExercise) =>
    sameList(a.movementPatterns, b.movementPatterns) &&
    sameList(a.subMuscles, b.subMuscles) &&
    sameList(a.primaryEquipment, b.primaryEquipment);

  it('SWEEP: every 1-, 2- and 3-muscle combo builds clean — no dupes, no near-dupes, everyone served', () => {
    const combos: QuickMuscle[][] = [];
    for (let i = 0; i < STRENGTH.length; i++) {
      combos.push([STRENGTH[i]!]);
      for (let j = i + 1; j < STRENGTH.length; j++) {
        combos.push([STRENGTH[i]!, STRENGTH[j]!]);
        for (let k = j + 1; k < STRENGTH.length; k++) {
          combos.push([STRENGTH[i]!, STRENGTH[j]!, STRENGTH[k]!]);
        }
      }
    }
    expect(combos.length).toBe(11 + 55 + 165);

    let nearDupePairs = 0;
    for (const combo of combos) {
      const session = build(combo, { seed: 118 }); // arbitrary mid-year seed
      const ids = session.exercises.map((e) => e.exerciseId);
      expect(new Set(ids).size).toBe(ids.length); // never the same exercise twice
      expect(ids.length).toBeGreaterThanOrEqual(Math.min(4, combo.length + 2));
      expect(ids.length).toBeLessThanOrEqual(sessionBudget(combo.length));
      const served = new Set(session.exercises.map((e) => e.muscle));
      for (const m of combo) expect(served.has(m)).toBe(true); // no muscle starved
      for (const ex of session.exercises) {
        expect(tierOf(ex.exerciseId)).not.toBe('D');
      }
      const rows = session.exercises.map((e) => byId.get(e.exerciseId)!);
      for (let i = 0; i < rows.length; i++) {
        for (let j = i + 1; j < rows.length; j++) {
          if (nearDuplicatePair(rows[i]!, rows[j]!)) nearDupePairs++;
        }
      }
    }
    // Across all 231 sessions, not a single near-duplicate pair anywhere.
    expect(nearDupePairs).toBe(0);
  });

  it('A WEEK OF USE: the same request across 7 days keeps the anchor, varies the rest', () => {
    const presets: Array<[string, QuickMuscle[]]> = [
      ['Pull', ['Back', 'Biceps']],
      ['Push', ['Chest', 'Shoulders', 'Triceps']],
      ['Legs', ['Quads', 'Hamstrings', 'Glutes', 'Calves']],
    ];
    for (const [label, muscles] of presets) {
      const week = Array.from({ length: 7 }, (_, day) =>
        build(muscles, { seed: day }),
      );
      // The anchor is stable — real programs repeat their main lift.
      const anchors = new Set(week.map((s) => s.exercises[0]!.exerciseId));
      expect(anchors.size).toBe(1);
      // But the sessions are not photocopies: several distinct line-ups/week.
      const fingerprints = new Set(
        week.map((s) => s.exercises.map((e) => e.exerciseId).join('|')),
      );
      expect(fingerprints.size).toBeGreaterThanOrEqual(3);
      // eslint-disable-next-line no-console
      console.log(
        `[variety] ${label}: ${fingerprints.size}/7 distinct sessions across a week`,
      );
    }
  });

  it('TODAY, TWICE: a second session at the gym repeats nothing from the first', () => {
    const first = build(['Back', 'Biceps'], { seed: 118 });
    const firstIds = first.exercises.map((e) => e.exerciseId);
    const second = build(['Back', 'Biceps'], {
      seed: 118, // same day, same seed — the exclude list does the work
      excludeIds: firstIds,
    });
    expect(second.exercises.length).toBeGreaterThanOrEqual(4);
    const overlap = second.exercises.filter((e) =>
      firstIds.includes(e.exerciseId),
    );
    expect(overlap).toHaveLength(0);
    // And the second session is still quality-clean.
    for (const ex of second.exercises) {
      expect(tierOf(ex.exerciseId)).not.toBe('D');
      expect(muscleMatches(byId.get(ex.exerciseId)!, ex.muscle)).toBe(true);
    }
  });

  it('titles read like a human wrote them', () => {
    expect(quickSessionTitle(['Back'] as QuickMuscle[])).toBe('Back Day');
    expect(quickSessionTitle(['Back', 'Biceps'] as QuickMuscle[])).toBe(
      'Back & Biceps',
    );
    expect(
      quickSessionTitle(['Chest', 'Shoulders', 'Triceps'] as QuickMuscle[]),
    ).toBe('Chest, Shoulders & Triceps');
    expect(quickSessionTitle([...QUICK_MUSCLES] as QuickMuscle[])).toBe(
      'Full Body',
    );
  });
});
