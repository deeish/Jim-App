/**
 * Theme entrypoint — import from `'../theme'` or `'@/theme'` for colors, context, and helpers.
 */
export type { ColorPalette } from './colors';
export { darkColors, lightColors, colors, planSlotIconColors } from './colors';
export type { PlanSlotIconColors } from './colors';
export { ThemeProvider, useTheme } from './ThemeContext';
export type { ThemeMode } from './ThemeContext';
