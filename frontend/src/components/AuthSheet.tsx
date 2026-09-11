import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { elevationUp, radius, spacing, useTheme } from '../theme';

/**
 * The bottom sheet every signed-out screen puts its controls in. Everything a
 * thumb needs to reach lives here; the hero above it is for looking at.
 * Bottom padding absorbs the home indicator so the last control never sits on it.
 */
export default function AuthSheet({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.sheet,
        {
          backgroundColor: colors.surface,
          shadowColor: colors.shadow,
          paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.sm,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xl,
    ...elevationUp,
  },
});
