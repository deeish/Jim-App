import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import { getWorkoutStats } from '../services/workoutService';
import type { WorkoutStats } from '../types/workout';
import {
  formatTotalDuration,
  formatWeekLabel,
  summarizeProgress,
} from '../lib/progressStats';
import { formatVolumeFromLb } from '../lib/weightDisplay';

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
    try {
      setFailed(false);
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

  const header = (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Ionicons name="chevron-back" size={24} color={colors.primary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Progress</Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header}
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // Only surrender the screen when there is nothing to show. A refetch that
  // fails on re-focus must not throw away a perfectly good payload the user was
  // already looking at.
  if (failed && !stats) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header}
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
      </SafeAreaView>
    );
  }

  // A brand-new user gets an explanation, never a grid of zeroes and an empty
  // chart that implies something went wrong.
  if (summary.sessionCount === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header}
        <View style={styles.centered}>
          <Ionicons name="trending-up-outline" size={44} color={colors.primary} />
          <Text style={styles.emptyTitle}>No sessions logged yet</Text>
          <Text style={styles.emptyBody}>
            Finish a workout and this is where your streak, totals and weekly
            trend will build up.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {header}
      <ScrollView contentContainerStyle={styles.scrollContent}>
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
            are the numbers that exist no matter what was logged. */}
        <View style={styles.tileRow}>
          <Tile styles={styles} value={String(summary.sessionCount)} label="Sessions" />
          <Tile styles={styles} value={String(summary.totalSets)} label="Sets" />
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
            {`Longest streak so far: ${summary.bestWeekStreak} weeks`}
          </Text>
        )}
        <Text style={styles.footnote}>
          {`Based on the last ${stats?.months ?? 12} months of logged sessions.`}
        </Text>
      </ScrollView>
    </SafeAreaView>
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    backBtn: { padding: 6, marginRight: 4 },
    headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      gap: 12,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    emptyBody: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
    retryBtn: {
      marginTop: 4,
      paddingVertical: 10,
      paddingHorizontal: 22,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    retryText: { color: colors.primary, fontWeight: '600' },
    scrollContent: { padding: 16, paddingBottom: 32 },
    streakCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 18,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    streakIconWrap: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    streakTextBlock: { flex: 1, gap: 3 },
    streakValue: { fontSize: 20, fontWeight: '700', color: colors.text },
    streakSub: { fontSize: 13, color: colors.textSecondary },
    tileRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    tile: {
      flex: 1,
      paddingVertical: 16,
      paddingHorizontal: 4,
      alignItems: 'center',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    // 22 rather than 26: three across has to fit "33h 50m" on a narrow phone.
    tileValue: { fontSize: 22, fontWeight: '700', color: colors.primary },
    tileLabel: { fontSize: 13, color: colors.textTertiary, marginTop: 4 },
    volumeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    volumeLabel: { fontSize: 14, color: colors.textSecondary },
    volumeValue: { fontSize: 16, fontWeight: '600', color: colors.text },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: colors.textMuted,
      marginTop: 24,
      marginBottom: 10,
    },
    chartCard: {
      padding: 16,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chart: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      height: 96,
      gap: 5,
    },
    bar: { flex: 1, borderRadius: 4, minHeight: 3 },
    chartAxis: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 10,
    },
    axisLabel: { fontSize: 11, color: colors.textMuted },
    footnote: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 18,
    },
  });
}
