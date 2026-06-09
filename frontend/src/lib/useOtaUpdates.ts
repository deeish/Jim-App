import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

/**
 * Checks for an EAS Update and keeps the running JS bundle fresh.
 *
 * - Cold start: fetch and reload immediately so a fresh launch runs the latest JS.
 * - Foreground: fetch quietly only. The update applies on the *next* cold start,
 *   so resuming the app never interrupts an in-progress session (e.g. an active
 *   workout) with a surprise reload.
 *
 * No-ops in dev (`__DEV__`) and when updates are disabled (Expo Go / a build
 * without the updater embedded), so it's safe to call unconditionally.
 */
export function useOtaUpdates(): void {
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;

    let cancelled = false;

    const applyNow = async () => {
      try {
        const { isAvailable } = await Updates.checkForUpdateAsync();
        if (cancelled || !isAvailable) return;
        await Updates.fetchUpdateAsync();
        if (!cancelled) await Updates.reloadAsync();
      } catch {
        // Offline or update server unreachable — keep running the current bundle.
      }
    };

    const prefetch = async () => {
      try {
        const { isAvailable } = await Updates.checkForUpdateAsync();
        if (!cancelled && isAvailable) await Updates.fetchUpdateAsync();
      } catch {
        // Ignore — a later cold start will retry.
      }
    };

    applyNow();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') prefetch();
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);
}
