import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Exercise } from '../types/workout';
import { colors } from '../theme/colors';

interface ExerciseCardProps {
  exercise: Exercise;
  index: number;
}

export default function ExerciseCard({ exercise, index }: ExerciseCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.exerciseName}>{exercise.name}</Text>
      <View style={styles.details}>
        <Text style={styles.detail}>Sets: {exercise.sets}</Text>
        <Text style={styles.detail}>Reps: {exercise.reps}</Text>
        {exercise.weight && (
          <Text style={styles.detail}>Weight: {exercise.weight} lbs</Text>
        )}
      </View>
      {exercise.notes && (
        <Text style={styles.notes}>{exercise.notes}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: colors.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 3.84,
    elevation: 5,
  },
  exerciseName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  details: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  detail: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  notes: {
    fontSize: 14,
    color: colors.textTertiary,
    fontStyle: 'italic',
    marginTop: 8,
  },
});
