/**
 * Quick Workout session builder (2026-08-18, v2 after blind-coach audit).
 *
 * Deterministic, catalog-driven session assembly for an ARBITRARY set of
 * target muscles — the engine behind "I'm at the gym, give me a Back & Bis
 * day right now". Deliberately NOT the LLM path: the generation pipeline's
 * focus keys collapse "Back & Biceps" to its first muscle
 * (normalizeFocusToKey / getCandidatesForGenerator both split on `& , +`),
 * and a quick session wants instant, explainable, rate-limit-free picks.
 *
 * v2 rebuilds selection around how a coach actually writes a session — the
 * v1 output was independently reviewed by a blind S&C judge and its three
 * systematic failures each map to a mechanism here:
 *
 *  1. ARCHETYPE SLOTS, not muscle-tag slots. Each muscle carries an ordered
 *     list of movement archetypes (Chest: press → press at a new angle →
 *     fly → dip; Quads: squat → lunge → leg extension; Hamstrings: hinge →
 *     leg curl …). Filling archetypes is what guarantees a fly on chest day
 *     and knee-flexion work on leg day, instead of four bench-press twins.
 *  2. MOVEMENT FAMILIES with caps. Every row is classified into a family
 *     (hpress, fly, vpull, hrow, deadlift, squat, curl …). Axial families
 *     (deadlift, squat) are hard-capped at ONE per session — across
 *     muscles, so a leg day can never stack a trap-bar pull under a
 *     conventional pull. Other families cap at two, and a same-family
 *     second pick must differ in angle token or implement.
 *  3. PER-FAMILY REP POLICY. The goal×role scheme is a starting point that
 *     the exercise can veto: deadlifts never exceed 8 reps (RDLs 10),
 *     rear-delt/lateral-raise work always lives at 12-15+, fixed-load
 *     bodyweight rows (pull-ups, push-ups, dips) get windows a human can
 *     actually hit, and accessory families are always prescribed as
 *     isolation regardless of the catalog's Compound type (Face Pull is
 *     typed Compound and tiered S — it must still never anchor a strength
 *     day at 5x5).
 *
 * Plus: fatigue-aware ordering (axial lifts first while fresh, rear-delt
 * prehab after the heavy work, Core late, grip-destroying hangs/carries
 * after everything grip-dependent, Cardio last — and a cardio finisher
 * never repeats a just-trained pattern, so a Back day cools down on a bike,
 * not a rowing machine), user-equipment vocabulary normalization (the
 * catalog says "Dumbbell", users say "dumbbell") with stated-equipment
 * preference, and a duration estimate built from sets × (work + rest) +
 * station changes instead of a flat per-exercise rate.
 *
 * Retained from v1: tier discipline via EXERCISE_TIERS (S > A > B; C only
 * when a pool runs dry, D never), common-exercise rank as the within-tier
 * tiebreak, joint-demand exclusion mirroring pickReplacement, stable
 * anchors + seed-rotated accessories (this week's Pull day differs from
 * next week's without trading down), and the hard near-duplicate guard.
 *
 * Pure module — no Nest deps — so the spec can hammer it against the real
 * transformed catalog.
 */

import type { TransformedExercise } from '../data/exercise-mappings';
import { equipmentSatisfies } from '../data/exercise-mappings';
import { EXERCISE_TIERS, type ExerciseTier } from '../data/exercise-tiers';
import { getJointDemands, type JointId } from '../data/exercise-joint-demands';
import { getCommonExerciseRank } from '../data/common-exercise-ids';
import {
  getRoleAwareScheme,
  normalizeGoal,
  type ExerciseRole,
} from '../data/set-rep-schemes';

/** The calendar's 12-muscle vocabulary (mirrors the app's palette). */
export const QUICK_MUSCLES = [
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
  'Cardio',
  'Forearms',
] as const;
export type QuickMuscle = (typeof QUICK_MUSCLES)[number];

/** Muscles that earn extra slots and lead the session with compounds. */
const LARGE_MUSCLES = new Set<QuickMuscle>([
  'Chest',
  'Back',
  'Shoulders',
  'Quads',
  'Hamstrings',
  'Glutes',
]);

export type QuickSessionExercise = {
  exerciseId: string;
  name: string;
  /** The palette muscle this pick serves (drives the day view's chip). */
  muscle: QuickMuscle;
  sets: number;
  reps: number;
  repsMin: number;
  repsMax: number;
  orderIndex: number;
  /** 'time' for cardio bouts (durationSeconds set). */
  prescriptionType?: 'reps' | 'time';
  durationSeconds?: number;
};

export type QuickSession = {
  title: string;
  type: 'strength' | 'cardio';
  durationMinutes: number;
  exercises: QuickSessionExercise[];
};

export type QuickSessionOptions = {
  muscles: QuickMuscle[];
  /** The visible catalog (ExercisesService.search({})) — pre-transformed. */
  candidates: TransformedExercise[];
  goal?: string;
  difficulty?: string;
  /** User's available equipment; empty/undefined = fully equipped gym. */
  equipment?: string[];
  /** Avoid phrases ("bad knee", "no barbell") — joints + name matching. */
  limitations?: string[];
  excludeIds?: string[];
  /** Same seed + same inputs = same session (callers seed by date). */
  seed?: number;
};

// ---------------------------------------------------------------------------
// Muscle matching — MUST mirror the app's display mapping (the store's
// muscleFromCatalog): a pick made "for Quads" has to render a Quads chip.
// ---------------------------------------------------------------------------

function subsHay(e: TransformedExercise): string {
  return (e.subMuscles ?? []).join(' ').toLowerCase();
}

export function muscleMatches(
  e: TransformedExercise,
  muscle: QuickMuscle,
): boolean {
  const group = (e.primaryMuscleGroup ?? '').toLowerCase();
  const subs = subsHay(e);
  switch (muscle) {
    case 'Chest':
      return group === 'chest';
    case 'Back':
      return group === 'back';
    case 'Shoulders':
      return group === 'shoulders';
    case 'Core':
      return group === 'core' || group === 'abs';
    case 'Cardio':
      return group === 'cardio';
    case 'Biceps':
      // EXACTLY the display mapping's else-branch: an arms row shows as
      // Triceps or Forearms first when tagged, Biceps otherwise — so a
      // hammer curl (bicep+forearm subs) belongs to Forearms, not Biceps,
      // and a pick's chip always matches the muscle it was picked for.
      return (
        group === 'arms' &&
        !subs.includes('tricep') &&
        !subs.includes('forearm')
      );
    case 'Triceps':
      return group === 'arms' && subs.includes('tricep');
    case 'Forearms':
      return group === 'arms' && subs.includes('forearm');
    case 'Quads':
      // Legs rows default to Quads on display unless tagged otherwise.
      return (
        group === 'legs' &&
        (subs.includes('quad') ||
          (!subs.includes('hamstring') &&
            !subs.includes('glute') &&
            !subs.includes('calf') &&
            !subs.includes('calves')))
      );
    case 'Hamstrings':
      return group === 'legs' && subs.includes('hamstring');
    case 'Glutes':
      return group === 'legs' && subs.includes('glute');
    case 'Calves':
      return (
        group === 'legs' && (subs.includes('calf') || subs.includes('calves'))
      );
  }
}

// ---------------------------------------------------------------------------
// Movement families — finer than the catalog's coarse patterns (Push/Pull/
// Hinge/Squat/Lunge/Core/Carry/Cardio). Classified from name tokens with the
// pattern/group as fallback. First matching rule wins, so narrow rules
// (leg curl, wrist curl, reverse fly) precede the broad ones (curl, fly).
// ---------------------------------------------------------------------------

export type QuickFamily =
  | 'legcurl'
  | 'legext'
  | 'calfseated'
  | 'calf'
  | 'wrist'
  | 'backext'
  | 'ballistic'
  | 'deadlift'
  | 'thrust'
  | 'gluteacc'
  | 'lunge'
  | 'squat'
  | 'vpull'
  | 'latiso'
  | 'shrug'
  | 'upright'
  | 'hrow'
  | 'rdelt'
  | 'lraise'
  | 'frontraise'
  | 'fly'
  | 'dip'
  | 'hang'
  | 'carry'
  | 'plank'
  | 'crunch'
  | 'rotation'
  | 'curl'
  | 'triext'
  | 'opress'
  | 'hpress'
  | 'other';

type FamilyRule = [QuickFamily, (e: TransformedExercise) => boolean];

const nameHas =
  (re: RegExp) =>
  (e: TransformedExercise): boolean =>
    re.test(e.name);
const inGroup = (e: TransformedExercise, g: string): boolean =>
  (e.primaryMuscleGroup ?? '').toLowerCase() === g;
const hasPattern = (e: TransformedExercise, p: string): boolean =>
  (e.movementPatterns ?? []).includes(p);

const FAMILY_RULES: FamilyRule[] = [
  ['legcurl', nameHas(/leg curl/i)],
  ['legext', nameHas(/leg extension/i)],
  // Seated (bent-knee) calf work trains the soleus; standing trains the
  // gastroc — they are different archetypes, not implement variants.
  [
    'calfseated',
    (e) => /calf/i.test(e.name) && /seated|bent[- ]knee/i.test(e.name),
  ],
  ['calf', nameHas(/calf/i)],
  ['wrist', nameHas(/wrist/i)],
  ['backext', nameHas(/back extension|hyperextension|superman/i)],
  ['ballistic', nameHas(/\bswing\b|\bclean\b|\bsnatch\b|\bjerk\b/i)],
  ['deadlift', nameHas(/deadlift|good morning|rack pull/i)],
  [
    'thrust',
    (e) => inGroup(e, 'legs') && /thrust|bridge|frog pump/i.test(e.name),
  ],
  [
    'gluteacc',
    (e) =>
      inGroup(e, 'legs') &&
      /kickback|abduction|clamshell|fire hydrant/i.test(e.name),
  ],
  // Name-based on purpose: the catalog's Lunge pattern also tags frontal-
  // plane adductor work (Copenhagen planks), which is not a lunge slot.
  ['lunge', nameHas(/lunge|split squat|step-up|step up/i)],
  [
    'squat',
    (e) =>
      hasPattern(e, 'Squat') || /squat|leg press|hack|pistol/i.test(e.name),
  ],
  [
    'vpull',
    nameHas(
      /pulldown|pull-down|pull-up|pull up|pullup|chin-up|chin up|chinup|muscle-up/i,
    ),
  ],
  ['latiso', nameHas(/straight-arm|straight arm|pullover/i)],
  ['shrug', nameHas(/shrug/i)],
  ['upright', nameHas(/upright row/i)],
  [
    'rdelt',
    nameHas(
      /face pull|reverse fly|reverse flye|reverse pec|rear delt|pull-apart|pull apart|y-t-w|prone scapular/i,
    ),
  ],
  ['hrow', nameHas(/\brow\b|rowing/i)],
  ['lraise', nameHas(/lateral raise/i)],
  ['frontraise', nameHas(/front raise/i)],
  ['fly', nameHas(/fly|flye|crossover|pec deck|pec-deck/i)],
  ['dip', nameHas(/\bdip\b|\bdips\b/i)],
  ['hang', nameHas(/hang/i)],
  [
    'carry',
    (e) => hasPattern(e, 'Carry') || /carry|farmer|suitcase/i.test(e.name),
  ],
  // Rollouts are anti-extension — the plank's pattern, not a crunch.
  ['plank', nameHas(/plank|rollout|ab wheel|body saw/i)],
  [
    'crunch',
    nameHas(
      /crunch|sit-up|sit up|situp|leg raise|knee raise|v-up|toes[- ]to[- ]bar|hollow|dead bug|bird dog/i,
    ),
  ],
  [
    'rotation',
    nameHas(
      /russian twist|pallof|woodchop|wood chop|rotation|side bend|windmill/i,
    ),
  ],
  ['curl', nameHas(/curl/i)],
  [
    'triext',
    nameHas(
      /extension|pushdown|press-down|pressdown|skullcrusher|skull crusher|kickback|crusher/i,
    ),
  ],
  ['opress', (e) => inGroup(e, 'shoulders') && /press|pike push/i.test(e.name)],
  ['hpress', nameHas(/press|push-up|push up|pushup/i)],
];

const familyCache = new WeakMap<TransformedExercise, QuickFamily>();

export function familyOf(e: TransformedExercise): QuickFamily {
  const hit = familyCache.get(e);
  if (hit) return hit;
  let family: QuickFamily = 'other';
  for (const [fam, test] of FAMILY_RULES) {
    if (test(e)) {
      family = fam;
      break;
    }
  }
  familyCache.set(e, family);
  return family;
}

/**
 * Axial/systemic families are hard-capped at ONE per session ACROSS muscles:
 * a leg day gets one squat pattern and one hinge, never a trap-bar pull for
 * Quads stacked under a conventional pull for Hamstrings. Every other family
 * soft-caps at two — except mono-family muscles (a solo Biceps day IS three
 * curls; the twin guard below still forces different positions/implements).
 */
const AXIAL_FAMILIES = new Set<QuickFamily>(['deadlift', 'squat', 'ballistic']);
const SOFT_CAP_EXEMPT = new Set<QuickFamily>(['curl', 'wrist']);
const familyCap = (family: QuickFamily): number => {
  if (AXIAL_FAMILIES.has(family)) return 1;
  if (SOFT_CAP_EXEMPT.has(family)) return 4;
  return 2;
};

/**
 * Families that are accessories no matter what the catalog's type column
 * says: Face Pull and rear-delt rows are typed Compound (and tiered S), but
 * a coach prescribes them as high-rep isolation — never as a 5x5 anchor.
 */
const ACCESSORY_FAMILIES = new Set<QuickFamily>([
  'legcurl',
  'legext',
  'calf',
  'calfseated',
  'wrist',
  'backext',
  'gluteacc',
  'latiso',
  'shrug',
  'upright',
  'rdelt',
  'lraise',
  'frontraise',
  'fly',
  'plank',
  'crunch',
  'rotation',
  'curl',
  'triext',
]);

/**
 * Rows a coach reaches for only when nothing better exists: stability-limited
 * "rows" that can't load the target (bird-dog row), frontal-plane lunges that
 * cap quad loading, unloaded bridges, fringe implements, and rows whose units
 * don't fit a reps prescription (wrist roller). They stay pickable — a thin
 * pool still fills — but rank behind every conventional alternative.
 */
const QUIRK_RE =
  /lateral lunge|side lunge|cossack|bird[- ]dog|wrist roller|sandbag|table[- ]|slider leg curl|dumbbell leg curl|stability ball leg curl|^glute bridge$|copenhagen/i;

/**
 * High-skill barbell lifts a BEGINNER session must not open with (the pool
 * swaps to goblet squats, RDLs, chest-supported rows, seated presses — the
 * same movement patterns with the technique tax removed). Experience gating
 * has to change the exercise pool, not just the set count.
 */
const BEGINNER_BLOCK_RE =
  /back squat|front squat|overhead squat|conventional deadlift|trap bar deadlift|sumo deadlift|deficit deadlift|pendlay|bent[- ]over barbell row|barbell bent[- ]over row|barbell overhead press|military press|push press|\bsnatch\b|\bclean\b|\bjerk\b|good morning|muscle-up|pistol/i;

/** Angle/position tokens: a same-family second pick must differ in at least
 *  one token or in implement, so "incline barbell press after incline
 *  dumbbell press" can never happen. */
const ANGLE_TOKEN_RE =
  /incline|decline|seated|standing|lying|close[- ]grip|wide[- ]grip|preacher|spider|concentration|single[- ]arm|one[- ]arm|behind[- ]the[- ]back|deficit|paused|sumo|front|overhead/gi;

function angleTokens(name: string): Set<string> {
  const tokens = new Set<string>();
  for (const m of name.toLowerCase().matchAll(ANGLE_TOKEN_RE)) {
    tokens.add(m[0].replace(/[- ]/g, ' '));
  }
  return tokens;
}

function sameTokenSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const t of a) if (!b.has(t)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Archetype slots — the ordered movement menu a coach fills for each muscle.
// Slot i of a muscle tries its families in order; an empty archetype falls
// through to the next, and ultimately to any eligible row for the muscle
// (a selected muscle is never starved by its template).
// ---------------------------------------------------------------------------

const ARCHETYPES: Record<Exclude<QuickMuscle, 'Cardio'>, QuickFamily[][]> = {
  Chest: [['hpress'], ['hpress', 'fly'], ['fly', 'dip'], ['dip', 'hpress']],
  Back: [
    ['vpull', 'hrow'],
    ['hrow', 'vpull'],
    ['latiso', 'hrow', 'vpull'],
    ['hrow', 'vpull', 'shrug'],
  ],
  Shoulders: [
    ['opress', 'hpress'],
    ['lraise'],
    ['rdelt'],
    ['frontraise', 'upright', 'shrug'],
  ],
  Biceps: [['curl'], ['curl'], ['curl'], ['curl']],
  Triceps: [
    ['triext', 'dip', 'hpress'],
    ['dip', 'hpress', 'triext'],
    ['triext'],
    ['triext'],
  ],
  Quads: [['squat'], ['lunge'], ['legext', 'lunge'], ['lunge', 'legext']],
  Hamstrings: [
    ['deadlift', 'legcurl'],
    ['legcurl', 'backext'],
    ['legcurl', 'backext'],
    ['backext', 'legcurl'],
  ],
  Glutes: [
    ['thrust', 'deadlift', 'lunge'],
    ['lunge', 'gluteacc'],
    ['gluteacc', 'thrust', 'lunge'],
    ['gluteacc', 'lunge'],
  ],
  Calves: [
    ['calf', 'calfseated'],
    ['calfseated', 'calf'],
    ['calf', 'calfseated'],
    ['calfseated', 'calf'],
  ],
  Core: [['plank'], ['crunch'], ['rotation', 'carry'], ['crunch', 'rotation']],
  Forearms: [
    ['wrist'],
    ['hang', 'carry'],
    ['curl', 'wrist'],
    ['wrist', 'curl'],
  ],
};

// ---------------------------------------------------------------------------
// Limitations — pickReplacement's semantics: a phrase naming a joint excludes
// joint-tagged rows; any phrase also excludes rows whose name contains it.
// "back" alone is deliberately NOT a joint synonym (it's a muscle group).
// ---------------------------------------------------------------------------

const JOINT_SYNONYMS: Array<[RegExp, JointId]> = [
  [/shoulder/, 'shoulder'],
  [/elbow/, 'elbow'],
  [/wrist/, 'wrist'],
  [/lower back|low back|lumbar|spine/, 'lower_back'],
  [/hip/, 'hip'],
  [/knee/, 'knee'],
  [/ankle/, 'ankle'],
];

function jointsFromPhrases(phrases: string[]): Set<JointId> {
  const joints = new Set<JointId>();
  for (const raw of phrases) {
    const p = raw.toLowerCase();
    for (const [re, joint] of JOINT_SYNONYMS) {
      if (re.test(p)) joints.add(joint);
    }
  }
  return joints;
}

function blockedByLimitations(
  e: TransformedExercise,
  phrases: string[],
  avoidJoints: Set<JointId>,
): boolean {
  if (avoidJoints.size > 0) {
    const demands = getJointDemands(e.id);
    if (demands?.some((j) => avoidJoints.has(j))) return true;
  }
  const name = e.name.toLowerCase();
  return phrases.some((p) => {
    const phrase = p.toLowerCase().trim();
    return phrase.length >= 3 && name.includes(phrase);
  });
}

// ---------------------------------------------------------------------------
// Equipment — the catalog's vocabulary is display-cased ("Dumbbell",
// "Smith Machine") while users and UserPreferences speak lowercase ids
// ("dumbbell", "smith"). Without normalization a dumbbell-only request
// matches NOTHING and the session degrades to whatever has empty equipment
// (the blind review's "dumbbell day without one dumbbell exercise").
// ---------------------------------------------------------------------------

const EQUIP_SYNONYMS: Array<[RegExp, string]> = [
  [/dumbbell|\bdbs?\b/, 'Dumbbell'],
  [/barbell|\bbbs?\b|ez[- ]?bar/, 'Barbell'],
  [/kettlebell|\bkbs?\b/, 'Kettlebell'],
  [/smith/, 'Smith Machine'],
  [/machine/, 'Machine'],
  [/cable/, 'Cable'],
  [/band/, 'Resistance Band'],
  [/pull[- ]?up bar|chin[- ]?up bar/, 'Pull-up Bar'],
  [/trx|suspension/, 'TRX'],
  [/medicine ball|med ball|slam ball/, 'Medicine Ball'],
  [/battle rope/, 'Battle Rope'],
  [/bodyweight|body weight|\bnone\b|no equipment/, 'Bodyweight'],
];

/** Map user equipment terms to catalog labels; unknown terms (setup items
 *  like "bench") drop out. Exported for the spec. */
export function normalizeQuickEquipment(input: string[]): string[] {
  const out = new Set<string>();
  for (const raw of input) {
    const term = raw.toLowerCase().trim();
    if (!term) continue;
    for (const [re, label] of EQUIP_SYNONYMS) {
      if (re.test(term)) {
        out.add(label);
        break;
      }
    }
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// Ranking — tier first (S=0 … C=3; D and untiered sink), common-rank next.
// When the user stated equipment, rows actually USING it outrank bodyweight/
// unspecified rows — someone who said "dumbbells" wants a dumbbell session,
// not four push-up variants (stated-equipment beats tier for that reason).
// ---------------------------------------------------------------------------

const TIER_ORDER: Record<ExerciseTier, number> = {
  S: 0,
  A: 1,
  B: 2,
  C: 3,
  D: 9,
};

function tierRank(id: string): number {
  const tier = EXERCISE_TIERS[id];
  return tier != null ? TIER_ORDER[tier] : 6; // untiered between C and D
}

function isCompound(e: TransformedExercise): boolean {
  return (e.type ?? '').toLowerCase() === 'compound';
}

function commonRank(id: string): number {
  const rank = getCommonExerciseRank(id);
  return Number.isFinite(rank) ? (rank as number) : 100_000;
}

function usesStatedEquipment(
  e: TransformedExercise,
  stated: Set<string>,
): boolean {
  return primaryEquip(e).some((eq) => stated.has(eq));
}

/** Stable quality sort: stated-equipment → non-quirk → tier → compound-first
 *  → common. */
function rankPool(
  pool: TransformedExercise[],
  compoundsFirst: boolean,
  stated?: Set<string>,
): TransformedExercise[] {
  return [...pool].sort((a, b) => {
    if (stated && stated.size > 0) {
      const s =
        Number(usesStatedEquipment(b, stated)) -
        Number(usesStatedEquipment(a, stated));
      if (s !== 0) return s;
    }
    const q = Number(QUIRK_RE.test(a.name)) - Number(QUIRK_RE.test(b.name));
    if (q !== 0) return q;
    const t = tierRank(a.id) - tierRank(b.id);
    if (t !== 0) return t;
    if (compoundsFirst) {
      const c = Number(isCompound(b)) - Number(isCompound(a));
      if (c !== 0) return c;
    }
    return commonRank(a.id) - commonRank(b.id);
  });
}

// ---------------------------------------------------------------------------
// Allocation — how many exercises each selected muscle gets.
// ---------------------------------------------------------------------------

/** Total-session budget by number of STRENGTH muscles selected. */
export function sessionBudget(muscleCount: number): number {
  if (muscleCount <= 0) return 0;
  if (muscleCount === 1) return 4;
  if (muscleCount === 2) return 5;
  if (muscleCount === 3) return 6;
  if (muscleCount === 4) return 6;
  if (muscleCount <= 6) return 7;
  return Math.min(12, muscleCount); // 7+ muscles: one each, honest monster day
}

/** Per-muscle exercise counts: everyone gets 1, extras go to LARGE muscles
 *  (selection order breaks ties), capped at 3 per muscle (4 for a solo day). */
export function allocate(muscles: QuickMuscle[]): Map<QuickMuscle, number> {
  const counts = new Map<QuickMuscle, number>();
  if (muscles.length === 0) return counts;
  const perMuscleCap = muscles.length === 1 ? 4 : 3;
  let remaining = sessionBudget(muscles.length) - muscles.length;
  for (const m of muscles) counts.set(m, 1);
  // Extras go to LARGE muscles in coach order (Back first — its extra slot
  // buys a vertical + horizontal pull pair, the highest-value doubling on
  // any multi-muscle day), then small muscles, then Core.
  const largeOrder: QuickMuscle[] = [
    'Back',
    'Quads',
    'Chest',
    'Shoulders',
    'Hamstrings',
    'Glutes',
  ];
  const priority = [
    ...largeOrder.filter((m) => muscles.includes(m)),
    ...muscles.filter(
      (m) => !LARGE_MUSCLES.has(m) && m !== 'Core' && m !== 'Cardio',
    ),
    ...muscles.filter((m) => m === 'Core'),
  ];
  while (remaining > 0 && priority.length > 0) {
    let gave = false;
    for (const m of priority) {
      if (remaining <= 0) break;
      const cur = counts.get(m) ?? 0;
      if (cur < perMuscleCap) {
        counts.set(m, cur + 1);
        remaining--;
        gave = true;
      }
    }
    if (!gave) break; // every muscle at cap
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Rep policy — the goal×role scheme proposes, the exercise disposes.
// ---------------------------------------------------------------------------

type Prescription = {
  sets: number;
  repsMin: number;
  repsMax: number;
  restSeconds: number;
};

/** True for rows whose load is the body: you cannot dial a push-up to a
 *  5-rep max, so templates must not stamp strength ranges onto them. */
function isFixedLoad(e: TransformedExercise): boolean {
  const eq = primaryEquip(e);
  if (eq.length === 0) return true;
  return eq.every(
    (x) => x === 'Bodyweight' || x === 'Pull-up Bar' || x === 'TRX',
  );
}

function applyRepPolicy(
  e: TransformedExercise,
  family: QuickFamily,
  goalKey: ReturnType<typeof normalizeGoal>,
  base: Prescription,
): Prescription {
  let { sets, repsMin, repsMax, restSeconds } = base;
  const endurance = goalKey === 'endurance';
  const band = (lo: number, hi: number) => {
    repsMin = lo;
    repsMax = hi;
  };

  switch (family) {
    case 'deadlift': {
      // Technical axial hinges degrade dangerously under high-rep fatigue.
      const rdl = /romanian/i.test(e.name);
      const cap = rdl ? 10 : 8;
      if (repsMax > cap) band(rdl ? 8 : 5, cap);
      sets = Math.min(sets, 4);
      restSeconds = Math.max(restSeconds, 120);
      break;
    }
    case 'squat':
      if (repsMax > 10) band(6, 10);
      restSeconds = Math.max(restSeconds, 120);
      break;
    case 'ballistic':
      band(12, 15); // only reachable under an endurance goal
      sets = Math.min(sets, 4);
      break;
    case 'rdelt':
    case 'lraise':
    case 'frontraise':
      // Cue-dependent, light by design — loading these low-rep just breaks
      // the movement (the audit's Face Pull at 5x5-8).
      band(endurance ? 15 : 12, endurance ? 20 : 15);
      sets = Math.min(sets, 3);
      break;
    case 'wrist':
    case 'calf':
    case 'calfseated':
      band(endurance ? 15 : 10, endurance ? 20 : 15);
      sets = Math.min(sets, 3);
      break;
    case 'hrow':
      // Dead-stop/hinged barbell rows exist for low reps — the erectors fail
      // long before the lats past ~8-10, and the back half of every high-rep
      // set is a rounded-back grind.
      if (/pendlay/i.test(e.name)) band(5, 8);
      else if (/bent[- ]over/i.test(e.name) && repsMax > 10) band(6, 10);
      break;
    default:
      break;
  }

  // Anti-extension rollouts live at 6-10; past that the lumbar sags.
  if (/rollout|ab wheel/i.test(e.name)) band(6, 10);
  // Assisted machines subtract load — they cannot express low-rep strength.
  if (/assisted/i.test(e.name) && repsMin < 8) band(8, 12);

  if (isFixedLoad(e) && (e.prescriptionType as string) !== 'time') {
    // Windows a human can actually complete for bodyweight-loaded rows.
    if (family === 'vpull' || family === 'dip') band(6, 10);
    else if (family === 'hpress' || family === 'hrow') band(8, 12);
    else if (repsMin < 6) repsMin = 6;
    if (repsMax < repsMin) repsMax = repsMin + 4;
    sets = Math.min(sets, 4);
  }

  return { sets, repsMin, repsMax, restSeconds };
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

/** Human title: "Back Day", "Back & Biceps", "Chest, Back & Quads", else count. */
export function quickSessionTitle(muscles: QuickMuscle[]): string {
  const strength = muscles.filter((m) => m !== 'Cardio');
  const named = strength.length > 0 ? strength : muscles;
  if (named.length === 1) return `${named[0]} Day`;
  if (named.length === 2) return `${named[0]} & ${named[1]}`;
  if (named.length === 3) return `${named[0]}, ${named[1]} & ${named[2]}`;
  if (named.length >= QUICK_MUSCLES.length - 2) return 'Full Body';
  return `${named[0]}, ${named[1]} +${named.length - 2} more`;
}

export function buildQuickSession(options: QuickSessionOptions): QuickSession {
  const {
    muscles,
    candidates,
    goal,
    difficulty,
    equipment,
    limitations = [],
    excludeIds = [],
    seed = 0,
  } = options;

  const selected = muscles.filter((m): m is QuickMuscle =>
    (QUICK_MUSCLES as readonly string[]).includes(m),
  );
  if (selected.length === 0) {
    throw new Error('Pick at least one muscle');
  }

  const wantsCardio = selected.includes('Cardio');
  const strengthMuscles = selected.filter((m) => m !== 'Cardio');
  const avoidJoints = jointsFromPhrases(limitations);
  const excluded = new Set(excludeIds);
  const goalKey = normalizeGoal(goal);
  const stated = new Set(normalizeQuickEquipment(equipment ?? []));
  const available = stated.size > 0 ? [...stated, 'Bodyweight'] : undefined;

  const beginner = (difficulty ?? '').toLowerCase() === 'beginner';

  // One equipment/limitation pass over the whole catalog.
  const eligible = candidates.filter((e) => {
    if (excluded.has(e.id)) return false;
    if (tierRank(e.id) >= TIER_ORDER.D) return false; // never D
    if (blockedByLimitations(e, limitations, avoidJoints)) return false;
    // Beginners get the same movement patterns from a safer pool.
    if (beginner && BEGINNER_BLOCK_RE.test(e.name)) return false;
    // Assisted machines can't express strength — keep them off strength days.
    if (goalKey === 'strength' && /assisted/i.test(e.name)) return false;
    if (available) {
      if (!equipmentSatisfies(e.primaryEquipment ?? e.equipment, available)) {
        return false;
      }
    }
    return true;
  });

  const counts = allocate(strengthMuscles);
  const usedIds = new Set<string>();
  const familyCounts = new Map<QuickFamily, number>();
  /** Per-pick record before final ordering. */
  type Pick = {
    exercise: TransformedExercise;
    muscle: QuickMuscle;
    family: QuickFamily;
    compound: boolean;
  };
  const picks: Pick[] = [];

  const familyCount = (f: QuickFamily): number => familyCounts.get(f) ?? 0;

  /** Same-family twin guard: a second pick from a used family must differ
   *  from every prior same-family pick in angle tokens or implement. For
   *  single-joint families the implement is cosmetic — a standing EZ-bar
   *  cable curl after a standing barbell curl is the same movement twice —
   *  so those must differ in POSITION, full stop. */
  const TOKEN_TWIN_FAMILIES = new Set<QuickFamily>([
    'curl',
    'triext',
    'lraise',
    'fly',
  ]);
  const familyTwinBlocked = (e: TransformedExercise): boolean => {
    const fam = familyOf(e);
    const tokens = angleTokens(e.name);
    return picks.some((p) => {
      if (p.family !== fam) return false;
      const sameTokens = sameTokenSet(angleTokens(p.exercise.name), tokens);
      if (TOKEN_TWIN_FAMILIES.has(fam)) return sameTokens;
      return sameTokens && sameList(primaryEquip(p.exercise), primaryEquip(e));
    });
  };

  /** Heavy bilateral hinges (conventional/trap-bar/sumo pulls) — RDL-type
   *  hinges are exempt: they coexist with a squat the way a coach programs
   *  a leg day (squat + RDL), while two maximal axial lifts never stack. */
  const isHeavyHinge = (e: TransformedExercise): boolean =>
    familyOf(e) === 'deadlift' &&
    !/romanian|stiff[- ]leg|single[- ]leg/i.test(e.name);

  const capBlocked = (e: TransformedExercise): boolean => {
    const fam = familyOf(e);
    if (fam === 'ballistic' && goalKey !== 'endurance') return true;
    // A session holds ONE maximal axial lift: a squat pattern blocks heavy
    // pulls (the hinge slot falls to an RDL), and vice versa.
    if (isHeavyHinge(e) && familyCount('squat') > 0) return true;
    if (fam === 'squat' && picks.some((p) => isHeavyHinge(p.exercise))) {
      return true;
    }
    return familyCount(fam) >= familyCap(fam);
  };

  // Pick in coach order (axial legs and big pulls claim their families
  // first) regardless of chip-tap order, so "Hamstrings, Quads" builds the
  // same day as "Quads, Hamstrings".
  const COACH_ORDER: QuickMuscle[] = [
    'Quads',
    'Back',
    'Chest',
    'Shoulders',
    'Hamstrings',
    'Glutes',
    'Biceps',
    'Triceps',
    'Calves',
    'Forearms',
    'Core',
  ];
  const pickOrder = [...strengthMuscles].sort(
    (a, b) => COACH_ORDER.indexOf(a) - COACH_ORDER.indexOf(b),
  );

  for (const muscle of pickOrder) {
    const want = counts.get(muscle) ?? 0;
    const musclePool = eligible.filter((e) => muscleMatches(e, muscle));
    const slots = ARCHETYPES[muscle];
    const usedSubs = new Set<string>();
    const usedEquipment = new Set<string>();
    let taken = 0;

    while (taken < want) {
      const open = musclePool.filter(
        (e) =>
          !usedIds.has(e.id) &&
          !capBlocked(e) &&
          !familyTwinBlocked(e) &&
          !picks.some((p) => isNearDuplicate(p.exercise, e)),
      );

      // The slot's archetype menu: try its families in order, then any
      // later slot's families, then anything (never starve a muscle's
      // FIRST pick — later slots are skipped rather than filled badly).
      const slotSpec = slots[Math.min(taken, slots.length - 1)]!;
      let pool: TransformedExercise[] = [];
      for (const fam of slotSpec) {
        pool = open.filter((e) => familyOf(e) === fam);
        if (pool.length > 0) break;
      }
      if (pool.length === 0) {
        for (const laterSpec of slots.slice(
          Math.min(taken, slots.length - 1) + 1,
        )) {
          for (const fam of laterSpec) {
            pool = open.filter((e) => familyOf(e) === fam);
            if (pool.length > 0) break;
          }
          if (pool.length > 0) break;
        }
      }
      if (pool.length === 0) {
        if (taken > 0) break;
        // First pick fallback: any eligible row (axial caps still hold).
        pool = musclePool.filter(
          (e) =>
            !usedIds.has(e.id) &&
            !(AXIAL_FAMILIES.has(familyOf(e)) && capBlocked(e)),
        );
        if (pool.length === 0) break;
      }

      const ranked = rankPool(pool, true, stated);
      let chosen: TransformedExercise;
      if (taken === 0) {
        // The muscle's anchor: best row of its lead archetype, no rotation —
        // a Back day ALWAYS opens with its pull-up/pulldown-class anchor.
        chosen = ranked[0]!;
      } else {
        // Accessories score freshness (new sub-muscle coverage counts most,
        // new equipment breaks ties) and rotate within a tier band by seed.
        const freshScore = (e: TransformedExercise): number => {
          let score = 0;
          if ((e.subMuscles ?? []).some((s) => !usedSubs.has(s))) score += 4;
          if (!sharesAny(primaryEquip(e), usedEquipment)) score += 1;
          return score;
        };
        const best = Math.max(...ranked.map(freshScore));
        const contenders = ranked.filter((e) => freshScore(e) >= best - 1);
        // Quirk rows never rotate in unless they are all that's left.
        const clean = contenders.filter((e) => !QUIRK_RE.test(e.name));
        const band = tierBand(clean.length > 0 ? clean : contenders);
        chosen = band[(seed + taken) % band.length]!;
      }

      const fam = familyOf(chosen);
      usedIds.add(chosen.id);
      chosen.subMuscles?.forEach((s) => usedSubs.add(s));
      primaryEquip(chosen).forEach((eq) => usedEquipment.add(eq));
      familyCounts.set(fam, familyCount(fam) + 1);
      picks.push({
        exercise: chosen,
        muscle,
        family: fam,
        compound: isCompound(chosen),
      });
      taken++;
    }
  }

  // Fatigue-aware ordering: axial lifts first while fresh, then the other
  // big compounds, smaller compounds, isolation, rear-delt/prehab after the
  // heavy pressing it protects, Core late, grip-destroyers (hangs, carries)
  // after everything grip-dependent, Cardio last.
  const orderClass = (p: Pick): number => {
    if (p.family === 'hang' || p.family === 'carry') return 6;
    if (p.muscle === 'Core') return 5;
    if (p.family === 'rdelt' || p.family === 'shrug') return 4;
    if (p.family === 'deadlift' || p.family === 'squat') return 0;
    const accessory = ACCESSORY_FAMILIES.has(p.family) || !p.compound;
    if (accessory) return 3;
    if (LARGE_MUSCLES.has(p.muscle)) return 1;
    return 2;
  };
  const muscleOrder = new Map<QuickMuscle, number>(
    strengthMuscles.map((m, i) => [m, i]),
  );
  picks.sort((a, b) => {
    const c = orderClass(a) - orderClass(b);
    if (c !== 0) return c;
    const m =
      (muscleOrder.get(a.muscle) ?? 0) - (muscleOrder.get(b.muscle) ?? 0);
    if (m !== 0) return m;
    return tierRank(a.exercise.id) - tierRank(b.exercise.id);
  });

  // Roles → prescriptions. First LOADABLE compound overall is THE anchor;
  // accessory families prescribe as isolation whatever the catalog's type.
  let sawPrimary = false;
  const rows: Array<{
    pick: Pick;
    role: ExerciseRole;
    rx: Prescription;
    time: boolean;
  }> = picks.map((p) => {
    let role: ExerciseRole;
    if (p.muscle === 'Core') role = 'core';
    else if (ACCESSORY_FAMILIES.has(p.family) || !p.compound) {
      role = 'isolation';
    } else if (!sawPrimary) {
      role = 'primary_compound';
      sawPrimary = true;
    } else role = 'secondary_compound';
    const scheme = getRoleAwareScheme(goal, difficulty, role);
    let sets = scheme.sets;
    let repsMin = scheme.repsMin;
    let repsMax = scheme.repsMax;
    if (role === 'secondary_compound' && goalKey === 'strength') {
      // The primary lift carries the heavy volume; secondaries at 5 sets
      // each turn a strength day into an unrecoverable 20-set press dump.
      sets = 3;
    }
    if (role === 'isolation') {
      // Two-set isolation is a placebo dose, and low-rep isolation loads a
      // small muscle in a range that punishes the joint for no return.
      sets = Math.max(sets, 3);
      if (goalKey === 'strength' && repsMin < 10) {
        repsMin = 10;
        repsMax = 15;
      }
    }
    const rx = applyRepPolicy(p.exercise, p.family, goalKey, {
      sets,
      repsMin,
      repsMax,
      restSeconds: restForRole(role, scheme.restSeconds ?? 75),
    });
    return {
      pick: p,
      role,
      rx,
      time: (p.exercise.prescriptionType as string) === 'time',
    };
  });

  // Session set budget: 22 working sets is a day a human finishes. Trim
  // SECONDARY COMPOUND sets first (a fourth set of the third press is the
  // cheapest set in the session) down to 3, and only then shave isolation
  // work toward 2 — never gut the accessories to protect press volume.
  const totalSets = () => rows.reduce((n, r) => n + r.rx.sets, 0);
  let trimmed = true;
  while (totalSets() > 22 && trimmed) {
    trimmed = false;
    for (let i = rows.length - 1; i >= 0 && totalSets() > 22; i--) {
      const r = rows[i]!;
      if (r.role === 'secondary_compound' && r.rx.sets > 3) {
        r.rx.sets--;
        trimmed = true;
      }
    }
    for (let i = rows.length - 1; i >= 0 && totalSets() > 22; i--) {
      const r = rows[i]!;
      if (r.role === 'isolation' && r.rx.sets > 2) {
        r.rx.sets--;
        trimmed = true;
      }
    }
  }

  const exercises: QuickSessionExercise[] = rows.map((r, i) => {
    if (r.time) {
      // Time-prescribed rows (planks, dead hangs, carries) keep their
      // nature: sets of a hold, not phantom reps.
      return {
        exerciseId: r.pick.exercise.id,
        name: r.pick.exercise.name,
        muscle: r.pick.muscle,
        sets: r.rx.sets,
        reps: 1,
        repsMin: 1,
        repsMax: 1,
        orderIndex: i,
        prescriptionType: 'time' as const,
        durationSeconds: r.role === 'core' ? 40 : 30,
      };
    }
    return {
      exerciseId: r.pick.exercise.id,
      name: r.pick.exercise.name,
      muscle: r.pick.muscle,
      sets: r.rx.sets,
      reps: Math.round((r.rx.repsMin + r.rx.repsMax) / 2),
      repsMin: r.rx.repsMin,
      repsMax: r.rx.repsMax,
      orderIndex: i,
    };
  });

  // Cardio finisher (or a cardio-only session): one time-based bout that
  // does NOT repeat a just-trained pattern (no rowing after a Back day,
  // no swings after hinging) — a finisher's one job is to be cardio.
  let cardioSeconds = 0;
  if (wantsCardio) {
    const cardioPool = rankPool(
      eligible.filter((e) => {
        if (!muscleMatches(e, 'Cardio') || usedIds.has(e.id)) return false;
        if (selected.includes('Back') && /row/i.test(e.name)) return false;
        if (
          (selected.includes('Hamstrings') || selected.includes('Glutes')) &&
          /swing/i.test(e.name)
        ) {
          return false;
        }
        return true;
      }),
      false,
      stated,
    );
    if (cardioPool.length > 0) {
      const band = tierBand(cardioPool);
      const pick = band[seed % band.length]!;
      cardioSeconds = strengthMuscles.length > 0 ? 600 : 1200;
      exercises.push({
        exerciseId: pick.id,
        name: pick.name,
        muscle: 'Cardio',
        sets: 1,
        reps: 1,
        repsMin: 1,
        repsMax: 1,
        orderIndex: exercises.length,
        prescriptionType: 'time',
        durationSeconds: cardioSeconds,
      });
    }
  }

  exercises.forEach((ex, i) => {
    ex.orderIndex = i;
  });

  // Honest duration: sets × (work + rest) per row, plus a station change per
  // exercise, a warm-up ramp, and the cardio bout — not a flat rate.
  let seconds = rows.length > 0 ? 300 : 0; // warm-up before the first lift
  rows.forEach((r) => {
    if (r.time) {
      const hold = r.role === 'core' ? 40 : 30;
      seconds += r.rx.sets * (hold + 45);
    } else {
      seconds += r.rx.sets * (40 + r.rx.restSeconds);
    }
    seconds += 90; // find the station, set up, warm-up feel
  });
  seconds += cardioSeconds;
  const durationMinutes = Math.max(15, Math.round(seconds / 60 / 5) * 5);

  return {
    title: quickSessionTitle(selected),
    type: strengthMuscles.length === 0 ? 'cardio' : 'strength',
    durationMinutes,
    exercises,
  };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Rest that matches the row's role: compounds rest like compounds even when
 *  the goal band suggests less; isolation and core stay brisk. */
function restForRole(role: ExerciseRole, baseRest: number): number {
  switch (role) {
    case 'primary_compound':
      return Math.max(baseRest, 120);
    case 'secondary_compound':
      return Math.max(Math.round(baseRest * 0.8), 90);
    case 'isolation':
      return 60;
    case 'core':
      return 45;
  }
}

function sharesAny(items: string[] | undefined, used: Set<string>): boolean {
  return (items ?? []).some((x) => used.has(x));
}

function primaryEquip(e: TransformedExercise): string[] {
  return e.primaryEquipment?.length ? e.primaryEquipment : (e.equipment ?? []);
}

function sameList(x: string[] | undefined, y: string[] | undefined): boolean {
  return (
    JSON.stringify([...(x ?? [])].sort()) ===
    JSON.stringify([...(y ?? [])].sort())
  );
}

/** Two rows a coach would call the same exercise in different clothes:
 *  identical movement patterns, identical sub-muscles, identical primary
 *  equipment. One session never contains such a pair. */
export function isNearDuplicate(
  a: TransformedExercise,
  b: TransformedExercise,
): boolean {
  return (
    sameList(a.movementPatterns, b.movementPatterns) &&
    sameList(a.subMuscles, b.subMuscles) &&
    sameList(a.primaryEquipment, b.primaryEquipment)
  );
}

/** The rotation band of an already-ranked pool: the leading tier, extended
 *  into the next tier when the leading one is thin — a band of one can't
 *  rotate, and adjacent tiers are both curated quality. */
function tierBand(ranked: TransformedExercise[]): TransformedExercise[] {
  if (ranked.length === 0) return ranked;
  const lead = tierRank(ranked[0]!.id);
  let band = ranked.filter((e) => tierRank(e.id) === lead);
  if (band.length < 3) {
    const nextTiers = [...new Set(ranked.map((e) => tierRank(e.id)))]
      .filter((t) => t > lead)
      .sort((a, b) => a - b);
    for (const t of nextTiers) {
      if (band.length >= 3) break;
      band = [...band, ...ranked.filter((e) => tierRank(e.id) === t)];
    }
  }
  return band.slice(0, Math.min(5, band.length));
}
