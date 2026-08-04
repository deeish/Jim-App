import React, { useMemo } from 'react';
import { Text, StyleSheet, ActivityIndicator, Pressable, ViewStyle, TextStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { radius, spacing, text, useTheme, weight } from '../theme';
import { haptics } from '../lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  /** E2E / automation (maps to `data-testid` on web). */
  testID?: string;
}

export default function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  textStyle,
  testID,
}: ButtonProps) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const inactive = disabled || loading;
  const styles = useMemo(
    () =>
      StyleSheet.create({
        button: {
          padding: spacing.lg,
          borderRadius: radius.md,
          alignItems: 'center',
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 3.84,
          elevation: 5,
        },
        primary: { backgroundColor: colors.primary },
        // Outlined in the interactive blue, not the completion green: this is a
        // secondary ACTION, and its loading spinner was already colors.primary.
        secondary: {
          backgroundColor: colors.surface,
          borderWidth: 2,
          borderColor: colors.primary,
        },
        disabled: { opacity: 0.6 },
        buttonText: { fontSize: text.headline, fontWeight: weight.semibold },
        primaryText: { color: colors.onPrimary },
        secondaryText: { color: colors.primary },
      }),
    [colors]
  );
  return (
    <AnimatedPressable
      testID={testID}
      style={[
        styles.button,
        variant === 'primary' ? styles.primary : styles.secondary,
        inactive && styles.disabled,
        style,
        animatedStyle,
      ]}
      onPress={onPress}
      disabled={inactive}
      onPressIn={() => {
        if (inactive) return;
        haptics.select();
        scale.value = withSpring(0.97, { damping: 18, stiffness: 260 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 18, stiffness: 260 });
      }}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.onPrimary : colors.primary} />
      ) : (
        <Text style={[styles.buttonText, variant === 'primary' ? styles.primaryText : styles.secondaryText, textStyle]}>
          {title}
        </Text>
      )}
    </AnimatedPressable>
  );
}
