import type { SupabaseClient } from '@supabase/supabase-js';
import {
  parseAuthParamsFromUrl,
  isPasswordRecoveryUrl,
  applySupabaseAuthUrl,
  createAuthUrlDeduper,
} from './authDeepLink';

const RESET_PATH = 'jimapp://auth/reset';

/** Minimal Supabase client stub exposing a mockable `auth.exchangeCodeForSession`. */
function mockClient(exchange: jest.Mock): SupabaseClient {
  return { auth: { exchangeCodeForSession: exchange } } as unknown as SupabaseClient;
}

describe('parseAuthParamsFromUrl', () => {
  it('extracts a PKCE code from the query string', () => {
    expect(parseAuthParamsFromUrl(`${RESET_PATH}?code=abc123&type=recovery`)).toEqual({
      code: 'abc123',
      type: 'recovery',
      error: null,
      error_description: null,
    });
  });

  it('extracts errors whether they arrive in the query or the hash', () => {
    expect(parseAuthParamsFromUrl(`${RESET_PATH}?error=access_denied&error_description=expired`)).toMatchObject({
      error: 'access_denied',
      error_description: 'expired',
    });
    expect(parseAuthParamsFromUrl(`${RESET_PATH}#error=otp_expired`)).toMatchObject({
      error: 'otp_expired',
    });
  });

  it('no longer surfaces access/refresh tokens (PKCE links never carry them)', () => {
    const parsed = parseAuthParamsFromUrl(`${RESET_PATH}#access_token=LEAK&refresh_token=LEAK`);
    expect(parsed).toEqual({ code: null, type: null, error: null, error_description: null });
  });

  it('returns all-null for a URL with no params', () => {
    expect(parseAuthParamsFromUrl(RESET_PATH)).toEqual({
      code: null,
      type: null,
      error: null,
      error_description: null,
    });
  });
});

describe('isPasswordRecoveryUrl', () => {
  it('is true for an explicit recovery type', () => {
    expect(isPasswordRecoveryUrl('jimapp://anything', 'recovery')).toBe(true);
  });

  it('is true for a code on the reset path', () => {
    expect(isPasswordRecoveryUrl(`${RESET_PATH}?code=abc`, null)).toBe(true);
  });

  it('is true for an error on the reset path (expired link redirect)', () => {
    expect(isPasswordRecoveryUrl(`${RESET_PATH}?error=access_denied`, null)).toBe(true);
  });

  it('is false for the reset path without a code, or a non-reset path', () => {
    expect(isPasswordRecoveryUrl(RESET_PATH, null)).toBe(false);
    expect(isPasswordRecoveryUrl('jimapp://auth/confirm?code=abc', null)).toBe(false);
  });
});

describe('createAuthUrlDeduper', () => {
  it('returns true the first time a URL is seen and false on repeats', () => {
    const shouldProcess = createAuthUrlDeduper();
    expect(shouldProcess(`${RESET_PATH}?code=abc`)).toBe(true);
    expect(shouldProcess(`${RESET_PATH}?code=abc`)).toBe(false);
    expect(shouldProcess(`${RESET_PATH}?code=abc`)).toBe(false);
  });

  it('treats distinct URLs (e.g. a freshly requested link) independently', () => {
    const shouldProcess = createAuthUrlDeduper();
    expect(shouldProcess(`${RESET_PATH}?code=first`)).toBe(true);
    expect(shouldProcess(`${RESET_PATH}?code=second`)).toBe(true);
  });

  it('does not share state between separate dedupers', () => {
    const a = createAuthUrlDeduper();
    const b = createAuthUrlDeduper();
    expect(a(`${RESET_PATH}?code=x`)).toBe(true);
    expect(b(`${RESET_PATH}?code=x`)).toBe(true);
  });
});

describe('applySupabaseAuthUrl', () => {
  it('rejects untrusted origins without attempting an exchange', async () => {
    const exchange = jest.fn();
    const result = await applySupabaseAuthUrl(mockClient(exchange), 'https://evil.example/auth/reset?code=abc');
    expect(result).toEqual({ recovery: false });
    expect(exchange).not.toHaveBeenCalled();
  });

  it('enters recovery only after a successful code exchange', async () => {
    const exchange = jest.fn().mockResolvedValue({ data: {}, error: null });
    const result = await applySupabaseAuthUrl(mockClient(exchange), `${RESET_PATH}?code=good`);
    expect(exchange).toHaveBeenCalledWith('good');
    expect(result).toEqual({ recovery: true });
  });

  it('surfaces an error (and does NOT enter recovery) when the exchange fails', async () => {
    const exchange = jest.fn().mockResolvedValue({ data: {}, error: { message: 'code expired' } });
    const result = await applySupabaseAuthUrl(mockClient(exchange), `${RESET_PATH}?code=stale`);
    expect(result.recovery).toBe(false);
    expect(result.error).toMatch(/expired/i);
  });

  it('treats a recovery link carrying an error param as an expired link', async () => {
    const exchange = jest.fn();
    const result = await applySupabaseAuthUrl(
      mockClient(exchange),
      `${RESET_PATH}?error=access_denied&error_description=otp_expired`,
    );
    expect(exchange).not.toHaveBeenCalled();
    expect(result.recovery).toBe(false);
    expect(result.error).toMatch(/expired/i);
  });

  it('errors on a stale implicit-flow recovery link with no PKCE code', async () => {
    const exchange = jest.fn();
    const result = await applySupabaseAuthUrl(mockClient(exchange), `${RESET_PATH}#access_token=OLD&type=recovery`);
    expect(exchange).not.toHaveBeenCalled();
    expect(result.recovery).toBe(false);
    expect(result.error).toMatch(/expired/i);
  });

  it('exchanges a non-recovery code (e.g. email confirm) without entering recovery', async () => {
    const exchange = jest.fn().mockResolvedValue({ data: {}, error: null });
    const result = await applySupabaseAuthUrl(mockClient(exchange), 'jimapp://auth/confirm?code=conf');
    expect(exchange).toHaveBeenCalledWith('conf');
    expect(result).toEqual({ recovery: false });
  });
});
