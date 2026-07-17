import {
  SHARE_CODE_ALPHABET,
  SHARE_CODE_LENGTH,
  formatShareCode,
  generateShareCode,
  normalizeShareCode,
} from './share-code';

describe('generateShareCode', () => {
  it('produces 8 characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateShareCode();
      expect(code).toHaveLength(SHARE_CODE_LENGTH);
      for (const ch of code) {
        expect(SHARE_CODE_ALPHABET).toContain(ch);
      }
    }
  });

  it('never emits ambiguous characters', () => {
    const banned = ['0', 'O', '1', 'I', 'L', 'U'];
    for (let i = 0; i < 200; i++) {
      const code = generateShareCode();
      for (const ch of banned) {
        expect(code).not.toContain(ch);
      }
    }
  });

  it('is deterministic with an injected random source', () => {
    const fixed = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 0, 0, 0, 0, 0, 0, 0, 0]);
    const random = () => Buffer.from(fixed);
    expect(generateShareCode(random)).toBe(generateShareCode(random));
    expect(generateShareCode(random)).toBe(
      SHARE_CODE_ALPHABET[0] +
        SHARE_CODE_ALPHABET[1] +
        SHARE_CODE_ALPHABET[2] +
        SHARE_CODE_ALPHABET[3] +
        SHARE_CODE_ALPHABET[4] +
        SHARE_CODE_ALPHABET[5] +
        SHARE_CODE_ALPHABET[6] +
        SHARE_CODE_ALPHABET[7],
    );
  });

  it('rejection-samples bytes at or above the bound instead of folding them', () => {
    // 240..255 must be skipped; byte 240 would otherwise fold to alphabet[0].
    const bytes = [255, 250, 240, 8, 9, 10, 11, 12, 13, 14, 15, 0, 0, 0, 0, 0];
    const random = () => Buffer.from(bytes);
    const code = generateShareCode(random);
    expect(code.startsWith(SHARE_CODE_ALPHABET[8])).toBe(true);
  });

  it('refills when a batch is exhausted by rejections', () => {
    let calls = 0;
    const random = (size: number) => {
      calls += 1;
      // First batch: all rejected. Second batch: usable.
      return Buffer.alloc(size, calls === 1 ? 255 : 3);
    };
    const code = generateShareCode(random);
    expect(calls).toBeGreaterThan(1);
    expect(code).toBe(SHARE_CODE_ALPHABET[3].repeat(SHARE_CODE_LENGTH));
  });

  it('can reach every alphabet character', () => {
    const seen = new Set<string>();
    let next = 0;
    const random = (size: number) => {
      const buf = Buffer.alloc(size);
      for (let i = 0; i < size; i++) buf[i] = next++ % 30;
      return buf;
    };
    while (seen.size < SHARE_CODE_ALPHABET.length) {
      for (const ch of generateShareCode(random)) seen.add(ch);
      if (next > 1000) break;
    }
    expect(seen.size).toBe(SHARE_CODE_ALPHABET.length);
  });
});

describe('normalizeShareCode', () => {
  it('uppercases and strips dashes and whitespace', () => {
    expect(normalizeShareCode('7xkf-q2nd')).toBe('7XKFQ2ND');
    expect(normalizeShareCode('  7XKF Q2ND ')).toBe('7XKFQ2ND');
    expect(normalizeShareCode('7XKFQ2ND')).toBe('7XKFQ2ND');
  });

  it('rejects wrong lengths', () => {
    expect(normalizeShareCode('')).toBeNull();
    expect(normalizeShareCode('7XKF')).toBeNull();
    expect(normalizeShareCode('7XKFQ2NDX')).toBeNull();
  });

  it('rejects characters outside the alphabet', () => {
    expect(normalizeShareCode('7XKFQ2N0')).toBeNull(); // zero
    expect(normalizeShareCode('7XKFQ2NO')).toBeNull(); // letter O
    expect(normalizeShareCode('7XKFQ2NI')).toBeNull(); // letter I
    expect(normalizeShareCode('7XKFQ2N!')).toBeNull();
  });

  it('round-trips with formatShareCode', () => {
    const code = generateShareCode();
    expect(normalizeShareCode(formatShareCode(code))).toBe(code);
  });
});

describe('formatShareCode', () => {
  it('inserts a dash after the fourth character', () => {
    expect(formatShareCode('7XKFQ2ND')).toBe('7XKF-Q2ND');
  });

  it('passes through unexpected lengths unchanged', () => {
    expect(formatShareCode('ABC')).toBe('ABC');
    expect(formatShareCode('')).toBe('');
  });
});
