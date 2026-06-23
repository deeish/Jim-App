import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import type { ComponentType } from 'react';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();

export const isSentryEnabled = Boolean(dsn);

// Navigation performance tracing: captures per-route Time to Initial Display (TTID).
// Exported so App.tsx can bind the NavigationContainer ref in onReady. Diagnostic for
// the ~2s tab-switch delay — see docs/plans/2026-06-17-navigation-performance.md.
export const sentryNavigationIntegration = isSentryEnabled
  ? Sentry.reactNavigationIntegration({ enableTimeToInitialDisplay: true })
  : undefined;

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
    // Diagnostic: sample every transaction so per-route TTID is visible from real
    // sessions, to localize the ~2s tab-switch delay. Lower this (e.g. 0.2) or gate
    // on env once the bottleneck is confirmed — see the nav-performance plan doc.
    tracesSampleRate: 1.0,
    // Function form so we ADD the navigation integration to Sentry's defaults
    // (device context, breadcrumbs, …) rather than replacing them.
    integrations: (defaultIntegrations) =>
      sentryNavigationIntegration
        ? [...defaultIntegrations, sentryNavigationIntegration]
        : defaultIntegrations,
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
