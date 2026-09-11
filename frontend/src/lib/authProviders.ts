/**
 * Native sign-in providers (Apple, Google), loaded lazily and defensively.
 *
 * ⚠ Both packages are NATIVE modules. A bare top-level import white-screens any
 * binary that does not link them (an OTA reaching an older build, Expo Go for
 * Google, the web rig for both). So every access goes through `require()` inside
 * a try, once, and the sign-in screen hides a provider whose module is missing.
 * That is what makes this JS safe to ship over the air to build 1.1.0 phones:
 * they simply keep the email path.
 *
 * Google additionally needs client IDs from Google Cloud (see
 * docs/auth-sign-in-setup.md). Without `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` the
 * button is hidden even when the module is present.
 */
import { Platform } from 'react-native';
import { formatAppleFullName } from './authIdentity';

export type ProviderName = 'apple' | 'google';

export type ProviderCredential = {
  provider: ProviderName;
  /** OpenID identity token to hand to Supabase `signInWithIdToken`. */
  token: string;
  /** Person's name when the provider sent one (Apple: first authorization only). */
  fullName: string | null;
};

export type ProviderResult =
  | { status: 'ok'; credential: ProviderCredential }
  | { status: 'cancelled' }
  | { status: 'error'; error: Error };

type AppleModule = typeof import('expo-apple-authentication');
type GoogleModule = typeof import('@react-native-google-signin/google-signin');

let appleModule: AppleModule | null | undefined;
let googleModule: GoogleModule | null | undefined;
let googleConfigured = false;

export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

/** The Apple module, or null where it cannot run (non-iOS, or not linked into this binary). */
export function loadAppleAuth(): AppleModule | null {
  if (appleModule !== undefined) return appleModule;
  if (Platform.OS !== 'ios') {
    appleModule = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    appleModule = require('expo-apple-authentication') as AppleModule;
  } catch (e) {
    if (__DEV__) console.warn('[auth] expo-apple-authentication unavailable in this binary', e);
    appleModule = null;
  }
  return appleModule;
}

export async function isAppleSignInAvailable(): Promise<boolean> {
  const mod = loadAppleAuth();
  if (!mod) return false;
  try {
    return await mod.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function requestAppleCredential(): Promise<ProviderResult> {
  const mod = loadAppleAuth();
  if (!mod) return { status: 'error', error: new Error('Sign in with Apple is not available on this device.') };
  try {
    const credential = await mod.signInAsync({
      requestedScopes: [
        mod.AppleAuthenticationScope.FULL_NAME,
        mod.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) {
      return { status: 'error', error: new Error('Apple did not return an identity token.') };
    }
    return {
      status: 'ok',
      credential: {
        provider: 'apple',
        token: credential.identityToken,
        fullName: formatAppleFullName(credential.fullName),
      },
    };
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED') return { status: 'cancelled' };
    return { status: 'error', error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/** The Google module, or null where it cannot run (web, Expo Go, older binaries). */
export function loadGoogleSignin(): GoogleModule | null {
  if (googleModule !== undefined) return googleModule;
  if (Platform.OS === 'web') {
    googleModule = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    googleModule = require('@react-native-google-signin/google-signin') as GoogleModule;
  } catch (e) {
    if (__DEV__) console.warn('[auth] @react-native-google-signin unavailable in this binary', e);
    googleModule = null;
  }
  return googleModule;
}

/** True only when the module is linked AND Google Cloud client IDs are configured. */
export function isGoogleSignInAvailable(): boolean {
  if (!GOOGLE_WEB_CLIENT_ID) return false;
  const mod = loadGoogleSignin();
  if (!mod) return false;
  if (!googleConfigured) {
    try {
      mod.GoogleSignin.configure({
        webClientId: GOOGLE_WEB_CLIENT_ID,
        ...(GOOGLE_IOS_CLIENT_ID ? { iosClientId: GOOGLE_IOS_CLIENT_ID } : null),
      });
      googleConfigured = true;
    } catch (e) {
      if (__DEV__) console.warn('[auth] GoogleSignin.configure failed', e);
      return false;
    }
  }
  return true;
}

export async function requestGoogleCredential(): Promise<ProviderResult> {
  if (!isGoogleSignInAvailable()) {
    return { status: 'error', error: new Error('Google sign-in is not set up on this build.') };
  }
  const mod = loadGoogleSignin()!;
  try {
    if (Platform.OS === 'android') {
      await mod.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }
    const res = await mod.GoogleSignin.signIn();
    if (res.type !== 'success') return { status: 'cancelled' };
    const idToken = res.data.idToken;
    if (!idToken) {
      return { status: 'error', error: new Error('Google did not return an identity token.') };
    }
    const u = res.data.user;
    const fullName = u.name?.trim() || [u.givenName, u.familyName].filter(Boolean).join(' ').trim() || null;
    return { status: 'ok', credential: { provider: 'google', token: idToken, fullName } };
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code && mod.statusCodes && code === mod.statusCodes.SIGN_IN_CANCELLED) return { status: 'cancelled' };
    return { status: 'error', error: e instanceof Error ? e : new Error(String(e)) };
  }
}
