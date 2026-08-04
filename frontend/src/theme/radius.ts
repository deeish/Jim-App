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
 * ⚠️ ANYTHING THAT MUST BE ROUND USES `pill`. NEVER A NUMBER FROM THIS SCALE.
 * A circle written as half its own size (a 28pt dot at radius 14, a 50x28 switch
 * track at 14) is not on this scale, and snapping it to the nearest step turns it
 * into a squircle. That is exactly what happened when this file was introduced:
 * eight circles across the switch tracks, avatar picker, streak badge, set
 * markers and week-strip dots quietly lost their roundness, while true circles
 * rendered by neighbouring components kept theirs — so the two sat side by side
 * in the same card, visibly mismatched.
 *
 * `pill` is safe at every size because React Native clamps a border radius to
 * half the smaller dimension. It is 999 rather than `'50%'` because percentage
 * radii resolve inconsistently across platforms.
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
