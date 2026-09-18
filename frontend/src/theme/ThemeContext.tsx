import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, Platform, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkPalette, palette, ColorPalette } from './colors';
import { readThemeModeSync, writeThemeModeSync } from '../lib/themeStore';

/**
 * Light / dark selection for the app's two palettes (`palette` = light,
 * `darkPalette` = the Blackout scheme). The choice is manual and binary —
 * Dylan's call: a Light | Dark control in Profile, no system-following —
 * persisted to AsyncStorage so it survives restarts.
 *
 * The saved mode is read synchronously at launch (lib/themeStore.ts, the
 * keychain on native, localStorage on web), so the very first frame is
 * already the right theme; AsyncStorage keeps a copy for the phones that
 * saved the choice before the sync store existed.
 */

export type ThemeMode = 'light' | 'dark';

/** AsyncStorage key (web: plain localStorage — seedable in headless drives). */
const STORAGE_KEY = 'jim_theme_v1';

type ThemeContextValue = {
  colors: ColorPalette;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => readThemeModeSync() ?? 'light');

  // Migration: a phone that chose dark before the sync store existed has it
  // only in AsyncStorage. One launch on the light frame, then it is copied.
  useEffect(() => {
    if (readThemeModeSync() !== null) return;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'dark') {
          setModeState('dark');
          writeThemeModeSync('dark');
        }
      })
      .catch(() => {});
  }, []);

  // Tell UIKit which mode the app is in. Our colours are all JS, but the
  // system still draws some chrome itself in ITS interface style: on iOS 26
  // the Liquid Glass pill behind a header's custom back control, alerts,
  // the keyboard, share sheets. With the app pinned to Light (app.json
  // `userInterfaceStyle` used to be "light") that pill rendered as LIGHT
  // glass during every push/pop/press on the dark theme and then settled
  // dark — Dylan's build-32 recording (2026-09-15): "Month/Week/Day flash
  // the light colour". Needs `userInterfaceStyle: "automatic"` in app.json
  // for the override to take effect (a binary change). iOS only: on Android
  // this call can recreate the Activity.
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    Appearance.setColorScheme(mode);
  }, [mode]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: mode === 'dark' ? darkPalette : palette,
      mode,
      setMode: (next: ThemeMode) => {
        setModeState(next);
        writeThemeModeSync(next);
        AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      },
    }),
    [mode],
  );

  return (
    <ThemeContext.Provider value={value}>
      {/* Paints behind the safe-area insets so notch/home-indicator areas match the app. */}
      <View style={{ flex: 1, backgroundColor: value.colors.background }}>
        {children}
      </View>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
