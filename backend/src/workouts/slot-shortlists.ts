import {
  getSlotsForFocus,
  normalizeFocusToKey,
} from '../data/program-templates';
import { LIGHT_ANCHOR_IDS } from '../data/anchor-exercises';
import {
  classifyLowerDominance,
  classifyPullAngle,
  classifyPushAngle,
} from '../plans/cross-session-diversity';

/**
 * Per-slot shortlists for the week-one pick call.
 *
 * Until 2026-09-17 the batch prompt was one forty-row table for the whole
 * program and seven prose rules; the model picked from the table. Two runs
 * on the same inputs opened Lower with a back squat and then with a goblet
 * squat. Research on this exact task (Lee 2026, twenty repeated generations
 * per case on Gemini Flash) finds the structure of the week is the least
 * stable part of the output and recommends "additional structural
 * constraints"; the planning literature (Li et al. 2024) finds models poor
 * at producing a plan outright and good at choosing between candidates. So
 * the rules now decide the day's shape (the slot order per focus, see
 * program-templates.ts) and rank the options for each slot from the
 * catalog's tier order; the model chooses one id per slot. Fitbod and Alpha
 * Progression do the same without a model at all.
 */

export type ShortlistCandidate = {
  id: string;
  name: string;
  primaryMuscleGroup: string;
  movementPatterns: string[];
  subMuscles: string[];
  /** Catalog kind: "Compound" | "Isolation" (undefined on a few legacy rows). */
  type?: string;
};

export type SlotKind =
  | 'horizontal_push'
  | 'vertical_push'
  | 'push_variation'
  | 'vertical_pull'
  | 'horizontal_pull'
  | 'pull_any'
  | 'squat'
  | 'hinge'
  | 'lower_opener'
  | 'lower_second'
  | 'lower_compound'
  | 'leg_isolation'
  | 'calves_or_core'
  | 'core'
  | 'chest_shoulder_isolation'
  | 'chest_isolation'
  | 'triceps'
  | 'biceps'
  | 'back_or_biceps_isolation'
  | 'arm_isolation'
  | 'arms_or_shoulders_isolation'
  | 'vertical_push_or_arms'
  | 'core_or_arms'
  | 'arms_shoulders_or_core'
  | 'core_or_grip'
  | 'core_or_cardio'
  | 'pump_finisher'
  | 'shoulder_raise'
  | 'rear_delt'
  | 'dip_or_pushup';

/** One kind per slot of `SLOTS_BY_FOCUS`, by normalized focus key, same order. */
export const SLOT_KINDS_BY_FOCUS: Record<string, SlotKind[]> = {
  push: [
    'horizontal_push',
    'vertical_push',
    'chest_shoulder_isolation',
    'triceps',
    'pump_finisher',
  ],
  pull: [
    'vertical_pull',
    'horizontal_pull',
    'back_or_biceps_isolation',
    'biceps',
    'core_or_grip',
  ],
  lower: [
    'lower_opener',
    'lower_second',
    'leg_isolation',
    'calves_or_core',
    'core',
  ],
  upper: [
    'horizontal_push',
    'pull_any',
    'vertical_push_or_arms',
    'arms_or_shoulders_isolation',
    'core_or_arms',
  ],
  'full body': [
    'lower_compound',
    'horizontal_push',
    'pull_any',
    'arms_shoulders_or_core',
    'core_or_cardio',
  ],
  chest: [
    'horizontal_push',
    'push_variation',
    'chest_isolation',
    'dip_or_pushup',
  ],
  back: ['vertical_pull', 'horizontal_pull', 'back_or_biceps_isolation'],
  shoulders: ['vertical_push', 'shoulder_raise', 'rear_delt'],
  arms: ['triceps', 'biceps', 'arm_isolation'],
};

const MAIN_SLOT_SIZE = 5;
const ACCESSORY_SLOT_SIZE = 6;
const FINISHER_SLOT_SIZE = 4;

const CALF = /\bcalf\b|\bcalves\b/i;
const TRICEPS_NAME = /tricep|pushdown|skull|kickback|overhead extension/i;
const CURL_NAME = /\bcurls?\b/i;
const NOT_ARM_CURL = /leg|hamstring|wrist|nordic/i;
const REAR_DELT_NAME = /face pull|reverse fly|rear delt|reverse pec/i;
const DIP_OR_PUSHUP = /\bdips?\b|push[-\s]?ups?/i;

function isIsolation(c: ShortlistCandidate): boolean {
  return (c.type ?? '').toLowerCase() === 'isolation';
}
function isCompound(c: ShortlistCandidate): boolean {
  return !isIsolation(c);
}
function has(c: ShortlistCandidate, pattern: string): boolean {
  return (c.movementPatterns ?? []).includes(pattern);
}
function subs(c: ShortlistCandidate): string {
  return (c.subMuscles ?? []).join(' ').toLowerCase();
}

const horizontalPush = (c: ShortlistCandidate) =>
  has(c, 'Push') &&
  c.primaryMuscleGroup === 'Chest' &&
  isCompound(c) &&
  ['flat', 'incline', 'decline'].includes(classifyPushAngle(c.name));
const verticalPush = (c: ShortlistCandidate) =>
  has(c, 'Push') &&
  c.primaryMuscleGroup === 'Shoulders' &&
  isCompound(c) &&
  (classifyPushAngle(c.name) === 'overhead' || /\bpress\b/i.test(c.name));
const verticalPull = (c: ShortlistCandidate) =>
  has(c, 'Pull') &&
  c.primaryMuscleGroup === 'Back' &&
  isCompound(c) &&
  classifyPullAngle(c.name) === 'vertical';
const horizontalPull = (c: ShortlistCandidate) =>
  has(c, 'Pull') &&
  c.primaryMuscleGroup === 'Back' &&
  isCompound(c) &&
  classifyPullAngle(c.name) === 'horizontal';
const pullAny = (c: ShortlistCandidate) =>
  has(c, 'Pull') && c.primaryMuscleGroup === 'Back' && isCompound(c);
const squat = (c: ShortlistCandidate) =>
  has(c, 'Squat') &&
  c.primaryMuscleGroup === 'Legs' &&
  isCompound(c) &&
  classifyLowerDominance(c.name) !== 'lunge';
const hinge = (c: ShortlistCandidate) =>
  has(c, 'Hinge') && c.primaryMuscleGroup === 'Legs' && isCompound(c);
/** The deadlifts a lower day may open with (not the RDL or a hip thrust). */
const OPENER_DEADLIFT =
  /\b(conventional|trap[-\s]?bar|sumo)\b.*deadlift|^deadlift$/i;
const openerDeadlift = (c: ShortlistCandidate) =>
  hinge(c) && OPENER_DEADLIFT.test(c.name);
const core = (c: ShortlistCandidate) => c.primaryMuscleGroup === 'Core';
const armIsolation = (c: ShortlistCandidate) =>
  c.primaryMuscleGroup === 'Arms' && isIsolation(c);
const triceps = (c: ShortlistCandidate) =>
  c.primaryMuscleGroup === 'Arms' &&
  (/tricep/.test(subs(c)) || TRICEPS_NAME.test(c.name));
const biceps = (c: ShortlistCandidate) =>
  c.primaryMuscleGroup === 'Arms' &&
  (/bicep/.test(subs(c)) || CURL_NAME.test(c.name)) &&
  !NOT_ARM_CURL.test(c.name) &&
  !TRICEPS_NAME.test(c.name);
const rearDelt = (c: ShortlistCandidate) =>
  /rear delt/.test(subs(c)) || REAR_DELT_NAME.test(c.name);
const armsOrShouldersIsolation = (c: ShortlistCandidate) =>
  (c.primaryMuscleGroup === 'Arms' || c.primaryMuscleGroup === 'Shoulders') &&
  isIsolation(c);

const PREDICATES: Record<SlotKind, (c: ShortlistCandidate) => boolean> = {
  horizontal_push: horizontalPush,
  vertical_push: verticalPush,
  push_variation: (c) =>
    has(c, 'Push') && c.primaryMuscleGroup === 'Chest' && isCompound(c),
  vertical_pull: verticalPull,
  horizontal_pull: horizontalPull,
  pull_any: pullAny,
  squat,
  hinge,
  // Squats first, then the deadlifts, so the week's second lower day can
  // open with a hinge (the cross-session check asks squat-led then
  // hinge-led; a squat-only opener list could never satisfy it).
  lower_opener: (c) => squat(c) || openerDeadlift(c),
  lower_second: (c) => hinge(c) || squat(c),
  lower_compound: (c) => squat(c) || hinge(c),
  leg_isolation: (c) =>
    c.primaryMuscleGroup === 'Legs' &&
    isIsolation(c) &&
    !CALF.test(`${subs(c)} ${c.name}`),
  calves_or_core: (c) =>
    core(c) ||
    (c.primaryMuscleGroup === 'Legs' && CALF.test(`${subs(c)} ${c.name}`)),
  core,
  chest_shoulder_isolation: (c) =>
    (c.primaryMuscleGroup === 'Chest' ||
      c.primaryMuscleGroup === 'Shoulders') &&
    isIsolation(c),
  chest_isolation: (c) => c.primaryMuscleGroup === 'Chest' && isIsolation(c),
  triceps,
  biceps,
  back_or_biceps_isolation: (c) =>
    (c.primaryMuscleGroup === 'Back' && isIsolation(c)) ||
    biceps(c) ||
    rearDelt(c),
  arm_isolation: armIsolation,
  arms_or_shoulders_isolation: armsOrShouldersIsolation,
  vertical_push_or_arms: (c) => verticalPush(c) || armIsolation(c),
  core_or_arms: (c) => core(c) || armIsolation(c),
  arms_shoulders_or_core: (c) => armsOrShouldersIsolation(c) || core(c),
  core_or_grip: (c) => core(c) || has(c, 'Carry'),
  core_or_cardio: (c) => core(c) || c.primaryMuscleGroup === 'Cardio',
  pump_finisher: (c) =>
    (isIsolation(c) && ['Chest', 'Shoulders'].includes(c.primaryMuscleGroup)) ||
    triceps(c),
  shoulder_raise: (c) =>
    c.primaryMuscleGroup === 'Shoulders' &&
    (/\braise\b/i.test(c.name) || /side delt|front delt/.test(subs(c))),
  rear_delt: rearDelt,
  dip_or_pushup: (c) => DIP_OR_PUSHUP.test(c.name),
};

export type SlotShortlist = {
  index: number;
  description: string;
  optional: boolean;
  candidates: ShortlistCandidate[];
};

export type FocusShortlist = {
  focusLabel: string;
  slots: SlotShortlist[];
};

/**
 * Rank the pool for each slot of the focus. `pool` must already be in the
 * catalog's tier order (getCandidatesForGenerator) and filtered for the
 * user's equipment and limitations; this only chooses and orders.
 *
 * - The first two slots are the main lifts: in a gym, past beginner, the
 *   light anchors (goblet squat, push-up, one-arm row...) are left out.
 * - Preferred movements go first in any slot they fit; the priority muscle's
 *   rows go first in the accessory slots.
 * - A row appears in one slot only, the first that fits, so the model reads
 *   one meaning per id.
 */
export function buildFocusShortlist(args: {
  focusLabel: string;
  pool: ShortlistCandidate[];
  gymLike: boolean;
  difficulty?: string;
  priorityMuscle?: string;
  preferredExercises?: string[];
  /**
   * The ids the chunk validator accepts in slot 1 for this focus and user
   * (anchor-exercises.ts `getAcceptedOpenerIdsForFocus`). When given, the
   * first slot offers those only, so the prompt and the validator agree.
   */
  openerIds?: string[];
}): FocusShortlist | null {
  const key = String(normalizeFocusToKey(args.focusLabel));
  const kinds = SLOT_KINDS_BY_FOCUS[key];
  const slots = getSlotsForFocus(args.focusLabel);
  if (!kinds?.length || !slots.length) return null;
  const heavyOpeners =
    args.gymLike && (args.difficulty ?? '').toLowerCase() !== 'beginner';
  const preferred = (args.preferredExercises ?? [])
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  const isPreferred = (c: ShortlistCandidate) =>
    preferred.some((p) => c.name.toLowerCase().includes(p));
  const priority = (args.priorityMuscle ?? '').trim();
  const openerSet = args.openerIds?.length ? new Set(args.openerIds) : null;
  const taken = new Set<string>();
  const out: SlotShortlist[] = [];
  kinds.forEach((kind, index) => {
    const slot = slots[index];
    if (!slot) return;
    const isMain = index < 2;
    const optional = (slot.min ?? 1) === 0;
    const size = optional
      ? FINISHER_SLOT_SIZE
      : isMain
        ? MAIN_SLOT_SIZE
        : ACCESSORY_SLOT_SIZE;
    const fits = PREDICATES[kind];
    const fitting = args.pool.filter(
      (c) =>
        !taken.has(c.id) &&
        fits(c) &&
        !(isMain && heavyOpeners && LIGHT_ANCHOR_IDS.has(c.id)),
    );
    // Slot 1: the validator's accepted openers first, then the other
    // fitting rows (a band-only pool may have one accepted opener; the
    // list must not be empty, and the model reads the first options as
    // the best).
    const matches =
      index === 0 && openerSet
        ? [
            ...fitting.filter((c) => openerSet.has(c.id)),
            ...fitting.filter((c) => !openerSet.has(c.id)),
          ]
        : fitting;
    const rank = (c: ShortlistCandidate) =>
      (isPreferred(c) ? 0 : 4) +
      (!isMain && priority && c.primaryMuscleGroup === priority ? 0 : 2) +
      (kind === 'lower_opener' && !squat(c) ? 1 : 0);
    const orderedAll = matches
      .map((c, i) => ({ c, i, r: rank(c) }))
      .sort((a, b) => a.r - b.r || a.i - b.i)
      .map((x) => x.c);
    // The lower opener keeps room for two deadlifts behind three squats.
    const ordered =
      kind === 'lower_opener'
        ? [
            ...orderedAll.filter(squat).slice(0, 3),
            ...orderedAll.filter((c) => !squat(c)).slice(0, 2),
          ]
        : orderedAll.slice(0, size);
    for (const c of ordered) taken.add(c.id);
    out.push({
      index,
      description: slot.description,
      optional,
      candidates: ordered,
    });
  });
  return { focusLabel: args.focusLabel, slots: out };
}

/** The prompt text for one focus: numbered slots, `id = Name` per option. */
export function renderFocusShortlist(
  list: FocusShortlist,
  shortName: (name: string) => string,
): string {
  const lines = list.slots
    .filter((s) => s.candidates.length > 0)
    .map((s) => {
      const opts = s.candidates
        .map((c) => `${c.id} = ${shortName(c.name)}`)
        .join('; ');
      const label =
        s.description.replace(/^optional\s*/i, '').trim() || 'Finisher';
      return `  ${s.index + 1}. ${label}${s.optional ? ' (optional)' : ''}: ${opts}`;
    });
  return `${list.focusLabel} day, one id per slot in this order (options listed best first; a second ${list.focusLabel} day in the same week opens with a different id or angle):\n${lines.join('\n')}`;
}
