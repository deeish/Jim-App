import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import {
  elevation,
  radius,
  spacing,
  text,
  useTheme,
  weight,
  type ColorPalette,
} from '../theme';
import { buzzSelection, sfPro } from '../lib/planCalendarPrototype';

export type CalendarScope = 'month' | 'week' | 'day';

const SEGMENTS: CalendarScope[] = ['month', 'week', 'day'];
const LABELS: Record<CalendarScope, string> = { month: 'Month', week: 'Week', day: 'Day' };
/** Inset between the segmented track and its sliding thumb. */
const SEG_PAD = 2;

/**
 * PROTOTYPE — the calendar's zoom control: a sliding Month | Week | Day
 * segmented bar rendered at the top of ALL THREE scope screens (the Photos
 * years/months/all pattern — the control persists across the levels it
 * switches, with the current level highlighted). The thumb slides, a
 * selection haptic ticks, then `onNavigate` fires so the slide is visible
 * before the screen changes. Coming back to a screen resets the thumb to
 * that screen's own scope.
 */
export default function PlanCalendarScopeBar({
  active,
  onNavigate,
}: {
  active: CalendarScope;
  onNavigate: (scope: CalendarScope) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const activeIndex = SEGMENTS.indexOf(active);

  const [selected, setSelected] = useState(activeIndex);
  const [trackW, setTrackW] = useState(0);
  const segW = trackW > 0 ? (trackW - SEG_PAD * 2) / SEGMENTS.length : 0;
  const thumbX = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: thumbX.value }],
  }));

  useFocusEffect(
    useCallback(() => {
      setSelected(activeIndex);
      if (segW > 0) thumbX.value = withTiming(activeIndex * segW, { duration: 150 });
      return () => {
        if (timer.current) clearTimeout(timer.current);
      };
    }, [activeIndex, segW, thumbX]),
  );

  const select = (i: number) => {
    if (i === selected) return;
    setSelected(i);
    buzzSelection();
    thumbX.value = withTiming(i * segW, { duration: 180 });
    if (timer.current) clearTimeout(timer.current);
    // Let the thumb finish its slide before the navigation starts.
    timer.current = setTimeout(() => onNavigate(SEGMENTS[i]), 200);
  };

  return (
    <View
      style={styles.track}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        setTrackW(w);
        // First layout: snap (not slide) the thumb onto this screen's scope.
        thumbX.value = ((w - SEG_PAD * 2) / SEGMENTS.length) * activeIndex;
      }}
    >
      {segW > 0 && <Animated.View style={[styles.thumb, { width: segW }, thumbStyle]} />}
      {SEGMENTS.map((scope, i) => (
        <Pressable
          key={scope}
          style={styles.button}
          onPress={() => select(i)}
          accessibilityRole="button"
          accessibilityLabel={`Show ${scope}`}
        >
          <Text style={[styles.label, selected === i && styles.labelActive]}>
            {LABELS[scope]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function createStyles(c: ColorPalette) {
  return StyleSheet.create({
    // iOS segmented-control geometry; the track tone is the standard system
    // segmented grey (no palette token exists for it — prototype-only).
    track: {
      flexDirection: 'row',
      backgroundColor: '#E4E4E9',
      borderRadius: radius.md,
    },
    thumb: {
      position: 'absolute',
      top: SEG_PAD,
      bottom: SEG_PAD,
      left: SEG_PAD,
      borderRadius: radius.sm,
      backgroundColor: c.surface,
      shadowColor: c.shadow,
      ...elevation.level1,
    },
    button: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.sm,
    },
    label: {
      ...sfPro,
      fontSize: text.body,
      fontWeight: weight.medium,
      color: c.textSecondary,
    },
    labelActive: {
      fontWeight: weight.semibold,
      color: c.text,
    },
  });
}
