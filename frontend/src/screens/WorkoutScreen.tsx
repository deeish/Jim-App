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

import { elevation, leading, radius, SOFT_ALPHA, spacing, text, tracking, weight } from '../theme';
import { useTabBarInset } from '../navigation/useTabBarInset';
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

/** Height of the floating Start CTA — the list's bottom padding must clear it. */
const START_CTA_HEIGHT = 56;

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
  // The tab bar floats over this screen; the Start CTA and scroll padding clear it.
  const tabBarInset = useTabBarInset();
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
        header: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.md,
        },
        backButton: { marginLeft: -spacing.sm, marginTop: spacing.xxs, paddingRight: spacing.xs },
        headerText: { flex: 1, minWidth: 0 },
        eyebrow: {
          fontSize: text.caption,
          fontWeight: weight.heavy,
          letterSpacing: tracking.wider,
          textTransform: 'uppercase',
          color: colors.textMuted,
          marginBottom: spacing.xs,
        },
        title: {
          fontSize: text.display,
          lineHeight: leading.display,
          fontWeight: weight.bold,
          letterSpacing: tracking.tight,
          color: colors.text,
        },
        likeButton: { marginRight: -spacing.sm },
        content: { flex: 1 },
        listContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
        emptyContainer: {
          flex: 1,
          alignItems: 'center',
          paddingHorizontal: spacing.xxl,
          paddingTop: spacing.xxxl,
        },
        emptyIconCircle: {
          width: 64,
          height: 64,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.textMuted + SOFT_ALPHA,
          marginBottom: spacing.lg,
        },
        emptyText: { fontSize: text.title, color: colors.text, fontWeight: weight.semibold, textAlign: 'center' },
        emptySubtext: {
          fontSize: text.body,
          lineHeight: leading.body,
          color: colors.textMuted,
          textAlign: 'center',
          marginTop: spacing.sm,
        },
        emptyAction: {
          marginTop: spacing.xl,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.xl,
          borderRadius: radius.pill,
          backgroundColor: colors.primarySoft,
        },
        emptyActionText: { fontSize: text.callout, fontWeight: weight.semibold, color: colors.primary },
        startCtaWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg },
        startButton: { minHeight: START_CTA_HEIGHT },
        metaLine: {
          fontSize: text.body,
          lineHeight: leading.body,
          color: colors.textSecondary,
          fontWeight: weight.medium,
          marginTop: spacing.xs,
        },
        sectionLabel: {
          fontSize: text.caption,
          fontWeight: weight.bold,
          letterSpacing: tracking.wider,
          textTransform: 'uppercase',
          color: colors.textMuted,
          marginBottom: spacing.md,
        },
        addRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingVertical: spacing.lg,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.md,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        },
        addRowText: { flex: 1, minWidth: 0, fontSize: text.callout, fontWeight: weight.semibold, color: colors.primary },
        toastWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, alignItems: 'center' },
        toastPill: {
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.pill,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: colors.shadow,
          ...elevation.level2,
        },
        toastText: { fontSize: text.footnote, color: colors.textSecondary, textAlign: 'center', fontWeight: weight.semibold },
        bannerCard: {
          marginHorizontal: spacing.lg,
          marginBottom: spacing.md,
          padding: spacing.lg,
          borderRadius: radius.lg,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        },
        draftEyebrow: {
          fontSize: text.caption,
          fontWeight: weight.heavy,
          letterSpacing: tracking.wider,
          textTransform: 'uppercase',
          color: colors.primary,
        },
        draftWorkoutName: {
          fontSize: text.headline,
          lineHeight: leading.headline,
          fontWeight: weight.bold,
          color: colors.text,
          marginTop: spacing.xs,
        },
        draftMeta: { fontSize: text.footnote, color: colors.textMuted, marginTop: spacing.xxs },
        draftActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
        draftResumeBtn: {
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.xl,
          borderRadius: radius.pill,
          backgroundColor: colors.primary,
        },
        draftResumeBtnText: { fontSize: text.callout, fontWeight: weight.semibold, color: colors.onPrimary },
        draftDiscardBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
        draftDiscardBtnText: { fontSize: text.callout, fontWeight: weight.semibold, color: colors.textSecondary },
        completionBanner: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
        },
        completionBannerTitle: { fontSize: text.callout, fontWeight: weight.bold, color: colors.text },
        completionBannerStats: { fontSize: text.body, color: colors.textSecondary, marginTop: spacing.xxs },
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

  // The workout name is the star: it takes the title slot, and "Today's Workout"
  // becomes an eyebrow above it when this tab resolved today's session itself.
  const headerTitle = todayWorkout
    ? todayWorkout.name
    : workoutIdParam
      ? 'Workout'
      : "Today's Workout";
  const showEyebrow = !workoutIdParam && !!todayWorkout;
  const startCtaVisible = !!todayWorkout && todayWorkout.exercises.length > 0;
  const emptyCopy = workoutTabEmptyCopy(planToday, Boolean(workoutIdParam));
  return (
    <View style={styles.container} testID="e2e-workout-root">
      <View
        style={[
          styles.header,
          // Tab screens don't get automatic top safe area.
          { paddingTop: Math.max(insets.top, spacing.md) + spacing.sm },
        ]}
      >
        {fromPlan && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={goBackToPlan}
            activeOpacity={0.7}
            hitSlop={{ top: spacing.sm, bottom: spacing.sm, left: spacing.sm, right: spacing.sm }}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={28} color={colors.primary} />
          </TouchableOpacity>
        )}
        <View style={styles.headerText}>
          {showEyebrow && <Text style={styles.eyebrow}>Today's Workout</Text>}
          <Text style={styles.title} numberOfLines={1}>
            {headerTitle}
          </Text>
          {todayWorkout && workoutMetaLine ? (
            <Text style={styles.metaLine} numberOfLines={1}>
              {workoutMetaLine}
            </Text>
          ) : null}
        </View>
        {todayWorkout?.id && (
          <WorkoutLikeButton
            workoutId={todayWorkout.id}
            saved={savedWorkoutIds.includes(todayWorkout.id)}
            onSave={handleToggleLike}
            onUnsave={handleToggleLike}
            size={26}
            style={styles.likeButton}
          />
        )}
      </View>

      {savedDraft ? (
        <View style={styles.bannerCard}>
          <Text style={styles.draftEyebrow}>In progress</Text>
          <Text style={styles.draftWorkoutName} numberOfLines={1}>
            {savedDraft.workout.name}
          </Text>
          <Text style={styles.draftMeta}>
            Started {new Date(savedDraft.startTimeIso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
          </Text>
          <View style={styles.draftActions}>
            <TouchableOpacity
              style={styles.draftResumeBtn}
              onPress={handleResumeDraft}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Resume workout"
            >
              <Text style={styles.draftResumeBtnText}>Resume</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.draftDiscardBtn}
              onPress={handleDiscardDraft}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Discard draft"
            >
              <Text style={styles.draftDiscardBtnText}>Discard</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {completedLog ? (
        <View style={[styles.bannerCard, styles.completionBanner]}>
          <Ionicons name="checkmark-circle" size={24} color={colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={styles.completionBannerTitle}>Workout complete</Text>
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
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.listContent,
            // Content scrolls under the glass tab bar; the last row still has
            // to clear the bar plus the floating Start CTA.
            {
              paddingBottom:
                tabBarInset + spacing.xl + (startCtaVisible ? START_CTA_HEIGHT + spacing.md : 0),
            },
          ]}
        >
          <Text style={styles.sectionLabel}>Exercises</Text>
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
          <TouchableOpacity
            style={styles.addRow}
            onPress={handleAddExercises}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Add exercises from library"
          >
            <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
            <Text style={styles.addRowText}>
              {todayWorkout.exercises.length === 0 ? 'Add your first exercise' : 'Add from library'}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="barbell-outline" size={30} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyText}>{emptyCopy.title}</Text>
          <Text style={styles.emptySubtext}>{emptyCopy.sub}</Text>
          <TouchableOpacity
            style={styles.emptyAction}
            onPress={goBackToPlan}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Open the Plan tab"
          >
            <Text style={styles.emptyActionText}>Go to Plan</Text>
          </TouchableOpacity>
        </View>
      )}

      {startCtaVisible && (
        <View style={[styles.startCtaWrap, { bottom: tabBarInset + spacing.md }]}>
          <Button title="Start Workout" onPress={handleStartWorkout} style={styles.startButton} />
        </View>
      )}

      {toast ? (
        <View
          style={[
            styles.toastWrap,
            {
              bottom:
                tabBarInset + spacing.md + (startCtaVisible ? START_CTA_HEIGHT + spacing.md : 0),
            },
          ]}
          pointerEvents="none"
        >
          <View style={styles.toastPill}>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
