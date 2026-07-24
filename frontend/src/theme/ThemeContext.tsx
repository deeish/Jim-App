import type { ReactNode } from 'react';
import { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors, ColorPalette } from './colors';

export type ThemeMode = 'light' | 'dark';

/**
 * Device-level, not per-user: this is a display preference for whoever is
 * holding the phone, so it deliberately does NOT use the per-user key scheme
 * that `UserPreferencesContext` uses for training settings.
 */
const STORAGE_KEY = 'jim_theme_v1';
const DEFAULT_THEME: ThemeMode = 'dark';

const isThemeMode = (value: string | null): value is ThemeMode =>
  value === 'light' || value === 'dark';

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  colors: ColorPalette;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(DEFAULT_THEME);

  // Restore the saved choice on mount. No flash to guard against: App.tsx holds
  // the branded loader over everything for LOADING_MIN_DISPLAY_MS (1500ms) from
  // launch, and this read resolves in single-digit milliseconds, so the app is
  // never actually visible in the pre-restore theme.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (!cancelled && isThemeMode(saved)) setThemeState(saved);
      })
      // A failed read just leaves the default in place, which is the same
      // behaviour as before this was persisted at all.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    // Fire and forget: switching theme must not wait on storage, and a failed
    // write costs only the preference on next launch, not the current toggle.
    void AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      colors: theme === 'dark' ? darkColors : lightColors,
      isDark: theme === 'dark',
    }),
    [theme, setTheme]
  );
  const backgroundColor = theme === 'dark' ? darkColors.background : lightColors.background;
  return (
    <ThemeContext.Provider value={value}>
      <View style={{ flex: 1, backgroundColor }}>
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
