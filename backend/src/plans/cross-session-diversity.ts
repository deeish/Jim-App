/**
 * Cross-session diversity helpers (Phase 7 — same-week variation).
 *
 * Two Upper days that both lead with a flat barbell bench, or two Lower days
 * that both lead with a back squat, leave the user with wasted volume on the
 * same angle and skipped stimulus elsewhere. A trainer would stagger angles
 * (one flat / one incline) and dominance (one squat-led / one hinge-led).
 *
 * This module exposes deterministic name + metadata classifiers that the
 * chunk validator and the session-enrichment post-pass can both call. It is
 * intentionally name-driven (with library `subMuscles` / `movementPatterns`
 * as fallbacks) so it works on synthetic test fixtures and real captures.
 */
export type PushAngle = 'incline' | 'flat' | 'decline' | 'overhead' | 'other';

export type PullAngle = 'horizontal' | 'vertical' | 'other';

export type LowerDominance = 'squat' | 'hinge' | 'lunge' | 'other';

const INCLINE_RX = /\bincline\b|\bhigh[-\s]?incline\b|\blow[-\s]?incline\b/i;
const DECLINE_RX = /\bdecline\b/i;
const OVERHEAD_RX =
  /\boverhead\b|\b(ohp|military)\b|\bshoulder\s+press\b|\bz[-\s]?press\b|\bpush\s+press\b|\bjerk\b|\bstrict\s+press\b|\barnold\s+press\b/i;
const FLAT_BENCH_RX =
  /\b(flat|bench)\s+(barbell|dumbbell|smith|cable|machine)?\s*(bench\s+)?press\b|\b(barbell|dumbbell|smith|cable|machine)\s+bench\s+press\b|\bbench\s+press\b/i;
const PRESS_NOUN_RX = /\bpress\b|\bdip\b|\bpush[-\s]?up\b/i;

const HORIZONTAL_PULL_RX =
  /\brow\b|\b(seated|chest[-\s]?supported|inverted|t[-\s]?bar|landmine)\s+row\b/i;
const VERTICAL_PULL_RX =
  /\b(pull|chin)[-\s]?ups?\b|\bpulldown\b|\blat\s+pull(down)?\b|\bcable\s+pullover\b/i;

const LUNGE_DOM_RX =
  /\b(lunge|step[-\s]?up|split\s+squat|bulgarian|reverse\s+lunge|walking\s+lunge|side\s+lunge|cossack)\b/i;
const SQUAT_DOM_RX =
  /\b(squat|leg\s+press|hack\s+squat|pistol|sissy)\b/i;
const HINGE_DOM_RX =
  /\b(deadlift|rdl|romanian|good\s+morning|hip\s+(thrust|hinge)|swing|kettlebell\s+swing|glute\s+bridge|hamstring\s+curl|nordic|cable\s+pull[-\s]?through)\b/i;

const UNILATERAL_RX =
  /\b(single[-\s]?(arm|leg|side)|one[-\s]?(arm|leg|side)|alternating|alt\.|split\s+squat|bulgarian|step[-\s]?up|lunge|pistol|cossack|skater|side\s+plank|copenhagen|suitcase|landmine\s+(press|row))\b/i;

const NORM_NAME = (name: string | undefined): string => (name ?? '').trim();

/**
 * Classify a press / chest / shoulder exercise by angle. Returns `'other'`
 * when the name doesn't match a recognized press shape — caller should treat
 * that as "unknown, do not score for diversity."
 */
export function classifyPushAngle(name: string | undefined): PushAngle {
  const n = NORM_NAME(name);
  if (!n) return 'other';
  // Order matters — `incline shoulder press` should classify as overhead, not incline.
  if (OVERHEAD_RX.test(n)) return 'overhead';
  if (INCLINE_RX.test(n)) return 'incline';
  if (DECLINE_RX.test(n)) return 'decline';
  if (FLAT_BENCH_RX.test(n) || /\b(dip|push[-\s]?up)\b/i.test(n)) return 'flat';
  // Bare "Bench Press" without an angle word — treat as flat by convention.
  if (/\bpress\b/i.test(n) && /\bbench\b/i.test(n)) return 'flat';
  return 'other';
}

/** Classify a back / row / pulldown exercise by angle. */
export function classifyPullAngle(name: string | undefined): PullAngle {
  const n = NORM_NAME(name);
  if (!n) return 'other';
  if (VERTICAL_PULL_RX.test(n)) return 'vertical';
  if (HORIZONTAL_PULL_RX.test(n)) return 'horizontal';
  return 'other';
}

/**
 * Classify a lower-body exercise by dominance pattern.
 * Order: lunge > hinge > squat (lunge names like "Bulgarian Split Squat" can
 * trip the squat regex and we want them treated as `lunge`).
 */
export function classifyLowerDominance(
  name: string | undefined,
): LowerDominance {
  const n = NORM_NAME(name);
  if (!n) return 'other';
  if (LUNGE_DOM_RX.test(n)) return 'lunge';
  if (HINGE_DOM_RX.test(n)) return 'hinge';
  if (SQUAT_DOM_RX.test(n)) return 'squat';
  return 'other';
}

/**
 * True when the exercise name implies unilateral loading (single arm / leg,
 * lunge family, suitcase / landmine variations). Library `movementPatterns`
 * never tag this directly, so name regex is the source of truth.
 */
export function isUnilateralByName(name: string | undefined): boolean {
  const n = NORM_NAME(name);
  if (!n) return false;
  return UNILATERAL_RX.test(n);
}

/**
 * Find the first non-cardio strength exercise on the session — same definition
 * the slot-1 anchor validator uses. Returns the exercise + its index, or null
 * when the session is empty / cardio-only.
 */
export function findSlotOneStrength(
  exercises: ReadonlyArray<{ exerciseId?: string; name?: string }>,
  primaryMuscleGroupByExerciseId?: ReadonlyMap<string, string>,
): { name: string; exerciseId: string; index: number } | null {
  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i]!;
    const id = ex.exerciseId?.trim();
    if (!id) continue;
    const primary = primaryMuscleGroupByExerciseId?.get(id)?.trim();
    if (primary === 'Cardio') continue;
    return { name: (ex.name ?? '').trim(), exerciseId: id, index: i };
  }
  return null;
}

/** Same-focus pair classification — `'upper' | 'lower'` for the cross-session checks. */
export type CrossSessionFocus = 'upper' | 'lower';

/**
 * Per-session signature used for cross-session comparisons. Slot-1 push angle
 * and lower-dominance are the heuristics with the highest trainer impact —
 * trainers consistently flag "both Upper days are flat bench" and "both
 * Lower days are back squat-led."
 */
export type SessionDiversitySignature = {
  /** Slot-1 (first non-cardio) exercise id, when present. */
  slotOneExerciseId: string | null;
  /** Slot-1 exercise name, when present. */
  slotOneName: string | null;
  /** True when ANY non-cardio row in the session reads as unilateral. */
  hasUnilateral: boolean;
  /** Push angle of slot 1 (Upper sessions only). `'other'` for non-press openers. */
  slotOnePushAngle: PushAngle;
  /** Lower-body dominance of slot 1 (Lower sessions only). */
  slotOneLowerDominance: LowerDominance;
};

export function buildSessionDiversitySignature(
  exercises: ReadonlyArray<{ exerciseId?: string; name?: string }>,
  primaryMuscleGroupByExerciseId?: ReadonlyMap<string, string>,
): SessionDiversitySignature {
  const slotOne = findSlotOneStrength(exercises, primaryMuscleGroupByExerciseId);
  const hasUnilateral = (exercises ?? []).some((e) => {
    const id = e.exerciseId?.trim();
    if (id && primaryMuscleGroupByExerciseId?.get(id)?.trim() === 'Cardio') {
      return false;
    }
    return isUnilateralByName(e.name);
  });
  return {
    slotOneExerciseId: slotOne?.exerciseId ?? null,
    slotOneName: slotOne?.name ?? null,
    hasUnilateral,
    slotOnePushAngle: classifyPushAngle(slotOne?.name),
    slotOneLowerDominance: classifyLowerDominance(slotOne?.name),
  };
}

export type CrossSessionDiversityViolation = {
  /** Which side of the pair we want the retry to demote (always the second occurrence). */
  exerciseId: string;
  /** Short, human-readable reason — used in coach notes / debug logs. */
  reason: string;
  /** Focus pair we noticed the overlap on. */
  focus: CrossSessionFocus;
};

/**
 * Compare two same-focus session signatures. Returns the second session's
 * slot-1 id (the "demote me" hint) when the pair is too similar to live on
 * the same week, plus a short reason string. Returns `null` when the pair is
 * fine. Constraints:
 *
 * - Upper × 2: flag when both slot-1 push angles are recognized AND identical
 *   (e.g. both `flat`). Different angles or `'other'` (unknown) pass.
 * - Lower × 2: flag when both slot-1 lower-dominance values are recognized
 *   AND identical (e.g. both `squat`). Different or `'other'` pass.
 *
 * Also flags when both sessions reuse the same slot-1 exercise id.
 */
export function compareSameFocusSessionPair(
  focus: CrossSessionFocus,
  a: SessionDiversitySignature,
  b: SessionDiversitySignature,
): CrossSessionDiversityViolation | null {
  if (a.slotOneExerciseId && b.slotOneExerciseId) {
    if (a.slotOneExerciseId === b.slotOneExerciseId) {
      return {
        exerciseId: b.slotOneExerciseId,
        reason: `Both ${focus} sessions open with the same exercise (${b.slotOneName ?? b.slotOneExerciseId}).`,
        focus,
      };
    }
  }
  if (focus === 'upper') {
    const pa = a.slotOnePushAngle;
    const pb = b.slotOnePushAngle;
    if (pa !== 'other' && pb !== 'other' && pa === pb && b.slotOneExerciseId) {
      return {
        exerciseId: b.slotOneExerciseId,
        reason: `Both Upper sessions lead with a ${pa} press — vary the angle (incline / overhead) on the second day.`,
        focus,
      };
    }
  } else {
    const da = a.slotOneLowerDominance;
    const db = b.slotOneLowerDominance;
    if (da !== 'other' && db !== 'other' && da === db && b.slotOneExerciseId) {
      return {
        exerciseId: b.slotOneExerciseId,
        reason: `Both Lower sessions lead with a ${da}-dominant lift — alternate squat-led and hinge-led across the week.`,
        focus,
      };
    }
  }
  return null;
}
