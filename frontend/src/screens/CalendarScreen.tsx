import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { useTheme } from '../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { getWorkoutLogs } from '../services/workoutService';
import type { WorkoutLog, WorkoutLogEntry, WorkoutLogEntrySet } from '../types/workout';
import { formatLocalYmd } from '../lib/planCalendar';

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

function SetRow({ set, colors }: { set: WorkoutLogEntrySet; colors: Record<string, string> }) {
  const weightStr = set.weight != null && set.weight > 0 ? `${set.weight} lb` : '—';
  return (
    <View style={styles.setRow}>
      <Text style={[styles.setNumber, { color: colors.textMuted }]}>Set {set.setNumber}</Text>
      <Text style={[styles.setDetail, { color: colors.text }]}>
        {set.reps} × {weightStr}
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
  colors,
}: {
  entry: WorkoutLogEntry;
  colors: Record<string, string>;
}) {
  const sets = (entry.completedSets ?? []) as WorkoutLogEntrySet[];
  return (
    <View style={[styles.entryBlock, { borderColor: colors.border }]}>
      <Text style={[styles.entryName, { color: colors.text }]}>{entry.name ?? 'Exercise'}</Text>
      {entry.notes ? (
        <Text style={[styles.entryNotes, { color: colors.textMuted }]}>{entry.notes}</Text>
      ) : null}
      <View style={styles.setsList}>
        {sets.map((s) => (
          <SetRow key={s.setNumber} set={s} colors={colors} />
        ))}
      </View>
    </View>
  );
}

function DayDetailSection({
  dateLabel,
  logs,
  colors,
  onClearSelection,
}: {
  dateLabel: string;
  logs: WorkoutLog[];
  colors: Record<string, string>;
  onClearSelection: () => void;
}) {
  if (logs.length === 0) {
    return (
      <View>
        <View style={styles.dayDetailHeader}>
          <Text style={[styles.dayDetailTitle, { color: colors.text }]}>{dateLabel}</Text>
          <TouchableOpacity onPress={onClearSelection} hitSlop={12}>
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
        <TouchableOpacity onPress={onClearSelection} hitSlop={12}>
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
              <LogEntryBlock key={entry.id} entry={entry} colors={colors} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

export default function CalendarScreen({ navigation }: Props) {
  const { colors } = useTheme();
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>History</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        <View style={[styles.monthNav, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={prevMonth} style={styles.monthNavButton}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.monthTitle, { color: colors.text }]}>
            {MONTHS[selectedMonth]} {selectedYear}
          </Text>
          <TouchableOpacity onPress={nextMonth} style={styles.monthNavButton}>
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
          <Text style={[styles.loadingText, { color: colors.error, textAlign: 'center', marginTop: 8 }]}>
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
                        isToday(day) && { backgroundColor: colors.primary, borderRadius: 20 },
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
                          isToday(day) && { color: colors.background, fontWeight: '700' },
                        ]}
                      >
                        {day}
                      </Text>
                      {(() => {
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 40,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  monthNavButton: {
    padding: 8,
  },
  monthTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 12,
  },
  weekdayRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  weekdayLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  calendarGrid: {
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 4,
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
    fontSize: 16,
    fontWeight: '500',
  },
  logBadge: {
    position: 'absolute',
    bottom: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  logBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  hintRow: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: 'center',
  },
  hintText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  dayDetailSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    borderTopWidth: 1,
  },
  dayDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  dayDetailTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  dayDetailSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  emptyDayText: {
    fontSize: 15,
    textAlign: 'center',
    paddingVertical: 24,
  },
  logBlock: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  logWorkoutName: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  logMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  logMeta: {
    fontSize: 14,
  },
  overallNotesBox: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  overallNotesLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  overallNotesText: {
    fontSize: 14,
    lineHeight: 20,
  },
  entriesList: {
    gap: 12,
  },
  entryBlock: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    marginBottom: 12,
  },
  entryName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  entryNotes: {
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  setsList: {
    gap: 4,
  },
  setRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  setNumber: {
    fontSize: 13,
    fontWeight: '600',
    minWidth: 44,
  },
  setDetail: {
    fontSize: 14,
  },
  setNotes: {
    fontSize: 12,
    fontStyle: 'italic',
    marginLeft: 52,
    marginTop: 2,
  },
});
