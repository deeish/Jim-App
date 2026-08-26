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
import { toWorkoutExercisePayloads } from '../lib/workoutExercisePayload';
import { todayIso } from '../lib/planCalendarPrototype';
import { leading, radius, spacing, text, tracking, weight } from '../theme';
import { useTabBarInset } from '../navigation/useTabBarInset';
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
  // The tab bar floats over this screen; keep the last exercise rows clear of it.
  const tabBarInset = useTabBarInset();
  const [workout, setWorkout] = useState<Workout | null>(null);
  // TRUE, not false: the fetch runs in an effect, which is after first
  // paint, so starting false rendered one frame of "No workout selected"
  // (and a Generate button) at a screen that was about to show a workout.
  const [loading, setLoading] = useState(true);
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
        emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
        emptyText: { fontSize: text.headline, color: colors.textTertiary, marginBottom: spacing.xl },
        header: {
          backgroundColor: colors.surface,
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.lg,
          paddingBottom: spacing.xl,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        workoutName: { fontSize: text.display, fontWeight: weight.bold, color: colors.text, marginBottom: spacing.sm, letterSpacing: tracking.tight },
        workoutDay: { fontSize: text.callout, color: colors.primary, fontWeight: weight.semibold, textTransform: 'capitalize' },
        workoutEst: {
          fontSize: text.body,
          color: colors.textSecondary,
          fontWeight: weight.semibold,
          marginTop: spacing.sm,
        },
        exercisesContainer: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
        guideDisclosure: {
          marginHorizontal: spacing.lg,
          marginTop: spacing.md,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          overflow: 'hidden',
        },
        guideDisclosureHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          gap: spacing.md,
        },
        guideDisclosureTextCol: { flex: 1, minWidth: 0 },
        guideDisclosureTitle: { fontSize: text.callout, fontWeight: weight.semibold, color: colors.text },
        guideDisclosureHint: { fontSize: text.body, color: colors.textMuted, marginTop: spacing.xxs },
        guideDisclosureBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.none },
        guideBlock: { marginBottom: spacing.lg },
        guideBlockLast: { marginBottom: spacing.none },
        guideLabel: {
          fontSize: text.body,
          fontWeight: weight.bold,
          color: colors.primary,
          marginBottom: spacing.sm,
          letterSpacing: tracking.wider,
          textTransform: 'uppercase',
        },
        guideText: { fontSize: text.body, color: colors.textSecondary, lineHeight: leading.body },
        sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.md },
        sectionAccent: { width: 3, height: 16, borderRadius: radius.xs, backgroundColor: colors.primary },
        sectionTitle: { fontSize: text.caption, fontWeight: weight.bold, color: colors.primary, letterSpacing: tracking.widest, textTransform: 'uppercase' },
        sectionSubtitle: { fontSize: text.body, color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: leading.body },
        actionsBlock: { gap: spacing.md, marginBottom: spacing.xl },
        exerciseCard: {
          backgroundColor: colors.surface,
          paddingVertical: spacing.lg,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.md,
          marginBottom: spacing.md,
          borderWidth: 1,
          borderColor: colors.border,
        },
        exerciseCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
        exerciseIndex: {
          width: 28,
          height: 28,
          borderRadius: radius.sm,
          backgroundColor: colors.background,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        },
        exerciseIndexText: { fontSize: text.body, fontWeight: weight.bold, color: colors.primary },
        exerciseNameCol: { flex: 1, minWidth: 0 },
        exerciseCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
        exerciseTitleWrap: { flex: 1, minWidth: 0 },
        exerciseRemoveHit: { padding: spacing.sm, marginLeft: spacing.xs, marginTop: -4 },
        exerciseName: { fontSize: text.headline, fontWeight: weight.semibold, color: colors.text, lineHeight: leading.headline },
        exerciseMetaLine: { fontSize: text.body, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: leading.body },
        primaryCta: {
          backgroundColor: colors.primary,
          paddingVertical: spacing.lg,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 52,
        },
        primaryCtaText: { color: colors.background, fontSize: text.headline, fontWeight: weight.bold },
        outlineCta: {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: colors.primary,
          paddingVertical: spacing.lg,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 48,
        },
        outlineCtaText: { color: colors.primary, fontSize: text.callout, fontWeight: weight.semibold },
        tertiaryBlock: { marginTop: spacing.md, paddingBottom: spacing.sm },
        tertiaryCta: {
          paddingVertical: spacing.lg,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.md,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
        tertiaryCtaText: { color: colors.textSecondary, fontSize: text.callout, fontWeight: weight.semibold },
        tertiaryHint: {
          fontSize: text.footnote,
          color: colors.textMuted,
          textAlign: 'center',
          marginTop: spacing.sm,
          lineHeight: leading.footnote,
          paddingHorizontal: spacing.xs,
        },
        backBar: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.sm,
          paddingBottom: spacing.md,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        },
        backButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
        backButtonText: { fontSize: text.callout, fontWeight: weight.semibold, color: colors.primary },
        backBarActions: { flexDirection: 'row', alignItems: 'center' },
        shareButton: { padding: spacing.md },
        saveButton: { padding: spacing.md, marginRight: spacing.xs },
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
            origin: 'workoutDetail',
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
      // Training lives in the Calendar now — land on today's day view.
      tabNav.navigate('Calendar', {
        screen: 'PlanCalendarDay',
        params: { dateIso: todayIso() },
        initial: false,
      });
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
            // Full-fidelity payload — a hand-rolled field list here once
            // flattened every remaining row's rep range on a single removal.
            const next = toWorkoutExercisePayloads(
              workout.exercises.filter((_, i) => i !== index),
            );
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
            style={[styles.primaryCta, { alignSelf: 'stretch', marginHorizontal: spacing.sm }]}
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
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 12) + 24 + tabBarInset }}
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
