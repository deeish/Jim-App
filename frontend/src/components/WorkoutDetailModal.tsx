import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Workout } from '../types/workout';
import ExerciseCard from './ExerciseCard';
import Button from './Button';
import { generateWorkout } from '../services/workoutService';
import { colors } from '../theme/colors';

interface WorkoutDetailModalProps {
  visible: boolean;
  workout: Workout;
  onClose: () => void;
  onSwap: (toDay: string) => void;
  onRefresh: () => void;
}

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function WorkoutDetailModal({ visible, workout, onClose, onSwap, onRefresh }: WorkoutDetailModalProps) {
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handleRegenerate = async () => {
    try {
      setGenerating(true);
      const newWorkout = await generateWorkout(workout.day);
      Alert.alert('Success', 'Workout regenerated!');
      onRefresh();
      onClose();
    } catch (error) {
      console.error('Error regenerating workout:', error);
      Alert.alert('Error', 'Failed to regenerate workout');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        transparent={true}
        onRequestClose={onClose}
      >
        <View style={styles.overlay}>
          <View style={styles.container}>
            <View style={styles.header}>
              <Text style={styles.title}>{workout.name}</Text>
              {workout.day && (
                <Text style={styles.day}>{workout.day}</Text>
              )}
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.content}>
              <View style={styles.exercisesContainer}>
                {workout.exercises.map((exercise, index) => (
                  <ExerciseCard key={index} exercise={exercise} index={index} />
                ))}
              </View>
            </ScrollView>

            <View style={styles.footer}>
              <Button
                title="Regenerate with AI"
                onPress={handleRegenerate}
                loading={generating}
                variant="secondary"
                style={styles.footerButton}
              />
              <Button
                title="Swap Day"
                onPress={() => setShowSwapModal(true)}
                variant="secondary"
                style={styles.footerButton}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showSwapModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowSwapModal(false)}
      >
        <View style={styles.swapOverlay}>
          <View style={styles.swapContent}>
            <Text style={styles.swapTitle}>Swap with which day?</Text>
            <ScrollView style={styles.swapDaysList}>
              {daysOfWeek
                .filter(day => day !== workout.day)
                .map(day => (
                  <TouchableOpacity
                    key={day}
                    style={styles.swapDayItem}
                    onPress={() => {
                      onSwap(day);
                      setShowSwapModal(false);
                    }}
                  >
                    <Text style={styles.swapDayText}>{day}</Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>
            <Button
              title="Cancel"
              onPress={() => setShowSwapModal(false)}
              variant="secondary"
              style={styles.swapCancelButton}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    flex: 1,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    flex: 1,
  },
  day: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
    marginLeft: 12,
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    fontSize: 24,
    color: colors.textTertiary,
  },
  content: {
    flex: 1,
  },
  exercisesContainer: {
    padding: 12,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 12,
  },
  footerButton: {
    minHeight: 48,
  },
  swapOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swapContent: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 24,
    width: '80%',
    maxWidth: 400,
    maxHeight: '70%',
  },
  swapTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
  },
  swapDaysList: {
    maxHeight: 300,
    marginBottom: 16,
  },
  swapDayItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  swapDayText: {
    fontSize: 18,
    color: colors.text,
  },
  swapCancelButton: {
    minHeight: 48,
  },
});
