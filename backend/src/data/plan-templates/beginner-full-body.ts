import type {
  PlanTemplate,
  TemplateExercise,
  WeeklyPrescriptions,
} from './types';

/**
 * BEGINNER · FULL BODY — 3 days/week, 8 weeks, gym.
 *
 * A first barbell program: three full-body days built around the anchor
 * lifts, one pattern at a time. Every session is one squat pattern, one
 * press, one pull, plus simple accessory work — the classic novice
 * linear-progression shape, written out so the app can coach it week by
 * week. Loads start deliberately light (week 1 is for learning), and the
 * engine of progress is "add a little weight whenever every set is clean",
 * repeated for eight weeks.
 *
 * Day structure:
 *   A — Back squat + bench + barbell row (the Monday classics)
 *   B — Deadlift + overhead press + pulldown (hinge day)
 *   C — Goblet squat + dumbbell bench + single-arm row (dumbbell skills)
 *
 * Balance: every press has a same-set pull partner in the same session
 * (bench↔row, press↔pulldown, DB bench↔DB row), so weekly pulling never
 * falls behind pressing. Posterior chain appears on B (deadlift) and C
 * (RDL); core is trained as anti-extension (plank), hip flexion (knee
 * raise) and loaded carry — one honest pattern per day.
 *
 * Progression: sets 3×5 on the barbell lifts with weight added between
 * sessions, not extra volume. Week 4 is a planned technique week (lighter,
 * 2 sets) so form consolidates before loads climb again; week 7 adds a set
 * to the two squat-day leads as a small peak; week 8 is a deload and a
 * look back at eight weeks of PRs.
 */

/** Squat-day lead lifts (back squat, goblet squat): 3×5-style with a W7 peak set. */
function beginnerLead(repsMin: number, repsMax: number): WeeklyPrescriptions {
  return [
    {
      sets: 3,
      repsMin,
      repsMax,
      note: 'Week 1 is for learning: start lighter than feels impressive.',
    },
    {
      sets: 3,
      repsMin,
      repsMax,
      note: 'Add 5 lb from last time if every set was clean.',
    },
    {
      sets: 3,
      repsMin,
      repsMax,
      note: 'Keep adding a little each session — form first, always.',
    },
    {
      sets: 2,
      repsMin,
      repsMax,
      note: 'Technique week: drop ~10% and make every rep look identical.',
    },
    {
      sets: 3,
      repsMin,
      repsMax,
      note: 'Back to building — pick up where week 3 left off.',
    },
    {
      sets: 3,
      repsMin,
      repsMax,
      note: 'Heavier again. If a set breaks down, repeat the weight next time.',
    },
    {
      sets: 4,
      repsMin,
      repsMax,
      note: 'Strongest week: one extra set at your best clean weight.',
    },
    {
      sets: 2,
      repsMin,
      repsMax,
      note: 'Deload: ~60% of your best. Notice how light week 1 feels now.',
    },
  ];
}

/**
 * Press/pull pairs share this table so pulling always matches pressing
 * set-for-set (the pair partner is the row/pulldown in the same session).
 */
function pressPullPair(repsMin: number, repsMax: number): WeeklyPrescriptions {
  return [
    {
      sets: 3,
      repsMin,
      repsMax,
      note: 'Start light and own the bar path.',
    },
    { sets: 3, repsMin, repsMax, note: 'Add a little if every set was clean.' },
    { sets: 3, repsMin, repsMax },
    {
      sets: 2,
      repsMin,
      repsMax,
      note: 'Technique week — lighter, two crisp sets.',
    },
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax, note: 'Best clean weight of the block.' },
    { sets: 2, repsMin, repsMax, note: 'Deload — light and easy.' },
  ];
}

/** Deadlift ramps from one learning set to honest work sets. */
const BEGINNER_DEADLIFT: WeeklyPrescriptions = [
  {
    sets: 1,
    repsMin: 5,
    repsMax: 5,
    note: 'One perfect set of five. Reset your brace before every rep.',
  },
  {
    sets: 2,
    repsMin: 5,
    repsMax: 5,
    note: 'Two sets now. Add weight only when all reps start from a dead stop.',
  },
  { sets: 2, repsMin: 5, repsMax: 5 },
  {
    sets: 1,
    repsMin: 5,
    repsMax: 5,
    note: 'Technique week: one light, fast set.',
  },
  { sets: 2, repsMin: 5, repsMax: 5 },
  { sets: 2, repsMin: 5, repsMax: 5 },
  {
    sets: 3,
    repsMin: 5,
    repsMax: 5,
    note: 'Strongest week: three work sets at your best clean weight.',
  },
  { sets: 1, repsMin: 5, repsMax: 5, note: 'Deload: one smooth, light set.' },
];

/** Accessories: 2 sets growing to 3 once the main lifts are grooved. */
function beginnerAccessory(
  repsMin: number,
  repsMax: number,
): WeeklyPrescriptions {
  return [
    { sets: 2, repsMin, repsMax },
    { sets: 2, repsMin, repsMax },
    { sets: 3, repsMin, repsMax, note: 'A third set from here on.' },
    { sets: 2, repsMin, repsMax, note: 'Technique week — two easy sets.' },
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax },
    { sets: 1, repsMin, repsMax, note: 'Deload — one easy set.' },
  ];
}

const BEGINNER_PLANK: WeeklyPrescriptions = [
  {
    sets: 2,
    durationSeconds: 30,
    note: 'Squeeze glutes, ribs down — a plank is a hold, not a sag.',
  },
  { sets: 2, durationSeconds: 30 },
  { sets: 3, durationSeconds: 30, note: 'A third hold from here on.' },
  { sets: 2, durationSeconds: 30, note: 'Technique week.' },
  { sets: 3, durationSeconds: 40 },
  { sets: 3, durationSeconds: 40 },
  { sets: 3, durationSeconds: 45, note: 'Longest holds of the block.' },
  { sets: 1, durationSeconds: 30, note: 'Deload — one easy hold.' },
];

const BEGINNER_CARRY: WeeklyPrescriptions = [
  {
    sets: 2,
    durationSeconds: 30,
    note: 'Heavy enough to feel, light enough to walk tall.',
  },
  { sets: 2, durationSeconds: 30 },
  { sets: 3, durationSeconds: 30, note: 'A third carry from here on.' },
  { sets: 2, durationSeconds: 30, note: 'Technique week.' },
  { sets: 3, durationSeconds: 40 },
  { sets: 3, durationSeconds: 40 },
  { sets: 3, durationSeconds: 45, note: 'Longest carries of the block.' },
  { sets: 1, durationSeconds: 30, note: 'Deload — one easy carry.' },
];

const fullA: TemplateExercise[] = [
  {
    exerciseId: 'back_squat',
    name: 'Back Squat',
    prescriptionType: 'reps',
    restSeconds: 180,
    note: 'The lift of the day. Brace, sit between your heels, stand up strong.',
    weekly: beginnerLead(5, 5),
  },
  {
    exerciseId: 'flat_barbell_bench_press',
    name: 'Flat Barbell Bench Press',
    prescriptionType: 'reps',
    restSeconds: 150,
    note: 'Feet planted, shoulder blades pinned. Touch, pause a beat, press.',
    weekly: pressPullPair(5, 5),
  },
  {
    exerciseId: 'barbell_bent_over_row',
    name: 'Barbell Bent-Over Row',
    prescriptionType: 'reps',
    restSeconds: 150,
    note: 'The bench’s partner — match it set for set. Pull to the lower ribs.',
    weekly: pressPullPair(6, 8),
  },
  {
    exerciseId: 'front_plank',
    name: 'Front Plank',
    prescriptionType: 'time',
    restSeconds: 60,
    note: 'One straight line from head to heels. Add time before difficulty.',
    weekly: BEGINNER_PLANK,
  },
  {
    exerciseId: 'standing_barbell_curl',
    name: 'Standing Barbell Curl',
    prescriptionType: 'reps',
    restSeconds: 60,
    note: 'Strict and light — elbows by your sides, no swing.',
    weekly: beginnerAccessory(8, 12),
  },
];

const fullB: TemplateExercise[] = [
  {
    exerciseId: 'conventional_deadlift',
    name: 'Conventional Deadlift',
    prescriptionType: 'reps',
    restSeconds: 210,
    note: 'The lift of the day. Wedge in, pull the slack out, push the floor away.',
    weekly: BEGINNER_DEADLIFT,
  },
  {
    exerciseId: 'barbell_overhead_press',
    name: 'Barbell Overhead Press',
    prescriptionType: 'reps',
    restSeconds: 150,
    note: 'Glutes tight, ribs down; finish with the bar over mid-foot.',
    weekly: pressPullPair(5, 5),
  },
  {
    exerciseId: 'lat_pulldown_wide',
    name: 'Wide-Grip Lat Pulldown',
    prescriptionType: 'reps',
    restSeconds: 120,
    note: 'The press’s partner — match it set for set. Elbows down and back.',
    weekly: pressPullPair(8, 10),
  },
  {
    exerciseId: 'dumbbell_walking_lunge',
    name: 'Dumbbell Walking Lunge',
    prescriptionType: 'reps',
    restSeconds: 90,
    note: 'Reps per leg. Short, controlled steps; stand tall between reps.',
    weekly: beginnerAccessory(8, 10),
  },
  {
    exerciseId: 'hanging_knee_raise',
    name: 'Hanging Knee Raise',
    prescriptionType: 'reps',
    restSeconds: 60,
    note: 'Curl the pelvis up, no swinging. Straighten the legs to progress.',
    weekly: beginnerAccessory(8, 12),
  },
];

const fullC: TemplateExercise[] = [
  {
    exerciseId: 'goblet_squat',
    name: 'Goblet Squat',
    prescriptionType: 'reps',
    restSeconds: 120,
    note: 'The lift of the day. Elbows inside the knees; the squat that teaches the squat.',
    weekly: beginnerLead(8, 10),
  },
  {
    exerciseId: 'flat_dumbbell_bench_press',
    name: 'Flat Dumbbell Bench Press',
    prescriptionType: 'reps',
    restSeconds: 120,
    note: 'Each side works alone — no stronger arm hiding the weaker one.',
    weekly: pressPullPair(8, 10),
  },
  {
    exerciseId: 'single_arm_dumbbell_row',
    name: 'Single-Arm Dumbbell Row',
    prescriptionType: 'reps',
    restSeconds: 90,
    note: 'Reps per arm — the press’s partner, matched set for set. Pull to the hip.',
    weekly: pressPullPair(8, 10),
  },
  {
    exerciseId: 'barbell_romanian_deadlift',
    name: 'Barbell Romanian Deadlift',
    prescriptionType: 'reps',
    restSeconds: 120,
    note: 'Light hinge practice for deadlift day: hips back until the hamstrings load.',
    weekly: beginnerAccessory(8, 10),
  },
  {
    exerciseId: 'farmer_carry',
    name: 'Farmer Carry',
    prescriptionType: 'time',
    restSeconds: 60,
    note: 'Heavy dumbbells, tall posture, quick feet. Grip and brace in one move.',
    weekly: BEGINNER_CARRY,
  },
];

export const BEGINNER_FULL_BODY: PlanTemplate = {
  id: 'beginner-full-body',
  name: 'Beginner · Full Body',
  tagline:
    'Your first eight weeks of barbells: three simple days, add weight when it’s clean.',
  goal: 'strength',
  goalId: 'strength',
  split: 'Full Body',
  splitId: 'full_body',
  programTemplateId: 'full-body-3',
  daysPerWeek: 3,
  // 2 days still works — the A/B/C rotation just spans weeks. Capped at 3:
  // novices squatting and pulling 4×/week outruns recovery and adds nothing.
  supportedDaysPerWeek: { min: 2, max: 3 },
  weeksCount: 8,
  experienceLevel: 'beginner',
  defaultWeekdays: ['Monday', 'Wednesday', 'Friday'],
  muscleFocus: ['Squat', 'Bench', 'Deadlift', 'Full body'],
  summary: [
    'Learn the anchor lifts: squat, bench, deadlift, press — one pattern at a time',
    'Every press has a matching pull in the same session, set for set',
    'Progress by adding a little weight whenever every set is clean',
    'Week 4 is a planned technique week; week 8 is a deload and a look back',
    'Sessions stay under an hour — five movements, no filler',
  ],
  progression:
    'Classic linear progression: the barbell lifts hold 3×5 while the weight ' +
    'climbs a little every session it is earned. Accessories grow from 2 to 3 ' +
    'sets once the main lifts are grooved. Week 4 backs off to consolidate ' +
    'technique, week 7 adds a set to the squat-day leads as a small peak, and ' +
    'week 8 deloads so the next block starts fresh.',
  weekMeta: [
    {
      weekNumber: 1,
      label: 'Learn the lifts',
      coachNote: 'Start lighter than feels impressive — this week is practice.',
      intensity: 'Easy',
    },
    {
      weekNumber: 2,
      label: 'First jumps',
      coachNote: 'Add a little weight to every lift that was clean last week.',
      intensity: 'Medium',
    },
    {
      weekNumber: 3,
      label: 'Accessories grow',
      coachNote:
        'Third sets arrive on the small stuff; keep the bar moving up.',
      intensity: 'Medium',
    },
    {
      weekNumber: 4,
      label: 'Technique week',
      coachNote: 'Planned back-off: ~-10%, two sets, every rep identical.',
      intensity: 'Easy',
    },
    {
      weekNumber: 5,
      label: 'Build again',
      coachNote: 'Pick up where week 3 left off — the bar should feel crisper.',
      intensity: 'Medium',
    },
    {
      weekNumber: 6,
      label: 'Keep climbing',
      coachNote: 'Add when it’s clean; repeat the weight when it isn’t.',
      intensity: 'Medium',
    },
    {
      weekNumber: 7,
      label: 'Strongest week',
      coachNote: 'An extra set on the leads at your best weights of the block.',
      intensity: 'Hard',
    },
    {
      weekNumber: 8,
      label: 'Deload + look back',
      coachNote: 'Everything light. Compare week 1’s numbers to week 7’s.',
      intensity: 'Easy',
    },
  ],
  sessions: [
    {
      key: 'fullA',
      title: 'Full Body A · Squat + Bench',
      focus: 'Squat, horizontal push/pull, core',
      exercises: fullA,
    },
    {
      key: 'fullB',
      title: 'Full Body B · Deadlift + Press',
      focus: 'Hinge, vertical push/pull, single-leg',
      exercises: fullB,
    },
    {
      key: 'fullC',
      title: 'Full Body C · Dumbbells + Carry',
      focus: 'Goblet squat, dumbbell push/pull, carry',
      exercises: fullC,
    },
  ],
};
