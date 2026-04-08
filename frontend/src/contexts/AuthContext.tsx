import type { ReactNode } from 'react';
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import { applySupabaseAuthUrl } from '../lib/authDeepLink';
import { setSentryUser } from '../lib/sentry';

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** True after user opens password-reset link (must set new password before normal app use). */
  passwordRecoveryMode: boolean;
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
  const recoveryActiveRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

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
          await applySupabaseAuthUrl(supabase, initialUrl, () => {
            if (cancelled) return;
            recoveryActiveRef.current = true;
            setPasswordRecoveryMode(true);
          });
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
      void applySupabaseAuthUrl(supabase, url, () => {
        recoveryActiveRef.current = true;
        setPasswordRecoveryMode(true);
      });
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

  const signOut = useCallback(async () => {
    recoveryActiveRef.current = false;
    setPasswordRecoveryMode(false);
    await supabase.auth.signOut();
  }, []);

  const value: AuthContextValue = {
    user,
    session,
    loading,
    passwordRecoveryMode,
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
