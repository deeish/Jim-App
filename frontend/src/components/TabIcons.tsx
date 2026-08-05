import React from 'react';
import { View, StyleSheet } from 'react-native';

import { radius } from '../theme';
interface IconProps {
  color: string;
  size?: number;
}

interface ProfileIconProps extends IconProps {
  /** Ring/border color; defaults to color. Use a contrasting color (e.g. primary) so ring is distinct. */
  ringColor?: string;
}

export function ProfileIcon({ color, size = 24, ringColor }: ProfileIconProps) {
  const ring = ringColor ?? color;
  return (
    <View
      style={[
        styles.iconContainer,
        styles.profileRing,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: ring,
        },
      ]}
    >
      {/* Person silhouette: circle head + body, inset so ring is clearly separate */}
      <View style={[styles.profileHead, { backgroundColor: color }]} />
      <View style={[styles.profileBody, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileRing: {
    overflow: 'hidden',
  },
  profileHead: {
    width: 6,
    height: 6,
    borderRadius: radius.xs,
    position: 'absolute',
    top: 5,
    left: 11,
  },
  profileBody: {
    width: 12,
    height: 8,
    borderRadius: radius.sm,
    position: 'absolute',
    bottom: 5,
    left: 8,
  },
});
