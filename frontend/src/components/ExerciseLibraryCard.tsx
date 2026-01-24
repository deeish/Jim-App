import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Exercise } from '../services/exerciseService';
import { colors } from '../theme/colors';

interface ExerciseLibraryCardProps {
  exercise: Exercise;
  onPress?: () => void;
}

export default function ExerciseLibraryCard({ exercise, onPress }: ExerciseLibraryCardProps) {
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  exerciseName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    marginRight: 8,
  },
  difficultyBadge: {
    backgroundColor: colors.primary + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  difficultyText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
    textTransform: 'capitalize',
  },
  description: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 12,
    lineHeight: 20,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  equipmentTag: {
    backgroundColor: colors.background,
    borderColor: colors.border,
  },
  movementTag: {
    backgroundColor: colors.background,
    borderColor: colors.border,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  moreEquipment: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 8,
    fontStyle: 'italic',
  },
  footer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'flex-end',
  },
  tapHint: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '500',
  },
});
