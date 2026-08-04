import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { leading, radius, spacing, text, useTheme, weight } from '../theme';

/**
 * The shared empty / error state.
 *
 * Nine screens already had one of these and every one was built from scratch,
 * which is how the app ended up with icons at 40, 44 and 48, three different
 * body widths and two different tones of voice. The shape was never the problem;
 * the absence of one implementation was.
 *
 * `tone` picks the icon colour only. An empty state is a normal, expected
 * outcome and should not look like a failure — `error` is reserved for a genuine
 * fetch that did not come back.
 */
export default function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  tone = 'neutral',
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'neutral' | 'brand' | 'error';
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const iconColor =
    tone === 'brand' ? colors.primary : tone === 'error' ? colors.error : colors.textMuted;

  return (
    <View style={[styles.wrap, style]}>
      <Ionicons name={icon} size={44} color={iconColor} />
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {body ? <Text style={[styles.body, { color: colors.textTertiary }]}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <TouchableOpacity
          style={[styles.action, { borderColor: colors.primary }]}
          onPress={onAction}
          accessibilityRole="button"
        >
          <Text style={[styles.actionText, { color: colors.primary }]}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxxl,
    gap: spacing.md,
  },
  title: {
    fontSize: text.headline,
    fontWeight: weight.bold,
    textAlign: 'center',
  },
  body: {
    fontSize: text.body,
    lineHeight: leading.body,
    textAlign: 'center',
  },
  action: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  actionText: {
    fontSize: text.callout,
    fontWeight: weight.semibold,
  },
});
