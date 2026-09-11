/**
 * Pure helpers for the identifier-first sign-in flow (Apple, Google, emailed code,
 * password fallback). No React, no Supabase — everything here is unit-tested.
 */

/** Domain Apple issues when a person picks "Hide My Email" during Sign in with Apple. */
export const APPLE_PRIVATE_RELAY_DOMAIN = 'privaterelay.appleid.com';

/** Length of the emailed one-time code (Supabase's `{{ .Token }}`). */
export const OTP_LENGTH = 6;

/**
 * Seconds before "Resend code" becomes tappable. Supabase allows one OTP request
 * per address every 60 s; asking sooner only produces a rate-limit error.
 */
export const OTP_RESEND_SECONDS = 60;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isPrivateRelayEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  return email.slice(at + 1).toLowerCase() === APPLE_PRIVATE_RELAY_DOMAIN;
}

/**
 * The local part of an email, for greeting someone who has not set a display
 * name ("dylan" from "dylan@example.com"). Returns undefined for a Hide My Email
 * relay address — its local part is a random hash, and greeting someone with
 * "Hi, k7x2m9q4p" is worse than no name at all.
 */
export function nameFromEmail(email: string | null | undefined): string | undefined {
  if (!email) return undefined;
  if (isPrivateRelayEmail(email)) return undefined;
  const at = email.indexOf('@');
  if (at <= 0) return undefined;
  const local = email.slice(0, at).trim();
  return local || undefined;
}

/**
 * What the Profile identity row shows under the name. A relay address is real
 * and deliverable, but showing the hash reads as a bug; name it instead.
 */
export function describeAccountEmail(email: string | null | undefined): string {
  if (!email) return 'No email on this account';
  if (isPrivateRelayEmail(email)) return 'Apple ID · email hidden';
  return email;
}

export type AppleFullNameLike = {
  givenName?: string | null;
  middleName?: string | null;
  familyName?: string | null;
};

/**
 * Apple sends the person's name ONLY on the very first authorization for this
 * app; later sign-ins carry null. Capture it then or lose it. Returns null when
 * nothing usable came through so callers can skip the metadata write.
 */
export function formatAppleFullName(fullName: AppleFullNameLike | null | undefined): string | null {
  if (!fullName) return null;
  const parts = [fullName.givenName, fullName.familyName]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

/** Keeps only digits, capped at the code length — pasted "482 913" becomes "482913". */
export function digitsOnly(input: string, max: number = OTP_LENGTH): string {
  return input.replace(/\D+/g, '').slice(0, max);
}

export function isCompleteOtp(code: string): boolean {
  return code.length === OTP_LENGTH && /^\d+$/.test(code);
}

/** "0:42" for the resend countdown. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/**
 * Friendlier copy for the OTP and provider paths. Falls through to the caller's
 * password-era mapper for everything else so both stay in one place per concern.
 */
export function mapCodeError(message: string | null | undefined): string | null {
  const raw = (message ?? '').toLowerCase();
  if (!raw) return null;
  if (raw.includes('token has expired') || raw.includes('otp_expired') || raw.includes('invalid') && raw.includes('otp')) {
    return 'That code is wrong or has expired. Request a new one.';
  }
  if (raw.includes('expired')) return 'That code has expired. Request a new one.';
  if (raw.includes('rate limit') || raw.includes('too many') || raw.includes('over_email_send_rate_limit')) {
    return 'Too many attempts. Wait a minute, then try again.';
  }
  if (raw.includes('signups not allowed')) {
    return 'We could not find an account for that email.';
  }
  return null;
}
