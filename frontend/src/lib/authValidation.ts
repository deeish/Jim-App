/**
 * Shared auth input rules for Login / Signup / ForgotPassword / SetNewPassword.
 *
 * MIN_PASSWORD_LENGTH must match the Supabase Auth password policy
 * (Dashboard → Authentication → Password settings). If they disagree, the
 * frontend either rejects valid passwords or lets Supabase reject with an
 * uglier error. Keep them in sync.
 */
export const MIN_PASSWORD_LENGTH = 8;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/** Returns an error message if the email is invalid, otherwise null. */
export function validateEmail(email: string): string | null {
  if (!email.trim()) return 'Email is required';
  if (!isValidEmail(email)) return 'Please enter a valid email address';
  return null;
}

/**
 * Returns an error message if the password fails the signup / reset policy,
 * otherwise null. Not used on the login screen — existing users may have
 * shorter passwords set before the policy changed, and login should never
 * lock them out over length.
 */
export function validatePassword(password: string): string | null {
  if (!password) return 'Password is required';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

/**
 * Maps raw Supabase auth error strings to friendlier copy. Deliberately avoids
 * revealing whether an email is registered (anti-enumeration) — the "already
 * registered" case is not surfaced as a distinct message.
 */
export function mapAuthError(message: string | undefined | null): string {
  const raw = (message ?? '').toLowerCase();
  if (!message) return 'Something went wrong. Please try again.';
  if (raw.includes('invalid login credentials')) {
    return 'Email or password is incorrect.';
  }
  if (raw.includes('email not confirmed')) {
    return 'Please confirm your email first — check your inbox for the link.';
  }
  if (raw.includes('rate limit') || raw.includes('too many')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  return message;
}
