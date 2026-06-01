import React from 'react';
import { Text } from 'react-native';
import type { TextStyle, StyleProp } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import type { ColorPalette } from '../theme/colors';

type JGlyphProps = {
  size?: number;
  colors: ColorPalette;
  fallbackStyle?: StyleProp<TextStyle>;
  flex?: SharedValue<number>;
};

/**
 * react-native-skia is a native module that is NOT bundled into Expo Go, so its
 * import throws there. Load the Skia letterform via a guarded require so that throw
 * is caught and we fall back to a styled text "J" instead of crashing at startup.
 * Real iOS/Android builds link Skia in, so this succeeds and the glyph renders.
 */
const JGlyphSkia = ((): React.ComponentType<{
  size?: number;
  colors: ColorPalette;
  flex?: SharedValue<number>;
}> | null => {
  try {
    return require('./JGlyphSkia').default;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[JGlyph] native Skia unavailable; using text fallback.', e);
    return null;
  }
})();

/**
 * Second safety net: if Skia loaded but throws while rendering, degrade to the
 * text "J" rather than crashing — a logo glyph must never take down the app.
 */
class GlyphBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.warn('[JGlyph] Skia letterform failed; using text fallback.', error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Custom Skia "J" monogram (native). Renders the letterform when Skia is available,
 * otherwise a styled text "J". The web variant lives in `JGlyph.web.tsx`; keep the
 * web-only CanvasKit/WASM import out of this file so it never enters the native bundle.
 */
export default function JGlyph({ size = 72, colors, fallbackStyle, flex }: JGlyphProps) {
  const textFallback = <Text style={fallbackStyle}>J</Text>;
  if (!JGlyphSkia) return textFallback;
  return (
    <GlyphBoundary fallback={textFallback}>
      <JGlyphSkia size={size} colors={colors} flex={flex} />
    </GlyphBoundary>
  );
}
