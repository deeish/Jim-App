import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN?.trim();
const release =
  process.env.SENTRY_RELEASE?.trim() ||
  `jim-api@${process.env.npm_package_version ?? '0.0.0'}`;
const environment =
  process.env.SENTRY_ENVIRONMENT?.trim() ||
  process.env.NODE_ENV?.trim() ||
  'development';
const tracesSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0');

export const isSentryEnabled = Boolean(dsn);

if (isSentryEnabled) {
  Sentry.init({
    dsn,
    environment,
    release,
    tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0,
    sendDefaultPii: false,
  });
}
