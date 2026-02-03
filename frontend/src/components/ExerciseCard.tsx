import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Exercise } from '../types/workout';
import { useTheme } from '../theme/ThemeContext';

interface ExerciseCardProps {
  exercise: Exercise;
  index: number;
}

export default function ExerciseCard({ exercise, index }: ExerciseCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: colors.surface,
          padding: 16,
          borderRadius: 12,
          marginBottom: 12,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.3,
          shadowRadius: 3.84,
          elevation: 5,
        },
        exerciseName: { fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 4 },
        prescription: { fontSize: 14, color: colors.textSecondary, marginBottom: 8 },
        notes: { fontSize: 14, color: colors.textTertiary, fontStyle: 'italic', marginTop: 8 },
      }),
    [colors]
  );
  const formatPrescription = () => {
    const setsReps = `${exercise.sets}×${exercise.reps}`;
    if (exercise.reps === 1 && exercise.weight === 0) return `${exercise.sets}×${exercise.reps}s`;
    if (exercise.weight === 0 || !exercise.weight) return `${setsReps} (BW)`;
    return `${setsReps} @ ${exercise.weight}`;
  };
  return (
    <View style={styles.card}>
      <Text style={styles.exerciseName}>{exercise.name}</Text>
      <Text style={styles.prescription}>{formatPrescription()}</Text>
      {exercise.notes && <Text style={styles.notes}>{exercise.notes}</Text>}
    </View>
  );
}
