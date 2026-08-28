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
  buzzTap,
  dayMuscles,
  fromIso,
  nearestOpenIso,
  sfPro,
  shortDate,
  shortWeekday,
  todayIso,
  weekdayIndex,
} from '../lib/planCalendarPrototype';
import {
  canMoveDay,
  canReceiveSwap,
  commitMoves,
  dayHasLocalLogs,
  isDaySkipped,
  moveTargetsForDay,
  plannedDayForDate,
  skipDay,
  stagedSessionsForDate,
  unskipDay,
  type MoveTarget,
  type PendingMove,
} from '../lib/planCalendarPrototypeStore';

type Props = {
  /** The day the sheet acts on; null = closed. */
  dateIso: string | null;
  /** 'missed' = the rescue door (pill/banner); 'move' = the day-actions door
   *  (week-card long-press, day-view ⋯). */
  mode: 'missed' | 'move';
  /** 'day' hides "Edit this day" — the user is already looking at it. */
  context: 'week' | 'day';
  onClose: () => void;
  /** "Edit this day": navigate to the day view (week context only). */
  onEditDay: (dateIso: string) => void;
  /** The chain committed; `targetIso` is where the ORIGINAL day's workout went. */
  onMoved: (targetIso: string) => void;
  /** "Quick workout" (day context, TODAY only): open the quick-session
   *  builder — its own sheet handles replace/add + the trained-day confirm. */
  onQuickWorkout?: () => void;
};

/**
 * One step of a make-room chain: `slotIds` are in hand looking for a home,
 * `pendingBefore` holds every relocation decided by earlier steps. Nothing
 * commits until a step resolves the whole chain (commitMoves) — backing out
 * or dismissing at ANY step discards everything.
 */
type Frame = {
  fromIso: string;
  slotIds: string[];
  title: string;
  stage: 'sessions' | 'picker' | 'room';
  roomTargetIso?: string;
  pendingBefore: PendingMove[];
};

/**
 * The workout-move sheet ("Make Room", Dylan's approved design): the rescue
 * actions for missed days, free moving + skipping for any un-logged upcoming
 * day, and — when the chosen target is busy — the make-room step: swap, send
 * the displaced workout to the nearest open day, place it yourself
 * (recursively), or deliberately keep both. Doubling is never a default: it's
 * the quiet last row, labeled for what it is.
 */
export default function WorkoutMoveSheet({
  dateIso,
  mode,
  context,
  onClose,
  onEditDay,
  onMoved,
  onQuickWorkout,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [frames, setFrames] = useState<Frame[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (dateIso) {
      setFrames([]);
      setBusy('');
      setError('');
    }
  }, [dateIso, mode]);

  const day = dateIso ? plannedDayForDate(dateIso) : null;
  const date = dateIso ? fromIso(dateIso) : null;
  const today = todayIso();
  const frame = frames.length > 0 ? frames[frames.length - 1] : null;

  const commit = async (which: string, pending: PendingMove[]) => {
    if (!dateIso || busy) return;
    buzzTap();
    setBusy(which);
    setError('');
    try {
      await commitMoves(pending);
      buzzEditApplied();
      onClose();
      // Where did the original day's workout land? (Day-view follow.)
      const primary = pending.find((p) => p.fromIso === dateIso);
      onMoved(primary?.targetIso ?? dateIso);
    } catch {
      setError('Couldn’t move it — check your connection and try again.');
    } finally {
      setBusy('');
    }
  };

  /** Open the placement flow for this day's sessions (which-one step first
   *  when the day is doubled — un-doubling must be slot-scoped). */
  const startMoveFlow = () => {
    if (!dateIso) return;
    const sessions = stagedSessionsForDate(dateIso);
    if (sessions.length === 0) return;
    buzzTap();
    if (sessions.length > 1) {
      setFrames([
        { fromIso: dateIso, slotIds: [], title: '', stage: 'sessions', pendingBefore: [] },
      ]);
    } else {
      setFrames([
        {
          fromIso: dateIso,
          slotIds: [sessions[0].slotId],
          title: sessions[0].title,
          stage: 'picker',
          pendingBefore: [],
        },
      ]);
    }
  };

  /** "Do it today" (missed only): open today = straight commit; busy today =
   *  the make-room step for today, same as picking it in the picker. */
  const startDoToday = () => {
    if (!dateIso || !day) return;
    const sessions = stagedSessionsForDate(dateIso);
    if (sessions.length === 0) return;
    const todayTarget = moveTargetsForDay()[0];
    const slotIds = sessions.map((s) => s.slotId);
    if (todayTarget.state === 'open') {
      void commit(
        'today',
        slotIds.map((slotId) => ({ slotId, fromIso: dateIso, targetIso: today, title: day.title })),
      );
    } else if (todayTarget.state === 'occupied') {
      buzzTap();
      setFrames([
        {
          fromIso: dateIso,
          slotIds,
          title: day.title,
          stage: 'room',
          roomTargetIso: today,
          pendingBefore: [],
        },
      ]);
    }
  };

  const popFrame = () => {
    buzzTap();
    setError('');
    setFrames((f) => f.slice(0, -1));
  };

  // ---------------------------------------------------------------------
  // Stage renderers
  // ---------------------------------------------------------------------

  const renderRootActions = () => {
    if (!day || !date || !dateIso) return null;
    const todayState = moveTargetsForDay()[0].state;
    const todayBlocked = todayState === 'logged' || todayState === 'beyond';
    // 'move' mode can open on days that can't actually move (the day-view ⋯
    // shows why instead of hiding the door): started days keep their
    // date-keyed set logs, so Move and Skip grey out with the reason.
    const started = dayHasLocalLogs(dateIso);
    const skipped = isDaySkipped(dateIso);
    const isPast = dateIso < today;
    const moveBlocked = mode === 'move' && !canMoveDay(dateIso);
    return (
      <>
        <Text style={styles.title}>
          {mode === 'missed' ? `Missed: ${day.title}` : day.title}
        </Text>
        <Text style={styles.subtitle}>
          {WEEKDAYS[weekdayIndex(date)]}, {shortDate(date)} · {dayMuscles(day).join(', ')}
        </Text>

        {mode === 'missed' && (
          <TouchableOpacity
            style={[styles.row, (todayBlocked || busy !== '') && styles.rowDisabled]}
            activeOpacity={0.7}
            disabled={todayBlocked || busy !== ''}
            onPress={startDoToday}
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
                {todayState === 'logged'
                  ? 'Today’s session is already logged — pick another day'
                  : todayState === 'beyond'
                    ? 'Your program has ended'
                    : todayState === 'occupied'
                      ? `Today has ${moveTargetsForDay()[0].title} — you’ll choose where it goes`
                      : `Adds ${day.title} to today, ${WEEKDAYS[weekdayIndex(fromIso(today))]}`}
              </Text>
            </View>
            {busy === 'today' ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            )}
          </TouchableOpacity>
        )}

        {(mode === 'missed' || !isPast) && (
          <TouchableOpacity
            style={[styles.row, (moveBlocked || busy !== '') && styles.rowDisabled]}
            activeOpacity={0.7}
            disabled={moveBlocked || busy !== ''}
            onPress={startMoveFlow}
            accessibilityRole="button"
            accessibilityLabel="Move to another day"
            accessibilityState={{ disabled: moveBlocked }}
          >
            <View style={styles.iconTile}>
              <Ionicons name="swap-horizontal" size={19} color={colors.primary} />
            </View>
            <View style={styles.rowMain}>
              <Text style={styles.rowLabel}>Move to another day</Text>
              <Text style={styles.rowSub}>
                {moveBlocked
                  ? 'You’ve logged sets here — they stay with their day'
                  : 'Pick a day this week or next'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        )}

        {mode === 'move' && dateIso === today && onQuickWorkout != null && (
          <TouchableOpacity
            style={[styles.row, busy !== '' && styles.rowDisabled]}
            activeOpacity={0.7}
            disabled={busy !== ''}
            onPress={() => {
              buzzTap();
              onClose();
              onQuickWorkout();
            }}
            accessibilityRole="button"
            accessibilityLabel="Quick workout"
          >
            <View style={styles.iconTile}>
              <Ionicons name="flash-outline" size={19} color={colors.primary} />
            </View>
            <View style={styles.rowMain}>
              <Text style={styles.rowLabel}>Quick workout</Text>
              <Text style={styles.rowSub}>Build a fresh session for today</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        )}

        {context === 'week' && (
          <TouchableOpacity
            style={[styles.row, busy !== '' && styles.rowDisabled]}
            activeOpacity={0.7}
            disabled={busy !== ''}
            onPress={() => {
              buzzTap();
              onClose();
              onEditDay(dateIso);
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

        {mode === 'missed' && (
          <TouchableOpacity
            style={[styles.row, styles.lastRow, busy !== '' && styles.rowDisabled]}
            activeOpacity={0.7}
            disabled={busy !== ''}
            onPress={() => {
              if (!dateIso || busy) return;
              skipDay(dateIso);
              buzzEditApplied();
              onClose();
            }}
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
        )}

        {mode === 'move' && skipped && (
          <TouchableOpacity
            style={[styles.row, styles.lastRow, busy !== '' && styles.rowDisabled]}
            activeOpacity={0.7}
            disabled={busy !== ''}
            onPress={() => {
              if (!dateIso || busy) return;
              unskipDay(dateIso);
              buzzEditApplied();
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel="Undo skip"
          >
            <View style={styles.iconTile}>
              <Ionicons name="arrow-undo-outline" size={19} color={colors.primary} />
            </View>
            <View style={styles.rowMain}>
              <Text style={styles.rowLabel}>Undo skip</Text>
              <Text style={styles.rowSub}>It counts as planned again</Text>
            </View>
          </TouchableOpacity>
        )}

        {mode === 'move' && !skipped && !isPast && (
          <TouchableOpacity
            style={[styles.row, styles.lastRow, (started || busy !== '') && styles.rowDisabled]}
            activeOpacity={0.7}
            disabled={started || busy !== ''}
            onPress={() => {
              if (!dateIso || busy) return;
              skipDay(dateIso);
              buzzEditApplied();
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel="Skip this workout"
            accessibilityState={{ disabled: started }}
          >
            <View style={[styles.iconTile, styles.iconTileGrey]}>
              <Ionicons name="close-circle-outline" size={19} color={colors.textTertiary} />
            </View>
            <View style={styles.rowMain}>
              <Text style={[styles.rowLabel, styles.rowLabelMuted]}>Skip this workout</Text>
              <Text style={styles.rowSub}>
                {started
                  ? 'You’ve already logged sets on this day'
                  : 'Marks it skipped — the plan stays unchanged'}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </>
    );
  };

  const renderSessions = (f: Frame) => {
    const sessions = stagedSessionsForDate(f.fromIso, f.pendingBefore);
    return (
      <>
        <View style={styles.stageHeader}>
          <TouchableOpacity
            onPress={popFrame}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.stageBack}
          >
            <Ionicons name="chevron-back" size={20} color={colors.primary} />
          </TouchableOpacity>
          <Text style={styles.title}>
            {shortWeekday(f.fromIso)} has {sessions.length} sessions
          </Text>
        </View>
        <Text style={styles.subtitle}>Which one is moving?</Text>
        {sessions.map((session) => (
          <TouchableOpacity
            key={session.slotId}
            style={styles.row}
            activeOpacity={0.7}
            onPress={() => {
              buzzTap();
              setFrames((prev) => [
                ...prev.slice(0, -1),
                {
                  ...f,
                  slotIds: [session.slotId],
                  title: session.title,
                  stage: 'picker',
                },
              ]);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Move ${session.title}`}
          >
            <View style={styles.iconTile}>
              <Ionicons name="barbell-outline" size={19} color={colors.primary} />
            </View>
            <View style={styles.rowMain}>
              <Text style={styles.rowLabel}>{session.title}</Text>
              <Text style={styles.rowSub}>{session.muscles.join(', ')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        ))}
      </>
    );
  };

  const renderTargetRow = (f: Frame, target: MoveTarget) => {
    const isSelf = target.dateIso === f.fromIso;
    const blocked = target.state === 'logged' || target.state === 'beyond' || isSelf;
    const isToday = target.dateIso === today;
    const d = fromIso(target.dateIso);
    const onPick = () => {
      if (target.state === 'open') {
        void commit(
          target.dateIso,
          [
            ...f.pendingBefore,
            ...f.slotIds.map((slotId) => ({
              slotId,
              fromIso: f.fromIso,
              targetIso: target.dateIso,
              title: f.title,
            })),
          ],
        );
      } else if (target.state === 'occupied') {
        buzzTap();
        setFrames((prev) => [
          ...prev.slice(0, -1),
          { ...f, stage: 'room', roomTargetIso: target.dateIso },
        ]);
      }
    };
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
        onPress={onPick}
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
            {isSelf ? f.title : target.title}
          </Text>
          {(isToday || isSelf || target.state === 'open') && (
            <Text style={styles.targetNote}>
              {isSelf ? 'Where it is now' : isToday ? 'Today' : 'Nothing scheduled'}
            </Text>
          )}
        </View>
        {busy === target.dateIso ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : target.state === 'open' ? (
          <View style={styles.badgeOpen}>
            <Text style={styles.badgeOpenText}>Open</Text>
          </View>
        ) : target.state === 'occupied' && !isSelf ? (
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        ) : target.state === 'logged' ? (
          <View style={styles.badgeGrey}>
            <Text style={styles.badgeGreyText}>Already logged</Text>
          </View>
        ) : target.state === 'beyond' ? (
          <View style={styles.badgeGrey}>
            <Text style={styles.badgeGreyText}>After plan ends</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderPicker = (f: Frame) => (
    <>
      <View style={styles.stageHeader}>
        <TouchableOpacity
          onPress={popFrame}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.stageBack}
        >
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>Move {f.title} to…</Text>
      </View>
      <Text style={styles.subtitle}>
        Open days land instantly. Pick a busy day and you’ll choose where its workout goes.
      </Text>
      {moveTargetsForDay(f.pendingBefore, f.slotIds).map((t) => renderTargetRow(f, t))}
    </>
  );

  const renderRoom = (f: Frame) => {
    const targetIso = f.roomTargetIso!;
    const incoming: PendingMove[] = f.slotIds.map((slotId) => ({
      slotId,
      fromIso: f.fromIso,
      targetIso,
      title: f.title,
    }));
    const pendingWithIncoming = [...f.pendingBefore, ...incoming];
    const displaced = stagedSessionsForDate(targetIso, f.pendingBefore, f.slotIds);
    const targetLabel = targetIso === today ? 'Today' : shortWeekday(targetIso);

    // A previously doubled target: no single workout to relocate — offer only
    // the deliberate stack (rare²) or back out.
    if (displaced.length > 1) {
      return (
        <>
          <View style={styles.stageHeader}>
            <TouchableOpacity onPress={popFrame} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={styles.stageBack}>
              <Ionicons name="chevron-back" size={20} color={colors.primary} />
            </TouchableOpacity>
            <Text style={styles.title}>
              {targetLabel} already has {displaced.length} sessions
            </Text>
          </View>
          <Text style={styles.subtitle}>{displaced.map((s) => s.title).join(' + ')}</Text>
          <TouchableOpacity
            style={[styles.row, styles.lastRow, busy !== '' && styles.rowDisabled]}
            activeOpacity={0.7}
            disabled={busy !== ''}
            onPress={() => void commit('stack', pendingWithIncoming)}
            accessibilityRole="button"
            accessibilityLabel="Add it anyway"
          >
            <View style={[styles.iconTile, styles.iconTileGrey]}>
              <Ionicons name="add-circle-outline" size={19} color={colors.textTertiary} />
            </View>
            <View style={styles.rowMain}>
              <Text style={[styles.rowLabel, styles.rowLabelMuted]}>Add it anyway</Text>
              <Text style={styles.rowSub}>
                {displaced.length + 1} sessions in one day — you can move them out later
              </Text>
            </View>
            {busy === 'stack' && <ActivityIndicator size="small" color={colors.primary} />}
          </TouchableOpacity>
        </>
      );
    }

    const other = displaced[0];
    const swapOk = other != null && canReceiveSwap(f.fromIso, pendingWithIncoming);
    const openDays = moveTargetsForDay(pendingWithIncoming, other ? [other.slotId] : [])
      .map((t) => ({ dateIso: t.dateIso, open: t.state === 'open' }));
    const nearestOpen = other ? nearestOpenIso(openDays, targetIso) : null;

    return (
      <>
        <View style={styles.stageHeader}>
          <TouchableOpacity onPress={popFrame} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={styles.stageBack}>
            <Ionicons name="chevron-back" size={20} color={colors.primary} />
          </TouchableOpacity>
          <Text style={styles.title}>
            {targetLabel} has {other?.title ?? 'a session'}
          </Text>
        </View>
        <Text style={styles.subtitle}>
          {f.title} is taking its place — where should {other?.title ?? 'it'} go?
        </Text>

        {swapOk && other && (
          <TouchableOpacity
            style={[styles.row, busy !== '' && styles.rowDisabled]}
            activeOpacity={0.7}
            disabled={busy !== ''}
            onPress={() =>
              void commit('swap', [
                ...pendingWithIncoming,
                { slotId: other.slotId, fromIso: targetIso, targetIso: f.fromIso, title: other.title },
              ])
            }
            accessibilityRole="button"
            accessibilityLabel="Swap days"
          >
            <View style={styles.iconTile}>
              <Ionicons name="swap-horizontal" size={19} color={colors.primary} />
            </View>
            <View style={styles.rowMain}>
              <Text style={styles.rowLabel}>Swap days</Text>
              <Text style={styles.rowSub}>
                {other.title} takes {WEEKDAYS[weekdayIndex(fromIso(f.fromIso))]}, {shortDate(fromIso(f.fromIso))}
              </Text>
            </View>
            {busy === 'swap' ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            )}
          </TouchableOpacity>
        )}

        {nearestOpen != null && other && (
          <TouchableOpacity
            style={[styles.row, busy !== '' && styles.rowDisabled]}
            activeOpacity={0.7}
            disabled={busy !== ''}
            onPress={() =>
              void commit('nearest', [
                ...pendingWithIncoming,
                { slotId: other.slotId, fromIso: targetIso, targetIso: nearestOpen, title: other.title },
              ])
            }
            accessibilityRole="button"
            accessibilityLabel={`Send it to ${WEEKDAYS[weekdayIndex(fromIso(nearestOpen))]}`}
          >
            <View style={[styles.iconTile, styles.iconTileGreen]}>
              <Ionicons name="arrow-forward" size={19} color={colors.success} />
            </View>
            <View style={styles.rowMain}>
              <Text style={styles.rowLabel}>
                Send it to {WEEKDAYS[weekdayIndex(fromIso(nearestOpen))]}
              </Text>
              <Text style={styles.rowSub}>
                The nearest open day · {shortDate(fromIso(nearestOpen))}
              </Text>
            </View>
            {busy === 'nearest' ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            )}
          </TouchableOpacity>
        )}

        {other && (
          <TouchableOpacity
            style={[styles.row, busy !== '' && styles.rowDisabled]}
            activeOpacity={0.7}
            disabled={busy !== ''}
            onPress={() => {
              buzzTap();
              setFrames((prev) => [
                ...prev,
                {
                  fromIso: targetIso,
                  slotIds: [other.slotId],
                  title: other.title,
                  stage: 'picker',
                  pendingBefore: pendingWithIncoming,
                },
              ]);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Pick a day for ${other.title}`}
          >
            <View style={styles.iconTile}>
              <Ionicons name="calendar-outline" size={19} color={colors.primary} />
            </View>
            <View style={styles.rowMain}>
              <Text style={styles.rowLabel}>Pick a day for {other.title}…</Text>
              <Text style={styles.rowSub}>Choose any day — same picker</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.row, styles.lastRow, busy !== '' && styles.rowDisabled]}
          activeOpacity={0.7}
          disabled={busy !== ''}
          onPress={() => void commit('keep', pendingWithIncoming)}
          accessibilityRole="button"
          accessibilityLabel={`Keep both on ${targetLabel}`}
        >
          <View style={[styles.iconTile, styles.iconTileGrey]}>
            <Ionicons name="add-circle-outline" size={19} color={colors.textTertiary} />
          </View>
          <View style={styles.rowMain}>
            <Text style={[styles.rowLabel, styles.rowLabelMuted]}>
              Keep both on {targetLabel}
            </Text>
            <Text style={styles.rowSub}>
              Two sessions in one day — you can move one out later
            </Text>
          </View>
          {busy === 'keep' && <ActivityIndicator size="small" color={colors.primary} />}
        </TouchableOpacity>
      </>
    );
  };

  return (
    <SheetModal visible={dateIso != null} onClose={onClose} scrimColor={colors.scrim}>
      {/* The card guards its own taps; see SheetModal. */}
      <Pressable
        style={[styles.card, { paddingBottom: insets.bottom + spacing.xl }]}
        accessible={false}
        onPress={(e) => e.stopPropagation()}
      >
        <View style={styles.grabber} />
        {frame == null && renderRootActions()}
        {frame?.stage === 'sessions' && renderSessions(frame)}
        {frame?.stage === 'picker' && renderPicker(frame)}
        {frame?.stage === 'room' && renderRoom(frame)}
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
      flexShrink: 1,
    },
    subtitle: {
      ...sfPro,
      fontSize: text.footnote,
      color: c.textMuted,
      marginTop: spacing.xxs,
      marginBottom: spacing.sm,
    },
    stageHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    stageBack: {
      marginRight: spacing.xs,
      marginLeft: -spacing.xs,
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
    iconTileGreen: {
      backgroundColor: c.successSoft,
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
