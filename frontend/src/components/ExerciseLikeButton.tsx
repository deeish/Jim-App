import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

export interface ExerciseLikeButtonProps {
  exerciseId: string;
  saved: boolean;
  onSave: () => void | Promise<void>;
  onUnsave: () => void | Promise<void>;
  disabled?: boolean;
  size?: number;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

/**
 * Heart button to like/save an exercise (library exercise from Find Workouts).
 * Use on exercise list cards and on the exercise detail screen.
 */
export default function ExerciseLikeButton({
  exerciseId,
  saved,
  onSave,
  onUnsave,
  disabled = false,
  size = 24,
  style,
  accessibilityLabel,
}: ExerciseLikeButtonProps) {
  const { colors } = useTheme();

  const handlePress = (e?: any) => {
    e?.stopPropagation?.();
    if (disabled) return;
    if (__DEV__) console.log('[ExerciseLikeButton] press', exerciseId, 'saved:', saved);
    if (saved) onUnsave();
    else onSave();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled}
      style={[styles.button, style]}
      accessibilityLabel={accessibilityLabel ?? (saved ? 'Unsave exercise' : 'Save exercise')}
      accessibilityRole="button"
    >
      <Ionicons
        name={saved ? 'heart' : 'heart-outline'}
        size={size}
        color={saved ? colors.primary : colors.textMuted}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 8,
  },
});
