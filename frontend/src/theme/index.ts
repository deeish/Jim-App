/**
 * Theme entrypoint — import from `'../theme'` or `'@/theme'` for colors, context,
 * scales, and helpers.
 *
 * Colour is the one themeable axis, so it is read through `useTheme()`. Everything
 * else here is a constant and is imported directly:
 *
 *   import { useTheme } from '../theme';
 *   import { spacing, radius, text, weight, elevation } from '../theme';
 *
 * That split is deliberate. Many screens build their `StyleSheet.create` block at
 * module scope, where a hook cannot run — a direct import is the only form that
 * works both there and inside a `useMemo(..., [colors])`.
 */
export type { ColorPalette } from './colors';
export { palette, darkPalette, colors, muscleGroupColors, planSlotIconColors, SOFT_ALPHA } from './colors';
export type { PlanSlotIconColors } from './colors';
export { ThemeProvider, useTheme } from './ThemeContext';
export type { ThemeMode } from './ThemeContext';

export { spacing } from './spacing';
export type { SpacingToken } from './spacing';

export { radius } from './radius';
export type { RadiusToken } from './radius';

export { text, leading, weight, tracking } from './typography';
export type { TextToken, WeightToken } from './typography';

export { elevation, elevationUp } from './elevation';
export type { ElevationToken } from './elevation';

export { duration, easing, spring, PRESS_SCALE } from './motion';
