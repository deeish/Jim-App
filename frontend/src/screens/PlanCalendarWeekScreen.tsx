import React, { useCallback, useEffect, useMemo, useReducer } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  plannedDayForDate,
  programWeekInfoFor,
  refreshLiveCalendarData,
  subscribePlanCalendar,
} from '../lib/planCalendarPrototypeStore';

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

  // Dead-first-week fix: a just-applied plan can anchor week 1 to NEXT Monday,
  // so the landing week is empty and reads as "my plan didn't save". Jump the
  // landing screen (explicit navigations keep their week) to week 1, once.
  useEffect(() => {
    if (route.params?.weekMondayIso) return;
    const jumpTo = consumeAnchorAutoJump();
    if (jumpTo) navigation.setParams({ weekMondayIso: jumpTo });
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: spacing.xxxl + tabBarInset }]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
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

      {days.map((date) => {
        const iso = toIso(date);
        const plan = plannedDayForDate(iso);
        const muscles = dayMuscles(plan);
        const today = isToday(iso);
        const rest = plan.exercises.length === 0;

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
            onPress={() => navigation.navigate('PlanCalendarDay', { dateIso: iso })}
            accessibilityRole="button"
            accessibilityLabel={`${plan.weekday}, ${plan.title}`}
          >
            <View style={styles.titleRow}>
              <Text style={[styles.weekday, today && styles.todayWeekday]}>
                {plan.weekday}
              </Text>
              {today && <TodayPill styles={styles} />}
              <View style={styles.spacer} />
              <Ionicons name="chevron-forward" size={17} color={colors.textTertiary} />
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

      {mode === 'sample' && (
        <Text style={styles.footerNote}>Prototype · Sample plan data</Text>
      )}
      {mode === 'empty' && (
        // No plan: the week stays a normal, quiet calendar of open days —
        // creation lives in the month view's Planning section.
        <Text style={styles.footerNote}>
          No active plan · create one from the month view
        </Text>
      )}
    </ScrollView>
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
