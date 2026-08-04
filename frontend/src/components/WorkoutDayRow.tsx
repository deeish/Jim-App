import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, text, tracking, useTheme, weight } from '../theme';
import type { ColorPalette } from '../theme/colors';

export type WorkoutDayRowType = 'strength' | 'cardio' | 'recovery';
export type WorkoutDayRowKind = 'workout' | 'rest' | 'empty';

type Props = {
  /** Three-letter day label (Mon/Tue/…) on the first row of a day; null leaves the slot blank for stacked rows. */
  dayLabel: string | null;
  kind: WorkoutDayRowKind;
  /** Used only when kind === 'workout'. */
  type?: WorkoutDayRowType;
  title: string;
  /** Null for rest/empty rows. */
  etaMinutes?: number | null;
  isToday?: boolean;
  isCompleted?: boolean;
  isBeingDragged?: boolean;
  /** Slot for the ⋯ button — parent provides a gesture-wrapped node. Hidden for empty rows. */
  moreButton?: React.ReactNode;
};

export function pickWorkoutIcon(
  type: WorkoutDayRowType,
  isRest: boolean,
): keyof typeof Ionicons.glyphMap {
  if (isRest) return 'moon-outline';
  if (type === 'cardio') return 'bicycle-outline';
  if (type === 'recovery') return 'leaf-outline';
  return 'barbell-outline';
}

export function pickWorkoutAccent(
  type: WorkoutDayRowType,
  isRest: boolean,
  colors: ColorPalette,
): string {
  if (isRest) return colors.secondary;
  if (type === 'cardio') return colors.workoutCardio;
  if (type === 'recovery') return colors.workoutRecovery;
  return colors.primary;
}

export function workoutEyebrow(type: WorkoutDayRowType, isRest: boolean): string {
  if (isRest) return 'REST';
  return type.toUpperCase();
}

export default function WorkoutDayRow({
  dayLabel,
  kind,
  type = 'strength',
  title,
  etaMinutes,
  isToday = false,
  isCompleted = false,
  isBeingDragged = false,
  moreButton,
}: Props) {
  const { colors } = useTheme();
  const accent = pickWorkoutAccent(type, kind === 'rest', colors);

  const styles = useMemo(
    () => makeStyles(colors, accent, isToday, isCompleted, isBeingDragged, kind),
    [colors, accent, isToday, isCompleted, isBeingDragged, kind],
  );

  return (
    <View style={styles.row}>
      <Text style={styles.dayLabel}>{dayLabel ?? ''}</Text>

      <View style={styles.statusCell}>
        {kind === 'empty' ? (
          <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
        ) : kind === 'rest' ? (
          <View style={styles.restDot} />
        ) : isCompleted ? (
          <View style={[styles.iconCircle, { backgroundColor: colors.secondary }]}>
            <Ionicons name="checkmark" size={16} color={colors.onPrimary} />
          </View>
        ) : (
          <View style={[styles.iconCircle, { backgroundColor: accent + '22' }]}>
            <Ionicons name={pickWorkoutIcon(type, false)} size={16} color={accent} />
          </View>
        )}
      </View>

      <View style={styles.titleCell}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {isToday ? (
          <View style={styles.todayPill}>
            <Text style={styles.todayPillText}>Today</Text>
          </View>
        ) : null}
      </View>

      {kind === 'workout' && etaMinutes != null ? (
        <Text style={styles.duration}>{etaMinutes} min</Text>
      ) : null}

      {kind !== 'empty' ? <View style={styles.moreSlot}>{moreButton}</View> : null}
    </View>
  );
}

function makeStyles(
  colors: ColorPalette,
  accent: string,
  isToday: boolean,
  isCompleted: boolean,
  isBeingDragged: boolean,
  kind: WorkoutDayRowKind,
) {
  const isEmpty = kind === 'empty';
  const baseLeftPadding = isToday ? 9 : 12;

  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.lg,
      paddingLeft: baseLeftPadding,
      paddingRight: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: isToday ? colors.primarySoft : 'transparent',
      borderWidth: isCompleted ? 1 : 0,
      borderColor: isCompleted ? colors.secondary + '55' : 'transparent',
      borderLeftWidth: isToday ? 3 : isCompleted ? 1 : 0,
      borderLeftColor: isToday ? colors.primary : isCompleted ? colors.secondary + '55' : 'transparent',
      opacity: isBeingDragged ? 0.3 : 1,
      borderStyle: isBeingDragged ? 'dashed' : 'solid',
      minHeight: 58,
    },
    dayLabel: {
      width: 34,
      fontSize: text.body,
      fontWeight: weight.bold,
      color: colors.textMuted,
      letterSpacing: tracking.wide,
    },
    statusCell: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconCircle: {
      width: 28,
      height: 28,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    restDot: {
      width: 6,
      height: 6,
      borderRadius: radius.xs,
      backgroundColor: colors.textMuted,
    },
    titleCell: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    title: {
      flexShrink: 1,
      fontSize: text.callout,
      fontWeight: weight.semibold,
      color: isCompleted ? colors.textTertiary : isEmpty ? colors.primary : colors.text,
    },
    todayPill: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xxs,
      borderRadius: radius.xs,
      backgroundColor: colors.secondary,
    },
    todayPillText: {
      fontSize: text.caption,
      fontWeight: weight.bold,
      color: colors.onPrimary,
      letterSpacing: tracking.wide,
    },
    duration: {
      fontSize: text.body,
      fontWeight: weight.semibold,
      color: colors.textSecondary,
    },
    moreSlot: {
      width: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
