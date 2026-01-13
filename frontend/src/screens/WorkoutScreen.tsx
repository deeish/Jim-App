import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { getWeeklyWorkouts } from '../services/workoutService';
import { Workout } from '../types/workout';
import Button from '../components/Button';
import ExerciseCard from '../components/ExerciseCard';
import LoadingSpinner from '../components/LoadingSpinner';
import WorkoutSession from '../components/WorkoutSession';
import { colors } from '../theme/colors';

interface WorkoutSessionState {
  workout: Workout;
  currentExerciseIndex: number;
  currentSetIndex: number;
  startTime: Date;
}

export default function WorkoutScreen() {
  const [todayWorkout, setTodayWorkout] = useState<Workout | null>(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<WorkoutSessionState | null>(null);

  useEffect(() => {
    loadTodayWorkout();
  }, []);

  const loadTodayWorkout = async () => {
    try {
      setLoading(true);
      const weeklyWorkouts = await getWeeklyWorkouts();
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
      const workout = weeklyWorkouts.find(w => w.day === today);
      setTodayWorkout(workout || null);
    } catch (error) {
      console.error('Error loading today\'s workout:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartWorkout = () => {
    if (!todayWorkout) {
      Alert.alert('No Workout', 'No workout planned for today. Go to Plan tab to generate one.');
      return;
    }

    setSession({
      workout: todayWorkout,
      currentExerciseIndex: 0,
      currentSetIndex: 0,
      startTime: new Date(),
    });
  };

  const handleEndWorkout = () => {
    setSession(null);
    loadTodayWorkout(); // Refresh in case workout was updated
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  // Show live workout session if in progress
  if (session) {
    return (
      <WorkoutSession
        session={session}
        onComplete={handleEndWorkout}
        onUpdate={setSession}
      />
    );
  }

  // Show today's workout with start button
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Today's Workout</Text>
        {todayWorkout && (
          <Text style={styles.workoutName}>{todayWorkout.name}</Text>
        )}
      </View>

      {todayWorkout ? (
        <ScrollView style={styles.content}>
          <View style={styles.exercisesContainer}>
            {todayWorkout.exercises.map((exercise, index) => (
              <ExerciseCard key={index} exercise={exercise} index={index} />
            ))}
          </View>
        </ScrollView>
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No workout planned for today</Text>
          <Text style={styles.emptySubtext}>Go to Plan tab to generate a workout</Text>
        </View>
      )}

      <View style={styles.footer}>
        <Button
          title={todayWorkout ? "Start Workout" : "No Workout Available"}
          onPress={handleStartWorkout}
          disabled={!todayWorkout}
          style={styles.startButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.surface,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  workoutName: {
    fontSize: 18,
    color: colors.primary,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  exercisesContainer: {
    padding: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 20,
    color: colors.textTertiary,
    marginBottom: 8,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
  },
  footer: {
    padding: 16,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  startButton: {
    minHeight: 56,
  },
});
