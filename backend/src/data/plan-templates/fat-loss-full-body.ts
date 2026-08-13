import type {
  PlanTemplate,
  TemplateExercise,
  WeeklyPrescriptions,
} from './types';

/**
 * FAT LOSS · FULL BODY — 3 days/week, 8 weeks, gym.
 *
 * Design for a calorie deficit: keep (or gain) strength with one heavy
 * compound first on every day, get the density work from supersetted
 * accessory pairs on short rests, then finish with 8–12 minutes of hard
 * conditioning. Total weekly volume is deliberately moderate — recovery is
 * scarcer in a deficit, so intensity on the first lift is protected and the
 * "burn" comes from pairing and finishers, not junk sets.
 *
 * Weekly shape:
 *   Day A — squat first, horizontal push/pull pair, lunge + plank, KB-swing finisher
 *   Day B — hinge (RDL) first, vertical push/pull pair, goblet squat + Pallof, rower intervals
 *   Day C — trap-bar deadlift first, incline push/row pair, reverse lunge + carry, battle-rope finisher
 *
 * Progression: reps-then-load on everything (add reps inside the range, then
 * add weight). Heavy compounds gain a 4th set in week 3 and keep it through
 * the second half; weeks 4 and 8 are planned lighter weeks (2 sets across the
 * board, easier finishers) so the deficit stays sustainable.
 */

/** Heavy first movement: 3 sets → 4 from week 3; light on weeks 4/8. */
function heavyCompound(
  repsMin: number,
  repsMax: number,
  buildNote: string,
): WeeklyPrescriptions {
  return [
    {
      sets: 3,
      repsMin,
      repsMax,
      note: `Week 1: find a weight that leaves 2 reps in reserve. ${buildNote}`,
    },
    {
      sets: 3,
      repsMin,
      repsMax,
      note: 'Same weight — aim for one more rep per set.',
    },
    {
      sets: 4,
      repsMin,
      repsMax,
      note: 'A fourth set arrives. Keep 1–2 reps in reserve.',
    },
    {
      sets: 2,
      repsMin,
      repsMax,
      note: 'Lighter week: two smooth sets, ~10% less load. Recovery is the work.',
    },
    {
      sets: 4,
      repsMin,
      repsMax,
      note: 'Back to four sets — add a little weight from week 3.',
    },
    {
      sets: 4,
      repsMin,
      repsMax,
      note: 'Same sets, chase reps at the top of the range.',
    },
    {
      sets: 4,
      repsMin,
      repsMax,
      note: 'Hardest week: top of the range on every set if you can.',
    },
    {
      sets: 2,
      repsMin,
      repsMax,
      note: 'Deload: two light, fast sets. Finish fresh.',
    },
  ];
}

/** First superset pair (push/pull): steady 3 sets, 2 on the lighter weeks. */
function pairedAccessory(
  repsMin: number,
  repsMax: number,
): WeeklyPrescriptions {
  return [
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax },
    { sets: 2, repsMin, repsMax, note: 'Lighter week — two easy sets.' },
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax },
    {
      sets: 3,
      repsMin,
      repsMax,
      note: 'Top of the range on every set if it is there.',
    },
    { sets: 2, repsMin, repsMax, note: 'Deload — light and easy.' },
  ];
}

/** Second superset pair (legs/core): 2 sets to start, 3 once the block builds. */
function pairedAccessoryLight(
  repsMin: number,
  repsMax: number,
): WeeklyPrescriptions {
  return [
    { sets: 2, repsMin, repsMax },
    { sets: 2, repsMin, repsMax },
    { sets: 3, repsMin, repsMax, note: 'A third round from this week.' },
    { sets: 2, repsMin, repsMax, note: 'Lighter week — two easy sets.' },
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax },
    {
      sets: 3,
      repsMin,
      repsMax,
      note: 'Top of the range on every set if it is there.',
    },
    { sets: 2, repsMin, repsMax, note: 'Deload — light and easy.' },
  ];
}

/** Timed core/carry rows inside the second superset (sets track its pair). */
function pairedTimed(
  seconds: [number, number, number, number, number, number, number, number],
): WeeklyPrescriptions {
  return [
    { sets: 2, durationSeconds: seconds[0] },
    { sets: 2, durationSeconds: seconds[1] },
    {
      sets: 3,
      durationSeconds: seconds[2],
      note: 'A third round from this week.',
    },
    { sets: 2, durationSeconds: seconds[3], note: 'Lighter week.' },
    { sets: 3, durationSeconds: seconds[4] },
    { sets: 3, durationSeconds: seconds[5] },
    { sets: 3, durationSeconds: seconds[6] },
    { sets: 2, durationSeconds: seconds[7], note: 'Deload.' },
  ];
}

const dayA: TemplateExercise[] = [
  {
    exerciseId: 'back_squat',
    name: 'Back Squat',
    prescriptionType: 'reps',
    restSeconds: 150,
    note: 'Heavy lift of the day — full rests here, strength stays while you cut.',
    weekly: heavyCompound(6, 8, 'Brace hard and hit honest depth.'),
  },
  {
    exerciseId: 'flat_dumbbell_bench_press',
    name: 'Flat Dumbbell Bench Press',
    prescriptionType: 'reps',
    restSeconds: 75,
    supersetGroup: 'A',
    note: 'Superset with the row: press, go straight to rows, then rest.',
    weekly: pairedAccessory(8, 12),
  },
  {
    exerciseId: 'single_arm_dumbbell_row',
    name: 'Single-Arm Dumbbell Row',
    prescriptionType: 'reps',
    restSeconds: 75,
    supersetGroup: 'A',
    note: 'Reps per arm. Pull to the hip, no torso twist.',
    weekly: pairedAccessory(10, 12),
  },
  {
    exerciseId: 'dumbbell_walking_lunge',
    name: 'Dumbbell Walking Lunge',
    prescriptionType: 'reps',
    restSeconds: 60,
    supersetGroup: 'B',
    note: 'Reps per leg. Superset with the plank; keep steps controlled.',
    weekly: pairedAccessoryLight(10, 12),
  },
  {
    exerciseId: 'front_plank',
    name: 'Front Plank',
    prescriptionType: 'time',
    restSeconds: 60,
    supersetGroup: 'B',
    note: 'Glutes tight, ribs down — finish the pair, then rest.',
    weekly: pairedTimed([30, 35, 40, 30, 40, 45, 45, 30]),
  },
  {
    exerciseId: 'kettlebell_swing',
    name: 'Kettlebell Swing',
    prescriptionType: 'reps',
    restSeconds: 30,
    note: 'Finisher — 15 crisp swings on the minute. Hips snap, arms stay loose.',
    weekly: [
      {
        sets: 4,
        repsMin: 15,
        repsMax: 15,
        note: 'Finisher: 15 swings on the minute, 4 rounds.',
      },
      { sets: 5, repsMin: 15, repsMax: 15, note: 'Five rounds this week.' },
      { sets: 5, repsMin: 15, repsMax: 15 },
      { sets: 4, repsMin: 12, repsMax: 12, note: 'Lighter week: easy pace.' },
      {
        sets: 5,
        repsMin: 20,
        repsMax: 20,
        note: 'Rounds of 20 from here — 100 total swings.',
      },
      { sets: 5, repsMin: 20, repsMax: 20 },
      {
        sets: 6,
        repsMin: 20,
        repsMax: 20,
        note: 'Peak: 120 swings. Crisp hips every rep.',
      },
      { sets: 4, repsMin: 12, repsMax: 12, note: 'Deload: smooth and easy.' },
    ],
  },
];

const dayB: TemplateExercise[] = [
  {
    exerciseId: 'barbell_romanian_deadlift',
    name: 'Barbell Romanian Deadlift',
    prescriptionType: 'reps',
    restSeconds: 150,
    note: 'Heavy hinge of the day. Hips back until the hamstrings load hard.',
    weekly: heavyCompound(8, 10, 'Bar glued to the thighs the whole way.'),
  },
  {
    exerciseId: 'seated_dumbbell_shoulder_press',
    name: 'Seated Dumbbell Shoulder Press',
    prescriptionType: 'reps',
    restSeconds: 75,
    supersetGroup: 'A',
    note: 'Superset with the pulldown: press, pull, then rest.',
    weekly: pairedAccessory(8, 12),
  },
  {
    exerciseId: 'lat_pulldown_wide',
    name: 'Wide-Grip Lat Pulldown',
    prescriptionType: 'reps',
    restSeconds: 75,
    supersetGroup: 'A',
    note: 'Elbows down and back; no leaning into a row.',
    weekly: pairedAccessory(10, 12),
  },
  {
    exerciseId: 'goblet_squat',
    name: 'Goblet Squat',
    prescriptionType: 'reps',
    restSeconds: 60,
    supersetGroup: 'B',
    note: 'Superset with the Pallof press. Elbows inside the knees at the bottom.',
    weekly: pairedAccessoryLight(10, 15),
  },
  {
    exerciseId: 'standing_pallof_press',
    name: 'Standing Pallof Press',
    prescriptionType: 'reps',
    restSeconds: 60,
    supersetGroup: 'B',
    note: 'Reps per side. Press out slow, fight the twist.',
    weekly: pairedAccessoryLight(10, 12),
  },
  {
    exerciseId: 'rowing_machine_intervals',
    name: 'Rowing Machine Intervals',
    prescriptionType: 'time',
    restSeconds: 0,
    note: 'Finisher — 40s hard / 80s easy. Legs drive, arms finish.',
    weekly: [
      {
        sets: 1,
        durationSeconds: 480,
        note: 'Finisher: 8 min of 40s hard / 80s easy.',
      },
      { sets: 1, durationSeconds: 600, note: '10 min this week.' },
      { sets: 1, durationSeconds: 600 },
      {
        sets: 1,
        durationSeconds: 480,
        note: 'Lighter week: all easy pace, Zone 2.',
      },
      { sets: 1, durationSeconds: 600 },
      { sets: 1, durationSeconds: 720, note: 'Peak finisher: 12 min.' },
      { sets: 1, durationSeconds: 720 },
      {
        sets: 1,
        durationSeconds: 480,
        note: 'Deload: easy 8 min, conversational.',
      },
    ],
  },
];

const dayC: TemplateExercise[] = [
  {
    exerciseId: 'trap_bar_deadlift',
    name: 'Trap Bar Deadlift',
    prescriptionType: 'reps',
    restSeconds: 180,
    note: 'Heavy pull of the day — friendlier on the lower back at high frequency.',
    weekly: heavyCompound(
      5,
      8,
      'Push the floor away; hips and shoulders rise together.',
    ),
  },
  {
    exerciseId: 'incline_dumbbell_bench_press',
    name: 'Incline Dumbbell Bench Press',
    prescriptionType: 'reps',
    restSeconds: 75,
    supersetGroup: 'A',
    note: 'Superset with the cable row: press, row, rest.',
    weekly: pairedAccessory(8, 12),
  },
  {
    exerciseId: 'seated_cable_row_close_neutral',
    name: 'Close-Grip Seated Cable Row',
    prescriptionType: 'reps',
    restSeconds: 75,
    supersetGroup: 'A',
    note: 'Chest tall; squeeze the mid-back each rep.',
    weekly: pairedAccessory(10, 12),
  },
  {
    exerciseId: 'dumbbell_reverse_lunge',
    name: 'Dumbbell Reverse Lunge',
    prescriptionType: 'reps',
    restSeconds: 60,
    supersetGroup: 'B',
    note: 'Reps per leg. Superset with the carry; step back, drive through the front heel.',
    weekly: pairedAccessoryLight(10, 12),
  },
  {
    exerciseId: 'farmer_carry',
    name: 'Farmer Carry',
    prescriptionType: 'time',
    restSeconds: 60,
    supersetGroup: 'B',
    note: 'Heavy dumbbells, tall posture, quick feet — finish the pair, then rest.',
    weekly: pairedTimed([40, 40, 45, 30, 45, 50, 50, 30]),
  },
  {
    exerciseId: 'battle_rope_alternating_waves',
    name: 'Battle Rope Alternating Waves',
    prescriptionType: 'time',
    restSeconds: 30,
    note: 'Finisher — all-out waves, then ~30s rest. Hips low, arms fast.',
    weekly: [
      { sets: 5, durationSeconds: 30, note: 'Finisher: 5 hard rounds of 30s.' },
      { sets: 6, durationSeconds: 30, note: 'Six rounds this week.' },
      { sets: 6, durationSeconds: 35 },
      { sets: 4, durationSeconds: 30, note: 'Lighter week: four easy rounds.' },
      { sets: 6, durationSeconds: 35 },
      {
        sets: 6,
        durationSeconds: 40,
        note: 'Longer rounds — stay fast to the buzzer.',
      },
      {
        sets: 6,
        durationSeconds: 45,
        note: 'Peak: six 45s rounds. Empty the tank.',
      },
      { sets: 4, durationSeconds: 30, note: 'Deload: four easy rounds.' },
    ],
  },
];

export const FAT_LOSS_FULL_BODY: PlanTemplate = {
  id: 'fat-loss-full-body',
  name: 'Fat Loss · Full Body',
  tagline:
    'Three full-body days: lift heavy first, supersets for density, finishers for the burn.',
  goal: 'fat loss',
  goalId: 'fat_loss',
  split: 'Full Body',
  splitId: 'full_body',
  programTemplateId: 'full-body-3',
  daysPerWeek: 3,
  // 2 days: still a complete program (rotation covers all three sessions).
  // 4 days: full-body density work in a deficit is already a big ask — cap
  // there; 5+ full-body days with finishers is a recovery hole, not fat loss.
  supportedDaysPerWeek: { min: 2, max: 4 },
  weeksCount: 8,
  experienceLevel: 'intermediate',
  defaultWeekdays: ['Monday', 'Wednesday', 'Friday'],
  muscleFocus: ['Full body', 'Conditioning', 'Core'],
  summary: [
    'One heavy compound opens every session — strength is protected in a deficit',
    'Accessories run as push/pull and legs/core supersets on 60–75s rests',
    'Every day ends with a 6–12 minute finisher: swings, rower or battle ropes',
    'Progression is reps first, then load; compounds add a 4th set from week 3',
    'Weeks 4 and 8 are planned lighter weeks so the deficit stays sustainable',
  ],
  progression:
    'Add reps inside each range, then add load. The first lift of each day ' +
    'builds from 3 to 4 sets by week 3 and holds there while finishers grow ' +
    'from 8 to 12 minutes. Weeks 4 and 8 cut every movement to two lighter ' +
    'sets with easy finishers — planned recovery, not lost weeks.',
  weekMeta: [
    {
      weekNumber: 1,
      label: 'Baseline',
      coachNote:
        'Find working weights with 2 reps in reserve; learn the pairs.',
      intensity: 'Medium',
    },
    {
      weekNumber: 2,
      label: 'Add reps',
      coachNote: 'Same loads, one more rep per set. Finishers grow to 10 min.',
      intensity: 'Medium',
    },
    {
      weekNumber: 3,
      label: 'Add a set',
      coachNote: 'Compounds gain a fourth set — top of the first build.',
      intensity: 'Hard',
    },
    {
      weekNumber: 4,
      label: 'Lighter week',
      coachNote:
        'Two easy sets everywhere, easy finishers. Recover on purpose.',
      intensity: 'Easy',
    },
    {
      weekNumber: 5,
      label: 'Build again',
      coachNote: 'Four sets return, slightly heavier than week 3.',
      intensity: 'Medium',
    },
    {
      weekNumber: 6,
      label: 'Push the ranges',
      coachNote: 'Chase the top of every rep range; finishers hit 12 min.',
      intensity: 'Hard',
    },
    {
      weekNumber: 7,
      label: 'Peak week',
      coachNote: 'Hardest week of the block — full ranges, biggest finishers.',
      intensity: 'Hard',
    },
    {
      weekNumber: 8,
      label: 'Deload',
      coachNote:
        'Light, quick sessions. Weigh in, review, plan the next block.',
      intensity: 'Easy',
    },
  ],
  sessions: [
    {
      key: 'fullA',
      title: 'Full Body A · Squat',
      focus: 'Squat, horizontal push/pull, swings',
      exercises: dayA,
    },
    {
      key: 'fullB',
      title: 'Full Body B · Hinge',
      focus: 'RDL, vertical push/pull, rower',
      exercises: dayB,
    },
    {
      key: 'fullC',
      title: 'Full Body C · Pull + Carry',
      focus: 'Trap-bar, incline push/row, carries',
      exercises: dayC,
    },
  ],
};
