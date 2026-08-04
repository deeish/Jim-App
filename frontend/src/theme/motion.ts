/**
 * THE MOTION SCALE.
 *
 * This file deliberately imports nothing. Spring configs and durations are plain
 * data, and keeping Reanimated out of the theme barrel means `import { spacing }
 * from '../theme'` in a Jest-tested module never drags a native animation runtime
 * into the test environment.
 *
 * Use `spring.*` for anything the finger is touching — press, drag, snap — because
 * a spring's velocity carries through from the gesture. Use `duration.*` with an
 * easing curve for anything the system initiates on its own: fades, reveals,
 * cross-dissolves. Getting this backwards (timed press feedback, springy fades) is
 * the difference between an app that feels responsive and one that feels animated.
 */

export const duration = {
  /** Press states and colour changes. Below ~100ms reads as instant. */
  instant: 120,
  /** Small local reveals: a chip appearing, a value counting up. */
  fast: 180,
  /** The default. Sheet content, list item enter/exit, section expand. */
  base: 240,
  /** Full-screen or celebratory motion. Anything slower feels sluggish. */
  slow: 320,
} as const;

/**
 * Cubic-bezier control points, as tuples. Call sites build the real curve with
 * `Easing.bezier(...easing.standard)` so this file stays dependency-free.
 */
export const easing = {
  /** Decelerate — the default for things entering the screen. */
  standard: [0.2, 0, 0, 1],
  /** Accelerate — for things leaving. */
  exit: [0.4, 0, 1, 1],
  /** Symmetric ease for value changes that neither enter nor leave. */
  inOut: [0.4, 0, 0.2, 1],
} as const;

/**
 * Spring configs for Reanimated's `withSpring`.
 *
 * `snappy` carries the exact numbers `PressableScale` has always used (damping 18
 * / stiffness 260), so moving that component onto the token did not change how
 * any press in the app feels.
 *
 * All three are underdamped, i.e. all three overshoot — damping / 2√(stiffness ×
 * mass) is 0.56, 0.79 and 0.42 respectively. The difference is how much and for
 * how long, not whether. An earlier version of this comment claimed snappy and
 * gentle did not bounce at all; that was simply wrong, and the guard test below
 * only compared them to each other so it never caught the claim.
 */
export const spring = {
  /** Press feedback and snap-to-position. Overshoot is small and settles fast. */
  snappy: { damping: 18, stiffness: 260, mass: 1 },
  /** Layout shifts and sheet movement. The most damped of the three. */
  gentle: { damping: 20, stiffness: 160, mass: 1 },
  /** Reward moments — a completed set, a new PR. Visibly bounces. */
  bouncy: { damping: 11, stiffness: 190, mass: 0.9 },
} as const;

/**
 * How far a card/tile scales down while pressed. Uniform across the app so that
 * every tappable surface answers a finger with the same amount of give.
 */
export const PRESS_SCALE = 0.97;
