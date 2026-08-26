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
  elevation,
  leading,
  radius,
  spacing,
  text,
  useTheme,
  weight,
  type ColorPalette,
} from '../theme';
import { useTabBarInset } from '../navigation/useTabBarInset';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CalendarPager, {
  calendarDayIndex,
  calendarDayIso,
  type CalendarPagerHandle,
} from '../components/CalendarPager';
import type { CalendarScope } from '../components/PlanCalendarScopeBar';
import { SCOPE_BAR_SPACE, useFrozenScopeBar } from '../components/PlanCalendarScopeBarHost';
import {
  GOLD,
  MUSCLE_EDGE,
  MUSCLE_INK,
  buzzAllSetsComplete,
  buzzEditApplied,
  buzzMenuOpen,
  buzzSelection,
  buzzTap,
  fromIso,
  mondayOf,
  muscleChipFrost,
  muscleChipFrostDone,
  muscleGradient,
  muscleInkDone,
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
  canReviewDay,
  ensureLogsForMonth,
  finishDaySession,
  getSetLogs,
  isDayLogged,
  isDaySkipped,
  moveMissedDay,
  moveTargetsForDay,
  plannedDayForDate,
  primeCelebrationBaselines,
  removeExerciseFromDay,
  subscribePlanCalendar,
  unskipDay,
} from '../lib/planCalendarPrototypeStore';

type Nav = NativeStackNavigationProp<PlanCalendarParamList, 'PlanCalendarDay'>;
type Route = RouteProp<PlanCalendarParamList, 'PlanCalendarDay'>;

// One nudge per device; retired the moment it has been shown once.
const SWIPE_HINT_KEY = 'jim_calendar_swipe_hint_v1';

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
  const { colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const tabBarInset = useTabBarInset();
  const insets = useSafeAreaInsets();

  // Re-render when a replacement/addition/live update lands in the store.
  const [, forceRender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribePlanCalendar(forceRender), []);

  const { dateIso } = route.params;
  const plan = plannedDayForDate(dateIso);

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
  // it — without this only the MONTH screen ever fetched workout logs. The
  // pager renders both neighbours live, so month-boundary neighbours warm
  // their own month too.
  useEffect(() => {
    const idx = calendarDayIndex(dateIso);
    ensureLogsForMonth(fromIso(dateIso));
    ensureLogsForMonth(fromIso(calendarDayIso(idx - 1)));
    ensureLogsForMonth(fromIso(calendarDayIso(idx + 1)));
  }, [dateIso]);

  // Warm the celebration's "what did this beat" baselines while the day is
  // being trained. They must exist BEFORE the workout log POSTs — once the
  // log lands, the new lift IS the server-side record and every personal-best
  // claim on the finish screen silently vanishes.
  useEffect(() => {
    void primeCelebrationBaselines(dateIso);
  }, [dateIso]);

  /** Long-press menu (small sheet); Replace/Add push the picker screen. */
  const [menuFor, setMenuFor] = useState<SlotTarget | null>(null);

  // Quick Workout door on TODAY's rest day (the at-the-gym scenario).
  const [quickVisible, setQuickVisible] = useState(false);

  // The day-actions sheet (shared with the week view): 'missed' via the
  // rescue banner, 'missed'/'move' via the header's ⋯ button.
  const [daySheetMode, setDaySheetMode] = useState<'missed' | 'move' | null>(null);
  const [rescueBusy, setRescueBusy] = useState(false);
  const [rescueError, setRescueError] = useState('');
  const rescuable = canRescueDay(dateIso);
  const skippedHere = isDaySkipped(dateIso);
  // The banner acts on the day it renders in (panes carry their own iso).
  const doItTodayFor = async (iso: string) => {
    if (rescueBusy) return;
    buzzTap();
    setRescueBusy(true);
    setRescueError('');
    try {
      await moveMissedDay(iso, todayIso());
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
  const dayLogged = isDayLogged(dateIso);

  // The header's ⋯ — the VISIBLE door to day-level actions (move, skip,
  // quick workout). The week-card long-press stays as the shortcut; HIG says
  // a hold must never be the only path. Hidden where nothing can act:
  // completed/logged days (write-once log), rest days, old quiet misses,
  // and sample/offline data (nothing to persist against).
  const dayActionable =
    calendarDataMode() === 'live' &&
    plan.exercises.length > 0 &&
    !allDone &&
    !dayLogged &&
    (rescuable || skippedHere || dateIso >= todayIso());
  useEffect(() => {
    navigation.setOptions({
      headerRight: dayActionable
        ? () => (
            <TouchableOpacity
              onPress={() => {
                buzzMenuOpen();
                setDaySheetMode(rescuable ? 'missed' : 'move');
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Day options"
            >
              <Ionicons name="ellipsis-horizontal-circle" size={26} color={colors.primary} />
            </TouchableOpacity>
          )
        : undefined,
    });
  }, [navigation, dayActionable, rescuable, colors.primary]);

  // The pager commits a page: follow it in the route params. Taps are
  // swallowed briefly after a swipe (on web the release click can land on a
  // card of the re-rendered day).
  const lastSwipeAt = useRef(0);
  const pagerRef = useRef<CalendarPagerHandle>(null);
  const onPageChange = useCallback(
    (next: number, fromGesture: boolean) => {
      if (fromGesture) lastSwipeAt.current = Date.now();
      navigation.setParams({ dateIso: calendarDayIso(next) });
    },
    [navigation],
  );
  // The chevron path: same slide as a swipe (and the VoiceOver paging path).
  const pageBy = (delta: 1 | -1) => {
    buzzTap();
    pagerRef.current?.goTo(delta);
  };

  // The one-time "tomorrow peeks" nudge: the gesture is invisible until it
  // moves, so the first Day view ever opened demonstrates it once, wordlessly.
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(SWIPE_HINT_KEY)
      .then((seen) => {
        if (!active || seen) return;
        setShowSwipeHint(true);
        void AsyncStorage.setItem(SWIPE_HINT_KEY, '1');
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // One day's page. Every pane derives its state from its OWN iso, so the
  // neighbours riding beside the centre page are always live and true — an
  // accidental 10pt drag shows tomorrow for real.
  const renderDayPage = (idx: number) => {
    const iso = calendarDayIso(idx);
    const pPlan = plannedDayForDate(iso);
    const pDate = fromIso(iso);
    const pDoneCount = pPlan.exercises.filter(
      (ex, i) => getSetLogs(iso, i).length >= ex.sets,
    ).length;
    const pAllDone = pPlan.exercises.length > 0 && pDoneCount === pPlan.exercises.length;
    const pAnyLogged = pPlan.exercises.some((_, i) => getSetLogs(iso, i).length > 0);
    const pDayLogged = isDayLogged(iso);
    // The logged banner doubles as the door back to the finish screen. It
    // needs something to show: this device's own set logs, or the stored
    // workout log the month fetch brings back for a day trained somewhere
    // else. A sealed date with neither (offline, or the fetch hasn't landed)
    // keeps the plain banner rather than opening an empty receipt.
    const pReviewable = pDayLogged && canReviewDay(iso);
    const pRescuable = canRescueDay(iso);
    const pSkipped = isDaySkipped(iso);
    // The banner's one-tap "Do it today" shows only when today is genuinely
    // OPEN (picker row 0's state): a logged or beyond-program today blocks
    // it, and an occupied today needs the make-room step — the sheet
    // ("Options") handles both instead of a silent double (WorkoutMoveSheet).
    const pTodayOpen = pRescuable && moveTargetsForDay()[0].state === 'open';
    return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: spacing.xxxl + tabBarInset }]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.dayPager}>
      {/* The date line, flanked by the always-on paging cue: the chevrons
          run the same slide a swipe makes, and are the VoiceOver path. */}
      <View style={styles.ledeRow}>
        <TouchableOpacity
          onPress={() => pageBy(-1)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Previous day"
        >
          <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
        </TouchableOpacity>
        <Text style={styles.lede} numberOfLines={1}>
          {pPlan.title} · {shortDate(pDate)} · {pPlan.exercises.length} exercises
          {pDoneCount > 0 && !pAllDone ? ` · ${pDoneCount} done` : ''}
        </Text>
        <TouchableOpacity
          onPress={() => pageBy(1)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Next day"
        >
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {pRescuable && (
        // The day-view rescue door: catches arrivals from the month grid.
        // Retroactive logging below stays available — this only offers a way
        // to move the session instead.
        <View style={styles.missedBanner}>
          <View style={styles.missedBannerTitleRow}>
            <Ionicons name="alert-circle-outline" size={17} color={colors.warning} />
            <Text style={styles.missedBannerTitle}>This workout was missed</Text>
          </View>
          <Text style={styles.missedBannerBody}>
            Planned for {pPlan.weekday} — it hasn’t been logged.
          </Text>
          <View style={styles.missedBannerActions}>
            {pTodayOpen && (
              <TouchableOpacity
                style={styles.missedBannerPrimary}
                activeOpacity={0.8}
                disabled={rescueBusy}
                onPress={() => doItTodayFor(iso)}
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
                setDaySheetMode('missed');
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

      {/* Only a SUBMITTED day gets the banner — an all-done day that hasn't
          been through "Complete Workout" still shows the button below.
          It doubles as the way BACK to the finish screen: without this the
          celebration was a one-shot page you could never see again. */}
      {pDayLogged && (
        <TouchableOpacity
          style={[
            styles.completeBanner,
            mode === 'dark' ? styles.completeBannerDark : styles.completeBannerLight,
          ]}
          activeOpacity={pReviewable ? 0.85 : 1}
          disabled={!pReviewable}
          onPress={() => {
            buzzTap();
            navigation.navigate('PlanCalendarWorkoutComplete', {
              dateIso: iso,
              mode: 'recap',
            });
          }}
          accessibilityRole={pReviewable ? 'button' : 'text'}
          accessibilityLabel={
            pReviewable
              ? 'Review this session'
              : pAllDone
                ? 'Workout complete'
                : 'Session logged'
          }
        >
          <Ionicons name="checkmark-circle" size={17} color={GOLD} />
          <Text style={styles.completeBannerText}>
            {pAllDone ? 'Workout complete' : 'Session logged'}
          </Text>
          {pReviewable && (
            // Label plus chevron, not a pill: the whole strip is the target,
            // and chevron-forward is this screen's own "pushes a page" mark
            // (the exercise cards use it). A pill inside a 44pt row is both a
            // second affordance and, at ~33pt, a smaller one than the row.
            <>
              <Text style={styles.completeBannerAction}>Review session</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.primary} />
            </>
          )}
        </TouchableOpacity>
      )}

      {pSkipped && !pAllDone && !pDayLogged && pPlan.exercises.length > 0 && (
        // The skipped state's undo home — a skip is a mark, never a deletion.
        <View style={styles.skippedBanner}>
          <Ionicons name="close-circle-outline" size={17} color={colors.textMuted} />
          <Text style={styles.skippedBannerText}>You skipped this workout.</Text>
          <TouchableOpacity
            onPress={() => {
              buzzTap();
              unskipDay(iso);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Undo skip"
          >
            <Text style={styles.skippedBannerAction}>Undo</Text>
          </TouchableOpacity>
        </View>
      )}

      {pPlan.exercises.length === 0 && (
        <View style={styles.restCard}>
          <Ionicons name="moon-outline" size={22} color={colors.textMuted} />
          <Text style={styles.restText}>Rest day — nothing scheduled.</Text>
        </View>
      )}

      {pPlan.exercises.length === 0 && iso === todayIso() && (
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

      {pPlan.exercises.map((ex, index) => {
        const done = getSetLogs(iso, index).length >= ex.sets;
        // Done cards dim to 0.55, compositing light fills toward the dark
        // page — their near-black ink drops below 4.5:1 there, so it flips
        // to white (dark mode only; light mode dims toward white).
        const ink = done ? muscleInkDone(ex.muscle, mode === 'dark') : MUSCLE_INK[ex.muscle];
        const frost = done
          ? muscleChipFrostDone(ex.muscle, mode === 'dark')
          : muscleChipFrost(ex.muscle);
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
                dateIso: iso,
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
                style={[styles.exerciseName, { color: ink }]}
                numberOfLines={3}
              >
                {ex.name}
              </Text>
              <View style={[styles.muscleChip, { backgroundColor: frost }]}>
                <Text style={[styles.muscleChipLabel, { color: ink }]}>
                  {ex.muscle}
                </Text>
              </View>
              {done ? (
                <Ionicons name="checkmark-circle" size={19} color={ink} />
              ) : (
                <Ionicons
                  name="chevron-forward"
                  size={17}
                  color={ink}
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
          navigation.navigate('PlanCalendarExercisePicker', { dateIso: iso, mode: 'add' });
        }}
        accessibilityRole="button"
        accessibilityLabel="Add exercise"
      >
        <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
        <Text style={styles.addRowLabel}>Add Exercise</Text>
      </TouchableOpacity>

      {pAnyLogged && !pDayLogged && (
        // The ONE door to the workout log + celebration, full or cut-short.
        // Nothing fires when the last set is checked, so "one more exercise"
        // stays possible right up to this press — the press IS the confirm.
        <TouchableOpacity
          style={styles.completeButton}
          activeOpacity={0.85}
          onPress={() => {
            // The session-complete thump fires on the action, not the ack.
            buzzAllSetsComplete();
            navigation.navigate('PlanCalendarWorkoutComplete', { dateIso: iso });
            // Celebrate immediately; sync AFTER the baselines land — a log
            // that POSTs first becomes the record its own claims compare to.
            void (async () => {
              await primeCelebrationBaselines(iso).catch(() => {});
              finishDaySession(iso);
            })();
          }}
          accessibilityRole="button"
          accessibilityLabel="Complete workout"
        >
          <Ionicons name="checkmark" size={20} color="#1C1C1E" />
          <Text style={styles.completeButtonLabel}>Complete Workout</Text>
        </TouchableOpacity>
      )}

      {pPlan.exercises.length > 0 && (
        <Text style={styles.hint}>Hold an exercise to replace or remove it</Text>
      )}
      {calendarDataMode() === 'offline' && (
        <Text style={styles.footerNote}>Offline — changes stay on this device</Text>
      )}
      </View>
    </ScrollView>
    );
  };

  return (
    // The navigator's frozen scope bar owns the wrapper's top strip — the
    // pager viewport starts below it. Chrome (header, scope bar, sheets)
    // stays fixed; only the day pages ride with the finger.
    <View style={styles.frozenBarInset}>
    <CalendarPager
      ref={pagerRef}
      index={calendarDayIndex(dateIso)}
      onIndexChange={onPageChange}
      onBoundaryCross={buzzSelection}
      onGestureEnd={() => {
        lastSwipeAt.current = Date.now();
      }}
      hint={showSwipeHint}
      renderPage={renderDayPage}
    />

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

    <QuickWorkoutSheet
      visible={quickVisible}
      onClose={() => setQuickVisible(false)}
      // Door only exists on today's own view — the store emit re-renders it.
      onLanded={() => {}}
    />

    <WorkoutMoveSheet
      dateIso={daySheetMode ? dateIso : null}
      mode={daySheetMode ?? 'missed'}
      context="day"
      onClose={() => setDaySheetMode(null)}
      onEditDay={() => {}}
      // Follow the workout to its new day.
      onMoved={(targetIso) => navigation.setParams({ dateIso: targetIso })}
      onQuickWorkout={() => setQuickVisible(true)}
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
    ledeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginBottom: spacing.xs,
    },
    lede: {
      ...sfPro,
      flex: 1,
      textAlign: 'center',
      fontSize: text.body,
      lineHeight: 20,
      color: c.textSecondary,
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
    skippedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    skippedBannerText: {
      ...sfPro,
      flex: 1,
      fontSize: text.footnote,
      color: c.textMuted,
    },
    skippedBannerAction: {
      ...sfPro,
      fontSize: text.footnote,
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
    // One row — status left, action right — in the shape the skipped banner
    // next door already uses. The gold now arrives as a TINT, not a 2px frame:
    // no other banner on this screen carries a border, which is what made this
    // one shout over the exercise list it sits above. 12 + 20 + 12 = 44pt, the
    // touch minimum, down from ~87 as two rows.
    completeBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    // Gold at the palette's own soft-fill strengths (SOFT_ALPHA and
    // DARK_SOFT_ALPHA in colors.ts — dark tints run stronger before their
    // colour reads). GOLD is a prototype constant, so there is no goldSoft
    // token to reach for, and warningSoft would say "missed", not "done".
    completeBannerLight: {
      backgroundColor: `${GOLD}1A`,
    },
    completeBannerDark: {
      backgroundColor: `${GOLD}26`,
    },
    completeBannerText: {
      ...sfPro,
      // Takes the slack and wraps at large Dynamic Type, so the action keeps
      // its place instead of being pushed off the row.
      flex: 1,
      fontSize: text.body,
      lineHeight: leading.body,
      fontWeight: weight.semibold,
      color: c.text,
    },
    // The action reads in the app's ACTION colour, not the banner's gold:
    // GOLD on the light surface is ~2:1, nowhere near 4.5:1 at this size, and
    // every other tappable label on this screen (Add Exercise, Undo, Options)
    // is already primary. Gold stays the completion mark — the tint and the ✓.
    completeBannerAction: {
      ...sfPro,
      flexShrink: 0,
      fontSize: text.body,
      lineHeight: leading.body,
      fontWeight: weight.semibold,
      color: c.primary,
    },
    dayPager: {
      gap: spacing.md,
    },
    completeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      height: 50,
      borderRadius: radius.pill,
      backgroundColor: GOLD,
      shadowColor: c.shadow,
      ...elevation.level2,
    },
    completeButtonLabel: {
      ...sfPro,
      fontSize: text.callout,
      fontWeight: weight.semibold,
      // Constant near-black on the theme-invariant gold (white fails 4.5:1).
      color: '#1C1C1E',
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
