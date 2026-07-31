/** Stored/API weights are always pounds. */
export const LB_PER_KG = 2.2046226218;

export type WeightUnit = 'lb' | 'kg';

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

/** Round for display stability */
export function roundLb(lb: number): number {
  return Math.round(lb * 10) / 10;
}

export function formatWeightFromLb(lb: number, unit: WeightUnit): string {
  if (lb <= 0) return '';
  if (unit === 'lb') return `${Math.round(lb)} lb`;
  const kg = lbToKg(lb);
  const n = kg >= 10 ? Math.round(kg) : Math.round(kg * 10) / 10;
  return `${n} kg`;
}

/** Prescription fragment e.g. " @ 185 lb" or " @ 84 kg" */
export function formatAtWeightFromLb(
  lb: number | null | undefined,
  unit: WeightUnit,
): string {
  if (lb == null || lb <= 0) return '';
  if (unit === 'lb') return ` @ ${Math.round(lb)} lb`;
  const kg = lbToKg(lb);
  const n = kg >= 10 ? Math.round(kg) : Math.round(kg * 10) / 10;
  return ` @ ${n} kg`;
}

/** Compact: "185 lb" or "84 kg" for inline lists */
export function formatWeightCompactFromLb(
  lb: number | null | undefined,
  unit: WeightUnit,
): string {
  if (lb == null || lb <= 0) return '';
  return formatWeightFromLb(lb, unit);
}

/**
 * Training volume for display, e.g. `3,850 lb`. Unlike a single load this runs
 * to five or six digits, so it is grouped.
 *
 * Grouping is done by hand rather than through `toLocaleString`: Hermes on
 * Android ships without full Intl in some builds, where that call quietly
 * returns an ungrouped string and the same number would read differently on
 * Android than on iOS or web.
 */
export function formatVolumeFromLb(lb: number, unit: WeightUnit): string {
  const value = Math.round(unit === 'kg' ? lbToKg(lb) : lb);
  // Rounding can take a real but tiny volume to zero (a 0.4 lb set, or any
  // total under ~1.1 lb shown in kg). Callers gate the volume row on raw
  // volume > 0 precisely so it never says "0 lb", so the display must not
  // round its way back to the zero the gate exists to prevent.
  if (value === 0 && lb > 0) return `< 1 ${unit}`;
  return `${groupThousands(value)} ${unit}`;
}

/** Manual digit grouping for counts; see the Hermes note above. */
export function groupThousands(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
