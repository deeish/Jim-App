import React from 'react';
import { Text } from 'react-native';
import type { TextStyle, StyleProp } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import type { ColorPalette } from '../theme/colors';

/**
 * Falls back to a styled text "J" if the Skia letterform can't render (web:
 * during CanvasKit load, or if it fails). A logo glyph must never crash the app.
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
 * Custom Skia "J" monogram (web). Lazy-loaded after CanvasKit is ready, showing the
 * text "J" (styled via `fallbackStyle`) until then — so the mark degrades gracefully.
 * The native variant lives in `JGlyph.tsx`; keep the web-only CanvasKit/WASM import
 * confined to this `.web.tsx` file so it never enters the native bundle.
 */
export default function JGlyph({
  size = 72,
  colors,
  fallbackStyle,
  flex,
}: {
  size?: number;
  colors: ColorPalette;
  fallbackStyle?: StyleProp<TextStyle>;
  flex?: SharedValue<number>;
}) {
  const textFallback = <Text style={fallbackStyle}>J</Text>;
  return (
    <GlyphBoundary fallback={textFallback}>
      <WithSkiaWeb
        getComponent={() => import('./JGlyphSkia')}
        componentProps={{ size, colors, flex }}
        fallback={textFallback}
        opts={{
          locateFile: (file: string) =>
            `https://cdn.jsdelivr.net/npm/canvaskit-wasm@0.40.0/bin/full/${file}`,
        }}
      />
    </GlyphBoundary>
  );
}
