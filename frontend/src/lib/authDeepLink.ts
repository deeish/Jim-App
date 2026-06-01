import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Schemes/hosts allowed to deliver Supabase auth tokens via deep link. Anything else is rejected
 * to prevent a malicious app from forcing a session-fixation by handing us tokens it controls.
 */
const TRUSTED_LINK_PREFIXES = ['jimapp://', 'exp://', 'https://jmfshcpgtuqdjmtpexqg.supabase.co'];

function isTrustedAuthLink(url: string): boolean {
  return TRUSTED_LINK_PREFIXES.some((prefix) => url.startsWith(prefix));
}

/** Parse Supabase implicit auth params from `#access_token=...` or `?...` query string. */
export function parseAuthParamsFromUrl(url: string): {
  access_token: string | null;
  refresh_token: string | null;
  type: string | null;
  error: string | null;
  error_description: string | null;
} {
  try {
    const hashIdx = url.indexOf('#');
    const qIdx = url.indexOf('?');
    let paramString = '';
    if (hashIdx >= 0) paramString = url.slice(hashIdx + 1);
    else if (qIdx >= 0) paramString = url.slice(qIdx + 1);
    if (!paramString) {
      return {
        access_token: null,
        refresh_token: null,
        type: null,
        error: null,
        error_description: null,
      };
    }
    const params = new URLSearchParams(paramString);
    return {
      access_token: params.get('access_token'),
      refresh_token: params.get('refresh_token'),
      type: params.get('type'),
      error: params.get('error'),
      error_description: params.get('error_description'),
    };
  } catch {
    return {
      access_token: null,
      refresh_token: null,
      type: null,
      error: null,
      error_description: null,
    };
  }
}

/** True when this URL is almost certainly our password-reset deep link (tokens + reset path or type). */
export function isPasswordRecoveryUrl(url: string, type: string | null): boolean {
  if (type === 'recovery') return true;
  const lower = url.toLowerCase();
  if (!lower.includes('auth/reset') && !lower.includes('auth%2freset')) return false;
  return /[#&?]access_token=/.test(url);
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
 * Apply tokens from a deep link (e.g. password recovery email). Recovery is only reported once
 * `setSession` actually succeeds — an expired/invalid link returns `{ recovery: false, error }`
 * so callers never trap the user on the set-new-password screen without a live session.
 */
export async function applySupabaseAuthUrl(
  client: SupabaseClient,
  url: string,
): Promise<ApplyAuthUrlResult> {
  if (!isTrustedAuthLink(url)) {
    console.warn('[auth] rejecting deep link from untrusted origin');
    return { recovery: false };
  }
  const parsed = parseAuthParamsFromUrl(url);
  const { access_token, refresh_token, type, error, error_description } = parsed;
  const isRecovery = isPasswordRecoveryUrl(url, type);
  if (error) {
    console.warn(
      '[auth] deep link error:',
      error,
      error_description ?? '',
    );
    return { recovery: false, error: isRecovery ? RECOVERY_LINK_FAILED : SIGN_IN_LINK_FAILED };
  }
  if (!access_token || !refresh_token) return { recovery: false };
  const { error: sessionError } = await client.auth.setSession({
    access_token,
    refresh_token,
  });
  if (sessionError) {
    console.warn('[auth] setSession from deep link failed:', sessionError.message);
    return { recovery: false, error: isRecovery ? RECOVERY_LINK_FAILED : SIGN_IN_LINK_FAILED };
  }
  return { recovery: isRecovery };
}
