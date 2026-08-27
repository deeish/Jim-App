/**
 * Legal + support links opened in the system browser.
 *
 * The policy URLs deliberately have no fallback. An unset var means "no hosted
 * policy page exists yet", and a row that quietly opens someone else's parked
 * domain is a worse answer than no row at all — so these resolve to `null` and
 * every consumer has to decide what an unconfigured link looks like.
 *
 * Set them in the eas.json build profile, not only in a local .env: `eas update`
 * bakes whatever .env the publishing machine happens to have.
 */

/** Hosts that only ever appear in a half-filled config, never in a real policy URL. */
const PLACEHOLDER_HOSTS = ['example.com', 'example.org', 'example.net', 'localhost'];

/**
 * Returns the URL only if it is a plausible public policy page. A placeholder
 * host is treated exactly like an empty var — the example.com fallback is the
 * bug this guards against, so letting someone re-enter it by hand would defeat
 * the point. http:// is rejected too: these open in the system browser, and a
 * legal page served in the clear is not one we want to point users at.
 */
export function resolveLegalUrl(raw: string | undefined | null): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (!/^https:\/\//i.test(value)) return null;

  const authority = value.slice('https://'.length).split(/[/?#]/)[0];
  const host = authority.split('@').pop()?.split(':')[0]?.toLowerCase();
  if (!host) return null;
  if (PLACEHOLDER_HOSTS.some((p) => host === p || host.endsWith(`.${p}`))) return null;

  return value;
}

/** Hosted privacy policy, or null when this build has none configured. */
export const PRIVACY_POLICY_URL = resolveLegalUrl(
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL,
);

/** Hosted terms of service, or null when this build has none configured. */
export const TERMS_OF_SERVICE_URL = resolveLegalUrl(
  process.env.EXPO_PUBLIC_TERMS_OF_SERVICE_URL,
);

/** Support inbox for "Feedback & support". Override via EXPO_PUBLIC_FEEDBACK_EMAIL. */
export const SUPPORT_EMAIL =
  process.env.EXPO_PUBLIC_FEEDBACK_EMAIL?.trim() || 'myjimplanner@gmail.com';

/** mailto: link for Feedback & support — opens the user's mail app pre-addressed. */
export const FEEDBACK_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=Jim%20App%20feedback`;
