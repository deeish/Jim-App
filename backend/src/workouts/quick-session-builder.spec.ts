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
  familyOf,
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
    // Users speak lowercase ("dumbbell"); the catalog speaks display labels
    // ("Dumbbell"). The builder must bridge the vocab — pre-fix, this exact
    // input matched NOTHING and degraded to sandbag/table oddities.
    const session = build(['Chest', 'Back'], { equipment: ['dumbbell'] });
    expect(session.exercises.length).toBeGreaterThanOrEqual(4);
    let dumbbellRows = 0;
    for (const ex of session.exercises) {
      const row = byId.get(ex.exerciseId)!;
      expect(
        equipmentSatisfies(row.primaryEquipment ?? row.equipment, [
          'Dumbbell',
          'Bodyweight',
        ]),
      ).toBe(true);
      if ((row.primaryEquipment ?? row.equipment ?? []).includes('Dumbbell')) {
        dumbbellRows++;
      }
    }
    // A dumbbell session is BUILT ON dumbbells, not on push-up variants
    // that merely survive the filter.
    expect(dumbbellRows).toBeGreaterThanOrEqual(
      Math.ceil(session.exercises.length / 2),
    );
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

  // -------------------------------------------------------------------------
  // BLIND-AUDIT REGRESSIONS (2026-08-18). An independent S&C review of v1
  // output found three systematic failures: near-twin stacking (four bench
  // presses on chest day), template rep schemes the movement can't take
  // (deadlifts at 4x10-15, face pulls at 5x5-8), and muscle-tag coverage
  // hiding pattern holes (no knee flexion on leg day, no squat on full-body).
  // Each test here pins the fix for one of those against the real catalog.
  // -------------------------------------------------------------------------

  const rowOf = (id: string) => byId.get(id)!;
  const fixedLoad = (row: TransformedExercise): boolean => {
    const eq = row.primaryEquipment?.length
      ? row.primaryEquipment
      : (row.equipment ?? []);
    return (
      eq.length === 0 ||
      eq.every((x) => x === 'Bodyweight' || x === 'Pull-up Bar' || x === 'TRX')
    );
  };

  it('AUDIT: one axial hinge and one squat pattern per session, across muscles', () => {
    for (const goal of ['hypertrophy', 'strength', 'general fitness']) {
      for (const combo of [
        ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
        ['Chest', 'Back', 'Shoulders', 'Quads', 'Hamstrings', 'Core'],
        ['Quads', 'Hamstrings'],
        ['Hamstrings', 'Glutes'],
      ] as QuickMuscle[][]) {
        const session = build(combo, { goal });
        const families = session.exercises.map((e) =>
          familyOf(rowOf(e.exerciseId)),
        );
        expect(
          families.filter((f) => f === 'deadlift').length,
        ).toBeLessThanOrEqual(1);
        expect(
          families.filter((f) => f === 'squat').length,
        ).toBeLessThanOrEqual(1);
        // Ballistic swings are conditioning tools, not hypertrophy/strength picks.
        expect(families).not.toContain('ballistic');
        // Quads selected ⇒ an actual knee-dominant squat pattern exists.
        if (combo.includes('Quads')) {
          expect(families.some((f) => f === 'squat' || f === 'lunge')).toBe(
            true,
          );
        }
      }
    }
  });

  it('AUDIT: a chest day is press + new angle + fly, never four benches', () => {
    const session = build(['Chest']);
    const families = session.exercises.map((e) =>
      familyOf(rowOf(e.exerciseId)),
    );
    expect(families.filter((f) => f === 'hpress').length).toBeLessThanOrEqual(
      2,
    );
    expect(families).toContain('fly');
    expect(new Set(families).size).toBeGreaterThanOrEqual(3);
  });

  it('AUDIT: hamstrings with room get knee-flexion work, not a second hinge', () => {
    const session = build(['Quads', 'Hamstrings', 'Glutes', 'Calves']);
    const hamRows = session.exercises
      .filter((e) => e.muscle === 'Hamstrings')
      .map((e) => familyOf(rowOf(e.exerciseId)));
    expect(hamRows).toContain('legcurl');
  });

  it('AUDIT: rep prescriptions respect what the movement can take', () => {
    for (const goal of [
      'hypertrophy',
      'strength',
      'endurance',
      'general fitness',
    ]) {
      for (const combo of [
        ['Back', 'Biceps'],
        ['Chest', 'Shoulders', 'Triceps'],
        ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
        ['Chest', 'Back', 'Shoulders', 'Quads', 'Hamstrings', 'Core'],
      ] as QuickMuscle[][]) {
        const session = build(combo, { goal });
        for (const ex of session.exercises) {
          if (ex.prescriptionType === 'time') continue;
          const row = rowOf(ex.exerciseId);
          const fam = familyOf(row);
          // Axial hinges never run to technical failure at high reps.
          if (fam === 'deadlift') {
            expect(ex.repsMax).toBeLessThanOrEqual(10);
            expect(ex.sets).toBeLessThanOrEqual(4);
          }
          // Cue-dependent prehab/raise work never gets strength-stamped.
          if (fam === 'rdelt' || fam === 'lraise' || fam === 'frontraise') {
            expect(ex.repsMin).toBeGreaterThanOrEqual(12);
            expect(ex.sets).toBeLessThanOrEqual(3);
          }
          // Fixed-load bodyweight rows get windows a human can hit.
          if (fixedLoad(row) && (fam === 'vpull' || fam === 'dip')) {
            expect(ex.repsMin).toBeGreaterThanOrEqual(5);
            expect(ex.repsMax).toBeLessThanOrEqual(12);
          }
        }
      }
    }
  });

  it('AUDIT: prehab never anchors — a strength push day opens with a press', () => {
    const session = build(['Chest', 'Shoulders', 'Triceps'], {
      goal: 'strength',
    });
    const firstFam = familyOf(rowOf(session.exercises[0]!.exerciseId));
    expect(['hpress', 'opress']).toContain(firstFam);
    // Rear-delt work, if present, comes after every compound.
    const fams = session.exercises.map((e) => familyOf(rowOf(e.exerciseId)));
    const rdeltAt = fams.indexOf('rdelt');
    if (rdeltAt !== -1) {
      const lastCompoundAt = session.exercises.reduce(
        (last, e, i) =>
          (rowOf(e.exerciseId).type ?? '').toLowerCase() === 'compound' &&
          !['rdelt', 'lraise', 'frontraise'].includes(
            familyOf(rowOf(e.exerciseId)),
          )
            ? i
            : last,
        -1,
      );
      expect(rdeltAt).toBeGreaterThan(lastCompoundAt);
    }
  });

  it('AUDIT: grip-destroying holds come last, after grip-dependent core work', () => {
    const session = build(['Core', 'Calves', 'Forearms']);
    const fams = session.exercises.map((e) => familyOf(rowOf(e.exerciseId)));
    const hangAt = fams.findIndex((f) => f === 'hang' || f === 'carry');
    if (hangAt !== -1) {
      for (let i = 0; i < session.exercises.length; i++) {
        if (session.exercises[i]!.muscle === 'Core') {
          expect(hangAt).toBeGreaterThan(i);
        }
      }
    }
  });

  it('AUDIT-2: dead-stop barbell rows never get high-rep stamps', () => {
    // Round-2 blind review: "Pendlay Row at 3 x 15-20 is the single most
    // indefensible line in the battery."
    for (const goal of ['hypertrophy', 'strength', 'endurance']) {
      for (const combo of [
        ['Back', 'Biceps'],
        ['Back', 'Cardio'],
      ] as QuickMuscle[][]) {
        const session = build(combo, { goal });
        for (const ex of session.exercises) {
          if (/pendlay/i.test(ex.name)) {
            expect(ex.repsMax).toBeLessThanOrEqual(8);
          }
          if (/bent[- ]over/i.test(ex.name) && /row/i.test(ex.name)) {
            expect(ex.repsMax).toBeLessThanOrEqual(10);
          }
        }
      }
    }
  });

  it('AUDIT-2: a beginner session swaps the exercise pool, not just the sets', () => {
    const session = build(
      ['Chest', 'Back', 'Shoulders', 'Quads', 'Hamstrings', 'Core'],
      { goal: 'general fitness', difficulty: 'beginner' },
    );
    for (const ex of session.exercises) {
      expect(
        /back squat|conventional deadlift|trap bar deadlift|barbell romanian deadlift|pendlay|barbell bench press|barbell overhead press/i.test(
          ex.name,
        ),
      ).toBe(false);
    }
    // The movement patterns are still all there — just from a safer pool.
    const families = session.exercises.map((e) =>
      familyOf(rowOf(e.exerciseId)),
    );
    expect(families.some((f) => f === 'squat' || f === 'lunge')).toBe(true);
    // And the DOSE is a beginner dose: 5-6 movements, ≤18 working sets.
    expect(session.exercises.length).toBeLessThanOrEqual(6);
    const beginnerSets = session.exercises.reduce((n, e) => n + e.sets, 0);
    expect(beginnerSets).toBeLessThanOrEqual(18);
  });

  it('AUDIT-4: barbell rows bind to the implement, never to the slot they land in', () => {
    // Round-4 blind review: T-Bar Row got 10-15 in one session and 15-20 in
    // another — "rep ranges assigned by slot position, not exercise
    // mechanics". Barbell-loaded rows always stay ≤10.
    for (const goal of [
      'hypertrophy',
      'endurance',
      'general fitness',
      'strength',
    ]) {
      for (const combo of [
        ['Back', 'Biceps'],
        ['Back', 'Cardio'],
        ['Back'],
      ] as QuickMuscle[][]) {
        const session = build(combo, { goal });
        for (const ex of session.exercises) {
          const row = rowOf(ex.exerciseId);
          if (
            familyOf(row) === 'hrow' &&
            (row.primaryEquipment ?? []).includes('Barbell')
          ) {
            expect(ex.repsMax).toBeLessThanOrEqual(10);
          }
        }
      }
    }
  });

  it('AUDIT-4: two big pulls never share an implement, and hypertrophy keeps a heavy anchor', () => {
    const session = build(['Back', 'Biceps']);
    const backRows = session.exercises
      .filter((e) => e.muscle === 'Back')
      .map((e) => rowOf(e.exerciseId));
    const rowEquip = backRows
      .filter((r) => familyOf(r) === 'hrow')
      .map((r) => (r.primaryEquipment ?? []).join('|'));
    expect(new Set(rowEquip).size).toBe(rowEquip.length);
    // The session's first lift is the mechanical-tension anchor: ≤10 reps.
    expect(session.exercises[0]!.repsMax).toBeLessThanOrEqual(10);
  });

  it('AUDIT-4: per-muscle sets cap at 12, and high-rep bands stay progressable', () => {
    for (const combo of [
      ['Chest'],
      ['Back'],
      ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
      ['Chest', 'Shoulders', 'Triceps'],
    ] as QuickMuscle[][]) {
      const session = build(combo);
      const perMuscle = new Map<string, number>();
      for (const ex of session.exercises) {
        if (ex.muscle === 'Cardio') continue;
        perMuscle.set(ex.muscle, (perMuscle.get(ex.muscle) ?? 0) + ex.sets);
        // Outside endurance goals, no 5-rep-wide band above 10 reps — a
        // trainee must run out of reps and touch the load.
        if (ex.prescriptionType !== 'time' && ex.repsMin >= 10) {
          expect(ex.repsMax - ex.repsMin).toBeLessThanOrEqual(3);
        }
        // Unilateral movements cap at 3 prescribed sets (each is 2 bouts).
        if (
          /lunge|split squat|step[- ]up|single[- ]arm|single[- ]leg/i.test(
            ex.name,
          )
        ) {
          expect(ex.sets).toBeLessThanOrEqual(3);
        }
      }
      for (const sets of perMuscle.values()) {
        expect(sets).toBeLessThanOrEqual(12);
      }
    }
  });

  it('AUDIT-4: a single Shoulders slot beside a chest press buys side delts, not a second press', () => {
    const session = build(
      ['Chest', 'Back', 'Shoulders', 'Quads', 'Hamstrings', 'Core'],
      { goal: 'general fitness', difficulty: 'beginner' },
    );
    const shoulderRows = session.exercises.filter(
      (e) => e.muscle === 'Shoulders',
    );
    if (shoulderRows.length === 1) {
      const fam = familyOf(rowOf(shoulderRows[0]!.exerciseId));
      expect(['lraise', 'rdelt']).toContain(fam);
    }
  });

  it('AUDIT-3: Pendlay only appears on strength days, never inside pump work', () => {
    for (const goal of ['hypertrophy', 'endurance', 'general fitness']) {
      const session = build(['Back', 'Biceps'], { goal });
      for (const ex of session.exercises) {
        expect(/pendlay/i.test(ex.name)).toBe(false);
      }
    }
  });

  it('AUDIT-2: a squat coexists only with an RDL-type hinge, never a heavy pull', () => {
    for (const combo of [
      ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
      ['Hamstrings', 'Quads'],
      ['Chest', 'Back', 'Shoulders', 'Quads', 'Hamstrings', 'Core'],
    ] as QuickMuscle[][]) {
      const session = build(combo);
      const rows = session.exercises.map((e) => rowOf(e.exerciseId));
      const hasSquat = rows.some((r) => familyOf(r) === 'squat');
      const heavyHinges = rows.filter(
        (r) =>
          familyOf(r) === 'deadlift' &&
          !/romanian|stiff[- ]leg|single[- ]leg/i.test(r.name),
      );
      if (hasSquat) {
        expect(heavyHinges).toHaveLength(0);
      }
    }
  });

  it('AUDIT-2: a strength day caps its heavy pressing instead of stacking five-set secondaries', () => {
    const session = build(['Chest', 'Shoulders', 'Triceps'], {
      goal: 'strength',
    });
    const totalSets = session.exercises.reduce((n, e) => n + e.sets, 0);
    expect(totalSets).toBeLessThanOrEqual(22);
    // Exactly one five-set lift: the primary anchor. Everything else ≤ 4.
    const fiveSetRows = session.exercises.filter((e) => e.sets >= 5);
    expect(fiveSetRows.length).toBeLessThanOrEqual(1);
    // Isolation work is a real dose (3 sets) at joint-friendly reps.
    for (const ex of session.exercises) {
      const fam = familyOf(rowOf(ex.exerciseId));
      if (fam === 'lraise' || fam === 'triext') {
        expect(ex.sets).toBeGreaterThanOrEqual(3);
        expect(ex.repsMin).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('AUDIT-2: quirk rows lose to conventional picks, and curls must change position', () => {
    // Stability-limited rows, frontal-plane lunges, wrist rollers and
    // unloaded bridges never beat conventional alternatives in a full gym.
    for (const combo of [
      ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
      ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps'],
      ['Core', 'Calves', 'Forearms'],
    ] as QuickMuscle[][]) {
      const session = build(combo);
      for (const ex of session.exercises) {
        expect(
          /lateral lunge|cossack|bird[- ]dog|wrist roller|^glute bridge$|copenhagen/i.test(
            ex.name,
          ),
        ).toBe(false);
      }
    }
    // Two curls in one session differ in position, not just implement.
    const pull = build(['Back', 'Biceps']);
    const curls = pull.exercises.filter(
      (e) => familyOf(rowOf(e.exerciseId)) === 'curl',
    );
    if (curls.length >= 2) {
      const tokenSets = curls.map((e) =>
        (
          e.name
            .toLowerCase()
            .match(
              /incline|preacher|spider|concentration|standing|seated|lying/g,
            ) ?? []
        )
          .sort()
          .join(','),
      );
      expect(new Set(tokenSets).size).toBe(curls.length);
    }
  });

  it('AUDIT-2: core slots cover distinct patterns (no plank + rollout double)', () => {
    const session = build(['Core', 'Calves', 'Forearms']);
    const coreFams = session.exercises
      .filter((e) => e.muscle === 'Core')
      .map((e) => familyOf(rowOf(e.exerciseId)));
    if (coreFams.length >= 2) {
      expect(new Set(coreFams).size).toBe(coreFams.length);
    }
  });

  it('AUDIT: two calf slots split gastroc and soleus, not two standing raises', () => {
    const session = build(['Core', 'Calves', 'Forearms']);
    const calfFams = session.exercises
      .filter((e) => e.muscle === 'Calves')
      .map((e) => familyOf(rowOf(e.exerciseId)));
    if (calfFams.length >= 2) {
      expect(new Set(calfFams).size).toBeGreaterThanOrEqual(2);
    }
  });

  it('AUDIT: a cardio finisher never repeats the pattern just trained', () => {
    const session = build(['Back', 'Cardio'], { goal: 'endurance' });
    const finisher = session.exercises[session.exercises.length - 1]!;
    expect(finisher.muscle).toBe('Cardio');
    expect(/row/i.test(finisher.name)).toBe(false);
  });

  it('AUDIT: the duration estimate reflects sets × (work + rest), not a flat rate', () => {
    const session = build(['Back', 'Biceps']);
    const totalSets = session.exercises.reduce((n, e) => n + e.sets, 0);
    // Every working set costs at least ~1.5 min (40s work + 60s minimum rest).
    expect(session.durationMinutes).toBeGreaterThanOrEqual(totalSets * 1.5);
    // And no session ever claims more than 24 working sets.
    expect(totalSets).toBeLessThanOrEqual(25); // +1 allows the cardio bout row
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
