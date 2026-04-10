/**
 * Replace with your real URLs before shipping. Opened in the system browser.
 */
export const PRIVACY_POLICY_URL = 'https://example.com/privacy';
export const TERMS_OF_SERVICE_URL = 'https://example.com/terms';

/** mailto: link for Feedback & support */
export const FEEDBACK_MAILTO =
  'mailto:?subject=Jim%20App%20feedback';

/** Prefilled mailto for account deletion requests (no in-app API yet). */
export function buildDeleteAccountMailto(accountEmail: string, userId?: string): string {
  const subject = encodeURIComponent('Delete my Jim account');
  const lines = [
    'Please delete my Jim account and all associated data.',
    '',
    `Account email: ${accountEmail}`,
  ];
  if (userId) lines.push(`User ID: ${userId}`);
  lines.push('', 'Thank you.');
  const body = encodeURIComponent(lines.join('\n'));
  return `mailto:?subject=${subject}&body=${body}`;
}
