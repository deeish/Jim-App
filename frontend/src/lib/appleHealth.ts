import { Platform } from 'react-native';
import type { WorkoutActivityType } from '@kingstinct/react-native-healthkit';
import { estimateActiveEnergyKcal } from './appleHealthEnergy';

/**
 * Apple Health, behind one guarded require.
 *
 * `@kingstinct/react-native-healthkit` is a native (Nitro) module. It exists
 * only in a binary built after 2026-09-13, never in Expo Go or on the web, and
 * an OTA update reaching an older binary must not white-screen — so the module
 * is loaded lazily inside a try, and every export here degrades to "not
 * available" / false when it is missing. Never import it at module scope
 * anywhere else (see feedback: native-module-import-whitescreen).
 *
 * What Jim does with Health, and all it does:
 * - writes each finished workout as traditional strength training with an
 *   estimated active energy, so it counts toward the rings;
 * - reads the most recent body mass, only to make that estimate.
 */
type HealthKit = typeof import('@kingstinct/react-native-healthkit');

let cached: HealthKit | null | undefined;

function healthKit(): HealthKit | null {
  if (cached !== undefined) return cached;
  if (Platform.OS !== 'ios') {
    cached = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('@kingstinct/react-native-healthkit') as HealthKit;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[AppleHealth] module not in this binary; Health features hidden.', e);
    cached = null;
  }
  return cached;
}

/**
 * `WorkoutActivityType.traditionalStrengthTraining`. Spelled as its raw value
 * so this file never touches the module at import time (the enum lives in the
 * native-backed package).
 */
const TRADITIONAL_STRENGTH_TRAINING = 50 as unknown as WorkoutActivityType;

const WORKOUT_TYPE = 'HKWorkoutTypeIdentifier' as const;
const ACTIVE_ENERGY = 'HKQuantityTypeIdentifierActiveEnergyBurned' as const;
const BODY_MASS = 'HKQuantityTypeIdentifierBodyMass' as const;

/** True only on an iPhone running a binary that links HealthKit. */
export function isAppleHealthAvailable(): boolean {
  const hk = healthKit();
  if (!hk) return false;
  try {
    return hk.isHealthDataAvailable();
  } catch {
    return false;
  }
}

/**
 * Shows Apple's permission sheet. Resolves true when the sheet completed; iOS
 * does not say which toggles the user left on, so a later write can still
 * fail — callers treat the write result as the truth.
 */
export async function connectAppleHealth(): Promise<boolean> {
  const hk = healthKit();
  if (!hk) return false;
  try {
    return await hk.requestAuthorization({
      toShare: [WORKOUT_TYPE, ACTIVE_ENERGY],
      toRead: [BODY_MASS],
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[AppleHealth] authorization failed', e);
    return false;
  }
}

/** Most recent body mass in Health, in pounds; null when none or not permitted. */
export async function readLatestBodyMassLb(): Promise<number | null> {
  const hk = healthKit();
  if (!hk) return null;
  try {
    const sample = await hk.getMostRecentQuantitySample(BODY_MASS, 'lb');
    const lb = sample?.quantity;
    return typeof lb === 'number' && Number.isFinite(lb) && lb > 0 ? lb : null;
  } catch {
    return null;
  }
}

/** One write per calendar day per app session: the finish screen can remount. */
const writtenDays = new Set<string>();

export async function saveStrengthWorkoutToAppleHealth(input: {
  dateIso: string;
  title: string;
  startDate: Date;
  endDate: Date;
}): Promise<boolean> {
  const hk = healthKit();
  if (!hk) return false;
  if (writtenDays.has(input.dateIso)) return true;
  const seconds = Math.round((input.endDate.getTime() - input.startDate.getTime()) / 1000);
  if (!Number.isFinite(seconds) || seconds < 60) return false;
  const kcal = estimateActiveEnergyKcal(seconds, await readLatestBodyMassLb());
  try {
    await hk.saveWorkoutSample(
      TRADITIONAL_STRENGTH_TRAINING,
      [
        {
          quantityType: ACTIVE_ENERGY,
          quantity: kcal,
          unit: 'kcal',
          startDate: input.startDate,
          endDate: input.endDate,
        },
      ],
      input.startDate,
      input.endDate,
      { energyBurned: kcal },
      // HKMetadataKeyWorkoutBrandName is what the Fitness app shows as the source line.
      { HKWorkoutBrandName: 'Jim', title: input.title } as never,
    );
    writtenDays.add(input.dateIso);
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[AppleHealth] workout write failed', e);
    return false;
  }
}
