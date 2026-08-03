import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { ColorPalette } from '../theme/colors';

/**
 * Plain layered gradient shown when the Skia aurora can't render. Smooth and
 * dependency-light, so a missing/failed Skia backdrop never blocks the screen.
 */
function GradientFallback({ colors }: { colors: ColorPalette }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[`${colors.brandGradientStart}1F`, colors.background, `${colors.primary}14`]}
        locations={[0, 0.55, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

/**
 * react-native-skia is a native module that is NOT bundled into Expo Go, so its
 * import throws ("Exception in HostFunction") there. Load AuroraBackground via a
 * guarded require so that throw is caught and we fall back to the gradient instead
 * of crashing at startup. Real iOS/Android builds link Skia in, so this succeeds
 * and the full animated aurora renders — the fallback only triggers in Expo Go.
 */
const AuroraBackground = ((): React.ComponentType<{ colors: ColorPalette }> | null => {
  try {
    return require('./AuroraBackground').default;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[Aurora] native Skia unavailable; using gradient fallback.', e);
    return null;
  }
})();

/**
 * Second safety net: if Skia loaded but throws while rendering (e.g. CanvasKit
 * abort), degrade to the gradient rather than white-screening the app.
 */
class SkiaBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.warn('[Aurora] Skia backdrop failed; using gradient fallback.', error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Animated Skia aurora backdrop (native). Renders the GPU-backed AuroraBackground
 * when Skia is available, otherwise a gradient. The web variant lives in
 * `Aurora.web.tsx`; keep the web-only CanvasKit/WASM import out of this file so it
 * never enters the native bundle.
 */
export default function Aurora({ colors }: { colors: ColorPalette }) {
  if (!AuroraBackground) return <GradientFallback colors={colors} />;
  return (
    <SkiaBoundary fallback={<GradientFallback colors={colors} />}>
      <AuroraBackground colors={colors} />
    </SkiaBoundary>
  );
}
