import { NativeModules, Platform } from 'react-native';
import type { WeightUnit } from './weightDisplay';

/**
 * Which weight unit a fresh install should start with.
 *
 * The onboarding weight step used to be the only place a new user chose lb or
 * kg, and only if they typed a weight; with that step gone (weight is asked in
 * the tracker, where it is used) the unit has to come from somewhere, and the
 * device already knows. No native module: iOS and Android expose the locale
 * through modules React Native ships with, and `Intl` covers web.
 *
 * Existing installs keep whatever unit is stored; this only seeds the default.
 */

/** The regions that weigh people in pounds. Everyone else uses kilograms. */
const POUND_REGIONS = new Set(['US', 'LR', 'MM']);

/** "en-US", "en_US", "en-US@calendar=gregorian", "es-419" → the region part. */
export function regionFromLocale(locale: string | null | undefined): string | null {
  if (!locale) return null;
  const cleaned = locale.split('@')[0].replace(/_/g, '-');
  const parts = cleaned.split('-').filter(Boolean);
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i].toUpperCase();
    if (/^[A-Z]{2}$/.test(p) || /^\d{3}$/.test(p)) return p;
  }
  return null;
}

/** Unknown region keeps the historical default (pounds). */
export function weightUnitForLocale(locale: string | null | undefined): WeightUnit {
  const region = regionFromLocale(locale);
  if (!region) return 'lb';
  return POUND_REGIONS.has(region) ? 'lb' : 'kg';
}

export function deviceLocale(): string | null {
  try {
    if (Platform.OS === 'ios') {
      const settings = (NativeModules as { SettingsManager?: { settings?: Record<string, unknown> } })
        .SettingsManager?.settings;
      const apple = settings?.AppleLocale ?? (settings?.AppleLanguages as string[] | undefined)?.[0];
      if (typeof apple === 'string' && apple.length > 0) return apple;
    } else if (Platform.OS === 'android') {
      const id = (NativeModules as { I18nManager?: { localeIdentifier?: unknown } }).I18nManager
        ?.localeIdentifier;
      if (typeof id === 'string' && id.length > 0) return id;
    }
  } catch {
    // fall through to Intl
  }
  try {
    const intl = Intl.DateTimeFormat().resolvedOptions().locale;
    if (typeof intl === 'string' && intl.length > 0) return intl;
  } catch {
    // no Intl on this runtime
  }
  return null;
}

export function defaultWeightUnitForDevice(): WeightUnit {
  return weightUnitForLocale(deviceLocale());
}
