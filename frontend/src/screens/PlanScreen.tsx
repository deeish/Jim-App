import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
import type { LayoutChangeEvent } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../types/navigation';
import { useTheme, planSlotIconColors } from '../theme';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import { formatAtWeightFromLb } from '../lib/weightDisplay';
import { getCurrentPlanWithWeekly, getCurrentPlan, removePlanSlot, movePlanSlot } from '../services/planService';
import type { ApiPlan, ApiPlanExercise, ApiPlanWorkout } from '../services/planService';
import type { Workout, WorkoutLog } from '../types/workout';
import { materializePlanSlotWorkout, getWorkoutLogs } from '../services/workoutService';
import LoadingSpinner from '../components/LoadingSpinner';
import SavedWorkoutsScreen from './SavedWorkoutsScreen';
import {
  formatLocalYmd,
  getCalendarWeekRange,
  getPlanCalendarWeekNavigationBounds,
  normalizePlanAnchorYmd,
  normalizePlanDayOfWeek,
  normalizeProgramWeekNumber,
  isRestPlanSlotTitle,
  programWeekForCalendarOffset,
  shiftWeekWorkouts,
} from '../lib/planCalendar';
import { navigateFromPlanToExerciseDetail, isLinkableLibraryExerciseId } from '../lib/exerciseNavigation';
import { getPlanSlotDisplayMinutes } from '../lib/estimateWorkoutMinutes';

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

function apiSlotToPlanWorkout(pw: ApiPlanWorkout, iconColors: Record<string, string>): PlanWorkout {
  return {
    id: pw.id,
    title: pw.title,
    detailLine: pw.detailLine ?? '—',
    iconColor: iconColors[pw.type] ?? iconColors.neutral,
    durationMinutes: pw.durationMinutes,
    intensity: (pw.intensity as Intensity) ?? 'Easy',
    type: pw.type as WorkoutType,
    source: 'ai',
    planExercises: pw.exercises?.length ? pw.exercises : undefined,
  };
}

function planWorkoutsToByWeek(
  planWorkouts: ApiPlanWorkout[],
  iconColors: Record<string, string>,
): Record<number, Record<string, PlanWorkout[]>> {
  const byWeek: Record<number, Record<string, PlanWorkout[]>> = {};
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const weeks = [...new Set(planWorkouts.map((pw) => normalizeProgramWeekNumber(pw.weekNumber)))];
  weeks.forEach((week) => {
    byWeek[week] = {};
    days.forEach((d) => { byWeek[week][d] = []; });
  });
  planWorkouts
    .slice()
    .sort((a, b) => a.orderInDay - b.orderInDay)
    .forEach((pw) => {
      const wn = normalizeProgramWeekNumber(pw.weekNumber);
      const day = normalizePlanDayOfWeek(pw.dayOfWeek);
      if (!day) return;
      if (!byWeek[wn]) {
        byWeek[wn] = {};
        days.forEach((d) => { byWeek[wn][d] = []; });
      }
      if (!byWeek[wn][day]) {
        byWeek[wn][day] = [];
      }
      byWeek[wn][day].push(apiSlotToPlanWorkout(pw, iconColors));
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

function findDayAtY(
  screenY: number,
  containerOffsetY: number,
  headerBottom: number,
  scrollOffset: number,
  dayLayouts: Record<string, { y: number; height: number }>,
): string | null {
  const contentY = screenY - containerOffsetY - headerBottom + scrollOffset;
  for (const day of DAYS_OF_WEEK) {
    const l = dayLayouts[day];
    if (l && contentY >= l.y && contentY <= l.y + l.height) return day;
  }
  return null;
}

const EMPTY_PLAN: Record<string, PlanWorkout[]> = {
  Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], Sunday: [],
};

export default function PlanScreen({ navigation: navigationProp }: Props) {
  const navFromHook = useNavigation<PlanScreenNavigationProp>();
  const navigation = navigationProp ?? navFromHook;
  const route = useRoute<RouteProp<RootStackParamList, 'PlanList'>>();
  const { colors } = useTheme();
  const { weightUnit } = useUserPreferences();
  const [selectedWeek, setSelectedWeek] = useState(0);
  const [planByWeek, setPlanByWeek] = useState<Record<number, Record<string, PlanWorkout[]>>>({});
  const [planLoading, setPlanLoading] = useState(true);
  const [planError, setPlanError] = useState<string | null>(null);
  const [contextWorkout, setContextWorkout] = useState<{ workout: PlanWorkout; day: string } | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [weeklyWorkouts, setWeeklyWorkouts] = useState<Workout[]>([]);
  const [savedModalVisible, setSavedModalVisible] = useState(false);
  const [detailSheetWorkout, setDetailSheetWorkout] = useState<{ workout: PlanWorkout; day: string; date: Date } | null>(null);
  const [moveContext, setMoveContext] = useState<{ workout: PlanWorkout; day: string } | null>(null);
  const [moving, setMoving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ slotId: string; day: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<ApiPlan | null>(null);
  const [startWorkoutLoading, setStartWorkoutLoading] = useState(false);
  const [detailSheetGuideExpanded, setDetailSheetGuideExpanded] = useState(false);
  const [shifting, setShifting] = useState(false);
  const contentScrollRef = React.useRef<ScrollView>(null);

  // --- Drag-and-drop ---
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const ghostOpacity = useSharedValue(0);
  const moreButtonActive = useSharedValue(false);

  const [draggingSlot, setDraggingSlot] = useState<{ workout: PlanWorkout; day: string } | null>(null);
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [weekLogs, setWeekLogs] = useState<WorkoutLog[]>([]);

  const containerRef       = useRef<View>(null);
  const containerOffsetRef = useRef({ x: 0, y: 0 });
  const headerBottomRef    = useRef(0);
  const scrollOffsetRef    = useRef(0);
  const dayLayoutsRef      = useRef<Record<string, { y: number; height: number }>>({});
  const draggingSlotRef        = useRef<{ workout: PlanWorkout; day: string } | null>(null);
  const hoveredDayRef          = useRef<string | null>(null);
  const planByWeekRef          = useRef(planByWeek);
  const resolvedProgramWeekRef = useRef<number | null>(null);

  useEffect(() => { draggingSlotRef.current = draggingSlot; }, [draggingSlot]);
  useEffect(() => { hoveredDayRef.current = hoveredDay; }, [hoveredDay]);
  useEffect(() => { planByWeekRef.current = planByWeek; }, [planByWeek]);
  // --- End drag-and-drop ---

  useEffect(() => {
    setDetailSheetGuideExpanded(false);
  }, [detailSheetWorkout?.workout.id]);

  const loadPlan = useCallback(async () => {
    setPlanLoading(true);
    setPlanError(null);
    try {
      const { plan: apiPlan, weeklyWorkouts: weekly } = await getCurrentPlanWithWeekly();
      setCurrentPlan(apiPlan ?? null);
      if (apiPlan?.planWorkouts?.length) {
        setPlanByWeek(planWorkoutsToByWeek(apiPlan.planWorkouts, planSlotIconColors(colors)));
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
  }, [colors]);

  const loadWeekLogs = useCallback(async (weekIndex: number) => {
    try {
      const { start, end } = getCalendarWeekRange(weekIndex);
      const logs = await getWorkoutLogs({
        from: formatLocalYmd(start),
        to: formatLocalYmd(end),
      });
      setWeekLogs(logs.filter(l => l.completedAt != null));
    } catch {
      // graceful degradation — cards show no completion badges on error
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

  useFocusEffect(
    useCallback(() => {
      loadWeekLogs(selectedWeek);
    }, [loadWeekLogs, selectedWeek])
  );

  useEffect(() => {
    loadWeekLogs(selectedWeek);
  }, [selectedWeek, loadWeekLogs]);

  const maxPlanWeek = useMemo(() => {
    const list = currentPlan?.planWorkouts;
    if (!list?.length) return 0;
    return Math.max(...list.map((pw) => normalizeProgramWeekNumber(pw.weekNumber)), 1);
  }, [currentPlan?.planWorkouts]);

  const anchorYmd = useMemo(
    () => normalizePlanAnchorYmd(currentPlan?.weekAnchorMonday),
    [currentPlan?.weekAnchorMonday],
  );

  const weekNavBounds = useMemo(() => getPlanCalendarWeekNavigationBounds(anchorYmd), [anchorYmd]);

  useEffect(() => {
    setSelectedWeek((w) => Math.max(weekNavBounds.min, Math.min(weekNavBounds.max, w)));
  }, [weekNavBounds.min, weekNavBounds.max]);

  const resolvedProgramWeek = useMemo(
    () => programWeekForCalendarOffset(selectedWeek, anchorYmd, maxPlanWeek),
    [selectedWeek, anchorYmd, maxPlanWeek],
  );
  useEffect(() => { resolvedProgramWeekRef.current = resolvedProgramWeek; }, [resolvedProgramWeek]);

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
  const detailsLoadSummary = useMemo(() => {
    const parts: string[] = [];
    if (loadBalance.strength) parts.push(`${loadBalance.strength} Strength`);
    if (loadBalance.cardio) parts.push(`${loadBalance.cardio} Cardio`);
    if (loadBalance.recovery) parts.push(`${loadBalance.recovery} Recovery`);
    return parts.length ? parts.join(' • ') : 'No sessions';
  }, [loadBalance.strength, loadBalance.cardio, loadBalance.recovery]);
  const isCurrentWeek = selectedWeek === 0;

  const weekSlots = resolvedProgramWeek !== null ? planByWeek[resolvedProgramWeek] : null;
  const canShiftBack = !!weekSlots && !weekSlots['Monday']?.length;
  const canShiftForward = !!weekSlots && !weekSlots['Sunday']?.length;
  const hasWorkoutsThisWeek = loadBalance.strength + loadBalance.cardio + loadBalance.recovery > 0;

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
          flexDirection: 'row',
          gap: 6,
        },
        ctaSecondary: {
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        },
        ctaCompactText: { fontSize: 13, fontWeight: '600', color: colors.onPrimary },
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
        weekNavArrowDisabled: { opacity: 0.35 },
        weekNavArrowText: { fontSize: 20, color: colors.primary, fontWeight: '600' },
        weekNavCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
        weekNavLabel: { fontSize: 13, color: colors.text, fontWeight: '600' },
        shiftRow: {
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 10,
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          paddingVertical: 6,
          paddingHorizontal: 12,
        },
        shiftBtn: {
          paddingHorizontal: 12,
          paddingVertical: 5,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.primary,
        },
        shiftBtnDisabled: { opacity: 0.35 },
        shiftBtnText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
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
        todayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.onPrimary },
        todayText: { fontSize: 11, fontWeight: '600', color: colors.onPrimary },
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
        workoutTypeBadge: { fontSize: 16, fontWeight: '700', color: colors.onPrimary },
        workoutContent: { flex: 1 },
        workoutTitle: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 2 },
        workoutDetailLine: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
        moreButton: { position: 'absolute', top: 8, right: 8, padding: 4 },
        moreButtonText: { fontSize: 18, color: colors.textMuted, fontWeight: '700' },
        menuOverlay: {
          flex: 1,
          backgroundColor: colors.scrim,
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
          backgroundColor: colors.scrim,
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
        detailSheetOverlay: {
          flex: 1,
          backgroundColor: colors.overlay,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        },
        detailSheetBox: {
          backgroundColor: colors.surface,
          borderRadius: 20,
          width: '100%',
          maxWidth: 400,
          maxHeight: '88%',
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.45,
          shadowRadius: 28,
          elevation: 16,
        },
        detailSheetScroll: { flexGrow: 0, maxHeight: 420 },
        detailSheetScrollContent: { paddingBottom: 12 },
        detailSheetTitleRow: {
          paddingHorizontal: 22,
          paddingTop: 22,
          paddingBottom: 4,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        detailSheetTitle: { fontSize: 22, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
        detailSheetMeta: {
          fontSize: 14,
          color: colors.textSecondary,
          paddingHorizontal: 22,
          paddingTop: 14,
          textTransform: 'capitalize',
        },
        detailSheetDetail: { fontSize: 14, color: colors.textTertiary, paddingHorizontal: 22, paddingTop: 6 },
        detailSheetGuide: {
          marginTop: 14,
          marginHorizontal: 22,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.background,
          overflow: 'hidden',
        },
        detailSheetGuideHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 12,
          paddingHorizontal: 14,
          gap: 10,
        },
        detailSheetGuideTextCol: { flex: 1, minWidth: 0 },
        detailSheetGuideTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
        detailSheetGuideHint: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
        detailSheetGuideBody: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 0 },
        detailSheetGuideBlock: { marginBottom: 12 },
        detailSheetGuideBlockLast: { marginBottom: 0 },
        detailSheetGuideSectionLabel: {
          fontSize: 13,
          fontWeight: '700',
          color: colors.primary,
          marginBottom: 6,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
        },
        detailSheetGuideSectionText: { fontSize: 14, color: colors.textSecondary, lineHeight: 21 },
        detailSheetExercises: { marginTop: 18, paddingHorizontal: 22, paddingBottom: 8 },
        detailSheetExercisesLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
        detailSheetExercisesAccent: { width: 3, height: 14, borderRadius: 2, backgroundColor: colors.primary },
        detailSheetExercisesLabel: {
          fontSize: 11,
          fontWeight: '700',
          color: colors.primary,
          textTransform: 'uppercase',
          letterSpacing: 1.35,
        },
        detailSheetExerciseRow: {
          paddingVertical: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        detailSheetExerciseRowLast: { borderBottomWidth: 0 },
        detailSheetExerciseName: { fontSize: 16, fontWeight: '600', color: colors.text, lineHeight: 22 },
        detailSheetExerciseMeta: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
        detailSheetExerciseNotes: { fontSize: 13, color: colors.textTertiary, fontStyle: 'italic', marginTop: 6 },
        detailSheetNoExercises: { fontSize: 14, color: colors.textTertiary, fontStyle: 'italic', paddingHorizontal: 22, marginTop: 14 },
        detailSheetFooter: {
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 20,
          backgroundColor: colors.surface,
          gap: 10,
        },
        detailSheetFooterRow: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
        detailSheetGhostBtn: {
          flex: 1,
          minHeight: 48,
          paddingHorizontal: 10,
          paddingVertical: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: 'transparent',
          justifyContent: 'center',
          alignItems: 'center',
        },
        detailSheetGhostBtnText: { fontSize: 15, fontWeight: '600', color: colors.text, textAlign: 'center' },
        detailSheetPrimaryFull: {
          width: '100%',
          minHeight: 50,
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderRadius: 12,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
        },
        detailSheetPrimaryText: { fontSize: 16, fontWeight: '700', color: colors.onPrimary },
        noPlanHero: {
          alignItems: 'center',
          paddingTop: 40,
          paddingBottom: 32,
          paddingHorizontal: 16,
          marginBottom: 8,
        },
        noPlanHeroIconWrap: {
          width: 80,
          height: 80,
          borderRadius: 24,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
        },
        noPlanHeroTitle: {
          fontSize: 26,
          fontWeight: '800',
          letterSpacing: -0.4,
          textAlign: 'center',
          marginBottom: 10,
        },
        noPlanHeroSub: {
          fontSize: 15,
          lineHeight: 22,
          textAlign: 'center',
          fontWeight: '500',
          marginBottom: 32,
        },
        noPlanHeroCta: {
          alignSelf: 'stretch',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingVertical: 14,
          borderRadius: 12,
        },
        noPlanHeroCtaText: {
          fontSize: 16,
          fontWeight: '800',
        },
        noPlanHeroLink: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          marginTop: 18,
        },
        noPlanHeroLinkText: {
          fontSize: 16,
          fontWeight: '700',
        },
      }),
    [colors]
  );

  const resolveWorkoutForPlanSlot = useCallback(
    (planSlotId: string): Workout | undefined =>
      weeklyWorkouts.find((w) => w.planWorkoutId === planSlotId),
    [weeklyWorkouts]
  );

  const isSlotCompleted = useCallback(
    (planSlotId: string): boolean => {
      const linked = resolveWorkoutForPlanSlot(planSlotId);
      if (!linked?.id) return false;
      return weekLogs.some(l => l.workoutId === linked.id);
    },
    [weekLogs, resolveWorkoutForPlanSlot]
  );

  const handleCardPress = useCallback(
    (workout: PlanWorkout, day: string) => {
      const dayDate = getDateForDay(selectedWeek, day);
      if (isRestPlanSlotTitle(workout.title)) {
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

  const handleMoveFromMenu = useCallback(() => {
    if (!contextWorkout) return;
    const ctx = contextWorkout;
    closeContextMenu();
    setMoveContext(ctx);
  }, [contextWorkout, closeContextMenu]);

  const handleMoveToDay = useCallback(async (targetDay: string) => {
    if (!moveContext || !currentPlan?.id) return;
    if (targetDay === moveContext.day) {
      setMoveContext(null);
      return;
    }
    setMoving(true);
    try {
      await movePlanSlot(currentPlan.id, moveContext.workout.id, { dayOfWeek: targetDay });
      setMoveContext(null);
      await loadPlan();
    } catch (err: any) {
      Alert.alert('Could not move workout', err.response?.data?.message ?? err.message ?? 'Try again.');
    } finally {
      setMoving(false);
    }
  }, [moveContext, currentPlan?.id, loadPlan]);

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
              ...(currentPlan != null
                ? { weekAnchorMonday: currentPlan.weekAnchorMonday ?? null }
                : {}),
            },
          },
        });
      }
    },
    [navigation, selectedWeek, currentPlan != null, currentPlan?.weekAnchorMonday]
  );

  const handleAIGenerate = useCallback(() => {
    navigation.navigate('GeneratePlan');
  }, [navigation]);

  const jumpToCurrentWeek = useCallback(() => {
    setSelectedWeek(0);
    contentScrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  const handleShiftWeek = useCallback(async (direction: 1 | -1) => {
    if (!currentPlan?.id || resolvedProgramWeek === null) return;
    const currentWeekSlots = planByWeek[resolvedProgramWeek] ?? {};
    const shifted = shiftWeekWorkouts(currentWeekSlots, direction);
    if (!shifted) return;

    const snapshot = currentWeekSlots;
    setShifting(true);
    setPlanByWeek(prev => ({ ...prev, [resolvedProgramWeek]: shifted }));

    try {
      const moves: Array<{ id: string; dayOfWeek: string }> = [];
      for (const [day, workouts] of Object.entries(shifted)) {
        for (const w of workouts as PlanWorkout[]) {
          moves.push({ id: w.id, dayOfWeek: day });
        }
      }
      await Promise.all(
        moves.map(({ id, dayOfWeek }) =>
          movePlanSlot(currentPlan.id, id, { dayOfWeek, weekNumber: resolvedProgramWeek })
        )
      );
    } catch (err: any) {
      setPlanByWeek(prev => ({ ...prev, [resolvedProgramWeek]: snapshot }));
      Alert.alert('Could not shift workouts', err?.response?.data?.message ?? err?.message ?? 'Try again.');
    } finally {
      setShifting(false);
    }
  }, [currentPlan?.id, resolvedProgramWeek, planByWeek]);

  // --- Drag-and-drop callbacks ---
  const updateHoveredDay = useCallback((screenY: number) => {
    const day = findDayAtY(
      screenY,
      containerOffsetRef.current.y,
      headerBottomRef.current,
      scrollOffsetRef.current,
      dayLayoutsRef.current,
    );
    hoveredDayRef.current = day; // update ref immediately — don't wait for useEffect
    setHoveredDay(day);          // update state for visual highlight
  }, []);

  const commitDrop = useCallback(() => {
    const target    = hoveredDayRef.current;
    const slot      = draggingSlotRef.current;
    const week      = resolvedProgramWeekRef.current;
    const planId    = currentPlan?.id;

    setScrollEnabled(true);
    setDraggingSlot(null);
    setHoveredDay(null);

    if (!target || !slot || target === slot.day || !planId || week === null) return;

    // Snapshot for rollback
    const snapshot = planByWeekRef.current;

    // Optimistic update — move card locally right away, no reload
    setPlanByWeek(prev => {
      const weekData = prev[week];
      if (!weekData) return prev;
      const fromDay = weekData[slot.day] ?? [];
      const toDay   = weekData[target] ?? [];
      const card    = fromDay.find(w => w.id === slot.workout.id);
      if (!card) return prev;
      return {
        ...prev,
        [week]: {
          ...weekData,
          [slot.day]: fromDay.filter(w => w.id !== slot.workout.id),
          [target]:   [...toDay, card],
        },
      };
    });

    // Persist in background — revert on failure
    movePlanSlot(planId, slot.workout.id, { dayOfWeek: target }).catch((err: any) => {
      setPlanByWeek(snapshot);
      Alert.alert('Could not move workout', err?.response?.data?.message ?? err?.message ?? 'Try again.');
    });
  }, [currentPlan?.id]);

  const cancelDrag = useCallback(() => {
    setScrollEnabled(true);
    setDraggingSlot(null);
    setHoveredDay(null);
  }, []);

  const ghostAnimatedStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: dragX.value - containerOffsetRef.current.x,
    top:  dragY.value - containerOffsetRef.current.y - 20,
    opacity: ghostOpacity.value,
    transform: [{ scale: 1.04 }],
    zIndex: 9999,
    pointerEvents: 'none' as const,
  }));
  // --- End drag-and-drop callbacks ---

  const formatWorkoutDetailLine = (workout: PlanWorkout): string => {
    let detail = (workout.detailLine ?? '—').replace(/·/g, '•');
    const n = workout.planExercises?.length ?? 0;
    if (workout.type === 'strength' && n > 0) {
      const parts = detail.split(/\s*•\s*/).map((s) => s.trim()).filter(Boolean);
      const rest = parts.filter((s) => !/^\d+\s*exercises?$/i.test(s)).join(' • ');
      return rest ? `${n} exercises • ${rest}` : `${n} exercises`;
    }
    return detail;
  };

  const getWorkoutTypeLabel = (type: WorkoutType): string => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const getDaySummary = (workouts: PlanWorkout[]): string => {
    if (workouts.length === 0) return 'Rest (no time)';
    const totalMin = workouts.reduce((s, w) => {
      if (isRestPlanSlotTitle(w.title)) return s + w.durationMinutes;
      const linked = resolveWorkoutForPlanSlot(w.id);
      const planEx = w.planExercises?.map((e) => ({ sets: e.sets, reps: e.reps }));
      const planned =
        linked?.estimatedDuration ?? w.durationMinutes;
      return s + getPlanSlotDisplayMinutes(planned, planEx, linked?.exercises);
    }, 0);
    const sessionCount = workouts.length;
    
    // Check if it's a rest day
    if (workouts.length === 1 && isRestPlanSlotTitle(workouts[0]?.title)) {
      return 'Rest (no time)';
    }
    
    // Filter out rest days for intensity calculation
    const activeWorkouts = workouts.filter((w) => !isRestPlanSlotTitle(w.title));
    if (activeWorkouts.length === 0) {
      return 'Rest (no time)';
    }
    
    const intensityLabel = activeWorkouts.some(w => w.intensity === 'Hard') ? 'Hard' : activeWorkouts.some(w => w.intensity === 'Medium') ? 'Medium' : 'Easy';
    
    return `${totalMin} min • ${sessionCount} ${sessionCount === 1 ? 'session' : 'sessions'} • ${intensityLabel}`;
  };

  if (planLoading) {
    return (
      <View style={styles.container} testID="e2e-plan-root">
        <LoadingSpinner />
      </View>
    );
  }

  if (planError) {
    return (
      <View
        testID="e2e-plan-root"
        style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 20 }]}
      >
        <Text style={[styles.headerTitle, { color: colors.text, marginBottom: 8 }]}>{planError}</Text>
        <TouchableOpacity onPress={loadPlan} style={{ padding: 12, backgroundColor: colors.primary, borderRadius: 8 }}>
          <Text style={{ color: colors.onPrimary, fontWeight: '600' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      ref={containerRef}
      style={styles.container}
      testID="e2e-plan-root"
      onLayout={() => {
        containerRef.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
          containerOffsetRef.current = { x: pageX, y: pageY };
        });
      }}
    >
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
            <TouchableOpacity style={styles.ctaCompact} onPress={handleAIGenerate} accessibilityLabel="AI Generate plan">
              <Ionicons name="sparkles-outline" size={16} color={colors.onPrimary} />
              <Text style={styles.ctaCompactText}>AI Generate</Text>
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
              Details ({detailsLoadSummary})
            </Text>
            <Text style={styles.detailsToggleIcon}>{showDetails ? ' ▾' : ' ▸'}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Tight week navigation: ‹ Week of Jan 26 – Feb 1 › */}
      <View
        style={styles.weekRow}
        onLayout={(e: LayoutChangeEvent) => {
          headerBottomRef.current = e.nativeEvent.layout.y + e.nativeEvent.layout.height;
        }}
      >
        <TouchableOpacity
          style={[styles.weekNavArrow, selectedWeek <= weekNavBounds.min && styles.weekNavArrowDisabled]}
          disabled={selectedWeek <= weekNavBounds.min}
          accessibilityState={{ disabled: selectedWeek <= weekNavBounds.min }}
          onPress={() => setSelectedWeek((w) => Math.max(weekNavBounds.min, w - 1))}
        >
          <Text style={styles.weekNavArrowText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.weekNavCenter}>
          <Text style={styles.weekNavLabel}>Week of {formatWeekRange(weekRange.start, weekRange.end)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.weekNavArrow, selectedWeek >= weekNavBounds.max && styles.weekNavArrowDisabled]}
          disabled={selectedWeek >= weekNavBounds.max}
          accessibilityState={{ disabled: selectedWeek >= weekNavBounds.max }}
          onPress={() => setSelectedWeek((w) => Math.min(weekNavBounds.max, w + 1))}
        >
          <Text style={styles.weekNavArrowText}>›</Text>
        </TouchableOpacity>
      </View>

      {hasWorkoutsThisWeek ? (
        <View style={styles.shiftRow}>
          <TouchableOpacity
            style={[styles.shiftBtn, (!canShiftBack || shifting) && styles.shiftBtnDisabled]}
            disabled={!canShiftBack || shifting}
            onPress={() => handleShiftWeek(-1)}
            accessibilityLabel="Shift all workouts back one day"
          >
            <Text style={styles.shiftBtnText}>← Shift back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.shiftBtn, (!canShiftForward || shifting) && styles.shiftBtnDisabled]}
            disabled={!canShiftForward || shifting}
            onPress={() => handleShiftWeek(1)}
            accessibilityLabel="Shift all workouts forward one day"
          >
            <Text style={styles.shiftBtnText}>Shift forward →</Text>
          </TouchableOpacity>
        </View>
      ) : null}

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
        scrollEnabled={scrollEnabled}
        onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
      >
        {currentPlan === null ? (
          <View style={styles.noPlanHero}>
            <View style={[styles.noPlanHeroIconWrap, { backgroundColor: colors.primary + '18' }]}>
              <Ionicons name="sparkles-outline" size={36} color={colors.primary} />
            </View>
            <Text style={[styles.noPlanHeroTitle, { color: colors.text }]}>No plan yet</Text>
            <Text style={[styles.noPlanHeroSub, { color: colors.textSecondary }]}>
              Generate a personalised week with AI, or build your schedule manually.
            </Text>
            <TouchableOpacity
              style={[styles.noPlanHeroCta, { backgroundColor: colors.primary }]}
              onPress={handleAIGenerate}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityHint="Opens AI plan generator"
            >
              <Ionicons name="flash-outline" size={18} color={colors.onPrimary} />
              <Text style={[styles.noPlanHeroCtaText, { color: colors.onPrimary }]}>Generate my plan</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.noPlanHeroLink}
              onPress={() => handleAddWorkoutForDay('Monday')}
              activeOpacity={0.7}
            >
              <Text style={[styles.noPlanHeroLinkText, { color: colors.primary }]}>Build manually instead</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>
        ) : null}
        {DAYS_OF_WEEK.map(day => {
          const workouts = plan[day] || [];
          const dayDate = getDateForDay(selectedWeek, day);
          const isToday = isTodayDate(dayDate);
          const daySummaryText = getDaySummary(workouts);

          const isDropTarget = hoveredDay === day && draggingSlot?.day !== day;

          return (
            <View
              key={day}
              style={[
                styles.daySection,
                isDropTarget && {
                  backgroundColor: colors.primary + '18',
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: colors.primary,
                },
              ]}
              onLayout={(e: LayoutChangeEvent) => {
                dayLayoutsRef.current[day] = {
                  y: e.nativeEvent.layout.y,
                  height: e.nativeEvent.layout.height,
                };
              }}
            >
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
                    const isRestDay = isRestPlanSlotTitle(workout.title);
                    const isBeingDragged = draggingSlot?.workout.id === workout.id;

                    // ⋯ button tap — sets moreButtonActive so cardTap can skip handleCardPress
                    const moreTap = Gesture.Tap()
                      .onBegin(() => {
                        'worklet';
                        moreButtonActive.value = true;
                      })
                      .onFinalize(() => {
                        'worklet';
                        moreButtonActive.value = false;
                      })
                      .onEnd((_e, success) => {
                        'worklet';
                        if (success) runOnJS(openContextMenu)(workout, day);
                      });

                    const panGesture = Gesture.Pan()
                      .activateAfterLongPress(300)
                      .onStart((e) => {
                        'worklet';
                        isDragging.value = true;
                        dragX.value = e.absoluteX;
                        dragY.value = e.absoluteY;
                        ghostOpacity.value = withTiming(1, { duration: 120 });
                        runOnJS(setDraggingSlot)({ workout, day });
                        runOnJS(setScrollEnabled)(false);
                      })
                      .onUpdate((e) => {
                        'worklet';
                        dragX.value = e.absoluteX;
                        dragY.value = e.absoluteY;
                        runOnJS(updateHoveredDay)(e.absoluteY);
                      })
                      .onEnd(() => {
                        'worklet';
                        isDragging.value = false;
                        ghostOpacity.value = withTiming(0, { duration: 100 });
                        runOnJS(commitDrop)();
                      })
                      .onFinalize(() => {
                        'worklet';
                        if (isDragging.value) {
                          isDragging.value = false;
                          ghostOpacity.value = withTiming(0, { duration: 100 });
                          runOnJS(cancelDrag)();
                        }
                      });

                    // Card tap — skips handleCardPress if ⋯ button is being touched
                    const cardTap = Gesture.Tap()
                      .onEnd((_e, success) => {
                        'worklet';
                        if (success && !moreButtonActive.value) runOnJS(handleCardPress)(workout, day);
                      });

                    // Exclusive: pan (long-press drag) wins over tap; tap fires on quick press
                    const composed = Gesture.Exclusive(panGesture, cardTap);

                    const moreButtonJSX = (
                      <GestureDetector gesture={moreTap}>
                        <View
                          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                          style={styles.moreButton}
                        >
                          <Text style={styles.moreButtonText}>⋯</Text>
                        </View>
                      </GestureDetector>
                    );

                    const cardStyle = [
                      styles.workoutCard,
                      isRestDay && styles.restDayCard,
                      isBeingDragged && { opacity: 0.3, borderWidth: 2, borderStyle: 'dashed' as const, borderColor: colors.primary },
                    ];

                    if (isRestDay) {
                      return (
                        <GestureDetector key={workout.id} gesture={composed}>
                          <View style={cardStyle}>
                            <View style={[styles.workoutIcon, { backgroundColor: workout.iconColor }]}>
                              <Text style={styles.workoutTypeBadge}>R</Text>
                            </View>
                            <View style={styles.workoutContent}>
                              <Text style={styles.workoutTitle}>Rest Day</Text>
                              <Text style={styles.workoutDetailLine}>Off / Optional walk</Text>
                            </View>
                            {moreButtonJSX}
                          </View>
                        </GestureDetector>
                      );
                    }

                    return (
                      <GestureDetector key={workout.id} gesture={composed}>
                        <View style={cardStyle}>
                          <View style={[styles.workoutIcon, { backgroundColor: workout.iconColor }]}>
                            {isSlotCompleted(workout.id)
                              ? <Ionicons name="checkmark" size={22} color={colors.onPrimary} />
                              : <Text style={styles.workoutTypeBadge}>{getWorkoutTypeLabel(workout.type).charAt(0)}</Text>
                            }
                          </View>
                          <View style={styles.workoutContent}>
                            <Text style={styles.workoutTitle}>{workout.title}</Text>
                            <Text style={styles.workoutDetailLine}>
                              {formatWorkoutDetailLine(workout)}
                            </Text>
                          </View>
                          {moreButtonJSX}
                        </View>
                      </GestureDetector>
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
            {contextWorkout && !isRestPlanSlotTitle(contextWorkout.workout.title) && (
              <TouchableOpacity style={styles.menuItem} onPress={handleAddExercisesFromMenu}>
                <Text style={styles.menuItemText}>Add exercises</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.menuItem} onPress={handleMoveFromMenu}>
              <Text style={styles.menuItemText}>Move to day</Text>
            </TouchableOpacity>
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

      {/* Move to day modal */}
      <Modal visible={!!moveContext} transparent animationType="fade">
        <Pressable style={styles.moveOverlay} onPress={() => { if (!moving) setMoveContext(null); }}>
          {moveContext && (
            <Pressable style={styles.moveBox} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.moveTitle}>Move "{moveContext.workout.title}" to</Text>
              {DAYS_OF_WEEK.map((d, idx) => {
                const isCurrent = d === moveContext.day;
                return (
                  <TouchableOpacity
                    key={d}
                    style={[
                      styles.moveDayItem,
                      idx === DAYS_OF_WEEK.length - 1 && { borderBottomWidth: 0 },
                    ]}
                    onPress={() => void handleMoveToDay(d)}
                    disabled={moving || isCurrent}
                  >
                    {moving && !isCurrent ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={[styles.moveDayText, isCurrent && { color: colors.textMuted }]}>
                        {d}{isCurrent ? ' (current)' : ''}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity style={styles.moveCancel} onPress={() => setMoveContext(null)} disabled={moving}>
                <Text style={styles.moveCancelText}>Cancel</Text>
              </TouchableOpacity>
            </Pressable>
          )}
        </Pressable>
      </Modal>

      {/* Workout detail sheet: reasoning, exercises, and actions */}
      <Modal visible={!!detailSheetWorkout} transparent animationType="fade">
        <Pressable style={styles.detailSheetOverlay} onPress={closeDetailSheet}>
          {detailSheetWorkout && (() => {
            const linked = resolveWorkoutForPlanSlot(detailSheetWorkout.workout.id);
            const isRestDay = isRestPlanSlotTitle(detailSheetWorkout.workout.title);
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
                <ScrollView
                  style={styles.detailSheetScroll}
                  contentContainerStyle={styles.detailSheetScrollContent}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  <View style={styles.detailSheetTitleRow}>
                    <Text style={styles.detailSheetTitle}>{detailSheetWorkout.workout.title}</Text>
                  </View>
                  <Text style={styles.detailSheetMeta}>
                    {detailSheetWorkout.workout.type} •{' '}
                    {getPlanSlotDisplayMinutes(
                      linked?.estimatedDuration ?? detailSheetWorkout.workout.durationMinutes,
                      fromPlanRows.map((ex) => ({ sets: ex.sets, reps: ex.reps })),
                      linked?.exercises,
                    )}{' '}
                    min
                    {detailSheetWorkout.workout.intensity ? ` • ${detailSheetWorkout.workout.intensity}` : ''}
                  </Text>
                  <Text style={styles.detailSheetDetail}>
                    {detailSheetWorkout.day} • {detailSheetWorkout.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>

                  {!isRestDay && linked && (linked.warmUp || linked.reasoning || linked.coolDown) ? (
                    <View style={styles.detailSheetGuide}>
                      <TouchableOpacity
                        style={styles.detailSheetGuideHeader}
                        onPress={() => setDetailSheetGuideExpanded((v) => !v)}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: detailSheetGuideExpanded }}
                        accessibilityLabel={
                          detailSheetGuideExpanded
                            ? 'Hide session guide'
                            : 'Show warm-up, why this workout and cool-down'
                        }
                      >
                        <Ionicons
                          name={detailSheetGuideExpanded ? 'chevron-up' : 'chevron-down'}
                          size={20}
                          color={colors.primary}
                        />
                        <View style={styles.detailSheetGuideTextCol}>
                          <Text style={styles.detailSheetGuideTitle}>Session guide</Text>
                          <Text style={styles.detailSheetGuideHint} numberOfLines={2}>
                            Warm-up, why this session & cool-down — optional read before you train.
                          </Text>
                        </View>
                      </TouchableOpacity>
                      {detailSheetGuideExpanded ? (
                        <View style={styles.detailSheetGuideBody}>
                          {linked.warmUp ? (
                            <View style={styles.detailSheetGuideBlock}>
                              <Text style={styles.detailSheetGuideSectionLabel}>Warm-up</Text>
                              <Text style={styles.detailSheetGuideSectionText}>{linked.warmUp}</Text>
                            </View>
                          ) : null}
                          {linked.reasoning ? (
                            <View style={styles.detailSheetGuideBlock}>
                              <Text style={styles.detailSheetGuideSectionLabel}>Why this workout</Text>
                              <Text style={styles.detailSheetGuideSectionText}>{linked.reasoning}</Text>
                            </View>
                          ) : null}
                          {linked.coolDown ? (
                            <View style={[styles.detailSheetGuideBlock, styles.detailSheetGuideBlockLast]}>
                              <Text style={styles.detailSheetGuideSectionLabel}>Cool-down</Text>
                              <Text style={styles.detailSheetGuideSectionText}>{linked.coolDown}</Text>
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  ) : null}

                  {!isRestDay && displayExercises.length > 0 ? (
                    <View style={styles.detailSheetExercises}>
                      <View style={styles.detailSheetExercisesLabelRow}>
                        <View style={styles.detailSheetExercisesAccent} />
                        <Text style={styles.detailSheetExercisesLabel}>Exercises</Text>
                      </View>
                      {displayExercises
                        .slice()
                        .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
                        .map((ex, idx, arr) => {
                          const row = ex as typeof ex & { exerciseId?: string };
                          const libId = row.exerciseId;
                          const canOpenLibrary = isLinkableLibraryExerciseId(libId);
                          const isLast = idx === arr.length - 1;
                          return (
                            <Pressable
                              key={ex.id ?? `ex-${idx}`}
                              style={({ pressed }) => [
                                styles.detailSheetExerciseRow,
                                isLast ? styles.detailSheetExerciseRowLast : null,
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
                                {ex.weight != null ? formatAtWeightFromLb(ex.weight, weightUnit) : ''}
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
                    <Text style={[styles.detailSheetDetail, { marginTop: 12 }]}>Off / Optional walk</Text>
                  ) : null}
                </ScrollView>
                <View style={styles.detailSheetFooter}>
                  {isRestDay ? (
                    <TouchableOpacity style={styles.detailSheetPrimaryFull} onPress={closeDetailSheet}>
                      <Text style={styles.detailSheetPrimaryText}>OK</Text>
                    </TouchableOpacity>
                  ) : (
                    <>
                      <View style={styles.detailSheetFooterRow}>
                        <TouchableOpacity style={styles.detailSheetGhostBtn} onPress={closeDetailSheet}>
                          <Text style={styles.detailSheetGhostBtnText}>Back</Text>
                        </TouchableOpacity>
                        {linked ? (
                          <TouchableOpacity
                            style={styles.detailSheetGhostBtn}
                            onPress={() => {
                              closeDetailSheet();
                              navigation.navigate('WorkoutDetail', { workoutId: linked.id });
                            }}
                          >
                            <Text style={styles.detailSheetGhostBtnText} numberOfLines={1}>
                              Workout details
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.detailSheetPrimaryFull,
                          (startWorkoutLoading || displayExercises.length === 0) && { opacity: 0.55 },
                        ]}
                        onPress={() => void handleStartWorkout()}
                        disabled={startWorkoutLoading || displayExercises.length === 0}
                      >
                        {startWorkoutLoading ? (
                          <ActivityIndicator color={colors.onPrimary} />
                        ) : (
                          <Text style={styles.detailSheetPrimaryText}>Start workout</Text>
                        )}
                      </TouchableOpacity>
                    </>
                  )}
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

      {/* Drag ghost card — floats above everything while dragging */}
      {draggingSlot && (
        <Animated.View
          style={[
            styles.workoutCard,
            ghostAnimatedStyle,
            { width: '91%', elevation: 16, shadowOpacity: 0.35, shadowRadius: 14 },
          ]}
          pointerEvents="none"
        >
          <View style={[styles.workoutIcon, { backgroundColor: draggingSlot.workout.iconColor }]}>
            <Text style={styles.workoutTypeBadge}>
              {isRestPlanSlotTitle(draggingSlot.workout.title) ? 'R' : getWorkoutTypeLabel(draggingSlot.workout.type).charAt(0)}
            </Text>
          </View>
          <View style={styles.workoutContent}>
            <Text style={styles.workoutTitle}>{draggingSlot.workout.title}</Text>
            <Text style={styles.workoutDetailLine}>{formatWorkoutDetailLine(draggingSlot.workout)}</Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}
