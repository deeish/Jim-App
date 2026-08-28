import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { ColorPalette } from '../theme/colors';

import { radius, spacing, text, tracking, weight } from '../theme';
const WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function parseIsoLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map((x) => parseInt(x, 10));
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

function toIsoLocal(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const da = String(date.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/** Calendar day from local Y/M/D — avoids any shared Date / closure mix-ups on press. */
function toIsoFromYmd(y: number, m0: number, d: number): string {
  const mo = String(m0 + 1).padStart(2, '0');
  const da = String(d).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Monday = 0 … Sunday = 6 */
function mondayIndexFromSundayBasedJsDay(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

function buildWeekGrid(visibleMonth: Date): Date[][] {
  const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const lead = mondayIndexFromSundayBasedJsDay(first.getDay());
  const start = new Date(first);
  start.setDate(first.getDate() - lead);
  const weeks: Date[][] = [];
  let cursor = new Date(start);
  for (let w = 0; w < 6; w++) {
    const row: Date[] = [];
    for (let d = 0; d < 7; d++) {
      row.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(row);
  }
  return weeks;
}

type Props = {
  selectedIso: string;
  minIso: string;
  colors: ColorPalette;
  onSelectDay: (iso: string) => void;
};

export function MonthCalendarPicker({ selectedIso, minIso, colors, onSelectDay }: Props) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const minDate = useMemo(() => startOfDay(parseIsoLocal(minIso)), [minIso]);

  const [viewMonth, setViewMonth] = useState(() => {
    const s = startOfDay(parseIsoLocal(selectedIso));
    return new Date(s.getFullYear(), s.getMonth(), 1);
  });

  useEffect(() => {
    const s = startOfDay(parseIsoLocal(selectedIso));
    setViewMonth(new Date(s.getFullYear(), s.getMonth(), 1));
  }, [selectedIso]);

  const weeks = useMemo(() => buildWeekGrid(viewMonth), [viewMonth]);

  const monthTitle = new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(viewMonth);

  const viewMonthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const minMonthStart = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const canGoPrev = viewMonthStart.getTime() > minMonthStart.getTime();

  const goPrev = () => {
    if (!canGoPrev) return;
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  };

  const goNext = () => {
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable
          onPress={goPrev}
          disabled={!canGoPrev}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          accessibilityState={{ disabled: !canGoPrev }}
          style={({ pressed }) => [
            styles.navBtn,
            !canGoPrev && styles.navBtnDisabled,
            pressed && canGoPrev && styles.navBtnPressed,
          ]}
        >
          <Text style={[styles.navBtnText, !canGoPrev && styles.navBtnTextDisabled]}>‹</Text>
        </Pressable>
        <Text style={styles.monthTitle}>{monthTitle}</Text>
        <Pressable
          onPress={goNext}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          style={({ pressed }) => [styles.navBtn, pressed && styles.navBtnPressed]}
        >
          <Text style={styles.navBtnText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEK_LABELS.map((label, i) => (
          <Text key={`${label}-${i}`} style={styles.weekLabel}>
            {label}
          </Text>
        ))}
      </View>

      {weeks.map((row, wi) => (
        <View key={wi} style={styles.dayRow}>
          {row.map((cell, di) => {
            const y = cell.getFullYear();
            const m0 = cell.getMonth();
            const dom = cell.getDate();
            const dayIso = toIsoFromYmd(y, m0, dom);
            const inMonth = m0 === viewMonth.getMonth();
            const cellDay = startOfDay(new Date(y, m0, dom));
            const disabled = cellDay < minDate;
            const isSelected = dayIso === selectedIso;
            return (
              <Pressable
                key={dayIso}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={cell.toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
                accessibilityState={{ selected: isSelected, disabled }}
                onPress={() => onSelectDay(dayIso)}
                style={({ pressed }) => [
                  styles.dayCell,
                  !inMonth && styles.dayCellMuted,
                  disabled && styles.dayCellDisabled,
                  isSelected && styles.dayCellSelected,
                  pressed && !disabled && styles.dayCellPressed,
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    !inMonth && styles.dayTextMuted,
                    disabled && styles.dayTextDisabled,
                    isSelected && styles.dayTextSelected,
                  ]}
                  pointerEvents="none"
                >
                  {dom}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function createStyles(c: ColorPalette) {
  return StyleSheet.create({
    wrap: {
      marginTop: spacing.sm,
      width: '100%',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    monthTitle: {
      fontSize: text.callout,
      fontWeight: weight.bold,
      color: c.text,
    },
    navBtn: {
      width: 40,
      // Holds a 22pt glyph, so the box has to be able to grow with Dynamic
      // Type. borderRadius is a fixed token here, not half the size, so this
      // is a rounded square and letting it grow cannot distort a circle.
      minHeight: 40,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navBtnDisabled: {
      opacity: 0.35,
    },
    navBtnPressed: {
      opacity: 0.85,
    },
    navBtnText: {
      fontSize: text.title,
      color: c.text,
      fontWeight: weight.semibold,
      marginTop: -2,
    },
    navBtnTextDisabled: {
      color: c.textMuted,
    },
    weekRow: {
      flexDirection: 'row',
      marginBottom: spacing.xs,
    },
    weekLabel: {
      flex: 1,
      minWidth: 0,
      textAlign: 'center',
      fontSize: text.caption,
      fontWeight: weight.bold,
      color: c.textMuted,
      letterSpacing: tracking.wide,
    },
    dayRow: {
      flexDirection: 'row',
      gap: spacing.xs,
      marginBottom: spacing.xs,
    },
    dayCell: {
      flex: 1,
      minWidth: 0,
      minHeight: 44,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayCellPressed: {
      opacity: 0.88,
    },
    dayCellMuted: {
      opacity: 0.35,
    },
    dayCellDisabled: {
      opacity: 0.2,
    },
    dayCellSelected: {
      backgroundColor: c.primarySoft,
      borderWidth: 2,
      borderColor: c.primary,
    },
    dayText: {
      fontSize: text.callout,
      fontWeight: weight.semibold,
      color: c.text,
    },
    dayTextMuted: {
      color: c.textSecondary,
    },
    dayTextDisabled: {
      color: c.textMuted,
    },
    dayTextSelected: {
      color: c.primary,
      fontWeight: weight.heavy,
    },
  });
}
