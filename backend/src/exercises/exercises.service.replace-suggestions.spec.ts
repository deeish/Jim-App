import { ExercisesService } from './exercises.service';
import type { TransformedExercise } from '../data/exercise-mappings';
import { getExerciseProgressions } from '../data/exercise-progressions';

/** Minimal catalog row for tests; only the fields the suggestions path reads. */
function ex(
  partial: Partial<TransformedExercise> & {
    id: string;
    name: string;
    primaryMuscleGroup: string;
  },
): TransformedExercise {
  return {
    aliases: [],
    subMuscles: [],
    secondaryMuscleGroups: [],
    equipment: ['Barbell'],
    movementPatterns: ['Push'],
    prescriptionType: 'reps',
    ...partial,
  } as unknown as TransformedExercise;
}

/** Build a service with an injected in-memory catalog (skips file loading). */
function withCatalog(list: TransformedExercise[]): ExercisesService {
  const service = new ExercisesService();
  (service as unknown as { exercises: TransformedExercise[] }).exercises = list;
  return service;
}

describe('ExercisesService.pickReplacementSuggestions', () => {
  const chestCatalog = () => [
    ex({
      id: 'flatbb',
      name: 'Flat Barbell Bench Press',
      primaryMuscleGroup: 'Chest',
      subMuscles: ['Mid Chest'],
    }),
    ex({
      id: 'flatdb',
      name: 'Flat Dumbbell Bench Press',
      primaryMuscleGroup: 'Chest',
      subMuscles: ['Mid Chest'],
      equipment: ['Dumbbell'],
    }),
    ex({
      id: 'fly',
      name: 'Cable Fly',
      primaryMuscleGroup: 'Chest',
      subMuscles: ['Mid Chest'],
      equipment: ['Cable'],
    }),
    ex({
      id: 'declinebb',
      name: 'Decline Barbell Bench Press',
      primaryMuscleGroup: 'Chest',
      subMuscles: ['Lower Chest'],
    }),
    ex({
      id: 'row',
      name: 'Barbell Bent Over Row',
      primaryMuscleGroup: 'Back',
      movementPatterns: ['Pull'],
    }),
  ];

  it('suggests only the same primary muscle and never the target itself', () => {
    const service = withCatalog(chestCatalog());
    const out = service.pickReplacementSuggestions({
      targetName: 'Flat Barbell Bench Press',
      targetExerciseId: 'flatbb',
      dayExerciseIds: ['flatbb', 'row'],
      count: 10,
    });
    expect(out.length).toBeGreaterThan(0);
    for (const s of out) {
      expect(s.exercise.primaryMuscleGroup).toBe('Chest');
      expect(s.exercise.id).not.toBe('flatbb');
    }
  });

  it("ranks the target's own equipment variant on top with the same-lift reason", () => {
    const service = withCatalog(chestCatalog());
    const out = service.pickReplacementSuggestions({
      targetName: 'Flat Barbell Bench Press',
      targetExerciseId: 'flatbb',
      dayExerciseIds: ['flatbb', 'row'],
    });
    expect(out[0].exercise.id).toBe('flatdb');
    expect(out[0].reasons).toContain('Same lift, different equipment');
  });

  it('never suggests anything already in the day, nor variants of OTHER day exercises', () => {
    const service = withCatalog([
      ...chestCatalog(),
      ex({
        id: 'inclinedb',
        name: 'Incline Dumbbell Bench Press',
        primaryMuscleGroup: 'Chest',
        subMuscles: ['Upper Chest'],
        equipment: ['Dumbbell'],
      }),
      ex({
        id: 'inclinebb',
        name: 'Incline Barbell Bench Press',
        primaryMuscleGroup: 'Chest',
        subMuscles: ['Upper Chest'],
      }),
    ]);
    // Day = target + incline DB bench. The incline BARBELL bench is a variant
    // of a day exercise that is NOT the target — excluded; the target's own
    // flat-DB variant stays eligible.
    const out = service.pickReplacementSuggestions({
      targetName: 'Flat Barbell Bench Press',
      targetExerciseId: 'flatbb',
      dayExerciseIds: ['flatbb', 'inclinedb'],
      count: 10,
    });
    const ids = out.map((s) => s.exercise.id);
    expect(ids).not.toContain('inclinedb'); // already in the day
    expect(ids).not.toContain('inclinebb'); // family of another day exercise
    expect(ids).toContain('flatdb'); // target's own family stays eligible
  });

  it('boosts progression-ladder neighbors with Easier/Harder reasons (real ladder ids)', () => {
    const progressions = getExerciseProgressions('knee_push_up');
    expect(progressions?.easier).toContain('wall_push_up'); // data premise
    const service = withCatalog([
      ex({
        id: 'knee_push_up',
        name: 'Knee Push-Up',
        primaryMuscleGroup: 'Chest',
        equipment: ['Bodyweight'],
      }),
      ex({
        id: 'wall_push_up',
        name: 'Wall Push-Up',
        primaryMuscleGroup: 'Chest',
        equipment: ['Bodyweight'],
      }),
      ex({
        id: 'fly2',
        name: 'Cable Fly',
        primaryMuscleGroup: 'Chest',
        equipment: ['Cable'],
      }),
    ]);
    const out = service.pickReplacementSuggestions({
      targetName: 'Knee Push-Up',
      targetExerciseId: 'knee_push_up',
      dayExerciseIds: ['knee_push_up'],
    });
    expect(out[0].exercise.id).toBe('wall_push_up');
    expect(out[0].reasons).toContain('Easier version');
  });

  it('prefers shared sub-muscle candidates and names the focus in the reason', () => {
    const service = withCatalog([
      ex({
        id: 'declinebb2',
        name: 'Decline Barbell Bench Press',
        primaryMuscleGroup: 'Chest',
        subMuscles: ['Lower Chest'],
      }),
      ex({
        id: 'dip',
        name: 'Chest Dip',
        primaryMuscleGroup: 'Chest',
        subMuscles: ['Lower Chest'],
        equipment: ['Bodyweight'],
      }),
      ex({
        id: 'inclinefly',
        name: 'Incline Cable Fly',
        primaryMuscleGroup: 'Chest',
        subMuscles: ['Upper Chest'],
        equipment: ['Cable'],
      }),
    ]);
    const out = service.pickReplacementSuggestions({
      targetName: 'Decline Barbell Bench Press',
      targetExerciseId: 'declinebb2',
      dayExerciseIds: ['declinebb2'],
      count: 10,
    });
    expect(out[0].exercise.id).toBe('dip');
    expect(out[0].reasons.join(' ')).toContain('Lower Chest focus');
  });

  it('respects the real equipment list and explains the fit when nothing stronger applies', () => {
    const service = withCatalog(chestCatalog());
    const out = service.pickReplacementSuggestions({
      targetName: 'Flat Barbell Bench Press',
      targetExerciseId: 'flatbb',
      dayExerciseIds: ['flatbb'],
      equipment: ['Cable'],
      count: 10,
    });
    expect(out.length).toBeGreaterThan(0);
    for (const s of out) {
      expect(s.exercise.equipment).toContain('Cable');
    }
  });

  it('honors avoid phrases (free-text over name/equipment)', () => {
    const service = withCatalog(chestCatalog());
    const out = service.pickReplacementSuggestions({
      targetName: 'Flat Barbell Bench Press',
      targetExerciseId: 'flatbb',
      dayExerciseIds: ['flatbb'],
      avoid: ['dumbbell'],
      count: 10,
    });
    expect(out.map((s) => s.exercise.id)).not.toContain('flatdb');
  });

  it('is deterministic and caps at count with at most two reasons per row', () => {
    const service = withCatalog(chestCatalog());
    const dto = {
      targetName: 'Flat Barbell Bench Press',
      targetExerciseId: 'flatbb',
      dayExerciseIds: ['flatbb'],
      count: 2,
    };
    const a = service.pickReplacementSuggestions(dto);
    const b = service.pickReplacementSuggestions(dto);
    expect(a.map((s) => s.exercise.id)).toEqual(b.map((s) => s.exercise.id));
    expect(a.length).toBeLessThanOrEqual(2);
    for (const s of a) {
      expect(s.reasons.length).toBeGreaterThanOrEqual(1);
      expect(s.reasons.length).toBeLessThanOrEqual(2);
    }
  });

  it('returns empty for an unknown target instead of guessing', () => {
    const service = withCatalog(chestCatalog());
    const out = service.pickReplacementSuggestions({
      targetName: 'Not A Real Exercise',
    });
    expect(out).toEqual([]);
  });
});

describe('ExercisesService.pickReplacementSuggestions personalization', () => {
  /** Two interchangeable mid-chest presses + one fly; `type` set explicitly. */
  const pressCatalog = () => [
    ex({
      id: 'target_press',
      name: 'Machine Chest Press',
      primaryMuscleGroup: 'Chest',
      subMuscles: ['Mid Chest'],
      equipment: ['Machine'],
      type: 'Compound',
    }),
    ex({
      id: 'press_a',
      name: 'Flat Dumbbell Bench Press',
      primaryMuscleGroup: 'Chest',
      subMuscles: ['Mid Chest'],
      equipment: ['Dumbbell'],
      type: 'Compound',
    }),
    ex({
      id: 'press_b',
      name: 'Smith Machine Bench Press',
      primaryMuscleGroup: 'Chest',
      subMuscles: ['Mid Chest'],
      equipment: ['Smith Machine'],
      type: 'Compound',
    }),
    ex({
      id: 'fly_iso',
      name: 'Cable Fly',
      primaryMuscleGroup: 'Chest',
      subMuscles: ['Mid Chest'],
      equipment: ['Cable'],
      type: 'Isolation',
    }),
  ];

  it('demotes a candidate already planned elsewhere this week', () => {
    const service = withCatalog(pressCatalog());
    const base = {
      targetName: 'Machine Chest Press',
      targetExerciseId: 'target_press',
      dayExerciseIds: ['target_press'],
      count: 10,
    };
    const without = service.pickReplacementSuggestions(base);
    const with_ = service.pickReplacementSuggestions({
      ...base,
      weekExerciseIds: [without[0].exercise.id],
    });
    expect(with_[0].exercise.id).not.toBe(without[0].exercise.id);
    // Still suggested — variety demotes, never hides.
    expect(with_.map((s) => s.exercise.id)).toContain(without[0].exercise.id);
  });

  it('boosts a lift the user has really trained and says so, but not when it was just trained', () => {
    const service = withCatalog(pressCatalog());
    const base = {
      targetName: 'Machine Chest Press',
      targetExerciseId: 'target_press',
      dayExerciseIds: ['target_press'],
      count: 10,
    };
    const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
    // press_b trained 6 times, 10 days ago -> outranks its otherwise-equal twin.
    const familiar = service.pickReplacementSuggestions(
      base,
      new Map([['press_b', { count: 6, lastAt: daysAgo(10) }]]),
    );
    expect(familiar[0].exercise.id).toBe('press_b');
    expect(familiar[0].reasons).toContain("You've trained this before");
    // Same history but logged YESTERDAY -> freshness penalty flips the order.
    const justTrained = service.pickReplacementSuggestions(
      base,
      new Map([['press_b', { count: 6, lastAt: daysAgo(1) }]]),
    );
    expect(justTrained[0].exercise.id).not.toBe('press_b');
  });

  it('sinks high-skill barbell lifts for beginners without hiding them', () => {
    const service = withCatalog([
      ...pressCatalog(),
      ex({
        id: 'flat_bb',
        name: 'Flat Barbell Bench Press',
        primaryMuscleGroup: 'Chest',
        subMuscles: ['Mid Chest'],
        type: 'Compound',
      }),
    ]);
    const base = {
      targetName: 'Machine Chest Press',
      targetExerciseId: 'target_press',
      dayExerciseIds: ['target_press'],
      count: 10,
    };
    const intermediate = service.pickReplacementSuggestions({
      ...base,
      experience: 'Intermediate',
    });
    const beginner = service.pickReplacementSuggestions({
      ...base,
      experience: 'Beginner',
    });
    const beginnerIds = beginner.map((s) => s.exercise.id);
    // Sunk to the bottom for a beginner, but still present (soft gate).
    expect(beginnerIds[beginnerIds.length - 1]).toBe('flat_bb');
    expect(
      intermediate.map((s) => s.exercise.id).indexOf('flat_bb'),
    ).toBeLessThan(beginnerIds.indexOf('flat_bb'));
  });

  it('keeps a compound slot a compound: isolation moves rank below same-sub compounds', () => {
    const service = withCatalog(pressCatalog());
    const out = service.pickReplacementSuggestions({
      targetName: 'Machine Chest Press',
      targetExerciseId: 'target_press',
      dayExerciseIds: ['target_press'],
      count: 10,
    });
    const ids = out.map((s) => s.exercise.id);
    expect(ids.indexOf('fly_iso')).toBeGreaterThan(ids.indexOf('press_a'));
    expect(ids.indexOf('fly_iso')).toBeGreaterThan(ids.indexOf('press_b'));
  });

  it('penalizes drift onto a sub-muscle another day exercise already covers', () => {
    const service = withCatalog([
      ex({
        id: 'lateral_target',
        name: 'Dumbbell Lateral Raise',
        primaryMuscleGroup: 'Shoulders',
        subMuscles: ['Side Delts'],
        equipment: ['Dumbbell'],
        type: 'Isolation',
      }),
      ex({
        id: 'front_covered',
        name: 'Front Raise',
        primaryMuscleGroup: 'Shoulders',
        subMuscles: ['Front Delts'],
        equipment: ['Dumbbell'],
        type: 'Isolation',
      }),
      ex({
        id: 'rear_uncovered',
        name: 'Reverse Fly',
        primaryMuscleGroup: 'Shoulders',
        subMuscles: ['Rear Delts'],
        equipment: ['Dumbbell'],
        type: 'Isolation',
      }),
      ex({
        id: 'ohp_day',
        name: 'Seated Dumbbell Shoulder Press',
        primaryMuscleGroup: 'Shoulders',
        subMuscles: ['Front Delts'],
        equipment: ['Dumbbell'],
        type: 'Compound',
      }),
    ]);
    // Day already presses (Front Delts). Neither candidate shares the
    // target's sub — the one drifting onto uncovered Rear Delts must win.
    const out = service.pickReplacementSuggestions({
      targetName: 'Dumbbell Lateral Raise',
      targetExerciseId: 'lateral_target',
      dayExerciseIds: ['lateral_target', 'ohp_day'],
      count: 10,
    });
    const ids = out.map((s) => s.exercise.id);
    expect(ids.indexOf('rear_uncovered')).toBeLessThan(
      ids.indexOf('front_covered'),
    );
  });
});

describe('ExercisesService.pickReplacementSuggestions week-planned twins', () => {
  it("strips the canonical-swap bonus from a twin that's already planned this week", () => {
    const service = withCatalog([
      ex({
        id: 'flatbb_w',
        name: 'Flat Barbell Bench Press',
        primaryMuscleGroup: 'Chest',
        subMuscles: ['Mid Chest'],
        type: 'Compound',
      }),
      ex({
        id: 'flatdb_w',
        name: 'Flat Dumbbell Bench Press',
        primaryMuscleGroup: 'Chest',
        subMuscles: ['Mid Chest'],
        equipment: ['Dumbbell'],
        type: 'Compound',
      }),
      ex({
        id: 'machine_w',
        name: 'Machine Chest Press',
        primaryMuscleGroup: 'Chest',
        subMuscles: ['Mid Chest'],
        equipment: ['Machine'],
        type: 'Compound',
      }),
    ]);
    const base = {
      targetName: 'Flat Barbell Bench Press',
      targetExerciseId: 'flatbb_w',
      dayExerciseIds: ['flatbb_w'],
      count: 10,
    };
    // Normally the DB twin owns the top slot with the same-lift reason…
    const plain = service.pickReplacementSuggestions(base);
    expect(plain[0].exercise.id).toBe('flatdb_w');
    expect(plain[0].reasons).toContain('Same lift, different equipment');
    // …but not when that exact lift already sits on another day this week:
    // then it's a repeat, not a swap — demoted below fresh candidates and
    // stripped of the canonical-swap why-tag.
    const withWeek = service.pickReplacementSuggestions({
      ...base,
      weekExerciseIds: ['flatdb_w'],
    });
    expect(withWeek[0].exercise.id).toBe('machine_w');
    const twin = withWeek.find((s) => s.exercise.id === 'flatdb_w');
    expect(twin).toBeDefined(); // demoted, never hidden
    expect(twin?.reasons).not.toContain('Same lift, different equipment');
  });
});
