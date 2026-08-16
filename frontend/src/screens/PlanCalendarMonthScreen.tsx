import React, { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import SavedWorkoutsScreen from './SavedWorkoutsScreen';
import ShareModal from '../components/ShareModal';
import PlanCalendarScopeBar from '../components/PlanCalendarScopeBar';
import {
  elevation,
  radius,
  spacing,
  text,
  tracking,
  useTheme,
  weight,
  type ColorPalette,
} from '../theme';
import { useTabBarInset } from '../navigation/useTabBarInset';
import {
  GOLD,
  MUSCLE_COLORS,
  MUSCLE_EDGE,
  MUSCLE_INK,
  buzzSelection,
  dayMuscles,
  isToday,
  fromIso,
  mondayOf,
  monthGrid,
  monthLabel,
  sfPro,
  todayIso,
  toIso,
  type PlanCalendarParamList,
  type PrototypeMuscle,
} from '../lib/planCalendarPrototype';
import {
  calendarDataMode,
  ensureLogsForMonth,
  getLivePlan,
  isDayCompleted,
  plannedDayForDate,
  refreshLiveCalendarData,
  subscribePlanCalendar,
} from '../lib/planCalendarPrototypeStore';

type Nav = NativeStackNavigationProp<PlanCalendarParamList, 'PlanCalendarMonth'>;

const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
/** Dots per calendar cell — more than 3 reads as noise at this size. */
const MAX_DOTS = 3;

/**
 * PROTOTYPE — month overview for the Calendar tab. Each trained day carries
 * the colour dots of its muscles; tapping any week row drills into the Week
 * screen. This is the screen "back" from the week lands on.
 */
export default function PlanCalendarMonthScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const tabBarInset = useTabBarInset();

  // Re-render when a replacement lands, so day dots track the actual muscles.
  const [, forceRender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribePlanCalendar(forceRender), []);

  const route = useRoute<RouteProp<PlanCalendarParamList, 'PlanCalendarMonth'>>();
  const [month, setMonth] = useState(() => {
    const base = route.params?.monthIso ? fromIso(route.params.monthIso) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const weeks = useMemo(() => monthGrid(month), [month]);
  // The full palette (not just the sample split's muscles): with a real plan
  // loaded, any muscle can appear.
  const legend = useMemo(() => Object.keys(MUSCLE_COLORS) as PrototypeMuscle[], []);

  // Real data: active plan (refetched on focus, throttled) + logs per month.
  useFocusEffect(
    useCallback(() => {
      refreshLiveCalendarData();
    }, []),
  );
  useEffect(() => {
    ensureLogsForMonth(month);
  }, [month]);

  const livePlan = getLivePlan();

  // Header toolbar: liked (saved workouts) + share plan, next to "Calendar".
  const [savedVisible, setSavedVisible] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        // Symmetric spacing: gap between the icons, no edge padding — the
        // bar (and the iOS 26 glass pill it groups these into) supplies the
        // outer margins. One-sided padding here read as the share icon
        // hugging the pill's right edge while the heart floated.
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <TouchableOpacity
            onPress={() => setSavedVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Saved workouts"
            hitSlop={12}
            style={{ paddingVertical: spacing.xs }}
          >
            <Ionicons name="heart-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
          {livePlan?.id ? (
            <TouchableOpacity
              onPress={() => setShareVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Share plan"
              hitSlop={12}
              style={{ paddingVertical: spacing.xs }}
            >
              <Ionicons name="share-outline" size={22} color={colors.primary} />
            </TouchableOpacity>
          ) : null}
        </View>
      ),
    });
  }, [navigation, colors.primary, livePlan?.id]);

  const shiftMonth = (by: number) =>
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + by, 1));

  const now = new Date();
  const isCurrentMonth =
    month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth();

  // Horizontal swipe pages between months (vertical scrolling wins otherwise).
  // On web the browser can still deliver a CLICK to whatever ends up under the
  // release point of the re-rendered grid — `lastSwipeAt` lets cells swallow it.
  const lastSwipeAt = useRef(0);
  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-24, 24])
        .failOffsetY([-16, 16])
        .onEnd((e) => {
          if (Math.abs(e.translationX) >= 50) {
            lastSwipeAt.current = Date.now();
            // The page-turn tick — only when the swipe actually commits.
            buzzSelection();
          }
          if (e.translationX <= -50) shiftMonth(1);
          else if (e.translationX >= 50) shiftMonth(-1);
        }),
    [],
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refreshLiveCalendarData(true);
    setTimeout(() => setRefreshing(false), 900);
  }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: spacing.xxxl + tabBarInset }]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />
      }
    >
      <View style={styles.scopeBarWrap}>
        <PlanCalendarScopeBar
          active="month"
          onNavigate={(scope) => {
            if (scope === 'week') {
              navigation.navigate('PlanCalendarWeek', {
                weekMondayIso: toIso(mondayOf(new Date())),
              });
            } else if (scope === 'day') {
              navigation.navigate('PlanCalendarDay', { dateIso: todayIso() });
            }
          }}
        />
      </View>

      <View style={styles.monthRow}>
        <Text style={styles.monthTitle}>{monthLabel(month)}</Text>
        {!isCurrentMonth && (
          <TouchableOpacity
            onPress={() => setMonth(new Date(now.getFullYear(), now.getMonth(), 1))}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Jump to today"
            style={styles.todayButton}
          >
            <Text style={styles.todayButtonLabel}>Today</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => shiftMonth(-1)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => shiftMonth(1)}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          style={styles.nextMonthButton}
        >
          <Ionicons name="chevron-forward" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <GestureDetector gesture={swipe}>
      {/* Keyed by month so paging cross-fades instead of hard-cutting. */}
      <Animated.View
        key={toIso(month)}
        entering={FadeIn.duration(200)}
        style={styles.gridCard}
      >
        <View style={styles.weekdayHeader}>
          {WEEKDAY_INITIALS.map((d, i) => (
            <Text key={`${d}-${i}`} style={styles.weekdayInitial}>
              {d}
            </Text>
          ))}
        </View>

        {weeks.map((week, wi) => (
          <View key={toIso(week[0])} style={[styles.weekRow, wi > 0 && styles.weekRowDivider]}>
            {week.map((date) => {
              const iso = toIso(date);
              const inMonth = date.getMonth() === month.getMonth();
              const today = isToday(iso);
              const muscles = dayMuscles(plannedDayForDate(iso));
              const completed = isDayCompleted(iso);
              // A skipped past workout day recedes (muted dots) — distinct
              // from completed (gold ring) and upcoming (full colour).
              const missed = muscles.length > 0 && !completed && iso < todayIso();
              return (
                <Pressable
                  key={iso}
                  style={({ pressed }) => [styles.dayCell, pressed && styles.dayCellPressed]}
                  onPress={() => {
                    if (Date.now() - lastSwipeAt.current < 450) return;
                    navigation.navigate('PlanCalendarDay', { dateIso: iso });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${iso}${completed ? ', completed' : ''}`}
                >
                  <View
                    style={[
                      styles.dayNumberWrap,
                      today && styles.todayNumberWrap,
                      // Today renders full-strength even as an adjacent-month
                      // cell, so its ring must too — never the faded variant.
                      completed &&
                        (inMonth || today ? styles.completedRing : styles.completedRingOutMonth),
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayNumber,
                        !inMonth && styles.outMonthNumber,
                        today && styles.todayNumber,
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                  </View>
                  <View style={styles.dotsRow}>
                    {muscles.slice(0, MAX_DOTS).map((m) => (
                      <View
                        key={m}
                        style={[
                          styles.dot,
                          { backgroundColor: MUSCLE_COLORS[m], borderColor: MUSCLE_EDGE[m] },
                          !inMonth && styles.outMonthDot,
                          missed && styles.missedDot,
                        ]}
                      />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </Animated.View>
      </GestureDetector>
      <Text style={styles.gridHint}>Tap a day to see its workout</Text>

      {calendarDataMode() !== 'empty' && (
      <>
      <Text style={styles.sectionLabel}>MUSCLE COLORS</Text>
      <View style={styles.legendCard}>
        {legend.map((m) => (
          <View
            key={m}
            style={[
              styles.chip,
              { backgroundColor: MUSCLE_COLORS[m], borderColor: MUSCLE_EDGE[m] },
            ]}
          >
            <Text style={[styles.chipLabel, { color: MUSCLE_INK[m] }]}>{m}</Text>
          </View>
        ))}
      </View>
      </>
      )}

      <Text style={styles.sectionLabel}>PLANNING</Text>
      <View style={styles.planningCard}>
        <TouchableOpacity
          style={styles.planningRow}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('GeneratePlan')}
          accessibilityRole="button"
          accessibilityLabel="Generate a plan"
        >
          <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
          <Text style={styles.planningLabel}>Generate a Plan</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.planningRow, styles.planningRowDivider]}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('Templates')}
          accessibilityRole="button"
          accessibilityLabel="Workout templates"
        >
          <Ionicons name="albums-outline" size={20} color={colors.primary} />
          <Text style={styles.planningLabel}>Workout Templates</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>

      <Text style={styles.footerNote}>
        {livePlan
          ? `Plan: ${livePlan.name}`
          : calendarDataMode() === 'offline'
            ? 'Offline — can’t reach the server'
            : 'No active plan yet — start with Planning above'}
      </Text>

      {/* Liked (saved) workouts — the old Plan-tab heart, same modal. */}
      <Modal
        visible={savedVisible}
        animationType="slide"
        onRequestClose={() => setSavedVisible(false)}
      >
        <SavedWorkoutsScreen
          onClose={() => setSavedVisible(false)}
          onSelectWorkout={(workoutId) => {
            setSavedVisible(false);
            navigation.navigate('WorkoutDetail', { workoutId });
          }}
        />
      </Modal>
      {livePlan?.id ? (
        <ShareModal
          visible={shareVisible}
          onClose={() => setShareVisible(false)}
          kind="plan"
          targetId={livePlan.id}
          targetName={livePlan.name ?? 'My Plan'}
        />
      ) : null}
    </ScrollView>
  );
}

function createStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    content: {
      padding: spacing.lg,
    },
    scopeBarWrap: {
      marginBottom: spacing.lg,
    },
    monthRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.md,
      paddingHorizontal: spacing.xs,
    },
    monthTitle: {
      ...sfPro,
      flex: 1,
      fontSize: text.title,
      lineHeight: 28,
      fontWeight: weight.bold,
      color: c.text,
    },
    nextMonthButton: {
      marginLeft: spacing.lg,
    },
    gridCard: {
      backgroundColor: c.surface,
      borderRadius: radius.xl,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xs,
      shadowColor: c.shadow,
      ...elevation.level1,
    },
    weekdayHeader: {
      flexDirection: 'row',
      paddingBottom: spacing.xs,
    },
    weekdayInitial: {
      ...sfPro,
      flex: 1,
      textAlign: 'center',
      fontSize: text.caption,
      fontWeight: weight.semibold,
      letterSpacing: tracking.wide,
      color: c.textMuted,
    },
    weekRow: {
      flexDirection: 'row',
      borderRadius: radius.md,
    },
    weekRowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    dayCell: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
    },
    dayCellPressed: {
      backgroundColor: c.background,
    },
    /** Fitness-style "ring closed": a gold ring circles a logged day's date.
     *  (Replaced the strikethrough, which read as cancelled, not done.) A
     *  completed today keeps its blue fill and gains the ring, so both facts
     *  read at once. */
    completedRing: {
      borderWidth: 2,
      borderColor: GOLD,
    },
    /** Adjacent-month cells recede — ring at ~35%, matching outMonthDot. */
    completedRingOutMonth: {
      borderWidth: 2,
      borderColor: GOLD + '59',
    },
    dayNumberWrap: {
      width: 28,
      height: 28,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    todayNumberWrap: {
      backgroundColor: c.primary,
    },
    dayNumber: {
      ...sfPro,
      fontSize: text.callout,
      color: c.text,
    },
    outMonthNumber: {
      color: c.textMuted,
      opacity: 0.5,
    },
    todayNumber: {
      color: c.onPrimary,
      fontWeight: weight.semibold,
    },
    dotsRow: {
      flexDirection: 'row',
      gap: spacing.xxs,
      height: 6,
      marginTop: spacing.xxs,
    },
    dot: {
      width: 5,
      height: 5,
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
    },
    outMonthDot: {
      opacity: 0.35,
    },
    missedDot: {
      opacity: 0.35,
    },
    todayButton: {
      marginRight: spacing.lg,
    },
    todayButtonLabel: {
      ...sfPro,
      fontSize: text.body,
      fontWeight: weight.semibold,
      color: c.primary,
    },
    gridHint: {
      ...sfPro,
      fontSize: text.footnote,
      color: c.textMuted,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
    sectionLabel: {
      ...sfPro,
      fontSize: text.caption,
      fontWeight: weight.semibold,
      letterSpacing: tracking.widest,
      color: c.textMuted,
      marginTop: spacing.xxl,
      marginBottom: spacing.sm,
      marginLeft: spacing.md,
    },
    legendCard: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      shadowColor: c.shadow,
      ...elevation.level1,
    },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      borderWidth: 1,
    },
    chipLabel: {
      ...sfPro,
      fontSize: text.footnote,
      fontWeight: weight.semibold,
    },
    planningCard: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.lg,
      shadowColor: c.shadow,
      ...elevation.level1,
    },
    planningRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.lg,
    },
    planningRowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    planningLabel: {
      ...sfPro,
      flex: 1,
      fontSize: text.callout,
      fontWeight: weight.semibold,
      color: c.text,
    },
    footerNote: {
      ...sfPro,
      fontSize: text.caption,
      color: c.textMuted,
      textAlign: 'center',
      marginTop: spacing.xl,
    },
  });
}
