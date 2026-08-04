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
import { resolveWorkoutEtaMinutes } from '../lib/estimateWorkoutMinutes';
import { getSavedWorkouts, unsaveWorkout } from '../services/workoutService';
import { getCurrentPlan, planSlotForWorkout } from '../services/planService';
import type { ApiPlan } from '../services/planService';
import type { Workout } from '../types/workout';

import { radius, spacing, text, weight } from '../theme';
import { SkeletonList } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
type NavProp = NativeStackNavigationProp<RootStackParamList, 'WorkoutDetail'>;

function savedWorkoutDurationLabel(w: Workout, plan: ApiPlan | null): string | null {
  const slot = planSlotForWorkout(plan, w.planWorkoutId);
  const m = resolveWorkoutEtaMinutes(w, slot ?? null);
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
  const [planSnap, setPlanSnap] = useState<ApiPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unsavingId, setUnsavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, plan] = await Promise.all([
        getSavedWorkouts(),
        getCurrentPlan().catch(() => null),
      ]);
      setWorkouts(list);
      setPlanSnap(plan);
    } catch {
      setWorkouts([]);
      setPlanSnap(null);
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
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        },
        backBtn: { padding: spacing.sm, marginRight: spacing.sm },
        headerTitle: { fontSize: text.headline, fontWeight: weight.bold, color: colors.text },
        loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
        list: { padding: spacing.lg },
        card: {
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          padding: spacing.lg,
          marginBottom: spacing.md,
          borderWidth: 1,
          borderColor: colors.border,
        },
        cardTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
        cardTitle: { flex: 1, fontSize: text.headline, fontWeight: weight.semibold, color: colors.text },
        cardUnsaveBtn: { padding: spacing.xs, marginLeft: spacing.sm },
        cardMeta: { fontSize: text.body, color: colors.textSecondary },
        cardExercises: { fontSize: text.body, color: colors.textTertiary, marginTop: spacing.sm },
      }),
    [colors]
  );

  const handleUnsave = useCallback(async (id: string) => {
    if (unsavingId) return;
    setUnsavingId(id);
    try {
      await unsaveWorkout(id);
      setWorkouts((prev) => prev.filter((w) => w.id !== id));
    } catch {
      // ignore — workout stays in list
    } finally {
      setUnsavingId(null);
    }
  }, [unsavingId]);

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
        <SkeletonList count={4} style={styles.list} />
      ) : workouts.length === 0 ? (
        <EmptyState
          icon="heart-outline"
          title="No saved workouts yet"
          body="Tap the heart on any workout to keep it here."
        />
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
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
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle} numberOfLines={2}>{w.name}</Text>
                <TouchableOpacity
                  style={styles.cardUnsaveBtn}
                  onPress={() => handleUnsave(w.id)}
                  hitSlop={8}
                  accessibilityLabel={`Remove ${w.name} from saved`}
                  accessibilityRole="button"
                >
                  {unsavingId === w.id ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="heart" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              </View>
              {(w.day || savedWorkoutDurationLabel(w, planSnap)) && (
                <Text style={styles.cardMeta}>
                  {[w.day, savedWorkoutDurationLabel(w, planSnap)].filter(Boolean).join(' • ')}
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
