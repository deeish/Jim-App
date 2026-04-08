import type { SupabaseClient } from '@supabase/supabase-js';

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

/**
 * Apply tokens from a deep link (e.g. password recovery email). Call `onRecovery` before setSession
 * when `type=recovery` so UI can show SetNewPassword even if PASSWORD_RECOVERY fires late.
 */
export async function applySupabaseAuthUrl(
  client: SupabaseClient,
  url: string,
  onRecovery: () => void,
): Promise<void> {
  const parsed = parseAuthParamsFromUrl(url);
  const { access_token, refresh_token, type, error, error_description } = parsed;
  if (error) {
    console.warn(
      '[auth] deep link error:',
      error,
      error_description ?? '',
    );
    return;
  }
  if (!access_token || !refresh_token) return;
  if (isPasswordRecoveryUrl(url, type)) onRecovery();
  const { error: sessionError } = await client.auth.setSession({
    access_token,
    refresh_token,
  });
  if (sessionError) {
    console.warn('[auth] setSession from deep link failed:', sessionError.message);
  }
}
