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
