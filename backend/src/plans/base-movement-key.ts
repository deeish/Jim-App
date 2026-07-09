/**
 * Collapse a library exercise id to its base movement so equipment variants
 * of the same lift can be detected as near-duplicates within one session
 * (e.g. `barbell_upright_row` and `ez_bar_upright_row` → `upright_row`;
 * `rope_cable_pushdown` and `straight_bar_cable_pushdown` → `pushdown`).
 *
 * Position/angle words (incline, seated, close-grip, …) are intentionally
 * kept: incline + flat bench press in one Push day is legitimate programming,
 * two upright rows that differ only by bar are not.
 */

/** Multi-token equipment/implement phrases — stripped before single tokens. */
const EQUIPMENT_PHRASES = [
  'ez_bar',
  'smith_machine',
  'trap_bar',
  'hex_bar',
  'straight_bar',
  'v_bar',
  'medicine_ball',
  'stability_ball',
  'swiss_ball',
  'resistance_band',
  'band_resisted',
  'machine_assisted',
  'plate_loaded',
] as const;

/** Single equipment/implement tokens. */
const EQUIPMENT_TOKENS = new Set([
  'barbell',
  'dumbbell',
  'dumbbells',
  'kettlebell',
  'cable',
  'machine',
  'band',
  'banded',
  'landmine',
  'plate',
  'rope',
  'smith',
  'bodyweight',
  'weighted',
  'assisted',
]);

/**
 * Returns the equipment-stripped base key for a library id, or the id itself
 * when stripping would leave nothing meaningful.
 */
export function baseMovementKey(exerciseId: string): string {
  let s = exerciseId.trim().toLowerCase();
  if (!s) return s;
  for (const phrase of EQUIPMENT_PHRASES) {
    s = s.replace(new RegExp(`(^|_)${phrase}(?=_|$)`, 'g'), '$1');
  }
  const parts = s
    .split('_')
    .filter((p) => p.length > 0 && !EQUIPMENT_TOKENS.has(p));
  const key = parts.join('_');
  return key.length >= 3 ? key : exerciseId.trim().toLowerCase();
}

/**
 * Ids (beyond the first occurrence) whose base movement already appeared
 * earlier in the same list. Order-preserving; callers pass one session's ids.
 */
export function findNearDuplicateIds(exerciseIds: readonly string[]): string[] {
  const seenKeys = new Map<string, string>();
  const nearDupes: string[] = [];
  for (const raw of exerciseIds) {
    const id = raw.trim();
    if (!id) continue;
    const key = baseMovementKey(id);
    const first = seenKeys.get(key);
    if (first !== undefined && first !== id) {
      nearDupes.push(id);
    } else {
      seenKeys.set(key, id);
    }
  }
  return nearDupes;
}
