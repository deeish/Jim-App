import React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { radius } from '../theme';
import { GOLD } from '../lib/planCalendarPrototype';

/**
 * The award-seal at arbitrary size — the month grid's 18px `CompletedSeal`
 * grown for the celebration flow (hero stamp, ledger header). Same recipe:
 * 12 petal discs peeking out behind a gold gradient disc with an inner ring
 * and a white check. Built from plain views + LinearGradient because no
 * shipped binary carries react-native-svg — a view seal stays OTA-safe.
 *
 * ⚠ No shadow on the wrapper on purpose: a shadow on a background-less view
 * is computed from its square bounding box (RN-web paints the box solid
 * white; native casts a rectangular shadow) — the month seal's scar comment.
 */
export default function RosetteSeal({ size }: { size: number }) {
  const disc = size * (13 / 18);
  const petal = size * (5 / 18);
  const orbit = size * (6.3 / 18);
  const ringInset = disc * (2 / 13);

  // The check is DRAWN, not typed. An icon font centres its glyph box, and
  // where the ink sits inside that box is a property of the font on each
  // platform — so it landed a point high here, and any nudge tuned to fix that
  // would be tuned to one platform's metrics. Two rotated bars are pure
  // geometry: what centres on the rig centres on the phone.
  const stroke = Math.max(2, Math.round(size * 0.07));
  const armShort = size * 0.14;
  const armLong = size * 0.27;
  // Solve for the vertex that puts the mark's own box on the disc's centre.
  // The rounded caps extend it equally at both ends, so they cancel.
  const halfShort = armShort / (2 * Math.SQRT2);
  const halfLong = armLong / (2 * Math.SQRT2);
  const vx = disc / 2 - (armLong - armShort) / (2 * Math.SQRT2);
  const vy = disc / 2 + halfLong;
  const arm = (len: number, dx: number, dy: number, deg: string) => ({
    position: 'absolute' as const,
    left: vx + dx - len / 2,
    top: vy + dy - stroke / 2,
    width: len,
    height: stroke,
    borderRadius: stroke / 2,
    backgroundColor: '#FFFFFF',
    transform: [{ rotate: deg }],
  });
  const petals = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * 2 * Math.PI;
    return {
      left: size / 2 + orbit * Math.cos(a) - petal / 2,
      top: size / 2 + orbit * Math.sin(a) - petal / 2,
    };
  });
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      {petals.map((p, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: p.left,
            top: p.top,
            width: petal,
            height: petal,
            borderRadius: radius.pill,
            backgroundColor: '#E8940F',
          }}
        />
      ))}
      <LinearGradient
        colors={['#FFD34D', GOLD, '#E08D0C']}
        style={{
          position: 'absolute',
          left: (size - disc) / 2,
          top: (size - disc) / 2,
          width: disc,
          height: disc,
          borderRadius: radius.pill,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            position: 'absolute',
            left: ringInset,
            top: ringInset,
            width: disc - ringInset * 2,
            height: disc - ringInset * 2,
            borderRadius: radius.pill,
            borderWidth: Math.max(1, Math.round(size / 42)),
            borderColor: 'rgba(255,255,255,0.5)',
          }}
        />
        {/* short arm, running up-LEFT from the vertex */}
        <View style={arm(armShort, -halfShort, -halfShort, '45deg')} />
        {/* long arm, running up-RIGHT from the vertex */}
        <View style={arm(armLong, halfLong, -halfLong, '-45deg')} />
      </LinearGradient>
    </View>
  );
}
