import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Workout } from '../types/workout';
import { colors } from '../theme/colors';

interface DayCardProps {
  day: string;
  workout?: Workout;
  onPress: () => void;
}

export default function DayCard({ day, workout, onPress }: DayCardProps) {
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

const styles = StyleSheet.create({
  card: {
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
  header: {
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
