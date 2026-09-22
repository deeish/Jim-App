import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import type { ColorPalette } from '../theme';
import { radius, spacing, text } from '../theme';
import { sfPro } from '../lib/planCalendarPrototype';
import {
  elapsedSeconds,
  formatClock,
  leadInRemaining,
  overTarget,
  ringProgress,
  type Hold,
} from '../lib/holdTimer';

/** The set-card gold, the same fill the check and the rest tile use. */
const GOLD = '#F5A623';
const RING = 168;
const STROKE = 8;
const R = (RING - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

/**
 * The stopwatch on a timed set (GitHub #58): ring, number, one label, and
 * the buttons for the phase. Pure presentation; `hold` and `nowMs` come from
 * the deck, which owns the clock and the buzzes (lib/holdTimer.ts).
 *
 * Every label inside the ring is short on purpose and shrinks to fit: the
 * inner circle is about 150 pt across, and "GET READY" must never spill.
 */
export default function HoldStopwatch({
  hold,
  nowMs,
  targetSec,
  colors,
  onStart,
  onGoNow,
  onPause,
  onResume,
  onStop,
  onRestart,
}: {
  hold: Hold | null;
  nowMs: number;
  targetSec: number;
  colors: ColorPalette;
  onStart: () => void;
  onGoNow: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onRestart: () => void;
}) {
  const phase = hold?.phase ?? 'idle';
  const elapsed = hold ? elapsedSeconds(hold, nowMs) : 0;
  const over = hold ? overTarget(hold, nowMs) : 0;
  const progress = hold ? ringProgress(hold, nowMs) : 0;
  const reached = hold != null && hold.phase !== 'leadIn' && targetSec > 0 && elapsed >= targetSec;

  const ringColor =
    phase === 'leadIn'
      ? colors.textTertiary
      : reached || phase === 'stopped'
        ? GOLD
        : colors.primary;
  const big =
    phase === 'leadIn'
      ? String(leadInRemaining(hold!, nowMs))
      : phase === 'stopped'
        ? `${elapsed} sec`
        : formatClock(elapsed);
  const label =
    phase === 'idle'
      ? `TARGET ${formatClock(targetSec)}`
      : phase === 'leadIn'
        ? 'GET READY'
        : phase === 'stopped'
          ? over > 0
            ? `${over} OVER`
            : elapsed < targetSec
              ? `${targetSec - elapsed} UNDER`
              : 'ON TARGET'
          : over > 0
            ? `+${over} OVER`
            : phase === 'paused'
              ? 'PAUSED'
              : `TARGET ${formatClock(targetSec)}`;
  const bigColor =
    reached || phase === 'stopped' ? GOLD : phase === 'leadIn' ? colors.textSecondary : colors.text;
  const labelColor = over > 0 && phase !== 'stopped' ? GOLD : colors.textMuted;

  return (
    <View style={styles.wrap}>
      <View
        style={styles.ringBox}
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${big} ${label}`}
      >
        <Svg width={RING} height={RING}>
          <Circle
            cx={RING / 2}
            cy={RING / 2}
            r={R}
            stroke={colors.border}
            strokeWidth={STROKE}
            fill="none"
          />
          {progress > 0 && (
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={R}
              stroke={ringColor}
              strokeWidth={STROKE}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${CIRC} ${CIRC}`}
              strokeDashoffset={CIRC * (1 - progress)}
              rotation={-90}
              origin={`${RING / 2}, ${RING / 2}`}
            />
          )}
        </Svg>
        <View style={styles.ringInner} pointerEvents="none">
          {phase === 'stopped' && <Ionicons name="checkmark" size={30} color={GOLD} />}
          <Text
            style={[styles.big, phase === 'stopped' && styles.bigStopped, { color: bigColor }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {big}
          </Text>
          <Text
            style={[styles.label, { color: labelColor }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {label}
          </Text>
        </View>
      </View>

      <View style={styles.buttons}>
        {phase === 'idle' && (
          <TouchableOpacity
            style={[styles.primary, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
            onPress={onStart}
            accessibilityRole="button"
            accessibilityLabel={`Start the timer, target ${formatClock(targetSec)}`}
          >
            <Ionicons name="play" size={14} color={colors.onPrimary} />
            <Text style={[styles.primaryLabel, { color: colors.onPrimary }]}>Start</Text>
          </TouchableOpacity>
        )}
        {phase === 'leadIn' && (
          <TouchableOpacity
            style={[styles.secondary, { borderColor: colors.border }]}
            activeOpacity={0.85}
            onPress={onGoNow}
            accessibilityRole="button"
            accessibilityLabel="Skip the lead-in and start now"
          >
            <Text style={[styles.secondaryLabel, { color: colors.text }]}>Go now</Text>
          </TouchableOpacity>
        )}
        {(phase === 'running' || phase === 'paused') && (
          <>
            <TouchableOpacity
              style={[styles.secondary, { borderColor: colors.border }]}
              activeOpacity={0.85}
              onPress={phase === 'running' ? onPause : onResume}
              accessibilityRole="button"
              accessibilityLabel={phase === 'running' ? 'Pause the timer' : 'Resume the timer'}
            >
              <Ionicons
                name={phase === 'running' ? 'pause' : 'play'}
                size={14}
                color={colors.text}
              />
              <Text style={[styles.secondaryLabel, { color: colors.text }]}>
                {phase === 'running' ? 'Pause' : 'Resume'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primary, { backgroundColor: colors.primary }]}
              activeOpacity={0.85}
              onPress={onStop}
              accessibilityRole="button"
              accessibilityLabel="Stop the timer and keep the time"
            >
              <Ionicons name="stop" size={14} color={colors.onPrimary} />
              <Text style={[styles.primaryLabel, { color: colors.onPrimary }]}>Stop</Text>
            </TouchableOpacity>
          </>
        )}
        {phase === 'stopped' && (
          <TouchableOpacity
            style={[styles.secondary, styles.secondarySmall, { borderColor: colors.border }]}
            activeOpacity={0.85}
            onPress={onRestart}
            accessibilityRole="button"
            accessibilityLabel="Restart the timer"
          >
            <Text style={[styles.secondaryLabel, { color: colors.textSecondary }]}>Restart</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingTop: spacing.xs,
    paddingBottom: 2,
  },
  ringBox: {
    width: RING,
    height: RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    // Keep the text well inside the ring: the stroke plus a margin each side.
    paddingHorizontal: STROKE + 14,
    gap: 2,
  },
  big: {
    ...sfPro,
    fontSize: 44,
    fontWeight: '700',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  bigStopped: {
    fontSize: 22,
    letterSpacing: 0,
  },
  label: {
    ...sfPro,
    fontSize: text.caption,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
  },
  primary: {
    height: 48,
    paddingHorizontal: spacing.lg + 8,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
  },
  primaryLabel: {
    ...sfPro,
    fontSize: text.callout,
    fontWeight: '700',
  },
  secondary: {
    height: 48,
    paddingHorizontal: spacing.lg + 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
  },
  secondarySmall: {
    height: 40,
    paddingHorizontal: spacing.lg,
  },
  secondaryLabel: {
    ...sfPro,
    fontSize: text.callout,
    fontWeight: '600',
  },
});
