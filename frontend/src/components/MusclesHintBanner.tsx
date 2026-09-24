import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
import { isMusclesHintSeen, markMusclesHintSeen } from '../lib/musclesHintStore';
import { radius, spacing, text, useTheme, weight } from '../theme';

/**
 * Slim first-visit hint under the Exercises search field: "New: tap Muscles
 * to browse the body". Starts hidden (no flash), shows only when storage says
 * it has never been seen, and dismisses for good from its own × or from the
 * host once the Muscles segment is opened (see `useMusclesHint`).
 */
export function useMusclesHint() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let cancelled = false;
    isMusclesHintSeen().then((seen) => {
      if (!cancelled && !seen) setVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const dismiss = useCallback(() => {
    setVisible(false);
    void markMusclesHintSeen();
  }, []);
  return { visible, dismiss };
}

export default function MusclesHintBanner({ onDismiss }: { onDismiss: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          marginHorizontal: spacing.lg,
          marginTop: spacing.sm,
          marginBottom: spacing.xs,
          paddingVertical: spacing.xs + 2,
          paddingLeft: spacing.md,
          paddingRight: spacing.xs,
          borderRadius: radius.md,
          backgroundColor: colors.primarySoft,
        },
        copy: { flex: 1, fontSize: text.footnote, color: colors.textSecondary },
        strong: { color: colors.text, fontWeight: weight.semibold },
        close: { padding: spacing.xs },
      }),
    [colors],
  );
  return (
    <View style={styles.row} accessibilityRole="text">
      <Svg width={11} height={20} viewBox="0 0 20 32">
        <Circle cx={10} cy={5} r={4} fill={colors.primary} />
        <Path
          d="M4 12 h12 a2 2 0 0 1 2 2 v6 a2 2 0 0 1 -2 2 h-1 v8 a2 2 0 0 1 -2 2 h-6 a2 2 0 0 1 -2 -2 v-8 h-1 a2 2 0 0 1 -2 -2 v-6 a2 2 0 0 1 2 -2 z"
          fill={colors.primary}
        />
      </Svg>
      <Text style={styles.copy}>
        New: tap <Text style={styles.strong}>Muscles</Text> to browse the body
      </Text>
      <Pressable
        onPress={onDismiss}
        style={styles.close}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <Ionicons name="close" size={16} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}
