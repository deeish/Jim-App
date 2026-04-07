import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import {
  getWorkoutById,
  saveWorkoutLog,
  getSavedWorkoutIds,
  saveWorkout,
  unsaveWorkout,
  updateWorkout,
} from '../services/workoutService';
import { getCurrentPlanWithWeekly } from '../services/planService';
import { resolveHomeToday, type HomeTodayResult } from '../lib/homeToday';
import { Workout, Exercise, type WorkoutSessionRestoredSnapshot } from '../types/workout';
import { loadWorkoutDraft, clearWorkoutDraft } from '../lib/workoutDraftStorage';
import { navigateFromWorkoutToExerciseDetail, isLinkableLibraryExerciseId } from '../lib/exerciseNavigation';
import Button from '../components/Button';
import ExerciseCard from '../components/ExerciseCard';
import LoadingSpinner from '../components/LoadingSpinner';
import WorkoutSession from '../components/WorkoutSession';
import WorkoutLikeButton from '../components/WorkoutLikeButton';
import { useTheme } from '../theme/ThemeContext';
import type { RootStackParamList } from '../types/navigation';
import { RootTabParamList } from '../components/NavBar';

interface WorkoutSessionState {
  workout: Workout;
  currentExerciseIndex: number;
  startTime: Date;
  restoredSnapshot?: WorkoutSessionRestoredSnapshot | null;
}

type WorkoutScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<RootTabParamList, 'Workout'>,
  NativeStackNavigationProp<RootStackParamList>
>;

type WorkoutScreenRouteProp = RouteProp<RootTabParamList, 'Workout'>;

function workoutTabEmptyCopy(
  planToday: HomeTodayResult | null,
  openedFromPlanWithId: boolean,
): { title: string; sub: string } {
  if (openedFromPlanWithId || !planToday) {
    return {
      title: 'No workout planned for today',
      sub: 'Go to the Plan tab to generate or schedule a workout.',
    };
  }
  switch (planToday.status) {
    case 'rest':
      return {
        title: 'Rest day',
        sub: 'Your plan shows recovery today — there is no session to start.',
      };
    case 'planned_pending':
      return {
        title: 'Session not loaded yet',
        sub: 'Open the Plan tab and start this day’s session so it appears here.',
      };
    case 'empty_day':
      return {
        title: 'Nothing scheduled today',
        sub: 'Add a workout on Plan for this day, or generate a full plan.',
      };
    case 'out_of_program':
      return {
        title: 'Outside your program week',
        sub: 'This week is before or after your plan range. Change week on Plan.',
      };
    case 'no_plan':
      return {
        title: 'No plan yet',
        sub: 'Create a plan on the Plan tab, then open this tab to train.',
      };
    default:
      return {
        title: 'No workout planned for today',
        sub: 'Go to the Plan tab to generate or schedule a workout.',
      };
  }
}

function noStartWorkoutAlertMessage(planToday: HomeTodayResult | null, fromPlanWithId: boolean): string {
  if (fromPlanWithId || !planToday) {
    return 'No workout planned for today. Go to the Plan tab to generate one.';
  }
  switch (planToday.status) {
    case 'rest':
      return 'Today is a rest day on your plan.';
    case 'planned_pending':
      return 'Start this session from the Plan tab first so your workout is created.';
    case 'empty_day':
      return 'Nothing is scheduled today. Add a day on Plan or generate a plan.';
    case 'out_of_program':
      return 'This week is outside your program. Adjust the week on Plan.';
    case 'no_plan':
      return 'You don’t have a plan yet. Create one on the Plan tab.';
    default:
      return 'No workout planned for today. Go to the Plan tab to generate one.';
  }
}

export default function WorkoutScreen() {
  const navigation = useNavigation<WorkoutScreenNavigationProp>();
  const route = useRoute<WorkoutScreenRouteProp>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const workoutIdParam = route.params?.workoutId;
  const fromPlan = route.params?.fromPlan === true;
  const [todayWorkout, setTodayWorkout] = useState<Workout | null>(null);
  /** Last Plan-tab resolution for “today” (only when not opening a specific workout by id). */
  const [planToday, setPlanToday] = useState<HomeTodayResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<WorkoutSessionState | null>(null);
  const [savingLog, setSavingLog] = useState(false);
  const [savedWorkoutIds, setSavedWorkoutIds] = useState<string[]>([]);
  const [savingLike, setSavingLike] = useState(false);
  /** Latest server workout while a session is active (for merging exercises added from Search). */
  const [liveServerWorkout, setLiveServerWorkout] = useState<Workout | null>(null);
  const [removingIndex, setRemovingIndex] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [savedDraft, setSavedDraft] = useState<Awaited<ReturnType<typeof loadWorkoutDraft>>>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = null;
    }, 2200);
  };

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
        content: { flex: 1 },
        exercisesContainer: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 6 },
        emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
        emptyText: { fontSize: 20, color: colors.textTertiary, marginBottom: 8, fontWeight: '600' },
        emptySubtext: { fontSize: 16, color: colors.textMuted, textAlign: 'center' },
        footer: {
          paddingHorizontal: 14,
          paddingTop: 10,
          paddingBottom: 16,
          gap: 8,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        startButton: { minHeight: 56 },
        metaLine: {
          fontSize: 14,
          lineHeight: 20,
          color: colors.textSecondary,
          fontWeight: '500',
          marginTop: 4,
        },
        exercisesSection: { paddingHorizontal: 4, paddingTop: 4 },
        exerciseSectionHeader: {
          marginBottom: 14,
        },
        sectionTitleRow: { flex: 1, minWidth: 0 },
        sectionTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
        sectionSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2, fontWeight: '500' },
        footerAddCard: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingVertical: 9,
          paddingHorizontal: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.primary + '40',
          backgroundColor: colors.background,
        },
        footerAddCardText: { flex: 1, minWidth: 0 },
        footerAddCardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
        footerAddCardSub: { fontSize: 11, color: colors.textMuted, marginTop: 1, fontWeight: '500' },
        toastBar: {
          paddingVertical: 10,
          paddingHorizontal: 16,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        toastText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', fontWeight: '600' },
        draftBanner: {
          marginHorizontal: 16,
          marginBottom: 12,
          padding: 16,
          borderRadius: 14,
          backgroundColor: colors.primary + '18',
          borderWidth: 1,
          borderColor: colors.primary + '44',
        },
        draftBannerTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
        draftBannerWorkout: { fontSize: 16, fontWeight: '700', color: colors.primary, marginTop: 6 },
        draftBannerMeta: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
        draftBannerActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
        draftResumeBtn: {
          flex: 1,
          paddingVertical: 12,
          borderRadius: 10,
          backgroundColor: colors.primary,
          alignItems: 'center',
        },
        draftResumeBtnText: { fontSize: 15, fontWeight: '800', color: colors.background },
        draftDiscardBtn: {
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        },
        draftDiscardBtnText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
      }),
    [colors]
  );

  const workoutMetaLine = useMemo(() => {
    if (!todayWorkout) return '';
    const parts: string[] = [];
    const est = todayWorkout.estimatedDuration;
    const n = todayWorkout.exercises?.length ?? 0;
    if (est != null) parts.push(`Est. ${est} min`);
    const exercisePhrase = `${n} ${n === 1 ? 'exercise' : 'exercises'}`;
    const focusRaw = todayWorkout.focus?.trim();
    if (focusRaw) {
      const segments = focusRaw.split(/\s*·\s*/).map((s) => s.trim()).filter(Boolean);
      for (const seg of segments) {
        if (est != null && /^\d+\s*min$/i.test(seg) && parseInt(seg, 10) === est) continue;
        if (new RegExp(`^${n}\\s*exercises?$`, 'i').test(seg)) continue;
        parts.push(seg);
      }
    }
    parts.push(exercisePhrase);
    return parts.join(' · ');
  }, [todayWorkout]);

  const handleOpenExerciseDetail = (exercise: Exercise) => {
    const id = exercise.exerciseId;
    if (id && isLinkableLibraryExerciseId(id)) {
      navigateFromWorkoutToExerciseDetail(navigation, id);
      return;
    }
    showToast('Open Exercises tab to find this movement in the library.');
  };

  const handleRemoveExercise = async (index: number) => {
    if (!todayWorkout?.id || removingIndex !== null) return;
    const name = todayWorkout.exercises[index]?.name ?? 'Exercise';
    const next = todayWorkout.exercises.filter((_, i) => i !== index);
    setRemovingIndex(index);
    try {
      const updated = await updateWorkout(todayWorkout.id, {
        exercises: next.map((ex, idx) => ({
          name: ex.name,
          sets: ex.sets,
          reps: ex.reps,
          weight: ex.weight,
          notes: ex.notes,
          exerciseId: ex.exerciseId,
          orderIndex: idx,
        })),
      });
      setTodayWorkout(updated);
      showToast(`Removed ${name}`);
    } catch {
      Alert.alert('Could not update workout', 'Check your connection and try again.');
    } finally {
      setRemovingIndex(null);
    }
  };

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

  useFocusEffect(
    useCallback(() => {
      const id = session?.workout?.id;
      if (!id) {
        setLiveServerWorkout(null);
        return;
      }
      let cancelled = false;
      (async () => {
        try {
          const w = await getWorkoutById(id);
          if (!cancelled && w) setLiveServerWorkout(w);
        } catch {
          if (!cancelled) setLiveServerWorkout(null);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [session?.workout?.id])
  );

  /** Refresh workout template when returning to this tab (e.g. after adding exercises in Search). */
  useFocusEffect(
    useCallback(() => {
      if (session) return;
      let cancelled = false;
      (async () => {
        try {
          if (workoutIdParam) {
            const w = await getWorkoutById(workoutIdParam);
            if (!cancelled) {
              setPlanToday(null);
              setTodayWorkout(w);
            }
          } else {
            try {
              const { plan, weeklyWorkouts } = await getCurrentPlanWithWeekly();
              const resolved = resolveHomeToday(plan, weeklyWorkouts ?? []);
              if (!cancelled) {
                setPlanToday(resolved);
                setTodayWorkout(resolved.status === 'scheduled' ? resolved.workout : null);
              }
            } catch {
              if (!cancelled) {
                setPlanToday({ status: 'no_plan' });
                setTodayWorkout(null);
              }
            }
          }
        } catch {
          if (!cancelled && workoutIdParam) {
            setPlanToday(null);
            setTodayWorkout(null);
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [session, workoutIdParam])
  );

  useFocusEffect(
    useCallback(() => {
      if (session) return;
      let cancelled = false;
      loadWorkoutDraft().then((d) => {
        if (!cancelled) setSavedDraft(d);
      });
      return () => {
        cancelled = true;
      };
    }, [session])
  );

  const loadWorkoutById = async (id: string) => {
    try {
      setLoading(true);
      setPlanToday(null);
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
      const [{ plan, weeklyWorkouts }, ids] = await Promise.all([
        getCurrentPlanWithWeekly(),
        getSavedWorkoutIds().catch(() => []),
      ]);
      setSavedWorkoutIds(ids);
      const resolved = resolveHomeToday(plan, weeklyWorkouts ?? []);
      setPlanToday(resolved);
      setTodayWorkout(resolved.status === 'scheduled' ? resolved.workout : null);
    } catch (error) {
      console.error('Error loading today\'s workout:', error);
      setPlanToday({ status: 'no_plan' });
      setTodayWorkout(null);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleLike = async () => {
    if (!todayWorkout?.id || savingLike) return;
    setSavingLike(true);
    try {
      const isSaved = savedWorkoutIds.includes(todayWorkout.id);
      if (isSaved) {
        await unsaveWorkout(todayWorkout.id);
        setSavedWorkoutIds((prev) => prev.filter((id) => id !== todayWorkout.id));
      } else {
        await saveWorkout(todayWorkout.id);
        setSavedWorkoutIds((prev) => [...prev, todayWorkout.id]);
      }
    } catch {
      // ignore
    } finally {
      setSavingLike(false);
    }
  };

  const handleStartWorkout = () => {
    if (!todayWorkout) {
      Alert.alert(
        'No Workout',
        noStartWorkoutAlertMessage(planToday, Boolean(workoutIdParam)),
      );
      return;
    }
    if (todayWorkout.exercises.length === 0) {
      showToast('Add at least one exercise first.');
      return;
    }

    void clearWorkoutDraft();
    setSavedDraft(null);
    setSession({
      workout: todayWorkout,
      currentExerciseIndex: 0,
      startTime: new Date(),
    });
  };

  const handleResumeDraft = async () => {
    const d = await loadWorkoutDraft();
    if (!d) {
      setSavedDraft(null);
      return;
    }
    setSession({
      workout: d.workout,
      currentExerciseIndex: d.currentExerciseIndex,
      startTime: new Date(d.startTimeIso),
      restoredSnapshot: {
        exerciseSessions: d.exerciseSessions,
        exerciseNotes: d.exerciseNotes,
        overallNotes: d.overallNotes,
        expandedExerciseIndex: d.expandedExerciseIndex,
        focusedSetIndex: d.focusedSetIndex,
        showAdvancedLogging: d.showAdvancedLogging,
      },
    });
    setSavedDraft(null);
  };

  const handleDiscardDraft = async () => {
    await clearWorkoutDraft();
    setSavedDraft(null);
    showToast('Saved session cleared');
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
        await clearWorkoutDraft();
        setSavedDraft(null);
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
    setLiveServerWorkout(null);
    loadTodayWorkout(); // Refresh in case workout was updated
  };

  const handleExitWithoutFinishing = async () => {
    setSession(null);
    setLiveServerWorkout(null);
    const d = await loadWorkoutDraft();
    setSavedDraft(d);
  };

  // Live session must win over loading so returning from Search does not flash a spinner over the session.
  if (session) {
    return (
      <WorkoutSession
        session={session}
        serverWorkout={liveServerWorkout}
        onComplete={handleEndWorkout}
        onUpdate={setSession}
        onExitWithoutFinishing={handleExitWithoutFinishing}
        navigation={navigation as unknown as NativeStackNavigationProp<RootStackParamList>}
      />
    );
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  // Show workout with start button (today's or selected from Plan)
  const headerTitle = workoutIdParam ? (todayWorkout?.name ?? 'Workout') : "Today's Workout";
  const emptyCopy = workoutTabEmptyCopy(planToday, Boolean(workoutIdParam));
  return (
    <View style={styles.container} testID="e2e-workout-root">
      {fromPlan && (
        <View style={[styles.backBar, { paddingTop: Math.max(insets.top, 10) }]}>
          <TouchableOpacity style={styles.backButton} onPress={goBackToPlan} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color={colors.primary} />
            <Text style={[styles.backButtonText, { color: colors.primary }]}>Back</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={styles.title}>{headerTitle}</Text>
          {todayWorkout?.id && (
            <WorkoutLikeButton
              workoutId={todayWorkout.id}
              saved={savedWorkoutIds.includes(todayWorkout.id)}
              onSave={handleToggleLike}
              onUnsave={handleToggleLike}
              disabled={savingLike}
              size={26}
            />
          )}
        </View>
        {todayWorkout && (
          <>
            <Text style={styles.workoutName}>{todayWorkout.name}</Text>
            <Text style={styles.metaLine} numberOfLines={3}>
              {workoutMetaLine}
            </Text>
          </>
        )}
      </View>

      {savedDraft ? (
        <View style={styles.draftBanner}>
          <Text style={styles.draftBannerTitle}>Workout in progress</Text>
          <Text style={styles.draftBannerWorkout} numberOfLines={2}>
            {savedDraft.workout.name}
          </Text>
          <Text style={styles.draftBannerMeta}>
            Started {new Date(savedDraft.startTimeIso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
          </Text>
          <View style={styles.draftBannerActions}>
            <TouchableOpacity style={styles.draftResumeBtn} onPress={handleResumeDraft} activeOpacity={0.85}>
              <Text style={styles.draftResumeBtnText}>Resume</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.draftDiscardBtn} onPress={handleDiscardDraft} activeOpacity={0.8}>
              <Text style={styles.draftDiscardBtnText}>Discard</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {todayWorkout ? (
        <ScrollView style={styles.content} contentContainerStyle={styles.exercisesContainer}>
          <View style={styles.exercisesSection}>
            <View style={styles.exerciseSectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>Exercises</Text>
                <Text style={styles.sectionSubtitle}>
                  Tap a row for details · trash removes from this workout
                </Text>
              </View>
            </View>
            {todayWorkout.exercises.map((exercise, index) => (
              <ExerciseCard
                key={exercise.exerciseId ? `${exercise.exerciseId}-${index}` : `ex-${index}`}
                exercise={exercise}
                index={index}
                showOrderBadge
                showNotes={false}
                onPress={() => handleOpenExerciseDetail(exercise)}
                onRemove={() => handleRemoveExercise(index)}
                removing={removingIndex === index}
              />
            ))}
          </View>
        </ScrollView>
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{emptyCopy.title}</Text>
          <Text style={styles.emptySubtext}>{emptyCopy.sub}</Text>
        </View>
      )}

      {toast ? (
        <View style={styles.toastBar}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
      <View style={[styles.footer, { paddingBottom: Math.max(16, 10 + insets.bottom) }]}>
        {todayWorkout ? (
          <TouchableOpacity
            style={styles.footerAddCard}
            onPress={handleAddExercises}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Add exercises from library"
          >
            <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
            <View style={styles.footerAddCardText}>
              <Text style={styles.footerAddCardTitle}>Add from library</Text>
              <Text style={styles.footerAddCardSub}>Search library · attach to workout</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
        <Button
          title={
            todayWorkout
              ? todayWorkout.exercises.length === 0
                ? 'Add an exercise to start'
                : 'Start Workout'
              : 'No Workout Available'
          }
          onPress={handleStartWorkout}
          disabled={!todayWorkout || todayWorkout.exercises.length === 0}
          style={styles.startButton}
        />
      </View>
    </View>
  );
}
