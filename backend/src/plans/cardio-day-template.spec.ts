import {
  buildCardioDaySession,
  cardioNameMatchesModality,
  type CardioTemplateLibrary,
} from './cardio-day-template';
import type { GeneratedSession } from './session-enrichment';

function mockLibrary(): CardioTemplateLibrary {
  const rows = [
    {
      id: 'treadmill_jog_steady',
      name: 'Treadmill Jog (Steady State)',
      primaryMuscleGroup: 'Cardio',
      primaryEquipment: ['Machine'],
    },
    {
      id: 'treadmill_run_intervals',
      name: 'Treadmill Run Intervals',
      primaryMuscleGroup: 'Cardio',
      primaryEquipment: ['Machine'],
    },
    {
      id: 'outdoor_jog_steady',
      name: 'Outdoor Jog (Steady State)',
      primaryMuscleGroup: 'Cardio',
      primaryEquipment: [],
    },
    {
      id: 'outdoor_run_intervals',
      name: 'Outdoor Run Intervals',
      primaryMuscleGroup: 'Cardio',
      primaryEquipment: [],
    },
    {
      id: 'stationary_bike_steady',
      name: 'Stationary Bike (Steady / Zone 2)',
      primaryMuscleGroup: 'Cardio',
      primaryEquipment: ['Machine'],
    },
    {
      id: 'stationary_bike_intervals',
      name: 'Stationary Bike Intervals',
      primaryMuscleGroup: 'Cardio',
      primaryEquipment: ['Machine'],
    },
    {
      id: 'swimming_laps_easy',
      name: 'Swimming (Easy Laps)',
      primaryMuscleGroup: 'Cardio',
      primaryEquipment: ['Unmodeled'],
    },
    {
      id: 'zone_2_training_session',
      name: 'Zone 2 Cardio Session',
      primaryMuscleGroup: 'Cardio',
      primaryEquipment: [],
    },
    {
      id: 'plank',
      name: 'Plank',
      primaryMuscleGroup: 'Core',
      prescriptionType: 'time' as const,
    },
    { id: 'dead_bug', name: 'Dead Bug', primaryMuscleGroup: 'Core' },
    {
      id: 'weighted_plank',
      name: 'Weighted Plank',
      primaryMuscleGroup: 'Core',
    },
  ];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return {
    findOne: (id) => byId.get(id),
    getCandidatesForGenerator: ({ excludeIds }) => {
      const ex = new Set(excludeIds ?? []);
      return rows.filter((r) => !ex.has(r.id));
    },
  };
}

function cardioSession(): GeneratedSession {
  return {
    weekIndex: 1,
    weekday: 'Wednesday',
    name: 'Cardio',
    exercises: [
      {
        name: 'Trail Hiking (Brisk)',
        sets: 2,
        reps: 15,
        exerciseId: 'trail_hiking_brisk',
      },
      {
        name: 'Shadow Boxing',
        sets: 2,
        reps: 15,
        exerciseId: 'shadow_boxing_rounds',
      },
    ],
  };
}

describe('cardioNameMatchesModality', () => {
  it('matches run family and rejects rowing for run', () => {
    expect(
      cardioNameMatchesModality('Treadmill Jog (Steady State)', 'run'),
    ).toBe(true);
    expect(
      cardioNameMatchesModality('Rowing Machine (Steady State)', 'run'),
    ).toBe(false);
    expect(
      cardioNameMatchesModality('Rowing Machine (Steady State)', 'row'),
    ).toBe(true);
  });
});

describe('buildCardioDaySession', () => {
  it('builds a steady run day: time-based main block plus two core rows', () => {
    const out = buildCardioDaySession({
      session: cardioSession(),
      library: mockLibrary(),
      modalities: ['run'],
      durationMinutes: 30,
      cardioDayIndex: 0,
    });

    expect(out.exercises).toHaveLength(3);
    const main = out.exercises[0]!;
    expect(main.exerciseId).toBe('treadmill_jog_steady');
    expect(main.prescriptionType).toBe('time');
    expect(main.sets).toBe(1);
    // 30-min day reserves ~15 min for warm-up/cool-down/core → 15-min main block.
    expect(main.reps).toBe(900);
    expect(main.durationSeconds).toBe(900);
    expect(main.notes).toMatch(/conversational|zone 2/i);

    const coreIds = out.exercises.slice(1).map((e) => e.exerciseId);
    expect(coreIds).toHaveLength(2);
    for (const e of out.exercises.slice(1)) {
      expect(e.primaryMuscleGroup).toBe('Core');
    }
    expect(out.warmUp).toBeTruthy();
    expect(out.coolDown).toBeTruthy();
    expect(out.reasoning).toMatch(/steady zone-2/i);
  });

  it('alternates to intervals on the second cardio day', () => {
    const out = buildCardioDaySession({
      session: cardioSession(),
      library: mockLibrary(),
      modalities: ['run'],
      durationMinutes: 25,
      cardioDayIndex: 1,
    });
    expect(out.exercises[0]!.exerciseId).toBe('treadmill_run_intervals');
    expect(out.exercises[0]!.notes).toMatch(/brisk.*easy/i);
    expect(out.reasoning).toMatch(/intervals/i);
  });

  it('falls back to the generic zone-2 session when no modality is set', () => {
    const out = buildCardioDaySession({
      session: cardioSession(),
      library: mockLibrary(),
      durationMinutes: 30,
      cardioDayIndex: 0,
    });
    expect(out.exercises[0]!.exerciseId).toBe('zone_2_training_session');
  });

  it('keeps a sane main block on very short days and skips near-dup core variants', () => {
    const out = buildCardioDaySession({
      session: cardioSession(),
      library: mockLibrary(),
      modalities: ['run'],
      durationMinutes: 15,
      cardioDayIndex: 0,
    });
    // 15-min floor still leaves an 8-min minimum main block.
    expect(out.exercises[0]!.reps).toBe(480);
    // plank and weighted_plank share a base movement — only one may appear.
    const ids = out.exercises.map((e) => e.exerciseId);
    expect(ids.includes('plank') && ids.includes('weighted_plank')).toBe(false);
  });

  it('resolves run to the outdoor jog when the user has no machine', () => {
    const out = buildCardioDaySession({
      session: cardioSession(),
      library: mockLibrary(),
      modalities: ['run'],
      equipment: ['Dumbbell', 'Resistance Band', 'Bodyweight'],
      durationMinutes: 30,
      cardioDayIndex: 0,
    });
    expect(out.exercises[0]!.exerciseId).toBe('outdoor_jog_steady');
  });

  it('keeps the treadmill for run when the user has machines', () => {
    const out = buildCardioDaySession({
      session: cardioSession(),
      library: mockLibrary(),
      modalities: ['run'],
      equipment: ['Machine', 'Barbell'],
      durationMinutes: 30,
      cardioDayIndex: 0,
    });
    expect(out.exercises[0]!.exerciseId).toBe('treadmill_jog_steady');
  });

  it('never prescribes swimming without a pool: swim preference falls back to zone 2', () => {
    const out = buildCardioDaySession({
      session: cardioSession(),
      library: mockLibrary(),
      modalities: ['swim'],
      equipment: ['Dumbbell', 'Resistance Band'],
      durationMinutes: 30,
      cardioDayIndex: 0,
    });
    expect(out.exercises[0]!.exerciseId).toBe('zone_2_training_session');
  });

  it('rotates modalities across cardio days when several are listed', () => {
    const args = {
      session: cardioSession(),
      library: mockLibrary(),
      modalities: ['run', 'bike'],
      durationMinutes: 30,
    };
    const day0 = buildCardioDaySession({ ...args, cardioDayIndex: 0 });
    const day1 = buildCardioDaySession({ ...args, cardioDayIndex: 1 });
    expect(day0.exercises[0]!.exerciseId).toBe('treadmill_jog_steady');
    // Day 1 flips to intervals and starts the rotation at the second modality.
    expect(day1.exercises[0]!.exerciseId).toBe('stationary_bike_intervals');
  });
});
