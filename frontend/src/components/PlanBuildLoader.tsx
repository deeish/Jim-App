import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { spacing, text, useTheme, weight } from '../theme';
import JimMark from './JimMark';

/**
 * The wait while a plan is generated: the logo mark, breathing, with the
 * stage the build is at underneath. Replaces the Skia bench-press silhouette
 * (Dylan, 2026-09-16).
 *
 * ⚠ The mark is identity, never a meter (decided 2026-09-13). All five
 * segments stay lit; nothing here maps progress onto the letter. The only
 * motion is a slow opacity/scale breath, and it is static under reduce-motion.
 *
 * The stages are copy, not instrumentation: the backend does not stream
 * progress, so the lines advance on a timer and hold on the last one. They
 * name what the pipeline actually does, in order, so a 10-second wait reads
 * as "picking exercises", a 60-second one as "checking the plan".
 */

export const PLAN_BUILD_STAGES = [
  'Picking your exercises',
  'Balancing the week',
  'Setting your numbers',
  'Checking the plan',
] as const;

type Props = {
  /** Mark box, in points. 96 is the splash size; 56 suits an inline wait. */
  size?: number;
  /** One line under the mark. Omit for the staged copy; pass `null` for none. */
  label?: string | null;
  /** Seconds each stage holds before the next (the last holds forever). */
  stageSeconds?: number;
};

export default function PlanBuildLoader({ size = 96, label, stageSeconds = 4 }: Props) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const breath = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      breath.value = 1;
      return;
    }
    breath.value = withRepeat(
      withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [breath, reduceMotion]);

  const markStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + 0.45 * breath.value,
    transform: [{ scale: 1 + 0.04 * (1 - breath.value) }],
  }));

  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (label !== undefined) return;
    if (stage >= PLAN_BUILD_STAGES.length - 1) return;
    const t = setTimeout(() => setStage((s) => s + 1), stageSeconds * 1000);
    return () => clearTimeout(t);
  }, [label, stage, stageSeconds]);

  const line = label === undefined ? PLAN_BUILD_STAGES[stage] : label;

  return (
    <View style={styles.root} accessibilityRole="progressbar" accessibilityLabel="Building your plan">
      <Animated.View style={markStyle}>
        <JimMark size={size} />
      </Animated.View>
      {line ? (
        <Text style={[styles.line, { color: colors.textSecondary }]}>{line}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  line: {
    fontSize: text.callout,
    fontWeight: weight.medium,
    textAlign: 'center',
  },
});
