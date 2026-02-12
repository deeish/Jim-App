import axios, { InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '../config/api';
import { supabase } from '../lib/supabase';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
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
      const headers = error.config?.headers as Record<string, string> | undefined;
      const hadToken = !!(headers?.Authorization ?? headers?.authorization);
      if (hadToken) {
        await supabase.auth.signOut();
      }
    }
    return Promise.reject(error);
  }
);
