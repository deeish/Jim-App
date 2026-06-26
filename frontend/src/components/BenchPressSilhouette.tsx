import React, { useEffect } from 'react';
import {
  Canvas,
  Group,
  Path,
  RoundedRect,
  Circle,
  LinearGradient,
  vec,
} from '@shopify/react-native-skia';
import {
  useSharedValue,
  useDerivedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import type { ColorPalette } from '../theme/colors';

/**
 * Animated bench-press silhouette drawn with Skia (no image assets). A reclined
 * figure on a bench presses a gold barbell up and down on a loop while the app
 * boots. Authored in a fixed 200x150 box and scaled to `size` (width).
 *
 * True side-on view, the way you'd watch someone bench: head to the left on the
 * pad, knees bent with the foot planted. The bar runs PERPENDICULAR to the body —
 * away from the viewer into the scene — so it's heavily foreshortened: we see only
 * a short stub of bar between the near plate (low/large) and the far plate
 * (high/small) rather than a wide flat plank. Both hands grip that stub and the
 * two arms come together onto it.
 *
 * Body, bench and arm origins are static; only the barbell (group translate) and
 * the two pressing arms (derived 2-segment paths) animate, all driven by a single
 * `press` value (0 = bar at chest, 1 = lockout) so they stay locked together.
 * Loaded via a guarded require in `LoadingScreen.tsx` so Expo Go (no native Skia)
 * degrades to a spinner instead of crashing.
 */

// Authoring box. VIEW_H is a touch taller than the figure and TOP_PAD shifts
// everything down a little, so the large plates aren't clipped at the top edge
// when the bar is locked out.
const VIEW_W = 200;
const VIEW_H = 160;
const TOP_PAD = 12;
// Vertical travel of the bar centre between chest (bottom) and lockout (top).
const LOCKOUT_Y = 20;
const TRAVEL = 38;
// Two shoulders (aligned in this view) and the hand grips. The grips sit on the
// short foreshortened bar (near/low and far/high), so the hands come together on
// it; HAND_*_DY is the grip's offset from the animated bar centre.
const SHOULDER_L = vec(55, 81);
const SHOULDER_R = vec(65, 81);
const HAND_A_X = 67.8;
const HAND_A_DY = -3;
const HAND_B_X = 69;
const HAND_B_DY = -7;

export default function BenchPressSilhouette({
  size = 220,
  colors,
}: {
  size?: number;
  colors: ColorPalette;
}) {
  const scale = size / VIEW_W;
  const press = useSharedValue(0);

  useEffect(() => {
    // 0 -> 1 (press up) over 750ms, then reverse back down; one full rep ~1.5s.
    // The up-phase finishes inside the loader's minimum so a rep is seen.
    press.value = withRepeat(
      withTiming(1, { duration: 750, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [press]);

  // Barbell: authored foreshortened in a local frame (bar nearly vertical,
  // receding away from the viewer) and dropped onto the chest. Only translateY
  // animates (the press).
  const barTransform = useDerivedValue(() => {
    const cy = LOCKOUT_Y + (1 - press.value) * TRAVEL;
    return [{ translateX: 68 }, { translateY: cy }];
  });

  // Each arm: shoulder -> elbow -> hand on the bar stub. Elbows flare a touch and
  // drop as the bar lowers, straightening toward lockout. Both hands track the
  // same `press` value as the bar so they stay glued to it.
  const armLeft = useDerivedValue(() => {
    const cy = LOCKOUT_Y + (1 - press.value) * TRAVEL;
    const hy = cy + HAND_A_DY;
    const mx = (SHOULDER_L.x + HAND_A_X) / 2 - (1 - press.value) * 8;
    const my = (SHOULDER_L.y + hy) / 2 + (1 - press.value) * 4;
    return `M${SHOULDER_L.x} ${SHOULDER_L.y} L${mx} ${my} L${HAND_A_X} ${hy}`;
  });
  const armRight = useDerivedValue(() => {
    const cy = LOCKOUT_Y + (1 - press.value) * TRAVEL;
    const hy = cy + HAND_B_DY;
    const mx = (SHOULDER_R.x + HAND_B_X) / 2 + (1 - press.value) * 9;
    const my = (SHOULDER_R.y + hy) / 2 + (1 - press.value) * 4;
    return `M${SHOULDER_R.x} ${SHOULDER_R.y} L${mx} ${my} L${HAND_B_X} ${hy}`;
  });

  // Fresh metallic gradient per shape (Skia shaders can't be shared as nodes).
  // Authored in the bar's local frame (top-to-bottom across the stub).
  const metal = () => (
    <LinearGradient
      start={vec(0, -20)}
      end={vec(0, 18)}
      colors={['#FFFFFF', colors.primary, '#E9D6B0']}
    />
  );

  // A round gym weight plate (not a flat disc): a gold ring with a dark recessed
  // hub and the bar collar poking through the centre, plus a sliver of edge
  // thickness peeking toward the far side so it reads as a disc with depth. The
  // bar runs near->far at ~(0.29, -0.96), so the back rim offsets along that.
  const plate = (cx: number, cy: number, r: number) => (
    <Group>
      {/* Plate edge/thickness peeking behind on the far side. */}
      <Circle c={vec(cx + 0.29 * r * 0.3, cy - 0.96 * r * 0.3)} r={r} color="#9A7B49" />
      {/* Front face. */}
      <Circle c={vec(cx, cy)} r={r}>
        <LinearGradient
          start={vec(cx, cy - r)}
          end={vec(cx, cy + r)}
          colors={[colors.onPrimary, colors.primary, '#9A7B49']}
        />
      </Circle>
      {/* Recessed centre hub (the bore). */}
      <Circle c={vec(cx, cy)} r={r * 0.42} color={colors.surface} />
      {/* Bar collar through the centre. */}
      <Circle c={vec(cx, cy)} r={r * 0.17} color={colors.primary} />
    </Group>
  );

  return (
    <Canvas style={{ width: size, height: (size * VIEW_H) / VIEW_W }}>
      <Group transform={[{ scale }, { translateY: TOP_PAD }]}>
        {/* Bench pad + legs (muted so the lifter reads as the subject). Pad ends
            just past the hip so the legs hang off the end onto the floor. */}
        <Path
          path="M50 104 L44 140 M110 104 L118 140"
          style="stroke"
          strokeWidth={5}
          strokeCap="round"
          color={colors.textMuted}
        />
        <RoundedRect x={30} y={92} width={92} height={12} r={5} color={colors.textMuted} />

        {/* Lifter (cream silhouette), in profile. Torso tapers from chest to hip. */}
        <Circle c={vec(46, 84)} r={9} color={colors.text} />
        <Path
          path="M54 86 Q56 80 64 79 L92 83 Q104 85 112 87 L112 92 L54 92 Z"
          color={colors.text}
        />
        {/* Bent leg: hip -> knee -> foot planted on the floor past the bench. */}
        <Path
          path="M108 88 L130 96 L140 138"
          style="stroke"
          strokeWidth={12}
          strokeCap="round"
          strokeJoin="round"
          color={colors.text}
        />
        {/* Both pressing arms (animated) — they come together on the bar stub. */}
        <Path
          path={armLeft}
          style="stroke"
          strokeWidth={9}
          strokeCap="round"
          strokeJoin="round"
          color={colors.text}
        />
        <Path
          path={armRight}
          style="stroke"
          strokeWidth={9}
          strokeCap="round"
          strokeJoin="round"
          color={colors.text}
        />

        {/* Barbell, foreshortened: short stub of bar between a far (small/high) and
            near (large/low) plate, so it reads as receding into the scene. */}
        <Group transform={barTransform}>
          <Path path="M-5 13 L4 -17" style="stroke" strokeWidth={6} strokeCap="round">
            {metal()}
          </Path>
          {/* Far plate (high, small) — drawn first so the near plate sits in front. */}
          {plate(4, -17, 9)}
          {/* Near plate (low, large) — the round gym plate facing the viewer. */}
          {plate(-5, 13, 16)}
        </Group>
      </Group>
    </Canvas>
  );
}
