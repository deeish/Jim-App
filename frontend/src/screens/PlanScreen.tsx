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
import { useFocusEffect } from '@react-navigation/native';
import type { RootStackParamList } from '../types/navigation';
import { useTheme } from '../theme/ThemeContext';
import { getCurrentPlan } from '../services/planService';
import type { ApiPlanWorkout } from '../services/planService';
import LoadingSpinner from '../components/LoadingSpinner';

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
}

// Get Monday of the week containing d
function getWeekStart(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function getWeekDateRange(weekIndex: number): { start: Date; end: Date } {
  const today = new Date();
  const thisMonday = getWeekStart(today);
  const start = new Date(thisMonday);
  start.setDate(start.getDate() + weekIndex * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start, end };
}

function formatWeekRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}

function getDateForDay(weekIndex: number, dayName: string): Date {
  const { start } = getWeekDateRange(weekIndex);
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

type BackToBackSuggestion = { kind: 'move'; fromDay: string; toDay: string; workout: PlanWorkout } | { kind: 'swap'; dayA: string; dayB: string };

function getBackToBackSuggestions(plan: Record<string, PlanWorkout[]>): BackToBackSuggestion[] {
  const out: BackToBackSuggestion[] = [];
  for (let i = 0; i < DAYS_OF_WEEK.length - 1; i++) {
    const dayA = DAYS_OF_WEEK[i];
    const dayB = DAYS_OF_WEEK[i + 1];
    const workoutsA = plan[dayA] || [];
    const workoutsB = plan[dayB] || [];
    const hardA = workoutsA.filter(w => w.intensity === 'Hard');
    const hardB = workoutsB.filter(w => w.intensity === 'Hard');
    if (hardA.length && hardB.length) {
      if (hardA.length === 1) out.push({ kind: 'move', fromDay: dayA, toDay: dayB, workout: hardA[0] });
      if (hardB.length === 1) out.push({ kind: 'move', fromDay: dayB, toDay: dayA, workout: hardB[0] });
      out.push({ kind: 'swap', dayA, dayB });
      break; // only first back-to-back pair
    }
  }
  return out;
}

function hasBackToBackHardDays(plan: Record<string, PlanWorkout[]>): boolean {
  return getBackToBackSuggestions(plan).length > 0;
}

const GOAL_CONTEXT = 'Fat loss • 4x/week • Beginner';

type Props = {
  navigation?: PlanScreenNavigationProp;
};

const EMPTY_PLAN: Record<string, PlanWorkout[]> = {
  Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], Sunday: [],
};

export default function PlanScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const [selectedWeek, setSelectedWeek] = useState(0);
  const [planByWeek, setPlanByWeek] = useState<Record<number, Record<string, PlanWorkout[]>>>({});
  const [planLoading, setPlanLoading] = useState(true);
  const [planError, setPlanError] = useState<string | null>(null);
  const [contextWorkout, setContextWorkout] = useState<{ workout: PlanWorkout; day: string } | null>(null);
  const [workoutToMove, setWorkoutToMove] = useState<{ workout: PlanWorkout; day: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [showBackToBackModal, setShowBackToBackModal] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const contentScrollRef = React.useRef<ScrollView>(null);

  const loadPlan = useCallback(async () => {
    setPlanLoading(true);
    setPlanError(null);
    try {
      const apiPlan = await getCurrentPlan();
      if (apiPlan?.planWorkouts?.length) {
        setPlanByWeek(planWorkoutsToByWeek(apiPlan.planWorkouts));
      } else {
        setPlanByWeek({});
      }
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
    }, [loadPlan])
  );

  const plan = useMemo(() => {
    const weekNum = selectedWeek + 1;
    return planByWeek[weekNum] ?? EMPTY_PLAN;
  }, [planByWeek, selectedWeek]);

  const weekRange = getWeekDateRange(selectedWeek);
  const loadBalance = computeLoadBalance(plan);
  const backToBackSuggestions = getBackToBackSuggestions(plan);
  const backToBackHard = backToBackSuggestions.length > 0;
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
        calendarIconButton: { padding: 8 },
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
        backToBackWarning: {
          marginTop: 8,
          paddingHorizontal: 10,
          paddingVertical: 6,
          backgroundColor: 'rgba(217, 119, 69, 0.2)',
          borderRadius: 8,
          alignSelf: 'flex-start',
        },
        backToBackWarningText: { fontSize: 12, color: colors.warning, fontWeight: '500' },
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
        backToBackBox: {
          backgroundColor: colors.surface,
          borderRadius: 12,
          width: '100%',
          maxWidth: 320,
          overflow: 'hidden',
        },
        backToBackTitle: {
          fontSize: 18,
          fontWeight: '700',
          color: colors.text,
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 8,
        },
        backToBackOption: { padding: 14, paddingLeft: 16, borderTopWidth: 1, borderTopColor: colors.border },
        backToBackOptionText: { fontSize: 15, color: colors.primary, fontWeight: '600' },
        backToBackDismiss: { padding: 16, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border },
      }),
    [colors]
  );

  const handleCardPress = useCallback((workout: PlanWorkout, day: string) => {
    // Navigate to workout detail or open sheet (placeholder)
    Alert.alert(workout.title, workout.detailLine, [{ text: 'OK' }]);
  }, []);

  const openContextMenu = useCallback((workout: PlanWorkout, day: string, e?: any) => {
    setContextWorkout({ workout, day });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextWorkout(null);
  }, []);

  const handleMove = useCallback(() => {
    if (!contextWorkout) return;
    setWorkoutToMove(contextWorkout);
    closeContextMenu();
  }, [contextWorkout, closeContextMenu]);

  const confirmMove = useCallback((toDay: string) => {
    setWorkoutToMove(null);
    Alert.alert('Plan is read-only', 'To change your plan, use Generate Plan then Apply to Plan.');
  }, []);

  const handleDuplicate = useCallback(() => {
    closeContextMenu();
    Alert.alert('Plan is read-only', 'To change your plan, use Generate Plan then Apply to Plan.');
  }, [closeContextMenu]);

  const handleDelete = useCallback(() => {
    closeContextMenu();
    Alert.alert('Plan is read-only', 'To change your plan, use Generate Plan then Apply to Plan.');
  }, [closeContextMenu]);

  const handleMarkRestDay = useCallback(() => {
    closeContextMenu();
    Alert.alert('Plan is read-only', 'To change your plan, use Generate Plan then Apply to Plan.');
  }, [closeContextMenu]);

  const handleAddOrGenerate = useCallback(() => {
    setAdding(true);
    Alert.alert('Add workout', 'Add workout or Generate with AI would open here.', [
      { text: 'OK', onPress: () => setAdding(false) },
    ]);
  }, []);

  const handleAIGenerate = useCallback(() => {
    navigation?.navigate('GeneratePlan');
  }, [navigation]);

  const jumpToCurrentWeek = useCallback(() => {
    setSelectedWeek(0);
    contentScrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  const applyBackToBackFix = useCallback(() => {
    setShowBackToBackModal(false);
    Alert.alert('Plan is read-only', 'To change your plan, use Generate Plan then Apply to Plan.');
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
      {/* Compressed header: Weekly Sprint + subtitle only */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerTitles}>
            <Text style={styles.headerTitle}>Weekly Sprint</Text>
            <Text style={styles.goalContext}>{GOAL_CONTEXT}</Text>
          </View>
          <View style={styles.ctaRow}>
            <TouchableOpacity
              style={styles.calendarIconButton}
              onPress={() => navigation?.navigate('Calendar')}
              accessibilityLabel="Open calendar"
            >
              <Ionicons name="calendar-outline" size={22} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.ctaCompact}
              onPress={handleAddOrGenerate}
              disabled={adding}
            >
              {adding ? <ActivityIndicator size="small" color={colors.background} /> : <Text style={styles.ctaCompactText}>+ Add</Text>}
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
        
        {backToBackHard && (
          <TouchableOpacity
            style={styles.backToBackWarning}
            onPress={() => {
              // Option 1: Show manual fix modal (existing)
              // setShowBackToBackModal(true);
              
              // Option 2: Use AI Fix (new)
              navigation?.navigate('GeneratePlan', {
                // In a real implementation, pass context for AI Fix
                // For now, just navigate to generate
              } as any);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.backToBackWarningText}>⚠ Back-to-back hard days — tap to fix</Text>
          </TouchableOpacity>
        )}
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
                  <View style={styles.daySummaryRow}>
                    <Text style={styles.daySummary}>{daySummaryText}</Text>
                    {workouts.length > 1 && (
                      <Text style={styles.dayHelperText}> • {workouts.length} workouts</Text>
                    )}
                  </View>
                </View>
              </View>

              {workouts.length === 0 ? (
                <TouchableOpacity
                  style={styles.emptyDay}
                  onPress={handleAddOrGenerate}
                  activeOpacity={0.7}
                >
                  <Text style={styles.emptyDayAddIcon}>+</Text>
                  <Text style={styles.emptyDayText}>Add workout</Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.workoutStack, workouts.length > 1 && styles.workoutStackTight]}>
                  {workouts.map((workout) => {
                    const isRestDay = workout.title === 'Rest Day';
                    const showMoreButton = isToday; // Only show ... for Today's day
                    
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

      {/* Context menu modal */}
      <Modal visible={!!contextWorkout} transparent animationType="fade">
        <Pressable style={styles.menuOverlay} onPress={closeContextMenu}>
          <View style={styles.menuBox}>
            <TouchableOpacity style={styles.menuItem} onPress={handleMove}>
              <Text style={styles.menuItemText}>Move to another day</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleDuplicate}>
              <Text style={styles.menuItemText}>Duplicate</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem}>
              <Text style={styles.menuItemText}>Replace</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
              <Text style={[styles.menuItemText, styles.menuItemDanger]}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleMarkRestDay}>
              <Text style={styles.menuItemText}>Mark rest day</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={closeContextMenu}>
              <Text style={styles.menuItemTextMuted}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Move-to-day modal */}
      <Modal visible={!!workoutToMove} transparent animationType="fade">
        <View style={styles.moveOverlay}>
          <View style={styles.moveBox}>
            <Text style={styles.moveTitle}>Move to which day?</Text>
            {workoutToMove && DAYS_OF_WEEK.filter(d => d !== workoutToMove.day).map(d => (
              <TouchableOpacity
                key={d}
                style={styles.moveDayItem}
                onPress={() => confirmMove(d)}
              >
                <Text style={styles.moveDayText}>{d}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.moveCancel} onPress={() => setWorkoutToMove(null)}>
              <Text style={styles.moveCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Back-to-back hard days: actionable suggestions */}
      <Modal visible={showBackToBackModal} transparent animationType="fade">
        <Pressable style={styles.moveOverlay} onPress={() => setShowBackToBackModal(false)}>
          <Pressable style={styles.backToBackBox} onPress={() => {}}>
            <Text style={styles.backToBackTitle}>Fix suggestions</Text>
            {backToBackSuggestions.map((s, i) => (
              <TouchableOpacity
                key={i}
                style={styles.backToBackOption}
                onPress={() => applyBackToBackFix()}
              >
                <Text style={styles.backToBackOptionText}>
                  {s.kind === 'move'
                    ? `Move ${s.workout.title} from ${s.fromDay} to ${s.toDay}`
                    : `Swap ${s.dayA} with ${s.dayB}`}
                </Text>
              </TouchableOpacity>
            ))}
            {backToBackSuggestions.length > 0 && backToBackSuggestions[0].kind === 'move' && (
              <TouchableOpacity
                style={styles.backToBackOption}
                onPress={() => {
                  // Make Wednesday 'easy' instead - would need to modify workout intensity
                  setShowBackToBackModal(false);
                }}
              >
                <Text style={styles.backToBackOptionText}>
                  Make {backToBackSuggestions[0].kind === 'move' ? backToBackSuggestions[0].fromDay : 'Wednesday'} 'easy' instead
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.backToBackDismiss} onPress={() => setShowBackToBackModal(false)}>
              <Text style={styles.moveCancelText}>Dismiss</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
