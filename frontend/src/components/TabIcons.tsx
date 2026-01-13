import React from 'react';
import { View, StyleSheet } from 'react-native';

interface IconProps {
  color: string;
  size?: number;
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

export function DumbbellIcon({ color, size = 24 }: IconProps) {
  return (
    <View style={[styles.iconContainer, { width: size, height: size }]}>
      {/* Dumbbell shape */}
      <View style={styles.dumbbellContainer}>
        <View style={[styles.dumbbellWeight, { backgroundColor: color }]} />
        <View style={[styles.dumbbellBar, { backgroundColor: color }]} />
        <View style={[styles.dumbbellWeight, { backgroundColor: color }]} />
        <View style={[styles.dumbbellBar, { backgroundColor: color }]} />
        <View style={[styles.dumbbellWeight, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarBase: {
    width: 20,
    height: 20,
    borderRadius: 4,
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
    gap: 2,
  },
  calendarLine: {
    width: 2,
    height: 5,
    borderRadius: 1,
  },
  dumbbellContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dumbbellWeight: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  dumbbellBar: {
    width: 3,
    height: 2,
    marginHorizontal: 0.5,
  },
});
