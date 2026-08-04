/**
 * THE TYPE SCALE.
 *
 * Eight steps, named by role. Before this file the app used 20 distinct font sizes
 * across 545 declarations — 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 26,
 * 27, 28, 30, 32, 38 and 42. Nobody consciously notices 13 against 14, but the
 * absence of a repeating interval is exactly what makes a screen read as assembled
 * rather than designed.
 *
 * WHY THESE VALUES. Each step sits on the *mode* of a cluster in the old
 * distribution, not on a computed ratio, so the sweep onto this scale moves most
 * text by 0-1px and none by more than 2:
 *
 *   caption  11  <- 9, 10, 11          footnote 12  <- 12
 *   body     14  <- 13, 14             callout  16  <- 15, 16
 *   headline 18  <- 17, 18             title    22  <- 20, 22, 24
 *   display  28  <- 26, 27, 28, 30, 32 hero     38  <- 38, 42
 *
 * `caption` and `footnote` are only 1px apart, which is not a real typographic
 * step. They are kept separate because dense data rows genuinely need both a unit
 * suffix size and a secondary-label size, and collapsing them pushed 44 badge
 * labels up into the same weight class as their own values.
 *
 * PAIR EVERY SIZE WITH ITS LEADING. `leading` is indexed by the same keys; a
 * `text.body` with no matching `leading.body` is the single most common way a list
 * row ends up with inconsistent height.
 */
export const text = {
  caption: 11,
  footnote: 12,
  body: 14,
  callout: 16,
  headline: 18,
  title: 22,
  display: 28,
  hero: 38,
} as const;

/**
 * Line heights, one per type step. Generous at small sizes (~1.35) and tightening
 * toward display (~1.16), which is how text stays readable in a paragraph without
 * headlines floating apart.
 */
export const leading = {
  caption: 15,
  footnote: 16,
  body: 20,
  callout: 22,
  headline: 24,
  title: 28,
  display: 34,
  hero: 44,
} as const;

/**
 * Weights. Typed as the literal union React Native's `fontWeight` expects, so a
 * token used in a `TextStyle` needs no cast.
 *
 * The app previously mixed `'bold'` (20 uses) with numeric weights, plus stray 300,
 * 400 and 900. `'bold'` maps to 700 and 900 maps to `heavy`; on iOS the difference
 * between 800 and 900 in the system font is imperceptible at UI sizes.
 */
export const weight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
} as const satisfies Record<string, '400' | '500' | '600' | '700' | '800'>;

/**
 * Letter spacing. Only two jobs in this app: tightening large numerals so a
 * three-digit weight does not sprawl, and opening up small all-caps section labels.
 */
export const tracking = {
  tight: -0.2,
  normal: 0,
  wide: 0.4,
  wider: 0.8,
  /** All-caps micro-labels only. */
  widest: 1.2,
} as const;

export type TextToken = keyof typeof text;
export type WeightToken = keyof typeof weight;
