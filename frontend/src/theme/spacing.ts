/**
 * THE SPACING SCALE. A 4pt grid, with one 2pt half-step for hairline gaps.
 *
 * Import it directly (`import { spacing } from '../theme'`) rather than reading it
 * from `useTheme()`. Spacing is not themeable, and several screens build their
 * `StyleSheet.create` block at module scope where hooks cannot run — a direct
 * import is the only form that works in both places.
 *
 * WHY THESE STEPS. Measured across the 1,298 padding/margin/gap literals that were
 * in the app before this file existed: 4, 8, 12 and 16 alone accounted for 741 of
 * them, so the grid was already there in spirit. What was missing was a rule, and
 * so 21 distinct values had accumulated — including 1, 3, 5, 7, 9, 11, 13 and 15,
 * which exist only because a number got nudged until one screen looked right.
 *
 * SNAPPING RULE for anything not already on the scale: round to the nearest step,
 * and on a tie prefer the tighter one. The three big off-grid populations were 6
 * (88 uses), 10 (96) and 14 (96); these are judgement calls rather than arithmetic
 * ones, because a 14 that separates two sections wants `lg`, while a 14 inside a
 * dense list row wants `md`. Read the context, don't just round.
 *
 * Values above `xxxl` are deliberately absent. One-off layout numbers — a 180pt
 * hero, an 80pt chart gutter — are sizes, not rhythm, and belong inline next to
 * the thing they size.
 */
export const spacing = {
  none: 0,
  /** Hairline separation: icon-to-label, stacked caption lines. */
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export type SpacingToken = keyof typeof spacing;

/** The screen gutter. Every full-width screen pads its content by this much. */
export const SCREEN_PADDING = spacing.lg;
