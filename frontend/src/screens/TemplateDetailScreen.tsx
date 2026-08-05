import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, text, tracking, useTheme, weight, type ColorPalette } from '../theme';
import { SkeletonCard } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import { MonthCalendarPicker } from '../components/MonthCalendarPicker';
import type { RootStackParamList } from '../types/navigation';
import type { Weekday } from '../types/plan';
import {
  getPlanTemplate,
  type PlanTemplateDetail,
  type TemplateExercise,
} from '../services/templateService';
import { createPlan } from '../services/planService';
import {
  WEEKDAY_ORDER,
  estimateTemplateSessionMinutes,
  materializeTemplatePlan,
  suggestedTemplateStartDateISO,
  toggleTemplateWeekday,
} from '../lib/templatePlan';
import { formatRestSecondsForPreview } from '../lib/exercisePrescription';
import { formatLocalYmd, parseLocalYmd } from '../lib/planCalendar';

type Nav = NativeStackNavigationProp<RootStackParamList, 'TemplateDetail'>;
type Route = RouteProp<RootStackParamList, 'TemplateDetail'>;

type Props = { navigation: Nav; route: Route };

function repDisplay(ex: TemplateExercise, weekIndex0: number): string {
  const week = ex.weekly[weekIndex0];
  if (!week) return '';
  if (ex.prescriptionType === 'time') {
    return `${week.sets} × ${formatRestSecondsForPreview(week.durationSeconds ?? 0)}`;
  }
  const lo = week.repsMin ?? 0;
  const hi = week.repsMax ?? lo;
  return `${week.sets} × ${hi > lo ? `${lo}–${hi}` : `${lo}`}`;
}

function formatStartDate(iso: string): string {
  const d = parseLocalYmd(iso);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Full week-by-week view of one hand-authored program, plus the apply flow:
 * pick a start date and training days, then the template is materialized into
 * the same `POST /plans` body the generated-preview Apply sends. This screen
 * IS the preview — unlike the AI flow there is nothing to generate, the
 * program shown is byte-for-byte what gets saved.
 */
export default function TemplateDetailScreen({ navigation, route }: Props) {
  const { templateId } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [template, setTemplate] = useState<PlanTemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(1);

  const [applyOpen, setApplyOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [weekdays, setWeekdays] = useState<Weekday[]>([]);
  const [startDateISO, setStartDateISO] = useState(suggestedTemplateStartDateISO());
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const detail = await getPlanTemplate(templateId);
      setTemplate(detail);
      setWeekdays(detail.defaultWeekdays);
    } catch (e) {
      console.warn('[TemplateDetail] load failed:', e);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    void load();
  }, [load]);

  const weekMeta = template?.weekMeta[selectedWeek - 1];
  const canApply = template != null && weekdays.length === template.daysPerWeek;

  const handleApply = async () => {
    if (!template || !canApply) return;
    setApplying(true);
    try {
      await createPlan(
        materializeTemplatePlan(template, { weekdays, startDateISO }),
      );
      setApplyOpen(false);
      // Same landing as the generated-preview Apply: a clean Plan stack
      // showing the freshly saved plan.
      navigation.dispatch(
        CommonActions.reset({ index: 0, routes: [{ name: 'PlanList' }] }),
      );
    } catch (e) {
      console.warn('[TemplateDetail] apply failed:', e);
      Alert.alert('Could not save plan', 'Check your connection and try again.');
    } finally {
      setApplying(false);
    }
  };

  if (loading && !template) {
    return (
      <View style={styles.container}>
        <View style={styles.skeletonWrap}>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={4} style={{ marginTop: spacing.lg }} />
        </View>
      </View>
    );
  }

  if (failed || !template) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="cloud-offline-outline"
          title="Could not load this program"
          body="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => void load()}
          tone="error"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.tagline}>{template.tagline}</Text>
        <View style={styles.chipRow}>
          <View style={[styles.chip, { backgroundColor: colors.primarySoft }]}>
            <Text style={[styles.chipText, { color: colors.primary }]}>
              {template.split}
            </Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{template.daysPerWeek} days/wk</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{template.weeksCount} weeks</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipText}>
              {template.sessionMinutes.min}–{template.sessionMinutes.max} min
            </Text>
          </View>
        </View>

        <View style={styles.summaryCard}>
          {template.summary.map((line) => (
            <View key={line} style={styles.summaryRow}>
              <Ionicons
                name="checkmark-circle"
                size={15}
                color={colors.success}
                style={styles.summaryIcon}
              />
              <Text style={styles.summaryText}>{line}</Text>
            </View>
          ))}
          <Text style={styles.progressionText}>{template.progression}</Text>
        </View>

        <Text style={styles.sectionLabel}>WEEK BY WEEK</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.weekChipRow}
        >
          {template.weekMeta.map((meta) => {
            const selected = meta.weekNumber === selectedWeek;
            return (
              <TouchableOpacity
                key={meta.weekNumber}
                style={[styles.weekChip, selected && styles.weekChipSelected]}
                onPress={() => setSelectedWeek(meta.weekNumber)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Week ${meta.weekNumber}: ${meta.label}`}
              >
                <Text
                  style={[styles.weekChipText, selected && styles.weekChipTextSelected]}
                >
                  Wk {meta.weekNumber}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {weekMeta ? (
          <View style={styles.weekMetaCard}>
            <Text style={styles.weekMetaLabel}>{weekMeta.label}</Text>
            <Text style={styles.weekMetaNote}>{weekMeta.coachNote}</Text>
          </View>
        ) : null}

        {template.sessions.map((session, i) => (
          <View key={session.key} style={styles.sessionCard}>
            <View style={styles.sessionHeaderRow}>
              <Text style={styles.sessionTitle}>{session.title}</Text>
              <Text style={styles.sessionMinutes}>
                ~{estimateTemplateSessionMinutes(session, selectedWeek - 1)} min
              </Text>
            </View>
            <Text style={styles.sessionFocus}>
              Day {i + 1} · {session.focus}
            </Text>
            {session.exercises.map((ex) => {
              const week = ex.weekly[selectedWeek - 1];
              const note = week?.note ?? ex.note;
              return (
                <View key={ex.exerciseId} style={styles.exerciseRow}>
                  <View style={styles.exerciseTitleRow}>
                    <Text style={styles.exerciseName} numberOfLines={2}>
                      {ex.name}
                    </Text>
                    <Text style={styles.exercisePrescription}>
                      {repDisplay(ex, selectedWeek - 1)}
                    </Text>
                  </View>
                  <View style={styles.exerciseMetaRow}>
                    {ex.supersetGroup ? (
                      <View style={styles.supersetBadge}>
                        <Text style={styles.supersetBadgeText}>
                          SS {ex.supersetGroup}
                        </Text>
                      </View>
                    ) : null}
                    <Text style={styles.exerciseRest}>
                      Rest {formatRestSecondsForPreview(ex.restSeconds)}
                    </Text>
                  </View>
                  {note ? <Text style={styles.exerciseNote}>{note}</Text> : null}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>

      <View style={styles.ctaBar}>
        <TouchableOpacity
          style={[styles.ctaButton, { backgroundColor: colors.primary }]}
          onPress={() => setApplyOpen(true)}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Use this template"
        >
          <Ionicons name="calendar-outline" size={18} color={colors.onPrimary} />
          <Text style={[styles.ctaButtonText, { color: colors.onPrimary }]}>
            Use this template
          </Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={applyOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setApplyOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setApplyOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Schedule this program</Text>

            <Text style={styles.modalSectionLabel}>STARTS</Text>
            <TouchableOpacity
              style={styles.startDateRow}
              onPress={() => setDatePickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Change start date"
            >
              <Ionicons name="calendar-outline" size={16} color={colors.primary} />
              <Text style={styles.startDateText}>{formatStartDate(startDateISO)}</Text>
              <Text style={[styles.startDateChange, { color: colors.primary }]}>
                Change
              </Text>
            </TouchableOpacity>

            <Text style={styles.modalSectionLabel}>
              TRAINING DAYS · PICK {template.daysPerWeek}
            </Text>
            <View style={styles.dayRow}>
              {WEEKDAY_ORDER.map((day) => {
                const selected = weekdays.includes(day);
                const atCap = weekdays.length >= template.daysPerWeek;
                return (
                  <TouchableOpacity
                    key={day}
                    style={[
                      styles.dayChip,
                      selected && styles.dayChipSelected,
                      !selected && atCap && styles.dayChipDim,
                    ]}
                    onPress={() =>
                      setWeekdays((prev) =>
                        toggleTemplateWeekday(prev, day, template.daysPerWeek),
                      )
                    }
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${day} training day`}
                  >
                    <Text
                      style={[styles.dayChipText, selected && styles.dayChipTextSelected]}
                    >
                      {day.slice(0, 3)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.modalHint}>
              {canApply
                ? `Week 1 starts the week of ${formatStartDate(startDateISO)}. Applying replaces your current plan.`
                : `Choose ${template.daysPerWeek - weekdays.length} more day${
                    template.daysPerWeek - weekdays.length === 1 ? '' : 's'
                  }.`}
            </Text>

            <TouchableOpacity
              style={[
                styles.ctaButton,
                { backgroundColor: colors.primary },
                (!canApply || applying) && styles.ctaButtonDisabled,
              ]}
              disabled={!canApply || applying}
              onPress={handleApply}
              accessibilityRole="button"
              accessibilityLabel="Add this program to my plan"
            >
              {applying ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Text style={[styles.ctaButtonText, { color: colors.onPrimary }]}>
                  Add to my plan
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setApplyOpen(false)}
              accessibilityRole="button"
            >
              <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={datePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDatePickerOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setDatePickerOpen(false)}>
          <Pressable style={styles.datePanel} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Choose start date</Text>
            <MonthCalendarPicker
              selectedIso={startDateISO}
              minIso={formatLocalYmd(new Date())}
              colors={colors}
              onSelectDay={(iso) => {
                setStartDateISO(iso);
                setDatePickerOpen(false);
              }}
            />
            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setDatePickerOpen(false)}
              accessibilityRole="button"
            >
              <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    skeletonWrap: {
      padding: spacing.lg,
    },
    content: {
      padding: spacing.lg,
      paddingBottom: 96,
    },
    tagline: {
      fontSize: text.body,
      lineHeight: 20,
      color: c.textSecondary,
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
      backgroundColor: c.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    chipText: {
      fontSize: text.footnote,
      fontWeight: weight.semibold,
      color: c.textSecondary,
    },
    summaryCard: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: spacing.lg,
      marginTop: spacing.lg,
    },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: spacing.sm,
    },
    summaryIcon: {
      marginTop: 2,
      marginRight: spacing.sm,
    },
    summaryText: {
      flex: 1,
      fontSize: text.body,
      lineHeight: 20,
      color: c.text,
    },
    progressionText: {
      fontSize: text.footnote,
      lineHeight: 18,
      color: c.textSecondary,
      marginTop: spacing.sm,
    },
    sectionLabel: {
      fontSize: text.caption,
      fontWeight: weight.bold,
      letterSpacing: tracking.widest,
      color: c.textTertiary,
      marginTop: spacing.xxl,
      marginBottom: spacing.sm,
    },
    weekChipRow: {
      gap: spacing.sm,
      paddingRight: spacing.lg,
    },
    weekChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    weekChipSelected: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    weekChipText: {
      fontSize: text.footnote,
      fontWeight: weight.semibold,
      color: c.textSecondary,
    },
    weekChipTextSelected: {
      color: c.onPrimary,
    },
    weekMetaCard: {
      backgroundColor: c.primarySoft,
      borderRadius: radius.md,
      padding: spacing.md,
      marginTop: spacing.md,
    },
    weekMetaLabel: {
      fontSize: text.body,
      fontWeight: weight.bold,
      color: c.text,
    },
    weekMetaNote: {
      fontSize: text.footnote,
      lineHeight: 18,
      color: c.textSecondary,
      marginTop: spacing.xxs,
    },
    sessionCard: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: spacing.lg,
      marginTop: spacing.lg,
    },
    sessionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sessionTitle: {
      flex: 1,
      fontSize: text.callout,
      fontWeight: weight.bold,
      color: c.text,
      marginRight: spacing.sm,
    },
    sessionMinutes: {
      fontSize: text.footnote,
      fontWeight: weight.semibold,
      color: c.textTertiary,
    },
    sessionFocus: {
      fontSize: text.footnote,
      color: c.textSecondary,
      marginTop: spacing.xxs,
      marginBottom: spacing.sm,
    },
    exerciseRow: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
      paddingVertical: spacing.md,
    },
    exerciseTitleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    exerciseName: {
      flex: 1,
      fontSize: text.body,
      fontWeight: weight.semibold,
      color: c.text,
    },
    exercisePrescription: {
      fontSize: text.body,
      fontWeight: weight.bold,
      color: c.primary,
      fontVariant: ['tabular-nums'],
    },
    exerciseMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.xxs,
    },
    supersetBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xxs,
      borderRadius: radius.xs,
      backgroundColor: c.warningSoft,
    },
    supersetBadgeText: {
      fontSize: text.caption,
      fontWeight: weight.bold,
      color: c.warning,
      letterSpacing: tracking.wide,
    },
    exerciseRest: {
      fontSize: text.caption,
      color: c.textTertiary,
    },
    exerciseNote: {
      fontSize: text.footnote,
      lineHeight: 18,
      color: c.textSecondary,
      marginTop: spacing.xs,
    },
    ctaBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      padding: spacing.lg,
      paddingBottom: spacing.xxl,
      backgroundColor: c.background,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    ctaButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      borderRadius: radius.md,
      paddingVertical: spacing.lg - 2,
    },
    ctaButtonDisabled: {
      opacity: 0.5,
    },
    ctaButtonText: {
      fontSize: text.callout,
      fontWeight: weight.bold,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: c.background,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.xl,
      paddingBottom: spacing.xxxl,
    },
    datePanel: {
      backgroundColor: c.background,
      borderRadius: radius.xl,
      padding: spacing.xl,
      margin: spacing.xl,
      alignSelf: 'center',
      width: '90%',
      maxWidth: 420,
      marginTop: 'auto',
      marginBottom: 'auto',
    },
    modalTitle: {
      fontSize: text.headline,
      fontWeight: weight.bold,
      color: c.text,
      marginBottom: spacing.md,
    },
    modalSectionLabel: {
      fontSize: text.caption,
      fontWeight: weight.bold,
      letterSpacing: tracking.widest,
      color: c.textTertiary,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    startDateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      padding: spacing.md,
    },
    startDateText: {
      flex: 1,
      fontSize: text.callout,
      fontWeight: weight.semibold,
      color: c.text,
    },
    startDateChange: {
      fontSize: text.footnote,
      fontWeight: weight.semibold,
    },
    dayRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    dayChip: {
      minWidth: 44,
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    dayChipSelected: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    dayChipDim: {
      opacity: 0.45,
    },
    dayChipText: {
      fontSize: text.footnote,
      fontWeight: weight.semibold,
      color: c.textSecondary,
    },
    dayChipTextSelected: {
      color: c.onPrimary,
    },
    modalHint: {
      fontSize: text.footnote,
      lineHeight: 18,
      color: c.textSecondary,
      marginTop: spacing.md,
      marginBottom: spacing.lg,
    },
    modalCancel: {
      alignItems: 'center',
      paddingVertical: spacing.md,
      marginTop: spacing.sm,
    },
    modalCancelText: {
      fontSize: text.callout,
      fontWeight: weight.semibold,
    },
  });
}
