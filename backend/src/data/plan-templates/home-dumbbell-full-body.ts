import type {
  PlanTemplate,
  TemplateExercise,
  WeeklyPrescriptions,
} from './types';

/**
 * HOME · DUMBBELL FULL BODY — 3 days/week, 8 weeks, home.
 *
 * The whole program runs on a pair of adjustable dumbbells, a bench and
 * your bodyweight — no barbell, no machines, no cables, no pull-up bar.
 * Three full-body days, each one squat-or-hinge pattern, one press, one
 * row, plus targeted accessory work:
 *
 *   A — Goblet squat + flat press + single-arm row
 *   B — Romanian deadlift + shoulder press + chest-supported row
 *   C — Bulgarian split squat + incline press + bilateral row
 *
 * Dumbbell-context picks (graded B for redundancy in a full gym, chosen
 * here ON PURPOSE): the reverse lunge needs two feet of floor where a
 * walking lunge needs a runway; the bilateral bent-over row works both
 * sides in half the time of day A's single-arm version; the dumbbell hip
 * thrust is the loadable hip-extension the home setup allows. Rows run a
 * set ahead of presses all block (push-ups count as pressing), so pulling
 * volume stays ahead at home exactly like it does in the gym programs.
 *
 * Progression: reps first inside each range, then load — with fixed
 * dumbbell jumps, earn the top of the range on every set before moving up.
 * Leads add a 4th set from week 3, rows run 4 sets rising to 5 for the
 * weeks 6–7 push, week 4 is a planned lighter week, week 8 a deload.
 */

/** Day leads (goblet squat, RDL, split squat): 3 sets, 4th from week 3. */
function homeLead(repsMin: number, repsMax: number): WeeklyPrescriptions {
  return [
    {
      sets: 3,
      repsMin,
      repsMax,
      note: 'Find a weight that leaves 2 clean reps in the tank.',
    },
    {
      sets: 3,
      repsMin,
      repsMax,
      note: 'Same weight, more reps — chase the top of the range.',
    },
    { sets: 4, repsMin, repsMax, note: 'Fourth set arrives.' },
    {
      sets: 2,
      repsMin,
      repsMax,
      note: 'Lighter week: two smooth sets, well shy of failure.',
    },
    { sets: 4, repsMin, repsMax },
    {
      sets: 4,
      repsMin,
      repsMax,
      note: 'Top of every range? Next dumbbell up.',
    },
    { sets: 4, repsMin, repsMax, note: 'Best week of the block.' },
    { sets: 2, repsMin, repsMax, note: 'Deload — light and easy.' },
  ];
}

/** Presses: steady 3s, a 4th set for the weeks 6–7 push. */
function homePress(repsMin: number, repsMax: number): WeeklyPrescriptions {
  return [
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax, note: 'Add reps before you add weight.' },
    { sets: 3, repsMin, repsMax },
    { sets: 2, repsMin, repsMax, note: 'Lighter week — two easy sets.' },
    { sets: 3, repsMin, repsMax },
    { sets: 4, repsMin, repsMax, note: 'Fourth set for the final push.' },
    { sets: 4, repsMin, repsMax },
    { sets: 2, repsMin, repsMax, note: 'Deload — light and easy.' },
  ];
}

/** Rows: always one set ahead of the presses (pull stays ahead of push). */
function homeRow(repsMin: number, repsMax: number): WeeklyPrescriptions {
  return [
    {
      sets: 4,
      repsMin,
      repsMax,
      note: 'Rows carry this program — treat them like a main lift.',
    },
    { sets: 4, repsMin, repsMax },
    { sets: 4, repsMin, repsMax },
    { sets: 3, repsMin, repsMax, note: 'Lighter week — three easy sets.' },
    { sets: 4, repsMin, repsMax },
    { sets: 5, repsMin, repsMax, note: 'Fifth set for the final push.' },
    { sets: 5, repsMin, repsMax },
    { sets: 3, repsMin, repsMax, note: 'Deload — light and easy.' },
  ];
}

/** Accessories: 2 sets growing to 3 mid-block. */
function homeAccessory(repsMin: number, repsMax: number): WeeklyPrescriptions {
  return [
    { sets: 2, repsMin, repsMax },
    { sets: 2, repsMin, repsMax },
    { sets: 3, repsMin, repsMax, note: 'A third set from here on.' },
    { sets: 2, repsMin, repsMax, note: 'Lighter week.' },
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax },
    { sets: 1, repsMin, repsMax, note: 'Deload — one easy set.' },
  ];
}

/** Push-ups: small steady dose on top of day A's pressing. */
const HOME_PUSH_UP: WeeklyPrescriptions = [
  {
    sets: 2,
    repsMin: 8,
    repsMax: 15,
    note: 'Stop 2 short of failure. Elevate hands if needed.',
  },
  { sets: 2, repsMin: 8, repsMax: 15 },
  { sets: 2, repsMin: 8, repsMax: 15 },
  { sets: 1, repsMin: 8, repsMax: 15, note: 'Lighter week.' },
  { sets: 2, repsMin: 8, repsMax: 15 },
  { sets: 2, repsMin: 8, repsMax: 15 },
  { sets: 3, repsMin: 8, repsMax: 15, note: 'Peak week: three sets.' },
  { sets: 1, repsMin: 8, repsMax: 15, note: 'Deload — one easy set.' },
];

const HOME_PLANK: WeeklyPrescriptions = [
  { sets: 2, durationSeconds: 30, note: 'Glutes tight, ribs down.' },
  { sets: 2, durationSeconds: 30 },
  { sets: 3, durationSeconds: 30, note: 'A third hold from here on.' },
  { sets: 2, durationSeconds: 30, note: 'Lighter week.' },
  { sets: 3, durationSeconds: 40 },
  { sets: 3, durationSeconds: 40 },
  { sets: 3, durationSeconds: 45, note: 'Longest holds of the block.' },
  { sets: 1, durationSeconds: 30, note: 'Deload — one easy hold.' },
];

const HOME_CARRY: WeeklyPrescriptions = [
  {
    sets: 2,
    durationSeconds: 30,
    note: 'Both dumbbells, tall posture, quick feet.',
  },
  { sets: 2, durationSeconds: 30 },
  { sets: 3, durationSeconds: 30, note: 'A third carry from here on.' },
  { sets: 2, durationSeconds: 30, note: 'Lighter week.' },
  { sets: 3, durationSeconds: 40 },
  { sets: 3, durationSeconds: 40 },
  { sets: 3, durationSeconds: 45, note: 'Longest carries of the block.' },
  { sets: 1, durationSeconds: 30, note: 'Deload — one easy carry.' },
];

const homeA: TemplateExercise[] = [
  {
    exerciseId: 'goblet_squat',
    name: 'Goblet Squat',
    prescriptionType: 'reps',
    restSeconds: 120,
    note: 'Lead lift. Heels down, elbows inside the knees, chest proud.',
    weekly: homeLead(8, 12),
  },
  {
    exerciseId: 'flat_dumbbell_bench_press',
    name: 'Flat Dumbbell Bench Press',
    prescriptionType: 'reps',
    restSeconds: 90,
    note: 'On the bench, feet planted. Lower to the outside of the chest.',
    weekly: homePress(8, 12),
  },
  {
    exerciseId: 'single_arm_dumbbell_row',
    name: 'Single-Arm Dumbbell Row',
    prescriptionType: 'reps',
    restSeconds: 90,
    note: 'Reps per arm. Knee and hand on the bench; pull to the hip, no twist.',
    weekly: homeRow(10, 12),
  },
  {
    exerciseId: 'dumbbell_lateral_raise',
    name: 'Dumbbell Lateral Raise',
    prescriptionType: 'reps',
    restSeconds: 60,
    note: 'Light dumbbells, lead with the elbows, no swing.',
    weekly: homeAccessory(12, 15),
  },
  {
    exerciseId: 'push_up',
    name: 'Push-Up',
    prescriptionType: 'reps',
    restSeconds: 60,
    note: 'Finisher for the chest — body in one line, full range.',
    weekly: HOME_PUSH_UP,
  },
  {
    exerciseId: 'front_plank',
    name: 'Front Plank',
    prescriptionType: 'time',
    restSeconds: 60,
    note: 'One straight line, head to heels.',
    weekly: HOME_PLANK,
  },
];

const homeB: TemplateExercise[] = [
  {
    exerciseId: 'dumbbell_romanian_deadlift',
    name: 'Dumbbell Romanian Deadlift',
    prescriptionType: 'reps',
    restSeconds: 120,
    note: 'Lead lift. Hips back, dumbbells sliding down the thighs, flat back.',
    weekly: homeLead(8, 12),
  },
  {
    exerciseId: 'seated_dumbbell_shoulder_press',
    name: 'Seated Dumbbell Shoulder Press',
    prescriptionType: 'reps',
    restSeconds: 90,
    note: 'Bench upright. Press to lockout without shrugging into the ears.',
    weekly: homePress(8, 12),
  },
  {
    exerciseId: 'chest_supported_dumbbell_row',
    name: 'Chest-Supported Dumbbell Row',
    prescriptionType: 'reps',
    restSeconds: 90,
    note: 'Chest glued to the incline bench — pure upper back, zero momentum.',
    weekly: homeRow(10, 12),
  },
  {
    exerciseId: 'dumbbell_reverse_lunge',
    name: 'Dumbbell Reverse Lunge',
    prescriptionType: 'reps',
    restSeconds: 90,
    note: 'Reps per leg. Step back, drive through the front heel — two feet of floor is plenty.',
    weekly: homeAccessory(10, 12),
  },
  {
    exerciseId: 'dumbbell_hammer_curl',
    name: 'Dumbbell Hammer Curl',
    prescriptionType: 'reps',
    restSeconds: 60,
    note: 'Neutral grip, elbows quiet.',
    weekly: homeAccessory(10, 12),
  },
  {
    exerciseId: 'farmer_carry',
    name: 'Farmer Carry',
    prescriptionType: 'time',
    restSeconds: 60,
    note: 'Grip, posture and conditioning in one move. Walk laps if space is tight.',
    weekly: HOME_CARRY,
  },
];

const homeC: TemplateExercise[] = [
  {
    exerciseId: 'dumbbell_bulgarian_split_squat',
    name: 'Dumbbell Bulgarian Split Squat',
    prescriptionType: 'reps',
    restSeconds: 120,
    note: 'Lead lift. Reps per leg, rear foot on the bench; stay tall for quads.',
    weekly: homeLead(8, 10),
  },
  {
    exerciseId: 'incline_dumbbell_bench_press',
    name: 'Incline Dumbbell Bench Press',
    prescriptionType: 'reps',
    restSeconds: 90,
    note: 'Bench at ~30° — the upper-chest angle the flat day misses.',
    weekly: homePress(8, 12),
  },
  {
    exerciseId: 'dumbbell_bent_over_row_bilateral',
    name: 'Bilateral Dumbbell Bent-Over Row',
    prescriptionType: 'reps',
    restSeconds: 90,
    note: 'Both dumbbells at once — hinge, flat back, pull to the hips.',
    weekly: homeRow(10, 12),
  },
  {
    exerciseId: 'dumbbell_hip_thrust',
    name: 'Dumbbell Hip Thrust',
    prescriptionType: 'reps',
    restSeconds: 90,
    note: 'Shoulders on the bench, dumbbell on the hips; squeeze a beat at the top.',
    weekly: homeAccessory(10, 15),
  },
  {
    exerciseId: 'standing_dumbbell_overhead_triceps_extension',
    name: 'Standing Dumbbell Overhead Triceps Extension',
    prescriptionType: 'reps',
    restSeconds: 60,
    note: 'Both hands on one dumbbell, deep stretch behind the head.',
    weekly: homeAccessory(10, 12),
  },
  {
    exerciseId: 'bodyweight_calf_raise',
    name: 'Bodyweight Calf Raise',
    prescriptionType: 'reps',
    restSeconds: 45,
    note: 'Off a step for full stretch; hold a dumbbell once 20 is easy.',
    weekly: homeAccessory(12, 20),
  },
];

export const HOME_DUMBBELL_FULL_BODY: PlanTemplate = {
  id: 'home-dumbbell-full-body',
  name: 'Home · Dumbbell Full Body',
  tagline:
    'A pair of dumbbells, a bench and eight weeks — the whole gym you actually need.',
  goal: 'hybrid',
  goalId: 'balanced',
  split: 'Full Body',
  splitId: 'full_body',
  programTemplateId: 'full-body-3',
  daysPerWeek: 3,
  // 2 days keeps the full rotation; 4 is the ceiling — full-body dumbbell
  // work recovers faster than barbell waves, but daily squatting doesn't.
  supportedDaysPerWeek: { min: 2, max: 4 },
  weeksCount: 8,
  experienceLevel: 'beginner',
  defaultWeekdays: ['Monday', 'Wednesday', 'Friday'],
  muscleFocus: ['Full body', 'Home', 'Dumbbells'],
  summary: [
    'Needs only adjustable dumbbells, a bench and your bodyweight — nothing else',
    'Every day: one squat or hinge, one press, one row, plus focused accessories',
    'Rows run a set ahead of presses all block — balance without a pull-up bar',
    'Reps climb inside each range first, then the next dumbbell up',
    'Week 4 is a planned lighter week; week 8 is a deload',
  ],
  progression:
    'Double progression built for fixed dumbbell jumps: earn the top of the ' +
    'rep range on every set, then move up a dumbbell and start again at the ' +
    'bottom. Day leads add a fourth set from week 3, rows climb to five sets ' +
    'for the weeks 6–7 push, and presses join with a fourth set late. Week 4 ' +
    'backs everything off on purpose; week 8 is a true deload.',
  weekMeta: [
    {
      weekNumber: 1,
      label: 'Baseline',
      coachNote: 'Find working weights with 2 clean reps in reserve.',
      intensity: 'Medium',
    },
    {
      weekNumber: 2,
      label: 'Add reps',
      coachNote: 'Same dumbbells, more reps — chase the top of each range.',
      intensity: 'Medium',
    },
    {
      weekNumber: 3,
      label: 'Fourth sets',
      coachNote: 'Day leads gain a set; accessories go to three.',
      intensity: 'Medium',
    },
    {
      weekNumber: 4,
      label: 'Lighter week',
      coachNote: 'Planned back-off — smooth sets, nothing near failure.',
      intensity: 'Easy',
    },
    {
      weekNumber: 5,
      label: 'Build again',
      coachNote: 'Full volume returns, a notch heavier than week 3.',
      intensity: 'Medium',
    },
    {
      weekNumber: 6,
      label: 'The push begins',
      coachNote: 'Rows hit five sets, presses four — biggest weeks start now.',
      intensity: 'Hard',
    },
    {
      weekNumber: 7,
      label: 'Peak week',
      coachNote: 'Best weights, full volume. Log everything.',
      intensity: 'Hard',
    },
    {
      weekNumber: 8,
      label: 'Deload',
      coachNote:
        'Light and quick. Plan the next block — or run this one heavier.',
      intensity: 'Easy',
    },
  ],
  sessions: [
    {
      key: 'homeA',
      title: 'Home A · Squat + Press',
      focus: 'Quads, chest, upper back, core',
      exercises: homeA,
    },
    {
      key: 'homeB',
      title: 'Home B · Hinge + Row',
      focus: 'Hamstrings, shoulders, upper back',
      exercises: homeB,
    },
    {
      key: 'homeC',
      title: 'Home C · Split Squat + Incline',
      focus: 'Single-leg, upper chest, glutes, arms',
      exercises: homeC,
    },
  ],
};
