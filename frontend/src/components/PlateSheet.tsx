import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SheetModal from './SheetModal';
import type { ColorPalette } from '../theme';
import { radius, spacing, text } from '../theme';
import { sfPro } from '../lib/planCalendarPrototype';
import type { WeightUnit } from '../lib/weightDisplay';
import {
  BARS,
  formatEachSide,
  MAX_PLATES_PER_SIDE,
  PLATES,
  plateColor,
  plateGeometry,
  platesFor,
  totalFor,
} from '../lib/plateMath';

const GOLD = '#F5A623';
const SLEEVE = 110;

/**
 * The plates sheet (GitHub #52): a bar you build. Opened from a known weight
 * it arrives loaded with the fewest plates; opened from an empty box it
 * arrives bare. One tap on a plate puts it on EACH side; a tap on a plate
 * on the drawing takes that pair off. Use sends the total back to the card.
 */
export default function PlateSheet({
  visible,
  onClose,
  unit,
  initialTotal,
  initialBar,
  colors,
  onUse,
}: {
  visible: boolean;
  onClose: () => void;
  unit: WeightUnit;
  /** The weight the card will log, in the user's unit; null = nothing known yet. */
  initialTotal: number | null;
  /** The bar the card last used for this exercise (BARS[unit][0] by default). */
  initialBar?: number;
  colors: ColorPalette;
  onUse: (total: number, bar: number) => void;
}) {
  const [bar, setBar] = useState<number>(initialBar ?? BARS[unit][0]!);
  const [perSide, setPerSide] = useState<number[]>([]);
  const [barPicker, setBarPicker] = useState(false);

  // Every open starts from what the card holds now.
  useEffect(() => {
    if (!visible) return;
    const b = initialBar ?? BARS[unit][0]!;
    setBar(b);
    setBarPicker(false);
    setPerSide(
      initialTotal != null && initialTotal > b ? platesFor(initialTotal, b, unit).perSide : [],
    );
  }, [visible, initialTotal, initialBar, unit]);

  const total = totalFor(bar, perSide);
  const full = perSide.length >= MAX_PLATES_PER_SIDE;
  const geometry = useMemo(() => plateGeometry(perSide, unit, SLEEVE), [perSide, unit]);
  const plateSum = Math.round((total - bar) * 100) / 100;

  const addPlate = (plate: number) => {
    if (full) return;
    setPerSide((p) => [...p, plate]);
  };
  const removePlate = (index: number) => {
    setPerSide((p) => p.filter((_, i) => i !== index));
  };

  const styles = useMemo(() => createStyles(colors), [colors]);
  const sleeve = (mirror: boolean) => {
    const items = mirror ? geometry : [...geometry].reverse();
    return items.map((g, i) => {
      const index = mirror ? i : geometry.length - 1 - i;
      const c = plateColor(g.plate, unit);
      return (
        <TouchableOpacity
          key={`${mirror ? 'r' : 'l'}-${index}`}
          onPress={() => removePlate(index)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Take the ${g.plate} plate off each side`}
          style={[
            styles.plate,
            {
              width: g.width,
              height: g.height,
              backgroundColor: c.fill,
              borderWidth: c.outlined ? 1 : 0,
              borderColor: colors.textMuted,
            },
          ]}
        >
          {g.label && <Text style={[styles.plateLabel, { color: c.ink }]}>{g.plate}</Text>}
        </TouchableOpacity>
      );
    });
  };

  return (
    <SheetModal visible={visible} onClose={onClose} scrimColor={colors.scrim}>
      <Pressable style={styles.sheet} accessible={false} onPress={(e) => e.stopPropagation()}>
        <View style={styles.grabber} />

        <Text style={styles.title}>
          Plates for <Text style={styles.titleTotal}>{`${total} ${unit}`}</Text>
        </Text>
        <TouchableOpacity
          style={styles.barLine}
          onPress={() => setBarPicker((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={`Bar weight ${bar} ${unit}, tap to change`}
        >
          <Text style={styles.barLineText}>{`On a ${bar} ${unit} bar`}</Text>
          <Ionicons
            name={barPicker ? 'chevron-up' : 'chevron-down'}
            size={12}
            color={colors.textMuted}
          />
        </TouchableOpacity>
        {barPicker && (
          <View style={styles.barChips}>
            {BARS[unit].map((b) => (
              <TouchableOpacity
                key={b}
                style={[styles.barChip, b === bar && styles.barChipOn]}
                onPress={() => {
                  setBar(b);
                  setBarPicker(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: b === bar }}
                accessibilityLabel={`${b} ${unit} bar`}
              >
                <Text style={[styles.barChipText, b === bar && styles.barChipTextOn]}>{b}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.drawing} accessibilityLabel={`Each side: ${formatEachSide(perSide)}`}>
          <View style={styles.barRow}>
            {/* The sleeve is drawn as a bar of its own, under the plates. Build
                37 left it transparent, so an empty or lightly loaded bar was
                two tips floating either side of a short shaft, and in dark
                mode there was no bar to see at all. */}
            <View style={styles.sleeveTip} />
            <View style={styles.sleeve}>
              <View pointerEvents="none" style={styles.sleeveBar} />
              {sleeve(false)}
            </View>
            <View style={styles.collar} />
            <View style={styles.shaft} />
            <View style={styles.collar} />
            <View style={styles.sleeve}>
              <View pointerEvents="none" style={styles.sleeveBar} />
              {sleeve(true)}
            </View>
            <View style={styles.sleeveTip} />
          </View>
          <Text style={styles.eachSide}>
            Each side: <Text style={styles.eachSideValue}>{formatEachSide(perSide)}</Text>
          </Text>
          {perSide.length > 0 && (
            <Text style={styles.hint}>Tap a plate on the bar to take it off</Text>
          )}
        </View>

        <Text style={styles.chipsLabel}>TAP A PLATE TO ADD IT TO EACH SIDE</Text>
        <View style={styles.chips}>
          {PLATES[unit].map((plate) => {
            const c = plateColor(plate, unit);
            return (
              <TouchableOpacity
                key={plate}
                onPress={() => addPlate(plate)}
                disabled={full}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Add a ${plate} plate to each side`}
                accessibilityState={{ disabled: full }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: c.fill,
                    borderWidth: c.outlined ? 1 : 0,
                    borderColor: colors.textMuted,
                  },
                  full && styles.chipOff,
                ]}
              >
                <Text style={[styles.chipText, { color: c.ink }]}>{plate}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.sumRow}>
          <TouchableOpacity
            style={styles.clear}
            onPress={() => setPerSide([])}
            disabled={perSide.length === 0}
            accessibilityRole="button"
            accessibilityLabel="Take every plate off"
          >
            <Text style={[styles.clearText, perSide.length === 0 && styles.clearTextOff]}>
              Clear
            </Text>
          </TouchableOpacity>
          <Text style={styles.sum}>
            {full ? 'The sleeve is full' : `Bar ${bar} + plates ${plateSum} = ${total}`}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.use}
          onPress={() => onUse(total, bar)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Use ${total} ${unit}`}
        >
          <Text style={styles.useText}>{`Use ${total} ${unit}`}</Text>
        </TouchableOpacity>
      </Pressable>
    </SheetModal>
  );
}

function createStyles(c: ColorPalette) {
  return StyleSheet.create({
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xxl,
      gap: spacing.sm,
    },
    grabber: {
      width: 36,
      height: 5,
      borderRadius: 3,
      backgroundColor: c.border,
      alignSelf: 'center',
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
    },
    title: {
      ...sfPro,
      fontSize: text.title,
      fontWeight: '700',
      color: c.text,
    },
    titleTotal: {
      color: GOLD,
    },
    barLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-start',
      minHeight: 28,
    },
    barLineText: {
      ...sfPro,
      fontSize: text.footnote,
      color: c.textMuted,
    },
    barChips: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    barChip: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.border,
    },
    barChipOn: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    barChipText: {
      ...sfPro,
      fontSize: text.footnote,
      fontWeight: '600',
      color: c.textSecondary,
    },
    barChipTextOn: {
      color: c.onPrimary,
    },
    drawing: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingTop: spacing.md,
      paddingBottom: spacing.xs,
    },
    barRow: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 120,
    },
    sleeveTip: {
      width: 14,
      height: 14,
      backgroundColor: c.textTertiary,
      borderRadius: 3,
    },
    sleeve: {
      width: SLEEVE,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    sleeveBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 12,
      backgroundColor: c.textTertiary,
    },
    collar: {
      width: 8,
      height: 30,
      backgroundColor: c.textSecondary,
      borderRadius: 2,
    },
    shaft: {
      width: 40,
      height: 12,
      backgroundColor: c.textTertiary,
    },
    plate: {
      borderRadius: 3,
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingBottom: 4,
    },
    plateLabel: {
      ...sfPro,
      fontSize: 9,
      fontWeight: '700',
    },
    eachSide: {
      ...sfPro,
      fontSize: text.callout,
      color: c.textSecondary,
    },
    eachSideValue: {
      color: c.text,
      fontWeight: '700',
    },
    hint: {
      ...sfPro,
      fontSize: text.caption,
      color: c.textMuted,
    },
    chipsLabel: {
      ...sfPro,
      fontSize: text.caption,
      fontWeight: '700',
      letterSpacing: 0.6,
      color: c.textMuted,
      textAlign: 'center',
      marginTop: spacing.xs,
    },
    chips: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 2,
    },
    chip: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipOff: {
      opacity: 0.35,
    },
    chipText: {
      ...sfPro,
      fontSize: text.footnote,
      fontWeight: '700',
    },
    sumRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.xs,
    },
    clear: {
      height: 40,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.border,
      justifyContent: 'center',
    },
    clearText: {
      ...sfPro,
      fontSize: text.body,
      fontWeight: '600',
      color: c.textSecondary,
    },
    clearTextOff: {
      opacity: 0.4,
    },
    sum: {
      ...sfPro,
      fontSize: text.caption,
      color: c.textMuted,
    },
    use: {
      height: 50,
      borderRadius: radius.pill,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.xs,
    },
    useText: {
      ...sfPro,
      fontSize: text.callout,
      fontWeight: '700',
      color: c.onPrimary,
    },
  });
}
