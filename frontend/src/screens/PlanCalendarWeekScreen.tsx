import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
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
import PlanCalendarScopeBar from '../components/PlanCalendarScopeBar';
import {
  MUSCLE_COLORS,
  MUSCLE_EDGE,
  MUSCLE_INK,
  addDays,
  dayMuscles,
  fromIso,
  isCurrentWeek,
  isToday,
  mondayOf,
  sfPro,
  shortDate,
  todayIso,
  toIso,
  type PlanCalendarParamList,
} from '../lib/planCalendarPrototype';
import {
  calendarDataMode,
  consumeAnchorAutoJump,
  isDayCompleted,
  plannedDayForDate,
  programWeekInfoFor,
  refreshLiveCalendarData,
  subscribePlanCalendar,
} from '../lib/planCalendarPrototypeStore';
import { GOLD } from '../lib/planCalendarPrototype';
import { SkeletonCard } from '../components/Skeleton';
import Animated, { FadeIn } from 'react-native-reanimated';

type Nav = NativeStackNavigationProp<PlanCalendarParamList, 'PlanCalendarWeek'>;
type Route = RouteProp<PlanCalendarParamList, 'PlanCalendarWeek'>;

/**
 * PROTOTYPE — the Calendar tab's landing screen: the week as a vertical list
 * of day cards, each carrying its colour-coded muscle chips. Tapping a day
 * opens the day's exercise list; the header back chevron goes UP to the month
 * grid (see PlanCalendarNavigator for that inverted-back wiring).
 */
export default function PlanCalendarWeekScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const tabBarInset = useTabBarInset();

  // Re-render when a replacement or live-plan update lands.
  const [, forceRender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribePlanCalendar(forceRender), []);
  // Landing screen + focus refresh: notice a plan applied elsewhere this
  // session. The 'PlanList' alias is the post-apply landing, so it always
  // force-refetches — the fresh plan must show immediately.
  const isPostApplyLanding = (route.name as string) === 'PlanList';
  useFocusEffect(
    useCallback(() => {
      refreshLiveCalendarData(isPostApplyLanding);
    }, [isPostApplyLanding]),
  );

  const weekMondayIso = route.params?.weekMondayIso ?? toIso(mondayOf(new Date()));
  const days = useMemo(
    () => [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(fromIso(weekMondayIso), i)),
    [weekMondayIso],
  );

  const mode = calendarDataMode();
  const weekInfo = mode === 'live' ? programWeekInfoFor(weekMondayIso) : null;

  // Pull-to-refresh: force a plan refetch; the spinner is time-boxed since
  // the store notifies via subscription rather than a promise.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refreshLiveCalendarData(true);
    setTimeout(() => setRefreshing(false), 900);
  }, []);

  // Horizontal swipe pages between weeks (vertical scrolling wins otherwise).
  const goWeek = useCallback(
    (delta: number) => {
      navigation.setParams({
        weekMondayIso: toIso(addDays(fromIso(weekMondayIso), delta * 7)),
      });
    },
    [navigation, weekMondayIso],
  );
  // `lastSwipeAt` swallows the click the browser can deliver after a pan
  // releases over a card of the re-rendered week (same guard as the month).
  const lastSwipeAt = useRef(0);
  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-24, 24])
        .failOffsetY([-16, 16])
        .onEnd((e) => {
          if (Math.abs(e.translationX) >= 50) lastSwipeAt.current = Date.now();
          if (e.translationX <= -50) goWeek(1);
          else if (e.translationX >= 50) goWeek(-1);
        }),
    [goWeek],
  );

  // Dead-first-week fix: a just-applied plan can anchor week 1 to NEXT Monday,
  // so the landing week is empty and reads as "my plan didn't save". Jump the
  // landing screen (explicit navigations keep their week) to week 1, once.
  useEffect(() => {
    if (route.params?.weekMondayIso) return;
    const jumpTo = consumeAnchorAutoJump();
    if (jumpTo) navigation.setParams({ weekMondayIso: jumpTo });
  });

  return (
    <GestureDetector gesture={swipe}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: spacing.xxxl + tabBarInset }]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />
      }
    >
      <PlanCalendarScopeBar
        active="week"
        onNavigate={(scope) => {
          if (scope === 'month') {
            // Mirrors the header's "‹ Month": pop to the month beneath, or
            // make it the root when this week is the tab's landing screen.
            if (navigation.canGoBack()) navigation.goBack();
            else navigation.reset({ index: 0, routes: [{ name: 'PlanCalendarMonth' }] });
          } else if (scope === 'day') {
            navigation.navigate('PlanCalendarDay', {
              dateIso: isCurrentWeek(weekMondayIso) ? todayIso() : weekMondayIso,
            });
          }
        }}
      />

      {weekInfo?.state === 'in' && (
        <Text style={styles.contextLine}>
          Week {weekInfo.week} of {weekInfo.totalWeeks} · {weekInfo.planName}
        </Text>
      )}
      {weekInfo?.state === 'after' && (
        <Text style={styles.contextLine}>
          Program complete · {weekInfo.planName} ({weekInfo.totalWeeks} weeks)
        </Text>
      )}
      {weekInfo?.state === 'before' && (
        <View style={styles.anchorBanner}>
          <Ionicons name="calendar-outline" size={18} color={colors.primary} />
          <View style={styles.anchorBannerText}>
            <Text style={styles.anchorBannerTitle}>
              Your program starts {shortDate(fromIso(weekInfo.startsMondayIso))}
            </Text>
            <Text style={styles.anchorBannerBody}>
              This week is a lead-in — week 1 begins Monday.
            </Text>
          </View>
          <TouchableOpacity
            onPress={() =>
              navigation.setParams({ weekMondayIso: weekInfo.startsMondayIso })
            }
            accessibilityRole="button"
            accessibilityLabel="Go to week 1"
            hitSlop={8}
          >
            <Text style={styles.anchorBannerAction}>Week 1</Text>
          </TouchableOpacity>
        </View>
      )}

      {mode === 'loading' && (
        <>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </>
      )}

      {mode !== 'loading' && (
      <Animated.View key={weekMondayIso} entering={FadeIn.duration(200)} style={styles.weekPager}>
      {days.map((date) => {
        const iso = toIso(date);
        const plan = plannedDayForDate(iso);
        const muscles = dayMuscles(plan);
        const today = isToday(iso);
        const rest = plan.exercises.length === 0;
        const completed = !rest && isDayCompleted(iso);
        const missed = !rest && !completed && iso < todayIso();

        if (rest) {
          return (
            <View key={iso} style={[styles.card, styles.restCard]}>
              <View style={styles.titleRow}>
                <Text style={[styles.weekday, styles.restWeekday]}>{plan.weekday}</Text>
                {today && <TodayPill styles={styles} />}
                <View style={styles.spacer} />
                <Ionicons name="moon-outline" size={15} color={colors.textMuted} />
                <Text style={styles.restLabel}>Rest</Text>
              </View>
              <Text style={styles.dateLine}>{shortDate(date)}</Text>
            </View>
          );
        }

        return (
          <TouchableOpacity
            key={iso}
            style={[styles.card, today && styles.todayCard]}
            activeOpacity={0.85}
            onPress={() => {
              if (Date.now() - lastSwipeAt.current < 450) return;
              navigation.navigate('PlanCalendarDay', { dateIso: iso });
            }}
            accessibilityRole="button"
            accessibilityLabel={`${plan.weekday}, ${plan.title}`}
          >
            <View style={styles.titleRow}>
              <Text style={[styles.weekday, today && styles.todayWeekday]}>
                {plan.weekday}
              </Text>
              {today && <TodayPill styles={styles} />}
              <View style={styles.spacer} />
              {completed ? (
                <Ionicons name="checkmark-circle" size={20} color={GOLD} />
              ) : (
                <>
                  {missed && <Text style={styles.missedLabel}>Missed</Text>}
                  <Ionicons name="chevron-forward" size={17} color={colors.textTertiary} />
                </>
              )}
            </View>
            <Text style={styles.dateLine}>
              {shortDate(date)} · {plan.title}
            </Text>
            <View style={styles.chipRow}>
              {muscles.map((m) => (
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
          </TouchableOpacity>
        );
      })}
      </Animated.View>
      )}

      {mode === 'offline' && (
        <Text style={styles.footerNote}>Offline — can’t reach the server</Text>
      )}
      {mode === 'empty' && (
        // No plan: the week stays a normal, quiet calendar of open days —
        // creation lives in the month view's Planning section.
        <Text style={styles.footerNote}>
          No active plan · create one from the month view
        </Text>
      )}
    </ScrollView>
    </GestureDetector>
  );
}

function TodayPill({ styles }: { styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.todayPill}>
      <Text style={styles.todayPillLabel}>TODAY</Text>
    </View>
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
      gap: spacing.md,
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
      shadowColor: c.shadow,
      ...elevation.level1,
    },
    todayCard: {
      borderWidth: 2,
      borderColor: c.primary,
    },
    restCard: {
      // Rest days recede: flat, no shadow, quieter type.
      shadowOpacity: 0,
      elevation: 0,
      paddingVertical: spacing.md,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    spacer: { flex: 1 },
    weekday: {
      ...sfPro,
      fontSize: text.headline,
      lineHeight: 24,
      fontWeight: weight.semibold,
      color: c.text,
    },
    todayWeekday: {
      color: c.primary,
    },
    restWeekday: {
      color: c.textTertiary,
      fontWeight: weight.medium,
    },
    dateLine: {
      ...sfPro,
      fontSize: text.footnote,
      lineHeight: 16,
      color: c.textMuted,
      marginTop: spacing.xxs,
    },
    restLabel: {
      ...sfPro,
      fontSize: text.footnote,
      fontWeight: weight.medium,
      color: c.textMuted,
      marginLeft: spacing.xs,
    },
    weekPager: {
      gap: spacing.md,
    },
    missedLabel: {
      ...sfPro,
      fontSize: text.footnote,
      fontWeight: weight.medium,
      color: c.textMuted,
      marginRight: spacing.sm,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.md,
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
    todayPill: {
      backgroundColor: c.primarySoft,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xxs,
      marginLeft: spacing.sm,
    },
    todayPillLabel: {
      ...sfPro,
      fontSize: text.caption,
      fontWeight: weight.bold,
      letterSpacing: tracking.wider,
      color: c.primary,
    },
    footerNote: {
      ...sfPro,
      fontSize: text.caption,
      color: c.textMuted,
      textAlign: 'center',
      marginTop: spacing.md,
    },
    contextLine: {
      ...sfPro,
      fontSize: text.footnote,
      fontWeight: weight.semibold,
      color: c.textSecondary,
      textAlign: 'center',
    },
    anchorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: c.primarySoft,
      borderRadius: radius.lg,
      padding: spacing.lg,
    },
    anchorBannerText: {
      flex: 1,
    },
    anchorBannerTitle: {
      ...sfPro,
      fontSize: text.body,
      fontWeight: weight.semibold,
      color: c.text,
    },
    anchorBannerBody: {
      ...sfPro,
      fontSize: text.footnote,
      color: c.textSecondary,
      marginTop: spacing.xxs,
    },
    anchorBannerAction: {
      ...sfPro,
      fontSize: text.body,
      fontWeight: weight.bold,
      color: c.primary,
    },
  });
}
