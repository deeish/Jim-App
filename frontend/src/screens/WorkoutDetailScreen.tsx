import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { getWorkoutById, generateWorkout } from '../services/workoutService';
import { Workout } from '../types/workout';
import { colors } from '../theme/colors';

type WorkoutDetailScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'WorkoutDetail'>;
type WorkoutDetailScreenRouteProp = RouteProp<RootStackParamList, 'WorkoutDetail'>;

type Props = {
  navigation: WorkoutDetailScreenNavigationProp;
  route: WorkoutDetailScreenRouteProp;
};

export default function WorkoutDetailScreen({ navigation, route }: Props) {
  const { workoutId } = route.params || {};
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (workoutId) {
      loadWorkout();
    }
  }, [workoutId]);

  const loadWorkout = async () => {
    if (!workoutId) return;
    try {
      setLoading(true);
      const data = await getWorkoutById(workoutId);
      setWorkout(data);
    } catch (error) {
      console.error('Error loading workout:', error);
      Alert.alert('Error', 'Failed to load workout');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateWorkout = async () => {
    try {
      setGenerating(true);
      const newWorkout = await generateWorkout();
      setWorkout(newWorkout);
      Alert.alert('Success', 'Workout generated successfully!');
    } catch (error) {
      console.error('Error generating workout:', error);
      Alert.alert('Error', 'Failed to generate workout');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!workout) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No workout selected</Text>
          <TouchableOpacity
            style={styles.generateButton}
            onPress={handleGenerateWorkout}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={styles.generateButtonText}>Generate New Workout</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.workoutName}>{workout.name}</Text>
        {workout.day && (
          <Text style={styles.workoutDay}>{workout.day}</Text>
        )}
      </View>

      <View style={styles.exercisesContainer}>
        <Text style={styles.sectionTitle}>Exercises</Text>
        {workout.exercises.map((exercise, index) => (
          <View key={index} style={styles.exerciseCard}>
            <Text style={styles.exerciseName}>{exercise.name}</Text>
            <View style={styles.exerciseDetails}>
              <Text style={styles.exerciseDetail}>
                Sets: {exercise.sets}
              </Text>
              <Text style={styles.exerciseDetail}>
                Reps: {exercise.reps}
              </Text>
              {exercise.weight && (
                <Text style={styles.exerciseDetail}>
                  Weight: {exercise.weight} lbs
                </Text>
              )}
            </View>
            {exercise.notes && (
              <Text style={styles.exerciseNotes}>{exercise.notes}</Text>
            )}
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={styles.generateButton}
        onPress={handleGenerateWorkout}
        disabled={generating}
      >
        {generating ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.generateButtonText}>Generate New Workout</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 18,
    color: colors.textTertiary,
    marginBottom: 20,
  },
  header: {
    backgroundColor: colors.surface,
    padding: 20,
    marginBottom: 12,
  },
  workoutName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  workoutDay: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
  exercisesContainer: {
    padding: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  exerciseCard: {
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
  exerciseDetails: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  exerciseDetail: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  exerciseNotes: {
    fontSize: 14,
    color: colors.textTertiary,
    fontStyle: 'italic',
    marginTop: 8,
  },
  generateButton: {
    backgroundColor: colors.primary,
    padding: 18,
    margin: 12,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: colors.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 3.84,
    elevation: 5,
  },
  generateButtonText: {
    color: colors.background,
    fontSize: 18,
    fontWeight: '600',
  },
});
