import React, { useEffect, useMemo, useReducer } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
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
  ensureLiveCalendarData,
  plannedDayForDate,
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
  // This is the tab's landing screen — kick off the real-plan fetch here.
  useEffect(() => {
    ensureLiveCalendarData();
  }, []);

  const weekMondayIso = route.params?.weekMondayIso ?? toIso(mondayOf(new Date()));
  const days = useMemo(
    () => [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(fromIso(weekMondayIso), i)),
    [weekMondayIso],
  );

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

      <Text style={styles.footerNote}>Prototype · Sample plan data</Text>
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
  });
}
