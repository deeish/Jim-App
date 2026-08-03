import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import { View } from 'react-native';
import { palette, ColorPalette } from './colors';

/**
 * The app ships a single light theme, so this provider hands out one frozen
 * palette. It stays a context (rather than screens importing `palette` directly)
 * so that reintroducing a second mode later means changing this file alone —
 * every consumer already reads its colours through `useTheme()`.
 */

type ThemeContextValue = {
  colors: ColorPalette;
};

const value: ThemeContextValue = { colors: palette };

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeContext.Provider value={value}>
      {/* Paints behind the safe-area insets so notch/home-indicator areas match the app. */}
      <View style={{ flex: 1, backgroundColor: palette.background }}>
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
