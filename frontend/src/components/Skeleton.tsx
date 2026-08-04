import React, { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { duration, easing, radius, spacing, useTheme } from '../theme';

/**
 * Placeholder blocks shaped like the content that is about to arrive.
 *
 * A centred spinner tells the user only that something is happening. A skeleton
 * tells them what is coming and roughly how much of it, so the screen does not
 * visibly rearrange itself the moment data lands — which is most of what makes a
 * slow load feel slow.
 *
 * Use these for content the screen is fetching. A spinner is still the right
 * answer inside a button that is mid-submit, where there is no shape to promise.
 */

/** One shimmering block. */
export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius = radius.sm,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const pulse = useSharedValue(0.55);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, {
        duration: duration.slow * 2,
        easing: Easing.bezier(...easing.inOut),
      }),
      -1,
      true,
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius, backgroundColor: colors.border },
        animatedStyle,
        style,
      ]}
    />
  );
}

/** A card-shaped placeholder: title, subtitle, and a couple of body lines. */
export function SkeletonCard({ lines = 2, style }: { lines?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        style,
      ]}
    >
      <Skeleton width="55%" height={18} />
      <Skeleton width="35%" height={12} style={styles.gapSm} />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 ? '70%' : '100%'}
          height={12}
          style={styles.gapMd}
        />
      ))}
    </View>
  );
}

/** A stack of row placeholders, for list screens. */
export function SkeletonList({ count = 4, style }: { count?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={style}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Skeleton width={40} height={40} borderRadius={radius.sm} />
          <View style={styles.rowText}>
            {/* Widths taper down the list so it reads as varied content rather
              than a stack of identical bars. Floored so a long list cannot
              produce a negative width. */}
          <Skeleton width={`${Math.max(30, 70 - i * 6)}%`} height={15} />
            <Skeleton width="40%" height={11} style={styles.gapSm} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  rowText: { flex: 1 },
  gapSm: { marginTop: spacing.sm },
  gapMd: { marginTop: spacing.md },
});
