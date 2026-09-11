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
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import type { ProviderCredential } from '../lib/authProviders';
import {
  applySupabaseAuthUrl,
  createAuthUrlDeduper,
  type ApplyAuthUrlResult,
} from '../lib/authDeepLink';
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
  /**
   * Whether this device has ever held a session. `null` until read from disk.
   * Decides whether a signed-out launch opens on the Welcome screen (never signed
   * in here) or straight on Sign in (a returning person who signed out).
   */
  hasSignedInBefore: boolean | null;
  /** Password fallback for accounts that have one. */
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  /** Emails a 6-digit code; creates the account on first use. */
  sendEmailCode: (email: string) => Promise<{ error: Error | null }>;
  /** Exchanges the emailed code for a session. */
  verifyEmailCode: (email: string, code: string) => Promise<{ error: Error | null }>;
  /** Sign in with Apple / Google via a native identity token. */
  signInWithProvider: (credential: ProviderCredential) => Promise<{ error: Error | null }>;
  /** Call after a successful password update during recovery (fallback if auth event order varies). */
  clearPasswordRecoveryMode: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Device-local, not per-user: "has anyone ever signed in on this install". */
const SIGNED_IN_BEFORE_KEY = 'jim_auth_seen_v1';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false);
  const [recoveryLinkError, setRecoveryLinkError] = useState<string | null>(null);
  const [hasSignedInBefore, setHasSignedInBefore] = useState<boolean | null>(null);
  const recoveryActiveRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(SIGNED_IN_BEFORE_KEY)
      .then((v) => {
        if (!cancelled) setHasSignedInBefore(v === '1');
      })
      .catch(() => {
        if (!cancelled) setHasSignedInBefore(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The first session this install ever sees flips the flag for good.
  useEffect(() => {
    if (!session || hasSignedInBefore) return;
    setHasSignedInBefore(true);
    AsyncStorage.setItem(SIGNED_IN_BEFORE_KEY, '1').catch(() => {});
  }, [session, hasSignedInBefore]);

  useEffect(() => {
    let cancelled = false;
    // Single-use PKCE codes must not be exchanged twice — dedupe across the two delivery paths
    // (initial URL + `url` events) and repeat taps so a consumed code can't masquerade as expired.
    const shouldProcessUrl = createAuthUrlDeduper();

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

    const processAuthUrl = async (url: string) => {
      if (!shouldProcessUrl(url)) return;
      handleAuthUrlResult(await applySupabaseAuthUrl(supabase, url));
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
          await processAuthUrl(initialUrl);
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
      void processAuthUrl(url);
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

  const sendEmailCode = useCallback(async (email: string) => {
    // `shouldCreateUser: true` is what makes this one screen serve both log in and
    // sign up: an unknown address gets an account the moment its code is verified.
    // The email template must render `{{ .Token }}` (a 6-digit code), not a magic
    // link — see docs/auth-sign-in-setup.md.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    return { error: error ?? null };
  }, []);

  const verifyEmailCode = useCallback(async (email: string, code: string) => {
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    return { error: error ?? null };
  }, []);

  const signInWithProvider = useCallback(async (credential: ProviderCredential) => {
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: credential.provider,
      token: credential.token,
    });
    if (error) return { error };
    // Apple sends the name once, on the first authorization, and never again.
    // Store it on the auth user so Profile / Home / Crew can greet the person.
    const existing = data.user?.user_metadata?.full_name;
    if (credential.fullName && !(typeof existing === 'string' && existing.trim())) {
      const { error: metaError } = await supabase.auth.updateUser({
        data: { full_name: credential.fullName },
      });
      if (metaError) console.warn('[auth] could not store provider name', metaError);
    }
    return { error: null };
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
    hasSignedInBefore,
    signIn,
    sendEmailCode,
    verifyEmailCode,
    signInWithProvider,
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
