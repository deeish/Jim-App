import type { GenerationEvalScenario } from './eval-types';
import type { GeneratedSession } from '../session-enrichment';

/** ~30m mean → simple tier min 4 exercises (see `exerciseTargetsForSession`). */
const SHORT_STRENGTH_SPEC = {
  type: 'strength' as const,
  durationMin: 25,
  durationMax: 35,
  isHardDay: false,
  weekIndex: 1,
};

const fourDaySpecs = [
  {
    ...SHORT_STRENGTH_SPEC,
    title: 'Upper',
    isHardDay: true,
    weekday: 'Monday',
  },
  {
    ...SHORT_STRENGTH_SPEC,
    title: 'Lower',
    isHardDay: true,
    weekday: 'Tuesday',
  },
  {
    ...SHORT_STRENGTH_SPEC,
    title: 'Upper 2',
    weekday: 'Thursday',
  },
  {
    ...SHORT_STRENGTH_SPEC,
    title: 'Lower 2',
    weekday: 'Friday',
  },
];

function fourFiller(
  week: number,
  day: string,
  prefix: string,
): NonNullable<GeneratedSession['exercises']> {
  return [
    { name: `${prefix}1`, sets: 3, reps: 8, exerciseId: `${prefix}_1` },
    { name: `${prefix}2`, sets: 3, reps: 8, exerciseId: `${prefix}_2` },
    { name: `${prefix}3`, sets: 3, reps: 8, exerciseId: `${prefix}_3` },
  ];
}

/**
 * Frozen scenarios for `generation-eval.spec.ts`.
 * Add new entries when you fix a production bug — lock the before/after contract.
 * The clean four-day regression also lives in `fixtures/chunk-clean-four-day.json`.
 */
export const GENERATION_EVAL_SCENARIOS: GenerationEvalScenario[] = [
  {
    id: 'chunk_duplicate_across_four_strength_days',
    evalScoring: {
      skipBalance: true,
      skipCoaching: true,
      skipWorkoutOrder: true,
    },
    description:
      'Same library id repeated across four strength sessions (classic batch failure mode).',
    effectiveDetailLevel: 'simple',
    specs: fourDaySpecs,
    sessionsBeforeRepair: [
      {
        weekIndex: 1,
        weekday: 'Monday',
        name: 'Upper',
        exercises: [
          { name: 'Shared', sets: 3, reps: 8, exerciseId: 'dup_shared' },
          ...fourFiller(1, 'Mon', 'm'),
        ],
      },
      {
        weekIndex: 1,
        weekday: 'Tuesday',
        name: 'Lower',
        exercises: [
          { name: 'Shared', sets: 3, reps: 8, exerciseId: 'dup_shared' },
          ...fourFiller(1, 'Tue', 't'),
        ],
      },
      {
        weekIndex: 1,
        weekday: 'Thursday',
        name: 'Upper 2',
        exercises: [
          { name: 'Shared', sets: 3, reps: 8, exerciseId: 'dup_shared' },
          ...fourFiller(1, 'Thu', 'th'),
        ],
      },
      {
        weekIndex: 1,
        weekday: 'Friday',
        name: 'Lower 2',
        exercises: [
          { name: 'Shared', sets: 3, reps: 8, exerciseId: 'dup_shared' },
          ...fourFiller(1, 'Fri', 'f'),
        ],
      },
    ],
    catalog: [
      { id: 'dup_shared', name: 'Bench', movementPatterns: ['Push'], primaryMuscleGroup: 'Chest' },
      {
        id: 'alt_a',
        name: 'Incline Press',
        movementPatterns: ['Push'],
        primaryMuscleGroup: 'Chest',
      },
      { id: 'alt_b', name: 'Cable Row', movementPatterns: ['Pull'], primaryMuscleGroup: 'Back' },
      { id: 'alt_c', name: 'Leg Press', movementPatterns: ['Squat'], primaryMuscleGroup: 'Legs' },
      { id: 'alt_d', name: 'RDL', movementPatterns: ['Hinge'], primaryMuscleGroup: 'Legs' },
      // Fillers default Push; seed Pull / Squat / Hinge on one row per day so chunk
      // movement-diversity union stays at 4+ keys even when duplicate-repair picks fewer alts.
      ...(['m', 't', 'th', 'f'] as const).flatMap((p) =>
        [1, 2, 3].map((i) => {
          let movementPatterns: string[] = ['Push'];
          let primaryMuscleGroup = 'Shoulders';
          if (p === 't' && i === 1) movementPatterns = ['Hinge'];
          if (p === 'th' && i === 1) movementPatterns = ['Pull'];
          if (p === 'f' && i === 1) movementPatterns = ['Squat'];
          if (p === 'm') {
            primaryMuscleGroup = i === 1 ? 'Chest' : i === 2 ? 'Shoulders' : 'Arms';
          } else if (p === 't') {
            primaryMuscleGroup = i === 1 ? 'Legs' : i === 2 ? 'Glutes' : 'Core';
          } else if (p === 'th') {
            primaryMuscleGroup = i === 1 ? 'Back' : i === 2 ? 'Shoulders' : 'Arms';
          } else {
            primaryMuscleGroup = i === 1 ? 'Legs' : i === 2 ? 'Hamstrings' : 'Core';
          }
          return {
            id: `${p}_${i}`,
            name: `${p}${i}`,
            movementPatterns,
            primaryMuscleGroup,
          };
        }),
      ),
    ],
    expect: {
      runRepair: true,
      after: { validatorOk: true, issuesMustNotInclude: ['duplicate_exercise_id_across_chunk'] },
      expectRepairNotes: true,
    },
  },
  {
    id: 'chunk_upper_focus_hinge_clash',
    evalScoring: {
      skipCoaching: true,
      skipWorkoutOrder: true,
      skipDiversity: true,
    },
    description: 'Upper title with hinge-pattern library id should be repairable to pass validator.',
    effectiveDetailLevel: 'simple',
    specs: [
      {
        type: 'strength',
        title: 'Upper',
        durationMin: 25,
        durationMax: 35,
        isHardDay: false,
        weekIndex: 0,
        weekday: 'Monday',
      },
    ],
    sessionsBeforeRepair: [
      {
        weekIndex: 0,
        weekday: 'Monday',
        name: 'Upper',
        exercises: [
          {
            name: 'Trap Bar DL',
            sets: 3,
            reps: 6,
            exerciseId: 'trap_hinge',
          },
          ...fourFiller(0, 'Mon', 'u'),
        ],
      },
    ],
    catalog: [
      {
        id: 'trap_hinge',
        name: 'Trap Bar Deadlift',
        movementPatterns: ['Hinge', 'Pull'],
        primaryMuscleGroup: 'Legs',
      },
      {
        id: 'upper_safe',
        name: 'Lat Pulldown',
        movementPatterns: ['Pull'],
        primaryMuscleGroup: 'Back',
      },
      ...[1, 2, 3].map((i) => ({
        id: `u_${i}`,
        name: `U${i}`,
        movementPatterns: ['Push'] as string[],
        primaryMuscleGroup: i === 1 ? 'Chest' : i === 2 ? 'Shoulders' : 'Arms',
      })),
    ],
    expect: {
      runRepair: true,
      after: {
        validatorOk: true,
        issuesMustNotInclude: ['primary_lower_pattern_on_upper_focus'],
      },
      expectRepairNotes: true,
    },
  },
  {
    id: 'chunk_hybrid_goal_appends_cardio_finisher',
    evalScoring: { skipDiversity: true },
    description:
      'Hybrid goal + session length gates: enrich appends library cardio finisher last.',
    effectiveDetailLevel: 'simple',
    specs: [
      {
        type: 'strength',
        title: 'Chest',
        durationMin: 35,
        durationMax: 45,
        isHardDay: false,
        weekIndex: 0,
        weekday: 'Monday',
      },
    ],
    sessionsBeforeRepair: [
      {
        weekIndex: 0,
        weekday: 'Monday',
        name: 'Chest',
        exercises: [
          { name: 'Bench', sets: 3, reps: 8, exerciseId: 'bench' },
          { name: 'Incline', sets: 3, reps: 8, exerciseId: 'inc' },
          { name: 'Fly', sets: 3, reps: 10, exerciseId: 'fly' },
          { name: 'Pressdown', sets: 3, reps: 10, exerciseId: 'pd' },
        ],
      },
    ],
    catalog: [
      {
        id: 'bench',
        name: 'Barbell Bench Press',
        movementPatterns: ['Push'],
        primaryMuscleGroup: 'Chest',
      },
      {
        id: 'inc',
        name: 'Incline Dumbbell Press',
        movementPatterns: ['Push'],
        primaryMuscleGroup: 'Chest',
      },
      {
        id: 'fly',
        name: 'Cable Fly',
        movementPatterns: ['Push'],
        primaryMuscleGroup: 'Chest',
      },
      {
        id: 'pd',
        name: 'Triceps Pressdown',
        movementPatterns: ['Push'],
        primaryMuscleGroup: 'Arms',
      },
      {
        id: 'cardio_treadmill',
        name: 'Treadmill Walk',
        movementPatterns: [],
        primaryMuscleGroup: 'Cardio',
        prescriptionType: 'time',
      },
    ],
    enrichPrefs: {
      goal: 'hybrid',
      durationMinutes: 45,
      detailLevel: 'simple',
      cardioModalities: ['treadmill'],
    },
    expect: {
      runRepair: true,
      after: { validatorOk: true },
      afterEnrich: { validatorOk: true },
      assertCardioFinisherLast: true,
    },
  },
  {
    id: 'chunk_below_min_exercises_fixed_by_repair',
    evalScoring: {
      skipBalance: true,
      skipVolume: true,
      skipDiversity: true,
      skipConditioning: true,
      skipCoaching: true,
      skipWorkoutOrder: true,
    },
    description:
      'Repair appends catalog rows when the model returns fewer exercises than the session minimum.',
    effectiveDetailLevel: 'simple',
    specs: [
      {
        type: 'strength',
        title: 'Upper',
        durationMin: 45,
        durationMax: 60,
        isHardDay: false,
        weekIndex: 0,
        weekday: 'Monday',
      },
    ],
    sessionsBeforeRepair: [
      {
        weekIndex: 0,
        weekday: 'Monday',
        name: 'Upper',
        exercises: [
          { name: 'A', sets: 3, reps: 8, exerciseId: 'a1' },
          { name: 'B', sets: 3, reps: 8, exerciseId: 'b1' },
        ],
      },
    ],
    catalog: [
      { id: 'a1', name: 'A', movementPatterns: ['Push'], primaryMuscleGroup: 'Chest' },
      { id: 'b1', name: 'B', movementPatterns: ['Pull'], primaryMuscleGroup: 'Back' },
      {
        id: 'u1',
        name: 'U1',
        movementPatterns: ['Push'],
        primaryMuscleGroup: 'Shoulders',
      },
      {
        id: 'u2',
        name: 'U2',
        movementPatterns: ['Pull'],
        primaryMuscleGroup: 'Core',
      },
      {
        id: 'u3',
        name: 'U3',
        movementPatterns: ['Push'],
        primaryMuscleGroup: 'Arms',
      },
    ],
    expect: {
      runRepair: true,
      after: {
        validatorOk: true,
        issuesMustNotInclude: ['below_min_exercises'],
      },
    },
  },
];
