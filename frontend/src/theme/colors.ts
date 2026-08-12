/**
 * THE PALETTE. This file is the single source of truth for every colour in the app.
 *
 * To restyle the app, edit `palette` below and nothing else. Screens never hold
 * hex values — they read `useTheme().colors`, so a change here reaches all of them.
 *
 * Two rules keep it that way:
 *
 * 1. EVERY VALUE STAYS A 6-DIGIT HEX. Around forty call sites build translucent
 *    fills by concatenating an alpha suffix onto a token (`` `${colors.primary}22` ``).
 *    An `rgba()` or 8-digit value there silently produces an invalid colour string,
 *    which React Native renders as transparent. The only exceptions are `overlay`,
 *    `scrim` and the `*Soft` tokens, which are alpha values by definition and are
 *    never concatenated.
 *
 * 2. EVERY SEMANTIC COLOUR CLEARS 4.5:1 ON WHITE. Each one is used both as small
 *    text on a card and as a fill with a white label on top of it. Contrast is
 *    symmetric, so a single value settles both jobs — but only above 4.5:1. This is
 *    why the blue is not `#007AFF` (4.02:1, fails as button-label backing) and the
 *    greens/oranges are not the vivid iOS accents (`#34C759` is 2.22:1 on white).
 *
 * The app ships one light theme. To reintroduce a second mode, add a second object
 * of this shape and select between them in ThemeContext — the `ColorPalette` type
 * and `useTheme()` API are already built for it.
 */

// Color palette type (one mode).
// Prefer editing tokens here + using `useTheme().colors` in UI — avoid hardcoded hex in screens.
export type ColorPalette = {
  background: string;
  surface: string;
  border: string;
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  textMuted: string;
  error: string;
  success: string;
  warning: string;
  overlay: string;
  shadow: string;
  /** Text on primary-filled controls (tabs, chips, main buttons). */
  onPrimary: string;
  /** Bottom sheets / scrims. */
  scrim: string;
  /** Plan slot & icon: cardio accent (distinct from `accent`). */
  workoutCardio: string;
  /** Plan slot & icon: recovery / mobility. */
  workoutRecovery: string;
  /** Soft fills derived from semantic colors (8-digit hex — never concatenate onto these). */
  primarySoft: string;
  successSoft: string;
  warningSoft: string;
  /** Brand mark gradient (the "J" chip). Deliberately its own pair rather than
   *  primary→accent, which would read as blue→brown in this palette. */
  brandGradientStart: string;
  brandGradientEnd: string;
  /** Lower stop of the brand glyph's metal gradient. */
  brandGlyphShade: string;
  /** Body map: silhouette fill, its outline, and the unhighlighted-muscle wash. */
  bodyMapBody: string;
  bodyMapOutline: string;
  bodyMapQuiet: string;
  /** Secondary (assisting) muscle wash — one muted tone, never a group hue. */
  bodyMapAssist: string;
  /** Bottom stop of the silhouette's vertical shading gradient. */
  bodyMapBodyShade: string;
  /** Neutral ground behind mini body-map tiles (color lives in the muscles). */
  bodyMapTileBg: string;
};

/**
 * The alpha suffix used for every soft/tinted fill in the app.
 *
 * 10% is the strongest tint that still lets a token's own colour sit on top of it
 * as 11px text at 4.5:1. The previous 13–20% tints forced every hue muddy-dark to
 * compensate; lowering the tint is what lets the hues stay vivid.
 */
export const SOFT_ALPHA = '1A';

export const palette: ColorPalette = {
  // Surfaces — iOS grouped-table convention: white cards on a light grey page.
  background: '#F2F2F7',
  surface: '#FFFFFF',
  border: '#D1D1D6',

  // Interactive blue. One step deeper than iOS system blue so it also works as
  // small text and as the backing for white button labels (6.02:1 on white).
  primary: '#0061C2',
  // Completion / "today" green. Same value as `success`, kept separate so either
  // can diverge later without hunting through screens.
  secondary: '#1D7332',
  // Warm attention. Same relationship to `warning` as secondary has to success.
  accent: '#9C4E00',

  // Text ramp — four steps, all AA on both white cards and the grey page.
  // Note Apple's own secondaryLabel (#8E8E93) is only 3.26:1 and cannot be used.
  text: '#000000',
  textSecondary: '#3C3C43',
  textTertiary: '#5A5A5F',
  textMuted: '#6B6B70',

  error: '#D70015',
  success: '#1D7332',
  warning: '#9C4E00',

  overlay: 'rgba(0, 0, 0, 0.40)',
  // Opaque so call sites control weight via shadowOpacity rather than double-applying alpha.
  shadow: '#000000',
  onPrimary: '#FFFFFF',
  scrim: 'rgba(0, 0, 0, 0.35)',

  workoutCardio: '#B93000',
  workoutRecovery: '#8944AB',

  primarySoft: `#0061C2${SOFT_ALPHA}`,
  successSoft: `#1D7332${SOFT_ALPHA}`,
  warningSoft: `#9C4E00${SOFT_ALPHA}`,

  brandGradientStart: '#3B9DFF',
  brandGradientEnd: '#0047B3',
  brandGlyphShade: '#D9E4F2',

  bodyMapBody: '#E5E5EA',
  bodyMapOutline: '#C6C6C8',
  bodyMapQuiet: 'rgba(0, 0, 0, 0.07)',
  bodyMapAssist: '#8E8E93',
  bodyMapTileBg: '#F2F2F7',
  bodyMapBodyShade: '#D6D6DC',
};

/**
 * Muscle-group identity hues (exercise-row discs, body-map regions).
 *
 * These are icon colours, not text, so the bar is 3:1 rather than 4.5:1 — the extra
 * lightness range is what keeps seven hues apart. Seven colours cannot be made
 * pairwise-distinct under simulated colour blindness, so identity is carried by the
 * per-group glyph and label; colour only reinforces it.
 */
export const muscleGroupColors = {
  chest: '#D0342C',
  back: '#1F6FD0',
  shoulders: '#C2700A',
  arms: '#7B3FD4',
  legs: '#12855A',
  core: '#C01A6B',
  cardio: '#00808F',
} as const;

/** Icon / slot colors derived from the active palette (use with `useTheme().colors`). */
export function planSlotIconColors(c: ColorPalette) {
  return {
    strength: c.primary,
    cardio: c.workoutCardio,
    recovery: c.workoutRecovery,
    /** Second session cardio (e.g. double day) — reuses `secondary` green. */
    cardioAlt: c.secondary,
    neutral: c.textMuted,
  };
}

export type PlanSlotIconColors = ReturnType<typeof planSlotIconColors>;

/** The active palette. Also usable from non-React contexts. */
export const colors = palette;
