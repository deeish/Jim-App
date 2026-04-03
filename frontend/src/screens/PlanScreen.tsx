import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../types/navigation';
import { useTheme } from '../theme/ThemeContext';
import { getCurrentPlanWithWeekly, getCurrentPlan, removePlanSlot } from '../services/planService';
import type { ApiPlan, ApiPlanExercise, ApiPlanWorkout } from '../services/planService';
import type { Workout } from '../types/workout';
import { materializePlanSlotWorkout } from '../services/workoutService';
import LoadingSpinner from '../components/LoadingSpinner';
import SavedWorkoutsScreen from './SavedWorkoutsScreen';
import {
  formatLocalYmd,
  getCalendarWeekRange,
  normalizePlanAnchorYmd,
  programWeekForCalendarOffset,
} from '../lib/planCalendar';
import { navigateFromPlanToExerciseDetail, isLinkableLibraryExerciseId } from '../lib/exerciseNavigation';

type PlanScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Plan'>;

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

type Intensity = 'Easy' | 'Medium' | 'Hard';
type WorkoutType = 'strength' | 'cardio' | 'recovery';

interface PlanWorkout {
  id: string;
  title: string;
  detailLine: string; // structure or goal only, no time/intensity — e.g. "4x 200m", "Push focus"
  iconColor: string;
  durationMinutes: number;
  intensity: Intensity;
  type: WorkoutType;
  source?: 'manual' | 'ai'; // Track where workout came from
  locked?: boolean; // Lock this workout/day from regeneration
  draftId?: string; // Link to draft if this is from a draft
  /** Exercises stored on the plan slot (API); used when no linked Workout row yet. */
  planExercises?: ApiPlanExercise[];
}

function formatWeekRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}

function getDateForDay(weekIndex: number, dayName: string): Date {
  const { start } = getCalendarWeekRange(weekIndex);
  const dayIndex = DAYS_OF_WEEK.indexOf(dayName);
  const d = new Date(start);
  d.setDate(d.getDate() + dayIndex);
  return d;
}

function isTodayDate(d: Date): boolean {
  const today = new Date();
  return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
}

const ICON_COLORS: Record<string, string> = {
  strength: '#C7A46A',
  cardio: '#E67E22',
  recovery: '#9B59B6',
};

function apiSlotToPlanWorkout(pw: ApiPlanWorkout): PlanWorkout {
  return {
    id: pw.id,
    title: pw.title,
    detailLine: pw.detailLine ?? '—',
    iconColor: ICON_COLORS[pw.type] ?? '#95A5A6',
    durationMinutes: pw.durationMinutes,
    intensity: (pw.intensity as Intensity) ?? 'Easy',
    type: pw.type as WorkoutType,
    source: 'ai',
    planExercises: pw.exercises?.length ? pw.exercises : undefined,
  };
}

function planWorkoutsToByWeek(planWorkouts: ApiPlanWorkout[]): Record<number, Record<string, PlanWorkout[]>> {
  const byWeek: Record<number, Record<string, PlanWorkout[]>> = {};
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const weeks = [...new Set(planWorkouts.map((pw) => pw.weekNumber))];
  weeks.forEach((week) => {
    byWeek[week] = {};
    days.forEach((d) => { byWeek[week][d] = []; });
  });
  planWorkouts
    .slice()
    .sort((a, b) => a.orderInDay - b.orderInDay)
    .forEach((pw) => {
      if (!byWeek[pw.weekNumber]) {
        byWeek[pw.weekNumber] = {};
        days.forEach((d) => { byWeek[pw.weekNumber][d] = []; });
      }
      byWeek[pw.weekNumber][pw.dayOfWeek].push(apiSlotToPlanWorkout(pw));
    });
  return byWeek;
}

function computeLoadBalance(plan: Record<string, PlanWorkout[]>): { strength: number; cardio: number; recovery: number } {
  let strength = 0, cardio = 0, recovery = 0;
  DAYS_OF_WEEK.forEach(day => {
    (plan[day] || []).forEach(w => {
      if (w.type === 'strength') strength++;
      else if (w.type === 'cardio') cardio++;
      else recovery++;
    });
  });
  return { strength, cardio, recovery };
}

type Props = {
  navigation?: PlanScreenNavigationProp;
};

const EMPTY_PLAN: Record<string, PlanWorkout[]> = {
  Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], Sunday: [],
};

export default function PlanScreen({ navigation: navigationProp }: Props) {
  const navFromHook = useNavigation<PlanScreenNavigationProp>();
  const navigation = navigationProp ?? navFromHook;
  const route = useRoute<RouteProp<RootStackParamList, 'PlanList'>>();
  const { colors } = useTheme();
  const [selectedWeek, setSelectedWeek] = useState(0);
  const [planByWeek, setPlanByWeek] = useState<Record<number, Record<string, PlanWorkout[]>>>({});
  const [planLoading, setPlanLoading] = useState(true);
  const [planError, setPlanError] = useState<string | null>(null);
  const [contextWorkout, setContextWorkout] = useState<{ workout: PlanWorkout; day: string } | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [weeklyWorkouts, setWeeklyWorkouts] = useState<Workout[]>([]);
  const [savedModalVisible, setSavedModalVisible] = useState(false);
  const [detailSheetWorkout, setDetailSheetWorkout] = useState<{ workout: PlanWorkout; day: string; date: Date } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ slotId: string; day: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<ApiPlan | null>(null);
  const [startWorkoutLoading, setStartWorkoutLoading] = useState(false);
  const contentScrollRef = React.useRef<ScrollView>(null);

  const loadPlan = useCallback(async () => {
    setPlanLoading(true);
    setPlanError(null);
    try {
      const { plan: apiPlan, weeklyWorkouts: weekly } = await getCurrentPlanWithWeekly();
      setCurrentPlan(apiPlan ?? null);
      if (apiPlan?.planWorkouts?.length) {
        setPlanByWeek(planWorkoutsToByWeek(apiPlan.planWorkouts));
      } else {
        setPlanByWeek({});
      }
      setWeeklyWorkouts(weekly ?? []);
    } catch (err: any) {
      console.error('Failed to load plan:', err);
      const status = err.response?.status;
      const message =
        status === 401
          ? 'Session expired. You’ll be signed out — sign in again.'
          : err.message === 'Network Error' || !err.response
            ? 'Could not reach the server. Is the backend running?'
            : 'Could not load plan. Try again.';
      setPlanError(message);
      setPlanByWeek({});
    } finally {
      setPlanLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPlan();
      if (route.params?.openSaved) {
        setSavedModalVisible(true);
        navigation.setParams({ openSaved: undefined } as any);
      }
      return () => {
        setSavedModalVisible(false);
      };
    }, [loadPlan, route.params?.openSaved, navigation])
  );

  const maxPlanWeek = useMemo(() => {
    const list = currentPlan?.planWorkouts;
    if (!list?.length) return 0;
    return Math.max(...list.map((pw) => pw.weekNumber), 0);
  }, [currentPlan?.planWorkouts]);

  const anchorYmd = useMemo(
    () => normalizePlanAnchorYmd(currentPlan?.weekAnchorMonday),
    [currentPlan?.weekAnchorMonday],
  );

  const resolvedProgramWeek = useMemo(
    () => programWeekForCalendarOffset(selectedWeek, anchorYmd, maxPlanWeek),
    [selectedWeek, anchorYmd, maxPlanWeek],
  );

  const plan = useMemo(() => {
    if (resolvedProgramWeek === null) return EMPTY_PLAN;
    return planByWeek[resolvedProgramWeek] ?? EMPTY_PLAN;
  }, [planByWeek, resolvedProgramWeek]);

  const weekRange = getCalendarWeekRange(selectedWeek);
  const loadBalance = computeLoadBalance(plan);
  const headerSubtitle = useMemo(() => {
    const parts: string[] = [];
    if (loadBalance.strength) parts.push(`${loadBalance.strength} strength`);
    if (loadBalance.cardio) parts.push(`${loadBalance.cardio} cardio`);
    if (loadBalance.recovery) parts.push(`${loadBalance.recovery} recovery`);
    return parts.length ? parts.join(', ') : null;
  }, [loadBalance.strength, loadBalance.cardio, loadBalance.recovery]);
  const isCurrentWeek = selectedWeek === 0;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        header: {
          backgroundColor: colors.surface,
          padding: 12,
          paddingTop: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        headerTop: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
        },
        headerTitles: { flex: 1 },
        headerTitle: { fontSize: 22, fontWeight: 'bold', color: colors.text },
        goalContext: { fontSize: 12, color: colors.primary, marginTop: 2, fontWeight: '600' },
        detailsToggle: { marginTop: 8, paddingVertical: 6, paddingHorizontal: 4 },
        detailsToggleContent: { flexDirection: 'row', alignItems: 'center' },
        detailsToggleText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
        detailsToggleIcon: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
        ctaRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
        historyLabelButton: { paddingVertical: 8, paddingHorizontal: 12 },
        historyLabelText: { fontSize: 14, fontWeight: '600' },
        ctaCompact: {
          backgroundColor: colors.primary,
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 8,
          minWidth: 64,
          alignItems: 'center',
        },
        ctaSecondary: {
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        },
        ctaCompactText: { fontSize: 13, fontWeight: '600', color: colors.background },
        ctaCompactTextSecondary: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
        weekRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          paddingVertical: 6,
          paddingHorizontal: 12,
        },
        weekNavArrow: { padding: 4, minWidth: 32, alignItems: 'center' },
        weekNavArrowText: { fontSize: 20, color: colors.primary, fontWeight: '600' },
        weekNavCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
        weekNavLabel: { fontSize: 13, color: colors.text, fontWeight: '600' },
        outOfProgramWeekBanner: {
          paddingVertical: 8,
          paddingHorizontal: 12,
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        outOfProgramWeekText: { fontSize: 12, color: colors.textSecondary, textAlign: 'center' },
        content: { flex: 1 },
        contentContainer: { padding: 12, paddingBottom: 32 },
        daySection: { marginBottom: 18 },
        dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
        dayTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
        dayTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
        todayChip: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.secondary,
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 6,
          gap: 4,
        },
        todayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.background },
        todayText: { fontSize: 11, fontWeight: '600', color: colors.background },
        daySummaryContainer: { alignItems: 'flex-end' },
        daySummaryRow: { flexDirection: 'row', alignItems: 'baseline' },
        daySummary: { fontSize: 12, color: colors.text, fontWeight: '600' },
        dayHelperText: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },
        emptyDay: {
          backgroundColor: colors.surface,
          borderRadius: 12,
          padding: 20,
          borderWidth: 1,
          borderColor: colors.border,
          borderStyle: 'dashed',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        },
        emptyDayAddIcon: { fontSize: 20, color: colors.primary, fontWeight: '600' },
        emptyDayText: { fontSize: 15, color: colors.primary, fontWeight: '600' },
        emptyDayHint: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 4 },
        restDayCard: { opacity: 0.7 },
        workoutStack: { gap: 12 },
        workoutStackTight: { gap: 6 },
        workoutCard: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderRadius: 12,
          padding: 12,
          paddingRight: 12,
          elevation: 2,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          position: 'relative',
        },
        workoutCardPressed: { opacity: 0.85 },
        workoutIcon: {
          width: 44,
          height: 44,
          borderRadius: 8,
          marginRight: 12,
          justifyContent: 'center',
          alignItems: 'center',
        },
        workoutTypeBadge: { fontSize: 16, fontWeight: '700', color: colors.background },
        workoutContent: { flex: 1 },
        workoutTitle: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 2 },
        workoutDetailLine: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
        moreButton: { position: 'absolute', top: 8, right: 8, padding: 4 },
        moreButtonText: { fontSize: 18, color: colors.textMuted, fontWeight: '700' },
        menuOverlay: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        },
        menuBox: {
          backgroundColor: colors.surface,
          borderRadius: 12,
          width: '100%',
          maxWidth: 320,
          overflow: 'hidden',
        },
        menuItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
        menuItemText: { fontSize: 16, color: colors.text },
        menuItemTextMuted: { fontSize: 16, color: colors.textMuted },
        menuItemDanger: { color: colors.error },
        moveOverlay: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        },
        moveBox: {
          backgroundColor: colors.surface,
          borderRadius: 12,
          width: '100%',
          maxWidth: 320,
          overflow: 'hidden',
        },
        moveTitle: { fontSize: 18, fontWeight: '700', color: colors.text, padding: 16, paddingBottom: 8 },
        moveDayItem: { padding: 14, paddingLeft: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
        moveDayText: { fontSize: 16, color: colors.text },
        moveCancel: { padding: 16, alignItems: 'center' },
        moveCancelText: { fontSize: 16, color: colors.textMuted },
        detailSheetBox: {
          backgroundColor: colors.surface,
          borderRadius: 16,
          width: '100%',
          maxWidth: 380,
          maxHeight: '85%',
          overflow: 'hidden',
        },
        detailSheetScroll: { maxHeight: 400 },
        detailSheetTitleRow: { paddingHorizontal: 20, paddingTop: 20 },
        detailSheetTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
        detailSheetMeta: { fontSize: 14, color: colors.textSecondary, paddingHorizontal: 20, paddingTop: 8 },
        detailSheetDetail: { fontSize: 15, color: colors.textTertiary, paddingHorizontal: 20, paddingTop: 4 },
        detailSheetReasoning: {
          marginTop: 16,
          paddingHorizontal: 20,
          paddingVertical: 12,
          backgroundColor: colors.background,
          borderRadius: 12,
          marginHorizontal: 20,
        },
        detailSheetReasoningLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
        detailSheetReasoningText: { fontSize: 15, color: colors.text, lineHeight: 22 },
        detailSheetExercises: { marginTop: 16, paddingHorizontal: 20, paddingBottom: 12 },
        detailSheetExercisesLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
        detailSheetExerciseRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
        detailSheetExerciseName: { fontSize: 16, fontWeight: '600', color: colors.text },
        detailSheetExerciseMeta: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
        detailSheetExerciseNotes: { fontSize: 13, color: colors.textTertiary, fontStyle: 'italic', marginTop: 4 },
        detailSheetNoExercises: { fontSize: 14, color: colors.textTertiary, fontStyle: 'italic', paddingHorizontal: 20, marginTop: 12 },
        detailSheetActions: { flexDirection: 'row', gap: 12, padding: 20, paddingTop: 16, flexWrap: 'wrap' },
        detailSheetPrimary: {
          flex: 1,
          backgroundColor: colors.primary,
          paddingVertical: 14,
          borderRadius: 10,
          alignItems: 'center',
        },
        detailSheetPrimaryText: { fontSize: 16, fontWeight: '600', color: colors.background },
        detailSheetSecondary: {
          flex: 1,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          paddingVertical: 14,
          borderRadius: 10,
          alignItems: 'center',
        },
        detailSheetSecondaryText: { fontSize: 16, fontWeight: '600', color: colors.text },
      }),
    [colors]
  );

  const resolveWorkoutForPlanSlot = useCallback(
    (planSlotId: string): Workout | undefined =>
      weeklyWorkouts.find((w) => w.planWorkoutId === planSlotId),
    [weeklyWorkouts]
  );

  const handleCardPress = useCallback(
    (workout: PlanWorkout, day: string) => {
      const dayDate = getDateForDay(selectedWeek, day);
      if (workout.title === 'Rest Day') {
        setDetailSheetWorkout({ workout, day, date: dayDate });
        return;
      }
      // Always open detail sheet so user sees exercises + reasoning, then can View full or Start
      setDetailSheetWorkout({ workout, day, date: dayDate });
    },
    [selectedWeek]
  );

  const closeDetailSheet = useCallback(() => setDetailSheetWorkout(null), []);

  const handleStartWorkout = useCallback(async () => {
    if (!detailSheetWorkout) return;
    const slotId = detailSheetWorkout.workout.id;
    const linkedWorkout = resolveWorkoutForPlanSlot(slotId);
    const tabNav = (navigation as any)?.getParent?.();
    const apiSlot = currentPlan?.planWorkouts?.find((p) => p.id === slotId);
    const planExerciseCount =
      (apiSlot?.exercises?.length ?? 0) || (detailSheetWorkout.workout.planExercises?.length ?? 0);

    if (linkedWorkout?.id) {
      closeDetailSheet();
      tabNav?.navigate('Workout', { workoutId: linkedWorkout.id, fromPlan: true });
      return;
    }

    if (!planExerciseCount) {
      Alert.alert(
        'No exercises yet',
        'Regenerate your plan with AI Generate, or add exercises from the library for this day.',
      );
      return;
    }

    try {
      setStartWorkoutLoading(true);
      const w = await materializePlanSlotWorkout(slotId);
      await loadPlan();
      closeDetailSheet();
      tabNav?.navigate('Workout', { workoutId: w.id, fromPlan: true });
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      Alert.alert('Could not start workout', typeof msg === 'string' ? msg : err?.message ?? 'Try again.');
    } finally {
      setStartWorkoutLoading(false);
    }
  }, [
    detailSheetWorkout,
    resolveWorkoutForPlanSlot,
    currentPlan?.planWorkouts,
    loadPlan,
    closeDetailSheet,
    navigation,
  ]);

  const openContextMenu = useCallback((workout: PlanWorkout, day: string, e?: any) => {
    setContextWorkout({ workout, day });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextWorkout(null);
  }, []);

  const handleViewWorkoutFromMenu = useCallback(() => {
    if (!contextWorkout) return;
    const linkedWorkout = resolveWorkoutForPlanSlot(contextWorkout.workout.id);
    closeContextMenu();
    if (linkedWorkout) {
      navigation.navigate('WorkoutDetail', { workoutId: linkedWorkout.id });
    } else {
      const dayDate = getDateForDay(selectedWeek, contextWorkout.day);
      setDetailSheetWorkout({ workout: contextWorkout.workout, day: contextWorkout.day, date: dayDate });
    }
  }, [contextWorkout, closeContextMenu, resolveWorkoutForPlanSlot, navigation, selectedWeek]);

  const handleAddExercisesFromMenu = useCallback(() => {
    if (!contextWorkout) return;
    const linkedWorkout = resolveWorkoutForPlanSlot(contextWorkout.workout.id);
    closeContextMenu();
    if (linkedWorkout) {
      const tabNav = (navigation as any)?.getParent?.();
      if (tabNav) {
        tabNav.navigate('Search', {
          screen: 'SearchList',
          params: {
            addToWorkout: {
              workoutId: linkedWorkout.id,
              workoutName: linkedWorkout.name,
              existingExerciseIds: (linkedWorkout.exercises || [])
                .map(e => e.exerciseId)
                .filter((id): id is string => !!id),
            },
          },
        });
      }
    } else {
      Alert.alert('No workout yet', 'This slot doesn\'t have exercises yet. Tap the card to view details.');
    }
  }, [contextWorkout, closeContextMenu, resolveWorkoutForPlanSlot, navigation]);

  const handleDeleteFromMenu = useCallback(() => {
    if (!contextWorkout) return;
    const { workout: planWorkout, day } = contextWorkout;
    closeContextMenu();
    setDeleteConfirm({ slotId: planWorkout.id, day, title: planWorkout.title });
  }, [contextWorkout, closeContextMenu]);

  const closeDeleteConfirm = useCallback(() => {
    if (!deleting) setDeleteConfirm(null);
  }, [deleting]);

  const handleConfirmRemove = useCallback(async () => {
    if (!deleteConfirm) return;
    const { slotId, day, title } = deleteConfirm;
    setDeleting(true);
    try {
      const plan = await getCurrentPlan();
      if (!plan?.id) {
        Alert.alert('Error', 'Could not load plan. Try again.');
        setDeleteConfirm(null);
        return;
      }
      await removePlanSlot(plan.id, slotId);
      setDeleteConfirm(null);
      await loadPlan();
    } catch (err: any) {
      console.error('[PlanScreen] Delete failed:', err);
      Alert.alert(
        'Error',
        err.response?.data?.message ?? err.message ?? 'Could not remove workout.'
      );
    } finally {
      setDeleting(false);
    }
  }, [deleteConfirm, loadPlan]);

  const handleAddWorkoutForDay = useCallback(
    (day: string) => {
      const tabNav = (navigation as any)?.getParent?.();
      if (tabNav) {
        const weekMondayIso = formatLocalYmd(getCalendarWeekRange(selectedWeek).start);
        tabNav.navigate('Search', {
          screen: 'SearchList',
          params: {
            addToPlan: {
              day,
              weekIndex: selectedWeek,
              weekMondayIso,
            },
          },
        });
      }
    },
    [navigation, selectedWeek]
  );

  const handleAIGenerate = useCallback(() => {
    navigation.navigate('GeneratePlan');
  }, [navigation]);

  const jumpToCurrentWeek = useCallback(() => {
    setSelectedWeek(0);
    contentScrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  const formatWorkoutDetailLine = (workout: PlanWorkout): string => {
    let detail = workout.detailLine;
    
    // Replace · with • for consistency
    detail = detail.replace(/·/g, '•');
    
    // Card consistency: Show structured descriptor only (no duration - that's in day header)
    // Card = specifics (zone/intervals/exercise count)
    // Day header = totals (time, sessions, difficulty)
    
    if (workout.type === 'cardio') {
      // Cardio: Zone 2 / Intervals • 6×1 min hard
      // Don't add duration - it's already in day header totals
      // Keep only structured info: zone type, interval structure, etc.
    } else if (workout.type === 'strength') {
      // Strength: 6 exercises • Push focus
      // Keep exercise count and focus - no duration
    } else if (workout.type === 'recovery') {
      // Recovery: Stretch / Mobility
      // Keep activity type - no duration (in day header)
    }
    
    return detail;
  };

  const getWorkoutTypeLabel = (type: WorkoutType): string => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const getDaySummary = (workouts: PlanWorkout[]): string => {
    if (workouts.length === 0) return 'Rest (no time)';
    const totalMin = workouts.reduce((s, w) => s + w.durationMinutes, 0);
    const sessionCount = workouts.length;
    
    // Check if it's a rest day
    if (workouts.length === 1 && workouts[0]?.title === 'Rest Day') {
      return 'Rest (no time)';
    }
    
    // Filter out rest days for intensity calculation
    const activeWorkouts = workouts.filter(w => w.title !== 'Rest Day');
    if (activeWorkouts.length === 0) {
      return 'Rest (no time)';
    }
    
    const intensityLabel = activeWorkouts.some(w => w.intensity === 'Hard') ? 'Hard' : activeWorkouts.some(w => w.intensity === 'Medium') ? 'Medium' : 'Easy';
    
    return `${totalMin} min • ${sessionCount} ${sessionCount === 1 ? 'session' : 'sessions'} • ${intensityLabel}`;
  };

  if (planLoading) {
    return <LoadingSpinner />;
  }

  if (planError) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
        <Text style={[styles.headerTitle, { color: colors.text, marginBottom: 8 }]}>{planError}</Text>
        <TouchableOpacity onPress={loadPlan} style={{ padding: 12, backgroundColor: colors.primary, borderRadius: 8 }}>
          <Text style={{ color: colors.background, fontWeight: '600' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Dynamic header: plan name + optional subtitle from load balance */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerTitles}>
            <Text style={styles.headerTitle}>{currentPlan?.name ?? 'My Plan'}</Text>
            {headerSubtitle ? (
              <Text style={styles.goalContext}>{headerSubtitle}</Text>
            ) : null}
          </View>
          <View style={styles.ctaRow}>
            <TouchableOpacity
              style={styles.historyLabelButton}
              onPress={() => navigation.navigate('History')}
              accessibilityLabel="Workout history"
            >
              <Text style={[styles.historyLabelText, { color: colors.primary }]}>History</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.historyLabelButton}
              onPress={() => setSavedModalVisible(true)}
              accessibilityLabel="Saved workouts"
            >
              <Text style={[styles.historyLabelText, { color: colors.primary }]}>Saved workouts</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.ctaCompact, styles.ctaSecondary]} onPress={handleAIGenerate}>
              <Text style={styles.ctaCompactTextSecondary}>AI Generate</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        {/* Collapsible Details section */}
        <TouchableOpacity
          style={styles.detailsToggle}
          onPress={() => setShowDetails(!showDetails)}
          activeOpacity={0.7}
        >
          <View style={styles.detailsToggleContent}>
            <Text style={styles.detailsToggleText}>
              Details ({loadBalance.strength} Strength • {loadBalance.cardio} Cardio • {loadBalance.recovery} Recovery)
            </Text>
            <Text style={styles.detailsToggleIcon}>{showDetails ? ' ▾' : ' ▸'}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Tight week navigation: ‹ Week of Jan 26 – Feb 1 › */}
      <View style={styles.weekRow}>
        <TouchableOpacity style={styles.weekNavArrow} onPress={() => setSelectedWeek(Math.max(0, selectedWeek - 1))}>
          <Text style={styles.weekNavArrowText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.weekNavCenter}>
          <Text style={styles.weekNavLabel}>Week of {formatWeekRange(weekRange.start, weekRange.end)}</Text>
        </View>
        <TouchableOpacity style={styles.weekNavArrow} onPress={() => setSelectedWeek(Math.min(7, selectedWeek + 1))}>
          <Text style={styles.weekNavArrowText}>›</Text>
        </TouchableOpacity>
      </View>

      {resolvedProgramWeek === null && maxPlanWeek > 0 ? (
        <View style={styles.outOfProgramWeekBanner}>
          <Text style={styles.outOfProgramWeekText}>
            {anchorYmd
              ? 'No workouts for this calendar week — it is before your program start or after the last program week.'
              : 'No workouts mapped to this week for your plan.'}
          </Text>
        </View>
      ) : null}

      {/* Days list */}
      <ScrollView
        ref={contentScrollRef}
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {DAYS_OF_WEEK.map(day => {
          const workouts = plan[day] || [];
          const dayDate = getDateForDay(selectedWeek, day);
          const isToday = isTodayDate(dayDate);
          const daySummaryText = getDaySummary(workouts);

          return (
            <View key={day} style={styles.daySection}>
              <View style={styles.dayHeader}>
                <View style={styles.dayTitleRow}>
                  <Text style={styles.dayTitle}>{day}</Text>
                  {isToday && (
                    <View style={styles.todayChip}>
                      <View style={styles.todayDot} />
                      <Text style={styles.todayText}>Today</Text>
                    </View>
                  )}
                </View>
                <View style={styles.daySummaryContainer}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <TouchableOpacity
                      onPress={() => handleAddWorkoutForDay(day)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={[styles.dayHelperText, { color: colors.primary, fontWeight: '600' }]}>+ Add</Text>
                    </TouchableOpacity>
                    <View style={styles.daySummaryRow}>
                      <Text style={styles.daySummary}>{daySummaryText}</Text>
                      {workouts.length > 1 && (
                        <Text style={styles.dayHelperText}> • {workouts.length} workouts</Text>
                      )}
                    </View>
                  </View>
                </View>
              </View>

              {workouts.length === 0 ? (
                <TouchableOpacity
                  style={styles.emptyDay}
                  onPress={() => handleAddWorkoutForDay(day)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.emptyDayAddIcon}>+</Text>
                  <Text style={styles.emptyDayText}>Add workout</Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.workoutStack, workouts.length > 1 && styles.workoutStackTight]}>
                  {workouts.map((workout) => {
                    const isRestDay = workout.title === 'Rest Day';
                    const showMoreButton = true; // Show overflow on every workout card
                    
                    // Render rest day as a normal card (matching visual language)
                    if (isRestDay) {
                      return (
                        <Pressable
                          key={workout.id}
                          style={({ pressed }) => [styles.workoutCard, styles.restDayCard, pressed && styles.workoutCardPressed]}
                          onPress={() => handleCardPress(workout, day)}
                        >
                          <View style={[styles.workoutIcon, { backgroundColor: workout.iconColor }]}>
                            <Text style={styles.workoutTypeBadge}>R</Text>
                          </View>
                          <View style={styles.workoutContent}>
                            <Text style={styles.workoutTitle}>Rest Day</Text>
                            <Text style={styles.workoutDetailLine}>Off / Optional walk</Text>
                          </View>
                          {showMoreButton && (
                            <TouchableOpacity
                              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                              style={styles.moreButton}
                              onPress={() => openContextMenu(workout, day)}
                            >
                              <Text style={styles.moreButtonText}>⋯</Text>
                            </TouchableOpacity>
                          )}
                        </Pressable>
                      );
                    }
                    
                    return (
                      <Pressable
                        key={workout.id}
                        style={({ pressed }) => [styles.workoutCard, pressed && styles.workoutCardPressed]}
                        onPress={() => handleCardPress(workout, day)}
                      >
                        <View style={[styles.workoutIcon, { backgroundColor: workout.iconColor }]}>
                          <Text style={styles.workoutTypeBadge}>{getWorkoutTypeLabel(workout.type).charAt(0)}</Text>
                        </View>
                        <View style={styles.workoutContent}>
                          <Text style={styles.workoutTitle}>{workout.title}</Text>
                          <Text style={styles.workoutDetailLine}>
                            {formatWorkoutDetailLine(workout)}
                          </Text>
                        </View>
                        {showMoreButton && (
                          <TouchableOpacity
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                            style={styles.moreButton}
                            onPress={() => openContextMenu(workout, day)}
                          >
                            <Text style={styles.moreButtonText}>⋯</Text>
                          </TouchableOpacity>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Context menu modal (⋯ overflow) */}
      <Modal visible={!!contextWorkout} transparent animationType="fade">
        <Pressable style={styles.menuOverlay} onPress={closeContextMenu}>
          <View style={styles.menuBox}>
            <TouchableOpacity style={styles.menuItem} onPress={handleViewWorkoutFromMenu}>
              <Text style={styles.menuItemText}>View workout</Text>
            </TouchableOpacity>
            {contextWorkout && contextWorkout.workout.title !== 'Rest Day' && (
              <TouchableOpacity style={styles.menuItem} onPress={handleAddExercisesFromMenu}>
                <Text style={styles.menuItemText}>Add exercises</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.menuItem} onPress={handleDeleteFromMenu}>
              <Text style={[styles.menuItemText, styles.menuItemDanger]}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={closeContextMenu}>
              <Text style={styles.menuItemTextMuted}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Delete confirmation modal (in-app so Remove works on web) */}
      <Modal visible={!!deleteConfirm} transparent animationType="fade">
        <Pressable style={styles.menuOverlay} onPress={closeDeleteConfirm}>
          {deleteConfirm && (
            <Pressable style={styles.menuBox} onPress={(e) => e.stopPropagation()}>
              <Text style={[styles.menuItemText, { padding: 16, paddingBottom: 8 }]}>
                Remove "{deleteConfirm.title}" from {deleteConfirm.day}?
              </Text>
              <Text style={[styles.menuItemTextMuted, { paddingHorizontal: 16, paddingBottom: 16 }]}>
                This cannot be undone.
              </Text>
              <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
                <TouchableOpacity
                  style={[styles.menuItem, { flex: 1 }]}
                  onPress={closeDeleteConfirm}
                  disabled={deleting}
                >
                  <Text style={styles.menuItemTextMuted}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.menuItem, { flex: 1 }]}
                  onPress={handleConfirmRemove}
                  disabled={deleting}
                >
                  {deleting ? (
                    <ActivityIndicator size="small" color={colors.error} />
                  ) : (
                    <Text style={[styles.menuItemText, styles.menuItemDanger]}>Remove</Text>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
          )}
        </Pressable>
      </Modal>

      {/* Workout detail sheet: reasoning, exercises, and actions */}
      <Modal visible={!!detailSheetWorkout} transparent animationType="fade">
        <Pressable style={styles.menuOverlay} onPress={closeDetailSheet}>
          {detailSheetWorkout && (() => {
            const linked = resolveWorkoutForPlanSlot(detailSheetWorkout.workout.id);
            const isRestDay = detailSheetWorkout.workout.title === 'Rest Day';
            const apiSlot = currentPlan?.planWorkouts?.find((p) => p.id === detailSheetWorkout.workout.id);
            const planLines = apiSlot?.exercises?.length
              ? apiSlot.exercises
              : detailSheetWorkout.workout.planExercises ?? [];
            const fromPlanRows = planLines
              .slice()
              .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
              .map((ex, idx) => ({
                id: ex.id,
                exerciseId: (ex as ApiPlanExercise).exerciseId,
                name: ex.name ?? 'Exercise',
                sets: ex.sets,
                reps: ex.reps,
                weight: ex.weight ?? undefined,
                notes: ex.notes ?? undefined,
                orderIndex: ex.orderIndex ?? idx,
              }));
            const displayExercises =
              linked?.exercises?.length ? linked.exercises : fromPlanRows;
            return (
              <Pressable style={styles.detailSheetBox} onPress={(e) => e.stopPropagation()}>
                <ScrollView style={styles.detailSheetScroll} showsVerticalScrollIndicator={false}>
                  <View style={styles.detailSheetTitleRow}>
                    <Text style={styles.detailSheetTitle}>{detailSheetWorkout.workout.title}</Text>
                  </View>
                  <Text style={styles.detailSheetMeta}>
                    {detailSheetWorkout.workout.type} • {detailSheetWorkout.workout.durationMinutes} min
                    {detailSheetWorkout.workout.intensity ? ` • ${detailSheetWorkout.workout.intensity}` : ''}
                  </Text>
                  <Text style={[styles.detailSheetDetail, { marginTop: 4 }]}>
                    {detailSheetWorkout.day} • {detailSheetWorkout.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>

                  {!isRestDay && linked && (linked.warmUp || linked.reasoning || linked.coolDown) ? (
                    <View style={styles.detailSheetReasoning}>
                      {linked.warmUp ? (
                        <>
                          <Text style={styles.detailSheetReasoningLabel}>Warm-up</Text>
                          <Text style={styles.detailSheetReasoningText}>{linked.warmUp}</Text>
                        </>
                      ) : null}
                      {linked.reasoning ? (
                        <>
                          <Text style={[styles.detailSheetReasoningLabel, linked.warmUp && { marginTop: 12 }]}>Why this workout</Text>
                          <Text style={styles.detailSheetReasoningText}>{linked.reasoning}</Text>
                        </>
                      ) : null}
                      {linked.coolDown ? (
                        <>
                          <Text style={[styles.detailSheetReasoningLabel, (linked.warmUp || linked.reasoning) && { marginTop: 12 }]}>Cool-down</Text>
                          <Text style={styles.detailSheetReasoningText}>{linked.coolDown}</Text>
                        </>
                      ) : null}
                    </View>
                  ) : null}

                  {!isRestDay && displayExercises.length > 0 ? (
                    <View style={styles.detailSheetExercises}>
                      <Text style={styles.detailSheetExercisesLabel}>Exercises</Text>
                      {displayExercises
                        .slice()
                        .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
                        .map((ex, idx) => {
                          const row = ex as typeof ex & { exerciseId?: string };
                          const libId = row.exerciseId;
                          const canOpenLibrary = isLinkableLibraryExerciseId(libId);
                          return (
                            <Pressable
                              key={ex.id ?? `ex-${idx}`}
                              style={({ pressed }) => [
                                styles.detailSheetExerciseRow,
                                canOpenLibrary && pressed ? { opacity: 0.75 } : null,
                              ]}
                              onPress={() => {
                                if (!canOpenLibrary) {
                                  Alert.alert(
                                    'Exercise details',
                                    `“${ex.name}” isn’t linked to the library yet. Open the Exercises tab and search by name.`,
                                  );
                                  return;
                                }
                                closeDetailSheet();
                                navigateFromPlanToExerciseDetail(navigation, libId!, 'calendar');
                              }}
                              accessibilityRole="button"
                              accessibilityLabel={
                                canOpenLibrary
                                  ? `View ${ex.name} in exercise library`
                                  : undefined
                              }
                            >
                              <Text style={styles.detailSheetExerciseName}>{ex.name}</Text>
                              <Text style={styles.detailSheetExerciseMeta}>
                                {ex.sets} × {ex.reps}
                                {ex.weight != null ? ` @ ${ex.weight} lb` : ''}
                              </Text>
                              {ex.notes ? (
                                <Text style={styles.detailSheetExerciseNotes}>Focus: {ex.notes}</Text>
                              ) : null}
                            </Pressable>
                          );
                        })}
                    </View>
                  ) : !isRestDay && displayExercises.length === 0 ? (
                    <Text style={styles.detailSheetNoExercises}>
                      No exercises for this session yet. Use AI Generate to build a plan, or add exercises from the library.
                    </Text>
                  ) : null}

                  {isRestDay ? (
                    <Text style={styles.detailSheetDetail}>Off / Optional walk</Text>
                  ) : null}
                </ScrollView>
                <View style={styles.detailSheetActions}>
                  <TouchableOpacity style={styles.detailSheetSecondary} onPress={closeDetailSheet}>
                    <Text style={styles.detailSheetSecondaryText}>Back</Text>
                  </TouchableOpacity>
                  {!isRestDay && linked && (
                    <TouchableOpacity
                      style={styles.detailSheetSecondary}
                      onPress={() => {
                        closeDetailSheet();
                        navigation.navigate('WorkoutDetail', { workoutId: linked.id });
                      }}
                    >
                      <Text style={styles.detailSheetSecondaryText}>View full workout</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[
                      styles.detailSheetPrimary,
                      (startWorkoutLoading || (!isRestDay && displayExercises.length === 0)) && { opacity: 0.6 },
                    ]}
                    onPress={isRestDay ? closeDetailSheet : () => void handleStartWorkout()}
                    disabled={!isRestDay && (startWorkoutLoading || displayExercises.length === 0)}
                  >
                    {startWorkoutLoading && !isRestDay ? (
                      <ActivityIndicator color={colors.background} />
                    ) : (
                      <Text style={styles.detailSheetPrimaryText}>
                        {isRestDay ? 'OK' : 'Start workout'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </Pressable>
            );
          })()}
        </Pressable>
      </Modal>

      {/* Saved workouts as a pop-up modal (not a stack screen) so switching tabs shows Plan again */}
      <Modal
        visible={savedModalVisible}
        animationType="slide"
        onRequestClose={() => setSavedModalVisible(false)}
      >
        <SavedWorkoutsScreen
          onClose={() => setSavedModalVisible(false)}
          onSelectWorkout={(workoutId) => {
            setSavedModalVisible(false);
            navigation.navigate('WorkoutDetail', { workoutId });
          }}
        />
      </Modal>
    </View>
  );
}
