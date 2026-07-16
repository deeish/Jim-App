import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../types/navigation';
import {
  getWorkoutById,
  generateWorkout,
  regenerateWorkoutInPlace,
  updateWorkout,
  saveWorkout,
  unsaveWorkout,
} from '../services/workoutService';
import { getCurrentPlan, planSlotForWorkout } from '../services/planService';
import type { ApiPlan } from '../services/planService';
import WorkoutLikeButton from '../components/WorkoutLikeButton';
import ShareModal from '../components/ShareModal';
import { Workout } from '../types/workout';
import { useTheme } from '../theme/ThemeContext';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import { isLinkableLibraryExerciseId, navigateFromWorkoutDetailToExerciseDetail } from '../lib/exerciseNavigation';
import { resolveWorkoutEtaMinutes } from '../lib/estimateWorkoutMinutes';
import {
  formatExercisePrescriptionBulleted,
  profileGoalToPlanGoal,
} from '../lib/workoutExerciseDisplay';

type WorkoutDetailScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'WorkoutDetail'>;
type WorkoutDetailScreenRouteProp = RouteProp<RootStackParamList, 'WorkoutDetail'>;

type Props = {
  navigation: WorkoutDetailScreenNavigationProp;
  route: WorkoutDetailScreenRouteProp;
};

export default function WorkoutDetailScreen({ navigation, route }: Props) {
  const { workoutId } = route.params || {};
  const { colors } = useTheme();
  const { weightUnit, goal } = useUserPreferences();
  const insets = useSafeAreaInsets();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saved, setSaved] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  /** Collapsed by default — exercises stay “above the fold”; expand when you want the long AI copy. */
  const [guideExpanded, setGuideExpanded] = useState(false);
  /** Current plan snapshot to resolve slot duration when this workout is tied to Plan. */
  const [slotLookupPlan, setSlotLookupPlan] = useState<ApiPlan | null>(null);

  const detailEtaSlot = useMemo(
    () => planSlotForWorkout(slotLookupPlan, workout?.planWorkoutId ?? null),
    [slotLookupPlan, workout?.planWorkoutId],
  );

  const planGoal = useMemo(() => profileGoalToPlanGoal(goal), [goal]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
        emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
        emptyText: { fontSize: 18, color: colors.textTertiary, marginBottom: 20 },
        header: {
          backgroundColor: colors.surface,
          paddingHorizontal: 22,
          paddingTop: 18,
          paddingBottom: 20,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        workoutName: { fontSize: 26, fontWeight: '700', color: colors.text, marginBottom: 6, letterSpacing: -0.3 },
        workoutDay: { fontSize: 15, color: colors.primary, fontWeight: '600', textTransform: 'capitalize' },
        workoutEst: {
          fontSize: 14,
          color: colors.textSecondary,
          fontWeight: '600',
          marginTop: 6,
        },
        exercisesContainer: { paddingHorizontal: 16, paddingTop: 20 },
        guideDisclosure: {
          marginHorizontal: 16,
          marginTop: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          overflow: 'hidden',
        },
        guideDisclosureHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 12,
          paddingHorizontal: 14,
          gap: 10,
        },
        guideDisclosureTextCol: { flex: 1, minWidth: 0 },
        guideDisclosureTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
        guideDisclosureHint: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
        guideDisclosureBody: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 0 },
        guideBlock: { marginBottom: 14 },
        guideBlockLast: { marginBottom: 0 },
        guideLabel: {
          fontSize: 13,
          fontWeight: '700',
          color: colors.primary,
          marginBottom: 6,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
        },
        guideText: { fontSize: 14, color: colors.textSecondary, lineHeight: 21 },
        sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 10 },
        sectionAccent: { width: 3, height: 16, borderRadius: 2, backgroundColor: colors.primary },
        sectionTitle: { fontSize: 11, fontWeight: '700', color: colors.primary, letterSpacing: 1.2, textTransform: 'uppercase' },
        sectionSubtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: 16, lineHeight: 20 },
        actionsBlock: { gap: 12, marginBottom: 20 },
        exerciseCard: {
          backgroundColor: colors.surface,
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderRadius: 14,
          marginBottom: 10,
          borderWidth: 1,
          borderColor: colors.border,
        },
        exerciseCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
        exerciseIndex: {
          width: 28,
          height: 28,
          borderRadius: 8,
          backgroundColor: colors.background,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        },
        exerciseIndexText: { fontSize: 13, fontWeight: '700', color: colors.primary },
        exerciseNameCol: { flex: 1, minWidth: 0 },
        exerciseCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
        exerciseTitleWrap: { flex: 1, minWidth: 0 },
        exerciseRemoveHit: { padding: 8, marginLeft: 4, marginTop: -4 },
        exerciseName: { fontSize: 17, fontWeight: '600', color: colors.text, lineHeight: 22 },
        exerciseMetaLine: { fontSize: 14, color: colors.textSecondary, marginTop: 8, lineHeight: 20 },
        primaryCta: {
          backgroundColor: colors.primary,
          paddingVertical: 16,
          paddingHorizontal: 16,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 52,
        },
        primaryCtaText: { color: colors.background, fontSize: 17, fontWeight: '700' },
        outlineCta: {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: colors.primary,
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 48,
        },
        outlineCtaText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
        tertiaryBlock: { marginTop: 12, paddingBottom: 8 },
        tertiaryCta: {
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderRadius: 12,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
        tertiaryCtaText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
        tertiaryHint: {
          fontSize: 12,
          color: colors.textMuted,
          textAlign: 'center',
          marginTop: 8,
          lineHeight: 17,
          paddingHorizontal: 4,
        },
        backBar: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 8,
          paddingBottom: 10,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        },
        backButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 12 },
        backButtonText: { fontSize: 16, fontWeight: '600', color: colors.primary },
        backBarActions: { flexDirection: 'row', alignItems: 'center' },
        shareButton: { padding: 10 },
        saveButton: { padding: 10, marginRight: 4 },
      }),
    [colors]
  );

  const handleAddExercises = () => {
    if (!workout?.id) return;
    const existingExerciseIds = (workout.exercises || [])
      .map(e => e.exerciseId)
      .filter((id): id is string => !!id);
    const tabNav = (navigation as any)?.getParent?.()?.getParent?.();
    if (tabNav) {
      tabNav.navigate('Search', {
        screen: 'SearchList',
        params: {
          addToWorkout: {
            workoutId: workout.id,
            workoutName: workout.name,
            existingExerciseIds,
          },
        },
      });
      navigation.goBack();
    }
  };

  const handleStartWorkout = () => {
    if (!workout?.id) return;
    const tabNav = (navigation as any)?.getParent?.()?.getParent?.();
    if (tabNav) {
      tabNav.navigate('Workout', { workoutId: workout.id });
      navigation.goBack();
    }
  };

  useEffect(() => {
    if (workoutId) {
      loadWorkout();
    }
  }, [workoutId]);

  useEffect(() => {
    setGuideExpanded(false);
  }, [workout?.id]);

  const loadWorkout = async () => {
    if (!workoutId) return;
    try {
      setLoading(true);
      const [data, plan] = await Promise.all([
        getWorkoutById(workoutId),
        getCurrentPlan().catch(() => null),
      ]);
      setWorkout(data);
      setSlotLookupPlan(plan);
      setSaved(!!data.saved);
    } catch (error) {
      console.error('Error loading workout:', error);
      Alert.alert('Error', 'Failed to load workout');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSave = async () => {
    if (!workout?.id) return;
    const wasSaved = saved;
    // Optimistic like the exercise hearts: flip immediately, then sync with the server.
    setSaved(!wasSaved);
    try {
      if (wasSaved) await unsaveWorkout(workout.id);
      else await saveWorkout(workout.id);
    } catch (e) {
      if (__DEV__) console.warn('[WorkoutDetail] toggle save failed', workout.id, e);
      // Revert the optimistic change so the UI matches the server.
      setSaved(wasSaved);
    }
  };

  const handleGenerateWorkout = async () => {
    try {
      setGenerating(true);
      const newWorkout = await generateWorkout();
      setWorkout(newWorkout);
    } catch (error) {
      console.error('Error generating workout:', error);
      Alert.alert('Error', 'Failed to generate workout');
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerateWorkout = async () => {
    if (!workout?.id) return;
    try {
      setGenerating(true);
      const updated = await regenerateWorkoutInPlace(workout.id);
      setWorkout(updated);
    } catch (error: any) {
      console.error('Error regenerating workout:', error);
      const raw = error?.response?.data?.message;
      const msg = Array.isArray(raw) ? raw.join(' ') : raw;
      const fallback =
        error?.response?.status === 400
          ? 'Add exercises before regenerating.'
          : 'Could not regenerate. Try again.';
      Alert.alert('Regenerate failed', typeof msg === 'string' && msg.trim() ? msg : fallback, [
        { text: 'OK', style: 'cancel' },
        { text: 'Retry', onPress: handleRegenerateWorkout },
      ]);
    } finally {
      setGenerating(false);
    }
  };

  const handleRemoveExercise = (index: number) => {
    if (!workout?.id) return;
    if (workout.exercises.length <= 1) {
      Alert.alert(
        'Keep at least one exercise',
        'Add another exercise from the library first, or use Regenerate to replace the whole list.',
      );
      return;
    }
    const ex = workout.exercises[index];
    Alert.alert('Remove exercise', `Remove “${ex.name}” from this workout?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            const next = workout.exercises
              .filter((_, i) => i !== index)
              .map((e, i) => ({
                name: e.name,
                sets: e.sets,
                reps: e.reps,
                weight: e.weight,
                notes: e.notes,
                exerciseId: e.exerciseId,
                orderIndex: i,
              }));
            const updated = await updateWorkout(workout.id, { exercises: next });
            setWorkout(updated);
          } catch (e) {
            console.error(e);
            Alert.alert('Error', 'Could not update workout.');
          }
        },
      },
    ]);
  };

  const BackBar = () => (
    <View style={[styles.backBar, { paddingTop: Math.max(insets.top, 6) + 6 }]}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
        accessibilityLabel="Go back"
      >
        <Ionicons name="arrow-back" size={24} color={colors.primary} />
        <Text style={styles.backButtonText}>Back</Text>
      </TouchableOpacity>
      {workout?.id && (
        <View style={styles.backBarActions}>
          <TouchableOpacity
            style={styles.shareButton}
            onPress={() => setShareModalVisible(true)}
            accessibilityLabel="Share workout"
          >
            <Ionicons name="share-outline" size={24} color={colors.primary} />
          </TouchableOpacity>
          <WorkoutLikeButton
            workoutId={workout.id}
            saved={saved}
            onSave={handleToggleSave}
            onUnsave={handleToggleSave}
            size={26}
            style={styles.saveButton}
          />
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <BackBar />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (!workout) {
    return (
      <View style={styles.container}>
        <BackBar />
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No workout selected</Text>
          <TouchableOpacity
            style={[styles.primaryCta, { alignSelf: 'stretch', marginHorizontal: 8 }]}
            onPress={handleGenerateWorkout}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={styles.primaryCtaText}>Generate new workout</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BackBar />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 12) + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.workoutName}>{workout.name}</Text>
          {workout.day && (
            <Text style={styles.workoutDay}>{workout.day}</Text>
          )}
          {(() => {
            const m = resolveWorkoutEtaMinutes(workout, detailEtaSlot ?? null);
            return m != null ? (
              <Text style={styles.workoutEst}>Est. {m} min</Text>
            ) : null;
          })()}
        </View>

        {(workout.warmUp || workout.reasoning || workout.coolDown) ? (
          <View style={styles.guideDisclosure}>
            <TouchableOpacity
              style={styles.guideDisclosureHeader}
              onPress={() => setGuideExpanded((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: guideExpanded }}
              accessibilityLabel={
                guideExpanded ? 'Hide session guide' : 'Show warm-up, workout notes and cool-down'
              }
            >
              <Ionicons
                name={guideExpanded ? 'chevron-up' : 'chevron-down'}
                size={22}
                color={colors.primary}
              />
              <View style={styles.guideDisclosureTextCol}>
                <Text style={styles.guideDisclosureTitle}>Session guide</Text>
                <Text style={styles.guideDisclosureHint} numberOfLines={2}>
                  Warm-up, why this session & cool-down — optional read before you train.
                </Text>
              </View>
            </TouchableOpacity>
            {guideExpanded ? (
              <View style={styles.guideDisclosureBody}>
                {workout.warmUp ? (
                  <View style={styles.guideBlock}>
                    <Text style={styles.guideLabel}>Warm-up</Text>
                    <Text style={styles.guideText}>{workout.warmUp}</Text>
                  </View>
                ) : null}
                {workout.reasoning ? (
                  <View style={styles.guideBlock}>
                    <Text style={styles.guideLabel}>Why this workout</Text>
                    <Text style={styles.guideText}>{workout.reasoning}</Text>
                  </View>
                ) : null}
                {workout.coolDown ? (
                  <View style={[styles.guideBlock, styles.guideBlockLast]}>
                    <Text style={styles.guideLabel}>Cool-down</Text>
                    <Text style={styles.guideText}>{workout.coolDown}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.exercisesContainer}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionAccent} />
            <Text style={styles.sectionTitle}>Exercises</Text>
          </View>
          <Text style={styles.sectionSubtitle}>Remove moves you don&apos;t want, or regenerate the list for fresh AI picks for this session.</Text>
          <View style={styles.actionsBlock}>
            <TouchableOpacity style={styles.outlineCta} onPress={handleAddExercises}>
              <Text style={styles.outlineCtaText}>+ Add from library</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryCta} onPress={handleStartWorkout}>
              <Text style={styles.primaryCtaText}>Start workout</Text>
            </TouchableOpacity>
          </View>
          {workout.exercises.map((exercise, index) => {
            const metaLine = formatExercisePrescriptionBulleted(exercise, planGoal, weightUnit);
            const rowKey = exercise.id ?? `ex-${index}`;
            const libId = exercise.exerciseId;
            const canOpenLibrary = isLinkableLibraryExerciseId(libId);
            return (
              <Pressable
                key={rowKey}
                style={({ pressed }) => [
                  styles.exerciseCard,
                  canOpenLibrary && pressed ? { opacity: 0.75 } : null,
                ]}
                onPress={() => {
                  if (!canOpenLibrary) {
                    Alert.alert('Exercise details', `"${exercise.name}" isn't linked to the library yet. Open the Exercises tab and search by name.`);
                    return;
                  }
                  navigateFromWorkoutDetailToExerciseDetail(navigation, libId!);
                }}
              >
                <View style={styles.exerciseCardHeader}>
                  <View style={styles.exerciseIndex}>
                    <Text style={styles.exerciseIndexText}>{index + 1}</Text>
                  </View>
                  <View style={styles.exerciseNameCol}>
                    <View style={styles.exerciseCardTop}>
                      <View style={styles.exerciseTitleWrap}>
                        <Text style={styles.exerciseName} numberOfLines={4}>
                          {exercise.name}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.exerciseRemoveHit}
                        onPress={() => handleRemoveExercise(index)}
                        accessibilityLabel={`Remove ${exercise.name}`}
                        accessibilityRole="button"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="trash-outline" size={22} color={colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.exerciseMetaLine}>{metaLine}</Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
          <View style={styles.tertiaryBlock}>
            <TouchableOpacity
              style={[
                styles.tertiaryCta,
                (generating || workout.exercises.length === 0) && { opacity: 0.45 },
              ]}
              onPress={handleRegenerateWorkout}
              disabled={generating || workout.exercises.length === 0}
            >
              {generating ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.tertiaryCtaText}>Regenerate with AI</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.tertiaryHint}>
              New exercises for this same session (uses this workout&apos;s name and day). Your plan calendar updates too when this day is from your plan.
            </Text>
          </View>
        </View>
      </ScrollView>

      <ShareModal
        visible={shareModalVisible}
        onClose={() => setShareModalVisible(false)}
        kind="workout"
        targetId={workout.id}
        targetName={workout.name}
      />
    </View>
  );
}
