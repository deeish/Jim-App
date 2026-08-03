import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { muscleGroupColors, palette, SOFT_ALPHA } from '../theme/colors';

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
 *
 * The hues live in the theme layer (`muscleGroupColors`) so all colour stays in
 * one file; this module owns only the glyph pairing.
 */

export type MuscleGroupIconRef =
  | { set: 'ionicons'; name: keyof typeof Ionicons.glyphMap }
  | { set: 'mci'; name: keyof typeof MaterialCommunityIcons.glyphMap };

export type MuscleGroupVisual = {
  /** Full-strength glyph / accent color. */
  color: string;
  /** Soft disc fill derived from `color` (8-digit hex, like the chip fills). */
  softColor: string;
  icon: MuscleGroupIconRef;
};

const META: Record<string, { icon: MuscleGroupIconRef; color: string }> = {
  chest: { icon: { set: 'ionicons', name: 'barbell' }, color: muscleGroupColors.chest },
  back: { icon: { set: 'mci', name: 'kettlebell' }, color: muscleGroupColors.back },
  shoulders: { icon: { set: 'mci', name: 'dumbbell' }, color: muscleGroupColors.shoulders },
  arms: { icon: { set: 'mci', name: 'arm-flex' }, color: muscleGroupColors.arms },
  legs: { icon: { set: 'mci', name: 'lightning-bolt' }, color: muscleGroupColors.legs },
  core: { icon: { set: 'ionicons', name: 'body' }, color: muscleGroupColors.core },
  cardio: { icon: { set: 'mci', name: 'heart-pulse' }, color: muscleGroupColors.cardio },
};

const FALLBACK: { icon: MuscleGroupIconRef; color: string } = {
  icon: { set: 'mci', name: 'dumbbell' },
  color: palette.textMuted,
};

export function getMuscleGroupVisual(group: string | undefined | null): MuscleGroupVisual {
  const meta = META[(group ?? '').trim().toLowerCase()] ?? FALLBACK;
  return {
    color: meta.color,
    softColor: meta.color + SOFT_ALPHA,
    icon: meta.icon,
  };
}
