import React, { useEffect } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Canvas, Fill, Group, Circle, RadialGradient, Blur, vec } from '@shopify/react-native-skia';
import {
  useSharedValue,
  useDerivedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import type { ColorPalette } from '../theme/colors';

/**
 * GPU-rendered ambient backdrop: a few large, blurred radial color blobs that
 * drift slowly to form a soft "aurora" mesh over the dark base. Rendered with
 * Skia so the blur is real (no image assets). On web this is lazy-loaded by
 * `Aurora.tsx` once CanvasKit is ready.
 */
export default function AuroraBackground({ colors }: { colors: ColorPalette }) {
  const { width, height } = useWindowDimensions();
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: 14000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [t]);

  // Three blobs drifting on gentle, out-of-phase paths, spread top-to-bottom so
  // the warmth wraps the whole screen rather than pooling at the top.
  // Primary (gold): hero glow, upper-center.
  const c1 = useDerivedValue(() =>
    vec(width * 0.52 + (t.value - 0.5) * 60, height * 0.3 + (t.value - 0.5) * 44),
  );
  // Accent (orange): lower-right, warms the area around the CTA.
  const c2 = useDerivedValue(() =>
    vec(width * 0.78 - (t.value - 0.5) * 70, height * 0.82 + (t.value - 0.5) * 50),
  );
  // Secondary (green): mid-left, adds a touch of cool depth against the warmth.
  const c3 = useDerivedValue(() =>
    vec(width * 0.14 + (t.value - 0.5) * 56, height * 0.56 - (t.value - 0.5) * 60),
  );

  const r1 = Math.max(width, height) * 0.6;
  const r2 = Math.max(width, height) * 0.55;
  const r3 = Math.max(width, height) * 0.5;

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Fill color={colors.background} />
      <Group>
        <Blur blur={60} />
        {/* All three blobs stay in the blue family at low alpha. The previous
            45-70% saturated blobs were tuned to GLOW on a near-black base; over a
            white one the same alphas subtract luminance and read as dirt. */}
        <Circle c={c1} r={r1}>
          <RadialGradient
            c={c1}
            r={r1}
            colors={[`${colors.brandGradientStart}26`, `${colors.brandGradientStart}00`]}
          />
        </Circle>
        <Circle c={c2} r={r2}>
          <RadialGradient c={c2} r={r2} colors={[`${colors.primary}1A`, `${colors.primary}00`]} />
        </Circle>
        <Circle c={c3} r={r3}>
          <RadialGradient
            c={c3}
            r={r3}
            colors={[`${colors.brandGradientStart}14`, `${colors.brandGradientStart}00`]}
          />
        </Circle>
      </Group>
    </Canvas>
  );
}
