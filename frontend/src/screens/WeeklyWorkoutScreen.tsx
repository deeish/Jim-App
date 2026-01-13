import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { getWeeklyWorkouts } from '../services/workoutService';
import { Workout } from '../types/workout';
import { colors } from '../theme/colors';

type WeeklyWorkoutScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'WeeklyWorkout'>;

type Props = {
  navigation: WeeklyWorkoutScreenNavigationProp;
};

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function WeeklyWorkoutScreen({ navigation }: Props) {
  const [workouts, setWorkouts] = useState<Record<string, Workout>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWorkouts();
  }, []);

  const loadWorkouts = async () => {
    try {
      setLoading(true);
      const weeklyWorkouts = await getWeeklyWorkouts();
      const workoutsMap: Record<string, Workout> = {};
      weeklyWorkouts.forEach(workout => {
        if (workout.day) {
          workoutsMap[workout.day] = workout;
        }
      });
      setWorkouts(workoutsMap);
    } catch (error: any) {
      console.error('Error loading workouts:', error);
      // Silently fail - app will show empty state
      // Backend might not be running yet
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {daysOfWeek.map((day) => {
        const workout = workouts[day];
        return (
          <TouchableOpacity
            key={day}
            style={styles.dayCard}
            onPress={() => navigation.navigate('WorkoutDetail', { workoutId: workout?.id })}
          >
            <View style={styles.dayHeader}>
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
      })}
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
  dayCard: {
    backgroundColor: colors.surface,
    margin: 12,
    padding: 16,
    borderRadius: 12,
    shadowColor: colors.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 3.84,
    elevation: 5,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dayName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  badge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: colors.background,
    fontSize: 12,
    fontWeight: '600',
  },
  workoutName: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 4,
  },
  noWorkout: {
    fontSize: 14,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: 4,
  },
});
