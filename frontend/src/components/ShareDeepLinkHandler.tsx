import { useCallback, useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import { parseShareCodeFromUrl } from '../lib/shareLinks';
import type { RootNavigatorParamList } from '../types/navigation';

/**
 * On a cold start the launch URL can be delivered twice (getInitialURL AND the
 * 'url' listener). Dedupe only inside this window; a user re-tapping the same
 * link later must navigate again.
 */
const INITIAL_URL_DEDUPE_MS = 5000;
/** The navigator mounts a beat after auth/prefs settle; retry briefly. */
const READY_RETRY_DELAYS_MS = [100, 400, 1200];

/**
 * Headless listener for jimapp://share/CODE deep links (QR scans, tapped
 * links). Auth URLs are untouched: parseShareCodeFromUrl returns null for
 * anything that is not a share path, and AuthContext keeps its own listener.
 *
 * Navigation is deferred until the user is signed in, onboarding is complete,
 * and the navigator is mounted, so a link tapped from a text can survive app
 * launch, login, and onboarding before landing on the redeem screen.
 */
export default function ShareDeepLinkHandler({
  navigationRef,
}: {
  navigationRef: NavigationContainerRefWithCurrent<RootNavigatorParamList>;
}) {
  const { session, passwordRecoveryMode } = useAuth();
  const { hasCompletedOnboarding, hydrated } = useUserPreferences();

  const canNavigate =
    !!session && !passwordRecoveryMode && hydrated && hasCompletedOnboarding;

  const pendingCodeRef = useRef<string | null>(null);
  const retryTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const initialUrlRef = useRef<string | null>(null);
  const mountedAtRef = useRef(Date.now());
  const canNavigateRef = useRef(canNavigate);
  canNavigateRef.current = canNavigate;

  const clearRetries = () => {
    for (const timer of retryTimersRef.current) clearTimeout(timer);
    retryTimersRef.current = [];
  };

  const tryFlush = useCallback(() => {
    const code = pendingCodeRef.current;
    if (!code) return;
    if (!canNavigateRef.current || !navigationRef.isReady()) return;
    pendingCodeRef.current = null;
    clearRetries();
    navigationRef.navigate('ShareRedeem', { code });
  }, [navigationRef]);

  /**
   * Flush now if possible; otherwise retry briefly. The retries cover the gap
   * between a state flip (session/onboarding settles) and the navigator
   * actually registering its screens — this handler is an earlier sibling of
   * the navigator, so its effects can run first in the same commit.
   */
  const flushWithRetries = useCallback(() => {
    tryFlush();
    if (pendingCodeRef.current) {
      clearRetries();
      retryTimersRef.current = READY_RETRY_DELAYS_MS.map((delay) =>
        setTimeout(tryFlush, delay),
      );
    }
  }, [tryFlush]);

  const handleCode = useCallback(
    (code: string) => {
      pendingCodeRef.current = code;
      flushWithRetries();
    },
    [flushWithRetries],
  );

  // Stashed link flushes as soon as sign-in/onboarding/recovery state allows.
  useEffect(() => {
    if (canNavigate && pendingCodeRef.current) flushWithRetries();
  }, [canNavigate, flushWithRetries]);

  useEffect(() => {
    let cancelled = false;

    Linking.getInitialURL().then((url) => {
      if (cancelled || !url) return;
      initialUrlRef.current = url;
      const code = parseShareCodeFromUrl(url);
      if (code) handleCode(code);
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      const isInitialEcho =
        url === initialUrlRef.current &&
        Date.now() - mountedAtRef.current < INITIAL_URL_DEDUPE_MS;
      if (isInitialEcho) return;
      const code = parseShareCodeFromUrl(url);
      if (code) handleCode(code);
    });

    return () => {
      cancelled = true;
      subscription.remove();
      clearRetries();
    };
  }, [handleCode]);

  return null;
}
