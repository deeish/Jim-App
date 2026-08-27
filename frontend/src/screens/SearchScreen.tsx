/**
 * The Exercises tab — a thin host around the shared ExerciseLibrary component
 * (see components/ExerciseLibrary.tsx for the browsing core). This screen owns
 * what is tab-specific: the header (title, filter badge, Reset), the
 * All | Saved segment and the Saved list, Android back handling, and the
 * legacy cross-tab add-mode (`addToPlan` / `addToWorkout` route params →
 * selection banner + "Add to X" footer).
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useFocusEffect, useScrollToTop, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { useTheme } from '../theme/ThemeContext';
import Button from '../components/Button';
import { Exercise } from '../services/exerciseService';
import ExerciseLibrary, {
  ResultRow,
  useExerciseLibraryFilters,
  useSavedExercises,
} from '../components/ExerciseLibrary';
import { groupExercises, ExerciseGroup } from '../utils/exerciseGrouping';
import { getCurrentPlan, createPlan, addPlanSlotToCurrent } from '../services/planService';
import { updateWorkout, getWorkoutById } from '../services/workoutService';
import type { PlanSlot } from '../services/planService';
import {
  formatLocalYmd,
  getCalendarWeekRange,
  normalizePlanAnchorYmd,
  programWeekNumberForSlotWeek,
} from '../lib/planCalendar';
import { toWorkoutExercisePayloads } from '../lib/workoutExercisePayload';
import { defaultPrescriptionForNewExercise } from '../lib/exercisePrescription';
import { radius, spacing, text, weight } from '../theme';
import { useTabBarInset } from '../navigation/useTabBarInset';

type SearchScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Search'>;
type SearchScreenRouteProp = RouteProp<RootStackParamList, 'Search'>;

type Props = {
  navigation: SearchScreenNavigationProp;
};

export default function SearchScreen({ navigation }: Props) {
  const route = useRoute<SearchScreenRouteProp>();
  // The tab bar floats over this screen; lists and in-flow footers must both
  // keep their last row / buttons clear of it.
  const tabBarInset = useTabBarInset();
  const addToPlan = route.params?.addToPlan;
  const addToWorkout = route.params?.addToWorkout;
  const addMode = addToPlan ? 'plan' : addToWorkout ? 'workout' : null;
  const { colors } = useTheme();

  const {
    filters,
    setFilters,
    resetFilters,
    activeFilterCount,
    isDefaultFilterState,
    prefsHydrated,
    profileEquipment,
  } = useExerciseLibraryFilters();
  const {
    savedExerciseIds,
    savedIdSet,
    onToggleLike,
    savedExercisesList,
    loadSavedList,
    loadingSavedList,
  } = useSavedExercises();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addingToPlan, setAddingToPlan] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'saved'>('all');

  // Re-tapping the Exercises tab scrolls the visible list back to the top —
  // standard iOS muscle memory for escaping a deep scroll. One ref per list;
  // the hook no-ops on whichever list isn't mounted.
  const allListRef = useRef<FlatList>(null);
  const savedListRef = useRef<FlatList>(null);
  // The hook's type rejects nullable refs, but a null current is exactly the
  // unmounted-list no-op we rely on; FlatList satisfies it structurally.
  useScrollToTop(allListRef as React.RefObject<FlatList>);
  useScrollToTop(savedListRef as React.RefObject<FlatList>);

  // Android: at Search stack root, hardware back must not bubble to the tab navigator — that can
  // switch to the previous tab (Plan/PlanPreview) even with backBehavior="none" depending on stack routing.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (activeTab === 'saved') {
          setActiveTab('all');
          return true;
        }
        const state = navigation.getState();
        const routes = state?.routes;
        const index = state?.index ?? 0;
        if (
          routes &&
          routes.length === 1 &&
          routes[0]?.name === 'SearchList' &&
          index === 0
        ) {
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }, [navigation, activeTab])
  );

  const switchTab = useCallback(
    (tab: 'all' | 'saved') => {
      if (tab === 'saved') loadSavedList();
      setActiveTab(tab);
    },
    [loadSavedList],
  );

  // Selected exercise objects for add-mode, keyed by id, alongside selectedIds.
  // Chip-driven searches are capped, so a selected row can drop out of the
  // current results array on a re-search; the submit handlers must still be
  // able to build its payload. Set/delete are idempotent, so mutating the ref
  // inside the state updater is safe even if React replays it.
  const selectedExercisesById = useRef<Map<string, Exercise>>(new Map());

  const toggleSelectForAddToPlan = useCallback((exercise: Exercise) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(exercise.id)) {
        next.delete(exercise.id);
        selectedExercisesById.current.delete(exercise.id);
      } else {
        next.add(exercise.id);
        selectedExercisesById.current.set(exercise.id, exercise);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    selectedExercisesById.current.clear();
    setSelectedIds(new Set());
  }, []);

  // Clear a stale add-mode when the user leaves the Search TAB entirely, instead of
  // letting it sit in route params indefinitely until an explicit Cancel or a
  // completed add. Deliberately a tab-level `blur` (on the parent tab navigator), NOT a
  // focus-effect on this screen — pushing ExerciseDetail via the info button while in
  // add-mode stays on this tab and must NOT clear this (same "which blur actually means
  // leaving" distinction as the ExerciseDetail cross-tab fix elsewhere in this app;
  // tab-level blur only fires on a genuine switch to a different tab, never on
  // in-stack navigation within Search's own stack).
  useEffect(() => {
    if (!addToPlan && !addToWorkout) return;
    const tabNav = (navigation as any)?.getParent?.();
    if (!tabNav) return;
    const unsubscribe = tabNav.addListener('blur', () => {
      clearSelection();
      navigation.setParams({ addToPlan: undefined, addToWorkout: undefined });
    });
    return unsubscribe;
  }, [navigation, addToPlan, addToWorkout, clearSelection]);

  /** Derive a short workout title from selected exercises' primary muscle groups (e.g. "Chest & Triceps"). */
  const deriveWorkoutTitle = useCallback((selected: Exercise[]): string => {
    const groups = [...new Set(selected.map(e => e.primaryMuscleGroup).filter(Boolean))];
    if (groups.length === 0) return 'Custom';
    if (groups.length === 1) return groups[0];
    return groups.slice(0, 3).join(' & ');
  }, []);

  // Saved tab data, grouped the same way as search results.
  const savedGroups = useMemo(() => groupExercises(savedExercisesList), [savedExercisesList]);

  const openExerciseDetail = useCallback(
    (exerciseId: string) => navigation.navigate('ExerciseDetail', { exerciseId }),
    [navigation],
  );

  // Set lookup so renderItem stays O(1) per row instead of scanning arrays.
  const existingIdSet = useMemo(
    () => new Set(addToWorkout?.existingExerciseIds ?? []),
    [addToWorkout],
  );

  // Saved-tab rows — identical treatment to the library's results (hearts,
  // add-mode selection), rendered by the same memoized ResultRow.
  const renderSavedCard = useCallback(
    ({ item: group }: { item: ExerciseGroup }) => (
      <ResultRow
        group={group}
        inAddMode={addMode != null}
        selected={group.exercises.some((e) => selectedIds.has(e.id))}
        disabled={existingIdSet.size > 0 && group.exercises.some((e) => existingIdSet.has(e.id))}
        saved={savedIdSet.has(group.primaryExercise.id)}
        onToggleSelect={toggleSelectForAddToPlan}
        onOpenDetail={openExerciseDetail}
        onToggleLike={onToggleLike}
      />
    ),
    [
      selectedIds,
      addMode,
      existingIdSet,
      savedIdSet,
      toggleSelectForAddToPlan,
      openExerciseDetail,
      onToggleLike,
    ],
  );

  const submitAddToPlan = useCallback(async () => {
    if (!addToPlan || selectedIds.size === 0) return;
    const { day, weekIndex, weekMondayIso: weekMondayParam } = addToPlan;
    const weekMondayIso =
      weekMondayParam ?? formatLocalYmd(getCalendarWeekRange(weekIndex).start);

    // Read from the selection map, not the current results array — a re-search
    // (capped or refiltered) may no longer contain a still-selected exercise.
    const selectedExercises = [...selectedIds]
      .map((id) => selectedExercisesById.current.get(id))
      .filter((e): e is Exercise => e != null);
    if (selectedExercises.length === 0) {
      Alert.alert('No exercises', 'Selected exercises could not be found. Try searching again and reselect.');
      return;
    }

    const workoutExercises = selectedExercises.map((e, i) => ({
      name: e.name,
      ...defaultPrescriptionForNewExercise(
        e.name,
        e.primaryMuscleGroup,
        e.prescriptionType === 'time' ? 'time' : undefined,
      ),
      exerciseId: e.id,
      orderIndex: i,
    }));

    setAddingToPlan(true);
    try {
      let anchorYmd = normalizePlanAnchorYmd(addToPlan.weekAnchorMonday);
      if (anchorYmd == null) {
        const plan = await getCurrentPlan();
        anchorYmd = normalizePlanAnchorYmd(plan?.weekAnchorMonday);
      }

      const weekNumber =
        anchorYmd != null
          ? programWeekNumberForSlotWeek(anchorYmd, weekMondayIso)
          : weekIndex + 1;

      if (weekNumber < 1) {
        Alert.alert(
          'Before plan start',
          'This calendar week is before your program start. Use the week arrows on Calendar to pick a later week.',
        );
        return;
      }

      const slotTitle = deriveWorkoutTitle(selectedExercises);
      const slotPayload: PlanSlot = {
        weekNumber,
        dayOfWeek: day,
        title: slotTitle,
        detailLine: `${selectedExercises.length} exercises`,
        type: 'strength',
        durationMinutes: Math.max(30, selectedExercises.length * 5),
        exercises: workoutExercises,
      };

      try {
        await addPlanSlotToCurrent(slotPayload);
      } catch (firstErr: any) {
        const noPlan =
          firstErr?.response?.status === 404 &&
          firstErr?.response?.data?.code === 'NO_CURRENT_PLAN';
        if (noPlan) {
          await createPlan({
            name: 'My Plan',
            weekAnchorMonday: weekMondayIso,
            slots: [{ ...slotPayload, weekNumber: 1 }],
          });
        } else {
          throw firstErr;
        }
      }

      clearSelection();
      const tabNav = (navigation as any)?.getParent?.();
      if (tabNav) tabNav.navigate('Calendar');
      const exerciseNoun = `exercise${selectedExercises.length === 1 ? '' : 's'}`;
      const successMsg =
        anchorYmd != null
          ? `Added ${selectedExercises.length} ${exerciseNoun} to ${day} for this calendar week.`
          : weekNumber === 1
            ? `Added ${selectedExercises.length} ${exerciseNoun} to ${day}.`
            : `Added "${slotTitle}" to ${day} (program week ${weekNumber}).`;
      Alert.alert('Done', successMsg);
    } catch (err: any) {
      console.error('Add to plan failed:', err);
      const status = err.response?.status;
      const message =
        status === 401
          ? 'Session expired. Sign in again.'
          : err.message === 'Network Error' || !err.response
            ? 'Could not reach the server. Check your connection.'
            : err.response?.data?.message ?? err.message ?? 'Could not add workout to plan.';
      Alert.alert('Error', message);
    } finally {
      setAddingToPlan(false);
    }
  }, [addToPlan, selectedIds, navigation, deriveWorkoutTitle, clearSelection]);

  const submitAddToWorkout = useCallback(async () => {
    if (!addToWorkout || selectedIds.size === 0) return;
    const selectedExercises = [...selectedIds]
      .map((id) => selectedExercisesById.current.get(id))
      .filter((e): e is Exercise => e != null);
    if (selectedExercises.length === 0) {
      Alert.alert('No exercises', 'Selected exercises could not be found. Try searching again and reselect.');
      return;
    }

    const newExercises = selectedExercises.map((e, i) => ({
      name: e.name,
      ...defaultPrescriptionForNewExercise(
        e.name,
        e.primaryMuscleGroup,
        e.prescriptionType === 'time' ? 'time' : undefined,
      ),
      exerciseId: e.id,
      orderIndex: i,
    }));

    setAddingToPlan(true);
    try {
      const workout = await getWorkoutById(addToWorkout.workoutId);
      // Full-fidelity payload: hand-rolled 7-field mappings here used to drop
      // repsMin/repsMax/durationSeconds and flatten every range in the workout.
      const existingExercises = toWorkoutExercisePayloads(workout.exercises || []);
      const merged = [
        ...existingExercises,
        ...toWorkoutExercisePayloads(newExercises, existingExercises.length),
      ];
      await updateWorkout(addToWorkout.workoutId, { exercises: merged });

      clearSelection();
      navigation.setParams({ addToWorkout: undefined });
      const tabNav = (navigation as any)?.getParent?.();
      // The Calendar tab replaced both Plan and Train — every origin lands there.
      if (tabNav) tabNav.navigate('Calendar');
      Alert.alert(
        'Done',
        `Added ${selectedExercises.length} exercise${selectedExercises.length === 1 ? '' : 's'} to ${addToWorkout.workoutName}.`,
      );
    } catch (err: any) {
      console.error('Add to workout failed:', err);
      const status = err.response?.status;
      const message =
        status === 401
          ? 'Session expired. Sign in again.'
          : status === 404
            ? 'Workout no longer exists. It may have been deleted.'
            : err.message === 'Network Error' || !err.response
              ? 'Could not reach the server. Check your connection.'
              : err.response?.data?.message ?? err.message ?? 'Could not add exercises to workout.';
      Alert.alert('Error', message);
    } finally {
      setAddingToPlan(false);
    }
  }, [addToWorkout, selectedIds, navigation, clearSelection]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        header: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.lg,
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
        headerTitle: { fontSize: text.display, fontWeight: weight.bold, color: colors.text },
        filterBadge: {
          backgroundColor: colors.primary,
          borderRadius: radius.md,
          minWidth: 24,
          height: 24,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: spacing.sm,
        },
        filterBadgeText: { color: colors.onPrimary, fontSize: text.footnote, fontWeight: weight.bold },
        resetButton: { fontSize: text.callout, color: colors.primary, fontWeight: weight.semibold },
        resetButtonDisabled: { opacity: 0.4 },
        // The All pane stays mounted (hidden) during a Saved round-trip so the
        // library's results and scroll position survive; see below.
        pane: { flex: 1 },
        paneHidden: { display: 'none' },
        // Saved list — mirrors the library's list/empty-state styling.
        content: { flex: 1 },
        contentContainer: { paddingBottom: 100 },
        resultsPreview: {
          marginTop: spacing.lg,
          marginHorizontal: spacing.lg,
          padding: spacing.lg,
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
        },
        resultsPreviewText: { fontSize: text.callout, fontWeight: weight.semibold, color: colors.text, marginBottom: spacing.xs },
        resultsPreviewHint: { fontSize: text.body, color: colors.textMuted, textAlign: 'center' },
        addToPlanBanner: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderBottomWidth: 1,
        },
        addToPlanBannerText: { fontSize: text.body, fontWeight: weight.semibold, flex: 1 },
        addToPlanCancelText: { fontSize: text.callout, fontWeight: weight.semibold },
        addToPlanFooter: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.lg,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        addToPlanFooterText: { fontSize: text.callout, fontWeight: weight.semibold, color: colors.text },
        addToPlanFooterButton: { minWidth: 160 },
        segmentContainer: {
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        segmentRow: {
          flexDirection: 'row',
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
        },
        segmentBtn: {
          flex: 1,
          paddingVertical: spacing.sm,
          alignItems: 'center',
          backgroundColor: colors.background,
        },
        segmentBtnActive: { backgroundColor: colors.primary },
        segmentBtnText: { fontSize: text.body, fontWeight: weight.semibold, color: colors.textSecondary },
        segmentBtnTextActive: { color: colors.onPrimary },
      }),
    [colors]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Add to plan / add to workout banner */}
      {addMode && (
        <View style={[styles.addToPlanBanner, { backgroundColor: colors.primary + '22', borderColor: colors.primary }]}>
          <Text style={[styles.addToPlanBannerText, { color: colors.text }]}>
            {addToPlan
              ? `Adding to ${addToPlan.day} — tap exercises to select`
              : addToWorkout
                ? `Adding to "${addToWorkout.workoutName}" — tap exercises to select`
                : ''}
          </Text>
          <TouchableOpacity
            onPress={() => {
              clearSelection();
              navigation.setParams({ addToPlan: undefined, addToWorkout: undefined });
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={[styles.addToPlanCancelText, { color: colors.primary }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Exercises</Text>
          {activeTab === 'all' && activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </View>
        {activeTab === 'all' && (
          <TouchableOpacity onPress={resetFilters} activeOpacity={0.7} disabled={isDefaultFilterState}>
            <Text style={[styles.resetButton, isDefaultFilterState && styles.resetButtonDisabled]}>
              Reset
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* All | Saved segment */}
      <View style={styles.segmentContainer}>
        <View style={styles.segmentRow} accessibilityRole="tablist">
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'all' && styles.segmentBtnActive]}
            onPress={() => switchTab('all')}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'all' }}
          >
            <Text style={[styles.segmentBtnText, activeTab === 'all' && styles.segmentBtnTextActive]}>
              All
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'saved' && styles.segmentBtnActive]}
            onPress={() => switchTab('saved')}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'saved' }}
          >
            <Text style={[styles.segmentBtnText, activeTab === 'saved' && styles.segmentBtnTextActive]}>
              {savedExerciseIds.length > 0 ? `Saved (${savedExerciseIds.length})` : 'Saved'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* The library pane is HIDDEN (not unmounted) on the Saved tab: its
          results state lives inside the component now, so unmounting would
          refetch + flash on every Saved round-trip — the screen previously
          held that state and kept it alive across the switch. */}
      <View style={[styles.pane, activeTab !== 'all' && styles.paneHidden]}>
        <ExerciseLibrary
          filters={filters}
          setFilters={setFilters}
          prefsHydrated={prefsHydrated}
          profileEquipment={profileEquipment}
          onResetFilters={resetFilters}
          selectMode={addMode != null}
          selectedIds={selectedIds}
          disabledIds={existingIdSet}
          onToggleSelect={toggleSelectForAddToPlan}
          onOpenExercise={openExerciseDetail}
          savedIdSet={savedIdSet}
          onToggleLike={onToggleLike}
          bottomInset={tabBarInset}
          listRef={allListRef}
        />
      </View>

      {activeTab === 'saved' && (
        // Virtualized like the main results list — the saved list can grow unbounded,
        // and a plain .map would re-introduce the mount-everything jank FlatList fixed.
        <FlatList
          ref={savedListRef}
          style={styles.content}
          contentContainerStyle={[styles.contentContainer, { paddingBottom: 100 + tabBarInset }]}
          showsVerticalScrollIndicator={false}
          data={savedGroups}
          keyExtractor={(group, index) => `saved-${group.baseName}-${index}`}
          renderItem={renderSavedCard}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          ListEmptyComponent={
            loadingSavedList ? (
              <View style={styles.resultsPreview}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              <View style={styles.resultsPreview}>
                <Text style={styles.resultsPreviewText}>No saved exercises</Text>
                <Text style={styles.resultsPreviewHint}>Tap the heart on any exercise to save it here</Text>
              </View>
            )
          }
        />
      )}

      {/* Add to plan / add to workout footer */}
      {addMode && (
        <View style={[styles.addToPlanFooter, { paddingBottom: spacing.lg + tabBarInset }]}>
          <Text style={styles.addToPlanFooterText}>
            {selectedIds.size} selected
          </Text>
          <Button
            title={
              addingToPlan
                ? 'Adding…'
                : addToPlan
                  ? `Add to ${addToPlan.day}`
                  : addToWorkout
                    ? `Add to ${addToWorkout.workoutName}`
                    : 'Add'
            }
            onPress={addToWorkout ? submitAddToWorkout : submitAddToPlan}
            disabled={selectedIds.size === 0 || addingToPlan}
            style={styles.addToPlanFooterButton}
          />
        </View>
      )}
    </SafeAreaView>
  );
}
