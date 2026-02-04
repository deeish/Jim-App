import type { ReactNode } from 'react';
import { createContext, useContext, useState, useMemo } from 'react';
import { View } from 'react-native';
import { darkColors, lightColors, ColorPalette } from './colors';

export type ThemeMode = 'light' | 'dark';

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  colors: ColorPalette;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const value = useMemo(
    () => ({
      theme,
      setTheme,
      colors: theme === 'dark' ? darkColors : lightColors,
      isDark: theme === 'dark',
    }),
    [theme]
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
