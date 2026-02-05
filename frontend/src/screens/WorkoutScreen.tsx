import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { getWeeklyWorkouts, getWorkoutById, saveWorkoutLog } from '../services/workoutService';
import { Workout } from '../types/workout';
import Button from '../components/Button';
import ExerciseCard from '../components/ExerciseCard';
import LoadingSpinner from '../components/LoadingSpinner';
import WorkoutSession from '../components/WorkoutSession';
import { useTheme } from '../theme/ThemeContext';
import type { RootStackParamList } from '../types/navigation';
import { RootTabParamList } from '../components/NavBar';

interface WorkoutSessionState {
  workout: Workout;
  currentExerciseIndex: number;
  startTime: Date;
}

type WorkoutScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<RootTabParamList, 'Workout'>,
  NativeStackNavigationProp<RootStackParamList>
>;

type WorkoutScreenRouteProp = RouteProp<RootTabParamList, 'Workout'>;

export default function WorkoutScreen() {
  const navigation = useNavigation<WorkoutScreenNavigationProp>();
  const route = useRoute<WorkoutScreenRouteProp>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const workoutIdParam = route.params?.workoutId;
  const fromPlan = route.params?.fromPlan === true;
  const [todayWorkout, setTodayWorkout] = useState<Workout | null>(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<WorkoutSessionState | null>(null);
  const [savingLog, setSavingLog] = useState(false);

  const goBackToPlan = () => {
    const tabNav = (navigation as any)?.getParent?.();
    if (tabNav) tabNav.navigate('Plan');
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        backBar: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        },
        backButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingRight: 12 },
        backButtonText: { fontSize: 16, fontWeight: '600' },
        header: {
          backgroundColor: colors.surface,
          padding: 20,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        title: { fontSize: 28, fontWeight: 'bold', color: colors.text, marginBottom: 8 },
        workoutName: { fontSize: 18, color: colors.primary, fontWeight: '600', marginBottom: 8 },
        summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
        summaryText: { fontSize: 14, color: colors.textSecondary },
        summaryDot: { fontSize: 14, color: colors.textTertiary },
        content: { flex: 1 },
        exercisesContainer: { padding: 12 },
        emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
        emptyText: { fontSize: 20, color: colors.textTertiary, marginBottom: 8, fontWeight: '600' },
        emptySubtext: { fontSize: 16, color: colors.textMuted, textAlign: 'center' },
        footer: {
          padding: 16,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        startButton: { minHeight: 56 },
        addExercisesLink: { paddingVertical: 8, paddingHorizontal: 0, marginBottom: 8 },
        addExercisesLinkText: { fontSize: 15, fontWeight: '600' },
      }),
    [colors]
  );

  const handleAddExercises = () => {
    if (!todayWorkout?.id) return;
    const existingExerciseIds = (todayWorkout.exercises || [])
      .map(e => e.exerciseId)
      .filter((id): id is string => !!id);
    const tabNav = (navigation as any)?.getParent?.();
    if (tabNav) {
      tabNav.navigate('Search', {
        screen: 'SearchList',
        params: {
          addToWorkout: {
            workoutId: todayWorkout.id,
            workoutName: todayWorkout.name,
            existingExerciseIds,
          },
        },
      });
    }
  };

  useEffect(() => {
    if (workoutIdParam) {
      loadWorkoutById(workoutIdParam);
    } else {
      loadTodayWorkout();
    }
  }, [workoutIdParam]);

  const loadWorkoutById = async (id: string) => {
    try {
      setLoading(true);
      const workout = await getWorkoutById(id);
      setTodayWorkout(workout);
    } catch (error) {
      console.error('Error loading workout:', error);
      setTodayWorkout(null);
    } finally {
      setLoading(false);
    }
  };

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
      startTime: new Date(),
    });
  };

  const handleEndWorkout = async (sessionData?: any) => {
    if (sessionData) {
      setSavingLog(true);
      try {
        await saveWorkoutLog({
          workout: sessionData.workout,
          exercises: sessionData.exercises,
          startTime: sessionData.startTime,
          endTime: sessionData.endTime,
          totalTime: sessionData.totalTime,
          totalSets: sessionData.totalSets,
          totalVolume: sessionData.totalVolume,
          overallNotes: sessionData.overallNotes,
          exerciseNotes: sessionData.exerciseNotes,
        });
      } catch (err) {
        console.error('Failed to save workout log:', err);
        Alert.alert(
          'Save failed',
          'Your workout was completed but could not be saved to history. Check your connection and try again.',
          [{ text: 'OK' }]
        );
      } finally {
        setSavingLog(false);
      }
    }
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
        navigation={navigation as unknown as NativeStackNavigationProp<RootStackParamList>}
      />
    );
  }

  // Show workout with start button (today's or selected from Plan)
  const headerTitle = workoutIdParam ? (todayWorkout?.name ?? 'Workout') : "Today's Workout";
  return (
    <View style={styles.container}>
      {fromPlan && (
        <View style={[styles.backBar, { paddingTop: Math.max(insets.top, 10) }]}>
          <TouchableOpacity style={styles.backButton} onPress={goBackToPlan} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color={colors.primary} />
            <Text style={[styles.backButtonText, { color: colors.primary }]}>Back</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.header}>
        <Text style={styles.title}>{headerTitle}</Text>
        {todayWorkout && (
          <>
            <Text style={styles.workoutName}>{todayWorkout.name}</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryText}>
                {todayWorkout.exercises.length} exercises
              </Text>
              <Text style={styles.summaryDot}>•</Text>
              <Text style={styles.summaryText}>
                ~{todayWorkout.estimatedDuration || Math.ceil(todayWorkout.exercises.length * 3)} min
              </Text>
              {todayWorkout.focus && (
                <>
                  <Text style={styles.summaryDot}>•</Text>
                  <Text style={styles.summaryText}>{todayWorkout.focus}</Text>
                </>
              )}
            </View>
          </>
        )}
      </View>

      {todayWorkout ? (
        <ScrollView style={styles.content}>
          <View style={styles.exercisesContainer}>
            <TouchableOpacity style={styles.addExercisesLink} onPress={handleAddExercises}>
              <Text style={[styles.addExercisesLinkText, { color: colors.primary }]}>
                + Add exercises from library
              </Text>
            </TouchableOpacity>
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
