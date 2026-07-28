import {
  formatAtWeightFromLb,
  formatVolumeFromLb,
  formatWeightCompactFromLb,
  formatWeightFromLb,
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
