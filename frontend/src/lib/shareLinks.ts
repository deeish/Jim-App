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

/** jimapp://crew/CODE — the crew invite link (QR payload + share sheet). */
export function buildCrewUrl(code: string): string {
  return `jimapp://crew/${code}`;
}

export function buildCrewInviteMessage(options: {
  crewName: string | null;
  code: string;
}): string {
  const crew = options.crewName ? `"${options.crewName}"` : 'my crew';
  const url = buildCrewUrl(options.code);
  const display = formatShareCode(options.code);
  return (
    `Join ${crew} on Jim! Open ${url} on your phone, ` +
    `or enter code ${display} in the Crew tab.`
  );
}

/**
 * Extract the code from a deep link whose path is `<segment>/CODE`, or null.
 * Accepts:
 *   jimapp://<segment>/CODE          (standalone builds; QR payload)
 *   jimapp:///<segment>/CODE         (extra slash variant)
 *   exp://<host>/--/<segment>/CODE   (Expo Go dev client)
 * Scheme, host, and the segment are case-insensitive; the code may be
 * dashed/lowercase. Anything else (including every auth/* PKCE link) is null.
 */
function parsePathCode(url: string, segment: string): string | null {
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
  if (segments[0].toLowerCase() !== segment) return null;
  return normalizeShareCode(segments[1]);
}

/** Share code from an incoming link (jimapp://share/CODE family), or null. */
export function parseShareCodeFromUrl(url: string): string | null {
  return parsePathCode(url, 'share');
}

/** Crew code from an incoming link (jimapp://crew/CODE family), or null. */
export function parseCrewCodeFromUrl(url: string): string | null {
  return parsePathCode(url, 'crew');
}
