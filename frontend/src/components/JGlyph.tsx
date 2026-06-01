import React from 'react';
import type { TextStyle, StyleProp } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import type { ColorPalette } from '../theme/colors';
import JGlyphSkia from './JGlyphSkia';

/**
 * Custom Skia "J" monogram (native). Renders the letterform directly via the
 * native Skia module.
 *
 * The web variant lives in `JGlyph.web.tsx` and MUST stay a separate file: Metro
 * bundles static imports for every platform, so importing the web-only
 * `@shopify/react-native-skia/lib/module/web` entry here would pull CanvasKit/WASM
 * (which imports Node `fs`) into the native bundle and break the iOS/Android build.
 * `fallbackStyle` is part of the shared prop contract but unused on native.
 */
export default function JGlyph({
  size = 72,
  colors,
  flex,
}: {
  size?: number;
  colors: ColorPalette;
  fallbackStyle?: StyleProp<TextStyle>;
  flex?: SharedValue<number>;
}) {
  return <JGlyphSkia size={size} colors={colors} flex={flex} />;
}
