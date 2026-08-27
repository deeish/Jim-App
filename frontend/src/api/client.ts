import axios, { InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '../config/api';
import { supabase } from '../lib/supabase';
import { singleFlight } from '../lib/singleFlight';

/**
 * ⚠ ONE refresh at a time, shared by every 401 in flight.
 *
 * Supabase ROTATES the refresh token: the first `refreshSession()` consumes it
 * and issues a new pair, so a second concurrent call presents a token that no
 * longer exists and fails. The old code read that failure as "the session is
 * dead" and called `signOut()` — even though the other call had just
 * refreshed successfully.
 *
 * That is not an exotic race. Home and Plan both fetch on app open, so on a
 * cold start with an expired access token two requests routinely 401 together,
 * which is exactly when it fires: the user is bounced to the login screen at
 * launch having done nothing wrong.
 *
 * Deliberately NOT also short-circuiting on "someone already refreshed, just
 * retry with the current token". It would save a rotation, but it is a second
 * mechanism with its own failure modes, and the single flight is what fixes
 * the bug.
 */
const refreshAccessToken = singleFlight(async (): Promise<string | null> => {
  try {
    const {
      data: { session },
    } = await supabase.auth.refreshSession();
    return session?.access_token ?? null;
  } catch {
    return null;
  }
});

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

let _abortController = new AbortController();

export function cancelAllRequests() {
  _abortController.abort();
  _abortController = new AbortController();
}

api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    config.signal = _abortController.signal;
    let {
      data: { session },
    } = await supabase.auth.getSession();
    // On web, session can take a moment to hydrate from storage; retry a few times
    for (let i = 0; i < 3 && !session?.access_token; i++) {
      await new Promise((r) => setTimeout(r, 80 * (i + 1)));
      const again = await supabase.auth.getSession();
      session = again.data.session;
    }
    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
    }
    if (__DEV__ && config.url?.includes('plans')) {
      const method = (config.method ?? 'get').toUpperCase();
      const fullUrl = config.baseURL ? `${config.baseURL.replace(/\/$/, '')}${config.url?.startsWith('/') ? '' : '/'}${config.url ?? ''}` : config.url;
      console.log(`[API] ${method}`, fullUrl, '| token:', !!session?.access_token);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// On 401 with a token we sent = invalid/expired → sign out. If we never sent a token, don't sign out (avoids race where session wasn't attached yet).
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (__DEV__ && error.config) {
      const fullUrl = error.config.baseURL
        ? `${error.config.baseURL.replace(/\/$/, '')}${error.config.url?.startsWith('/') ? '' : '/'}${error.config.url ?? ''}`
        : error.config.url;
      const status = error.response?.status;
      const code = (error as { code?: string }).code;
      if (status === 404) {
        console.warn('[API] 404 Not Found:', fullUrl, '– Check that the backend is running and the route exists.');
      } else if (code === 'ECONNABORTED') {
        console.warn('[API] Request timed out:', fullUrl);
      } else if (code === 'ERR_NETWORK' || code === 'ECONNREFUSED') {
        console.warn('[API] Connection failed:', fullUrl, '– Start backend: cd backend && npm run start:dev');
      } else if (status && status >= 400) {
        console.warn('[API] Error', status, fullUrl);
      }
    }
    if (error.response?.status === 401) {
      const config = error.config as (typeof error.config) & { _isRetry?: boolean };
      const headers = config?.headers as Record<string, string> | undefined;
      const hadToken = !!(headers?.Authorization ?? headers?.authorization);
      if (hadToken && !config?._isRetry) {
        const accessToken = await refreshAccessToken();
        if (accessToken) {
          config._isRetry = true;
          (config.headers as Record<string, string>).Authorization = `Bearer ${accessToken}`;
          return api.request(config);
        }
        // Only now is the session genuinely unusable: the ONE refresh everyone
        // shared came back empty. Signing out here can no longer be triggered
        // by a sibling request having rotated the token first.
        await supabase.auth.signOut();
      }
    }
    return Promise.reject(error);
  }
);
