import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { leading, radius, spacing, text, tracking, useTheme, weight } from '../theme';
import { useStackBackFallback } from '../navigation/headerOptions';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import { getWorkoutStats } from '../services/workoutService';
import type { WorkoutStats } from '../types/workout';
import {
  formatTotalDuration,
  formatWeekLabel,
  summarizeProgress,
} from '../lib/progressStats';
import { formatVolumeFromLb, groupThousands } from '../lib/weightDisplay';

/**
 * Everything logged, finally rendered.
 *
 * Leads with metrics that always exist — sessions, days, sets, time, streak.
 * Volume and its trend are layered on top and shown **only** where weight data
 * exists: bodyweight work carries no weight and generated plans ship none until
 * the last-performance prefill starts filling it in, so a perfectly good
 * training history can total zero. A wall of zeroes reads as a broken screen.
 *
 * All day and week bucketing happens client-side in `progressStats`, against
 * the device's local calendar, so these numbers agree with the History screen.
 */
export default function ProgressScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { weightUnit } = useUserPreferences();
  const [stats, setStats] = useState<WorkoutStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    // `loading` flips back on for every request, not just the first: a Retry
    // that only cleared `failed` would render the no-sessions branch below for
    // the whole in-flight wait, telling a user with months of history they have
    // none. Ordered before `setFailed(false)` so that even if the two updates
    // ever rendered separately, no intermediate state slips past both guards.
    setLoading(true);
    setFailed(false);
    try {
      setStats(await getWorkoutStats());
    } catch (e) {
      console.warn('[Progress] load failed:', e);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // The clock is read when the stats change, not on every render. That is what
  // keeps this current in practice: the screen refetches on every focus, so
  // leaving and returning re-reads "now" along with the data.
  const summary = useMemo(() => summarizeProgress(stats, new Date()), [stats]);

  const maxWeekSessions = useMemo(
    () => Math.max(0, ...summary.weeklyTrend.map((w) => w.sessionCount)),
    [summary.weeklyTrend],
  );

  const styles = useMemo(() => createStyles(colors), [colors]);

  // Title, back button and scroll-edge treatment all come from the native header
  // configured in PlanStackNavigator. This only covers the one case the platform
  // cannot infer: arriving here with an empty stack behind us.
  useStackBackFallback(navigation, 'PlanList', colors);

  // With nothing fetched yet the spinner is the only honest render, on the
  // first load and on retries alike. Once data exists, a focus refetch keeps
  // the content on screen instead — never a spinner flash.
  if (loading && !stats) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  // Only surrender the screen when there is nothing to show. A refetch that
  // fails on re-focus must not throw away a perfectly good payload the user was
  // already looking at.
  if (failed && !stats) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Could not load your progress</Text>
          <Text style={styles.emptyBody}>
            Check your connection and try again.
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void load()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // A brand-new user gets an explanation, never a grid of zeroes and an empty
  // chart that implies something went wrong. Only a settled, successful fetch
  // reaches this branch — in-flight and failed-with-no-data were handled above
  // — so zero here means the server really reported zero sessions.
  if (summary.sessionCount === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <Ionicons name="trending-up-outline" size={44} color={colors.primary} />
          <Text style={styles.emptyTitle}>No sessions logged yet</Text>
          <Text style={styles.emptyBody}>
            Finish a workout and this is where your streak, totals and weekly
            trend will build up.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* `automatic` is what lets the native large title collapse into the bar
          as this list scrolls. Without it the title stays fixed at full size. */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.streakCard}>
          <View style={styles.streakIconWrap}>
            <Ionicons name="flame-outline" size={26} color={colors.primary} />
          </View>
          <View style={styles.streakTextBlock}>
            {summary.weekStreak > 0 ? (
              <>
                {/* "1 week streak" / "6 week streak" — compound adjective, no plural. */}
                <Text style={styles.streakValue}>
                  {`${summary.weekStreak} week streak`}
                </Text>
                <Text style={styles.streakSub}>
                  {summary.sessionsThisWeek > 0
                    ? `${summary.sessionsThisWeek} ${summary.sessionsThisWeek === 1 ? 'session' : 'sessions'} this week`
                    : 'Train this week to keep it going'}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.streakValue}>Start a new streak</Text>
                <Text style={styles.streakSub}>
                  One session this week begins it
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Same three-up row the finish screen uses, for the same reason: these
            are the numbers that exist no matter what was logged. Counts are
            grouped like the volume figure below — a year of training runs the
            set count well into four digits. */}
        <View style={styles.tileRow}>
          <Tile
            styles={styles}
            value={groupThousands(summary.sessionCount)}
            label="Sessions"
          />
          <Tile styles={styles} value={groupThousands(summary.totalSets)} label="Sets" />
          <Tile
            styles={styles}
            value={formatTotalDuration(summary.totalTimeSeconds)}
            label="Time"
          />
        </View>

        {/*
          Volume is omitted entirely rather than shown as zero — see the note at
          the top of this file.
        */}
        {summary.hasWeightedWork && (
          <View style={styles.volumeRow}>
            <Text style={styles.volumeLabel}>Total volume lifted</Text>
            <Text style={styles.volumeValue}>
              {formatVolumeFromLb(summary.totalVolumeLb, weightUnit)}
            </Text>
          </View>
        )}

        {maxWeekSessions > 0 && (
          <>
            <Text style={styles.sectionLabel}>Sessions per week</Text>
            <View style={styles.chartCard}>
              <View style={styles.chart}>
                {summary.weeklyTrend.map((week) => {
                  const frac =
                    maxWeekSessions > 0 ? week.sessionCount / maxWeekSessions : 0;
                  // Untrained weeks stay a visible baseline tick rather than
                  // vanishing, so gaps in the habit are legible.
                  const heightPct =
                    week.sessionCount === 0 ? 4 : 20 + frac * 80;
                  return (
                    <View
                      key={week.weekStartYmd}
                      style={[
                        styles.bar,
                        {
                          height: `${heightPct}%`,
                          backgroundColor:
                            week.sessionCount === 0
                              ? colors.border
                              : colors.primary,
                        },
                      ]}
                    />
                  );
                })}
              </View>
              <View style={styles.chartAxis}>
                <Text style={styles.axisLabel}>
                  {formatWeekLabel(summary.weeklyTrend[0].weekStartYmd)}
                </Text>
                <Text style={styles.axisLabel}>This week</Text>
              </View>
            </View>
          </>
        )}

        {summary.bestWeekStreak > summary.weekStreak && (
          <Text style={styles.footnote}>
            {`Longest streak so far: ${summary.bestWeekStreak} ${summary.bestWeekStreak === 1 ? 'week' : 'weeks'}`}
          </Text>
        )}
        <Text style={styles.footnote}>
          {`Based on the last ${stats?.months ?? 12} months of logged sessions.`}
        </Text>
      </ScrollView>
    </View>
  );
}

function Tile({
  styles,
  value,
  label,
}: {
  styles: ReturnType<typeof createStyles>;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xxxl,
      gap: spacing.md,
    },
    emptyTitle: {
      fontSize: text.headline,
      fontWeight: weight.bold,
      color: colors.text,
      textAlign: 'center',
    },
    emptyBody: {
      fontSize: text.body,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: leading.body,
    },
    retryBtn: {
      marginTop: spacing.xs,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    retryText: { color: colors.primary, fontWeight: weight.semibold },
    scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxxl },
    streakCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.lg,
      padding: spacing.lg,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    streakIconWrap: {
      width: 46,
      height: 46,
      borderRadius: radius.xl,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    streakTextBlock: { flex: 1, gap: spacing.xs },
    streakValue: { fontSize: text.title, fontWeight: weight.bold, color: colors.text },
    streakSub: { fontSize: text.body, color: colors.textSecondary },
    tileRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
    tile: {
      flex: 1,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.xs,
      alignItems: 'center',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    // 22 rather than 26: three across has to fit "33h 50m" on a narrow phone.
    tileValue: { fontSize: text.title, fontWeight: weight.bold, color: colors.primary },
    tileLabel: { fontSize: text.body, color: colors.textTertiary, marginTop: spacing.xs },
    volumeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.md,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    volumeLabel: { fontSize: text.body, color: colors.textSecondary },
    volumeValue: { fontSize: text.callout, fontWeight: weight.semibold, color: colors.text },
    sectionLabel: {
      fontSize: text.footnote,
      fontWeight: weight.semibold,
      letterSpacing: tracking.wider,
      textTransform: 'uppercase',
      color: colors.textMuted,
      marginTop: spacing.xxl,
      marginBottom: spacing.md,
    },
    chartCard: {
      padding: spacing.lg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chart: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      height: 96,
      gap: spacing.xs,
    },
    bar: { flex: 1, borderRadius: radius.xs, minHeight: 3 },
    chartAxis: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: spacing.md,
    },
    axisLabel: { fontSize: text.caption, color: colors.textMuted },
    footnote: {
      fontSize: text.footnote,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: spacing.lg,
    },
  });
}
