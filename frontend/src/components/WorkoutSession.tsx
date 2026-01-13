import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Workout } from '../types/workout';
import Button from './Button';
import { colors } from '../theme/colors';

interface WorkoutSessionState {
  workout: Workout;
  currentExerciseIndex: number;
  currentSetIndex: number;
  startTime: Date;
}

interface WorkoutSessionProps {
  session: WorkoutSessionState;
  onComplete: () => void;
  onUpdate: (session: WorkoutSessionState) => void;
}

export default function WorkoutSession({ session, onComplete, onUpdate }: WorkoutSessionProps) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [completedSets, setCompletedSets] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((new Date().getTime() - session.startTime.getTime()) / 1000);
      setElapsedTime(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [session.startTime]);

  const currentExercise = session.workout.exercises[session.currentExerciseIndex];
  const totalSets = currentExercise?.sets || 0;
  const currentSet = session.currentSetIndex + 1;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCompleteSet = () => {
    const exerciseKey = `${session.currentExerciseIndex}-${session.currentSetIndex}`;
    setCompletedSets(prev => ({ ...prev, [exerciseKey]: true }));

    // Move to next set
    if (session.currentSetIndex < currentExercise.sets - 1) {
      onUpdate({
        ...session,
        currentSetIndex: session.currentSetIndex + 1,
      });
    } else {
      // Move to next exercise
      if (session.currentExerciseIndex < session.workout.exercises.length - 1) {
        onUpdate({
          ...session,
          currentExerciseIndex: session.currentExerciseIndex + 1,
          currentSetIndex: 0,
        });
      } else {
        // Workout complete
        onComplete();
      }
    }
  };

  const handleSkipExercise = () => {
    if (session.currentExerciseIndex < session.workout.exercises.length - 1) {
      onUpdate({
        ...session,
        currentExerciseIndex: session.currentExerciseIndex + 1,
        currentSetIndex: 0,
      });
    } else {
      onComplete();
    }
  };

  if (!currentExercise) {
    return (
      <View style={styles.container}>
        <View style={styles.completeContainer}>
          <Text style={styles.completeTitle}>Workout Complete!</Text>
          <Text style={styles.completeTime}>Time: {formatTime(elapsedTime)}</Text>
          <Button title="Done" onPress={onComplete} style={styles.doneButton} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.timer}>{formatTime(elapsedTime)}</Text>
        <Text style={styles.workoutName}>{session.workout.name}</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.exerciseContainer}>
          <Text style={styles.exerciseName}>{currentExercise.name}</Text>
          <Text style={styles.setInfo}>
            Set {currentSet} of {totalSets}
          </Text>
          <Text style={styles.repsInfo}>
            {currentExercise.reps} reps
            {currentExercise.weight && ` × ${currentExercise.weight} lbs`}
          </Text>

          {currentExercise.notes && (
            <Text style={styles.notes}>{currentExercise.notes}</Text>
          )}

          <View style={styles.progressContainer}>
            <Text style={styles.progressText}>
              Exercise {session.currentExerciseIndex + 1} of {session.workout.exercises.length}
            </Text>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${((session.currentExerciseIndex + 1) / session.workout.exercises.length) * 100}%` },
                ]}
              />
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="Complete Set"
          onPress={handleCompleteSet}
          style={styles.completeButton}
        />
        <TouchableOpacity onPress={handleSkipExercise} style={styles.skipButton}>
          <Text style={styles.skipText}>Skip Exercise</Text>
        </TouchableOpacity>
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
    backgroundColor: colors.primary,
    padding: 20,
    alignItems: 'center',
  },
  timer: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  workoutName: {
    fontSize: 18,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  content: {
    flex: 1,
  },
  exerciseContainer: {
    backgroundColor: colors.surface,
    margin: 16,
    padding: 24,
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
  exerciseName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  setInfo: {
    fontSize: 20,
    color: colors.primary,
    fontWeight: '600',
    marginBottom: 8,
  },
  repsInfo: {
    fontSize: 18,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  notes: {
    fontSize: 14,
    color: colors.textTertiary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
  },
  progressContainer: {
    width: '100%',
    marginTop: 24,
  },
  progressText: {
    fontSize: 14,
    color: colors.textTertiary,
    marginBottom: 8,
    textAlign: 'center',
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  footer: {
    padding: 16,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  completeButton: {
    minHeight: 56,
    marginBottom: 12,
  },
  skipButton: {
    padding: 12,
    alignItems: 'center',
  },
  skipText: {
    color: colors.textTertiary,
    fontSize: 16,
  },
  completeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  completeTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
  },
  completeTime: {
    fontSize: 24,
    color: colors.primary,
    marginBottom: 32,
  },
  doneButton: {
    minWidth: 200,
  },
});
