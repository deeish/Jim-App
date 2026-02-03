// Color palette type (same shape for light and dark)
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
};

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
};

// Light theme (same primary/accent, light surfaces)
export const lightColors: ColorPalette = {
  background: '#F5F4F0',
  surface: '#FFFFFF',
  border: '#E5E3DE',
  primary: '#B8925C',
  secondary: '#5A7A5F',
  accent: '#C46938',
  text: '#1A1F1B',
  textSecondary: 'rgba(26, 31, 27, 0.85)',
  textTertiary: 'rgba(26, 31, 27, 0.7)',
  textMuted: '#6B7168',
  error: '#D32F2F',
  success: '#5A7A5F',
  warning: '#C46938',
  overlay: 'rgba(0, 0, 0, 0.4)',
  shadow: '#000',
};

// Default export for backward compatibility (dark theme)
export const colors = darkColors;
