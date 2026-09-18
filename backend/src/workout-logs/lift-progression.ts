import {
  estimateOneRepMax,
  loadForTarget,
  roundLoadLb,
} from '../plans/load-from-history';

/**
 * The ledger: one lift's next-week row from what was logged this week
 * (Tier 7 of the 2026-09-16 plan, spec in the build log).
 *
 * Exercises are fixed for the block; this moves load, the rep target and
 * nothing else, per lift, from the working sets the user actually did:
 *
 * - every working set at the top of the range and the session not "too
 *   hard": the load goes up one step and the target drops to the bottom of
 *   the range (double progression);
 * - sets inside the range: same load, aim for the best set plus one;
 * - a set below the range or a "too hard" session: hold the load if the
 *   miss was one rep, otherwise five percent off;
 * - no load prescribed yet: the logged sets set the number (Epley, inverted
 *   at next week's reps and effort), so an accessory with no history starts
 *   progressing from its second week;
 * - a bodyweight or timed row, or a lift without logged sets: untouched.
 *
 * Evidence: proximity to failure and sets drive growth; load and repetition
 * progression give the same hypertrophy over a block; effort-based loading
 * beats a fixed forecast or ties it (Helms 2018, Graham 2021, Plotkin 2022).
 */

export type LedgerRow = {
  id: string;
  exerciseId: string;
  name: string;
  sets: number;
  reps: number;
  repsMin: number | null;
  repsMax: number | null;
  targetRir: number | null;
  weight: number | null;
  prescriptionType: string | null;
  notes: string | null;
};

export type LoggedSet = {
  reps: number;
  weight: number | null;
  /** 1–10 when the set was rated; the ledger reads it as 10 − RPE reps in reserve. */
  rpe?: number | null;
};

export type LiftStepKind = 'up' | 'more_reps' | 'hold' | 'back' | 'set_number';

export type LiftStep = {
  id: string;
  name: string;
  kind: LiftStepKind;
  /** The next week's load, when it changes or is set for the first time. */
  weight?: number;
  /** The next week's working rep target (the row's `reps` scalar). */
  reps: number;
  notes: string;
  /** One clause for the check-in summary. */
  summary: string;
};

const DEFAULT_TARGET_RIR = 2;
const BACK_OFF_FACTOR = 0.95;
const STEP_PERCENT = 0.025;
const HOLD_MISS_REPS = 1;
/** The check-in's "too hard". */
const EFFORT_TOO_HARD = 3;
export const LEDGER_NOTE_TAG = 'Ledger:';

const DUMBBELL = /dumbbell/i;
const KETTLEBELL = /kettlebell/i;
const STACK =
  /\b(cable|machine|pulldown|pushdown|pec deck|leg press|leg curl|leg extension|hack squat)\b/i;
const LOWER_BODY_BARBELL = /\b(squat|deadlift|hip thrust|leg press|hack)\b/i;

/**
 * The smallest honest load increase for this row, by what it is loaded with:
 * a dumbbell step (5 lb; 2.5 lb below 20), a kettlebell step (about 9 lb,
 * one bell up), a stack pin (5 lb; 10 lb past 100), a plate a side on a bar
 * (5 lb; 10 lb on a lower-body lift past 200 lb).
 */
export function loadStepLb(name: string, weight: number): number {
  if (DUMBBELL.test(name)) return weight < 20 ? 2.5 : 5;
  if (KETTLEBELL.test(name)) return 9;
  if (STACK.test(name)) return weight >= 100 ? 10 : 5;
  if (LOWER_BODY_BARBELL.test(name) && weight >= 200) return 10;
  return 5;
}

/**
 * Whether the logged sets read as too hard for this lift: the session's
 * check-in, or, when sets were rated, a set at RPE 10 against an effort
 * target above zero, or the worst set more than a rep past the target.
 */
export function liftTooHard(
  sets: ReadonlyArray<LoggedSet>,
  targetRir: number,
  effort: number,
): boolean {
  if (effort >= EFFORT_TOO_HARD) return true;
  const rated = sets.filter((s) => typeof s.rpe === 'number' && s.rpe! > 0);
  if (rated.length === 0) return false;
  const worstRir = Math.min(...rated.map((s) => 10 - s.rpe!));
  if (worstRir <= 0 && targetRir >= 1) return true;
  return worstRir < targetRir - 1;
}

function stripLedgerNote(notes: string | null): string {
  const base = (notes ?? '').trim();
  if (!base) return '';
  // Drop an earlier ledger sentence so notes do not pile up week on week.
  const idx = base.indexOf(LEDGER_NOTE_TAG);
  return idx >= 0 ? base.slice(0, idx).trim() : base;
}

function withLedgerNote(notes: string | null, note: string): string {
  const base = stripLedgerNote(notes);
  return base
    ? `${base} ${LEDGER_NOTE_TAG} ${note}`
    : `${LEDGER_NOTE_TAG} ${note}`;
}

function fmtLb(n: number): string {
  return Number.isInteger(n) ? `${n} lb` : `${n.toFixed(1)} lb`;
}

/**
 * The next-week row for one lift, or null when nothing should move.
 * `logged` is this week's completed sets for the same exercise id.
 */
export function stepLiftFromLog(
  row: LedgerRow,
  logged: ReadonlyArray<LoggedSet>,
  checkIn: { effort: number },
): LiftStep | null {
  if ((row.prescriptionType ?? 'reps') === 'time') return null;
  const sets = logged.filter((s) => s.reps > 0);
  if (sets.length === 0) return null;
  const loaded = sets.filter((s) => (s.weight ?? 0) > 0);
  const min = row.repsMin ?? row.reps;
  const max = row.repsMax ?? row.reps;
  const rir = row.targetRir ?? DEFAULT_TARGET_RIR;
  const tooHard = liftTooHard(sets, rir, checkIn.effort);

  // No number yet: the logged sets set it.
  if (row.weight == null || row.weight <= 0) {
    if (loaded.length === 0) return null; // bodyweight row: sets only
    const e1rm = estimateOneRepMax(
      loaded.map((s, i) => ({
        setNumber: i + 1,
        reps: s.reps,
        weight: s.weight,
      })),
    );
    // Sets above the Epley window (a 15-rep accessory) still set the number:
    // the user just did those reps at that load, so that load is the number.
    const weight =
      e1rm != null
        ? loadForTarget(e1rm, min, rir)
        : roundLoadLb(Math.max(...loaded.map((s) => s.weight!)));
    if (weight <= 0) return null;
    return {
      id: row.id,
      name: row.name,
      kind: 'set_number',
      weight,
      reps: min,
      notes: withLedgerNote(
        row.notes,
        `your first logged sets set the number: ${fmtLb(weight)} for ${min}–${max} with ${rir} in reserve.`,
      ),
      summary: `${row.name} now has a number (${fmtLb(weight)})`,
    };
  }

  // A loaded row: follow the load the user actually used, not the forecast.
  if (loaded.length === 0) return null;
  const used = Math.max(...loaded.map((s) => s.weight!));
  const base = used > 0 ? used : row.weight;
  const working = loaded.filter((s) => s.weight! >= base - 0.01);
  const reps = working.map((s) => s.reps);
  const best = Math.max(...reps);
  const worst = Math.min(...reps);

  if (!tooHard && worst >= max) {
    const step = Math.max(loadStepLb(row.name, base), base * STEP_PERCENT);
    const weight = roundLoadLb(base + step);
    return {
      id: row.id,
      name: row.name,
      kind: 'up',
      weight,
      reps: min,
      notes: withLedgerNote(
        row.notes,
        `up to ${fmtLb(weight)}: you hit the top of the range on every set last week.`,
      ),
      summary: `${row.name} up to ${fmtLb(weight)}`,
    };
  }

  if (tooHard || worst < min) {
    const missBy = Math.max(0, min - worst);
    if (!tooHard && missBy <= HOLD_MISS_REPS) {
      return {
        id: row.id,
        name: row.name,
        kind: 'hold',
        weight: roundLoadLb(base),
        reps: min,
        notes: withLedgerNote(
          row.notes,
          `holding ${fmtLb(roundLoadLb(base))}: last week fell one rep short of the range.`,
        ),
        summary: `${row.name} holds at ${fmtLb(roundLoadLb(base))}`,
      };
    }
    const weight = Math.max(roundLoadLb(base * BACK_OFF_FACTOR), 0);
    return {
      id: row.id,
      name: row.name,
      kind: 'back',
      weight,
      reps: min,
      notes: withLedgerNote(
        row.notes,
        `back to ${fmtLb(weight)}: last week was ${tooHard ? 'a grind' : 'under the range'}. Build back up.`,
      ),
      summary: `${row.name} back to ${fmtLb(weight)}`,
    };
  }

  const target = Math.min(max, best + 1);
  return {
    id: row.id,
    name: row.name,
    kind: 'more_reps',
    weight: roundLoadLb(base),
    reps: target,
    notes: withLedgerNote(
      row.notes,
      `same ${fmtLb(roundLoadLb(base))}, aim for ${target} reps; at ${max} on every set the weight goes up.`,
    ),
    summary: `${row.name} same weight, aim for ${target}`,
  };
}

/** Deload transform for one row, the same shape the block's calendar deload uses. */
export function deloadRow(row: LedgerRow): {
  sets: number;
  reps: number;
  repsMin: number | null;
  repsMax: number | null;
  targetRir: number | null;
  weight: number | null;
} {
  const isTime = (row.prescriptionType ?? 'reps') === 'time';
  return {
    sets: Math.max(isTime ? row.sets : 2, Math.round(row.sets * 0.7)),
    reps: isTime ? row.reps : row.reps + 2,
    repsMin: isTime || row.repsMin == null ? row.repsMin : row.repsMin + 2,
    repsMax: isTime || row.repsMax == null ? row.repsMax : row.repsMax + 2,
    targetRir:
      isTime || row.targetRir == null
        ? row.targetRir
        : Math.min(4, row.targetRir + 2),
    weight:
      isTime || row.weight == null ? row.weight : roundLoadLb(row.weight * 0.9),
  };
}

export const TRIGGERED_DELOAD_NOTE =
  'Lighter week on purpose: two hard weeks in a row, or a lift that has stalled. Sets, reps and weight all ease; build back next week.';

/** True when the ledger should not touch the row because a deload already shaped it. */
export function rowIsDeloaded(notes: string | null | undefined): boolean {
  const n = notes ?? '';
  return (
    n.includes(TRIGGERED_DELOAD_NOTE) || /^Deload week:|\bDeload week:/.test(n)
  );
}
