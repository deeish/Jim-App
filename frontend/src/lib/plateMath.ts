import type { WeightUnit } from './weightDisplay';

/**
 * Weight without the mental math (GitHub #52): the − / + step on every loaded
 * row, and for barbell lifts the plates on each side of the bar.
 *
 * Plates are the gym set, heaviest first. A bar is built in pairs: one tap
 * puts a plate on EACH side, so a 45 adds 90 to the total. Nothing here is
 * re-sorted for people; what they loaded is what is drawn.
 */
export const PLATES: Record<WeightUnit, readonly number[]> = {
  lb: [45, 35, 25, 10, 5, 2.5],
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
};

/** Bar weights offered, the standard one first. */
export const BARS: Record<WeightUnit, readonly number[]> = {
  lb: [45, 35, 15],
  kg: [20, 15, 10],
};

/** A real sleeve holds about this many; past it the plate chips grey out. */
export const MAX_PLATES_PER_SIDE = 8;

/** Barbell only: an EZ bar, a Smith machine and a trap bar weigh anything, so the arithmetic would lie. */
export function isBarbellRow(equipment: string | undefined): boolean {
  return /\bbarbell\b/i.test(equipment ?? '');
}

export type PlateLoad = {
  /** Plates on each side, in the order they were put on (heaviest first when computed). */
  perSide: number[];
  bar: number;
  /** bar + 2 × plates */
  total: number;
  /** The weight asked for could not be made exactly; `total` is the nearest below it. */
  rounded: boolean;
};

/** Fewest plates for a total, heaviest first; rounds down to what the plates can make. */
export function platesFor(total: number, bar: number, unit: WeightUnit): PlateLoad {
  const perSide: number[] = [];
  let remaining = Math.max(0, total - bar) / 2;
  for (const plate of PLATES[unit]) {
    while (remaining >= plate - 1e-9 && perSide.length < MAX_PLATES_PER_SIDE) {
      perSide.push(plate);
      remaining -= plate;
    }
  }
  const made = totalFor(bar, perSide);
  return { perSide, bar, total: made, rounded: Math.abs(made - total) > 1e-9 };
}

export function totalFor(bar: number, perSide: readonly number[]): number {
  const plates = perSide.reduce((sum, p) => sum + p, 0);
  return Math.round((bar + 2 * plates) * 100) / 100;
}

/** '45 + 2.5', or 'bar only' with nothing on. */
export function formatEachSide(perSide: readonly number[]): string {
  if (perSide.length === 0) return 'bar only';
  return perSide.map(formatPlate).join(' + ');
}

export function formatPlate(plate: number): string {
  return String(plate);
}

/** The rack colours, so the sheet reads like the gym. */
export function plateColor(
  plate: number,
  unit: WeightUnit,
): { fill: string; ink: string; outlined?: boolean } {
  const key = plate;
  if (unit === 'lb') {
    if (key >= 45) return { fill: '#3D8CFF', ink: '#0A0D13' };
    if (key === 35) return { fill: '#F5C542', ink: '#1C1C1E' };
    if (key === 25) return { fill: '#4CC38A', ink: '#0A0D13' };
    if (key === 10) return { fill: '#E9E9EE', ink: '#1C1C1E' };
    if (key === 5) return { fill: '#FF453A', ink: '#FFFFFF' };
    return { fill: '#2A2A30', ink: '#F2F2F5', outlined: true };
  }
  if (key >= 25) return { fill: '#FF453A', ink: '#FFFFFF' };
  if (key === 20) return { fill: '#3D8CFF', ink: '#0A0D13' };
  if (key === 15) return { fill: '#F5C542', ink: '#1C1C1E' };
  if (key === 10) return { fill: '#4CC38A', ink: '#0A0D13' };
  if (key === 5) return { fill: '#E9E9EE', ink: '#1C1C1E' };
  return { fill: '#2A2A30', ink: '#F2F2F5', outlined: true };
}

/**
 * How wide and tall each plate draws on a sleeve of `sleeveWidth` pt. Up to
 * four plates draw at full width; from five on they share the sleeve, and a
 * plate under `labelMinWidth` pt drops its number (the words under the bar
 * still list it).
 */
export function plateGeometry(
  perSide: readonly number[],
  unit: WeightUnit,
  sleeveWidth: number,
  fullWidth = 22,
  gap = 2,
  labelMinWidth = 13,
): Array<{ plate: number; width: number; height: number; label: boolean }> {
  const n = perSide.length;
  const width = n <= 4 ? fullWidth : Math.max(5, Math.floor((sleeveWidth - gap * (n - 1)) / n));
  const heaviest = PLATES[unit][0]!;
  return perSide.map((plate) => {
    const share = Math.max(0.42, Math.min(1, plate / heaviest));
    return { plate, width, height: Math.round(118 * share), label: width >= labelMinWidth };
  });
}
