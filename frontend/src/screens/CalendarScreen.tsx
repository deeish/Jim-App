import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { useTheme } from '../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { getWorkoutLogs } from '../services/workoutService';
import type { WorkoutLog, WorkoutLogEntry, WorkoutLogEntrySet } from '../types/workout';
import { formatLocalYmd } from '../lib/planCalendar';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import { formatWeightCompactFromLb, type WeightUnit } from '../lib/weightDisplay';
import {
  exerciseUsesTimeDisplay,
  formatRestSecondsForPreview,
} from '../lib/exercisePrescription';
import { MIN_PLAUSIBLE_DURATION_SECONDS } from '../lib/lastPerformanceDisplay';

import { leading, radius, spacing, text, weight } from '../theme';
import { useTabBarInset } from '../navigation/useTabBarInset';
type CalendarScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'History'>;

type Props = {
  navigation: CalendarScreenNavigationProp;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  }
  return secs > 0 ? `${mins}m ${secs}s` : `${mins} min`;
}

/**
 * One logged set, in the reader's own units. Timed work stores its duration
 * seconds in the reps field, so a 45 s plank read as "45 × —" here long after
 * every other history surface had learned to say "45s".
 */
function setDetailText(
  set: WorkoutLogEntrySet,
  isTimeBased: boolean,
  unit: WeightUnit,
): string {
  const weightStr = formatWeightCompactFromLb(set.weight ?? null, unit);
  // Legacy cardio rows put a rep count in the same field, so an implausibly
  // short "duration" is left as a plain count rather than rendered as "1s".
  if (isTimeBased && set.reps >= MIN_PLAUSIBLE_DURATION_SECONDS) {
    const held = formatRestSecondsForPreview(set.reps);
    return weightStr ? `${held} @ ${weightStr}` : held;
  }
  if (weightStr) return `${set.reps} × ${weightStr}`;
  return `${set.reps} ${set.reps === 1 ? 'rep' : 'reps'}`;
}

function SetRow({
  set,
  isTimeBased,
  unit,
  colors,
}: {
  set: WorkoutLogEntrySet;
  isTimeBased: boolean;
  unit: WeightUnit;
  colors: Record<string, string>;
}) {
  return (
    <View style={styles.setRow}>
      <Text style={[styles.setNumber, { color: colors.textMuted }]}>Set {set.setNumber}</Text>
      <Text style={[styles.setDetail, { color: colors.text }]}>
        {setDetailText(set, isTimeBased, unit)}
        {set.rpe != null ? ` · RPE ${set.rpe}` : ''}
      </Text>
      {set.notes ? (
        <Text style={[styles.setNotes, { color: colors.textMuted }]}>{set.notes}</Text>
      ) : null}
    </View>
  );
}

function LogEntryBlock({
  entry,
  unit,
  colors,
}: {
  entry: WorkoutLogEntry;
  unit: WeightUnit;
  colors: Record<string, string>;
}) {
  const sets = (entry.completedSets ?? []) as WorkoutLogEntrySet[];
  // A log row carries no prescription, so the name is all there is to go on —
  // the same fallback ExerciseDetail uses for its own history list.
  const isTimeBased = exerciseUsesTimeDisplay(undefined, entry.name ?? '');
  return (
    <View style={[styles.entryBlock, { borderColor: colors.border }]}>
      <Text style={[styles.entryName, { color: colors.text }]}>{entry.name ?? 'Exercise'}</Text>
      {entry.notes ? (
        <Text style={[styles.entryNotes, { color: colors.textMuted }]}>{entry.notes}</Text>
      ) : null}
      <View style={styles.setsList}>
        {sets.map((s) => (
          <SetRow key={s.setNumber} set={s} isTimeBased={isTimeBased} unit={unit} colors={colors} />
        ))}
      </View>
    </View>
  );
}

function DayDetailSection({
  dateLabel,
  logs,
  unit,
  colors,
  onClearSelection,
}: {
  dateLabel: string;
  logs: WorkoutLog[];
  unit: WeightUnit;
  colors: Record<string, string>;
  onClearSelection: () => void;
}) {
  if (logs.length === 0) {
    return (
      <View>
        <View style={styles.dayDetailHeader}>
          <Text style={[styles.dayDetailTitle, { color: colors.text }]}>{dateLabel}</Text>
          <TouchableOpacity
            onPress={onClearSelection}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close day details"
          >
            <Ionicons name="close-circle-outline" size={24} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
        <Text style={[styles.emptyDayText, { color: colors.textMuted }]}>
          No workouts logged this day
        </Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.dayDetailHeader}>
        <View>
          <Text style={[styles.dayDetailTitle, { color: colors.text }]}>{dateLabel}</Text>
          <Text style={[styles.dayDetailSubtitle, { color: colors.textMuted }]}>
            {logs.length} {logs.length === 1 ? 'workout' : 'workouts'} this day
          </Text>
        </View>
        <TouchableOpacity
          onPress={onClearSelection}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close day details"
        >
          <Ionicons name="close-circle-outline" size={24} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
      {logs.map((log) => (
        <View
          key={log.id}
          style={[styles.logBlock, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={[styles.logWorkoutName, { color: colors.text }]}>
            {log.workout?.name ?? 'Workout'}
          </Text>
          <View style={styles.logMetaRow}>
            {log.totalTimeSeconds != null && (
              <Text style={[styles.logMeta, { color: colors.textSecondary }]}>
                {formatDuration(log.totalTimeSeconds)}
              </Text>
            )}
            {log.totalSets != null && (
              <Text style={[styles.logMeta, { color: colors.textSecondary }]}>
                {log.totalSets} sets
              </Text>
            )}
          </View>
          {log.overallNotes ? (
            <View style={[styles.overallNotesBox, { backgroundColor: colors.background }]}>
              <Text style={[styles.overallNotesLabel, { color: colors.textMuted }]}>Session notes</Text>
              <Text style={[styles.overallNotesText, { color: colors.text }]}>{log.overallNotes}</Text>
            </View>
          ) : null}
          <View style={styles.entriesList}>
            {(log.entries ?? []).map((entry) => (
              <LogEntryBlock key={entry.id} entry={entry} unit={unit} colors={colors} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

export default function CalendarScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { weightUnit } = useUserPreferences();
  // The tab bar floats over this screen; keep the last history rows clear of it.
  const tabBarInset = useTabBarInset();
  // Title and back button now come from the native header in PlanStackNavigator.
  // The back button relies on PlanList sitting beneath this route, which
  // HomeScreen guarantees by navigating here with `initial: false`.
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<{ year: number; month: number; day: number } | null>(null);

  const monthStart = useMemo(
    () => formatLocalYmd(new Date(selectedYear, selectedMonth, 1)),
    [selectedYear, selectedMonth],
  );
  const monthEnd = useMemo(
    () => formatLocalYmd(new Date(selectedYear, selectedMonth + 1, 0)),
    [selectedYear, selectedMonth],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLogsLoading(true);
      setLogsError(null);
      try {
        const data = await getWorkoutLogs({ from: monthStart, to: monthEnd });
        if (!cancelled) setLogs(data);
      } catch (err) {
        console.error('Failed to load workout logs:', err);
        if (!cancelled) {
          setLogs([]);
          setLogsError('Could not load workout history. Check your connection and try again.');
        }
      } finally {
        if (!cancelled) setLogsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [monthStart, monthEnd]);

  const logsByDay = useMemo(() => {
    const map: Record<string, WorkoutLog[]> = {};
    logs.forEach((log) => {
      const key = formatLocalYmd(new Date(log.startedAt));
      if (!map[key]) map[key] = [];
      map[key].push(log);
    });
    return map;
  }, [logs]);

  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const firstDay = new Date(selectedYear, selectedMonth, 1).getDay();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;
  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) week.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  const prevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
    setSelectedDate(null);
  };

  const nextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
    setSelectedDate(null);
  };

  const today = new Date();
  const isToday = (day: number) =>
    selectedYear === today.getFullYear() &&
    selectedMonth === today.getMonth() &&
    day === today.getDate();

  const getLogsForDay = (day: number): WorkoutLog[] => {
    const key = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return logsByDay[key] ?? [];
  };

  const selectedDayLogs = selectedDate ? getLogsForDay(selectedDate.day) : [];
  const selectedDateLabel = selectedDate
    ? `${MONTHS[selectedDate.month]} ${selectedDate.day}, ${selectedDate.year}`
    : '';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: spacing.xxxl + tabBarInset }]}
        showsVerticalScrollIndicator={true}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={[styles.monthNav, { borderBottomColor: colors.border }]}>
          <TouchableOpacity
            onPress={prevMonth}
            style={styles.monthNavButton}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.monthTitle, { color: colors.text }]}>
            {MONTHS[selectedMonth]} {selectedYear}
          </Text>
          <TouchableOpacity
            onPress={nextMonth}
            style={styles.monthNavButton}
            accessibilityRole="button"
            accessibilityLabel="Next month"
          >
            <Ionicons name="chevron-forward" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        {logsLoading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading history…</Text>
          </View>
        )}
        {logsError && !logsLoading && (
          <Text style={[styles.loadingText, { color: colors.error, textAlign: 'center', marginTop: spacing.sm }]}>
            {logsError}
          </Text>
        )}

        <View style={styles.weekdayRow}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
            <Text key={day} style={[styles.weekdayLabel, { color: colors.textMuted }]}>
              {day}
            </Text>
          ))}
        </View>

        <View style={styles.calendarGrid}>
          {weeks.map((weekRow, wi) => (
            <View key={wi} style={styles.weekRow}>
              {weekRow.map((day, di) => (
                <View key={di} style={styles.dayCell}>
                  {day != null ? (
                    <TouchableOpacity
                      style={[
                        styles.dayInner,
                        isToday(day) && { backgroundColor: colors.primary, borderRadius: radius.xl },
                        selectedDate?.day === day && {
                          borderWidth: 2,
                          borderColor: colors.primary,
                        },
                      ]}
                      onPress={() =>
                        setSelectedDate({ year: selectedYear, month: selectedMonth, day })
                      }
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          { color: colors.text },
                          isToday(day) && { color: colors.background, fontWeight: weight.bold },
                        ]}
                      >
                        {day}
                      </Text>
                      {(() => {
                        // A quiet placeholder dot while the month is in
                        // flight: without it every cell read "you trained
                        // nothing here", and switching months re-entered that
                        // state each time.
                        if (logsLoading) {
                          return <View style={[styles.logBadge, styles.logBadgeLoading]} />;
                        }
                        const dayLogs = getLogsForDay(day);
                        if (dayLogs.length === 0) return null;
                        return (
                          <View
                            style={[
                              styles.logBadge,
                              {
                                backgroundColor: isToday(day) ? colors.background : colors.primary,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.logBadgeText,
                                { color: isToday(day) ? colors.primary : colors.background },
                              ]}
                              numberOfLines={1}
                            >
                              {dayLogs.length}
                            </Text>
                          </View>
                        );
                      })()}
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}
            </View>
          ))}
        </View>

        {selectedDate !== null ? (
          <View style={[styles.dayDetailSection, { borderTopColor: colors.border }]}>
            <DayDetailSection
              dateLabel={selectedDateLabel}
              logs={selectedDayLogs}
              unit={weightUnit}
              colors={colors}
              onClearSelection={() => setSelectedDate(null)}
            />
          </View>
        ) : (
          <View style={styles.hintRow}>
            <Text style={[styles.hintText, { color: colors.textMuted }]}>
              Tap a day to see workout details
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  monthNavButton: {
    padding: spacing.sm,
  },
  monthTitle: {
    fontSize: text.headline,
    fontWeight: weight.semibold,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  loadingText: {
    fontSize: text.footnote,
  },
  weekdayRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  weekdayLabel: {
    flex: 1,
    fontSize: text.footnote,
    fontWeight: weight.semibold,
    textAlign: 'center',
  },
  calendarGrid: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayInner: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayText: {
    fontSize: text.callout,
    fontWeight: weight.medium,
  },
  /** Placeholder dot while the month's logs are still in flight. */
  logBadgeLoading: {
    backgroundColor: '#00000014',
  },
  logBadge: {
    position: 'absolute',
    bottom: 2,
    minWidth: 16,
    height: 16,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  logBadgeText: {
    fontSize: text.caption,
    fontWeight: weight.bold,
  },
  hintRow: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  hintText: {
    fontSize: text.body,
    fontStyle: 'italic',
  },
  dayDetailSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    borderTopWidth: 1,
  },
  dayDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  dayDetailTitle: {
    fontSize: text.title,
    fontWeight: weight.bold,
  },
  dayDetailSubtitle: {
    fontSize: text.body,
    marginTop: spacing.xxs,
  },
  emptyDayText: {
    fontSize: text.callout,
    textAlign: 'center',
    paddingVertical: spacing.xxl,
  },
  logBlock: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  logWorkoutName: {
    fontSize: text.headline,
    fontWeight: weight.bold,
    marginBottom: spacing.sm,
  },
  logMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  logMeta: {
    fontSize: text.body,
  },
  overallNotesBox: {
    padding: spacing.md,
    borderRadius: radius.sm,
    marginBottom: spacing.lg,
  },
  overallNotesLabel: {
    fontSize: text.footnote,
    fontWeight: weight.semibold,
    marginBottom: spacing.xs,
  },
  overallNotesText: {
    fontSize: text.body,
    lineHeight: leading.body,
  },
  entriesList: {
    gap: spacing.md,
  },
  entryBlock: {
    borderLeftWidth: 3,
    paddingLeft: spacing.md,
    marginBottom: spacing.md,
  },
  entryName: {
    fontSize: text.callout,
    fontWeight: weight.semibold,
    marginBottom: spacing.xs,
  },
  entryNotes: {
    fontSize: text.body,
    fontStyle: 'italic',
    marginBottom: spacing.sm,
  },
  setsList: {
    gap: spacing.xs,
  },
  setRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xxs,
  },
  setNumber: {
    fontSize: text.body,
    fontWeight: weight.semibold,
    minWidth: 44,
  },
  setDetail: {
    fontSize: text.body,
  },
  setNotes: {
    fontSize: text.footnote,
    fontStyle: 'italic',
    marginLeft: 52,
    marginTop: spacing.xxs,
  },
});
