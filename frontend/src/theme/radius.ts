/**
 * THE CORNER-RADIUS SCALE.
 *
 * Before this file there were 26 distinct radii across 233 uses, including 5.5,
 * 6.5, 23 and 66. Radius is the most visible consistency tell in an app built of
 * cards: two cards on the same screen at 12 and 14 do not read as "slightly
 * different", they read as unfinished.
 *
 * SNAPPING RULE: nest smaller radii inside larger ones. A control sitting inside a
 * `md` card takes `sm`, not `md` — matching radii on nested surfaces makes the
 * inner element look like it is bulging out of the outer one.
 *
 * `pill` is 999 rather than `'50%'` because React Native resolves percentage radii
 * inconsistently across platforms; a large absolute value is always clamped to a
 * true half-height capsule.
 */
export const radius = {
  none: 0,
  /** Chips, badges, small inline tags. */
  xs: 4,
  /** Controls nested inside a card: buttons, steppers, index pills. */
  sm: 8,
  /** The default card / row / input radius. */
  md: 12,
  /** Prominent cards and section containers. */
  lg: 16,
  /** Modals and bottom sheets. */
  xl: 20,
  /** Full-bleed sheet tops and hero surfaces. */
  xxl: 24,
  /** Fully rounded capsule (avatars, segmented pills, FABs). */
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radius;
