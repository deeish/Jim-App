import React, { useState, useCallback } from 'react';
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
import { colors } from '../theme/colors';

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

// Placeholder plan state (would come from API/context in real app)
const initialPlan: Record<string, PlanWorkout[]> = {
  Monday: [
    { id: 'm1', title: 'Recovery Day', detailLine: 'Stretch & mobility', iconColor: '#9B59B6', durationMinutes: 15, intensity: 'Easy', type: 'recovery' },
  ],
  Tuesday: [
    { id: 't1', title: 'Interval Swim', detailLine: '4x 200m (1,600 total)', iconColor: '#3498DB', durationMinutes: 45, intensity: 'Hard', type: 'cardio' },
    { id: 't2', title: 'Easy Bike', detailLine: 'Zone 2', iconColor: '#2ECC71', durationMinutes: 50, intensity: 'Easy', type: 'cardio' },
  ],
  Wednesday: [
    { id: 'w1', title: 'Interval Run', detailLine: '6×1 min hard', iconColor: '#E67E22', durationMinutes: 40, intensity: 'Hard', type: 'cardio' },
  ],
  Thursday: [
    { id: 'th1', title: 'Long Bike', detailLine: 'Steady pace', iconColor: '#2ECC71', durationMinutes: 90, intensity: 'Medium', type: 'cardio' },
  ],
  Friday: [
    { id: 'f1', title: 'Upper Body', detailLine: '6 exercises · push focus', iconColor: '#C7A46A', durationMinutes: 60, intensity: 'Hard', type: 'strength' },
  ],
  Saturday: [
    { id: 's1', title: 'Long Run', detailLine: 'Easy pace', iconColor: '#E67E22', durationMinutes: 60, intensity: 'Easy', type: 'cardio' },
  ],
  Sunday: [
    { id: 'su1', title: 'Rest Day', detailLine: '—', iconColor: '#95A5A6', durationMinutes: 0, intensity: 'Easy', type: 'recovery' },
  ],
};

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

export default function PlanScreen() {
  const [selectedWeek, setSelectedWeek] = useState(0);
  const [plan, setPlan] = useState<Record<string, PlanWorkout[]>>(initialPlan);
  const [contextWorkout, setContextWorkout] = useState<{ workout: PlanWorkout; day: string } | null>(null);
  const [workoutToMove, setWorkoutToMove] = useState<{ workout: PlanWorkout; day: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [showBackToBackModal, setShowBackToBackModal] = useState(false);
  const contentScrollRef = React.useRef<ScrollView>(null);
  const weekRange = getWeekDateRange(selectedWeek);
  const loadBalance = computeLoadBalance(plan);
  const backToBackSuggestions = getBackToBackSuggestions(plan);
  const backToBackHard = backToBackSuggestions.length > 0;
  const isCurrentWeek = selectedWeek === 0;

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
    if (!workoutToMove || toDay === workoutToMove.day) {
      setWorkoutToMove(null);
      return;
    }
    const fromDay = workoutToMove.day;
    const workout = workoutToMove.workout;
    setPlan(prev => {
      const next = { ...prev };
      next[fromDay] = (next[fromDay] || []).filter(w => w.id !== workout.id);
      next[toDay] = [...(next[toDay] || []), workout];
      return next;
    });
    setWorkoutToMove(null);
  }, [workoutToMove]);

  const handleDuplicate = useCallback(() => {
    if (!contextWorkout) return;
    const { workout, day } = contextWorkout;
    const copy = { ...workout, id: `${workout.id}-copy-${Date.now()}` };
    setPlan(prev => ({
      ...prev,
      [day]: [...(prev[day] || []), copy],
    }));
    closeContextMenu();
  }, [contextWorkout, closeContextMenu]);

  const handleDelete = useCallback(() => {
    if (!contextWorkout) return;
    Alert.alert('Delete workout', `Remove "${contextWorkout.workout.title}" from ${contextWorkout.day}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setPlan(prev => ({
            ...prev,
            [contextWorkout.day]: (prev[contextWorkout.day] || []).filter(w => w.id !== contextWorkout.workout.id),
          }));
          closeContextMenu();
        },
      },
    ]);
  }, [contextWorkout, closeContextMenu]);

  const handleMarkRestDay = useCallback(() => {
    if (!contextWorkout) return;
    const { day } = contextWorkout;
    setPlan(prev => ({
      ...prev,
      [day]: [{ id: `rest-${day}-${Date.now()}`, title: 'Rest Day', detailLine: '—', iconColor: '#95A5A6', durationMinutes: 0, intensity: 'Easy', type: 'recovery' as WorkoutType }],
    }));
    closeContextMenu();
  }, [contextWorkout, closeContextMenu]);

  const handleAddOrGenerate = useCallback(() => {
    setAdding(true);
    Alert.alert('Add workout', 'Add workout or Generate with AI would open here.', [
      { text: 'OK', onPress: () => setAdding(false) },
    ]);
  }, []);

  const jumpToCurrentWeek = useCallback(() => {
    setSelectedWeek(0);
    contentScrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  const applyBackToBackFix = useCallback((s: BackToBackSuggestion) => {
    if (s.kind === 'move') {
      setPlan(prev => {
        const next = { ...prev };
        next[s.fromDay] = (next[s.fromDay] || []).filter(w => w.id !== s.workout.id);
        next[s.toDay] = [...(next[s.toDay] || []), s.workout];
        return next;
      });
    } else {
      setPlan(prev => {
        const next = { ...prev };
        const a = next[s.dayA] || [];
        const b = next[s.dayB] || [];
        next[s.dayA] = b;
        next[s.dayB] = a;
        return next;
      });
    }
    setShowBackToBackModal(false);
  }, []);

  return (
    <View style={styles.container}>
      {/* Planner header: goal + compact CTAs */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerTitles}>
            <Text style={styles.headerTitle}>Weekly Sprint</Text>
            <Text style={styles.goalContext}>{GOAL_CONTEXT}</Text>
            <View style={styles.loadBalance}>
              <Text style={styles.loadBalanceText}>Strength {loadBalance.strength}</Text>
              <Text style={styles.loadBalanceDot}>•</Text>
              <Text style={styles.loadBalanceText}>Cardio {loadBalance.cardio}</Text>
              <Text style={styles.loadBalanceDot}>•</Text>
              <Text style={styles.loadBalanceText}>Recovery {loadBalance.recovery}</Text>
            </View>
          </View>
          <View style={styles.ctaRow}>
            <TouchableOpacity
              style={styles.ctaCompact}
              onPress={handleAddOrGenerate}
              disabled={adding}
            >
              {adding ? <ActivityIndicator size="small" color={colors.background} /> : <Text style={styles.ctaCompactText}>+ Add</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.ctaCompact, styles.ctaSecondary]} onPress={handleAddOrGenerate}>
              <Text style={styles.ctaCompactTextSecondary}>AI Generate</Text>
            </TouchableOpacity>
          </View>
        </View>
        {backToBackHard && (
          <TouchableOpacity
            style={styles.backToBackWarning}
            onPress={() => setShowBackToBackModal(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.backToBackWarningText}>⚠ Back-to-back hard days — tap to fix</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Week nav: ‹ Prev | Week of Jan 26 – Feb 1 | Next › */}
      <View style={styles.weekRow}>
        <TouchableOpacity style={styles.weekNavArrow} onPress={() => setSelectedWeek(Math.max(0, selectedWeek - 1))}>
          <Text style={styles.weekNavArrowText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.weekNavCenter}>
          <Text style={styles.weekNavLabel}>Week of {formatWeekRange(weekRange.start, weekRange.end)}</Text>
          {!isCurrentWeek && (
            <TouchableOpacity style={styles.jumpToCurrent} onPress={jumpToCurrentWeek}>
              <Text style={styles.jumpToCurrentText}>Today</Text>
            </TouchableOpacity>
          )}
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
          const totalMin = workouts.reduce((s, w) => s + w.durationMinutes, 0);
          const sessionCount = workouts.length;
          const intensityLabel = workouts.some(w => w.intensity === 'Hard') ? 'Hard' : workouts.some(w => w.intensity === 'Medium') ? 'Medium' : 'Easy';

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
                {workouts.length > 0 ? (
                  <Text style={styles.daySummary}>
                    {totalMin > 0 ? `${totalMin} min` : '—'} · {sessionCount} {sessionCount === 1 ? 'session' : 'sessions'} · {intensityLabel}
                  </Text>
                ) : null}
              </View>

              {workouts.length === 0 ? (
                <TouchableOpacity
                  style={styles.emptyDay}
                  onPress={handleAddOrGenerate}
                  activeOpacity={0.7}
                >
                  <Text style={styles.emptyDayText}>No workout planned</Text>
                  <Text style={styles.emptyDayHint}>Add / Generate / Rest day</Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.workoutStack, workouts.length > 1 && styles.workoutStackTight]}>
                  {workouts.map((workout) => (
                    <Pressable
                      key={workout.id}
                      style={({ pressed }) => [styles.workoutCard, pressed && styles.workoutCardPressed]}
                      onPress={() => handleCardPress(workout, day)}
                    >
                      <View style={[styles.workoutIcon, { backgroundColor: workout.iconColor }]}>
                        <View style={styles.iconPlaceholder} />
                      </View>
                      <View style={styles.workoutContent}>
                        <Text style={styles.workoutTitle}>{workout.title}</Text>
                        <Text style={styles.workoutDetailLine}>{workout.detailLine}</Text>
                      </View>
                      <TouchableOpacity
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        style={styles.moreButton}
                        onPress={() => openContextMenu(workout, day)}
                      >
                        <Text style={styles.moreButtonText}>⋯</Text>
                      </TouchableOpacity>
                    </Pressable>
                  ))}
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
            <Text style={styles.backToBackTitle}>Ease back-to-back hard days</Text>
            <Text style={styles.backToBackSubtitle}>Pick a fix or dismiss</Text>
            {backToBackSuggestions.map((s, i) => (
              <TouchableOpacity
                key={i}
                style={styles.backToBackOption}
                onPress={() => applyBackToBackFix(s)}
              >
                <Text style={styles.backToBackOptionText}>
                  {s.kind === 'move'
                    ? `Move ${s.workout.title} (${s.fromDay}) → ${s.toDay}`
                    : `Swap ${s.dayA} & ${s.dayB}`}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.backToBackDismiss} onPress={() => setShowBackToBackModal(false)}>
              <Text style={styles.moveCancelText}>Dismiss</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.surface,
    padding: 16,
    paddingTop: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerTitles: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  goalContext: {
    fontSize: 12,
    color: colors.primary,
    marginTop: 4,
    fontWeight: '600',
  },
  loadBalance: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  loadBalanceText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  loadBalanceDot: {
    fontSize: 11,
    color: colors.textMuted,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
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
  ctaCompactText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.background,
  },
  ctaCompactTextSecondary: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  backToBackWarning: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(217, 119, 69, 0.2)',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  backToBackWarningText: {
    fontSize: 12,
    color: colors.warning,
    fontWeight: '500',
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  weekNavArrow: {
    padding: 8,
    minWidth: 40,
    alignItems: 'center',
  },
  weekNavArrowText: {
    fontSize: 24,
    color: colors.primary,
    fontWeight: '600',
  },
  weekNavCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  weekNavLabel: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '600',
  },
  jumpToCurrent: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.secondary,
  },
  jumpToCurrentText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.background,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  daySection: {
    marginBottom: 22,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 10,
    flexWrap: 'wrap',
    gap: 6,
  },
  dayTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dayTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  todayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  todayDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.background,
  },
  todayText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.background,
  },
  daySummary: {
    fontSize: 12,
    color: colors.textMuted,
  },
  emptyDay: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  emptyDayText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyDayHint: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  workoutStack: {
    gap: 12,
  },
  workoutStackTight: {
    gap: 6,
  },
  workoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    paddingRight: 40,
    elevation: 2,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    position: 'relative',
  },
  workoutCardPressed: {
    opacity: 0.85,
  },
  workoutIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconPlaceholder: {
    width: 26,
    height: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 4,
  },
  workoutContent: {
    flex: 1,
  },
  workoutTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  workoutDetailLine: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  moreButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 4,
  },
  moreButtonText: {
    fontSize: 18,
    color: colors.textMuted,
    fontWeight: '700',
  },
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
  menuItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuItemText: {
    fontSize: 16,
    color: colors.text,
  },
  menuItemTextMuted: {
    fontSize: 16,
    color: colors.textMuted,
  },
  menuItemDanger: {
    color: colors.error,
  },
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
  moveTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    padding: 16,
    paddingBottom: 8,
  },
  moveDayItem: {
    padding: 14,
    paddingLeft: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  moveDayText: {
    fontSize: 16,
    color: colors.text,
  },
  moveCancel: {
    padding: 16,
    alignItems: 'center',
  },
  moveCancelText: {
    fontSize: 16,
    color: colors.textMuted,
  },
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
  },
  backToBackSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  backToBackOption: {
    padding: 14,
    paddingLeft: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  backToBackOptionText: {
    fontSize: 15,
    color: colors.primary,
    fontWeight: '600',
  },
  backToBackDismiss: {
    padding: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
