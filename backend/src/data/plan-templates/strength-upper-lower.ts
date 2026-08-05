import type {
  PlanTemplate,
  TemplateExercise,
  WeeklyPrescriptions,
} from './types';

/**
 * STRENGTH · UPPER/LOWER — 4 days/week, 8 weeks, gym.
 *
 * Periodization: two 4-week waves around the four anchor lifts (back squat,
 * bench press, deadlift, overhead press).
 *
 *   Wave 1 (weeks 1–3 + light week 4): VOLUME on 5s.
 *     W1 4×5 @RPE 7 → W2 5×5 @RPE 7.5 → W3 5×5 @RPE 8 (heaviest 5s)
 *     W4 3×5 @RPE 6 (~-10% load, accessories cut) — planned light week.
 *   Wave 2 (weeks 5–7 + deload week 8): INTENSITY on 3s.
 *     W5 5×3 starting above the W3 5-rep load → W6 5×3 heavier @RPE 8
 *     W7 4×2–3 peak doubles/triples @RPE 8.5–9 (accessories trimmed)
 *     W8 2×5 @~60% deload — technique only, sets everywhere cut to 2.
 *
 * Deadlift runs one set lower than the other anchors throughout (axial
 * fatigue), which is standard practice in 4-day U/L strength programs.
 *
 * Balance rules the accessories enforce:
 *  - weekly pulling sets exceed pressing sets (rows/pulldowns/pull-ups/rear
 *    delts vs bench/incline/OHP/close-grip),
 *  - posterior chain has dedicated work on both lower days (RDL, leg curls,
 *    back extensions) plus the deadlift itself,
 *  - upper back / rear delts appear on both upper days (face pull, reverse
 *    pec deck).
 * Accessories run 6–12 reps on double progression: add a rep per week, add
 * load once every set hits the top of the range.
 */

/** Anchor tables: squat / bench / OHP share the same wave; deadlift −1 set. */
const ANCHOR_WAVE: WeeklyPrescriptions = [
  {
    sets: 4,
    repsMin: 5,
    repsMax: 5,
    note: 'Wave 1 begins: 4×5 at RPE 7 — leave 3 clean reps in the tank.',
  },
  {
    sets: 5,
    repsMin: 5,
    repsMax: 5,
    note: 'One more set than last week. Same load as week 1, or a touch more.',
  },
  {
    sets: 5,
    repsMin: 5,
    repsMax: 5,
    note: 'Heaviest 5s of the wave — RPE 8, about 2 reps in reserve.',
  },
  {
    sets: 3,
    repsMin: 5,
    repsMax: 5,
    note: 'Light week: drop ~10% from week 3 and move the bar fast (RPE 6).',
  },
  {
    sets: 5,
    repsMin: 3,
    repsMax: 3,
    note: 'Wave 2 — triples. Start slightly above your heaviest week-3 5-rep load.',
  },
  {
    sets: 5,
    repsMin: 3,
    repsMax: 3,
    note: 'Add a little from week 5. Bar speed stays crisp — RPE 8.',
  },
  {
    sets: 4,
    repsMin: 2,
    repsMax: 3,
    note: 'Peak week: heavy doubles and triples at RPE 8.5–9. Take full rests.',
  },
  {
    sets: 2,
    repsMin: 5,
    repsMax: 5,
    note: 'Deload: ~60% of your best weight. Groove technique and recover.',
  },
];

const DEADLIFT_WAVE: WeeklyPrescriptions = [
  {
    sets: 3,
    repsMin: 5,
    repsMax: 5,
    note: 'Wave 1: 3×5 at RPE 7. Reset your brace on every rep.',
  },
  {
    sets: 4,
    repsMin: 5,
    repsMax: 5,
    note: 'One more set this week — same load or slightly heavier.',
  },
  {
    sets: 4,
    repsMin: 5,
    repsMax: 5,
    note: 'Heaviest 5s of the wave (RPE 8). Keep every rep off a dead stop.',
  },
  {
    sets: 2,
    repsMin: 5,
    repsMax: 5,
    note: 'Light week: ~-10% from week 3, fast and easy (RPE 6).',
  },
  {
    sets: 4,
    repsMin: 3,
    repsMax: 3,
    note: 'Wave 2 — triples, starting above your week-3 5-rep weight.',
  },
  {
    sets: 4,
    repsMin: 3,
    repsMax: 3,
    note: 'Heavier triples at RPE 8. No grinding — stop a rep short.',
  },
  {
    sets: 3,
    repsMin: 2,
    repsMax: 3,
    note: 'Peak: heavy doubles/triples at RPE 8.5–9. Long rests, perfect setup.',
  },
  {
    sets: 2,
    repsMin: 5,
    repsMax: 5,
    note: 'Deload: ~60%. Smooth speed pulls, then done.',
  },
];

/** First secondary compound of the day: builds a 4th set in weeks 2–3. */
function secondaryCompound(
  repsMin: number,
  repsMax: number,
): WeeklyPrescriptions {
  return [
    { sets: 3, repsMin, repsMax },
    { sets: 4, repsMin, repsMax },
    { sets: 4, repsMin, repsMax },
    { sets: 2, repsMin, repsMax, note: 'Light week — two easy sets.' },
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax },
    {
      sets: 2,
      repsMin,
      repsMax,
      note: 'Peak week: accessories trimmed so the heavy lifts get everything.',
    },
    { sets: 2, repsMin, repsMax, note: 'Deload — light and easy.' },
  ];
}

/** Later secondary compound: steady 3 sets (keeps the heavy weeks inside ~75 min). */
function steadySecondary(
  repsMin: number,
  repsMax: number,
): WeeklyPrescriptions {
  return [
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax },
    { sets: 2, repsMin, repsMax, note: 'Light week — two easy sets.' },
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax },
    {
      sets: 2,
      repsMin,
      repsMax,
      note: 'Peak week: accessories trimmed so the heavy lifts get everything.',
    },
    { sets: 2, repsMin, repsMax, note: 'Deload — light and easy.' },
  ];
}

/** Big rows mirror the pressing anchors set-for-set (pull ≥ push each week). */
const BIG_PULL: WeeklyPrescriptions = [
  { sets: 4, repsMin: 6, repsMax: 8 },
  { sets: 4, repsMin: 6, repsMax: 8 },
  { sets: 4, repsMin: 6, repsMax: 8 },
  { sets: 2, repsMin: 6, repsMax: 8, note: 'Light week — two easy sets.' },
  { sets: 4, repsMin: 5, repsMax: 8 },
  { sets: 4, repsMin: 5, repsMax: 8 },
  { sets: 3, repsMin: 5, repsMax: 8 },
  { sets: 2, repsMin: 8, repsMax: 10, note: 'Deload — light, full stretch.' },
];

function isolationWave(repsMin: number, repsMax: number): WeeklyPrescriptions {
  return [
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax },
    { sets: 2, repsMin, repsMax, note: 'Light week — two easy sets.' },
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax },
    {
      sets: 2,
      repsMin,
      repsMax,
      note: 'Peak week — keep it to two quality sets.',
    },
    { sets: 2, repsMin, repsMax, note: 'Deload — light and easy.' },
  ];
}

const PLANK_WAVE: WeeklyPrescriptions = [
  { sets: 3, durationSeconds: 45 },
  { sets: 3, durationSeconds: 45 },
  { sets: 3, durationSeconds: 60 },
  { sets: 2, durationSeconds: 45, note: 'Light week.' },
  { sets: 3, durationSeconds: 60 },
  { sets: 3, durationSeconds: 60 },
  { sets: 2, durationSeconds: 60 },
  { sets: 2, durationSeconds: 45, note: 'Deload.' },
];

const upperA: TemplateExercise[] = [
  {
    exerciseId: 'flat_barbell_bench_press',
    name: 'Flat Barbell Bench Press',
    prescriptionType: 'reps',
    restSeconds: 210,
    note: 'Anchor lift. Feet planted, shoulder blades pinned, controlled touch.',
    weekly: ANCHOR_WAVE,
  },
  {
    exerciseId: 'barbell_bent_over_row',
    name: 'Barbell Bent-Over Row',
    prescriptionType: 'reps',
    restSeconds: 150,
    note: 'Match your bench effort set-for-set. Torso near-parallel, no heaving.',
    weekly: BIG_PULL,
  },
  {
    exerciseId: 'incline_dumbbell_bench_press',
    name: 'Incline Dumbbell Bench Press',
    prescriptionType: 'reps',
    restSeconds: 120,
    note: 'Add a rep each week; when every set hits 10, add weight.',
    weekly: steadySecondary(8, 10),
  },
  {
    exerciseId: 'lat_pulldown_wide',
    name: 'Wide-Grip Lat Pulldown',
    prescriptionType: 'reps',
    restSeconds: 120,
    note: 'Drive elbows down and back; pause at the chest.',
    weekly: secondaryCompound(8, 10),
  },
  {
    exerciseId: 'face_pull',
    name: 'Face Pull',
    prescriptionType: 'reps',
    restSeconds: 90,
    note: 'Pull to the bridge of your nose, thumbs back — rear delts and upper back.',
    weekly: isolationWave(12, 15),
  },
  {
    exerciseId: 'standing_barbell_curl',
    name: 'Standing Barbell Curl',
    prescriptionType: 'reps',
    restSeconds: 90,
    note: 'Strict form; elbows stay by your sides.',
    weekly: isolationWave(8, 12),
  },
];

const lowerA: TemplateExercise[] = [
  {
    exerciseId: 'back_squat',
    name: 'Back Squat',
    prescriptionType: 'reps',
    restSeconds: 210,
    note: 'Anchor lift. Brace hard, hit depth, drive up evenly.',
    weekly: ANCHOR_WAVE,
  },
  {
    exerciseId: 'barbell_romanian_deadlift',
    name: 'Barbell Romanian Deadlift',
    prescriptionType: 'reps',
    restSeconds: 150,
    note: 'Push hips back until hamstrings load; bar stays on the thighs.',
    weekly: secondaryCompound(8, 10),
  },
  {
    exerciseId: 'forty_five_degree_leg_press',
    name: '45-Degree Leg Press',
    prescriptionType: 'reps',
    restSeconds: 120,
    note: 'Full controlled depth without the low back rounding off the pad.',
    weekly: steadySecondary(10, 12),
  },
  {
    exerciseId: 'lying_leg_curl',
    name: 'Lying Leg Curl',
    prescriptionType: 'reps',
    restSeconds: 90,
    note: 'Control the lowering half — no bouncing at the stretch.',
    weekly: isolationWave(10, 12),
  },
  {
    exerciseId: 'standing_calf_raise_machine',
    name: 'Standing Calf Raise Machine',
    prescriptionType: 'reps',
    restSeconds: 90,
    note: 'Pause one second at the bottom stretch and at the top.',
    weekly: isolationWave(8, 12),
  },
  {
    exerciseId: 'front_plank',
    name: 'Front Plank',
    prescriptionType: 'time',
    restSeconds: 60,
    note: 'Squeeze glutes, ribs down. Add time before adding difficulty.',
    weekly: PLANK_WAVE,
  },
];

const upperB: TemplateExercise[] = [
  {
    exerciseId: 'barbell_overhead_press',
    name: 'Barbell Overhead Press',
    prescriptionType: 'reps',
    restSeconds: 210,
    note: 'Anchor lift. Squeeze glutes, press slightly back, lock out overhead.',
    weekly: ANCHOR_WAVE,
  },
  {
    exerciseId: 'pull_up_pronated',
    name: 'Pull-Up',
    prescriptionType: 'reps',
    restSeconds: 150,
    note: 'Under 6 reps? Use band assistance. All sets at 10? Add weight.',
    weekly: [
      { sets: 4, repsMin: 6, repsMax: 10 },
      { sets: 4, repsMin: 6, repsMax: 10 },
      { sets: 4, repsMin: 6, repsMax: 10 },
      { sets: 2, repsMin: 6, repsMax: 10, note: 'Light week — two easy sets.' },
      { sets: 4, repsMin: 6, repsMax: 10 },
      { sets: 4, repsMin: 6, repsMax: 10 },
      { sets: 3, repsMin: 6, repsMax: 10 },
      {
        sets: 2,
        repsMin: 6,
        repsMax: 10,
        note: 'Deload — smooth, no failure.',
      },
    ],
  },
  {
    exerciseId: 'close_grip_bench_press',
    name: 'Close-Grip Bench Press',
    prescriptionType: 'reps',
    restSeconds: 120,
    note: 'Hands just inside shoulder width; elbows tucked. Feeds your bench and press.',
    weekly: steadySecondary(6, 10),
  },
  {
    exerciseId: 'seated_cable_row_close_neutral',
    name: 'Close-Grip Seated Cable Row',
    prescriptionType: 'reps',
    restSeconds: 120,
    note: 'Chest tall; pull to the sternum and squeeze the mid-back.',
    weekly: secondaryCompound(8, 10),
  },
  {
    exerciseId: 'reverse_pec_deck',
    name: 'Reverse Pec Deck',
    prescriptionType: 'reps',
    restSeconds: 90,
    note: 'Lead with the pinkies, arms long — rear delts, not traps.',
    weekly: isolationWave(12, 15),
  },
  {
    exerciseId: 'lying_ez_bar_triceps_extension',
    name: 'Lying EZ-Bar Triceps Extension',
    prescriptionType: 'reps',
    restSeconds: 90,
    note: 'Lower to the forehead under control; elbows stay narrow.',
    weekly: isolationWave(10, 12),
  },
];

const lowerB: TemplateExercise[] = [
  {
    exerciseId: 'conventional_deadlift',
    name: 'Conventional Deadlift',
    prescriptionType: 'reps',
    restSeconds: 240,
    note: 'Anchor lift. Wedge in, pull the slack out, push the floor away.',
    weekly: DEADLIFT_WAVE,
  },
  {
    exerciseId: 'front_squat',
    name: 'Front Squat',
    prescriptionType: 'reps',
    restSeconds: 150,
    note: 'Elbows high, torso tall. Lighter than your back squat — quads and upper back.',
    weekly: secondaryCompound(6, 8),
  },
  {
    exerciseId: 'dumbbell_bulgarian_split_squat',
    name: 'Dumbbell Bulgarian Split Squat',
    prescriptionType: 'reps',
    restSeconds: 120,
    note: 'Reps are per leg. Front shin vertical, knee tracking the toes.',
    weekly: steadySecondary(8, 10),
  },
  {
    exerciseId: 'seated_leg_curl',
    name: 'Seated Leg Curl',
    prescriptionType: 'reps',
    restSeconds: 90,
    note: 'Squeeze hard at the bottom; slow return.',
    weekly: isolationWave(10, 12),
  },
  {
    exerciseId: 'hyperextension_back_extension',
    name: 'Back Extension',
    prescriptionType: 'reps',
    restSeconds: 90,
    note: 'Squeeze glutes at the top. Hold a plate once 15 feels easy.',
    weekly: isolationWave(10, 15),
  },
  {
    exerciseId: 'hanging_knee_raise',
    name: 'Hanging Knee Raise',
    prescriptionType: 'reps',
    restSeconds: 60,
    note: 'Curl the pelvis up — no swinging. Straighten the legs to progress.',
    weekly: isolationWave(10, 15),
  },
];

export const STRENGTH_UPPER_LOWER: PlanTemplate = {
  id: 'strength-upper-lower',
  name: 'Strength · Upper/Lower',
  tagline: 'Two 4-week waves built around squat, bench, deadlift and press.',
  goal: 'strength',
  goalId: 'strength',
  split: 'Upper / Lower',
  splitId: 'upper_lower',
  programTemplateId: 'upper-lower-4',
  daysPerWeek: 4,
  weeksCount: 8,
  experienceLevel: 'intermediate',
  defaultWeekdays: ['Monday', 'Tuesday', 'Thursday', 'Friday'],
  muscleFocus: ['Squat', 'Bench', 'Deadlift', 'Press'],
  summary: [
    'Four anchor lifts, each trained once a week with a dedicated focus day',
    'Wave 1 (weeks 1–4): build volume on sets of 5, week 4 planned light',
    'Wave 2 (weeks 5–8): heavier triples into a week-7 peak, week 8 deload',
    'More weekly pulling than pressing, posterior chain on both lower days',
    'Accessories in 6–12 on double progression: reps first, then load',
  ],
  progression:
    'Weeks 1–3 build volume on 5s (4×5 → 5×5, RPE 7 → 8), week 4 backs off. ' +
    'Weeks 5–7 switch to heavier triples and peak with doubles at RPE 8.5–9, ' +
    'then week 8 is a true deload at ~60%. Accessories climb reps within ' +
    '6–12 and add weight when the top of the range is reached on every set.',
  weekMeta: [
    {
      weekNumber: 1,
      label: 'Wave 1 · 5s begin',
      coachNote: 'Establish working weights at RPE 7 — solid, unhurried 5s.',
      intensity: 'Medium',
    },
    {
      weekNumber: 2,
      label: 'Wave 1 · add a set',
      coachNote: 'Anchors gain a fifth set; accessories add a rep.',
      intensity: 'Medium',
    },
    {
      weekNumber: 3,
      label: 'Wave 1 · heaviest 5s',
      coachNote: 'Top of the volume wave — heaviest 5s at RPE 8.',
      intensity: 'Hard',
    },
    {
      weekNumber: 4,
      label: 'Light week',
      coachNote: 'Planned back-off: ~-10% load, reduced sets, leave fresh.',
      intensity: 'Easy',
    },
    {
      weekNumber: 5,
      label: 'Wave 2 · triples',
      coachNote: 'Intensity wave starts — 5×3 above your best 5-rep loads.',
      intensity: 'Hard',
    },
    {
      weekNumber: 6,
      label: 'Wave 2 · heavier triples',
      coachNote: 'Add load on the anchors while bar speed stays crisp.',
      intensity: 'Hard',
    },
    {
      weekNumber: 7,
      label: 'Peak · heavy 2–3s',
      coachNote: 'Heaviest week: doubles and triples, accessories trimmed.',
      intensity: 'Hard',
    },
    {
      weekNumber: 8,
      label: 'Deload',
      coachNote:
        'Everything light and easy — bank the recovery, test next block.',
      intensity: 'Easy',
    },
  ],
  sessions: [
    {
      key: 'upperA',
      title: 'Upper A · Bench + Row',
      focus: 'Chest, upper back, biceps',
      exercises: upperA,
    },
    {
      key: 'lowerA',
      title: 'Lower A · Squat',
      focus: 'Quads, hamstrings, core',
      exercises: lowerA,
    },
    {
      key: 'upperB',
      title: 'Upper B · Press + Pull-Up',
      focus: 'Shoulders, lats, triceps',
      exercises: upperB,
    },
    {
      key: 'lowerB',
      title: 'Lower B · Deadlift',
      focus: 'Posterior chain, single-leg',
      exercises: lowerB,
    },
  ],
};
