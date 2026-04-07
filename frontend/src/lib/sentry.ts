import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import type { ComponentType } from 'react';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();

export const isSentryEnabled = Boolean(dsn);

function resolveEnvironment(): string {
  const fromEnv = process.env.EXPO_PUBLIC_APP_ENV?.trim();
  if (fromEnv) return fromEnv;
  return __DEV__ ? 'development' : 'production';
}

if (isSentryEnabled) {
  const slug = Constants.expoConfig?.slug ?? 'jim-app';
  const version = Constants.expoConfig?.version ?? '0.0.0';

  Sentry.init({
    dsn,
    environment: resolveEnvironment(),
    release: `${slug}@${version}`,
    enableAutoSessionTracking: true,
    debug: __DEV__ && process.env.EXPO_PUBLIC_SENTRY_DEBUG === '1',
  });

  Sentry.setTag('expo_slug', slug);
}

export function wrapWithSentry(
  AppRoot: ComponentType<Record<string, never>>,
): ComponentType<Record<string, never>> {
  if (!isSentryEnabled) return AppRoot;
  return Sentry.wrap(AppRoot as ComponentType<Record<string, unknown>>) as ComponentType<
    Record<string, never>
  >;
}

/** Uses Supabase user id only (no email) for crash grouping. */
export function setSentryUser(user: { id: string } | null): void {
  if (!isSentryEnabled) return;
  if (user) Sentry.setUser({ id: user.id });
  else Sentry.setUser(null);
}
