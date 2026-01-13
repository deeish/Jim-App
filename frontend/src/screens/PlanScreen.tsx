import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Modal, TouchableOpacity } from 'react-native';
import { getWeeklyWorkouts, generateWorkout, updateWorkout } from '../services/workoutService';
import { Workout } from '../types/workout';
import DayCard from '../components/DayCard';
import Button from '../components/Button';
import LoadingSpinner from '../components/LoadingSpinner';
import WorkoutDetailModal from '../components/WorkoutDetailModal';
import { colors } from '../theme/colors';

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function PlanScreen() {
  const [workouts, setWorkouts] = useState<Record<string, Workout>>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);

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
    } finally {
      setLoading(false);
    }
  };

  const handleDayPress = (day: string) => {
    const workout = workouts[day];
    if (workout) {
      setSelectedWorkout(workout);
      setShowDetailModal(true);
    } else {
      setSelectedDay(day);
      setShowGenerateModal(true);
    }
  };

  const handleGenerateForDay = async (day: string) => {
    try {
      setGenerating(true);
      const newWorkout = await generateWorkout(day);
      setWorkouts(prev => ({ ...prev, [day]: newWorkout }));
      setShowGenerateModal(false);
      setSelectedDay(null);
      Alert.alert('Success', `Workout generated for ${day}!`);
    } catch (error) {
      console.error('Error generating workout:', error);
      Alert.alert('Error', 'Failed to generate workout');
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateAll = async () => {
    try {
      setGenerating(true);
      const promises = daysOfWeek.map(day => generateWorkout(day));
      const newWorkouts = await Promise.all(promises);
      const workoutsMap: Record<string, Workout> = {};
      newWorkouts.forEach(workout => {
        if (workout.day) {
          workoutsMap[workout.day] = workout;
        }
      });
      setWorkouts(workoutsMap);
      Alert.alert('Success', 'Weekly workout plan generated!');
    } catch (error) {
      console.error('Error generating workouts:', error);
      Alert.alert('Error', 'Failed to generate workouts');
    } finally {
      setGenerating(false);
    }
  };

  const handleSwapDays = async (fromDay: string, toDay: string) => {
    const fromWorkout = workouts[fromDay];
    const toWorkout = workouts[toDay];

    try {
      if (fromWorkout && toWorkout) {
        // Swap both
        await updateWorkout(fromWorkout.id, { day: toDay });
        await updateWorkout(toWorkout.id, { day: fromDay });
      } else if (fromWorkout) {
        // Move workout to empty day
        await updateWorkout(fromWorkout.id, { day: toDay });
      } else if (toWorkout) {
        // Move workout to empty day
        await updateWorkout(toWorkout.id, { day: fromDay });
      }

      // Update local state
      const newWorkouts = { ...workouts };
      if (fromWorkout) {
        delete newWorkouts[fromDay];
        newWorkouts[toDay] = { ...fromWorkout, day: toDay };
      }
      if (toWorkout) {
        delete newWorkouts[toDay];
        newWorkouts[fromDay] = { ...toWorkout, day: fromDay };
      }
      setWorkouts(newWorkouts);
      Alert.alert('Success', 'Days swapped successfully!');
    } catch (error) {
      console.error('Error swapping days:', error);
      Alert.alert('Error', 'Failed to swap days');
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Weekly Plan</Text>
        <Button
          title="Generate with AI"
          onPress={handleGenerateAll}
          loading={generating}
          style={styles.generateButton}
        />
      </View>

      <ScrollView style={styles.content}>
        {daysOfWeek.map((day) => (
          <DayCard
            key={day}
            day={day}
            workout={workouts[day]}
            onPress={() => handleDayPress(day)}
          />
        ))}
      </ScrollView>

      <Modal
        visible={showGenerateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowGenerateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Generate Workout</Text>
            <Text style={styles.modalText}>
              Generate a workout for {selectedDay}?
            </Text>
            <View style={styles.modalButtons}>
              <Button
                title="Generate"
                onPress={() => selectedDay && handleGenerateForDay(selectedDay)}
                loading={generating}
                style={styles.modalButton}
              />
              <Button
                title="Cancel"
                onPress={() => {
                  setShowGenerateModal(false);
                  setSelectedDay(null);
                }}
                variant="secondary"
                style={styles.modalButton}
              />
            </View>
          </View>
        </View>
      </Modal>

      {selectedWorkout && (
        <WorkoutDetailModal
          visible={showDetailModal}
          workout={selectedWorkout}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedWorkout(null);
          }}
          onSwap={(toDay) => {
            if (selectedWorkout.day) {
              handleSwapDays(selectedWorkout.day, toDay);
              setShowDetailModal(false);
              setSelectedWorkout(null);
            }
          }}
          onRefresh={loadWorkouts}
        />
      )}
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
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  generateButton: {
    minHeight: 48,
  },
  content: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 24,
    width: '80%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  modalText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 24,
  },
  modalButtons: {
    gap: 12,
  },
  modalButton: {
    minHeight: 48,
  },
});
