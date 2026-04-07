const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

// Avoid resolving Node-only paths (@supabase/realtime-js → ws → stream) into the native bundle.
// See: https://docs.expo.dev/versions/latest/config/metro/#es-module-resolution
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
