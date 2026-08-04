/**
 * THE ELEVATION SCALE. Three levels, spread as ready-made style objects.
 *
 * Usage: `...elevation.level1` inside a `StyleSheet.create` entry. Each level sets
 * the full iOS shadow quartet *and* the Android `elevation`, because setting one
 * without the other is why the same card currently looks flat on one platform and
 * heavy on the other.
 *
 * The app had 15 shadowed surfaces using 5 different opacities and 9 different
 * blur radii, with no relationship between them. On a light-grey page with white
 * cards, shadow carries very little of the hierarchy — the card edge does that —
 * so these are deliberately subtle. Reach for a border before reaching for level 3.
 *
 * `shadowColor` is intentionally omitted: call sites pass `colors.shadow` so the
 * token stays a pure geometry/opacity object and this file never imports the
 * palette.
 */
type ElevationStyle = {
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

export const elevation = {
  /** Resting cards and list rows. Barely there — a hint of lift off the page. */
  level1: {
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  /** Raised, interactive surfaces: primary buttons, the active day card, FABs. */
  level2: {
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  /** Surfaces floating over content: modals, bottom sheets, the tab bar. */
  level3: {
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 12,
  },
} as const satisfies Record<string, ElevationStyle>;

/**
 * Bars anchored to the bottom of the screen cast upward. Same weight as level3,
 * inverted — used by the tab bar and by sticky action footers.
 */
export const elevationUp = {
  shadowOffset: { width: 0, height: -2 },
  shadowOpacity: 0.08,
  shadowRadius: 12,
  elevation: 12,
} as const satisfies ElevationStyle;

export type ElevationToken = keyof typeof elevation;
