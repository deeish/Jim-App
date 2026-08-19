import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { haptics } from '../lib/haptics';

import { spacing } from '../theme';
export interface WorkoutLikeButtonProps {
  /** Workout id from API; when undefined, button is disabled (e.g. preview workout). */
  workoutId: string | undefined;
  /** Whether this workout is currently in the user's Saved list. */
  saved: boolean;
  /** Called when user taps to save. */
  onSave: () => void | Promise<void>;
  /** Called when user taps to unsave. */
  onUnsave: () => void | Promise<void>;
  /** When true, button is disabled (e.g. request in progress). */
  disabled?: boolean;
  size?: number;
  style?: ViewStyle;
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * Heart button to like/save a workout. Use anywhere a workout is shown (Plan cards, detail sheet, Workout tab, Workout Detail screen).
 */
export default function WorkoutLikeButton({
  workoutId,
  saved,
  onSave,
  onUnsave,
  disabled = false,
  size = 26,
  style,
  accessibilityLabel,
  testID = 'e2e-workout-save-heart',
}: WorkoutLikeButtonProps) {
  const { colors } = useTheme();

  const handlePress = () => {
    if (!workoutId || disabled) return;
    haptics.select();
    if (saved) onUnsave();
    else onSave();
  };

  const canTap = !!workoutId && !disabled;

  return (
    <TouchableOpacity
      testID={testID}
      onPress={handlePress}
      disabled={!canTap}
      style={[styles.button, style]}
      accessibilityLabel={accessibilityLabel ?? (saved ? 'Unsave workout' : 'Save workout')}
      accessibilityRole="button"
    >
      <Ionicons
        name={saved ? 'heart' : 'heart-outline'}
        size={size}
        color={canTap ? (saved ? colors.primary : colors.textMuted) : colors.textMuted}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: spacing.sm,
  },
});
