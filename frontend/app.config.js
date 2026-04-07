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

  expo.plugins = plugins;
  return { expo };
};
