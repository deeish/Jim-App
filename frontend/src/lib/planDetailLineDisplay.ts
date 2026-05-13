const COACH_ADVICE_BULLET = /^coach\s*advice$/i;

/**
 * Removes legacy "Coach advice" bullets from plan slot `detailLine` or workout `focus` strings
 * (stored copy or old preview text). Normalizes middle dots to `•` before splitting.
 */
export function stripCoachAdviceBullets(text: string | null | undefined): string {
  if (text == null || !String(text).trim()) return '';
  const normalized = String(text).replace(/·/g, '•');
  const parts = normalized
    .split(/\s*•\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !COACH_ADVICE_BULLET.test(s));
  return parts.join(' • ');
}
