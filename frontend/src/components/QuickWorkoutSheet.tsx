import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SheetModal from './SheetModal';
import { radius, spacing, text, useTheme, weight, type ColorPalette } from '../theme';
import {
  MUSCLE_EDGE,
  MUSCLE_INK,
  buzzEditApplied,
  buzzTap,
  muscleGradient,
  sfPro,
  type PrototypeMuscle,
} from '../lib/planCalendarPrototype';
import {
  addQuickSessionToday,
  dayHasLocalLogs,
  isDayCompleted,
  plannedDayForDate,
  type QuickSessionLanding,
} from '../lib/planCalendarPrototypeStore';
import { showConfirmDialog } from '../lib/confirmAlert';
import { buildQuickSession } from '../services/workoutService';
import { todayIso } from '../lib/planCalendarPrototype';
import { useUserPreferences } from '../contexts/UserPreferencesContext';

const ALL_MUSCLES: PrototypeMuscle[] = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Quads',
  'Hamstrings',
  'Glutes',
  'Calves',
  'Core',
  'Cardio',
  'Forearms',
];

/** One-tap classics — pure chip macros, tweakable after tapping. */
const PRESETS: Array<{ label: string; muscles: PrototypeMuscle[] }> = [
  { label: 'Push', muscles: ['Chest', 'Shoulders', 'Triceps'] },
  { label: 'Pull', muscles: ['Back', 'Biceps'] },
  { label: 'Legs', muscles: ['Quads', 'Hamstrings', 'Glutes', 'Calves'] },
  { label: 'Upper', muscles: ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps'] },
  {
    label: 'Full Body',
    muscles: ['Chest', 'Back', 'Shoulders', 'Quads', 'Hamstrings', 'Core'],
  },
];

/** Mirrors the backend's session budget for the preview line (display only). */
function estimateExercises(strengthCount: number, cardio: boolean): number {
  let base = 0;
  if (strengthCount === 1) base = 4;
  else if (strengthCount === 2) base = 5;
  else if (strengthCount <= 4) base = 6;
  else if (strengthCount <= 6) base = 7;
  else base = Math.min(12, strengthCount);
  return base + (cardio && strengthCount > 0 ? 1 : 0) || (cardio ? 1 : 0);
}

/** Mirrors the backend's title for the preview line. */
function previewTitle(selected: PrototypeMuscle[]): string {
  const strength = selected.filter((m) => m !== 'Cardio');
  const named = strength.length > 0 ? strength : selected;
  if (named.length === 0) return '';
  if (named.length === 1) return `${named[0]} Day`;
  if (named.length === 2) return `${named[0]} & ${named[1]}`;
  if (named.length === 3) return `${named[0]}, ${named[1]} & ${named[2]}`;
  if (named.length >= ALL_MUSCLES.length - 2) return 'Full Body';
  return `${named[0]}, ${named[1]} +${named.length - 2} more`;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  /** The session landed on `dateIso` (always today) — navigate to it. */
  onLanded: (dateIso: string) => void;
};

/**
 * Quick Workout ("I'm at the gym, give me a Back & Bis day now") — Dylan's
 * approved design: presets + the 12 gradient chips as a multi-select, one
 * CTA, and the result lands on TODAY's day view. Selection goes to the
 * deterministic quick-session builder (no LLM, instant, tier-aware).
 */
export default function QuickWorkoutSheet({ visible, onClose, onLanded }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { goal, experience } = useUserPreferences();

  const [selected, setSelected] = useState<Set<PrototypeMuscle>>(new Set());
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState('');
  /** How many exercises today already holds — a second session must be an
   *  explicit choice, never a silent 11-exercise merge on the day view. */
  const [todayCount, setTodayCount] = useState(0);
  /** fresh = planned but untouched (replacing is a benign plan swap);
   *  partial = sets logged but unfinished; logged = completed/synced.
   *  Trained days default to ADD, and replacing one demands a confirm. */
  const [dayState, setDayState] = useState<'fresh' | 'partial' | 'logged'>('fresh');
  const [landing, setLanding] = useState<QuickSessionLanding>('replace');

  useEffect(() => {
    if (visible) {
      setSelected(new Set());
      setBuilding(false);
      setError('');
      const today = todayIso();
      const count = plannedDayForDate(today).exercises.length;
      const done = isDayCompleted(today);
      const partial = !done && dayHasLocalLogs(today);
      setTodayCount(count);
      setDayState(done ? 'logged' : partial ? 'partial' : 'fresh');
      setLanding(done || partial ? 'add' : 'replace');
    }
  }, [visible]);

  const selectedList = ALL_MUSCLES.filter((m) => selected.has(m));
  const strengthCount = selectedList.filter((m) => m !== 'Cardio').length;
  const wantsCardio = selected.has('Cardio');
  const estimate = estimateExercises(strengthCount, wantsCardio);

  const toggle = (muscle: PrototypeMuscle) => {
    buzzTap();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(muscle)) next.delete(muscle);
      else next.add(muscle);
      return next;
    });
  };

  const applyPreset = (muscles: PrototypeMuscle[]) => {
    buzzTap();
    setSelected(new Set(muscles));
  };

  const presetActive = (muscles: PrototypeMuscle[]) =>
    muscles.length === selected.size && muscles.every((m) => selected.has(m));

  const runBuild = async (effectiveLanding: QuickSessionLanding) => {
    setBuilding(true);
    setError('');
    try {
      // Only an ADDED second session must avoid repeating what's already on
      // the day (the same-seed builder would otherwise serve identical
      // picks) — a REPLACED day's exercises are gone, so bench press is
      // allowed to come back.
      const alreadyToday =
        effectiveLanding === 'add'
          ? plannedDayForDate(todayIso())
              .exercises.map((ex) => ex.exerciseId)
              .filter((id): id is string => !!id)
          : [];
      const session = await buildQuickSession({
        muscles: selectedList,
        goal,
        experience,
        ...(alreadyToday.length > 0 ? { excludeIds: alreadyToday } : null),
      });
      const landedOn = await addQuickSessionToday(session, effectiveLanding);
      buzzEditApplied();
      onClose();
      onLanded(landedOn);
    } catch {
      setError('Couldn’t build the session — check your connection and try again.');
      setBuilding(false);
    }
  };

  const build = () => {
    if (building || selectedList.length === 0) return;
    buzzTap();
    // A workout appeared on today AFTER the sheet opened (plan finished
    // loading mid-flow): the user never saw the notice, so never replace it.
    const nowCount = plannedDayForDate(todayIso()).exercises.length;
    const effectiveLanding: QuickSessionLanding =
      todayCount === 0 && nowCount > 0 ? 'add' : landing;
    // Replacing TRAINED work is destructive enough to demand a confirm —
    // swapping an untouched plan day is not.
    if (effectiveLanding === 'replace' && todayCount > 0 && dayState !== 'fresh') {
      showConfirmDialog({
        title: 'Replace today’s workout?',
        message:
          dayState === 'logged'
            ? 'Today’s session is already logged — it stays in your history, but today’s plan becomes this new workout.'
            : 'You’ve logged sets today that aren’t finished. Replacing discards them.',
        confirmText: 'Replace',
        destructive: true,
        onConfirm: () => void runBuild('replace'),
      });
      return;
    }
    void runBuild(effectiveLanding);
  };

  return (
    <SheetModal visible={visible} onClose={onClose} scrimColor={colors.scrim}>
      {/* The card guards its own taps; see SheetModal. */}
      <Pressable
        style={[styles.card, { paddingBottom: insets.bottom + spacing.xl }]}
        accessible={false}
        onPress={(e) => e.stopPropagation()}
      >
        <View style={styles.grabber} />

        {building ? (
          <View style={styles.buildingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.buildingTitle}>
              Building your {previewTitle(selectedList) || 'session'}…
            </Text>
            <Text style={styles.buildingSub}>Tuned to your goal and experience</Text>
          </View>
        ) : (
          <>
            <Text style={styles.title}>Quick Workout</Text>
            <Text style={styles.subtitle}>
              Pick what you want to train — we’ll build today’s session around it.
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.presetRow}
            >
              {PRESETS.map((preset) => {
                const active = presetActive(preset.muscles);
                return (
                  <TouchableOpacity
                    key={preset.label}
                    style={[styles.preset, active && styles.presetActive]}
                    activeOpacity={0.8}
                    onPress={() => applyPreset(preset.muscles)}
                    accessibilityRole="button"
                    accessibilityLabel={`${preset.label} preset`}
                    accessibilityState={{ selected: active }}
                  >
                    <Text
                      style={[styles.presetLabel, active && styles.presetLabelActive]}
                    >
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.chips}>
              {ALL_MUSCLES.map((muscle) => {
                const isSelected = selected.has(muscle);
                return (
                  <TouchableOpacity
                    key={muscle}
                    style={[styles.chipRing, isSelected && styles.chipRingSelected]}
                    activeOpacity={0.8}
                    onPress={() => toggle(muscle)}
                    accessibilityRole="button"
                    accessibilityLabel={muscle}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <LinearGradient
                      colors={muscleGradient(muscle)}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.chip, { borderColor: MUSCLE_EDGE[muscle] }]}
                    >
                      <Text style={[styles.chipLabel, { color: MUSCLE_INK[muscle] }]}>
                        {muscle}
                        {isSelected ? ' ✓' : ''}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.metaLine}>
              {selectedList.length === 0 ? (
                'Pick at least one muscle'
              ) : (
                <>
                  <Text style={styles.metaTitle}>{previewTitle(selectedList)}</Text>
                  {/* Mirrors the backend's sets×(work+rest) model ≈ 9 min/exercise. */}
                  {` · ~${estimate} exercises · ~${Math.max(20, Math.round((estimate * 9) / 5) * 5)} min`}
                </>
              )}
            </Text>

            {todayCount > 0 && (
              <View style={styles.landingWrap}>
                <Text style={styles.landingLabel}>
                  {dayState === 'logged'
                    ? 'Today’s workout is already logged'
                    : dayState === 'partial'
                      ? 'Today’s workout is in progress'
                      : 'Today already has a workout'}{' '}
                  ({todayCount} {todayCount === 1 ? 'exercise' : 'exercises'})
                </Text>
                <View style={styles.landingSeg}>
                  {(
                    [
                      { key: 'replace', label: 'Replace it' },
                      { key: 'add', label: 'Add to it' },
                    ] as const
                  ).map((opt) => {
                    const active = landing === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[styles.landingOption, active && styles.landingOptionActive]}
                        activeOpacity={0.8}
                        onPress={() => {
                          buzzTap();
                          setLanding(opt.key);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={opt.label}
                        accessibilityState={{ selected: active }}
                      >
                        <Text
                          style={[
                            styles.landingOptionLabel,
                            active && styles.landingOptionLabelActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[styles.cta, selectedList.length === 0 && styles.ctaDisabled]}
              activeOpacity={0.85}
              disabled={selectedList.length === 0}
              onPress={build}
              accessibilityRole="button"
              accessibilityLabel="Build my workout"
              accessibilityState={{ disabled: selectedList.length === 0 }}
            >
              <Text
                style={[
                  styles.ctaLabel,
                  selectedList.length === 0 && styles.ctaLabelDisabled,
                ]}
              >
                Build my workout
              </Text>
            </TouchableOpacity>
            {error !== '' && <Text style={styles.errorText}>{error}</Text>}
          </>
        )}
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
      marginBottom: spacing.md,
    },
    presetRow: {
      gap: spacing.sm,
      paddingBottom: spacing.md,
    },
    preset: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: c.background,
    },
    presetActive: {
      backgroundColor: c.primary,
    },
    presetLabel: {
      ...sfPro,
      fontSize: text.body,
      fontWeight: weight.semibold,
      color: c.textSecondary,
    },
    presetLabelActive: {
      color: c.onPrimary,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    // Selection ring: a bordered wrapper so the chip itself stays untouched.
    chipRing: {
      borderWidth: 2,
      borderColor: 'transparent',
      borderRadius: radius.pill,
      padding: 2,
    },
    chipRingSelected: {
      borderColor: c.primary,
    },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      borderWidth: 1,
      overflow: 'hidden',
    },
    chipLabel: {
      ...sfPro,
      fontSize: text.footnote,
      fontWeight: weight.semibold,
    },
    metaLine: {
      ...sfPro,
      fontSize: text.footnote,
      color: c.textMuted,
      textAlign: 'center',
      marginTop: spacing.lg,
      marginBottom: spacing.md,
    },
    metaTitle: {
      ...sfPro,
      fontWeight: weight.bold,
      color: c.text,
    },
    landingWrap: {
      marginBottom: spacing.md,
      gap: spacing.xs,
    },
    landingLabel: {
      ...sfPro,
      fontSize: text.footnote,
      color: c.textMuted,
      textAlign: 'center',
    },
    landingSeg: {
      flexDirection: 'row',
      backgroundColor: c.segmentTrack,
      borderRadius: radius.pill,
      padding: 2,
    },
    landingOption: {
      flex: 1,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      alignItems: 'center',
    },
    landingOptionActive: {
      backgroundColor: c.surface,
    },
    landingOptionLabel: {
      ...sfPro,
      fontSize: text.footnote,
      fontWeight: weight.semibold,
      color: c.textSecondary,
    },
    landingOptionLabelActive: {
      color: c.text,
      fontWeight: weight.bold,
    },
    cta: {
      backgroundColor: c.primary,
      borderRadius: radius.pill,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    ctaDisabled: {
      backgroundColor: c.background,
    },
    ctaLabel: {
      ...sfPro,
      fontSize: text.callout,
      fontWeight: weight.semibold,
      color: c.onPrimary,
    },
    ctaLabelDisabled: {
      color: c.textMuted,
    },
    buildingWrap: {
      alignItems: 'center',
      paddingVertical: spacing.xxl,
      gap: spacing.md,
    },
    buildingTitle: {
      ...sfPro,
      fontSize: text.callout,
      fontWeight: weight.bold,
      color: c.text,
      textAlign: 'center',
    },
    buildingSub: {
      ...sfPro,
      fontSize: text.footnote,
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
