import React from 'react';
import type { ColorPalette } from '../theme/colors';
import AuroraBackground from './AuroraBackground';

/**
 * Animated Skia aurora backdrop (native). Renders the GPU-backed AuroraBackground
 * directly via the native Skia module.
 *
 * The web variant lives in `Aurora.web.tsx` and MUST stay a separate file: Metro
 * bundles static imports for every platform regardless of runtime `Platform.OS`
 * checks, so importing the web-only `@shopify/react-native-skia/lib/module/web`
 * entry here would pull CanvasKit/WASM (which imports Node `fs`) into the native
 * bundle and break the iOS/Android build.
 */
export default function Aurora({ colors }: { colors: ColorPalette }) {
  return <AuroraBackground colors={colors} />;
}
