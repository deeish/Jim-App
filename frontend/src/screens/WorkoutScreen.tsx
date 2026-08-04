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
  getWorkoutLogs,
  getSavedWorkoutIds,
  saveWorkout,
  unsaveWorkout,
  updateWorkout,
  type SaveWorkoutLogParams,
} from '../services/workoutService';
import { getCurrentPlanWithWeekly, getCurrentPlan, planSlotForWorkout } from '../services/planService';
import type { ApiPlan } from '../services/planService';
import { resolveHomeToday, type HomeTodayResult } from '../lib/homeToday';
import { resolveWorkoutEtaMinutes } from '../lib/estimateWorkoutMinutes';
import { Workout, Exercise, type WorkoutSessionRestoredSnapshot, type WorkoutLog } from '../types/workout';
import { formatLocalYmd } from '../lib/planCalendar';
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

import { leading, radius, spacing, text, weight } from '../theme';
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
  const [savedWorkoutIds, setSavedWorkoutIds] = useState<string[]>([]);
  /** Latest server workout while a session is active (for merging exercises added from Search). */
  const [liveServerWorkout, setLiveServerWorkout] = useState<Workout | null>(null);
  const [removingIndex, setRemovingIndex] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [savedDraft, setSavedDraft] = useState<Awaited<ReturnType<typeof loadWorkoutDraft>>>(null);
  const [completedLog, setCompletedLog] = useState<WorkoutLog | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingLogRef = useRef(false);
  /** Active plan snapshot for ETA (same slot blend as Plan tab). */
  const [planForEta, setPlanForEta] = useState<ApiPlan | null>(null);

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
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        },
        backButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingRight: spacing.md },
        backButtonText: { fontSize: text.callout, fontWeight: weight.semibold },
        header: {
          backgroundColor: colors.surface,
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.lg,
          paddingBottom: spacing.lg,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        title: { fontSize: text.display, fontWeight: weight.bold, color: colors.text, marginBottom: spacing.xs },
        workoutName: { fontSize: text.headline, color: colors.primary, fontWeight: weight.semibold, marginBottom: spacing.xs },
        content: { flex: 1 },
        exercisesContainer: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
        emptyContainer: {
          flex: 1,
          justifyContent: 'flex-start',
          alignItems: 'center',
          paddingHorizontal: spacing.xxl,
          paddingTop: spacing.xxl,
          paddingBottom: spacing.md,
        },
        emptyText: { fontSize: text.title, color: colors.textTertiary, marginBottom: spacing.sm, fontWeight: weight.semibold },
        emptySubtext: { fontSize: text.callout, color: colors.textMuted, textAlign: 'center' },
        noExercisesCard: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingVertical: spacing.lg,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.md,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: colors.primary + '50',
          backgroundColor: colors.primary + '08',
          marginTop: spacing.sm,
        },
        noExercisesText: { fontSize: text.callout, fontWeight: weight.bold, color: colors.primary },
        noExercisesHint: { fontSize: text.footnote, color: colors.textMuted, marginTop: spacing.xxs },
        footer: {
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          paddingBottom: spacing.lg,
          gap: spacing.sm,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        startButton: { minHeight: 56 },
        metaLine: {
          fontSize: text.body,
          lineHeight: leading.body,
          color: colors.textSecondary,
          fontWeight: weight.medium,
          marginTop: spacing.xxs,
        },
        exercisesSection: { paddingHorizontal: spacing.xs, paddingTop: spacing.xs },
        exerciseSectionHeader: {
          marginBottom: spacing.lg,
        },
        sectionTitleRow: { flex: 1, minWidth: 0 },
        sectionTitle: { fontSize: text.title, fontWeight: weight.heavy, color: colors.text },
        sectionSubtitle: { fontSize: text.body, color: colors.textMuted, marginTop: spacing.xxs, fontWeight: weight.medium },
        footerAddCard: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.primary + '40',
          backgroundColor: colors.background,
        },
        footerAddCardText: { flex: 1, minWidth: 0 },
        footerAddCardTitle: { fontSize: text.callout, fontWeight: weight.bold, color: colors.text },
        footerAddCardSub: { fontSize: text.caption, color: colors.textMuted, marginTop: spacing.xxs, fontWeight: weight.medium },
        toastBar: {
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        toastText: { fontSize: text.body, color: colors.textSecondary, textAlign: 'center', fontWeight: weight.semibold },
        draftBanner: {
          marginHorizontal: spacing.lg,
          marginBottom: spacing.md,
          padding: spacing.lg,
          borderRadius: radius.md,
          backgroundColor: colors.primary + '18',
          borderWidth: 1,
          borderColor: colors.primary + '44',
        },
        draftBannerTitle: { fontSize: text.callout, fontWeight: weight.heavy, color: colors.text },
        draftBannerWorkout: { fontSize: text.callout, fontWeight: weight.bold, color: colors.primary, marginTop: spacing.sm },
        draftBannerMeta: { fontSize: text.body, color: colors.textMuted, marginTop: spacing.xs },
        draftBannerActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
        draftResumeBtn: {
          flex: 1,
          paddingVertical: spacing.md,
          borderRadius: radius.md,
          backgroundColor: colors.primary,
          alignItems: 'center',
        },
        draftResumeBtnText: { fontSize: text.callout, fontWeight: weight.heavy, color: colors.background },
        draftDiscardBtn: {
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        },
        draftDiscardBtnText: { fontSize: text.body, fontWeight: weight.bold, color: colors.textSecondary },
        completionBanner: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          backgroundColor: colors.success + '18',
          borderWidth: 1,
          borderColor: colors.success + '44',
          marginHorizontal: spacing.lg,
          marginBottom: spacing.md,
          padding: spacing.lg,
          borderRadius: radius.md,
        },
        completionBannerTitle: {
          fontSize: text.callout,
          fontWeight: weight.bold,
          color: colors.success,
        },
        completionBannerStats: {
          fontSize: text.body,
          color: colors.textSecondary,
          marginTop: spacing.xxs,
        },
      }),
    [colors]
  );

  const workoutEtaSlot = useMemo(
    () => planSlotForWorkout(planForEta, todayWorkout?.planWorkoutId ?? null),
    [planForEta, todayWorkout?.planWorkoutId],
  );

  /** Same slot lookup during an active session (draft resume may omit todayWorkout). */
  const sessionEtaSlot = useMemo(
    () => planSlotForWorkout(planForEta, session?.workout?.planWorkoutId ?? null),
    [planForEta, session?.workout?.planWorkoutId],
  );

  const workoutMetaLine = useMemo(() => {
    if (!todayWorkout) return '';
    const parts: string[] = [];
    const displayMin = resolveWorkoutEtaMinutes(todayWorkout, workoutEtaSlot ?? null);
    const plannedStrip = todayWorkout.estimatedDuration ?? workoutEtaSlot?.durationMinutes ?? null;
    const n = todayWorkout.exercises?.length ?? 0;
    if (displayMin != null) parts.push(`Est. ${displayMin} min`);
    const exercisePhrase = `${n} ${n === 1 ? 'exercise' : 'exercises'}`;
    const focusRaw = todayWorkout.focus?.trim();
    if (focusRaw) {
      const segments = focusRaw.split(/\s*·\s*/).map((s) => s.trim()).filter(Boolean);
      for (const seg of segments) {
        if (/^\d+\s*min$/i.test(seg)) {
          const m = parseInt(seg, 10);
          if (m === displayMin || m === plannedStrip) continue;
        }
        if (/^\d+\s*exercises?$/i.test(seg)) continue;
        parts.push(seg);
      }
    }
    parts.push(exercisePhrase);
    return parts.join(' · ');
  }, [todayWorkout, workoutEtaSlot]);

  const handleOpenExerciseDetail = (exercise: Exercise) => {
    const id = exercise.exerciseId;
    if (id && isLinkableLibraryExerciseId(id)) {
      navigateFromWorkoutToExerciseDetail(navigation, id);
      return;
    }
    showToast('Open Exercises tab to find this movement in the library.');
  };

  const doRemoveExercise = async (index: number) => {
    if (!todayWorkout?.id) return;
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

  const handleRemoveExercise = (index: number) => {
    if (!todayWorkout?.id || removingIndex !== null) return;
    const name = todayWorkout.exercises[index]?.name ?? 'Exercise';
    Alert.alert(
      `Remove ${name}?`,
      'This exercise will be removed from today\'s workout.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => doRemoveExercise(index) },
      ]
    );
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
            origin: 'workout',
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

  useEffect(() => {
    if (!todayWorkout?.id) {
      setCompletedLog(null);
      return;
    }
    let cancelled = false;
    const today = formatLocalYmd(new Date());
    getWorkoutLogs({ from: today, to: today })
      .then(logs => {
        if (cancelled) return;
        const match = logs.find(l => l.workoutId === todayWorkout.id && l.completedAt != null);
        setCompletedLog(match ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [todayWorkout?.id]);

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
            const [w, plan, ids] = await Promise.all([
              getWorkoutById(workoutIdParam),
              getCurrentPlan(),
              getSavedWorkoutIds().catch(() => []),
            ]);
            if (!cancelled) {
              setPlanToday(null);
              setPlanForEta(plan ?? null);
              setTodayWorkout(w);
              setSavedWorkoutIds(ids);
            }
          } else {
            try {
              const { plan, weeklyWorkouts } = await getCurrentPlanWithWeekly();
              const resolved = resolveHomeToday(plan, weeklyWorkouts ?? []);
              if (!cancelled) {
                setPlanToday(resolved);
                setPlanForEta(plan ?? null);
                setTodayWorkout(resolved.status === 'scheduled' ? resolved.workout : null);
              }
            } catch {
              if (!cancelled) {
                setPlanToday({ status: 'no_plan' });
                setPlanForEta(null);
                setTodayWorkout(null);
              }
            }
          }
        } catch {
          if (!cancelled && workoutIdParam) {
            setPlanToday(null);
            setPlanForEta(null);
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
      const [workout, plan, ids] = await Promise.all([
        getWorkoutById(id),
        getCurrentPlan(),
        getSavedWorkoutIds().catch(() => []),
      ]);
      setPlanForEta(plan ?? null);
      setTodayWorkout(workout);
      setSavedWorkoutIds(ids);
    } catch (error) {
      console.error('Error loading workout:', error);
      setTodayWorkout(null);
      setPlanForEta(null);
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
      setPlanForEta(plan ?? null);
      const resolved = resolveHomeToday(plan, weeklyWorkouts ?? []);
      setPlanToday(resolved);
      setTodayWorkout(resolved.status === 'scheduled' ? resolved.workout : null);
    } catch (error) {
      console.error('Error loading today\'s workout:', error);
      setPlanToday({ status: 'no_plan' });
      setTodayWorkout(null);
      setPlanForEta(null);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleLike = async () => {
    if (!todayWorkout?.id) return;
    const id = todayWorkout.id;
    const wasSaved = savedWorkoutIds.includes(id);
    // Optimistic like the exercise hearts: flip immediately, then sync with the server.
    setSavedWorkoutIds((prev) => (wasSaved ? prev.filter((x) => x !== id) : [...prev, id]));
    try {
      if (wasSaved) await unsaveWorkout(id);
      else await saveWorkout(id);
    } catch (e) {
      if (__DEV__) console.warn('[Workout] toggle like failed', id, e);
      // Revert the optimistic change so the UI matches the server.
      setSavedWorkoutIds((prev) =>
        wasSaved
          ? prev.includes(id) ? prev : [...prev, id]
          : prev.filter((x) => x !== id),
      );
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

    setCompletedLog(null);
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
    showToast('Draft discarded');
  };

  const handleEndWorkout = async (sessionData?: SaveWorkoutLogParams) => {
    if (sessionData) {
      if (savingLogRef.current) return;
      savingLogRef.current = true;
      try {
        const log = await saveWorkoutLog({
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
        setCompletedLog(log);
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
        savingLogRef.current = false;
      }
    }
    setSession(null);
    setLiveServerWorkout(null);
    if (workoutIdParam) {
      loadWorkoutById(workoutIdParam);
    } else {
      loadTodayWorkout();
    }
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
        etaPlanSlot={sessionEtaSlot ?? null}
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
      <View
        style={[
          styles.header,
          {
            // Tab screens don't get automatic top safe area; fromPlan uses backBar for that.
            paddingTop: fromPlan ? 16 : 8 + Math.max(insets.top, 8),
          },
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs }}>
          <Text style={styles.title}>{headerTitle}</Text>
          {todayWorkout?.id && (
            <WorkoutLikeButton
              workoutId={todayWorkout.id}
              saved={savedWorkoutIds.includes(todayWorkout.id)}
              onSave={handleToggleLike}
              onUnsave={handleToggleLike}
              size={26}
            />
          )}
        </View>
        {todayWorkout && (
          <>
            {!workoutIdParam && <Text style={styles.workoutName}>{todayWorkout.name}</Text>}
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

      {completedLog ? (
        <View style={styles.completionBanner}>
          <Ionicons name="checkmark-circle" size={26} color={colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={styles.completionBannerTitle}>Workout Complete</Text>
            <Text style={styles.completionBannerStats}>
              {[
                completedLog.totalTimeSeconds
                  ? `${Math.floor(completedLog.totalTimeSeconds / 60)} min`
                  : null,
                completedLog.totalSets ? `${completedLog.totalSets} sets` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        </View>
      ) : null}

      {todayWorkout ? (
        <ScrollView style={styles.content} contentContainerStyle={styles.exercisesContainer}>
          <View style={styles.exercisesSection}>
            <View style={styles.exerciseSectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>Exercises</Text>
                {todayWorkout.exercises.length > 0 && (
                  <Text style={styles.sectionSubtitle}>
                    Tap a row for details · trash removes from this workout
                  </Text>
                )}
              </View>
            </View>
            {todayWorkout.exercises.length === 0 && (
              <TouchableOpacity
                style={styles.noExercisesCard}
                onPress={handleAddExercises}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Add exercises from library"
              >
                <Ionicons name="add-circle-outline" size={26} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.noExercisesText}>Add your first exercise</Text>
                  <Text style={styles.noExercisesHint}>Browse the library below</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
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
      <View
        style={[
          styles.footer,
          // Tab bar already sits above the home indicator; adding insets.bottom here
          // doubled safe area on native and left a gap above the tab bar (web insets are 0).
          { paddingBottom: spacing.lg },
        ]}
      >
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
