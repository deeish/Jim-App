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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../types/navigation';
import { elevation, leading, planSlotIconColors, radius, spacing, text, tracking, useTheme, weight } from '../theme';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import { formatAtWeightFromLb } from '../lib/weightDisplay';
import { getCurrentPlanWithWeekly, getCurrentPlan, removePlanSlot, movePlanSlot } from '../services/planService';
import type { ApiPlan, ApiPlanExercise, ApiPlanWorkout } from '../services/planService';
import type { Exercise, Workout, WorkoutLog } from '../types/workout';
import { materializePlanSlotWorkout, getWorkoutLogs } from '../services/workoutService';
import LoadingSpinner from '../components/LoadingSpinner';
import WorkoutDayRow, { pickWorkoutIcon, pickWorkoutAccent, workoutEyebrow } from '../components/WorkoutDayRow';
import SavedWorkoutsScreen from './SavedWorkoutsScreen';
import ShareModal from '../components/ShareModal';
import {
  formatLocalYmd,
  getCalendarWeekRange,
  getPlanCalendarWeekNavigationBounds,
  lastContiguousProgramWeek,
  normalizePlanAnchorYmd,
  normalizePlanDayOfWeek,
  normalizeProgramWeekNumber,
  isRestPlanSlotTitle,
  resolveProgramWeekForCalendarOffset,
  shiftWeekWorkouts,
} from '../lib/planCalendar';
import { navigateFromPlanToExerciseDetail, isLinkableLibraryExerciseId } from '../lib/exerciseNavigation';
import {
  exercisesLikeFromPrescription,
  getPlanSlotDisplayMinutes,
} from '../lib/estimateWorkoutMinutes';
import {
  formatExercisePrescriptionCompact,
  profileGoalToPlanGoal,
} from '../lib/workoutExerciseDisplay';

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

function getTodayDayName(): string {
  const idx = new Date().getDay();
  const mondayBased = idx === 0 ? 6 : idx - 1;
  return DAYS_OF_WEEK[mondayBased];
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
  const insets = useSafeAreaInsets();
  const { weightUnit, goal } = useUserPreferences();
  const [selectedWeek, setSelectedWeek] = useState(0);
  const [planByWeek, setPlanByWeek] = useState<Record<number, Record<string, PlanWorkout[]>>>({});
  const [planLoading, setPlanLoading] = useState(true);
  const [planError, setPlanError] = useState<string | null>(null);
  const [contextWorkout, setContextWorkout] = useState<{ workout: PlanWorkout; day: string } | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [weeklyWorkouts, setWeeklyWorkouts] = useState<Workout[]>([]);
  const [savedModalVisible, setSavedModalVisible] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [detailSheetWorkout, setDetailSheetWorkout] = useState<{ workout: PlanWorkout; day: string; date: Date } | null>(null);
  const [restSheetWorkout, setRestSheetWorkout] = useState<{ workout: PlanWorkout; day: string; date: Date } | null>(null);
  const [moveContext, setMoveContext] = useState<{ workout: PlanWorkout; day: string } | null>(null);
  const [moving, setMoving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ slotId: string; day: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [clearingWeek, setClearingWeek] = useState(false);
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

  const planGoal = useMemo(() => profileGoalToPlanGoal(goal), [goal]);

  const containerRef       = useRef<View>(null);
  const containerOffsetRef = useRef({ x: 0, y: 0 });
  const headerBottomRef    = useRef(0);
  const scrollOffsetRef    = useRef(0);
  const dayLayoutsRef      = useRef<Record<string, { y: number; height: number }>>({});
  const draggingSlotRef        = useRef<{ workout: PlanWorkout; day: string } | null>(null);
  const hoveredDayRef          = useRef<string | null>(null);
  const planByWeekRef          = useRef(planByWeek);
  const resolvedProgramWeekRef = useRef<number | null>(null);
  const didScrollToTodayRef    = useRef(false);
  // Show the full-screen spinner only on the very first load. On later focuses we
  // keep the previous plan visible and refetch silently (stale-while-revalidate),
  // matching HomeScreen — otherwise the Plan tab blanks to a spinner every visit.
  const isFirstPlanLoad        = useRef(true);

  useEffect(() => { draggingSlotRef.current = draggingSlot; }, [draggingSlot]);
  useEffect(() => { hoveredDayRef.current = hoveredDay; }, [hoveredDay]);
  useEffect(() => { planByWeekRef.current = planByWeek; }, [planByWeek]);
  // --- End drag-and-drop ---

  useEffect(() => {
    setDetailSheetGuideExpanded(false);
  }, [detailSheetWorkout?.workout.id]);

  const loadPlan = useCallback(async () => {
    if (isFirstPlanLoad.current) setPlanLoading(true);
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
      isFirstPlanLoad.current = false;
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

  // Clamp past the program end so a finished plan keeps showing (and editing)
  // a recurring weekly routine instead of rendering seven empty days. The repeat
  // target is the last contiguous week so a one-off workout added far in the
  // future doesn't become the routine.
  const repeatWeek = useMemo(
    () => lastContiguousProgramWeek((currentPlan?.planWorkouts ?? []).map((pw) => pw.weekNumber)),
    [currentPlan?.planWorkouts],
  );
  const programWeekResolution = useMemo(
    () => resolveProgramWeekForCalendarOffset(selectedWeek, anchorYmd, maxPlanWeek, repeatWeek),
    [selectedWeek, anchorYmd, maxPlanWeek, repeatWeek],
  );
  const resolvedProgramWeek =
    programWeekResolution.status === 'in_program' ? programWeekResolution.week : null;
  useEffect(() => { resolvedProgramWeekRef.current = resolvedProgramWeek; }, [resolvedProgramWeek]);

  const plan = useMemo(() => {
    if (resolvedProgramWeek === null) return EMPTY_PLAN;
    return planByWeek[resolvedProgramWeek] ?? EMPTY_PLAN;
  }, [planByWeek, resolvedProgramWeek]);

  // Reset the scroll-to-today flag when the user navigates to a different week.
  useEffect(() => {
    didScrollToTodayRef.current = false;
  }, [selectedWeek]);

  // On the current week, auto-scroll to today's section after layout settles.
  useEffect(() => {
    if (selectedWeek !== 0 || planLoading || didScrollToTodayRef.current) return;
    const dayName = getTodayDayName();
    const timer = setTimeout(() => {
      const layout = dayLayoutsRef.current[dayName];
      if (layout && layout.height > 0) {
        contentScrollRef.current?.scrollTo({
          y: Math.max(0, layout.y - 24),
          animated: true,
        });
        didScrollToTodayRef.current = true;
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [selectedWeek, planLoading, plan]);

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
          padding: spacing.md,
          paddingTop: spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        headerTop: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: spacing.md,
        },
        headerTitles: { flex: 1 },
        headerTitle: { fontSize: text.title, fontWeight: weight.bold, color: colors.text },
        subtitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.xxs },
        goalContext: { fontSize: text.footnote, color: colors.primary, fontWeight: weight.semibold, flex: 1 },
        detailsToggle: { marginTop: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs },
        detailsToggleContent: { flexDirection: 'row', alignItems: 'center' },
        detailsToggleText: { fontSize: text.footnote, color: colors.textSecondary, fontWeight: weight.semibold },
        detailsToggleIcon: { fontSize: text.footnote, color: colors.textSecondary, fontWeight: weight.semibold },
        ctaRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap', marginTop: spacing.md },
        historyLabelButton: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
        historyLabelText: { fontSize: text.body, fontWeight: weight.semibold },
        ctaCompact: {
          backgroundColor: colors.primary,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          borderRadius: radius.sm,
          minWidth: 64,
          alignItems: 'center',
          flexDirection: 'row',
          gap: spacing.sm,
        },
        ctaSecondary: {
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        },
        ctaCompactText: { fontSize: text.body, fontWeight: weight.semibold, color: colors.onPrimary },
        ctaCompactTextSecondary: { fontSize: text.body, fontWeight: weight.semibold, color: colors.textSecondary },
        weekRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
        },
        weekNavArrow: {
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          minWidth: 44,
          minHeight: 44,
          alignItems: 'center',
          justifyContent: 'center',
        },
        weekNavArrowDisabled: { opacity: 0.35 },
        weekNavArrowText: { fontSize: text.title, color: colors.primary, fontWeight: weight.semibold },
        weekNavCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
        weekNavLabel: { fontSize: text.body, color: colors.text, fontWeight: weight.semibold },
        shiftRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: spacing.md,
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.md,
        },
        shiftBtn: {
          flex: 1,
          minHeight: 48,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderRadius: radius.md,
          borderWidth: 2,
          borderColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
        },
        shiftBtnDisabled: { opacity: 0.35 },
        shiftBtnText: { fontSize: text.body, color: colors.primary, fontWeight: weight.bold },
        clearWeekBtnText: { fontSize: text.body, color: colors.error, fontWeight: weight.bold },
        outOfProgramWeekBanner: {
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        outOfProgramWeekText: { fontSize: text.footnote, color: colors.textSecondary, textAlign: 'center' },
        repeatingWeekBanner: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          backgroundColor: colors.primary + '12',
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        repeatingWeekBannerText: { fontSize: text.footnote, color: colors.textSecondary, textAlign: 'center', flexShrink: 1 },
        content: { flex: 1 },
        contentContainer: { padding: spacing.md, paddingBottom: spacing.xxxl, gap: spacing.sm },
        dayGroup: {
          borderRadius: radius.md,
        },
        dayGroupDropTarget: {
          backgroundColor: colors.primary + '14',
          borderWidth: 1,
          borderColor: colors.primary,
        },
        moreButton: {
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.xl,
        },
        menuOverlay: {
          flex: 1,
          backgroundColor: colors.scrim,
          justifyContent: 'center',
          alignItems: 'center',
          padding: spacing.xxl,
        },
        menuBox: {
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          width: '100%',
          maxWidth: 320,
          overflow: 'hidden',
        },
        menuItem: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
        menuItemText: { fontSize: text.callout, color: colors.text },
        menuItemTextMuted: { fontSize: text.callout, color: colors.textMuted },
        menuItemDanger: { color: colors.error },
        moveOverlay: {
          flex: 1,
          backgroundColor: colors.scrim,
          justifyContent: 'center',
          alignItems: 'center',
          padding: spacing.xxl,
        },
        moveBox: {
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          width: '100%',
          maxWidth: 320,
          overflow: 'hidden',
        },
        moveTitle: { fontSize: text.headline, fontWeight: weight.bold, color: colors.text, padding: spacing.lg, paddingBottom: spacing.sm },
        moveDayItem: { padding: spacing.lg, paddingLeft: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
        moveDayText: { fontSize: text.callout, color: colors.text },
        moveCancel: { padding: spacing.lg, alignItems: 'center' },
        moveCancelText: { fontSize: text.callout, color: colors.textMuted },
        detailSheetOverlay: {
          flex: 1,
          backgroundColor: colors.overlay,
          justifyContent: 'center',
          alignItems: 'center',
          padding: spacing.xl,
        },
        detailSheetBox: {
          backgroundColor: colors.surface,
          borderRadius: radius.xl,
          width: '100%',
          maxWidth: 400,
          maxHeight: '88%',
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: colors.shadow,
          ...elevation.level3,
        },
        detailSheetScroll: { flexGrow: 0, maxHeight: 420 },
        detailSheetScrollContent: { paddingBottom: spacing.md },
        detailSheetTitleRow: {
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.xl,
          paddingBottom: spacing.lg,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: spacing.lg,
        },
        detailSheetHeroIcon: {
          width: 48,
          height: 48,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
        },
        detailSheetHeroText: { flex: 1, minWidth: 0 },
        detailSheetEyebrow: {
          fontSize: text.caption,
          fontWeight: weight.heavy,
          letterSpacing: tracking.widest,
          textTransform: 'uppercase',
          color: colors.textMuted,
          marginBottom: spacing.xs,
        },
        detailSheetTitle: { fontSize: text.title, fontWeight: weight.bold, color: colors.text, letterSpacing: tracking.tight, lineHeight: leading.title },
        detailSheetMeta: {
          fontSize: text.body,
          fontWeight: weight.semibold,
          color: colors.textSecondary,
          marginTop: spacing.sm,
        },
        detailSheetSubLine: { fontSize: text.footnote, color: colors.textTertiary, marginTop: spacing.xs },
        detailSheetDetail: { fontSize: text.body, color: colors.textTertiary, paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
        detailSheetGuide: {
          marginTop: spacing.lg,
          marginHorizontal: spacing.xl,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.background,
          overflow: 'hidden',
        },
        detailSheetGuideHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          gap: spacing.md,
        },
        detailSheetGuideTextCol: { flex: 1, minWidth: 0 },
        detailSheetGuideTitle: { fontSize: text.callout, fontWeight: weight.semibold, color: colors.text },
        detailSheetGuideHint: { fontSize: text.body, color: colors.textMuted, marginTop: spacing.xxs },
        detailSheetGuideBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.none },
        detailSheetGuideBlock: { marginBottom: spacing.md },
        detailSheetGuideBlockLast: { marginBottom: spacing.none },
        detailSheetGuideSectionLabel: {
          fontSize: text.body,
          fontWeight: weight.bold,
          color: colors.primary,
          marginBottom: spacing.sm,
          letterSpacing: tracking.wider,
          textTransform: 'uppercase',
        },
        detailSheetGuideSectionText: { fontSize: text.body, color: colors.textSecondary, lineHeight: leading.body },
        detailSheetExercises: { marginTop: spacing.lg, paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
        detailSheetExercisesLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md, gap: spacing.md },
        detailSheetExercisesAccent: { width: 3, height: 14, borderRadius: radius.xs, backgroundColor: colors.primary },
        detailSheetExercisesLabel: {
          fontSize: text.caption,
          fontWeight: weight.bold,
          color: colors.primary,
          textTransform: 'uppercase',
          letterSpacing: tracking.widest,
        },
        detailSheetExerciseRow: {
          paddingVertical: spacing.lg,
          borderBottomWidth: 1,
          borderBottomColor: colors.textMuted + '44',
        },
        detailSheetExerciseRowLast: { borderBottomWidth: 0 },
        detailSheetExerciseName: { fontSize: text.callout, fontWeight: weight.semibold, color: colors.text, lineHeight: leading.callout },
        detailSheetExerciseMeta: { fontSize: text.body, color: colors.textSecondary, marginTop: spacing.xs },
        detailSheetExerciseNotes: { fontSize: text.body, color: colors.textTertiary, fontStyle: 'italic', marginTop: spacing.sm },
        detailSheetNoExercises: { fontSize: text.body, color: colors.textTertiary, fontStyle: 'italic', paddingHorizontal: spacing.xl, marginTop: spacing.lg },
        detailSheetFooter: {
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.lg,
          paddingBottom: spacing.xl,
          backgroundColor: colors.surface,
          gap: spacing.md,
        },
        detailSheetLinkRow: {
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'stretch',
          gap: spacing.md,
          paddingTop: spacing.xxs,
        },
        detailSheetFooterBtnSecondary: {
          minHeight: 48,
          paddingVertical: spacing.lg,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.md,
          backgroundColor: colors.background,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        },
        detailSheetFooterBtnFlex: { flex: 1 },
        detailSheetFooterBtnOutline: {
          backgroundColor: colors.primary + '14',
          borderColor: colors.primary,
          borderWidth: 2,
        },
        detailSheetFooterBtnSecondaryText: {
          fontSize: text.callout,
          fontWeight: weight.bold,
          color: colors.text,
        },
        detailSheetFooterBtnOutlineText: {
          fontSize: text.callout,
          fontWeight: weight.bold,
          color: colors.primary,
        },
        restSheetBox: {
          backgroundColor: colors.surface,
          borderRadius: radius.xl,
          width: '100%',
          maxWidth: 360,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: colors.shadow,
          ...elevation.level3,
        },
        restSheetBody: {
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.lg,
          paddingBottom: spacing.sm,
        },
        restSheetBodyText: {
          fontSize: text.body,
          fontWeight: weight.medium,
          lineHeight: leading.body,
          color: colors.textSecondary,
        },
        detailSheetPrimaryFull: {
          width: '100%',
          minHeight: 54,
          paddingVertical: spacing.lg,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.md,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
        },
        detailSheetPrimaryText: { fontSize: text.headline, fontWeight: weight.heavy, color: colors.onPrimary },
        noPlanHero: {
          alignItems: 'center',
          paddingTop: 40,
          paddingBottom: spacing.xxxl,
          paddingHorizontal: spacing.lg,
          marginBottom: spacing.sm,
        },
        noPlanHeroIconWrap: {
          width: 80,
          height: 80,
          borderRadius: radius.xxl,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.xxl,
        },
        noPlanHeroTitle: {
          fontSize: text.display,
          fontWeight: weight.heavy,
          letterSpacing: tracking.tight,
          textAlign: 'center',
          marginBottom: spacing.md,
        },
        noPlanHeroSub: {
          fontSize: text.callout,
          lineHeight: leading.callout,
          textAlign: 'center',
          fontWeight: weight.medium,
          marginBottom: spacing.xxxl,
        },
        noPlanHeroCta: {
          alignSelf: 'stretch',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          paddingVertical: spacing.lg,
          borderRadius: radius.md,
        },
        noPlanHeroCtaText: {
          fontSize: text.callout,
          fontWeight: weight.heavy,
        },
        noPlanHeroLink: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          marginTop: spacing.lg,
        },
        noPlanHeroLinkText: {
          fontSize: text.callout,
          fontWeight: weight.bold,
        },
      }),
    [colors]
  );

  /** Prefer string-normalized IDs so we match Home’s `planSlotLinksWeeklyWorkout` (avoids ETA drift when JSON types vary). */
  const resolveWorkoutForPlanSlot = useCallback((planSlotId: string): Workout | undefined => {
    const sid = String(planSlotId ?? '').trim();
    if (!sid) return undefined;
    return weeklyWorkouts.find((w) => String(w.planWorkoutId ?? '').trim() === sid);
  }, [weeklyWorkouts]);

  /** Same heuristic as Plan detail modal + Home “Est.” (not the AI `detailLine` text under the card). */
  const planSlotEtaMinutesDisplay = useCallback(
    (w: PlanWorkout): number => {
      const linked = resolveWorkoutForPlanSlot(w.id);
      const planned = linked?.estimatedDuration ?? w.durationMinutes;
      return getPlanSlotDisplayMinutes(
        planned,
        exercisesLikeFromPrescription(w.planExercises ?? null),
        exercisesLikeFromPrescription(linked?.exercises ?? null),
      );
    },
    [resolveWorkoutForPlanSlot],
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
        setRestSheetWorkout({ workout, day, date: dayDate });
        return;
      }
      // Workout days open the detail sheet so the user can preview before committing.
      setDetailSheetWorkout({ workout, day, date: dayDate });
    },
    [selectedWeek]
  );

  const closeDetailSheet = useCallback(() => setDetailSheetWorkout(null), []);
  const closeRestSheet = useCallback(() => setRestSheetWorkout(null), []);

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

    const materializeAndOpen = async () => {
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
    };

    // Past the program end the schedule reuses the last program week. Never
    // add that repeat to the user's day without asking — and remind them
    // which workout it is.
    if (programWeekResolution.status === 'in_program' && programWeekResolution.repeatingLastWeek) {
      Alert.alert(
        'Repeat this workout?',
        `Your plan has ended, so this day reuses "${detailSheetWorkout.workout.title}" from week ${programWeekResolution.week} (${planExerciseCount} exercise${planExerciseCount === 1 ? '' : 's'}). Add it to today and start?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add & start', onPress: () => void materializeAndOpen() },
        ],
      );
      return;
    }

    await materializeAndOpen();
  }, [
    detailSheetWorkout,
    resolveWorkoutForPlanSlot,
    currentPlan?.planWorkouts,
    programWeekResolution,
    loadPlan,
    closeDetailSheet,
    navigation,
  ]);

  const openContextMenu = useCallback((workout: PlanWorkout, day: string) => {
    setContextWorkout({ workout, day });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextWorkout(null);
  }, []);

  const handleViewWorkoutFromMenu = useCallback(() => {
    if (!contextWorkout) return;
    const linkedWorkout = resolveWorkoutForPlanSlot(contextWorkout.workout.id);
    closeContextMenu();
    if (isRestPlanSlotTitle(contextWorkout.workout.title)) {
      const dayDate = getDateForDay(selectedWeek, contextWorkout.day);
      setRestSheetWorkout({ workout: contextWorkout.workout, day: contextWorkout.day, date: dayDate });
      return;
    }
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
              origin: 'plan',
            },
          },
        });
        // Deliberately no goBack() here, unlike WorkoutDetailScreen's equivalent flow:
        // that screen sits at index > 0 and genuinely pops itself, whereas PlanList is
        // this stack's root. A GO_BACK dispatched from a stack root does NOT stop there
        // — it bubbles to the tab navigator and then to the root stack — so it would be
        // an unhandled action (a dev-only console.error) today, and an actual wrong-way
        // pop the moment anything sits underneath `Main` in the root stack.
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

  // Remove every slot in the viewed program week so users don't have to
  // delete one by one. Hidden on repeated-week views: those show the last
  // real program week, and "clearing" them would delete that week's slots.
  const handleClearWeek = useCallback(() => {
    if (!currentPlan?.id || resolvedProgramWeek === null) return;
    const slots = Object.values(planByWeek[resolvedProgramWeek] ?? {}).flat();
    if (!slots.length) return;
    const planId = currentPlan.id;
    Alert.alert(
      'Clear this week?',
      `This removes all ${slots.length} workout${slots.length === 1 ? '' : 's'} scheduled this week. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear week',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setClearingWeek(true);
              try {
                for (const slot of slots) {
                  await removePlanSlot(planId, slot.id);
                }
              } catch (err: any) {
                Alert.alert(
                  'Could not clear the week',
                  err?.response?.data?.message ?? err?.message ?? 'Some workouts may remain — try again.',
                );
              } finally {
                await loadPlan();
                setClearingWeek(false);
              }
            })();
          },
        },
      ],
    );
  }, [currentPlan?.id, resolvedProgramWeek, planByWeek, loadPlan]);

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
      const results = await Promise.allSettled(
        moves.map(({ id, dayOfWeek }) =>
          movePlanSlot(currentPlan.id, id, { dayOfWeek, weekNumber: resolvedProgramWeek })
        )
      );
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length > 0) {
        setPlanByWeek(prev => ({ ...prev, [resolvedProgramWeek]: snapshot }));
        const firstErr = (failed[0] as PromiseRejectedResult).reason;
        Alert.alert(
          'Could not shift workouts',
          firstErr?.response?.data?.message ?? firstErr?.message ?? 'Some moves failed. The plan has been restored.',
        );
        void loadPlan();
      }
    } catch (err: any) {
      setPlanByWeek(prev => ({ ...prev, [resolvedProgramWeek]: snapshot }));
      Alert.alert('Could not shift workouts', err?.response?.data?.message ?? err?.message ?? 'Try again.');
    } finally {
      setShifting(false);
    }
  }, [currentPlan?.id, resolvedProgramWeek, planByWeek, loadPlan]);

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

    // Persist in background — revert on failure and re-fetch to ensure UI matches server
    movePlanSlot(planId, slot.workout.id, { dayOfWeek: target }).catch(() => {
      setPlanByWeek(snapshot);
      void loadPlan();
    });
  }, [currentPlan?.id, loadPlan]);

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

  const getDaySummary = (workouts: PlanWorkout[]): string => {
    if (workouts.length === 0) return 'Rest';
    const activeWorkouts = workouts.filter((w) => !isRestPlanSlotTitle(w.title));
    if (activeWorkouts.length === 0) return 'Rest';
    const totalMin = activeWorkouts.reduce((s, w) => {
      const linked = resolveWorkoutForPlanSlot(w.id);
      const planned = linked?.estimatedDuration ?? w.durationMinutes;
      return (
        s +
        getPlanSlotDisplayMinutes(
          planned,
          exercisesLikeFromPrescription(w.planExercises ?? null),
          exercisesLikeFromPrescription(linked?.exercises ?? null),
        )
      );
    }, 0);
    const sessionCount = activeWorkouts.length;
    return `${totalMin} min • ${sessionCount} ${sessionCount === 1 ? 'session' : 'sessions'}`;
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
        style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: spacing.xl }]}
      >
        <Text style={[styles.headerTitle, { color: colors.text, marginBottom: spacing.sm }]}>{planError}</Text>
        <TouchableOpacity onPress={loadPlan} style={{ padding: spacing.md, backgroundColor: colors.primary, borderRadius: radius.sm }}>
          <Text style={{ color: colors.onPrimary, fontWeight: weight.semibold }}>Retry</Text>
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
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle} numberOfLines={1}>{currentPlan?.name ?? 'My Plan'}</Text>
        {headerSubtitle || currentPlan?.id ? (
          <View style={styles.subtitleRow}>
            {headerSubtitle ? (
              <Text style={styles.goalContext} numberOfLines={1}>{headerSubtitle}</Text>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            {currentPlan?.id ? (
              <TouchableOpacity
                onPress={() => setShareModalVisible(true)}
                accessibilityLabel="Share plan"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="share-outline" size={18} color={colors.primary} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
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
          {!(programWeekResolution.status === 'in_program' && programWeekResolution.repeatingLastWeek) ? (
            <TouchableOpacity
              style={[styles.shiftBtn, clearingWeek && styles.shiftBtnDisabled]}
              disabled={clearingWeek}
              onPress={handleClearWeek}
              accessibilityLabel="Remove all workouts from this week"
            >
              {clearingWeek ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <Text style={styles.clearWeekBtnText}>Clear week</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {programWeekResolution.status === 'in_program' && programWeekResolution.repeatingLastWeek ? (
        <TouchableOpacity
          style={styles.repeatingWeekBanner}
          onPress={handleAIGenerate}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityHint="Opens AI plan generator"
        >
          <Ionicons name="repeat" size={14} color={colors.primary} />
          <Text style={styles.repeatingWeekBannerText}>
            Repeating week {programWeekResolution.week} of your plan. Generate a fresh block to
            keep progressing.
          </Text>
        </TouchableOpacity>
      ) : null}

      {resolvedProgramWeek === null && maxPlanWeek > 0 ? (
        <View style={styles.outOfProgramWeekBanner}>
          <Text style={styles.outOfProgramWeekText}>
            {programWeekResolution.status === 'before_program'
              ? 'No workouts for this calendar week — it is before your program starts.'
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
          const isDropTarget = hoveredDay === day && draggingSlot?.day !== day;
          const dayLabel = day.slice(0, 3);

          return (
            <View
              key={day}
              style={[styles.dayGroup, isDropTarget && styles.dayGroupDropTarget]}
              onLayout={(e: LayoutChangeEvent) => {
                dayLayoutsRef.current[day] = {
                  y: e.nativeEvent.layout.y,
                  height: e.nativeEvent.layout.height,
                };
              }}
            >
              {workouts.length === 0 ? (
                <TouchableOpacity
                  onPress={() => handleAddWorkoutForDay(day)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Add workout for ${day}`}
                >
                  <WorkoutDayRow
                    dayLabel={dayLabel}
                    kind="empty"
                    title={`Add workout for ${day}`}
                    isToday={isToday}
                  />
                </TouchableOpacity>
              ) : (
                workouts.map((workout, idx) => {
                  const isRestDay = isRestPlanSlotTitle(workout.title);
                  const isBeingDragged = draggingSlot?.workout.id === workout.id;
                  const isFirstOfDay = idx === 0;

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

                  const cardTap = Gesture.Tap()
                    .onEnd((_e, success) => {
                      'worklet';
                      if (success && !moreButtonActive.value) runOnJS(handleCardPress)(workout, day);
                    });

                  const composed = Gesture.Exclusive(panGesture, cardTap);

                  const moreButtonJSX = (
                    <GestureDetector gesture={moreTap}>
                      <View
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        style={styles.moreButton}
                        accessibilityRole="button"
                        accessibilityLabel="More options"
                      >
                        <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
                      </View>
                    </GestureDetector>
                  );

                  return (
                    <GestureDetector key={workout.id} gesture={composed}>
                      <View collapsable={false}>
                        <WorkoutDayRow
                          dayLabel={isFirstOfDay ? dayLabel : null}
                          kind={isRestDay ? 'rest' : 'workout'}
                          type={workout.type}
                          title={isRestDay ? 'Rest day' : workout.title}
                          etaMinutes={isRestDay ? null : planSlotEtaMinutesDisplay(workout)}
                          isToday={isToday}
                          isCompleted={!isRestDay && isSlotCompleted(workout.id)}
                          isBeingDragged={isBeingDragged}
                          moreButton={moreButtonJSX}
                        />
                      </View>
                    </GestureDetector>
                  );
                })
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
              <Text style={[styles.menuItemText, { padding: spacing.lg, paddingBottom: spacing.sm }]}>
                Remove "{deleteConfirm.title}" from {deleteConfirm.day}?
              </Text>
              <Text style={[styles.menuItemTextMuted, { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }]}>
                This cannot be undone.
              </Text>
              <View style={{ flexDirection: 'row', paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md }}>
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
            const sortedSlotRx = planLines
              .slice()
              .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
            const fromPlanRows = sortedSlotRx.map((ex, idx) => ({
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
                    <View
                      style={[
                        styles.detailSheetHeroIcon,
                        {
                          backgroundColor:
                            pickWorkoutAccent(detailSheetWorkout.workout.type, isRestDay, colors) + '22',
                        },
                      ]}
                    >
                      <Ionicons
                        name={pickWorkoutIcon(detailSheetWorkout.workout.type, isRestDay)}
                        size={26}
                        color={pickWorkoutAccent(detailSheetWorkout.workout.type, isRestDay, colors)}
                      />
                    </View>
                    <View style={styles.detailSheetHeroText}>
                      <Text style={styles.detailSheetEyebrow}>
                        {workoutEyebrow(detailSheetWorkout.workout.type, isRestDay)}
                      </Text>
                      <Text style={styles.detailSheetTitle} numberOfLines={2}>
                        {detailSheetWorkout.workout.title}
                      </Text>
                      {!isRestDay ? (
                        <Text style={styles.detailSheetMeta}>
                          Est. {getPlanSlotDisplayMinutes(
                            linked?.estimatedDuration ?? detailSheetWorkout.workout.durationMinutes,
                            exercisesLikeFromPrescription(sortedSlotRx),
                            exercisesLikeFromPrescription(linked?.exercises ?? null),
                          )} min
                        </Text>
                      ) : null}
                      <Text style={styles.detailSheetSubLine}>
                        {detailSheetWorkout.day} • {detailSheetWorkout.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </Text>
                    </View>
                  </View>

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
                                {formatExercisePrescriptionCompact(
                                  {
                                    name: ex.name ?? 'Exercise',
                                    sets: ex.sets,
                                    reps: ex.reps,
                                    prescriptionType: (ex as Exercise).prescriptionType,
                                    primaryMuscleGroup: (ex as Exercise).primaryMuscleGroup,
                                  },
                                  planGoal,
                                )}
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
                    <Text style={[styles.detailSheetDetail, { marginTop: spacing.md }]}>Off / Optional walk</Text>
                  ) : null}
                </ScrollView>
                <View style={styles.detailSheetFooter}>
                  {isRestDay ? (
                    <TouchableOpacity style={styles.detailSheetPrimaryFull} onPress={closeDetailSheet}>
                      <Text style={styles.detailSheetPrimaryText}>OK</Text>
                    </TouchableOpacity>
                  ) : (
                    <>
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
                      <View style={styles.detailSheetLinkRow}>
                        <TouchableOpacity
                          style={[styles.detailSheetFooterBtnSecondary, styles.detailSheetFooterBtnFlex]}
                          onPress={closeDetailSheet}
                          accessibilityRole="button"
                          accessibilityLabel="Close"
                        >
                          <Text style={styles.detailSheetFooterBtnSecondaryText}>Close</Text>
                        </TouchableOpacity>
                        {linked ? (
                          <TouchableOpacity
                            style={[
                              styles.detailSheetFooterBtnSecondary,
                              styles.detailSheetFooterBtnFlex,
                              styles.detailSheetFooterBtnOutline,
                            ]}
                            onPress={() => {
                              closeDetailSheet();
                              navigation.navigate('WorkoutDetail', { workoutId: linked.id });
                            }}
                            accessibilityRole="button"
                          >
                            <Text style={styles.detailSheetFooterBtnOutlineText}>Workout details</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </>
                  )}
                </View>
              </Pressable>
            );
          })()}
        </Pressable>
      </Modal>

      {/* Rest day sheet — compact, with "Make this a workout day" CTA */}
      <Modal visible={!!restSheetWorkout} transparent animationType="fade">
        <Pressable style={styles.detailSheetOverlay} onPress={closeRestSheet}>
          {restSheetWorkout && (
            <Pressable style={styles.restSheetBox} onPress={(e) => e.stopPropagation()}>
              <View style={styles.detailSheetTitleRow}>
                <View
                  style={[
                    styles.detailSheetHeroIcon,
                    { backgroundColor: colors.secondary + '22' },
                  ]}
                >
                  <Ionicons name="moon-outline" size={26} color={colors.secondary} />
                </View>
                <View style={styles.detailSheetHeroText}>
                  <Text style={styles.detailSheetEyebrow}>REST</Text>
                  <Text style={styles.detailSheetTitle}>Rest Day</Text>
                  <Text style={styles.detailSheetSubLine}>
                    {restSheetWorkout.day} • {restSheetWorkout.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </View>
              </View>
              <View style={styles.restSheetBody}>
                <Text style={styles.restSheetBodyText}>
                  Recovery — optional easy walk or mobility today.
                </Text>
              </View>
              <View style={styles.detailSheetFooter}>
                <TouchableOpacity
                  style={styles.detailSheetPrimaryFull}
                  onPress={() => {
                    const day = restSheetWorkout.day;
                    closeRestSheet();
                    handleAddWorkoutForDay(day);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Make this a workout day"
                >
                  <Text style={styles.detailSheetPrimaryText}>Make this a workout day</Text>
                </TouchableOpacity>
                <View style={styles.detailSheetLinkRow}>
                  <TouchableOpacity
                    style={[styles.detailSheetFooterBtnSecondary, styles.detailSheetFooterBtnFlex]}
                    onPress={closeRestSheet}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    <Text style={styles.detailSheetFooterBtnSecondaryText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Pressable>
          )}
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

      {currentPlan?.id ? (
        <ShareModal
          visible={shareModalVisible}
          onClose={() => setShareModalVisible(false)}
          kind="plan"
          targetId={currentPlan.id}
          targetName={currentPlan.name ?? 'My Plan'}
        />
      ) : null}

      {/* Drag ghost card — floats above everything while dragging */}
      {draggingSlot && (
        <Animated.View
          style={[
            ghostAnimatedStyle,
            { width: '91%', shadowColor: colors.shadow, ...elevation.level3 },
          ]}
          pointerEvents="none"
        >
          <WorkoutDayRow
            dayLabel={null}
            kind={isRestPlanSlotTitle(draggingSlot.workout.title) ? 'rest' : 'workout'}
            type={draggingSlot.workout.type}
            title={isRestPlanSlotTitle(draggingSlot.workout.title) ? 'Rest day' : draggingSlot.workout.title}
            etaMinutes={
              isRestPlanSlotTitle(draggingSlot.workout.title)
                ? null
                : planSlotEtaMinutesDisplay(draggingSlot.workout)
            }
            isToday={false}
            isCompleted={false}
            isBeingDragged={false}
          />
        </Animated.View>
      )}
    </View>
  );
}
