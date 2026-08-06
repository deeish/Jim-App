import {
  formatAtWeightFromLb,
  formatVolumeFromLb,
  formatWeightCompactFromLb,
  formatWeightFromLb,
  kgToLb,
  lbToKg,
  roundLb,
} from './weightDisplay';

describe('formatVolumeFromLb', () => {
  // Grouped by hand rather than via toLocaleString, which is a no-op on Hermes
  // builds shipped without full Intl and would read differently on Android.
  it('groups thousands the same way on every platform', () => {
    expect(formatVolumeFromLb(3850, 'lb')).toBe('3,850 lb');
    expect(formatVolumeFromLb(999, 'lb')).toBe('999 lb');
    expect(formatVolumeFromLb(1000, 'lb')).toBe('1,000 lb');
    expect(formatVolumeFromLb(1234567, 'lb')).toBe('1,234,567 lb');
  });

  it('renders zero volume plainly rather than blank', () => {
    expect(formatVolumeFromLb(0, 'lb')).toBe('0 lb');
  });

  // The decimal pad allows sub-pound weights, so a session can total 0.4 lb —
  // and for a kg user anything under ~1.1 lb rounds to 0 kg. Callers gate the
  // volume row on raw volume > 0, so the display must never round a real
  // total back to the "0 lb" the gate exists to prevent.
  it('renders a tiny but real volume as "< 1", never a rounded zero', () => {
    expect(formatVolumeFromLb(0.4, 'lb')).toBe('< 1 lb');
    expect(formatVolumeFromLb(1.1, 'kg')).toBe('< 1 kg');
  });

  it('rounds up to a plain figure once the display unit reaches one', () => {
    expect(formatVolumeFromLb(0.5, 'lb')).toBe('1 lb');
    expect(formatVolumeFromLb(1.2, 'kg')).toBe('1 kg');
  });

  it('converts to kg before grouping', () => {
    // 3850 lb is ~1746 kg.
    expect(formatVolumeFromLb(3850, 'kg')).toBe('1,746 kg');
  });
});

describe('single-load formatting', () => {
  it('rounds pounds to whole numbers', () => {
    expect(formatWeightFromLb(135.4, 'lb')).toBe('135 lb');
  });

  it('keeps one decimal for small kg loads and rounds larger ones', () => {
    expect(formatWeightFromLb(11.02, 'kg')).toBe('5 kg');
    expect(formatWeightFromLb(220.46226218, 'kg')).toBe('100 kg');
  });

  it('returns empty for absent or non-positive loads', () => {
    expect(formatWeightCompactFromLb(null, 'lb')).toBe('');
    expect(formatWeightCompactFromLb(undefined, 'lb')).toBe('');
    expect(formatWeightCompactFromLb(0, 'lb')).toBe('');
    expect(formatAtWeightFromLb(0, 'lb')).toBe('');
  });

  it('formats the prescription fragment with a leading separator', () => {
    expect(formatAtWeightFromLb(185, 'lb')).toBe(' @ 185 lb');
  });
});

describe('stepper delta round-trip', () => {
  // The session weight stepper's chips read in the display unit, so a kg
  // user's "+2.5" must move the stored (lb) weight by kgToLb(2.5), then round
  // like every other write path. This pins the arithmetic the stepper relies
  // on: 20 kg stored as 44.1 lb, plus a 2.5 kg step, must display as 22.5 kg.
  it('a kg step converts to pounds and lands back on the expected kg display', () => {
    const storedLb = roundLb(kgToLb(20)); // typed-in path stores 44.1
    const stepped = Math.max(0, roundLb(storedLb + kgToLb(2.5)));
    expect(stepped).toBe(49.6);
    expect(Math.round(lbToKg(stepped) * 10) / 10).toBe(22.5);
  });

  it('lb steps stay exact under the same rounding', () => {
    expect(roundLb(145 + 2.5)).toBe(147.5);
    expect(roundLb(145 - 5)).toBe(140);
  });
});
