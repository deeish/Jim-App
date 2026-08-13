import type {
  PlanTemplate,
  TemplateExercise,
  WeeklyPrescriptions,
} from './types';

/**
 * HYBRID · PUSH/PULL/LEGS — 6 days/week, 8 weeks, gym.
 *
 * Hypertrophy-forward PPL run twice a week with true A/B variant days:
 *   Push A flat-press emphasis   ·  Push B overhead + incline emphasis
 *   Pull A row emphasis          ·  Pull B vertical-pull emphasis
 *   Legs A squat emphasis        ·  Legs B hip-hinge/glute emphasis
 *
 * Rep ranges by role: top compounds 5–8/6–10, secondary compounds 8–12,
 * isolation 10–20. Weekly hard sets per muscle sit in the 10–20 band
 * (chest ~13, back ~16–20, quads ~13, hamstrings ~9 direct + heavy hinges,
 * delts ~6 direct laterals + all pressing, arms ~8–10 each) and pull-day
 * volume stays ahead of push-day volume.
 *
 * Deliberate omission: no conventional deadlift. At 6 days/week the heavy
 * hinge slot goes to hip thrust + RDL — full hip-extension coverage without
 * the axial fatigue a heavy pull adds mid-week. (Want to pull heavy? Run the
 * Strength Upper/Lower template instead.)
 *
 * Progression (double ramp): W1 baseline @RIR 2–3 → W2 add reps → W3 the two
 * lead lifts gain a set → W4 back to baseline sets but heavier → W5 lead
 * lifts gain the set again → W6 heavier still → W7 peak (isolation gains a
 * set, last sets near failure) → W8 true deload (2 sets, light).
 */

/** Lead lift of the day: 4 → 5 sets on build weeks. */
function leadLift(repsMin: number, repsMax: number): WeeklyPrescriptions {
  return [
    {
      sets: 4,
      repsMin,
      repsMax,
      note: 'Week 1: baseline at RIR 2–3. Log your loads.',
    },
    {
      sets: 4,
      repsMin,
      repsMax,
      note: 'Same weight, add a rep per set (RIR 2).',
    },
    { sets: 5, repsMin, repsMax, note: 'Fifth set arrives (RIR 1–2).' },
    {
      sets: 4,
      repsMin,
      repsMax,
      note: 'Back to four sets — but heavier than week 1.',
    },
    {
      sets: 5,
      repsMin,
      repsMax,
      note: 'Five sets again, heavier than week 3.',
    },
    { sets: 5, repsMin, repsMax, note: 'Heaviest week so far (RIR 1–2).' },
    {
      sets: 5,
      repsMin,
      repsMax,
      note: 'Peak week — last set of each lift near failure (RIR 0–1).',
    },
    {
      sets: 2,
      repsMin,
      repsMax,
      note: 'Deload: two light sets at ~60–70% (RIR 4–5).',
    },
  ];
}

/** Second compound: 3 → 4 sets on build weeks. */
function secondLift(repsMin: number, repsMax: number): WeeklyPrescriptions {
  return [
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax },
    { sets: 4, repsMin, repsMax },
    {
      sets: 3,
      repsMin,
      repsMax,
      note: 'Heavier than week 1 at the same sets.',
    },
    { sets: 4, repsMin, repsMax },
    { sets: 4, repsMin, repsMax },
    { sets: 4, repsMin, repsMax },
    { sets: 2, repsMin, repsMax, note: 'Deload — light and easy.' },
  ];
}

/** Mid-session accessory: steady 3 sets all block. */
function steadyAccessory(
  repsMin: number,
  repsMax: number,
): WeeklyPrescriptions {
  return [
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax },
    { sets: 2, repsMin, repsMax, note: 'Deload — light and easy.' },
  ];
}

/** Isolation that earns a 4th set in the peak week. */
function peakingIsolation(
  repsMin: number,
  repsMax: number,
): WeeklyPrescriptions {
  return [
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax },
    {
      sets: 4,
      repsMin,
      repsMax,
      note: 'Peak week: one extra set, last one near failure.',
    },
    { sets: 2, repsMin, repsMax, note: 'Deload — light and easy.' },
  ];
}

/** Small finisher isolation: 2 sets growing to 3 in the second half. */
function finisherIsolation(
  repsMin: number,
  repsMax: number,
): WeeklyPrescriptions {
  return [
    { sets: 2, repsMin, repsMax },
    { sets: 2, repsMin, repsMax },
    { sets: 2, repsMin, repsMax },
    { sets: 2, repsMin, repsMax },
    { sets: 3, repsMin, repsMax, note: 'A third set from here to the peak.' },
    { sets: 3, repsMin, repsMax },
    { sets: 3, repsMin, repsMax },
    { sets: 1, repsMin, repsMax, note: 'Deload — one easy set.' },
  ];
}

/** Calves: 4 steady sets (they recover fast), 2 on deload. */
function calves(repsMin: number, repsMax: number): WeeklyPrescriptions {
  return [
    { sets: 4, repsMin, repsMax },
    { sets: 4, repsMin, repsMax },
    { sets: 4, repsMin, repsMax },
    { sets: 4, repsMin, repsMax },
    { sets: 4, repsMin, repsMax },
    { sets: 4, repsMin, repsMax },
    { sets: 4, repsMin, repsMax },
    { sets: 2, repsMin, repsMax, note: 'Deload.' },
  ];
}

const pushA: TemplateExercise[] = [
  {
    exerciseId: 'flat_barbell_bench_press',
    name: 'Flat Barbell Bench Press',
    prescriptionType: 'reps',
    restSeconds: 150,
    note: 'Lead lift. When every set hits 8, add weight next time.',
    weekly: leadLift(5, 8),
  },
  {
    exerciseId: 'seated_dumbbell_shoulder_press',
    name: 'Seated Dumbbell Shoulder Press',
    prescriptionType: 'reps',
    restSeconds: 120,
    note: 'Full range — dumbbells to ear level, no bounce off the bottom.',
    weekly: secondLift(8, 10),
  },
  {
    exerciseId: 'pec_deck_fly',
    name: 'Pec Deck Fly',
    prescriptionType: 'reps',
    restSeconds: 75,
    note: 'Big stretch, elbows soft; squeeze without shrugging.',
    weekly: steadyAccessory(10, 15),
  },
  {
    exerciseId: 'dumbbell_lateral_raise',
    name: 'Dumbbell Lateral Raise',
    prescriptionType: 'reps',
    restSeconds: 60,
    note: 'Lead with the elbows; stop shy of shoulder height, no swing.',
    weekly: peakingIsolation(12, 15),
  },
  {
    exerciseId: 'rope_cable_pushdown',
    name: 'Rope Cable Pushdown',
    prescriptionType: 'reps',
    restSeconds: 75,
    note: 'Elbows pinned; spread the rope at the bottom.',
    weekly: steadyAccessory(10, 15),
  },
  {
    exerciseId: 'standing_dumbbell_overhead_triceps_extension',
    name: 'Standing Dumbbell Overhead Triceps Extension',
    prescriptionType: 'reps',
    restSeconds: 75,
    note: 'Deep stretch behind the head — long-head work the pushdown misses.',
    weekly: finisherIsolation(10, 12),
  },
];

const pullA: TemplateExercise[] = [
  {
    exerciseId: 'barbell_bent_over_row',
    name: 'Barbell Bent-Over Row',
    prescriptionType: 'reps',
    restSeconds: 150,
    note: 'Lead lift. Torso near-parallel; pull to the lower ribs.',
    weekly: leadLift(6, 10),
  },
  {
    exerciseId: 'lat_pulldown_wide',
    name: 'Wide-Grip Lat Pulldown',
    prescriptionType: 'reps',
    restSeconds: 120,
    note: 'Elbows down and back; control the way up.',
    weekly: secondLift(8, 12),
  },
  {
    exerciseId: 'chest_supported_dumbbell_row',
    name: 'Chest-Supported Dumbbell Row',
    prescriptionType: 'reps',
    restSeconds: 90,
    note: 'Chest stays glued to the pad — pure upper back, zero momentum.',
    weekly: steadyAccessory(10, 12),
  },
  {
    exerciseId: 'face_pull',
    name: 'Face Pull',
    prescriptionType: 'reps',
    restSeconds: 60,
    note: 'Thumbs back at the ears; rear delts and rotator cuff.',
    weekly: peakingIsolation(12, 15),
  },
  {
    exerciseId: 'standing_barbell_curl',
    name: 'Standing Barbell Curl',
    prescriptionType: 'reps',
    restSeconds: 75,
    note: 'Strict; squeeze at the top, lower in control.',
    weekly: steadyAccessory(8, 12),
  },
  {
    exerciseId: 'incline_dumbbell_curl',
    name: 'Incline Dumbbell Curl',
    prescriptionType: 'reps',
    restSeconds: 60,
    note: 'Arms hang behind you — full stretch on the long head.',
    weekly: finisherIsolation(10, 15),
  },
];

const legsA: TemplateExercise[] = [
  {
    exerciseId: 'back_squat',
    name: 'Back Squat',
    prescriptionType: 'reps',
    restSeconds: 180,
    note: 'Lead lift. Brace, hit depth, drive — quality over load.',
    weekly: leadLift(5, 8),
  },
  {
    exerciseId: 'barbell_romanian_deadlift',
    name: 'Barbell Romanian Deadlift',
    prescriptionType: 'reps',
    restSeconds: 150,
    note: 'Hips back, lats on; the hamstring stretch is the rep.',
    weekly: secondLift(8, 10),
  },
  {
    exerciseId: 'forty_five_degree_leg_press',
    name: '45-Degree Leg Press',
    prescriptionType: 'reps',
    restSeconds: 120,
    note: 'Quad volume without more spinal load. Deep, controlled.',
    weekly: steadyAccessory(10, 12),
  },
  {
    exerciseId: 'lying_leg_curl',
    name: 'Lying Leg Curl',
    prescriptionType: 'reps',
    restSeconds: 75,
    note: 'Slow lowering half; hips stay down.',
    weekly: peakingIsolation(10, 15),
  },
  {
    exerciseId: 'standing_calf_raise_machine',
    name: 'Standing Calf Raise Machine',
    prescriptionType: 'reps',
    restSeconds: 60,
    note: 'Pause at the stretch, drive to full tiptoe.',
    weekly: calves(10, 15),
  },
  {
    exerciseId: 'kneeling_cable_crunch',
    name: 'Kneeling Cable Crunch',
    prescriptionType: 'reps',
    restSeconds: 60,
    note: 'Flex the spine — crunch ribs to hips, hips stay still.',
    weekly: steadyAccessory(10, 15),
  },
];

const pushB: TemplateExercise[] = [
  {
    exerciseId: 'barbell_overhead_press',
    name: 'Barbell Overhead Press',
    prescriptionType: 'reps',
    restSeconds: 150,
    note: 'Lead lift. Glutes tight, ribs down, bar over mid-foot at lockout.',
    weekly: leadLift(5, 8),
  },
  {
    exerciseId: 'incline_dumbbell_bench_press',
    name: 'Incline Dumbbell Bench Press',
    prescriptionType: 'reps',
    restSeconds: 120,
    note: 'Upper chest emphasis the flat day misses.',
    weekly: secondLift(8, 10),
  },
  {
    exerciseId: 'chest_dip',
    name: 'Chest Dip',
    prescriptionType: 'reps',
    restSeconds: 90,
    note: 'Slight forward lean. Add weight when 12 is smooth; band-assist if needed.',
    weekly: steadyAccessory(8, 12),
  },
  {
    exerciseId: 'cable_lateral_raise',
    name: 'Cable Lateral Raise',
    prescriptionType: 'reps',
    restSeconds: 60,
    note: 'Constant tension from the cable — smooth reps, no body English.',
    weekly: peakingIsolation(12, 20),
  },
  {
    exerciseId: 'lying_ez_bar_triceps_extension',
    name: 'Lying EZ-Bar Triceps Extension',
    prescriptionType: 'reps',
    restSeconds: 75,
    note: 'Lower to the forehead; elbows narrow.',
    weekly: steadyAccessory(10, 12),
  },
];

const pullB: TemplateExercise[] = [
  {
    exerciseId: 'pull_up_pronated',
    name: 'Pull-Up',
    prescriptionType: 'reps',
    restSeconds: 150,
    note: 'Lead lift. Under 6? Band-assist. All sets at 10? Add weight.',
    weekly: leadLift(6, 10),
  },
  {
    exerciseId: 'seated_cable_row_close_neutral',
    name: 'Close-Grip Seated Cable Row',
    prescriptionType: 'reps',
    restSeconds: 120,
    note: 'Tall chest; pull to the sternum, squeeze a beat.',
    weekly: secondLift(8, 12),
  },
  {
    exerciseId: 'reverse_pec_deck',
    name: 'Reverse Pec Deck',
    prescriptionType: 'reps',
    restSeconds: 60,
    note: 'Arms long, lead with the pinkies — rear delts.',
    weekly: peakingIsolation(12, 15),
  },
  {
    exerciseId: 'dumbbell_shrug',
    name: 'Dumbbell Shrug',
    prescriptionType: 'reps',
    restSeconds: 60,
    note: 'Straight up, one-second pause at the top.',
    weekly: steadyAccessory(10, 15),
  },
  {
    exerciseId: 'dumbbell_hammer_curl',
    name: 'Dumbbell Hammer Curl',
    prescriptionType: 'reps',
    restSeconds: 75,
    note: 'Neutral grip — brachialis and forearms alongside the biceps.',
    weekly: steadyAccessory(10, 12),
  },
  {
    exerciseId: 'preacher_ez_bar_curl',
    name: 'Preacher EZ-Bar Curl',
    prescriptionType: 'reps',
    restSeconds: 60,
    note: 'No cheating off the pad; full stretch at the bottom.',
    weekly: finisherIsolation(10, 15),
  },
];

const legsB: TemplateExercise[] = [
  {
    exerciseId: 'barbell_hip_thrust',
    name: 'Barbell Hip Thrust',
    prescriptionType: 'reps',
    restSeconds: 150,
    note: 'Lead lift. Chin tucked, ribs down, one-second squeeze at lockout.',
    weekly: leadLift(8, 12),
  },
  {
    exerciseId: 'dumbbell_bulgarian_split_squat',
    name: 'Dumbbell Bulgarian Split Squat',
    prescriptionType: 'reps',
    restSeconds: 120,
    note: 'Reps per leg. Slight forward lean hits glutes; stay tall for quads.',
    weekly: secondLift(8, 12),
  },
  {
    exerciseId: 'seated_leg_curl',
    name: 'Seated Leg Curl',
    prescriptionType: 'reps',
    restSeconds: 75,
    note: 'Seated angle biases the hamstrings at long length — pairs with Legs A’s lying curl.',
    weekly: peakingIsolation(10, 15),
  },
  {
    exerciseId: 'seated_leg_extension',
    name: 'Seated Leg Extension',
    prescriptionType: 'reps',
    restSeconds: 60,
    note: 'Squeeze to full lockout; control the descent.',
    weekly: steadyAccessory(12, 15),
  },
  {
    exerciseId: 'seated_calf_raise_machine',
    name: 'Seated Calf Raise Machine',
    prescriptionType: 'reps',
    restSeconds: 60,
    note: 'Seated hits the soleus — the muscle Legs A’s standing raise misses.',
    weekly: calves(12, 20),
  },
  {
    exerciseId: 'hanging_knee_raise',
    name: 'Hanging Knee Raise',
    prescriptionType: 'reps',
    restSeconds: 60,
    note: 'Curl the pelvis, no swing. Straighten the legs to progress.',
    weekly: steadyAccessory(10, 15),
  },
];

export const HYBRID_PPL: PlanTemplate = {
  id: 'hybrid-ppl',
  name: 'Hybrid · Push/Pull/Legs',
  tagline:
    'Six days, PPL twice over, with A/B variant days and a real volume ramp.',
  goal: 'hybrid',
  goalId: 'balanced',
  split: 'Push / Pull / Legs',
  splitId: 'ppl',
  programTemplateId: 'ppl',
  daysPerWeek: 6,
  // 3–5 days: the P→P→L rotation rolls across weeks (each session still runs
  // its full 8-week progression; frequency per muscle scales with the count).
  // Below 3 a PPL split leaves each muscle ~10 days apart — run Full Body then.
  supportedDaysPerWeek: { min: 3, max: 6 },
  weeksCount: 8,
  experienceLevel: 'intermediate',
  defaultWeekdays: [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ],
  muscleFocus: ['Chest', 'Back', 'Legs', 'Arms', 'Delts'],
  summary: [
    'PPL twice a week with true A/B days: flat vs overhead push, row vs pull-up',
    '10–20 hard sets per muscle per week, pull volume kept ahead of push',
    'Compounds 5–10 reps, accessories 8–15, isolation 10–20',
    'Volume ramps weeks 1–7 (sets are added on schedule), week 8 is a deload',
    'No heavy deadlift by design — hip thrust + RDL cover the hinge at 6 days/week',
  ],
  progression:
    'A double ramp: weeks 1–3 add reps then a set on the two lead lifts, ' +
    'week 4 consolidates heavier at baseline sets, weeks 5–7 ramp again into ' +
    'a peak where isolation work gains a set and final sets approach failure. ' +
    'Week 8 cuts everything to two light sets — a true deload before the next block.',
  weekMeta: [
    {
      weekNumber: 1,
      label: 'Baseline',
      coachNote: 'Set your working loads at RIR 2–3 and log everything.',
      intensity: 'Medium',
    },
    {
      weekNumber: 2,
      label: 'Add reps',
      coachNote: 'Same loads, one more rep per set (RIR 2).',
      intensity: 'Medium',
    },
    {
      weekNumber: 3,
      label: 'Add a set',
      coachNote: 'Both lead lifts gain a set — first volume step.',
      intensity: 'Hard',
    },
    {
      weekNumber: 4,
      label: 'Consolidate heavier',
      coachNote: 'Back to baseline sets, but heavier than week 1.',
      intensity: 'Medium',
    },
    {
      weekNumber: 5,
      label: 'Second ramp',
      coachNote: 'The extra sets return, heavier than week 3.',
      intensity: 'Hard',
    },
    {
      weekNumber: 6,
      label: 'Heaviest loads',
      coachNote: 'Push the loads with the full volume (RIR 1–2).',
      intensity: 'Hard',
    },
    {
      weekNumber: 7,
      label: 'Peak volume',
      coachNote: 'Isolation gains a set; last sets go near failure.',
      intensity: 'Hard',
    },
    {
      weekNumber: 8,
      label: 'Deload',
      coachNote: 'Two light sets of everything — recover and remeasure.',
      intensity: 'Easy',
    },
  ],
  sessions: [
    {
      key: 'pushA',
      title: 'Push A · Flat Press',
      focus: 'Chest, side delts, triceps',
      exercises: pushA,
    },
    {
      key: 'pullA',
      title: 'Pull A · Rows',
      focus: 'Mid-back, lats, biceps',
      exercises: pullA,
    },
    {
      key: 'legsA',
      title: 'Legs A · Squat',
      focus: 'Quads, hamstrings, calves',
      exercises: legsA,
    },
    {
      key: 'pushB',
      title: 'Push B · Overhead',
      focus: 'Delts, upper chest, triceps',
      exercises: pushB,
    },
    {
      key: 'pullB',
      title: 'Pull B · Pull-Ups',
      focus: 'Lats, rear delts, arms',
      exercises: pullB,
    },
    {
      key: 'legsB',
      title: 'Legs B · Hip Hinge',
      focus: 'Glutes, hamstrings, core',
      exercises: legsB,
    },
  ],
};
