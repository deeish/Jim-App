import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Workout } from '../types/workout';
import ExerciseCard from './ExerciseCard';
import Button from './Button';
import { generateWorkout } from '../services/workoutService';
import { useTheme } from '../theme/ThemeContext';

import { radius, spacing, text, weight } from '../theme';
interface WorkoutDetailModalProps {
  visible: boolean;
  workout: Workout;
  onClose: () => void;
  onSwap: (toDay: string) => void;
  onRefresh: () => void;
}

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function WorkoutDetailModal({ visible, workout, onClose, onSwap, onRefresh }: WorkoutDetailModalProps) {
  const { colors } = useTheme();
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [generating, setGenerating] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        overlay: {
          flex: 1,
          backgroundColor: colors.overlay,
          justifyContent: 'flex-end',
        },
        container: {
          backgroundColor: colors.surface,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          maxHeight: '90%',
          flex: 1,
        },
        header: {
          padding: spacing.xl,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        title: {
          fontSize: text.title,
          fontWeight: weight.bold,
          color: colors.text,
          flex: 1,
        },
        day: {
          fontSize: text.callout,
          color: colors.primary,
          fontWeight: weight.semibold,
          marginLeft: spacing.md,
        },
        closeButton: {
          padding: spacing.sm,
        },
        closeText: {
          fontSize: text.title,
          color: colors.textTertiary,
        },
        content: {
          flex: 1,
        },
        exercisesContainer: {
          padding: spacing.md,
        },
        footer: {
          padding: spacing.lg,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          gap: spacing.md,
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
          borderRadius: radius.md,
          padding: spacing.xxl,
          width: '80%',
          maxWidth: 400,
          maxHeight: '70%',
        },
        swapTitle: {
          fontSize: text.title,
          fontWeight: weight.bold,
          color: colors.text,
          marginBottom: spacing.lg,
        },
        swapDaysList: {
          maxHeight: 300,
          marginBottom: spacing.lg,
        },
        swapDayItem: {
          padding: spacing.lg,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        swapDayText: {
          fontSize: text.headline,
          color: colors.text,
        },
        swapCancelButton: {
          minHeight: 48,
        },
      }),
    [colors]
  );

  const doRegenerate = async () => {
    try {
      setGenerating(true);
      await generateWorkout(workout.day);
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

  const handleRegenerate = () => {
    Alert.alert(
      'Regenerate workout?',
      'Your current exercises will be replaced with a new AI-generated workout.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Regenerate', style: 'destructive', onPress: doRegenerate },
      ]
    );
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
