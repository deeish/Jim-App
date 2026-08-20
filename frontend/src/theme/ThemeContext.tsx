import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkPalette, palette, ColorPalette } from './colors';

/**
 * Light / dark selection for the app's two palettes (`palette` = light,
 * `darkPalette` = the Blackout scheme). The choice is manual and binary —
 * Dylan's call: a Light | Dark control in Profile, no system-following —
 * persisted to AsyncStorage so it survives restarts.
 *
 * Hydration is async, so the first frames render light before a saved 'dark'
 * lands; the launch loader overlay covers that window in practice.
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
  const [mode, setModeState] = useState<ThemeMode>('light');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'dark') setModeState('dark');
      })
      .catch(() => {});
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: mode === 'dark' ? darkPalette : palette,
      mode,
      setMode: (next: ThemeMode) => {
        setModeState(next);
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
