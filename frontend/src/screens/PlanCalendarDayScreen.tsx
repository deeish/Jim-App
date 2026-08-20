import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  radius,
  spacing,
  text,
  useTheme,
  weight,
  type ColorPalette,
} from '../theme';
import { useTabBarInset } from '../navigation/useTabBarInset';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { CalendarScope } from '../components/PlanCalendarScopeBar';
import { SCOPE_BAR_SPACE, useFrozenScopeBar } from '../components/PlanCalendarScopeBarHost';
import {
  GOLD,
  MUSCLE_EDGE,
  MUSCLE_INK,
  addDays,
  buzzAllSetsComplete,
  buzzEditApplied,
  buzzMenuOpen,
  buzzSelection,
  buzzTap,
  fromIso,
  mondayOf,
  muscleChipFrost,
  muscleGradient,
  sfPro,
  shortDate,
  todayIso,
  toIso,
  type PlanCalendarParamList,
  type PlannedExercise,
} from '../lib/planCalendarPrototype';
import { LinearGradient } from 'expo-linear-gradient';
import WorkoutMoveSheet from '../components/WorkoutMoveSheet';
import QuickWorkoutSheet from '../components/QuickWorkoutSheet';
import {
  calendarDataMode,
  canRescueDay,
  ensureLogsForMonth,
  finishDaySession,
  getSetLogs,
  isDayLogged,
  moveMissedDay,
  moveTargetsForDay,
  plannedDayForDate,
  removeExerciseFromDay,
  subscribePlanCalendar,
} from '../lib/planCalendarPrototypeStore';

type Nav = NativeStackNavigationProp<PlanCalendarParamList, 'PlanCalendarDay'>;
type Route = RouteProp<PlanCalendarParamList, 'PlanCalendarDay'>;

/** The slot a long-press is acting on. */
type SlotTarget = { index: number; exercise: PlannedExercise };

/**
 * PROTOTYPE — one day of the plan: split colour-coded blocks (tap = workout
 * detail, hold = replace/remove), plus "+ Add Exercise". Replace/Add push the
 * library-as-picker sheet (PlanCalendarExercisePicker) — the full Exercises
 * library in selection mode with recommendations pinned on top.
 */
export default function PlanCalendarDayScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const tabBarInset = useTabBarInset();
  const insets = useSafeAreaInsets();

  // Re-render when a replacement/addition/live update lands in the store.
  const [, forceRender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribePlanCalendar(forceRender), []);

  const { dateIso } = route.params;
  const plan = plannedDayForDate(dateIso);
  const date = fromIso(dateIso);

  // Own the navigator's frozen Month|Week|Day bar while this screen is up.
  const onScopeNavigate = useCallback(
    (scope: CalendarScope) => {
      if (scope === 'week') {
        // Mirrors the header's "‹ Week": pop when the week is beneath,
        // otherwise swap this day for its week in place.
        const state = navigation.getState();
        const prev = state.index > 0 ? state.routes[state.index - 1] : undefined;
        if (prev?.name === 'PlanCalendarWeek' || prev?.name === 'PlanList') {
          navigation.goBack();
        } else {
          navigation.replace('PlanCalendarWeek', {
            weekMondayIso: toIso(mondayOf(fromIso(dateIso))),
          });
        }
      } else if (scope === 'month') {
        // Zoom all the way out: the month containing this day becomes
        // the stack root (the canonical top of the hierarchy).
        navigation.reset({
          index: 0,
          routes: [{ name: 'PlanCalendarMonth', params: { monthIso: dateIso } }],
        });
      }
    },
    [navigation, dateIso],
  );
  useFrozenScopeBar('day', onScopeNavigate);

  // A logged day must read as logged even when the app opens straight onto
  // it — without this only the MONTH screen ever fetched workout logs.
  useEffect(() => {
    ensureLogsForMonth(fromIso(dateIso));
  }, [dateIso]);

  /** Long-press menu (small sheet); Replace/Add push the picker screen. */
  const [menuFor, setMenuFor] = useState<SlotTarget | null>(null);

  // Quick Workout door on TODAY's rest day (the at-the-gym scenario).
  const [quickVisible, setQuickVisible] = useState(false);

  // Missed-day rescue: the banner's one-tap action + the shared sheet.
  const [rescueSheetOpen, setRescueSheetOpen] = useState(false);
  const [rescueBusy, setRescueBusy] = useState(false);
  const [rescueError, setRescueError] = useState('');
  const rescuable = canRescueDay(dateIso);
  // The banner's one-tap "Do it today" shows only when today is genuinely
  // OPEN (picker row 0's state): a logged or beyond-program today blocks it,
  // and an occupied today needs the make-room step — the sheet ("Options")
  // handles both instead of a silent double (see WorkoutMoveSheet).
  const todayOpen = rescuable && moveTargetsForDay()[0].state === 'open';
  const doItToday = async () => {
    if (rescueBusy) return;
    buzzTap();
    setRescueBusy(true);
    setRescueError('');
    try {
      await moveMissedDay(dateIso, todayIso());
      buzzEditApplied();
      // Follow the workout to where it went.
      navigation.setParams({ dateIso: todayIso() });
    } catch {
      setRescueError('Couldn’t move it — check your connection and try again.');
    } finally {
      setRescueBusy(false);
    }
  };

  const doneCount = plan.exercises.filter(
    (ex, i) => getSetLogs(dateIso, i).length >= ex.sets,
  ).length;
  const allDone = plan.exercises.length > 0 && doneCount === plan.exercises.length;
  const anyLogged = plan.exercises.some((_, i) => getSetLogs(dateIso, i).length > 0);
  const dayLogged = isDayLogged(dateIso);

  // Swipe pages between days; taps are swallowed briefly after a swipe (on
  // web the release click can land on a card of the re-rendered day).
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
          if (e.translationX <= -50) {
            navigation.setParams({ dateIso: toIso(addDays(fromIso(dateIso), 1)) });
          } else if (e.translationX >= 50) {
            navigation.setParams({ dateIso: toIso(addDays(fromIso(dateIso), -1)) });
          }
        }),
    [navigation, dateIso],
  );

  return (
    // The navigator's frozen scope bar owns the wrapper's top strip — the
    // scroll viewport starts below it. Padding on a plain wrapper, NOT margin
    // on the ScrollView: RN-web applies a ScrollView style's margin to both
    // of its nested divs, doubling the inset.
    <View style={styles.frozenBarInset}>
    <GestureDetector gesture={swipe}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: spacing.xxxl + tabBarInset }]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      {/* Keyed by date so day-swipes cross-fade instead of hard-cutting. */}
      <Animated.View key={dateIso} entering={FadeIn.duration(200)} style={styles.dayPager}>
      <Text style={styles.lede}>
        {plan.title} · {shortDate(date)} · {plan.exercises.length} exercises
        {doneCount > 0 && !allDone ? ` · ${doneCount} done` : ''}
      </Text>

      {rescuable && (
        // The day-view rescue door: catches arrivals from the month grid.
        // Retroactive logging below stays available — this only offers a way
        // to move the session instead.
        <View style={styles.missedBanner}>
          <View style={styles.missedBannerTitleRow}>
            <Ionicons name="alert-circle-outline" size={17} color={colors.warning} />
            <Text style={styles.missedBannerTitle}>This workout was missed</Text>
          </View>
          <Text style={styles.missedBannerBody}>
            Planned for {plan.weekday} — it hasn’t been logged.
          </Text>
          <View style={styles.missedBannerActions}>
            {todayOpen && (
              <TouchableOpacity
                style={styles.missedBannerPrimary}
                activeOpacity={0.8}
                disabled={rescueBusy}
                onPress={doItToday}
                accessibilityRole="button"
                accessibilityLabel="Do it today"
              >
                {rescueBusy ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <Text style={styles.missedBannerPrimaryLabel}>Do it today</Text>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.missedBannerSecondary}
              activeOpacity={0.8}
              disabled={rescueBusy}
              onPress={() => {
                buzzTap();
                setRescueSheetOpen(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="More options for this missed workout"
            >
              <Text style={styles.missedBannerSecondaryLabel}>Options</Text>
            </TouchableOpacity>
          </View>
          {rescueError !== '' && (
            <Text style={styles.missedBannerError}>{rescueError}</Text>
          )}
        </View>
      )}

      {(allDone || dayLogged) && (
        <View style={styles.completeBanner}>
          <Ionicons name="checkmark-circle" size={20} color={GOLD} />
          <Text style={styles.completeBannerText}>
            {allDone ? 'Workout complete — great work.' : 'Session logged.'}
          </Text>
        </View>
      )}

      {plan.exercises.length === 0 && (
        <View style={styles.restCard}>
          <Ionicons name="moon-outline" size={22} color={colors.textMuted} />
          <Text style={styles.restText}>Rest day — nothing scheduled.</Text>
        </View>
      )}

      {plan.exercises.length === 0 && dateIso === todayIso() && (
        // The at-the-gym door: an open TODAY offers a built session, not
        // just the one-exercise "+ Add Exercise" below.
        <TouchableOpacity
          style={styles.quickRow}
          activeOpacity={0.8}
          onPress={() => {
            buzzTap();
            setQuickVisible(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Quick workout"
        >
          <Ionicons name="flash-outline" size={18} color={colors.primary} />
          <Text style={styles.quickRowLabel}>Quick Workout</Text>
        </TouchableOpacity>
      )}

      {plan.exercises.map((ex, index) => {
        const done = getSetLogs(dateIso, index).length >= ex.sets;
        return (
          <TouchableOpacity
            key={`${index}-${ex.name}`}
            style={[
              styles.exerciseCard,
              { borderColor: MUSCLE_EDGE[ex.muscle] },
              done && styles.exerciseCardDone,
            ]}
            activeOpacity={0.8}
            onPress={() => {
              if (Date.now() - lastSwipeAt.current < 450) return;
              buzzTap();
              navigation.navigate('PlanCalendarWorkout', {
                dateIso,
                exerciseIndex: index,
                exerciseName: ex.name,
              });
            }}
            onLongPress={() => {
              buzzMenuOpen();
              setMenuFor({ index, exercise: ex });
            }}
            accessibilityRole="button"
            accessibilityLabel={`${ex.name}, ${ex.muscle}${done ? ', completed' : ''}`}
          >
            <LinearGradient
              colors={muscleGradient(ex.muscle)}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.exerciseCardInner}
            >
              {/* 3 lines, not 2: the longest catalog names ("Single-Arm
                  Dumbbell Overhead Triceps Extension") still truncated at 2
                  on device. Only long names pay the taller card. */}
              <Text
                style={[styles.exerciseName, { color: MUSCLE_INK[ex.muscle] }]}
                numberOfLines={3}
              >
                {ex.name}
              </Text>
              <View
                style={[styles.muscleChip, { backgroundColor: muscleChipFrost(ex.muscle) }]}
              >
                <Text style={[styles.muscleChipLabel, { color: MUSCLE_INK[ex.muscle] }]}>
                  {ex.muscle}
                </Text>
              </View>
              {done ? (
                <Ionicons name="checkmark-circle" size={19} color={MUSCLE_INK[ex.muscle]} />
              ) : (
                <Ionicons
                  name="chevron-forward"
                  size={17}
                  color={MUSCLE_INK[ex.muscle]}
                  style={styles.exerciseChevron}
                />
              )}
            </LinearGradient>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity
        style={styles.addRow}
        activeOpacity={0.8}
        onPress={() => {
          if (Date.now() - lastSwipeAt.current < 450) return;
          buzzTap();
          navigation.navigate('PlanCalendarExercisePicker', { dateIso, mode: 'add' });
        }}
        accessibilityRole="button"
        accessibilityLabel="Add exercise"
      >
        <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
        <Text style={styles.addRowLabel}>Add Exercise</Text>
      </TouchableOpacity>

      {anyLogged && !allDone && !dayLogged && (
        <TouchableOpacity
          style={styles.finishRow}
          activeOpacity={0.85}
          onPress={() => {
            // The session-complete thump — same success pattern as an
            // exercise's last set; fires on the action, not the server ack.
            buzzAllSetsComplete();
            finishDaySession(dateIso);
          }}
          accessibilityRole="button"
          accessibilityLabel="Finish and log session"
        >
          <Ionicons name="flag-outline" size={18} color={GOLD} />
          <Text style={styles.finishRowLabel}>Finish & Log Session</Text>
        </TouchableOpacity>
      )}

      {plan.exercises.length > 0 && (
        <Text style={styles.hint}>Hold an exercise to replace or remove it</Text>
      )}
      {calendarDataMode() === 'offline' && (
        <Text style={styles.footerNote}>Offline — changes stay on this device</Text>
      )}
      </Animated.View>

      {/* ---- Long-press menu ---- */}
      <Modal
        visible={menuFor !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuFor(null)}
      >
        <Pressable style={styles.scrim} onPress={() => setMenuFor(null)}>
          <View style={[styles.menuWrap, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.menuGroup}>
              <View style={styles.menuTitleRow}>
                <Text style={styles.menuTitle} numberOfLines={1}>
                  {menuFor?.exercise.name}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.menuAction}
                activeOpacity={0.8}
                onPress={() => {
                  if (menuFor) {
                    navigation.navigate('PlanCalendarExercisePicker', {
                      dateIso,
                      mode: 'replace',
                      exerciseIndex: menuFor.index,
                    });
                  }
                  setMenuFor(null);
                }}
                accessibilityRole="button"
                accessibilityLabel="Replace exercise"
              >
                <Ionicons name="swap-horizontal" size={20} color={colors.primary} />
                <Text style={styles.menuActionLabel}>Replace Exercise</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.menuAction, styles.menuActionDivider]}
                activeOpacity={0.8}
                onPress={() => {
                  if (menuFor) {
                    removeExerciseFromDay(dateIso, menuFor.index);
                    buzzEditApplied();
                  }
                  setMenuFor(null);
                }}
                accessibilityRole="button"
                accessibilityLabel="Remove exercise"
              >
                <Ionicons name="trash-outline" size={20} color={colors.error} />
                <Text style={[styles.menuActionLabel, styles.menuActionDestructive]}>
                  Remove Exercise
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.menuGroup, styles.menuCancel]}
              activeOpacity={0.8}
              onPress={() => setMenuFor(null)}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.menuCancelLabel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

    </ScrollView>
    </GestureDetector>

    <QuickWorkoutSheet
      visible={quickVisible}
      onClose={() => setQuickVisible(false)}
      // Door only exists on today's own view — the store emit re-renders it.
      onLanded={() => {}}
    />

    <WorkoutMoveSheet
      dateIso={rescueSheetOpen ? dateIso : null}
      mode="missed"
      context="day"
      onClose={() => setRescueSheetOpen(false)}
      onEditDay={() => {}}
      // Follow the workout to its new day.
      onMoved={(targetIso) => navigation.setParams({ dateIso: targetIso })}
    />
    </View>
  );
}

function createStyles(c: ColorPalette) {
  return StyleSheet.create({
    frozenBarInset: {
      flex: 1,
      paddingTop: SCOPE_BAR_SPACE,
      backgroundColor: c.background,
    },
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    content: {
      padding: spacing.lg,
      gap: spacing.md,
    },
    lede: {
      ...sfPro,
      fontSize: text.body,
      lineHeight: 20,
      color: c.textSecondary,
      marginBottom: spacing.xs,
    },
    quickRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.primary,
      borderRadius: radius.lg,
      paddingVertical: spacing.md,
    },
    quickRowLabel: {
      ...sfPro,
      fontSize: text.callout,
      fontWeight: weight.semibold,
      color: c.primary,
    },
    missedBanner: {
      backgroundColor: c.warningSoft,
      borderRadius: radius.lg,
      padding: spacing.lg,
    },
    missedBannerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    missedBannerTitle: {
      ...sfPro,
      fontSize: text.body,
      fontWeight: weight.bold,
      color: c.warning,
    },
    missedBannerBody: {
      ...sfPro,
      fontSize: text.footnote,
      color: c.textSecondary,
      marginTop: spacing.xxs,
    },
    missedBannerActions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    missedBannerPrimary: {
      backgroundColor: c.primary,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      minWidth: 110,
      alignItems: 'center',
    },
    missedBannerPrimaryLabel: {
      ...sfPro,
      fontSize: text.body,
      fontWeight: weight.semibold,
      color: c.onPrimary,
    },
    missedBannerSecondary: {
      backgroundColor: c.primarySoft,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      alignItems: 'center',
    },
    missedBannerSecondaryLabel: {
      ...sfPro,
      fontSize: text.body,
      fontWeight: weight.semibold,
      color: c.primary,
    },
    missedBannerError: {
      ...sfPro,
      fontSize: text.footnote,
      color: c.error,
      marginTop: spacing.sm,
    },
    exerciseCard: {
      borderRadius: radius.lg,
      borderWidth: 1,
      // The LinearGradient child paints the whole card (the "E2 Bright"
      // muscle gradient — see muscleGradient in the lib); clipping keeps it
      // inside the rounded corners. Surface stays behind it as the fallback.
      backgroundColor: c.surface,
      overflow: 'hidden',
    },
    exerciseCardInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.lg,
    },
    exerciseName: {
      ...sfPro,
      flex: 1,
      fontSize: text.callout,
      lineHeight: 22,
      fontWeight: weight.semibold,
    },
    muscleChip: {
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    muscleChipLabel: {
      ...sfPro,
      fontSize: text.body,
      fontWeight: weight.semibold,
    },
    exerciseChevron: {
      opacity: 0.7,
    },
    /** Finished exercises recede so the remaining work stands out. */
    exerciseCardDone: {
      opacity: 0.55,
    },
    completeBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderColor: GOLD,
      paddingVertical: spacing.md,
    },
    completeBannerText: {
      ...sfPro,
      fontSize: text.callout,
      fontWeight: weight.semibold,
      color: c.text,
    },
    dayPager: {
      gap: spacing.md,
    },
    finishRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderColor: GOLD,
      backgroundColor: c.surface,
      paddingVertical: spacing.md,
    },
    finishRowLabel: {
      ...sfPro,
      fontSize: text.callout,
      fontWeight: weight.semibold,
      color: c.text,
    },
    addRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      borderStyle: 'dashed',
      paddingVertical: spacing.lg,
    },
    addRowLabel: {
      ...sfPro,
      fontSize: text.callout,
      fontWeight: weight.semibold,
      color: c.primary,
    },
    hint: {
      ...sfPro,
      fontSize: text.footnote,
      color: c.textMuted,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
    restCard: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      padding: spacing.xxl,
      alignItems: 'center',
      gap: spacing.sm,
    },
    restText: {
      ...sfPro,
      fontSize: text.body,
      color: c.textMuted,
    },
    footerNote: {
      ...sfPro,
      fontSize: text.caption,
      color: c.textMuted,
      textAlign: 'center',
      marginTop: spacing.xs,
    },

    // Long-press menu (iOS action-sheet style)
    scrim: {
      flex: 1,
      backgroundColor: c.scrim,
      justifyContent: 'flex-end',
    },
    menuWrap: {
      padding: spacing.lg,
      gap: spacing.sm,
    },
    menuGroup: {
      backgroundColor: c.surface,
      borderRadius: radius.xl,
      overflow: 'hidden',
    },
    menuTitleRow: {
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    menuTitle: {
      ...sfPro,
      fontSize: text.footnote,
      fontWeight: weight.semibold,
      color: c.textMuted,
    },
    menuAction: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.lg,
    },
    menuActionLabel: {
      ...sfPro,
      fontSize: text.callout,
      fontWeight: weight.semibold,
      color: c.primary,
    },
    menuActionDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    menuActionDestructive: {
      color: c.error,
    },
    menuCancel: {
      alignItems: 'center',
      paddingVertical: spacing.lg,
    },
    menuCancelLabel: {
      ...sfPro,
      fontSize: text.callout,
      fontWeight: weight.bold,
      color: c.text,
    },
  });
}
