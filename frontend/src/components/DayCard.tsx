import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Workout } from '../types/workout';
import { useTheme } from '../theme/ThemeContext';

import { radius, spacing, text, weight } from '../theme';
interface DayCardProps {
  day: string;
  workout?: Workout;
  onPress: () => void;
}

export default function DayCard({ day, workout, onPress }: DayCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: colors.surface,
          margin: spacing.md,
          padding: spacing.lg,
          borderRadius: radius.md,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 3.84,
          elevation: 5,
        },
        header: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: spacing.sm,
        },
        dayName: { fontSize: text.title, fontWeight: weight.bold, color: colors.text },
        badge: {
          backgroundColor: colors.accent,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.xs,
          borderRadius: radius.md,
        },
        badgeText: { color: colors.background, fontSize: text.footnote, fontWeight: weight.semibold },
        workoutName: { fontSize: text.callout, color: colors.textSecondary, marginTop: spacing.xs },
        noWorkout: { fontSize: text.body, color: colors.textMuted, fontStyle: 'italic', marginTop: spacing.xs },
      }),
    [colors]
  );
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.header}>
        <Text style={styles.dayName}>{day}</Text>
        {workout && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{workout.exercises.length} exercises</Text>
          </View>
        )}
      </View>
      {workout ? (
        <Text style={styles.workoutName}>{workout.name}</Text>
      ) : (
        <Text style={styles.noWorkout}>No workout planned</Text>
      )}
    </TouchableOpacity>
  );
}
