import { MaterialCommunityIcons } from '@expo/vector-icons';

/**
 * Visual identity per primary muscle group: a hue and a MaterialCommunityIcons
 * glyph (vector font already bundled — MIT/OFL, not emoji). Drives the leading
 * disc on exercise rows and the accent on the exercise detail screen, so the
 * whole catalog gets a scannable color system from metadata we own.
 *
 * Keys match the API's `primaryMuscleGroup` values (the same seven groups as
 * MUSCLE_HIERARCHY in SearchScreen). Lookup is case-insensitive; anything
 * unknown falls back to a neutral disc.
 */

type MCIName = keyof typeof MaterialCommunityIcons.glyphMap;

export type MuscleGroupVisual = {
  /** Full-strength glyph / accent color for the active theme. */
  color: string;
  /** Soft disc fill derived from `color` (8-digit hex, like the chip fills). */
  softColor: string;
  icon: MCIName;
};

// Two hue ramps: the dark-theme set is brighter so discs read against #1A1F1B;
// the light set is deepened so glyphs keep contrast on the warm paper surface.
const META: Record<string, { icon: MCIName; dark: string; light: string }> = {
  chest: { icon: 'weight-lifter', dark: '#E05B5B', light: '#BC4141' },
  back: { icon: 'rowing', dark: '#5B87D6', light: '#3A64AE' },
  shoulders: { icon: 'dumbbell', dark: '#E0913F', light: '#B26A24' },
  arms: { icon: 'arm-flex', dark: '#9D77F0', light: '#6D45C9' },
  legs: { icon: 'run-fast', dark: '#4FAF74', light: '#2F7E4E' },
  core: { icon: 'yoga', dark: '#D9B13B', light: '#96771C' },
  cardio: { icon: 'heart-pulse', dark: '#45B8C4', light: '#22808C' },
};

const FALLBACK: { icon: MCIName; dark: string; light: string } = {
  icon: 'dumbbell',
  dark: '#8B8F88',
  light: '#7A857F',
};

// Disc fill alpha. Slightly stronger in light mode: pale tints disappear into
// the paper surface, while dark surfaces need less to read as colored.
const SOFT_ALPHA_DARK = '26'; // ~15%
const SOFT_ALPHA_LIGHT = '2E'; // ~18%

export function getMuscleGroupVisual(
  group: string | undefined | null,
  isDark: boolean,
): MuscleGroupVisual {
  const meta = META[(group ?? '').trim().toLowerCase()] ?? FALLBACK;
  const color = isDark ? meta.dark : meta.light;
  return {
    color,
    softColor: color + (isDark ? SOFT_ALPHA_DARK : SOFT_ALPHA_LIGHT),
    icon: meta.icon,
  };
}
