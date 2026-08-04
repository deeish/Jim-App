import React from 'react';
import { View, StyleSheet } from 'react-native';

import { radius, spacing } from '../theme';
interface IconProps {
  color: string;
  size?: number;
}

interface ProfileIconProps extends IconProps {
  /** Ring/border color; defaults to color. Use a contrasting color (e.g. primary) so ring is distinct. */
  ringColor?: string;
}

export function CalendarIcon({ color, size = 24 }: IconProps) {
  return (
    <View style={[styles.iconContainer, { width: size, height: size }]}>
      {/* Calendar outline */}
      <View style={[styles.calendarBase, { borderColor: color, borderWidth: 1.5 }]}>
        <View style={[styles.calendarTop, { backgroundColor: color }]} />
        <View style={styles.calendarLines}>
          <View style={[styles.calendarLine, { backgroundColor: color }]} />
          <View style={[styles.calendarLine, { backgroundColor: color }]} />
          <View style={[styles.calendarLine, { backgroundColor: color }]} />
        </View>
      </View>
    </View>
  );
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
  calendarBase: {
    width: 20,
    height: 20,
    borderRadius: radius.xs,
    position: 'relative',
    overflow: 'hidden',
  },
  calendarTop: {
    width: '100%',
    height: 5,
    position: 'absolute',
    top: 0,
  },
  calendarLines: {
    position: 'absolute',
    bottom: 3,
    left: 4,
    right: 4,
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: spacing.xxs,
  },
  calendarLine: {
    width: 2,
    height: 5,
    borderRadius: radius.xs,
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
