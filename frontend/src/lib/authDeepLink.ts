import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Schemes/hosts allowed to deliver Supabase auth links via deep link. Anything else is rejected.
 * Note: the app's own `jimapp://` scheme is necessarily trusted, so this list does NOT by itself
 * stop a hostile link — the PKCE flow (below) is what defeats session fixation: a `?code=` is
 * useless without the matching code-verifier this device generated when it started the flow.
 */
const TRUSTED_LINK_PREFIXES = ['jimapp://', 'exp://', 'https://jmfshcpgtuqdjmtpexqg.supabase.co'];

function isTrustedAuthLink(url: string): boolean {
  return TRUSTED_LINK_PREFIXES.some((prefix) => url.startsWith(prefix));
}

/**
 * Parse Supabase PKCE auth params from a deep link. The authorization `code` arrives in the query
 * string (`?code=...`); errors may arrive in either the query or the hash. We deliberately no
 * longer read `access_token`/`refresh_token` — under PKCE the link never carries live tokens.
 */
export function parseAuthParamsFromUrl(url: string): {
  code: string | null;
  type: string | null;
  error: string | null;
  error_description: string | null;
} {
  const empty = { code: null, type: null, error: null, error_description: null };
  try {
    const hashIdx = url.indexOf('#');
    const qIdx = url.indexOf('?');
    // PKCE puts the code in the query; merge both query and hash so errors are caught either way.
    const segments: string[] = [];
    if (qIdx >= 0) {
      const end = hashIdx > qIdx ? hashIdx : url.length;
      segments.push(url.slice(qIdx + 1, end));
    }
    if (hashIdx >= 0) segments.push(url.slice(hashIdx + 1));
    if (segments.length === 0) return empty;
    const params = new URLSearchParams(segments.join('&'));
    return {
      code: params.get('code'),
      type: params.get('type'),
      error: params.get('error'),
      error_description: params.get('error_description'),
    };
  } catch {
    return empty;
  }
}

/**
 * True when this URL is our password-reset deep link: an explicit recovery type, or our reset path
 * carrying a code (success) or an error (e.g. an expired link redirects to `auth/reset?error=...`).
 */
export function isPasswordRecoveryUrl(url: string, type: string | null): boolean {
  if (type === 'recovery') return true;
  const lower = url.toLowerCase();
  if (!lower.includes('auth/reset') && !lower.includes('auth%2freset')) return false;
  return /[#&?](code|error)=/.test(url);
}

export type ApplyAuthUrlResult = {
  /** True only when a password-recovery session was successfully established. */
  recovery: boolean;
  /** User-facing message when the link could not be applied (e.g. expired/invalid token). */
  error?: string;
};

const RECOVERY_LINK_FAILED =
  'Your password reset link is invalid or has expired. Please request a new one.';
const SIGN_IN_LINK_FAILED =
  "We couldn't sign you in from that link. Please try signing in again.";

/**
 * Apply a PKCE auth code from a deep link (e.g. password recovery email). The code is exchanged for
 * a session via `exchangeCodeForSession`, which only succeeds if this device holds the code-verifier
 * it stored when the flow was initiated — so a link an attacker hands us cannot install a session.
 *
 * Recovery is reported only after the exchange succeeds; an expired/invalid link (or a stale
 * implicit-flow link from before PKCE was enabled) returns `{ recovery: false, error }` so callers
 * never trap the user on the set-new-password screen without a live session.
 */
export async function applySupabaseAuthUrl(
  client: SupabaseClient,
  url: string,
): Promise<ApplyAuthUrlResult> {
  if (!isTrustedAuthLink(url)) {
    console.warn('[auth] rejecting deep link from untrusted origin');
    return { recovery: false };
  }
  const { code, type, error, error_description } = parseAuthParamsFromUrl(url);
  const isRecovery = isPasswordRecoveryUrl(url, type);
  if (error) {
    console.warn('[auth] deep link error:', error, error_description ?? '');
    return { recovery: false, error: isRecovery ? RECOVERY_LINK_FAILED : SIGN_IN_LINK_FAILED };
  }
  if (!code) {
    // A recovery-looking link with no PKCE code is a stale implicit-flow link (issued before PKCE
    // was enabled). Surface a friendly error so the user requests a fresh one; ignore otherwise.
    return isRecovery ? { recovery: false, error: RECOVERY_LINK_FAILED } : { recovery: false };
  }
  const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    console.warn('[auth] exchangeCodeForSession from deep link failed:', exchangeError.message);
    return { recovery: false, error: isRecovery ? RECOVERY_LINK_FAILED : SIGN_IN_LINK_FAILED };
  }
  return { recovery: isRecovery };
}
