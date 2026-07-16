import {
  formatShareCode,
  formatShareCodeInput,
  isValidShareCode,
  normalizeShareCode,
} from './shareCode';

describe('normalizeShareCode', () => {
  it('uppercases and strips dashes and whitespace', () => {
    expect(normalizeShareCode('7xkf-q2nd')).toBe('7XKFQ2ND');
    expect(normalizeShareCode('  7XKF Q2ND ')).toBe('7XKFQ2ND');
    expect(normalizeShareCode('7XKFQ2ND')).toBe('7XKFQ2ND');
  });

  it('rejects wrong lengths and characters outside the alphabet', () => {
    expect(normalizeShareCode('')).toBeNull();
    expect(normalizeShareCode('7XKF')).toBeNull();
    expect(normalizeShareCode('7XKFQ2NDX')).toBeNull();
    expect(normalizeShareCode('7XKFQ2N0')).toBeNull(); // zero
    expect(normalizeShareCode('7XKFQ2NO')).toBeNull(); // letter O
    expect(normalizeShareCode('7XKFQ2NI')).toBeNull(); // letter I
    expect(normalizeShareCode('7XKFQ2N!')).toBeNull();
  });
});

describe('isValidShareCode', () => {
  it('accepts dashed display form and rejects junk', () => {
    expect(isValidShareCode('7XKF-Q2ND')).toBe(true);
    expect(isValidShareCode('not a code')).toBe(false);
  });
});

describe('formatShareCode', () => {
  it('inserts a dash after the fourth character', () => {
    expect(formatShareCode('7XKFQ2ND')).toBe('7XKF-Q2ND');
  });

  it('passes through unexpected lengths unchanged', () => {
    expect(formatShareCode('ABC')).toBe('ABC');
  });

  it('round-trips with normalizeShareCode', () => {
    expect(normalizeShareCode(formatShareCode('7XKFQ2ND'))).toBe('7XKFQ2ND');
  });
});

describe('formatShareCodeInput', () => {
  it('formats progressively while typing', () => {
    expect(formatShareCodeInput('7')).toBe('7');
    expect(formatShareCodeInput('7xkf')).toBe('7XKF');
    expect(formatShareCodeInput('7xkfq')).toBe('7XKF-Q');
    expect(formatShareCodeInput('7xkfq2nd')).toBe('7XKF-Q2ND');
  });

  it('drops invalid characters and caps the length', () => {
    expect(formatShareCodeInput('7xk0f-q2ndzz')).toBe('7XKF-Q2ND');
    expect(formatShareCodeInput('o0il u')).toBe('');
  });

  it('is stable when fed its own output', () => {
    const once = formatShareCodeInput('7xkfq2nd');
    expect(formatShareCodeInput(once)).toBe(once);
  });
});
