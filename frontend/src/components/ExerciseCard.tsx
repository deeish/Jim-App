import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Exercise } from '../types/workout';
import { colors } from '../theme/colors';

interface ExerciseCardProps {
  exercise: Exercise;
  index: number;
}

export default function ExerciseCard({ exercise, index }: ExerciseCardProps) {
  // Format prescription consistently
  const formatPrescription = () => {
    const setsReps = `${exercise.sets}×${exercise.reps}`;
    
    // Check if it's a time-based exercise (isometric/hold)
    if (exercise.reps === 1 && exercise.weight === 0) {
      // Assume it's a time-based exercise like Plank
      return `${exercise.sets}×${exercise.reps}s`; // or could be 3×60s if we had duration data
    }
    
    // Bodyweight exercise
    if (exercise.weight === 0 || !exercise.weight) {
      return `${setsReps} (BW)`;
    }
    
    // Weighted exercise
    return `${setsReps} @ ${exercise.weight}`;
  };

  return (
    <View style={styles.card}>
      <Text style={styles.exerciseName}>{exercise.name}</Text>
      <Text style={styles.prescription}>{formatPrescription()}</Text>
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
    marginBottom: 4,
  },
  prescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  notes: {
    fontSize: 14,
    color: colors.textTertiary,
    fontStyle: 'italic',
    marginTop: 8,
  },
});
