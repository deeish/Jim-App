import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { ColorPalette } from '../theme/colors';
import { radius, weight } from '../theme';
import { getProfileAvatar, type ProfileAvatarId } from '../constants/profileAvatars';

/**
 * The aurora avatar: a deep diagonal base gradient with two translucent veils
 * glowing in from opposite corners, and the user's initial on top.
 *
 * Built from `expo-linear-gradient` layers on purpose — no Skia, no SVG. Skia
 * falls back to nothing in Expo Go and lazy-loads CanvasKit on web, and
 * react-native-svg isn't in this binary; a native dependency shipped over the
 * air to a binary that doesn't link it is this repo's known crash recipe. The
 * veil trick that makes plain linear gradients read as aurora: each veil is a
 * big circle hanging mostly OUTSIDE the disc, filled with a gradient that goes
 * transparent before the circle's hard edge enters the visible clip — so all
 * the eye sees is the soft fade.
 */

/** Veil placement per corner: offset the circle so ~2/3 spills into view. */
function veilStyle(corner: 0 | 1 | 2 | 3, diameter: number): ViewStyle {
  const off = -0.32 * diameter;
  const base: ViewStyle = {
    position: 'absolute',
    width: diameter,
    height: diameter,
    borderRadius: radius.pill,
  };
  switch (corner) {
    case 0: return { ...base, top: off, left: off };
    case 1: return { ...base, top: off, right: off };
    case 2: return { ...base, bottom: off, right: off };
    default: return { ...base, bottom: off, left: off };
  }
}

/** Gradient axis per corner: coloured at the corner, transparent toward centre. */
const VEIL_AXES = [
  { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  { start: { x: 1, y: 0 }, end: { x: 0, y: 1 } },
  { start: { x: 1, y: 1 }, end: { x: 0, y: 0 } },
  { start: { x: 0, y: 1 }, end: { x: 1, y: 0 } },
] as const;

export function ProfileAvatarDisc({
  avatarId,
  size,
  colors,
  initial,
}: {
  avatarId: ProfileAvatarId;
  size: number;
  colors: ColorPalette;
  /** First letter of the display name; omit for pure aurora (picker swatches). */
  initial?: string;
}) {
  const entry = getProfileAvatar(avatarId);
  const cornerA = entry.spin;
  const cornerB = ((entry.spin + 2) % 4) as 0 | 1 | 2 | 3;
  const glyph = initial?.trim().charAt(0).toUpperCase() ?? '';

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.pill,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <LinearGradient
        colors={[entry.base[0], entry.base[1]]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[`${entry.veilA}C4`, `${entry.veilA}00`]}
        locations={[0, 0.88]}
        start={VEIL_AXES[cornerA].start}
        end={VEIL_AXES[cornerA].end}
        style={veilStyle(cornerA, size * 1.9)}
        pointerEvents="none"
      />
      <LinearGradient
        colors={[`${entry.veilB}8C`, `${entry.veilB}00`]}
        locations={[0, 0.8]}
        start={VEIL_AXES[cornerB].start}
        end={VEIL_AXES[cornerB].end}
        style={veilStyle(cornerB, size * 1.4)}
        pointerEvents="none"
      />
      {/* Top gloss, same treatment as the brand tile. */}
      <LinearGradient
        colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
        locations={[0, 0.55]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {glyph ? (
        <Text
          style={{
            color: colors.onPrimary,
            fontSize: Math.round(size * 0.42),
            fontWeight: weight.heavy,
            // Web centres line boxes generously; native needs the nudge killed.
            includeFontPadding: false,
          }}
          allowFontScaling={false}
        >
          {glyph}
        </Text>
      ) : initial !== undefined ? (
        // Caller wanted an initial but has no name yet — quiet person glyph.
        <Ionicons name="person" size={Math.round(size * 0.46)} color={colors.onPrimary} />
      ) : null}
    </View>
  );
}
