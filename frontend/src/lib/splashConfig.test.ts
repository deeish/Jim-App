/**
 * The native splash must have a dark variant on BOTH platforms.
 *
 * Build 1.4.0 (35) shipped `splash.dark` at the top level of app.json, which
 * the iOS resolver ignores (only `ios.splash.dark` or the expo-splash-screen
 * plugin carries a dark image on iOS), so every dark launch on the phone
 * started on the light native splash and crossed to dark at the JS loader.
 * The resolver is the one prebuild runs, so this reads exactly what a build
 * would.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const appJson = require('../../app.json') as { expo: Record<string, unknown> };

const RESOLVERS = '@expo/prebuild-config/build/plugins/unversioned/expo-splash-screen';

describe('native splash config', () => {
  it('resolves a dark splash image and ground on iOS and Android', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getIosSplashConfig } = require(`${RESOLVERS}/getIosSplashConfig.js`);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getAndroidSplashConfig } = require(`${RESOLVERS}/getAndroidSplashConfig.js`);
    const ios = getIosSplashConfig(appJson.expo);
    const android = getAndroidSplashConfig(appJson.expo);
    for (const resolved of [ios, android]) {
      expect(resolved.image).toBe('./assets/splash.png');
      expect(resolved.backgroundColor).toBe('#F2F2F7');
      expect(resolved.dark?.image).toBe('./assets/splash-dark.png');
      expect(resolved.dark?.backgroundColor).toBe('#0A0D13');
    }
  });
});
