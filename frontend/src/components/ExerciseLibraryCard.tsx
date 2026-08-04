import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Exercise } from '../services/exerciseService';
import { useTheme } from '../theme/ThemeContext';

import { elevation, leading, radius, spacing, text, weight } from '../theme';
interface ExerciseLibraryCardProps {
  exercise: Exercise;
  onPress?: () => void;
}

export default function ExerciseLibraryCard({ exercise, onPress }: ExerciseLibraryCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: colors.surface,
          padding: spacing.lg,
          borderRadius: radius.md,
          marginBottom: spacing.md,
          marginHorizontal: spacing.lg,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: colors.shadow,
          ...elevation.level1,
        },
        header: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: spacing.sm,
        },
        exerciseName: {
          fontSize: text.headline,
          fontWeight: weight.semibold,
          color: colors.text,
          flex: 1,
          marginRight: spacing.sm,
        },
        difficultyBadge: {
          backgroundColor: colors.primary + '20',
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xs,
          borderRadius: radius.sm,
        },
        difficultyText: {
          fontSize: text.caption,
          fontWeight: weight.semibold,
          color: colors.primary,
          textTransform: 'capitalize',
        },
        description: {
          fontSize: text.body,
          color: colors.textMuted,
          marginBottom: spacing.md,
          lineHeight: leading.body,
        },
        tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
        tag: {
          backgroundColor: colors.primary + '15',
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.primary + '30',
        },
        equipmentTag: { backgroundColor: colors.background, borderColor: colors.border },
        movementTag: { backgroundColor: colors.background, borderColor: colors.border },
        tagText: { fontSize: text.footnote, fontWeight: weight.medium, color: colors.textSecondary },
        moreEquipment: { fontSize: text.footnote, color: colors.textMuted, marginTop: spacing.sm, fontStyle: 'italic' },
        footer: {
          marginTop: spacing.md,
          paddingTop: spacing.md,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          alignItems: 'flex-end',
        },
        tapHint: { fontSize: text.footnote, color: colors.primary, fontWeight: weight.medium },
      }),
    [colors]
  );
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <Text style={styles.exerciseName}>{exercise.name}</Text>
        {exercise.difficulty && (
          <View style={styles.difficultyBadge}>
            <Text style={styles.difficultyText}>{exercise.difficulty}</Text>
          </View>
        )}
      </View>

      {exercise.description && (
        <Text style={styles.description} numberOfLines={2}>
          {exercise.description}
        </Text>
      )}

      <View style={styles.tagsContainer}>
        <View style={styles.tag}>
          <Text style={styles.tagText}>{exercise.primaryMuscleGroup}</Text>
        </View>
        {exercise.subMuscles.length > 0 && (
          <View style={styles.tag}>
            <Text style={styles.tagText}>{exercise.subMuscles[0]}</Text>
          </View>
        )}
        {exercise.equipment.length > 0 && (
          <View style={[styles.tag, styles.equipmentTag]}>
            <Text style={styles.tagText}>{exercise.equipment[0]}</Text>
          </View>
        )}
        {exercise.movementPatterns.length > 0 && (
          <View style={[styles.tag, styles.movementTag]}>
            <Text style={styles.tagText}>{exercise.movementPatterns[0]}</Text>
          </View>
        )}
      </View>

      {exercise.equipment.length > 1 && (
        <Text style={styles.moreEquipment}>
          +{exercise.equipment.length - 1} more equipment
        </Text>
      )}

      <View style={styles.footer}>
        <Text style={styles.tapHint}>Tap for more information →</Text>
      </View>
    </TouchableOpacity>
  );
}
