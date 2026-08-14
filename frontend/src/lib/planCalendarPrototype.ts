/**
 * PROTOTYPE — candidate Plan-tab calendar UI (2026-08).
 *
 * Static sample data + date helpers for the Calendar tab prototype:
 * Month grid → Week list (landing) → Day exercise list → Workout detail.
 *
 * Deliberately NOT wired to the backend: the point is to evaluate the UI with
 * realistic, fully-populated data before deciding whether this replaces the
 * Plan tab. Everything here is pure and side-effect free. Delete this file
 * (plus the PlanCalendar* screens and navigator) to remove the prototype.
 */

import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { RootStackParamList } from '../types/navigation';

/**
 * Param list for the prototype stack. Lives here (not in the navigator) so
 * screens can `import type` it without a screens ↔ navigator cycle.
 *
 * The Calendar tab REPLACED the Plan and Train tabs, so the stack also mounts
 * the real plan screens (templates, generate, history, progress, saved-workout
 * detail) — their route names/params are picked straight from the old Plan
 * stack's param list. `PlanList` is deliberately ALIASED to the calendar week
 * view: TemplateDetail and PlanPreview reset to `PlanList` after applying a
 * plan, which now lands on "This Week" showing the freshly applied program.
 */
export type PlanCalendarParamList = {
  /** `monthIso`: any date inside the month to display (default: today's). */
  PlanCalendarMonth: { monthIso?: string } | undefined;
  /** No param = the current week (the tab's landing state). */
  PlanCalendarWeek: { weekMondayIso?: string } | undefined;
  PlanCalendarDay: { dateIso: string };
  /** `exerciseIndex` is the slot in the day (survives a replace); the name is
   *  display-only for the header title. */
  PlanCalendarWorkout: { dateIso: string; exerciseIndex: number; exerciseName: string };
} & Pick<
  RootStackParamList,
  | 'PlanList'
  | 'History'
  | 'Progress'
  | 'Templates'
  | 'TemplateDetail'
  | 'GeneratePlan'
  | 'PlanPreview'
  | 'WorkoutDetail'
  | 'ExerciseDetail'
>;

/**
 * SF Pro on every platform that has it. iOS/macOS render the system font (SF)
 * with no fontFamily at all; this spread only matters on web, where the
 * `-apple-system` stack picks SF on Apple devices and falls back gracefully.
 */
export const sfPro: { fontFamily?: string } = Platform.select({
  web: {
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', 'Segoe UI', Roboto, sans-serif",
  },
  default: {},
}) as { fontFamily?: string };

// ---------------------------------------------------------------------------
// Muscle colour coding
// ---------------------------------------------------------------------------

export type PrototypeMuscle =
  | 'Chest'
  | 'Back'
  | 'Shoulders'
  | 'Biceps'
  | 'Triceps'
  | 'Quads'
  | 'Hamstrings'
  | 'Glutes'
  | 'Calves'
  | 'Core'
  | 'Cardio'
  | 'Forearms';

/**
 * One vibrant hue per muscle — the SINGLE source of truth for every view
 * (week chips, month dots, day blocks, detail accents, replace picker),
 * always used as a SOLID fill. The mapping is the design spec verbatim
 * (chest=salmon red, tris=pure orange, shoulders=light blue, back=lime
 * green, biceps=electric blue, quads=red, glutes=pink, hamstrings=purple,
 * calves=deep orange/coral, core=dark charcoal, cardio=white,
 * forearms=vibrant yellow), with each non-explicit tone pushed vibrant.
 */
export const MUSCLE_COLORS: Record<PrototypeMuscle, string> = {
  Chest: '#FF6F61', // salmon red
  Triceps: '#FF8A00', // pure orange
  Shoulders: '#38B6FF', // light blue
  Back: '#7ED321', // lime green
  Biceps: '#0A6BFF', // electric blue
  Quads: '#FF3B30', // red
  Glutes: '#FF2D92', // pink
  Hamstrings: '#A742F5', // purple
  Calves: '#FF6B35', // deep orange / coral
  Core: '#36454F', // dark charcoal
  Cardio: '#FFFFFF', // white
  Forearms: '#FFD60A', // vibrant yellow
};

/**
 * Text ink on a solid muscle fill. White wherever it holds up; the light
 * fills (light blue, lime, white, yellow) flip to a near-black ink because
 * white on them is unreadable — "make text white if needed", not "always".
 */
export const MUSCLE_INK: Record<PrototypeMuscle, string> = {
  Chest: '#FFFFFF',
  Triceps: '#FFFFFF',
  Shoulders: '#1C1C1E',
  Back: '#1C1C1E',
  Biceps: '#FFFFFF',
  Quads: '#FFFFFF',
  Glutes: '#FFFFFF',
  Hamstrings: '#FFFFFF',
  Calves: '#FFFFFF',
  Core: '#FFFFFF',
  Cardio: '#1C1C1E',
  Forearms: '#1C1C1E',
};

/**
 * Hairline edge for fills that would otherwise vanish into the page — only
 * Cardio's white needs one; everything else stays borderless (transparent).
 * Apply as `borderWidth: 1, borderColor: MUSCLE_EDGE[m]` wherever a solid
 * muscle fill (block, chip, dot) is drawn.
 */
export const MUSCLE_EDGE: Record<PrototypeMuscle, string> = {
  Chest: 'transparent',
  Triceps: 'transparent',
  Shoulders: 'transparent',
  Back: 'transparent',
  Biceps: 'transparent',
  Quads: 'transparent',
  Glutes: 'transparent',
  Hamstrings: 'transparent',
  Calves: 'transparent',
  Core: 'transparent',
  Cardio: '#C6C6C8',
  Forearms: 'transparent',
};

/** Set-complete gold: check button, the completion outline, finished-set cards. */
export const GOLD = '#F5A623';

/** Light tap on each completed set. No-op on web; never throws. */
export function buzzSetComplete(): void {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Success buzz when the whole exercise is finished. */
export function buzzAllSetsComplete(): void {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** The subtle tick iOS segmented controls make on selection change. */
export function buzzSelection(): void {
  if (Platform.OS === 'web') return;
  Haptics.selectionAsync().catch(() => {});
}

// ---------------------------------------------------------------------------
// Sample plan (repeats weekly)
// ---------------------------------------------------------------------------

export type PlannedExercise = {
  name: string;
  muscle: PrototypeMuscle;
  /** Catalog id when known (live plan rows, catalog-picked swaps) — powers
   *  the Exercise Guide link. Sample-split rows have none. */
  exerciseId?: string;
  sets: number;
  /** Display string, e.g. '8–10'. */
  reps: string;
  /** Display string incl. unit, e.g. '155 lb' or 'Bodyweight'. */
  weight: string;
  /** Rest between sets, mm:ss display string. */
  rest: string;
  equipment: string;
  note: string;
};

export type PlannedDay = {
  weekday: string;
  /** 'Push Day', 'Rest Day', … */
  title: string;
  exercises: PlannedExercise[];
};

export const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

/** Monday-first sample split. Wednesday + Sunday rest. */
export const WEEK_PLAN: PlannedDay[] = [
  {
    weekday: 'Monday',
    title: 'Push Day',
    exercises: [
      {
        name: 'Barbell Bench Press',
        muscle: 'Chest',
        sets: 4,
        reps: '6–8',
        weight: '155 lb',
        rest: '2:30',
        equipment: 'Barbell + bench',
        note: 'Touch the bar to your mid-chest and drive your feet into the floor. No bouncing off the chest.',
      },
      {
        name: 'Incline Dumbbell Press',
        muscle: 'Chest',
        sets: 3,
        reps: '8–10',
        weight: '55 lb',
        rest: '2:00',
        equipment: 'Dumbbells + incline bench',
        note: 'Set the bench to about 30 degrees — steeper shifts the work onto your shoulders.',
      },
      {
        name: 'Seated Dumbbell Shoulder Press',
        muscle: 'Shoulders',
        sets: 3,
        reps: '8–10',
        weight: '40 lb',
        rest: '2:00',
        equipment: 'Dumbbells + bench',
        note: 'Lower until your elbows reach shoulder height, then press up without arching your back.',
      },
      {
        name: 'Dumbbell Lateral Raise',
        muscle: 'Shoulders',
        sets: 3,
        reps: '12–15',
        weight: '15 lb',
        rest: '1:30',
        equipment: 'Dumbbells',
        note: 'Lead with your elbows and stop at shoulder height. Lighter and stricter beats heavier and swinging.',
      },
      {
        name: 'Cable Triceps Pushdown',
        muscle: 'Triceps',
        sets: 3,
        reps: '10–12',
        weight: '47.5 lb',
        rest: '1:30',
        equipment: 'Cable machine',
        note: 'Pin your elbows to your sides — only the forearms move.',
      },
      {
        name: 'Overhead Cable Triceps Extension',
        muscle: 'Triceps',
        sets: 2,
        reps: '12–15',
        weight: '35 lb',
        rest: '1:30',
        equipment: 'Cable machine',
        note: 'Get a full stretch behind your head; the long head only works through full range.',
      },
    ],
  },
  {
    weekday: 'Tuesday',
    title: 'Pull Day',
    exercises: [
      {
        name: 'Barbell Row',
        muscle: 'Back',
        sets: 4,
        reps: '6–8',
        weight: '135 lb',
        rest: '2:30',
        equipment: 'Barbell',
        note: 'Hinge to about 45 degrees and pull to your lower ribs. If your torso heaves upright, the bar is too heavy.',
      },
      {
        name: 'Lat Pulldown',
        muscle: 'Back',
        sets: 3,
        reps: '8–10',
        weight: '120 lb',
        rest: '2:00',
        equipment: 'Cable machine',
        note: 'Drive your elbows down and back toward your hips rather than pulling with your hands.',
      },
      {
        name: 'Seated Cable Row',
        muscle: 'Back',
        sets: 3,
        reps: '10–12',
        weight: '130 lb',
        rest: '2:00',
        equipment: 'Cable machine',
        note: 'Squeeze your shoulder blades together at the end of every rep; keep your torso tall.',
      },
      {
        name: 'Face Pull',
        muscle: 'Shoulders',
        sets: 3,
        reps: '12–15',
        weight: '30 lb',
        rest: '1:30',
        equipment: 'Cable machine',
        note: 'Pull the rope to eye level with your thumbs pointing back — this is for your rear delts, not your arms.',
      },
      {
        name: 'Dumbbell Biceps Curl',
        muscle: 'Biceps',
        sets: 3,
        reps: '10–12',
        weight: '30 lb',
        rest: '1:30',
        equipment: 'Dumbbells',
        note: 'Elbows stay at your sides. If you swing to lift it, drop five pounds.',
      },
      {
        name: 'Hammer Curl',
        muscle: 'Biceps',
        sets: 2,
        reps: '12–15',
        weight: '25 lb',
        rest: '1:30',
        equipment: 'Dumbbells',
        note: 'Neutral grip, controlled lowering — this also builds your forearms.',
      },
    ],
  },
  { weekday: 'Wednesday', title: 'Rest Day', exercises: [] },
  {
    weekday: 'Thursday',
    title: 'Leg Day',
    exercises: [
      {
        name: 'Barbell Back Squat',
        muscle: 'Quads',
        sets: 4,
        reps: '5–8',
        weight: '185 lb',
        rest: '3:00',
        equipment: 'Barbell + rack',
        note: 'Big breath and brace before every descent. Depth to parallel, knees tracking over your toes.',
      },
      {
        name: 'Romanian Deadlift',
        muscle: 'Hamstrings',
        sets: 3,
        reps: '8–10',
        weight: '155 lb',
        rest: '2:30',
        equipment: 'Barbell',
        note: 'Push your hips back and keep the bar dragging along your thighs. Stop when your hamstrings say stop.',
      },
      {
        name: 'Leg Press',
        muscle: 'Quads',
        sets: 3,
        reps: '10–12',
        weight: '270 lb',
        rest: '2:00',
        equipment: 'Leg press machine',
        note: 'Lower until your knees reach about 90 degrees; never lock them out hard at the top.',
      },
      {
        name: 'Barbell Hip Thrust',
        muscle: 'Glutes',
        sets: 3,
        reps: '8–10',
        weight: '185 lb',
        rest: '2:00',
        equipment: 'Barbell + bench',
        note: 'Chin tucked, ribs down, and squeeze hard for a full second at lockout.',
      },
      {
        name: 'Seated Leg Curl',
        muscle: 'Hamstrings',
        sets: 3,
        reps: '10–12',
        weight: '90 lb',
        rest: '1:30',
        equipment: 'Leg curl machine',
        note: 'Control the return — the lowering half is where hamstrings grow.',
      },
      {
        name: 'Standing Calf Raise',
        muscle: 'Calves',
        sets: 4,
        reps: '12–15',
        weight: '110 lb',
        rest: '1:00',
        equipment: 'Calf raise machine',
        note: 'Pause two seconds in the bottom stretch of every rep. No bouncing.',
      },
    ],
  },
  {
    weekday: 'Friday',
    title: 'Upper Body',
    exercises: [
      {
        name: 'Incline Barbell Press',
        muscle: 'Chest',
        sets: 4,
        reps: '6–8',
        weight: '135 lb',
        rest: '2:30',
        equipment: 'Barbell + incline bench',
        note: 'Lower to your upper chest with your elbows about 45 degrees from your body.',
      },
      {
        name: 'Weighted Pull-Up',
        muscle: 'Back',
        sets: 3,
        reps: '6–8',
        weight: '+10 lb',
        rest: '2:30',
        equipment: 'Pull-up bar + dip belt',
        note: 'Full hang at the bottom, chin clearly over the bar at the top. Quality over count.',
      },
      {
        name: 'Standing Overhead Press',
        muscle: 'Shoulders',
        sets: 3,
        reps: '6–8',
        weight: '95 lb',
        rest: '2:30',
        equipment: 'Barbell',
        note: 'Squeeze your glutes and keep your ribs down so the press comes from shoulders, not lower back.',
      },
      {
        name: 'Chest-Supported Row',
        muscle: 'Back',
        sets: 3,
        reps: '8–10',
        weight: '50 lb',
        rest: '2:00',
        equipment: 'Dumbbells + incline bench',
        note: 'Chest glued to the pad the whole set — it keeps the momentum out.',
      },
      {
        name: 'EZ-Bar Curl',
        muscle: 'Biceps',
        sets: 2,
        reps: '10–12',
        weight: '50 lb',
        rest: '1:30',
        equipment: 'EZ bar',
        note: 'Three seconds down on every rep.',
      },
      {
        name: 'EZ-Bar Skullcrusher',
        muscle: 'Triceps',
        sets: 2,
        reps: '10–12',
        weight: '40 lb',
        rest: '1:30',
        equipment: 'EZ bar + bench',
        note: 'Lower to your forehead with your upper arms vertical and still.',
      },
      {
        name: "Farmer's Carry",
        muscle: 'Forearms',
        sets: 3,
        reps: '40 yd',
        weight: '70 lb',
        rest: '1:30',
        equipment: 'Dumbbells',
        note: 'Tall posture, crushing grip, small quick steps. Done when your grip is, not before.',
      },
    ],
  },
  {
    weekday: 'Saturday',
    title: 'Lower Body',
    exercises: [
      {
        name: 'Front Squat',
        muscle: 'Quads',
        sets: 3,
        reps: '6–8',
        weight: '135 lb',
        rest: '3:00',
        equipment: 'Barbell + rack',
        note: 'Elbows high, upper back tight. If the bar rolls forward, the set is over.',
      },
      {
        name: 'Bulgarian Split Squat',
        muscle: 'Glutes',
        sets: 3,
        reps: '8–10',
        weight: '30 lb',
        rest: '2:00',
        equipment: 'Dumbbells + bench',
        note: 'Slight forward lean and a long stance put the work in your glutes.',
      },
      {
        name: 'Leg Extension',
        muscle: 'Quads',
        sets: 3,
        reps: '12–15',
        weight: '100 lb',
        rest: '1:30',
        equipment: 'Leg extension machine',
        note: 'Pause a beat at full extension; lower under control.',
      },
      {
        name: 'Lying Leg Curl',
        muscle: 'Hamstrings',
        sets: 3,
        reps: '10–12',
        weight: '80 lb',
        rest: '1:30',
        equipment: 'Leg curl machine',
        note: 'Hips stay pressed into the pad — lifting them turns it into a back exercise.',
      },
      {
        name: 'Cable Crunch',
        muscle: 'Core',
        sets: 3,
        reps: '12–15',
        weight: '60 lb',
        rest: '1:00',
        equipment: 'Cable machine',
        note: 'Flex your spine toward your knees; your hips should not move at all.',
      },
      {
        name: 'Hanging Knee Raise',
        muscle: 'Core',
        sets: 3,
        reps: '10–15',
        weight: 'Bodyweight',
        rest: '1:00',
        equipment: 'Pull-up bar',
        note: 'Tilt your pelvis up at the top of each rep and kill the swing between reps.',
      },
      {
        name: 'Treadmill Intervals',
        muscle: 'Cardio',
        sets: 1,
        reps: '10 min',
        weight: 'Bodyweight',
        rest: '—',
        equipment: 'Treadmill',
        note: '1 minute hard, 1 minute easy, five rounds. Hard should feel like an 8 out of 10.',
      },
    ],
  },
  { weekday: 'Sunday', title: 'Rest Day', exercises: [] },
];

/** Ordered unique muscles trained on a day (chip rows, calendar dots). */
export function dayMuscles(day: PlannedDay): PrototypeMuscle[] {
  const seen = new Set<PrototypeMuscle>();
  const out: PrototypeMuscle[] = [];
  for (const ex of day.exercises) {
    if (!seen.has(ex.muscle)) {
      seen.add(ex.muscle);
      out.push(ex.muscle);
    }
  }
  return out;
}

/** Every muscle the weekly split touches, in first-appearance order (legend). */
export function planMuscles(): PrototypeMuscle[] {
  const seen = new Set<PrototypeMuscle>();
  const out: PrototypeMuscle[] = [];
  for (const day of WEEK_PLAN) {
    for (const m of dayMuscles(day)) {
      if (!seen.has(m)) {
        seen.add(m);
        out.push(m);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Replacement library (the "exercises tab" pop-up's catalog)
// ---------------------------------------------------------------------------

/** Swap candidates — none of these appear in the base weekly plan. */
export const EXERCISE_LIBRARY: PlannedExercise[] = [
  { name: 'Machine Chest Press', muscle: 'Chest', sets: 3, reps: '8–10', weight: '120 lb', rest: '2:00', equipment: 'Chest press machine', note: 'Handles level with your mid-chest; press through, not shrugged up.' },
  { name: 'Cable Fly', muscle: 'Chest', sets: 3, reps: '12–15', weight: '25 lb', rest: '1:30', equipment: 'Cable machine', note: 'Big arc, soft elbows — hug a barrel, don’t press.' },
  { name: 'Weighted Dip', muscle: 'Chest', sets: 3, reps: '6–10', weight: '+10 lb', rest: '2:00', equipment: 'Dip bars + belt', note: 'Lean forward and let your elbows flare slightly to bias chest.' },
  { name: 'Push-Up', muscle: 'Chest', sets: 3, reps: '12–20', weight: 'Bodyweight', rest: '1:30', equipment: 'Bodyweight', note: 'One straight line from head to heels; full range every rep.' },
  { name: 'T-Bar Row', muscle: 'Back', sets: 3, reps: '8–10', weight: '90 lb', rest: '2:00', equipment: 'T-bar + landmine', note: 'Chest up, pull to your sternum, no bouncing off the plates.' },
  { name: 'Single-Arm Dumbbell Row', muscle: 'Back', sets: 3, reps: '8–10', weight: '60 lb', rest: '2:00', equipment: 'Dumbbell + bench', note: 'Pull your elbow toward your hip; keep your shoulders square.' },
  { name: 'Cable Pullover', muscle: 'Back', sets: 3, reps: '12–15', weight: '40 lb', rest: '1:30', equipment: 'Cable machine', note: 'Arms long, sweep the bar down to your thighs with your lats.' },
  { name: 'Arnold Press', muscle: 'Shoulders', sets: 3, reps: '8–10', weight: '35 lb', rest: '2:00', equipment: 'Dumbbells + bench', note: 'Rotate palms out as you press; keep the arc smooth.' },
  { name: 'Cable Lateral Raise', muscle: 'Shoulders', sets: 3, reps: '12–15', weight: '10 lb', rest: '1:30', equipment: 'Cable machine', note: 'Constant tension — stop at shoulder height, no swing.' },
  { name: 'Rear Delt Fly', muscle: 'Shoulders', sets: 3, reps: '12–15', weight: '15 lb', rest: '1:30', equipment: 'Dumbbells', note: 'Hinge over, lead with your pinkies, squeeze your rear delts.' },
  { name: 'Preacher Curl', muscle: 'Biceps', sets: 3, reps: '10–12', weight: '40 lb', rest: '1:30', equipment: 'EZ bar + preacher bench', note: 'Full stretch at the bottom without letting your elbows lock.' },
  { name: 'Incline Dumbbell Curl', muscle: 'Biceps', sets: 3, reps: '10–12', weight: '25 lb', rest: '1:30', equipment: 'Dumbbells + incline bench', note: 'Let your arms hang behind you — the stretch is the point.' },
  { name: 'Cable Curl', muscle: 'Biceps', sets: 3, reps: '12–15', weight: '35 lb', rest: '1:30', equipment: 'Cable machine', note: 'Constant tension top to bottom; elbows pinned.' },
  { name: 'Close-Grip Bench Press', muscle: 'Triceps', sets: 3, reps: '8–10', weight: '115 lb', rest: '2:00', equipment: 'Barbell + bench', note: 'Hands just inside shoulder width; tuck your elbows.' },
  { name: 'Bench Dip', muscle: 'Triceps', sets: 3, reps: '10–15', weight: 'Bodyweight', rest: '1:30', equipment: 'Bench', note: 'Hips close to the bench; stop when your shoulders complain.' },
  { name: 'Single-Arm Overhead Extension', muscle: 'Triceps', sets: 3, reps: '10–12', weight: '20 lb', rest: '1:30', equipment: 'Dumbbell', note: 'Elbow points at the ceiling and stays there.' },
  { name: 'Hack Squat', muscle: 'Quads', sets: 3, reps: '8–10', weight: '180 lb', rest: '2:30', equipment: 'Hack squat machine', note: 'Feet low on the platform biases quads; control the bottom.' },
  { name: 'Goblet Squat', muscle: 'Quads', sets: 3, reps: '10–12', weight: '50 lb', rest: '2:00', equipment: 'Dumbbell', note: 'Elbows inside your knees at the bottom, chest tall.' },
  { name: 'Walking Lunge', muscle: 'Quads', sets: 3, reps: '10–12', weight: '25 lb', rest: '2:00', equipment: 'Dumbbells', note: 'Long steps, knee kisses the floor, drive through the front heel.' },
  { name: 'Good Morning', muscle: 'Hamstrings', sets: 3, reps: '8–10', weight: '75 lb', rest: '2:00', equipment: 'Barbell', note: 'Hips back until your hamstrings load; keep the bar light and strict.' },
  { name: 'Stiff-Leg Deadlift', muscle: 'Hamstrings', sets: 3, reps: '8–10', weight: '135 lb', rest: '2:00', equipment: 'Barbell', note: 'Softer knees than an RDL, same rule: the bar stays close.' },
  { name: 'Nordic Curl', muscle: 'Hamstrings', sets: 3, reps: '5–8', weight: 'Bodyweight', rest: '2:00', equipment: 'Anchored pad', note: 'Fight the descent as long as you can — that IS the exercise.' },
  { name: 'Cable Kickback', muscle: 'Glutes', sets: 3, reps: '12–15', weight: '20 lb', rest: '1:30', equipment: 'Cable machine + ankle strap', note: 'Squeeze at full extension; don’t arch your lower back.' },
  { name: 'Sumo Deadlift', muscle: 'Glutes', sets: 3, reps: '5–8', weight: '185 lb', rest: '3:00', equipment: 'Barbell', note: 'Wide stance, knees out over your toes, push the floor apart.' },
  { name: 'Single-Leg Hip Thrust', muscle: 'Glutes', sets: 3, reps: '10–12', weight: 'Bodyweight', rest: '1:30', equipment: 'Bench', note: 'Hips square, full lockout, zero help from the resting leg.' },
  { name: 'Seated Calf Raise', muscle: 'Calves', sets: 4, reps: '12–15', weight: '70 lb', rest: '1:00', equipment: 'Seated calf machine', note: 'Bent knees hit the soleus; pause hard in the stretch.' },
  { name: 'Donkey Calf Raise', muscle: 'Calves', sets: 4, reps: '12–15', weight: '90 lb', rest: '1:00', equipment: 'Machine', note: 'The hip hinge deepens the stretch — use it.' },
  { name: 'Ab Wheel Rollout', muscle: 'Core', sets: 3, reps: '8–12', weight: 'Bodyweight', rest: '1:30', equipment: 'Ab wheel', note: 'Only roll as far as your lower back stays flat.' },
  { name: 'Pallof Press', muscle: 'Core', sets: 3, reps: '10–12', weight: '25 lb', rest: '1:00', equipment: 'Cable machine', note: 'Press out and refuse the twist; that refusal is the rep.' },
  { name: 'Weighted Plank', muscle: 'Core', sets: 3, reps: '45 sec', weight: '+25 lb', rest: '1:30', equipment: 'Plate', note: 'Glutes tight, ribs down — a plank is a push-up you refuse to start.' },
  { name: 'Rowing Intervals', muscle: 'Cardio', sets: 1, reps: '10 min', weight: 'Bodyweight', rest: '—', equipment: 'Rower', note: 'Legs, then body, then arms — and reverse on the way back.' },
  { name: 'Assault Bike Sprints', muscle: 'Cardio', sets: 1, reps: '8 min', weight: 'Bodyweight', rest: '—', equipment: 'Assault bike', note: '20 seconds all-out, 40 seconds easy spin, eight rounds.' },
  { name: 'Wrist Curl', muscle: 'Forearms', sets: 3, reps: '12–15', weight: '25 lb', rest: '1:00', equipment: 'Barbell + bench', note: 'Forearms on the bench, knuckles past the edge, full roll each rep.' },
  { name: 'Reverse Curl', muscle: 'Forearms', sets: 3, reps: '10–12', weight: '30 lb', rest: '1:00', equipment: 'EZ bar', note: 'Overhand grip, strict elbows — lighter than a normal curl on purpose.' },
  { name: 'Dead Hang', muscle: 'Forearms', sets: 3, reps: '45 sec', weight: 'Bodyweight', rest: '1:30', equipment: 'Pull-up bar', note: 'Shoulders packed, grip crushing. Time only counts while your form does.' },
];

/** The exercise catalog's coarser muscle-group vocabulary for a palette muscle. */
export function catalogGroupForMuscle(m: PrototypeMuscle): string {
  switch (m) {
    case 'Chest':
      return 'chest';
    case 'Back':
      return 'back';
    case 'Shoulders':
      return 'shoulders';
    case 'Core':
      return 'core';
    case 'Cardio':
      return 'cardio';
    case 'Biceps':
    case 'Triceps':
    case 'Forearms':
      return 'arms';
    default:
      return 'legs';
  }
}

/**
 * Top-3 swap suggestions for a slot: same muscle first, nothing already in
 * the day, padded from other muscles if the pool runs short.
 */
export function recommendReplacements(
  muscle: PrototypeMuscle,
  excludeNames: ReadonlySet<string>,
): PlannedExercise[] {
  // Case-insensitive exclusion — callers pass names from mixed sources.
  const excluded = new Set([...excludeNames].map((n) => n.toLowerCase()));
  const pool = EXERCISE_LIBRARY.filter((e) => !excluded.has(e.name.toLowerCase()));
  const same = pool.filter((e) => e.muscle === muscle);
  const rest = pool.filter((e) => e.muscle !== muscle);
  return [...same, ...rest].slice(0, 3);
}

// ---------------------------------------------------------------------------
// Local-date helpers (the app's convention: days are LOCAL days, weeks start
// Monday — matches progressStats/planCalendar)
// ---------------------------------------------------------------------------

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD to LOCAL midnight (never UTC — avoids off-by-one days). */
export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Monday-first weekday index: Monday=0 … Sunday=6. */
export function weekdayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function mondayOf(d: Date): Date {
  return addDays(d, -weekdayIndex(d));
}

export function todayIso(): string {
  return toIso(new Date());
}

export function isToday(iso: string): boolean {
  return iso === todayIso();
}

export function isCurrentWeek(mondayIso: string): boolean {
  return mondayIso === toIso(mondayOf(new Date()));
}

/** The sample plan repeats weekly, so any date maps onto the split by weekday. */
export function planForDate(iso: string): PlannedDay {
  return WEEK_PLAN[weekdayIndex(fromIso(iso))];
}

/** 'Aug 13' */
export function shortDate(d: Date): string {
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

/** 'August 2026' */
export function monthLabel(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** 'Aug 17–23' within one month, 'Aug 31 – Sep 6' across a boundary. */
export function weekRangeLabel(mondayIso: string): string {
  const mon = fromIso(mondayIso);
  const sun = addDays(mon, 6);
  if (mon.getMonth() === sun.getMonth()) {
    return `${shortDate(mon)}–${sun.getDate()}`;
  }
  return `${shortDate(mon)} – ${shortDate(sun)}`;
}

/** Header title for the Week screen. */
export function weekTitle(mondayIso?: string): string {
  if (!mondayIso || isCurrentWeek(mondayIso)) return 'This Week';
  return weekRangeLabel(mondayIso);
}

/**
 * Monday-first week rows covering a month. Leading/trailing cells belong to
 * the adjacent months (rendered dimmed, like the iOS Calendar month grid).
 */
export function monthGrid(monthDate: Date): Date[][] {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const last = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const weeks: Date[][] = [];
  for (let cur = mondayOf(first); cur <= last; cur = addDays(cur, 7)) {
    weeks.push([0, 1, 2, 3, 4, 5, 6].map((i) => addDays(cur, i)));
  }
  return weeks;
}
