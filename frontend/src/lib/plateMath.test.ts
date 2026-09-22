import {
  formatEachSide,
  isBarbellRow,
  MAX_PLATES_PER_SIDE,
  plateGeometry,
  platesFor,
  stepWeight,
  totalFor,
} from './plateMath';

describe('plateMath: weight without the mental math (#52)', () => {
  it('the plate line shows only for a barbell, never an EZ bar, a Smith machine or a trap bar', () => {
    expect(isBarbellRow('Barbell')).toBe(true);
    expect(isBarbellRow('Barbell + Bench')).toBe(true);
    expect(isBarbellRow('Dumbbell')).toBe(false);
    expect(isBarbellRow('EZ Bar')).toBe(false);
    expect(isBarbellRow('Smith Machine')).toBe(false);
    expect(isBarbellRow('Trap Bar')).toBe(false);
    expect(isBarbellRow('—')).toBe(false);
    expect(isBarbellRow(undefined)).toBe(false);
  });

  it('steps by 5 lb or 2.5 kg, snapping an odd number to the grid first, never below zero', () => {
    expect(stepWeight(135, 1, 'lb')).toBe(140);
    expect(stepWeight(135, -1, 'lb')).toBe(130);
    expect(stepWeight(137, 1, 'lb')).toBe(140);
    expect(stepWeight(137, -1, 'lb')).toBe(135);
    expect(stepWeight(null, 1, 'lb')).toBe(5);
    expect(stepWeight(2, -1, 'lb')).toBe(0);
    expect(stepWeight(60, 1, 'kg')).toBe(62.5);
    expect(stepWeight(61, -1, 'kg')).toBe(60);
  });

  it('computes the fewest plates a side, heaviest first, on the bar the user has', () => {
    expect(platesFor(140, 45, 'lb')).toEqual({
      perSide: [45, 2.5],
      bar: 45,
      total: 140,
      rounded: false,
    });
    // 135 a side is three 45s; the 45 + 45 + 25 + 10 + 5 someone might load by hand is theirs to build
    expect(platesFor(315, 45, 'lb')).toEqual({
      perSide: [45, 45, 45],
      bar: 45,
      total: 315,
      rounded: false,
    });
    expect(platesFor(225, 45, 'lb').perSide).toEqual([45, 45]);
    expect(platesFor(185, 45, 'lb').perSide).toEqual([45, 25]);
    expect(platesFor(45, 45, 'lb')).toEqual({ perSide: [], bar: 45, total: 45, rounded: false });
    expect(platesFor(100, 20, 'kg')).toEqual({
      perSide: [25, 15],
      bar: 20,
      total: 100,
      rounded: false,
    });
  });

  it('rounds down to what the plates can make, and says so', () => {
    // 137 on a 45 bar is 46 a side: 45 + nothing the rack has for the last 1
    expect(platesFor(137, 45, 'lb')).toEqual({ perSide: [45], bar: 45, total: 135, rounded: true });
    expect(platesFor(30, 45, 'lb')).toEqual({ perSide: [], bar: 45, total: 45, rounded: true });
  });

  it('never loads more than a sleeve holds', () => {
    const heavy = platesFor(10_000, 45, 'lb');
    expect(heavy.perSide).toHaveLength(MAX_PLATES_PER_SIDE);
    expect(heavy.perSide.every((p) => p === 45)).toBe(true);
    expect(heavy.total).toBe(45 + 2 * 8 * 45);
  });

  it('sums a bar someone built by hand, in the order they built it', () => {
    expect(totalFor(45, [25, 45])).toBe(185);
    expect(totalFor(45, [45, 45, 25, 10, 5])).toBe(305);
    expect(totalFor(45, [5, 5, 5, 5, 5, 5, 5])).toBe(115);
    expect(formatEachSide([45, 2.5])).toBe('45 + 2.5');
    expect(formatEachSide([5, 5, 5, 5, 5, 5, 5])).toBe('5 + 5 + 5 + 5 + 5 + 5 + 5');
    expect(formatEachSide([])).toBe('bar only');
  });

  it('draws up to four plates at full width, then shares the sleeve and drops the tight labels', () => {
    const four = plateGeometry([45, 45, 25, 10], 'lb', 110);
    expect(four.every((p) => p.width === 22 && p.label)).toBe(true);
    const five = plateGeometry([45, 45, 25, 10, 5], 'lb', 110);
    expect(five[0]!.width).toBeLessThan(22);
    expect(five.every((p) => p.width === five[0]!.width)).toBe(true);
    const sevenFives = plateGeometry([5, 5, 5, 5, 5, 5, 5], 'lb', 110);
    expect(sevenFives[0]!.width).toBeGreaterThanOrEqual(5);
    expect(sevenFives.every((p) => p.label)).toBe(true);
    const eight = plateGeometry([45, 45, 45, 45, 45, 45, 45, 45], 'lb', 110);
    expect(eight.every((p) => !p.label)).toBe(true);
    // Heights follow the plate: a 45 is the tallest, a 2.5 still visible.
    const mixed = plateGeometry([45, 2.5], 'lb', 110);
    expect(mixed[0]!.height).toBeGreaterThan(mixed[1]!.height);
    expect(mixed[1]!.height).toBeGreaterThan(40);
  });
});
