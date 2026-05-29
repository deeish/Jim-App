import React from 'react';
import { Canvas, Path, Group, RoundedRect, LinearGradient, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import type { ColorPalette } from '../theme/colors';

/**
 * Custom "J" monogram drawn as Skia vector paths — gym-themed: the top bar of
 * the J is a barbell (a sleeve with a weight plate on each end), and the stem +
 * rounded hook hang beneath as the J body. Authored in a 72x72 box, scaled to
 * `size`, with a slight italic lean to match the "Jim" wordmark.
 *
 * Easter egg: when `flex` rises to 1 (tap-to-flex), faint "abs" etch onto the
 * stem — a centre line plus horizontal cuts — then fade back out.
 */
// J body: stem dropping from the bar centre, into a rounded hook on the left.
const J_BODY = 'M36 17 L36 45 Q36 60 24 60 Q12 60 12 49';
// Barbell sleeve (the J's top bar).
const BAR = 'M9 17 L63 17';
// "Six-pack" carved on the stem: vertical linea + three horizontal cuts.
const ABS = 'M36 22 L36 43 M30 28 L42 28 M30 34 L42 34 M30 40 L42 40';

export default function JGlyphSkia({
  size = 72,
  colors,
  flex,
}: {
  size?: number;
  colors: ColorPalette;
  flex?: SharedValue<number>;
}) {
  const scale = size / 72;
  const absOpacity = useDerivedValue(() => (flex ? flex.value : 0));
  // A fresh metallic gradient per shape (Skia shaders can't be shared as nodes).
  const metal = () => (
    <LinearGradient
      start={vec(36, 4)}
      end={vec(36, 64)}
      colors={['#FFFFFF', colors.onPrimary, '#E9D6B0']}
    />
  );
  return (
    <Canvas style={{ width: size, height: size }}>
      <Group transform={[{ scale }]}>
        <Group origin={vec(36, 36)} transform={[{ skewX: -0.18 }]}>
          {/* Barbell sleeve */}
          <Path path={BAR} style="stroke" strokeWidth={6} strokeCap="round">
            {metal()}
          </Path>
          {/* Weight plates on each end */}
          <RoundedRect x={12} y={5} width={8} height={24} r={2.5}>
            {metal()}
          </RoundedRect>
          <RoundedRect x={52} y={5} width={8} height={24} r={2.5}>
            {metal()}
          </RoundedRect>
          {/* J body — heavier stem for a stronger, more athletic letterform */}
          <Path path={J_BODY} style="stroke" strokeWidth={12} strokeCap="round" strokeJoin="round">
            {metal()}
          </Path>
          {/* Abs (tap-to-flex easter egg) carved into the stem */}
          <Group opacity={absOpacity}>
            <Path
              path={ABS}
              style="stroke"
              strokeWidth={2}
              strokeCap="round"
              color="rgba(58,30,10,0.6)"
            />
          </Group>
        </Group>
      </Group>
    </Canvas>
  );
}
