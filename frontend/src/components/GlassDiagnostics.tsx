import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Platform, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { glassAvailable } from './GlassSurface';
import { radius, spacing, text, useTheme, weight } from '../theme';

/**
 * Hidden Liquid Glass diagnostic, toggled by long-pressing the "App version"
 * row in Profile. Its whole purpose is one screenshot from a TestFlight build:
 * every value here is ground truth read on the device, so a single image
 * settles what cannot be proven from a Windows machine — whether the native
 * module is in the binary, what the OS probe actually returned, and which
 * bundle (embedded vs OTA) produced the pixels on screen.
 *
 * Reads the native module via `requireOptionalNativeModule`, which returns
 * `null` instead of throwing when the module is absent — this screen must
 * never reintroduce the unwrapped-probe crash that e633cd7 fixed.
 */

type GlassNativeConstants = {
  /** Native constant: iOS 26+, compiled with Xcode 26, no compatibility opt-out. */
  isLiquidGlassAvailable?: boolean;
  /** Native constant: the UIGlassEffect class actually responds at runtime. */
  isGlassEffectAPIAvailable?: boolean;
};

function fmt(value: boolean | undefined, whenMissing: string): string {
  if (value === undefined) return whenMissing;
  return value ? 'true' : 'false';
}

export default function GlassDiagnostics() {
  const { colors } = useTheme();

  // Never throws: null when the module is not in the binary (old build, web).
  const nativeModule = useMemo(
    () => requireOptionalNativeModule<GlassNativeConstants>('ExpoGlassEffect'),
    [],
  );

  // iOS accessibility setting that visually flattens glass while
  // isLiquidGlassAvailable stays true — the one case where "glass path taken"
  // and "no glass visible" are both correct at once. The setting only exists
  // on iOS, so every other platform gets its final value at first render and
  // never touches the probe (react-native-web stubs AccessibilityInfo with a
  // promise that never settles, which would pin the row on "…" forever).
  const [reduceTransparency, setReduceTransparency] = useState<string>(
    Platform.OS === 'ios' ? '…' : 'n/a (iOS only)',
  );
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let mounted = true;
    const probe = AccessibilityInfo.isReduceTransparencyEnabled;
    if (typeof probe !== 'function') {
      setReduceTransparency('unknown');
      return;
    }
    probe
      .call(AccessibilityInfo)
      .then((on: boolean) => mounted && setReduceTransparency(on ? 'ON (flattens glass)' : 'off'))
      .catch(() => mounted && setReduceTransparency('unknown'));
    return () => {
      mounted = false;
    };
  }, []);

  const bundle = Updates.updateId
    ? `OTA ${Updates.updateId.slice(0, 8)}${Updates.channel ? ` (${Updates.channel})` : ''}`
    : 'embedded';

  const rows: Array<[string, string]> = [
    ['Runtime', `${Platform.OS} ${String(Platform.Version ?? '')}`.trim()],
    ['JS bundle', bundle],
    ['ExpoGlassEffect module', nativeModule ? 'present in binary' : 'MISSING from binary'],
    ['isLiquidGlassAvailable', fmt(nativeModule?.isLiquidGlassAvailable, 'n/a (no module)')],
    ['UIGlassEffect API', fmt(nativeModule?.isGlassEffectAPIAvailable, 'n/a (no module)')],
    ['App glass gate', glassAvailable ? 'GLASS' : 'OPAQUE FALLBACK'],
    ['Tab bar fill', glassAvailable ? 'glass material (floating)' : 'opaque surface (floating)'],
    ['Weight sheet fill', glassAvailable ? 'glass material' : 'opaque surface'],
    // Static fact of this dependency set, not a probe: react-native-screens
    // 4.16 always overrides the UINavigationBar appearance, so the system
    // never applies glass to the History/Progress headers regardless of the
    // gate above.
    ['History/Progress headers', 'opaque (needs newer react-native-screens)'],
    ['Reduce Transparency', reduceTransparency],
  ];

  return (
    <View
      style={{
        marginTop: spacing.sm,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.lg,
      }}
    >
      <Text
        style={{
          fontSize: text.caption,
          fontWeight: weight.bold,
          color: colors.textMuted,
          marginBottom: spacing.xs,
          letterSpacing: 0.5,
        }}
      >
        LIQUID GLASS DIAGNOSTIC
      </Text>
      {rows.map(([label, value]) => (
        <View
          key={label}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: spacing.md,
            paddingVertical: spacing.xxs,
          }}
        >
          <Text style={{ fontSize: text.caption, color: colors.textSecondary }}>{label}</Text>
          <Text
            style={{
              fontSize: text.caption,
              fontWeight: weight.semibold,
              color: colors.text,
              flexShrink: 1,
              textAlign: 'right',
            }}
          >
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}
