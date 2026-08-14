import React, { useEffect, useMemo, useReducer, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  radius,
  spacing,
  text,
  tracking,
  useTheme,
  weight,
  type ColorPalette,
} from '../theme';
import { useTabBarInset } from '../navigation/useTabBarInset';
import PlanCalendarScopeBar from '../components/PlanCalendarScopeBar';
import {
  EXERCISE_LIBRARY,
  GOLD,
  MUSCLE_COLORS,
  MUSCLE_EDGE,
  MUSCLE_INK,
  fromIso,
  mondayOf,
  recommendReplacements,
  sfPro,
  shortDate,
  toIso,
  type PlanCalendarParamList,
  type PlannedExercise,
} from '../lib/planCalendarPrototype';
import {
  plannedDayForDate,
  replaceExercise,
  subscribePlanCalendar,
} from '../lib/planCalendarPrototypeStore';

type Nav = NativeStackNavigationProp<PlanCalendarParamList, 'PlanCalendarDay'>;
type Route = RouteProp<PlanCalendarParamList, 'PlanCalendarDay'>;

/** The slot a long-press is acting on. */
type SlotTarget = { index: number; exercise: PlannedExercise };

/**
 * PROTOTYPE — one day of the plan: the session's exercises as solid,
 * vibrantly colour-coded blocks (name only). Tap opens the workout detail;
 * press-and-hold offers Replace, which opens an exercises-tab-style pop-up
 * with three recommended swaps pinned on top.
 */
export default function PlanCalendarDayScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const tabBarInset = useTabBarInset();
  const insets = useSafeAreaInsets();

  // Re-render when a replacement (or set log) lands in the session store.
  const [, forceRender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribePlanCalendar(forceRender), []);

  const { dateIso } = route.params;
  const plan = plannedDayForDate(dateIso);
  const date = fromIso(dateIso);

  /** Long-press menu (small sheet), then the full replace pop-up. */
  const [menuFor, setMenuFor] = useState<SlotTarget | null>(null);
  const [pickerFor, setPickerFor] = useState<SlotTarget | null>(null);
  const [query, setQuery] = useState('');

  const dayNames = useMemo(
    () => new Set(plan.exercises.map((e) => e.name)),
    [plan],
  );
  const recommended = pickerFor
    ? recommendReplacements(pickerFor.exercise.muscle, dayNames)
    : [];
  const allResults = pickerFor
    ? EXERCISE_LIBRARY.filter(
        (e) =>
          !dayNames.has(e.name) &&
          (query.trim() === '' ||
            `${e.name} ${e.muscle}`.toLowerCase().includes(query.trim().toLowerCase())),
      )
    : [];

  const applyReplacement = (replacement: PlannedExercise) => {
    if (!pickerFor) return;
    replaceExercise(dateIso, pickerFor.index, replacement);
    setPickerFor(null);
    setQuery('');
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: spacing.xxxl + tabBarInset }]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <PlanCalendarScopeBar
        active="day"
        onNavigate={(scope) => {
          if (scope === 'week') {
            // Mirrors the header's "‹ Week": pop when the week is beneath,
            // otherwise swap this day for its week in place.
            const state = navigation.getState();
            const prev = state.index > 0 ? state.routes[state.index - 1] : undefined;
            if (prev?.name === 'PlanCalendarWeek' || prev?.name === 'PlanList') {
              navigation.goBack();
            } else {
              navigation.replace('PlanCalendarWeek', {
                weekMondayIso: toIso(mondayOf(fromIso(dateIso))),
              });
            }
          } else if (scope === 'month') {
            // Zoom all the way out: the month containing this day becomes
            // the stack root (the canonical top of the hierarchy).
            navigation.reset({
              index: 0,
              routes: [{ name: 'PlanCalendarMonth', params: { monthIso: dateIso } }],
            });
          }
        }}
      />

      <Text style={styles.lede}>
        {plan.title} · {shortDate(date)} · {plan.exercises.length} exercises
      </Text>

      {plan.exercises.length === 0 && (
        <View style={styles.restCard}>
          <Ionicons name="moon-outline" size={22} color={colors.textMuted} />
          <Text style={styles.restText}>Rest day — nothing scheduled.</Text>
        </View>
      )}

      {plan.exercises.map((ex, index) => (
        <TouchableOpacity
          key={`${index}-${ex.name}`}
          style={[styles.exerciseCard, { borderColor: MUSCLE_EDGE[ex.muscle] }]}
          activeOpacity={0.8}
          onPress={() =>
            navigation.navigate('PlanCalendarWorkout', {
              dateIso,
              exerciseIndex: index,
              exerciseName: ex.name,
            })
          }
          onLongPress={() => setMenuFor({ index, exercise: ex })}
          accessibilityRole="button"
          accessibilityLabel={`${ex.name}, ${ex.muscle}`}
        >
          <View style={styles.exerciseLeft}>
            <Text style={styles.exerciseName}>{ex.name}</Text>
          </View>
          <View style={[styles.exerciseRight, { backgroundColor: MUSCLE_COLORS[ex.muscle] }]}>
            <Text style={[styles.exerciseMuscle, { color: MUSCLE_INK[ex.muscle] }]}>
              {ex.muscle}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={17}
              color={MUSCLE_INK[ex.muscle]}
              style={styles.exerciseChevron}
            />
          </View>
        </TouchableOpacity>
      ))}

      <Text style={styles.hint}>Hold an exercise to replace it</Text>
      <Text style={styles.footerNote}>Prototype · Sample plan data</Text>

      {/* ---- Long-press menu ---- */}
      <Modal
        visible={menuFor !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuFor(null)}
      >
        <Pressable style={styles.scrim} onPress={() => setMenuFor(null)}>
          <View style={[styles.menuWrap, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.menuGroup}>
              <View style={styles.menuTitleRow}>
                <Text style={styles.menuTitle} numberOfLines={1}>
                  {menuFor?.exercise.name}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.menuAction}
                activeOpacity={0.8}
                onPress={() => {
                  setPickerFor(menuFor);
                  setMenuFor(null);
                }}
                accessibilityRole="button"
                accessibilityLabel="Replace exercise"
              >
                <Ionicons name="swap-horizontal" size={20} color={colors.primary} />
                <Text style={styles.menuActionLabel}>Replace Exercise</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.menuGroup, styles.menuCancel]}
              activeOpacity={0.8}
              onPress={() => setMenuFor(null)}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.menuCancelLabel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* ---- Replace pop-up (the exercises tab, recommendations pinned) ---- */}
      <Modal
        visible={pickerFor !== null}
        animationType="slide"
        onRequestClose={() => setPickerFor(null)}
      >
        <View style={[styles.pickerRoot, { paddingTop: insets.top + spacing.md }]}>
          <View style={styles.pickerHeader}>
            <TouchableOpacity
              onPress={() => {
                setPickerFor(null);
                setQuery('');
              }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Close replace"
            >
              <Ionicons name="close" size={26} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.pickerTitle}>Replace Exercise</Text>
            <View style={styles.pickerHeaderSpacer} />
          </View>
          <Text style={styles.pickerLede} numberOfLines={1}>
            Swapping out {pickerFor?.exercise.name}
          </Text>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={17} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search exercises"
              placeholderTextColor={colors.textMuted}
              autoCorrect={false}
            />
          </View>

          <ScrollView
            style={styles.pickerList}
            contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxxl }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionLabel}>RECOMMENDED</Text>
            <View style={styles.groupCard}>
              {recommended.map((ex, i) => (
                <TouchableOpacity
                  key={ex.name}
                  style={[styles.pickerRow, i > 0 && styles.rowDivider]}
                  activeOpacity={0.8}
                  onPress={() => applyReplacement(ex)}
                  accessibilityRole="button"
                  accessibilityLabel={`Replace with ${ex.name}`}
                >
                  <View
                    style={[
                      styles.pickerDot,
                      { backgroundColor: MUSCLE_COLORS[ex.muscle], borderColor: MUSCLE_EDGE[ex.muscle] },
                    ]}
                  />
                  <View style={styles.pickerRowText}>
                    <Text style={styles.pickerRowName}>{ex.name}</Text>
                    <Text style={styles.pickerRowMuscle}>{ex.muscle}</Text>
                  </View>
                  <Ionicons name="sparkles" size={15} color={GOLD} />
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>ALL EXERCISES</Text>
            <View style={styles.groupCard}>
              {allResults.map((ex, i) => (
                <TouchableOpacity
                  key={ex.name}
                  style={[styles.pickerRow, i > 0 && styles.rowDivider]}
                  activeOpacity={0.8}
                  onPress={() => applyReplacement(ex)}
                  accessibilityRole="button"
                  accessibilityLabel={`Replace with ${ex.name}`}
                >
                  <View
                    style={[
                      styles.pickerDot,
                      { backgroundColor: MUSCLE_COLORS[ex.muscle], borderColor: MUSCLE_EDGE[ex.muscle] },
                    ]}
                  />
                  <View style={styles.pickerRowText}>
                    <Text style={styles.pickerRowName}>{ex.name}</Text>
                    <Text style={styles.pickerRowMuscle}>{ex.muscle}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} />
                </TouchableOpacity>
              ))}
              {allResults.length === 0 && (
                <View style={styles.pickerRow}>
                  <Text style={styles.pickerRowMuscle}>No exercises match “{query}”.</Text>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

function createStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    content: {
      padding: spacing.lg,
      gap: spacing.md,
    },
    lede: {
      ...sfPro,
      fontSize: text.body,
      lineHeight: 20,
      color: c.textSecondary,
      marginBottom: spacing.xs,
    },
    exerciseCard: {
      flexDirection: 'row',
      alignItems: 'stretch',
      borderRadius: radius.lg,
      borderWidth: 1,
      // The base card is the white left half; the right half paints its
      // muscle colour over its own side. Clipping keeps the colour inside
      // the rounded corners.
      backgroundColor: c.surface,
      overflow: 'hidden',
    },
    exerciseLeft: {
      flex: 1,
      justifyContent: 'center',
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.lg,
    },
    exerciseName: {
      ...sfPro,
      fontSize: text.callout,
      lineHeight: 22,
      fontWeight: weight.semibold,
      color: '#000000',
    },
    exerciseRight: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
    },
    exerciseMuscle: {
      ...sfPro,
      fontSize: text.callout,
      lineHeight: 22,
      fontWeight: weight.semibold,
      marginRight: spacing.sm,
    },
    exerciseChevron: {
      opacity: 0.7,
    },
    hint: {
      ...sfPro,
      fontSize: text.footnote,
      color: c.textMuted,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
    restCard: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      padding: spacing.xxl,
      alignItems: 'center',
      gap: spacing.sm,
    },
    restText: {
      ...sfPro,
      fontSize: text.body,
      color: c.textMuted,
    },
    footerNote: {
      ...sfPro,
      fontSize: text.caption,
      color: c.textMuted,
      textAlign: 'center',
      marginTop: spacing.xs,
    },

    // Long-press menu (iOS action-sheet style)
    scrim: {
      flex: 1,
      backgroundColor: c.scrim,
      justifyContent: 'flex-end',
    },
    menuWrap: {
      padding: spacing.lg,
      gap: spacing.sm,
    },
    menuGroup: {
      backgroundColor: c.surface,
      borderRadius: radius.xl,
      overflow: 'hidden',
    },
    menuTitleRow: {
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    menuTitle: {
      ...sfPro,
      fontSize: text.footnote,
      fontWeight: weight.semibold,
      color: c.textMuted,
    },
    menuAction: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.lg,
    },
    menuActionLabel: {
      ...sfPro,
      fontSize: text.callout,
      fontWeight: weight.semibold,
      color: c.primary,
    },
    menuCancel: {
      alignItems: 'center',
      paddingVertical: spacing.lg,
    },
    menuCancelLabel: {
      ...sfPro,
      fontSize: text.callout,
      fontWeight: weight.bold,
      color: c.text,
    },

    // Replace pop-up
    pickerRoot: {
      flex: 1,
      backgroundColor: c.background,
      paddingHorizontal: spacing.lg,
    },
    pickerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    pickerTitle: {
      ...sfPro,
      flex: 1,
      textAlign: 'center',
      fontSize: text.headline,
      fontWeight: weight.bold,
      color: c.text,
    },
    pickerHeaderSpacer: {
      width: 26,
    },
    pickerLede: {
      ...sfPro,
      fontSize: text.footnote,
      color: c.textMuted,
      textAlign: 'center',
      marginTop: spacing.xs,
    },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginTop: spacing.lg,
    },
    searchInput: {
      ...sfPro,
      flex: 1,
      fontSize: text.callout,
      color: c.text,
      paddingVertical: spacing.xxs,
    },
    pickerList: {
      flex: 1,
      marginTop: spacing.sm,
    },
    sectionLabel: {
      ...sfPro,
      fontSize: text.caption,
      fontWeight: weight.semibold,
      letterSpacing: tracking.widest,
      color: c.textMuted,
      marginTop: spacing.xl,
      marginBottom: spacing.sm,
      marginLeft: spacing.md,
    },
    groupCard: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.lg,
    },
    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    pickerDot: {
      width: 12,
      height: 12,
      borderRadius: radius.pill,
      borderWidth: 1,
    },
    pickerRowText: {
      flex: 1,
    },
    pickerRowName: {
      ...sfPro,
      fontSize: text.callout,
      fontWeight: weight.semibold,
      color: c.text,
    },
    pickerRowMuscle: {
      ...sfPro,
      fontSize: text.footnote,
      color: c.textMuted,
      marginTop: spacing.xxs,
    },
  });
}
