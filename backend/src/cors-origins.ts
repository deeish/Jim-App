/**
 * Browser origins allowed for CORS (Expo web, local dev, production web).
 * React Native / curl / server-to-server requests often omit Origin — those are still allowed in main.ts.
 */

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:19006',
  'http://127.0.0.1:19006',
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'http://localhost:19000',
  'http://127.0.0.1:19000',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
] as const;

/**
 * Builds the set of allowed `Origin` header values. Throws in production if unset (forces explicit config).
 */
export function buildAllowedCorsOrigins(): Set<string> {
  const raw = process.env.CORS_ORIGINS?.trim();
  const isProd = process.env.NODE_ENV === 'production';

  if (raw) {
    return new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }

  if (isProd) {
    throw new Error(
      'CORS_ORIGINS must be set in production (comma-separated origins, e.g. https://your-app.example.com). ' +
        'Clients that send no Origin header (typical React Native) remain allowed.',
    );
  }

  return new Set(DEFAULT_DEV_ORIGINS);
}
