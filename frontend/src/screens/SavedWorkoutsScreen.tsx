import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackParamList } from '../types/navigation';
import { useTheme } from '../theme/ThemeContext';
import { getWorkoutDisplayEstimateMinutes } from '../lib/estimateWorkoutMinutes';
import { getSavedWorkouts } from '../services/workoutService';
import type { Workout } from '../types/workout';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'WorkoutDetail'>;

function savedWorkoutDurationLabel(w: Workout): string | null {
  const m = getWorkoutDisplayEstimateMinutes(w.exercises, w.estimatedDuration ?? null);
  return m != null ? `${m} min` : null;
}

export type SavedWorkoutsScreenProps = {
  /** When provided, back button and outside-tap close the modal by calling this instead of navigation. */
  onClose?: () => void;
  /** When provided (e.g. in modal), tapping a workout calls this with id then caller can close and navigate. */
  onSelectWorkout?: (workoutId: string) => void;
};

export default function SavedWorkoutsScreen({ onClose, onSelectWorkout }: SavedWorkoutsScreenProps = {}) {
  const navigation = useNavigation<NavProp>();
  const { colors } = useTheme();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await getSavedWorkouts();
      setWorkouts(list);
    } catch {
      setWorkouts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        },
        backBtn: { padding: 8, marginRight: 8 },
        headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
        loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
        list: { padding: 16 },
        empty: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        },
        emptyText: { fontSize: 16, color: colors.textSecondary, textAlign: 'center' },
        card: {
          backgroundColor: colors.surface,
          borderRadius: 12,
          padding: 16,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: colors.border,
        },
        cardTitle: { fontSize: 17, fontWeight: '600', color: colors.text, marginBottom: 4 },
        cardMeta: { fontSize: 13, color: colors.textSecondary },
        cardExercises: { fontSize: 13, color: colors.textTertiary, marginTop: 6 },
      }),
    [colors]
  );

  const handleBack = useCallback(() => {
    if (onClose) onClose();
    else navigation.goBack();
  }, [onClose, navigation]);

  const handleSelectWorkout = useCallback(
    (workoutId: string) => {
      if (onSelectWorkout) {
        onSelectWorkout(workoutId);
      } else {
        navigation.navigate('WorkoutDetail', { workoutId });
      }
    },
    [onSelectWorkout, navigation]
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Saved workouts</Text>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : workouts.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="heart-outline" size={48} color={colors.textMuted} style={{ marginBottom: 12 }} />
          <Text style={styles.emptyText}>
            Workouts you like will appear here. Tap the heart on any workout to save it.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
        >
          {workouts.map((w) => (
            <TouchableOpacity
              key={w.id}
              style={styles.card}
              activeOpacity={0.7}
              onPress={() => handleSelectWorkout(w.id)}
            >
              <Text style={styles.cardTitle}>{w.name}</Text>
              {(w.day || savedWorkoutDurationLabel(w)) && (
                <Text style={styles.cardMeta}>
                  {[w.day, savedWorkoutDurationLabel(w)].filter(Boolean).join(' • ')}
                </Text>
              )}
              {w.exercises?.length > 0 && (
                <Text style={styles.cardExercises} numberOfLines={2}>
                  {w.exercises.slice(0, 3).map((e) => e.name).join(' · ')}
                  {w.exercises.length > 3 ? ' …' : ''}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
