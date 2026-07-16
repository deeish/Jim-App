import { randomBytes } from 'crypto';

/**
 * Share-code alphabet: 30 unambiguous characters. 0/O, 1/I/L and U (vs V) are
 * excluded so codes survive being read aloud in a gym or typed from a text.
 */
export const SHARE_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const SHARE_CODE_LENGTH = 8;

/** Largest multiple of the alphabet size below 256, for unbiased rejection sampling. */
const REJECTION_BOUND =
  Math.floor(256 / SHARE_CODE_ALPHABET.length) * SHARE_CODE_ALPHABET.length; // 240

/**
 * Crypto-random share code (e.g. "7XKFQ2ND"). Bytes >= the rejection bound are
 * discarded rather than folded with modulo, so every character is equally likely.
 * `random` is injectable for deterministic tests.
 */
export function generateShareCode(
  random: (size: number) => Buffer = randomBytes,
): string {
  let code = '';
  while (code.length < SHARE_CODE_LENGTH) {
    const bytes = random(SHARE_CODE_LENGTH * 2);
    for (const byte of bytes) {
      if (byte >= REJECTION_BOUND) continue;
      code += SHARE_CODE_ALPHABET[byte % SHARE_CODE_ALPHABET.length];
      if (code.length === SHARE_CODE_LENGTH) break;
    }
  }
  return code;
}

/**
 * Canonicalize user input ("7xkf-q2nd", "7XKF Q2ND") to the stored 8-char code.
 * Returns null when the cleaned input is not exactly 8 alphabet characters.
 */
export function normalizeShareCode(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[\s-]/g, '');
  if (cleaned.length !== SHARE_CODE_LENGTH) return null;
  for (const ch of cleaned) {
    if (!SHARE_CODE_ALPHABET.includes(ch)) return null;
  }
  return cleaned;
}

/** "7XKFQ2ND" -> "7XKF-Q2ND" for display. Unknown lengths pass through unchanged. */
export function formatShareCode(code: string): string {
  if (code.length !== SHARE_CODE_LENGTH) return code;
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
