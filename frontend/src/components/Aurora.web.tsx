import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import type { ColorPalette } from '../theme/colors';

/**
 * Shown on web while CanvasKit (WASM) loads, and as a graceful degrade if it
 * fails. A plain layered linear gradient — not as rich as the Skia aurora, but
 * smooth and dependency-light, so web preview and Playwright e2e never block on
 * the WASM canvas.
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
 * Ensures a Skia/CanvasKit failure on web degrades to the gradient fallback
 * instead of crashing the whole screen (a background must never white-screen
 * the app). A rejected lazy import / CanvasKit abort throws during render and
 * is caught here.
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
    console.warn('[Aurora] Skia web backdrop failed; using gradient fallback.', error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Animated Skia aurora backdrop (web). Lazy-loaded after CanvasKit is ready, with
 * the gradient fallback shown meanwhile. The native variant lives in `Aurora.tsx`;
 * keep the web-only CanvasKit/WASM import confined to this `.web.tsx` file so it
 * never enters the native bundle.
 */
export default function Aurora({ colors }: { colors: ColorPalette }) {
  return (
    <SkiaBoundary fallback={<GradientFallback colors={colors} />}>
      <WithSkiaWeb
        getComponent={() => import('./AuroraBackground')}
        componentProps={{ colors }}
        fallback={<GradientFallback colors={colors} />}
        // Metro's web dev server doesn't serve the CanvasKit wasm, so it 404s to
        // index.html (the "expected magic word" error). Load it from a CDN at the
        // exact version Skia bundles (canvaskit-wasm 0.40.0, `full` build).
        opts={{
          locateFile: (file: string) =>
            `https://cdn.jsdelivr.net/npm/canvaskit-wasm@0.40.0/bin/full/${file}`,
        }}
      />
    </SkiaBoundary>
  );
}
