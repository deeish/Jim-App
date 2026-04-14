// Color palette type (same shape for light and dark).
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
  /** Bottom sheets / scrims (typically ~50% black). */
  scrim: string;
  /** Plan slot & icon: cardio accent (distinct from `accent`). */
  workoutCardio: string;
  /** Plan slot & icon: recovery / mobility. */
  workoutRecovery: string;
  /** Soft fills derived from semantic colors (8-digit hex where supported). */
  primarySoft: string;
  successSoft: string;
  warningSoft: string;
};

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

// Dark theme (Iron & Sand)
export const darkColors: ColorPalette = {
  background: '#0F1110',
  surface: '#1A1F1B',
  border: '#252A27',
  primary: '#C7A46A',
  secondary: '#6B8F71',
  accent: '#D97745',
  text: '#F4F1EA',
  textSecondary: 'rgba(244, 241, 234, 0.8)',
  textTertiary: 'rgba(244, 241, 234, 0.7)',
  textMuted: '#8B8F88',
  error: '#EF4444',
  success: '#6B8F71',
  warning: '#D97745',
  overlay: 'rgba(0, 0, 0, 0.7)',
  shadow: '#000',
  onPrimary: '#F4F1EA',
  scrim: 'rgba(0, 0, 0, 0.5)',
  workoutCardio: '#E67E22',
  workoutRecovery: '#9B59B6',
  primarySoft: '#C7A46A22',
  successSoft: '#6B8F7133',
  warningSoft: '#D9774533',
};

// Light theme — warm sand, brighter chrome + softer grays (Home / Plan scroll areas, section labels).
export const lightColors: ColorPalette = {
  /** Page chrome — warm paper-gray (slightly lifted again vs prior taupe). */
  background: '#EAE8E2',
  /** Cards / panels — small step above chrome. */
  surface: '#F8F6F3',
  /** Edges on lighter base. */
  border: '#DAD7CE',
  /** Main actions: deeper, more saturated brown than before so CTAs anchor the screen. */
  primary: '#8B5A26',
  secondary: '#4A634E',
  accent: '#A85526',
  text: '#1B211C',
  textSecondary: 'rgba(27, 33, 28, 0.7)',
  textTertiary: 'rgba(27, 33, 28, 0.52)',
  /** Muted labels / icons — a touch lighter than previous green-gray. */
  textMuted: '#8A9590',
  error: '#C62828',
  success: '#4A634E',
  warning: '#A85526',
  overlay: 'rgba(26, 31, 27, 0.34)',
  shadow: 'rgba(22, 28, 24, 0.11)',
  onPrimary: '#FFFBF5',
  scrim: 'rgba(22, 26, 23, 0.4)',
  workoutCardio: '#A14E18',
  workoutRecovery: '#5F4674',
  primarySoft: '#8B5A2633',
  successSoft: '#4A634E34',
  warningSoft: '#A8552630',
};

/** Default static palette (dark) — only for non-React contexts; screens should use `useTheme()`. */
export const colors = darkColors;
