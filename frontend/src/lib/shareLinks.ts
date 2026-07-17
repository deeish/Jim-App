import { formatShareCode, normalizeShareCode } from './shareCode';

/**
 * Share deep links use a PATH segment (jimapp://share/CODE), never a `?code=`
 * query param: AuthContext treats any trusted link carrying `?code=` as a
 * Supabase PKCE authorization code (see authDeepLink.ts) and must keep doing so.
 */
export function buildShareUrl(code: string): string {
  return `jimapp://share/${code}`;
}

export function buildShareMessage(options: {
  kind: 'plan' | 'workout';
  name: string;
  code: string;
}): string {
  const what =
    options.kind === 'plan' ? 'my workout plan' : 'a workout';
  const url = buildShareUrl(options.code);
  const display = formatShareCode(options.code);
  return (
    `I'm sharing ${what} "${options.name}" with you on Jim! ` +
    `Open ${url} on your phone, or enter code ${display} in Jim under Profile then "Redeem a share code".`
  );
}

/**
 * Extract a share code from an incoming deep link, or null when the URL is not
 * a share link. Accepts:
 *   jimapp://share/CODE          (standalone builds; QR payload)
 *   jimapp:///share/CODE         (extra slash variant)
 *   exp://<host>/--/share/CODE   (Expo Go dev client)
 * Scheme, host, and the "share" segment are case-insensitive; the code may be
 * dashed/lowercase. Anything else (including every auth/* PKCE link) is null.
 */
export function parseShareCodeFromUrl(url: string): string | null {
  if (!url) return null;
  const beforeQuery = url.split(/[?#]/)[0];
  const lower = beforeQuery.toLowerCase();

  let rest: string;
  if (lower.startsWith('jimapp://')) {
    rest = beforeQuery.slice('jimapp://'.length);
  } else if (lower.startsWith('exp://')) {
    const marker = beforeQuery.indexOf('/--/');
    if (marker < 0) return null;
    rest = beforeQuery.slice(marker + '/--/'.length);
  } else {
    return null;
  }

  const segments = rest.split('/').filter((s) => s.length > 0);
  if (segments.length !== 2) return null;
  if (segments[0].toLowerCase() !== 'share') return null;
  return normalizeShareCode(segments[1]);
}
