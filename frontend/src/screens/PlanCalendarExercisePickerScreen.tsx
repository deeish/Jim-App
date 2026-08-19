/**
 * The library-as-picker sheet ("One Library" phase 3): Replace and Add on the
 * calendar day page open the REAL exercise library — the shared
 * ExerciseLibrary component in selection mode — instead of the old flat
 * search-only pop-up. What the picker adds on top of the library:
 *
 *  - a pinned recommendation rail. Replace mode is fed by
 *    POST /exercises/replace-suggestions (ranked, with why-tags like "Easier
 *    version · Same lift, different equipment"); add mode pins the top
 *    recommended-tier picks for the day's muscles.
 *  - replace mode opens PRE-FILTERED to the outgoing exercise's muscle group,
 *    which also expands the library's sub-muscle refine row (one tap from
 *    "Chest" to "Lower Chest") — the chip clears like any other filter, and
 *    typed search always cuts across chips.
 *  - selection semantics: replace = one tap commits and dismisses; add =
 *    multi-select with an "Add N exercises" footer.
 *
 * Exercises already in the day render greyed (disabled) rather than hidden —
 * hiding read as "the app lost Push-Ups".
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, text, tracking, useTheme, weight, type ColorPalette } from '../theme';
import { useTabBarInset } from '../navigation/useTabBarInset';
import Button from '../components/Button';
import ExerciseLibrary, {
  useExerciseLibraryFilters,
  useSavedExercises,
} from '../components/ExerciseLibrary';
import {
  getReplaceSuggestions,
  searchExercises,
  type Exercise as CatalogExercise,
} from '../services/exerciseService';
import {
  GOLD,
  MUSCLE_COLORS,
  MUSCLE_EDGE,
  buzzEditApplied,
  buzzTap,
  catalogGroupForMuscle,
  sfPro,
  type PlanCalendarParamList,
} from '../lib/planCalendarPrototype';
import {
  addExercisesToDay,
  muscleFromCatalog,
  plannedDayForDate,
  plannedExerciseFromCatalog,
  replaceExercise,
} from '../lib/planCalendarPrototypeStore';
import { useUserPreferences } from '../contexts/UserPreferencesContext';

type Nav = NativeStackNavigationProp<PlanCalendarParamList, 'PlanCalendarExercisePicker'>;
type Route = RouteProp<PlanCalendarParamList, 'PlanCalendarExercisePicker'>;

/** One pinned rail row: a catalog exercise plus its why-line. */
type RailRow = { exercise: CatalogExercise; caption: string };

export default function PlanCalendarExercisePickerScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { equipment: profileGear } = useUserPreferences();

  const params = route.params;
  const { dateIso, mode } = params;
  const exerciseIndex = params.mode === 'replace' ? params.exerciseIndex : null;

  // The day is snapshotted at open — the picker commits and dismisses, so a
  // mid-open store change doesn't need to re-render it.
  const day = useMemo(() => plannedDayForDate(dateIso), [dateIso]);
  const outgoing = exerciseIndex != null ? day.exercises[exerciseIndex] : null;

  // Replace opens pre-filtered to the outgoing muscle group; the library's
  // refine row (Upper/Mid/Lower …) expands automatically for a selected group.
  const libraryFilters = useExerciseLibraryFilters(
    outgoing ? { muscleGroups: [catalogGroupForMuscle(outgoing.muscle)] } : undefined,
  );
  const saved = useSavedExercises();

  // ---- Selection (add mode) ----
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedById = useRef<Map<string, CatalogExercise>>(new Map());

  // Already-in-the-day rows render greyed, not hidden.
  const disabledIds = useMemo(
    () =>
      new Set(
        day.exercises
          .map((ex) => ex.exerciseId)
          .filter((id): id is string => id != null),
      ),
    [day],
  );

  // ---- The pinned recommendation rail ----
  const [rail, setRail] = useState<RailRow[] | null>(null); // null = loading
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (outgoing) {
          const suggestions = await getReplaceSuggestions({
            targetName: outgoing.name,
            targetExerciseId: outgoing.exerciseId,
            dayExerciseNames: day.exercises.map((e) => e.name),
            dayExerciseIds: day.exercises
              .map((e) => e.exerciseId)
              .filter((id): id is string => id != null),
            ...(profileGear.length > 0 ? { equipment: [...profileGear] } : null),
            count: 3,
          });
          if (cancelled) return;
          setRail(
            suggestions.map((s) => ({
              exercise: s.exercise,
              caption: s.reasons.join(' · '),
            })),
          );
        } else {
          // Add mode: the top recommended-tier picks for the day's muscles
          // (whole catalog on an empty/custom day).
          const groups = [...new Set(day.exercises.map((e) => catalogGroupForMuscle(e.muscle)))];
          const res = await searchExercises(
            groups.length
              ? { muscleGroups: groups, recommendedOnly: true, limit: 25 }
              : { recommendedOnly: true, limit: 25 },
          );
          if (cancelled) return;
          const dayNames = new Set(day.exercises.map((e) => e.name.toLowerCase()));
          setRail(
            res.exercises
              .filter((e) => !dayNames.has(e.name.toLowerCase()))
              .slice(0, 3)
              .map((e) => ({
                exercise: e,
                caption: muscleFromCatalog(e.primaryMuscleGroup, e.subMuscles, e.name),
              })),
          );
        }
      } catch {
        // Offline or error: no rail — the library below shows its own state.
        if (!cancelled) setRail([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Snapshotted day/params; the rail fetch runs once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Commit paths ----
  const commitReplace = useCallback(
    (row: CatalogExercise) => {
      if (exerciseIndex == null) return;
      replaceExercise(dateIso, exerciseIndex, plannedExerciseFromCatalog(row, outgoing));
      buzzEditApplied();
      navigation.goBack();
    },
    [dateIso, exerciseIndex, outgoing, navigation],
  );

  const toggleSelect = useCallback((row: CatalogExercise) => {
    buzzTap();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(row.id)) {
        next.delete(row.id);
        selectedById.current.delete(row.id);
      } else {
        next.add(row.id);
        selectedById.current.set(row.id, row);
      }
      return next;
    });
  }, []);

  const onRowSelect = useCallback(
    (row: CatalogExercise) => {
      if (mode === 'replace') commitReplace(row);
      else toggleSelect(row);
    },
    [mode, commitReplace, toggleSelect],
  );

  const submitAdd = useCallback(() => {
    const picks = [...selectedIds]
      .map((id) => selectedById.current.get(id))
      .filter((e): e is CatalogExercise => e != null);
    if (picks.length === 0) return;
    addExercisesToDay(
      dateIso,
      picks.map((row) => plannedExerciseFromCatalog(row, null)),
    );
    buzzEditApplied();
    navigation.goBack();
  }, [selectedIds, dateIso, navigation]);

  const openDetail = useCallback(
    (exerciseId: string) => {
      buzzTap();
      navigation.navigate('ExerciseDetail', { exerciseId });
    },
    [navigation],
  );

  const close = useCallback(() => {
    buzzTap();
    navigation.goBack();
  }, [navigation]);

  // ---- The rail node (the library renders it above its filter sections) ----
  const railNode =
    rail == null || rail.length > 0 ? (
      <View style={styles.railWrap}>
        <Text style={styles.railLabel}>
          {mode === 'replace' ? 'RECOMMENDED FOR THIS SLOT' : 'RECOMMENDED FOR THIS DAY'}
        </Text>
        <View style={styles.railCard}>
          {rail == null ? (
            <View style={styles.railRow}>
              <Text style={styles.railCaption}>Finding recommendations…</Text>
            </View>
          ) : (
            rail.map((r, i) => {
              const muscle = muscleFromCatalog(
                r.exercise.primaryMuscleGroup,
                r.exercise.subMuscles,
                r.exercise.name,
              );
              const picked = selectedIds.has(r.exercise.id);
              return (
                <TouchableOpacity
                  key={r.exercise.id}
                  style={[styles.railRow, i > 0 && styles.railDivider]}
                  activeOpacity={0.8}
                  onPress={() => onRowSelect(r.exercise)}
                  accessibilityRole="button"
                  accessibilityLabel={`${mode === 'replace' ? 'Replace with' : 'Add'} ${r.exercise.name}`}
                >
                  <View
                    style={[
                      styles.railDot,
                      { backgroundColor: MUSCLE_COLORS[muscle], borderColor: MUSCLE_EDGE[muscle] },
                    ]}
                  />
                  <View style={styles.railText}>
                    <Text style={styles.railName} numberOfLines={1}>
                      {r.exercise.name}
                    </Text>
                    <Text style={styles.railCaption} numberOfLines={1}>
                      {r.caption}
                    </Text>
                  </View>
                  {picked ? (
                    <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                  ) : (
                    <Ionicons name="sparkles" size={15} color={GOLD} />
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </View>
    ) : undefined;

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      {/* Header — the sheet's own chrome (the navigator hides its header). */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={close}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Close picker"
        >
          <Ionicons name="close" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>
          {mode === 'replace' ? 'Replace Exercise' : 'Add Exercises'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>
      <Text style={styles.lede} numberOfLines={1}>
        {mode === 'replace'
          ? `Swapping out ${outgoing?.name ?? ''}`
          : `Adding to ${day.title}`}
      </Text>

      <ExerciseLibrary
        filters={libraryFilters.filters}
        setFilters={libraryFilters.setFilters}
        prefsHydrated={libraryFilters.prefsHydrated}
        profileEquipment={libraryFilters.profileEquipment}
        onResetFilters={libraryFilters.resetFilters}
        selectMode
        selectedIds={selectedIds}
        disabledIds={disabledIds}
        onToggleSelect={onRowSelect}
        onOpenExercise={openDetail}
        savedIdSet={saved.savedIdSet}
        onToggleLike={saved.onToggleLike}
        headerSlot={railNode}
        compact
        bottomInset={mode === 'add' ? 0 : tabBarInset}
      />

      {mode === 'add' && (
        <View style={[styles.footer, { paddingBottom: spacing.lg + tabBarInset }]}>
          <Text style={styles.footerCount}>
            {selectedIds.size === 0
              ? 'Tap exercises to select'
              : `${selectedIds.size} selected`}
          </Text>
          <Button
            title={
              selectedIds.size > 1 ? `Add ${selectedIds.size} exercises` : 'Add exercise'
            }
            onPress={submitAdd}
            disabled={selectedIds.size === 0}
            style={styles.footerButton}
          />
        </View>
      )}
    </View>
  );
}

function createStyles(c: ColorPalette) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: c.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
    },
    title: {
      ...sfPro,
      flex: 1,
      textAlign: 'center',
      fontSize: text.headline,
      fontWeight: weight.bold,
      color: c.text,
    },
    headerSpacer: {
      width: 26,
    },
    lede: {
      ...sfPro,
      fontSize: text.footnote,
      color: c.textMuted,
      textAlign: 'center',
      marginTop: spacing.xs,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    railWrap: {
      paddingHorizontal: spacing.lg,
      marginTop: spacing.lg,
    },
    railLabel: {
      ...sfPro,
      fontSize: text.caption,
      fontWeight: weight.semibold,
      letterSpacing: tracking.widest,
      color: c.textMuted,
      marginBottom: spacing.sm,
      marginLeft: spacing.xs,
    },
    railCard: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.lg,
    },
    railRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
    },
    railDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    railDot: {
      width: 12,
      height: 12,
      borderRadius: radius.pill,
      borderWidth: 1,
    },
    railText: {
      flex: 1,
      minWidth: 0,
    },
    railName: {
      ...sfPro,
      fontSize: text.callout,
      fontWeight: weight.semibold,
      color: c.text,
    },
    railCaption: {
      ...sfPro,
      fontSize: text.footnote,
      color: c.textMuted,
      marginTop: spacing.xxs,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      backgroundColor: c.surface,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    footerCount: {
      ...sfPro,
      fontSize: text.callout,
      fontWeight: weight.semibold,
      color: c.textSecondary,
    },
    footerButton: {
      minWidth: 170,
    },
  });
}
