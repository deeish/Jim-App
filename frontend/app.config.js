/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Dynamic Expo config. When `SENTRY_ORG` and `SENTRY_PROJECT` are set (e.g. EAS secrets),
 * the Sentry config plugin gets org/project for source map upload. Otherwise the bare
 * `@sentry/react-native` entry from app.json is kept.
 */
const appJson = require('./app.json');

module.exports = () => {
  const expo = { ...appJson.expo };
  const plugins = [...(expo.plugins ?? [])];
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;

  if (org && project) {
    const idx = plugins.findIndex(
      (p) =>
        p === '@sentry/react-native' ||
        (Array.isArray(p) && p[0] === '@sentry/react-native'),
    );
    const entry = [
      '@sentry/react-native/expo',
      {
        url: 'https://sentry.io/',
        organization: org,
        project,
      },
    ];
    if (idx >= 0) plugins[idx] = entry;
    else plugins.push(entry);
  }

  // Google sign-in's config plugin refuses to run without the reversed iOS client
  // id (it writes it into Info.plist as a URL scheme). Add it only when the build
  // has one, so a build without Google Cloud set up still succeeds — the button is
  // hidden at runtime until EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is set anyway.
  // See docs/auth-sign-in-setup.md.
  const googleIosUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME;
  if (googleIosUrlScheme) {
    plugins.push([
      '@react-native-google-signin/google-signin',
      { iosUrlScheme: googleIosUrlScheme },
    ]);
  }

  expo.plugins = plugins;
  return { expo };
};
