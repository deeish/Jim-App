import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SheetModal from './SheetModal';
import { radius, spacing, text, useTheme, weight, type ColorPalette } from '../theme';
import {
  WEEKDAYS,
  buzzEditApplied,
  dayMuscles,
  fromIso,
  sfPro,
  shortDate,
  todayIso,
  weekdayIndex,
} from '../lib/planCalendarPrototype';
import {
  isDayCompleted,
  isDayLogged,
  moveMissedDay,
  moveTargetsForDay,
  plannedDayForDate,
  skipMissedDay,
  type MoveTarget,
} from '../lib/planCalendarPrototypeStore';

type Props = {
  /** The missed day the sheet acts on; null = closed. */
  dateIso: string | null;
  /** 'day' hides "Edit this day" — the user is already looking at it. */
  context: 'week' | 'day';
  onClose: () => void;
  /** "Edit this day": navigate to the day view (week context only). */
  onEditDay: (dateIso: string) => void;
  /** A move landed on the server; `targetIso` is where the workout went. */
  onMoved: (targetIso: string) => void;
};

/**
 * The missed-day rescue sheet (Dylan's approved v1): Do it today · Move to
 * another day · Edit this day · Skip. One sheet, opened from the week card's
 * amber Missed pill and the day view's missed banner. "Move" swaps the sheet
 * body for a 7-day target picker; both move paths call the server (the slot
 * really changes day) and report back through `onMoved`.
 */
export default function MissedDaySheet({
  dateIso,
  context,
  onClose,
  onEditDay,
  onMoved,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [stage, setStage] = useState<'actions' | 'move'>('actions');
  /** Which action is in flight ('' = idle). Doubles as the double-tap guard. */
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  // A fresh open always starts on the actions stage, clean.
  useEffect(() => {
    if (dateIso) {
      setStage('actions');
      setBusy('');
      setError('');
    }
  }, [dateIso]);

  const day = dateIso ? plannedDayForDate(dateIso) : null;
  const date = dateIso ? fromIso(dateIso) : null;
  const today = todayIso();
  // The write-once day log means a workout moved onto an already-logged day
  // could never be logged itself — block "Do it today" then.
  const todayBlocked = isDayCompleted(today) || isDayLogged(today);
  const todayWeekday = WEEKDAYS[weekdayIndex(fromIso(today))];

  const runMove = async (which: string, targetIso: string) => {
    if (!dateIso || busy) return;
    setBusy(which);
    setError('');
    try {
      await moveMissedDay(dateIso, targetIso);
      buzzEditApplied();
      onClose();
      onMoved(targetIso);
    } catch {
      setError('Couldn’t move it — check your connection and try again.');
    } finally {
      setBusy('');
    }
  };

  const onSkip = () => {
    if (!dateIso || busy) return;
    skipMissedDay(dateIso);
    buzzEditApplied();
    onClose();
  };

  const renderTargetRow = (target: MoveTarget) => {
    const blocked = target.state === 'logged' || target.state === 'beyond';
    const isToday = target.dateIso === today;
    const d = fromIso(target.dateIso);
    const badge =
      target.state === 'open'
        ? { label: 'Open', style: styles.badgeOpen, textStyle: styles.badgeOpenText }
        : target.state === 'doubles'
          ? { label: 'Doubles up', style: styles.badgeGrey, textStyle: styles.badgeGreyText }
          : target.state === 'logged'
            ? { label: 'Already logged', style: styles.badgeGrey, textStyle: styles.badgeGreyText }
            : { label: 'After plan ends', style: styles.badgeGrey, textStyle: styles.badgeGreyText };
    return (
      <TouchableOpacity
        key={target.dateIso}
        style={[
          styles.targetRow,
          target.state === 'open' && styles.targetRowOpen,
          blocked && styles.rowDisabled,
        ]}
        activeOpacity={0.7}
        disabled={blocked || busy !== ''}
        onPress={() => runMove(target.dateIso, target.dateIso)}
        accessibilityRole="button"
        accessibilityLabel={`Move to ${WEEKDAYS[weekdayIndex(d)]}, ${shortDate(d)}`}
        accessibilityState={{ disabled: blocked }}
      >
        <View style={styles.targetDayCol}>
          <Text style={styles.targetWeekday}>
            {WEEKDAYS[weekdayIndex(d)].slice(0, 3).toUpperCase()}
          </Text>
          <Text style={styles.targetDayNum}>{d.getDate()}</Text>
        </View>
        <View style={styles.targetMain}>
          <Text style={styles.targetTitle} numberOfLines={1}>
            {target.title}
          </Text>
          {(isToday || target.state === 'open') && (
            <Text style={styles.targetNote}>
              {isToday ? 'Today' : 'Nothing scheduled'}
            </Text>
          )}
        </View>
        {busy === target.dateIso ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <View style={badge.style}>
            <Text style={badge.textStyle}>{badge.label}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SheetModal visible={dateIso != null} onClose={onClose} scrimColor={colors.scrim}>
      {/* The card guards its own taps; see SheetModal. */}
      <Pressable
        style={[styles.card, { paddingBottom: insets.bottom + spacing.xl }]}
        onPress={(e) => e.stopPropagation()}
      >
        <View style={styles.grabber} />

        {stage === 'actions' && day && date && (
          <>
            <Text style={styles.title}>Missed: {day.title}</Text>
            <Text style={styles.subtitle}>
              {WEEKDAYS[weekdayIndex(date)]}, {shortDate(date)} ·{' '}
              {dayMuscles(day).join(', ')}
            </Text>

            <TouchableOpacity
              style={[styles.row, (todayBlocked || busy !== '') && styles.rowDisabled]}
              activeOpacity={0.7}
              disabled={todayBlocked || busy !== ''}
              onPress={() => runMove('today', today)}
              accessibilityRole="button"
              accessibilityLabel="Do it today"
              accessibilityState={{ disabled: todayBlocked }}
            >
              <View style={styles.iconTile}>
                <Ionicons name="today-outline" size={19} color={colors.primary} />
              </View>
              <View style={styles.rowMain}>
                <Text style={styles.rowLabel}>Do it today</Text>
                <Text style={styles.rowSub}>
                  {todayBlocked
                    ? 'Today’s session is already logged — pick another day'
                    : `Adds ${day.title} to today, ${todayWeekday}`}
                </Text>
              </View>
              {busy === 'today' ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.row, busy !== '' && styles.rowDisabled]}
              activeOpacity={0.7}
              disabled={busy !== ''}
              onPress={() => setStage('move')}
              accessibilityRole="button"
              accessibilityLabel="Move to another day"
            >
              <View style={styles.iconTile}>
                <Ionicons name="swap-horizontal" size={19} color={colors.primary} />
              </View>
              <View style={styles.rowMain}>
                <Text style={styles.rowLabel}>Move to another day</Text>
                <Text style={styles.rowSub}>Pick a day this week or next</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>

            {context === 'week' && (
              <TouchableOpacity
                style={[styles.row, busy !== '' && styles.rowDisabled]}
                activeOpacity={0.7}
                disabled={busy !== ''}
                onPress={() => {
                  onClose();
                  if (dateIso) onEditDay(dateIso);
                }}
                accessibilityRole="button"
                accessibilityLabel="Edit this day"
              >
                <View style={styles.iconTile}>
                  <Ionicons name="create-outline" size={19} color={colors.primary} />
                </View>
                <View style={styles.rowMain}>
                  <Text style={styles.rowLabel}>Edit this day</Text>
                  <Text style={styles.rowSub}>Swap or remove its exercises</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.row, styles.lastRow, busy !== '' && styles.rowDisabled]}
              activeOpacity={0.7}
              disabled={busy !== ''}
              onPress={onSkip}
              accessibilityRole="button"
              accessibilityLabel="Skip this workout"
            >
              <View style={[styles.iconTile, styles.iconTileGrey]}>
                <Ionicons name="close-circle-outline" size={19} color={colors.textTertiary} />
              </View>
              <View style={styles.rowMain}>
                <Text style={[styles.rowLabel, styles.rowLabelMuted]}>Skip this workout</Text>
                <Text style={styles.rowSub}>Marks it skipped — the plan stays unchanged</Text>
              </View>
            </TouchableOpacity>
          </>
        )}

        {stage === 'move' && day && (
          <>
            <View style={styles.moveHeader}>
              <TouchableOpacity
                onPress={() => setStage('actions')}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Back to options"
                style={styles.moveBack}
              >
                <Ionicons name="chevron-back" size={20} color={colors.primary} />
              </TouchableOpacity>
              <Text style={styles.title}>Move {day.title} to…</Text>
            </View>
            <Text style={styles.subtitle}>
              Open days are highlighted. Picking a training day doubles it up.
            </Text>
            {moveTargetsForDay().map(renderTargetRow)}
          </>
        )}

        {error !== '' && <Text style={styles.errorText}>{error}</Text>}
      </Pressable>
    </SheetModal>
  );
}

function createStyles(c: ColorPalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    grabber: {
      alignSelf: 'center',
      width: 36,
      height: 5,
      borderRadius: radius.pill,
      backgroundColor: c.border,
      marginBottom: spacing.md,
    },
    title: {
      ...sfPro,
      fontSize: text.headline,
      fontWeight: weight.bold,
      color: c.text,
    },
    subtitle: {
      ...sfPro,
      fontSize: text.footnote,
      color: c.textMuted,
      marginTop: spacing.xxs,
      marginBottom: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    lastRow: {
      borderBottomWidth: 0,
    },
    rowDisabled: {
      opacity: 0.45,
    },
    iconTile: {
      width: 34,
      height: 34,
      borderRadius: radius.sm,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconTileGrey: {
      backgroundColor: c.background,
    },
    rowMain: {
      flex: 1,
    },
    rowLabel: {
      ...sfPro,
      fontSize: text.callout,
      fontWeight: weight.semibold,
      color: c.text,
    },
    rowLabelMuted: {
      color: c.textTertiary,
      fontWeight: weight.medium,
    },
    rowSub: {
      ...sfPro,
      fontSize: text.footnote,
      color: c.textMuted,
      marginTop: 1,
    },
    moveHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    moveBack: {
      marginRight: spacing.xs,
      marginLeft: -spacing.xs,
    },
    targetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md,
    },
    targetRowOpen: {
      backgroundColor: c.primarySoft,
      marginVertical: spacing.xxs,
    },
    targetDayCol: {
      width: 44,
      alignItems: 'center',
    },
    targetWeekday: {
      ...sfPro,
      fontSize: text.caption,
      fontWeight: weight.bold,
      color: c.textMuted,
    },
    targetDayNum: {
      ...sfPro,
      fontSize: text.callout,
      fontWeight: weight.semibold,
      color: c.text,
    },
    targetMain: {
      flex: 1,
    },
    targetTitle: {
      ...sfPro,
      fontSize: text.body,
      fontWeight: weight.medium,
      color: c.text,
    },
    targetNote: {
      ...sfPro,
      fontSize: text.caption,
      color: c.textMuted,
      marginTop: 1,
    },
    badgeOpen: {
      backgroundColor: c.successSoft,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xxs,
    },
    badgeOpenText: {
      ...sfPro,
      fontSize: text.caption,
      fontWeight: weight.bold,
      color: c.success,
    },
    badgeGrey: {
      backgroundColor: c.background,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xxs,
    },
    badgeGreyText: {
      ...sfPro,
      fontSize: text.caption,
      fontWeight: weight.semibold,
      color: c.textMuted,
    },
    errorText: {
      ...sfPro,
      fontSize: text.footnote,
      color: c.error,
      textAlign: 'center',
      marginTop: spacing.md,
    },
  });
}
