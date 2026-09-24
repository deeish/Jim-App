import type { WeightUnit } from './weightDisplay';
import { formatWeightFromLb, lbToKg } from './weightDisplay';

/**
 * What a set needs before its check can log it (GitHub #56, 2026-09-21).
 *
 * The deck used to log whatever the grey placeholder showed when a field was
 * left empty, so a check with nothing typed silently recorded last week's
 * numbers. Now:
 *  - reps are always required (seconds or minutes on a timed row);
 *  - weight is required only on a LOADED row. A bodyweight row (dead hang,
 *    pull-up, push-up) takes a blank as bodyweight and a number as added
 *    load; cardio and timed rows never ask for one.
 * The one-tap path survives as a chip that fills the fields from the same
 * placeholder, so every logged number was seen before it was accepted.
 */
export type SetEntryContext = {
  /** The row's planned weight as the calendar shows it: 'Bodyweight', '—' or '135 lb'. */
  plannedWeight: string;
  /** The row's planned reps as displayed: '10', '8–12', '8–12 · aim 10', '45 sec'. */
  plannedReps: string;
  muscle: string;
  /** 'sec' | 'min' on a timed row, null on a rep row. */
  timedUnit: string | null;
  /** The same set of the last session, when known (rep rows only). */
  lastSet: { reps: number; weightLb: number | null } | null;
  unit: WeightUnit;
};

export function weightRequired(ctx: SetEntryContext): boolean {
  if (ctx.timedUnit) return false;
  if (ctx.muscle === 'Cardio') return false;
  return ctx.plannedWeight !== 'Bodyweight';
}

/**
 * Equipment that carries no load of its own: the row is a bodyweight row,
 * so the weight box is optional and a blank logs as bodyweight. A dead hang
 * on a pull-up bar used to read as a LOADED row (build 37), and the check
 * refused it until a number was typed. Accepts the catalog's ids
 * ('pull_up_bar') and the calendar's display text ('Pull up bar').
 */
export function isBodyweightEquipment(equipment: string | readonly string[] | undefined): boolean {
  const list = Array.isArray(equipment) ? equipment : [equipment ?? ''];
  const text = list
    .join(' ')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/body ?weight/g, '')
    .trim();
  // A row is loaded when anything on it can be loaded; a bar to hang from,
  // a box, a mat or rings cannot.
  return !/\b(barbell|dumbbell|kettlebell|machine|cable|band|plate|smith|sled|trap bar|ez bar|vest|belt|medicine ball|slam ball|sandbag|landmine|chain|weights?)\b/.test(
    text,
  );
}

export type SetEntryValidation = {
  ok: boolean;
  /** The first field that still needs a number, for the shake and the focus. */
  missing: 'reps' | 'weight' | null;
  /** Parsed values; null when blank or unusable. */
  reps: number | null;
  weight: number | null;
};

function positiveNumber(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function validateSetEntry(
  ctx: SetEntryContext,
  repsText: string,
  weightText: string,
): SetEntryValidation {
  const reps = positiveNumber(repsText);
  const weight = positiveNumber(weightText);
  if (reps == null) return { ok: false, missing: 'reps', reps, weight };
  if (weightRequired(ctx) && weight == null) {
    return { ok: false, missing: 'weight', reps, weight };
  }
  return { ok: true, missing: null, reps, weight };
}

/** '8–12 · aim 10' → 10; '8–12' → 8; '10' → 10; '45 sec' → 45; else null. */
export function plannedRepsNumber(plannedReps: string): number | null {
  const aim = plannedReps.match(/aim\s+(\d+)/i);
  if (aim) return Number(aim[1]);
  const timed = plannedReps.match(/(\d+)\s*(min|sec)/i);
  if (timed) return Number(timed[1]);
  const band = plannedReps.match(/^\s*(\d+)\s*[–-]\s*(\d+)/);
  if (band) return Number(band[1]);
  const single = plannedReps.match(/^\s*(\d+)\s*$/);
  return single ? Number(single[1]) : null;
}

/** '135 lb' → the bare number in the user's unit; bodyweight / dash → null. */
export function plannedWeightNumber(plannedWeight: string, unit: WeightUnit): number | null {
  const m = plannedWeight.match(/^\+?([\d.]+)\s*lb$/i);
  if (!m) return null;
  const lb = Number(m[1]);
  return Math.round(unit === 'kg' ? lbToKg(lb) : lb);
}

export type SuggestedEntry = {
  /** Chip copy: 'Same as last time: 8 × 135 lb' or 'Use target: 10 reps'. */
  label: string;
  /** Text to place in the reps (or time) field. */
  reps: string;
  /** Text to place in the weight field; '' leaves it blank (bodyweight). */
  weight: string;
};

/** The one-tap fill: last time's numbers when known, the target otherwise. */
export function suggestedEntry(ctx: SetEntryContext): SuggestedEntry | null {
  if (ctx.timedUnit) {
    const n = plannedRepsNumber(ctx.plannedReps);
    if (n == null) return null;
    return {
      label: `Use target: ${n} ${ctx.timedUnit}`,
      reps: String(n),
      weight: '',
    };
  }
  if (ctx.lastSet) {
    const w = ctx.lastSet.weightLb;
    const weightText = w != null ? String(Math.round(ctx.unit === 'kg' ? lbToKg(w) : w)) : '';
    const label =
      w != null
        ? `Same as last time: ${ctx.lastSet.reps} × ${formatWeightFromLb(w, ctx.unit)}`
        : `Same as last time: ${ctx.lastSet.reps} reps`;
    return { label, reps: String(ctx.lastSet.reps), weight: weightText };
  }
  const reps = plannedRepsNumber(ctx.plannedReps);
  if (reps == null) return null;
  const weight = plannedWeightNumber(ctx.plannedWeight, ctx.unit);
  return {
    label:
      weight != null ? `Use target: ${reps} × ${weight} ${ctx.unit}` : `Use target: ${reps} reps`,
    reps: String(reps),
    weight: weight != null ? String(weight) : '',
  };
}
