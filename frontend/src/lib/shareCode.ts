/**
 * Share-code helpers, mirroring backend/src/shares/share-code.ts (the monorepo
 * has no shared package). Codes are 8 chars from a 30-char alphabet with the
 * ambiguous 0/O, 1/I/L and U removed; the server is the only code generator.
 */
export const SHARE_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const SHARE_CODE_LENGTH = 8;

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

export function isValidShareCode(input: string): boolean {
  return normalizeShareCode(input) !== null;
}

/** "7XKFQ2ND" -> "7XKF-Q2ND" for display. Unknown lengths pass through unchanged. */
export function formatShareCode(code: string): string {
  if (code.length !== SHARE_CODE_LENGTH) return code;
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * Live-format a code as the user types: uppercase, strip invalid characters,
 * insert the display dash after the fourth character. Safe to feed back into a
 * TextInput onChangeText loop.
 */
export function formatShareCodeInput(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .split('')
    .filter((ch) => SHARE_CODE_ALPHABET.includes(ch))
    .join('')
    .slice(0, SHARE_CODE_LENGTH);
  if (cleaned.length <= 4) return cleaned;
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
}
