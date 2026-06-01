import type { ReactNode } from 'react';
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { AppState } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import { applySupabaseAuthUrl, type ApplyAuthUrlResult } from '../lib/authDeepLink';
import { setSentryUser } from '../lib/sentry';
import { cancelAllRequests } from '../api/client';

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** True after user opens password-reset link (must set new password before normal app use). */
  passwordRecoveryMode: boolean;
  /** Set when a deep link (e.g. an expired reset link) could not be applied; shown on the auth stack. */
  recoveryLinkError: string | null;
  /** Dismiss the recovery-link error (e.g. once the user starts typing on Login). */
  clearRecoveryLinkError: () => void;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  requestPasswordReset: (email: string) => Promise<{ error: Error | null }>;
  /** Call after a successful password update during recovery (fallback if auth event order varies). */
  clearPasswordRecoveryMode: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false);
  const [recoveryLinkError, setRecoveryLinkError] = useState<string | null>(null);
  const recoveryActiveRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    // Apply the outcome of a deep link. Recovery mode is entered ONLY when setSession
    // succeeded (result.recovery); a failed/expired link surfaces an error instead of
    // trapping the user on the set-new-password screen with no live session.
    const handleAuthUrlResult = (result: ApplyAuthUrlResult) => {
      if (cancelled) return;
      if (result.error) {
        recoveryActiveRef.current = false;
        setPasswordRecoveryMode(false);
        setRecoveryLinkError(result.error);
        return;
      }
      if (result.recovery) {
        recoveryActiveRef.current = true;
        setPasswordRecoveryMode(true);
        setRecoveryLinkError(null);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY') {
        recoveryActiveRef.current = true;
        setPasswordRecoveryMode(true);
      }
      if (event === 'USER_UPDATED' && recoveryActiveRef.current) {
        recoveryActiveRef.current = false;
        setPasswordRecoveryMode(false);
      }
      setSession(s);
      setUser(s?.user ?? null);
    });

    void (async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (!cancelled && initialUrl) {
          handleAuthUrlResult(await applySupabaseAuthUrl(supabase, initialUrl));
        }
      } catch (e) {
        console.warn('[auth] initial URL handling failed', e);
      }
      if (cancelled) return;
      const {
        data: { session: s },
      } = await supabase.auth.getSession();
      if (!cancelled) {
        setSession(s);
        setUser(s?.user ?? null);
        setLoading(false);
      }
    })();

    const linkSub = Linking.addEventListener('url', ({ url }) => {
      if (cancelled || !url) return;
      void (async () => {
        handleAuthUrlResult(await applySupabaseAuthUrl(supabase, url));
      })();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      linkSub.remove();
    };
  }, []);

  useEffect(() => {
    setSentryUser(user ? { id: user.id } : null);
  }, [user]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void supabase.auth.getSession();
      }
    });
    return () => sub.remove();
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error ?? null };
    },
    []
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signUp({ email, password });
      return { error: error ?? null };
    },
    []
  );

  const requestPasswordReset = useCallback(async (email: string) => {
    const redirectTo = Linking.createURL('auth/reset');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    return { error: error ?? null };
  }, []);

  const clearPasswordRecoveryMode = useCallback(() => {
    recoveryActiveRef.current = false;
    setPasswordRecoveryMode(false);
  }, []);

  const clearRecoveryLinkError = useCallback(() => {
    setRecoveryLinkError(null);
  }, []);

  const signOut = useCallback(async () => {
    recoveryActiveRef.current = false;
    setPasswordRecoveryMode(false);
    cancelAllRequests();
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('[auth] supabase signOut failed', e);
    }
    // Only clear local state after Supabase has acknowledged — prevents the navigation
    // from switching to the auth stack while the session is still live on the server.
    setSession(null);
    setUser(null);
  }, []);

  const value: AuthContextValue = {
    user,
    session,
    loading,
    passwordRecoveryMode,
    recoveryLinkError,
    clearRecoveryLinkError,
    signIn,
    signUp,
    requestPasswordReset,
    clearPasswordRecoveryMode,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
