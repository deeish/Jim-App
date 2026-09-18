import { Platform } from 'react-native';
import type { ThemeMode } from '../theme/ThemeContext';

/**
 * The theme choice, readable SYNCHRONOUSLY at module load (2026-09-18).
 *
 * The provider used to start on 'light' and learn the saved 'dark' from
 * AsyncStorage a few frames later, so a dark-theme user's first frames, the
 * cold-start loader included, were always light. Dylan: "the loading screen
 * is always in light". A synchronous store fixes it at the root: native
 * reads the keychain through expo-secure-store's sync `getItem` (a theme
 * flag is not a secret, but the keychain is the one store with a sync read
 * that ships in this binary), web reads localStorage. AsyncStorage keeps its
 * copy so the value already saved on a phone migrates on first launch.
 *
 * The native module is required inside a try: a bare native require at the
 * top of a module white-screens an older binary that lacks it (twice in
 * this app's history), and this file loads before anything else.
 */
const KEY = 'jim_theme_v1';

function secureStore(): { getItem?: (k: string) => string | null; setItem?: (k: string, v: string) => void } | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
    return require('expo-secure-store');
  } catch {
    return null;
  }
}

export function readThemeModeSync(): ThemeMode | null {
  try {
    if (Platform.OS === 'web') {
      const v = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
      return v === 'dark' || v === 'light' ? v : null;
    }
    const v = secureStore()?.getItem?.(KEY) ?? null;
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

export function writeThemeModeSync(mode: ThemeMode): void {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, mode);
      return;
    }
    secureStore()?.setItem?.(KEY, mode);
  } catch {
    /* the async copy still lands */
  }
}

export const THEME_STORAGE_KEY = KEY;
