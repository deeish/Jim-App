/**
 * Legal URLs opened in the system browser. Override via EXPO_PUBLIC_* for production
 * (hosted policy pages, GitHub Pages, etc.).
 */

const FALLBACK_PRIVACY = 'https://example.com/privacy';
const FALLBACK_TERMS = 'https://example.com/terms';

export const PRIVACY_POLICY_URL =
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL?.trim() || FALLBACK_PRIVACY;

export const TERMS_OF_SERVICE_URL =
  process.env.EXPO_PUBLIC_TERMS_OF_SERVICE_URL?.trim() || FALLBACK_TERMS;

/** mailto: link for Feedback & support */
export const FEEDBACK_MAILTO =
  'mailto:?subject=Jim%20App%20feedback';
