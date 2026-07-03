import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

/**
 * Visual identity per primary muscle group: a hue and a vector glyph from the
 * icon fonts already bundled (MIT/OFL — not emoji). Drives the leading disc on
 * exercise rows and the accent on the exercise detail screen, so the whole
 * catalog gets a scannable color system from metadata we own.
 *
 * Glyphs are deliberately BOLD, solid marks (barbell, kettlebell, bolt) —
 * thin stick-figure pictograms turn to scribbles at disc size. Mixed sets
 * because each set has different strong glyphs; `MuscleGroupDisc` renders
 * whichever set an entry names.
 *
 * Keys match the API's `primaryMuscleGroup` values (the same seven groups as
 * MUSCLE_HIERARCHY in SearchScreen). Lookup is case-insensitive; anything
 * unknown falls back to a neutral disc.
 */

export type MuscleGroupIconRef =
  | { set: 'ionicons'; name: keyof typeof Ionicons.glyphMap }
  | { set: 'mci'; name: keyof typeof MaterialCommunityIcons.glyphMap };

export type MuscleGroupVisual = {
  /** Full-strength glyph / accent color for the active theme. */
  color: string;
  /** Soft disc fill derived from `color` (8-digit hex, like the chip fills). */
  softColor: string;
  icon: MuscleGroupIconRef;
};

// Two hue ramps: the dark-theme set is brighter so discs read against #1A1F1B;
// the light set is deepened so glyphs keep contrast on the warm paper surface.
const META: Record<string, { icon: MuscleGroupIconRef; dark: string; light: string }> = {
  chest: { icon: { set: 'ionicons', name: 'barbell' }, dark: '#E05B5B', light: '#BC4141' },
  back: { icon: { set: 'mci', name: 'kettlebell' }, dark: '#5B87D6', light: '#3A64AE' },
  shoulders: { icon: { set: 'mci', name: 'dumbbell' }, dark: '#E0913F', light: '#B26A24' },
  arms: { icon: { set: 'mci', name: 'arm-flex' }, dark: '#9D77F0', light: '#6D45C9' },
  legs: { icon: { set: 'mci', name: 'lightning-bolt' }, dark: '#4FAF74', light: '#2F7E4E' },
  core: { icon: { set: 'ionicons', name: 'body' }, dark: '#D9B13B', light: '#96771C' },
  cardio: { icon: { set: 'mci', name: 'heart-pulse' }, dark: '#45B8C4', light: '#22808C' },
};

const FALLBACK: { icon: MuscleGroupIconRef; dark: string; light: string } = {
  icon: { set: 'mci', name: 'dumbbell' },
  dark: '#8B8F88',
  light: '#7A857F',
};

// Disc fill alpha. Strong enough to read as a deliberate color chip — at ~15%
// the discs looked like smudges on the dark surface.
const SOFT_ALPHA_DARK = '3D'; // ~24%
const SOFT_ALPHA_LIGHT = '38'; // ~22%

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
