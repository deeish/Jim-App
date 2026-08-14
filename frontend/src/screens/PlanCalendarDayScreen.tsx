import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  catalogGroupForMuscle,
  fromIso,
  mondayOf,
  recommendReplacements,
  sfPro,
  shortDate,
  toIso,
  type PlanCalendarParamList,
  type PlannedExercise,
  type PrototypeMuscle,
} from '../lib/planCalendarPrototype';
import {
  addExerciseToDay,
  calendarDataMode,
  muscleFromCatalog,
  plannedDayForDate,
  plannedExerciseFromCatalog,
  replaceExercise,
  subscribePlanCalendar,
} from '../lib/planCalendarPrototypeStore';
import { searchExercises, type Exercise as CatalogExercise } from '../services/exerciseService';

type Nav = NativeStackNavigationProp<PlanCalendarParamList, 'PlanCalendarDay'>;
type Route = RouteProp<PlanCalendarParamList, 'PlanCalendarDay'>;

/** The slot a long-press is acting on. */
type SlotTarget = { index: number; exercise: PlannedExercise };
/** What the exercise picker is doing: swapping one slot, or appending. */
type PickerTarget =
  | { mode: 'replace'; index: number; exercise: PlannedExercise }
  | { mode: 'add' };

/**
 * PROTOTYPE — one day of the plan: split colour-coded blocks (tap = workout
 * detail, hold = replace), plus "+ Add Exercise". Replace/Add open the
 * exercise-library picker: the REAL catalog when the backend is reachable
 * (recommended-tier exercises pinned on top), the sample library offline.
 */
export default function PlanCalendarDayScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const tabBarInset = useTabBarInset();
  const insets = useSafeAreaInsets();

  // Re-render when a replacement/addition/live update lands in the store.
  const [, forceRender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribePlanCalendar(forceRender), []);

  const { dateIso } = route.params;
  const plan = plannedDayForDate(dateIso);
  const date = fromIso(dateIso);

  /** Long-press menu (small sheet), then the picker pop-up. */
  const [menuFor, setMenuFor] = useState<SlotTarget | null>(null);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [query, setQuery] = useState('');

  // ---- Catalog fetches (null = loading; offline flips to the sample lib) ----
  const [recList, setRecList] = useState<CatalogExercise[] | null>(null);
  const [allList, setAllList] = useState<CatalogExercise[] | null>(null);
  const [catalogOffline, setCatalogOffline] = useState(false);
  const recSeq = useRef(0);
  const allSeq = useRef(0);

  const dayNamesLower = useMemo(
    () => new Set(plan.exercises.map((e) => e.name.toLowerCase())),
    [plan],
  );

  // Recommended rail: fetched once per picker open (query never filters it).
  useEffect(() => {
    if (!picker) return;
    setQuery('');
    setRecList(null);
    setAllList(null);
    setCatalogOffline(false);
    const seq = ++recSeq.current;
    void (async () => {
      try {
        const groups =
          picker.mode === 'replace'
            ? [catalogGroupForMuscle(picker.exercise.muscle)]
            : [...new Set(plan.exercises.map((e) => catalogGroupForMuscle(e.muscle)))];
        let rec = (
          await searchExercises(
            groups.length
              ? { muscleGroups: groups, recommendedOnly: true, limit: 25 }
              : { recommendedOnly: true, limit: 25 },
          )
        ).exercises;
        // Recommended pool dry for this muscle → best same-group picks instead.
        if (rec.length === 0 && groups.length) {
          rec = (await searchExercises({ muscleGroups: groups, limit: 15 })).exercises;
        }
        if (seq !== recSeq.current) return;
        setRecList(rec);
      } catch {
        if (seq !== recSeq.current) return;
        setCatalogOffline(true);
      }
    })();
    // The day's plan is snapshotted at open; a mid-open store change is fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker]);

  // Full list: debounced on the search query.
  useEffect(() => {
    if (!picker || catalogOffline) return;
    const seq = ++allSeq.current;
    const q = query.trim();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await searchExercises({
            searchQuery: q.length > 0 ? q : undefined,
            limit: 60,
          });
          if (seq !== allSeq.current) return;
          setAllList(res.exercises);
        } catch {
          if (seq !== allSeq.current) return;
          setCatalogOffline(true);
        }
      })();
    }, q.length > 0 ? 250 : 0);
    return () => clearTimeout(timer);
  }, [picker, query, catalogOffline]);

  const targetMuscle: PrototypeMuscle | null =
    picker?.mode === 'replace' ? picker.exercise.muscle : null;

  /** Exclude what's already in the day; recommended first, then the target
   *  muscle, then name — "recommended workouts at the top of the list". */
  const rankCatalog = (rows: CatalogExercise[], limit?: number): CatalogExercise[] => {
    const usable = rows.filter((r) => !dayNamesLower.has(r.name.toLowerCase()));
    usable.sort((a, b) => {
      const rec = Number(b.recommended === true) - Number(a.recommended === true);
      if (rec !== 0) return rec;
      if (targetMuscle) {
        const am = muscleFromCatalog(a.primaryMuscleGroup, a.subMuscles, a.name);
        const bm = muscleFromCatalog(b.primaryMuscleGroup, b.subMuscles, b.name);
        const tm = Number(bm === targetMuscle) - Number(am === targetMuscle);
        if (tm !== 0) return tm;
      }
      return a.name.localeCompare(b.name);
    });
    return limit != null ? usable.slice(0, limit) : usable;
  };

  const catalogRecommended = recList != null ? rankCatalog(recList, 3) : null;
  const catalogAll = allList != null ? rankCatalog(allList) : null;

  // ---- Offline fallback: the sample library (previous behaviour) ----
  const mockRecommended = useMemo(() => {
    if (!picker) return [];
    if (picker.mode === 'replace') {
      return recommendReplacements(picker.exercise.muscle, dayNamesLower);
    }
    const seed = plan.exercises[0]?.muscle;
    if (seed) return recommendReplacements(seed, dayNamesLower);
    return EXERCISE_LIBRARY.filter((e) => !dayNamesLower.has(e.name.toLowerCase())).slice(0, 3);
  }, [picker, dayNamesLower, plan]);
  const mockAll = useMemo(
    () =>
      EXERCISE_LIBRARY.filter(
        (e) =>
          !dayNamesLower.has(e.name.toLowerCase()) &&
          (query.trim() === '' ||
            `${e.name} ${e.muscle}`.toLowerCase().includes(query.trim().toLowerCase())),
      ),
    [dayNamesLower, query],
  );

  const closePicker = () => {
    setPicker(null);
    setQuery('');
    // Invalidate any in-flight fetches.
    recSeq.current += 1;
    allSeq.current += 1;
  };

  const applyPlanned = (exercise: PlannedExercise) => {
    if (!picker) return;
    if (picker.mode === 'replace') replaceExercise(dateIso, picker.index, exercise);
    else addExerciseToDay(dateIso, exercise);
    closePicker();
  };

  const applyCatalogPick = (row: CatalogExercise) => {
    if (!picker) return;
    applyPlanned(
      plannedExerciseFromCatalog(row, picker.mode === 'replace' ? picker.exercise : null),
    );
  };

  const pickerVerb = picker?.mode === 'add' ? 'Add' : 'Replace with';

  const renderCatalogRow = (row: CatalogExercise, i: number, pinned: boolean) => {
    const muscle = muscleFromCatalog(row.primaryMuscleGroup, row.subMuscles, row.name);
    return (
      <TouchableOpacity
        key={row.id}
        style={[styles.pickerRow, i > 0 && styles.rowDivider]}
        activeOpacity={0.8}
        onPress={() => applyCatalogPick(row)}
        accessibilityRole="button"
        accessibilityLabel={`${pickerVerb} ${row.name}`}
      >
        <View
          style={[
            styles.pickerDot,
            { backgroundColor: MUSCLE_COLORS[muscle], borderColor: MUSCLE_EDGE[muscle] },
          ]}
        />
        <View style={styles.pickerRowText}>
          <Text style={styles.pickerRowName}>{row.name}</Text>
          <Text style={styles.pickerRowMuscle}>{muscle}</Text>
        </View>
        {pinned || row.recommended ? (
          <Ionicons name="sparkles" size={15} color={GOLD} />
        ) : (
          <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} />
        )}
      </TouchableOpacity>
    );
  };

  const renderMockRow = (ex: PlannedExercise, i: number, pinned: boolean) => (
    <TouchableOpacity
      key={ex.name}
      style={[styles.pickerRow, i > 0 && styles.rowDivider]}
      activeOpacity={0.8}
      onPress={() => applyPlanned(ex)}
      accessibilityRole="button"
      accessibilityLabel={`${pickerVerb} ${ex.name}`}
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
      {pinned ? (
        <Ionicons name="sparkles" size={15} color={GOLD} />
      ) : (
        <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} />
      )}
    </TouchableOpacity>
  );

  const loadingRow = (
    <View style={styles.pickerRow}>
      <ActivityIndicator size="small" color={colors.primary} />
      <Text style={styles.pickerRowMuscle}>Loading exercises…</Text>
    </View>
  );

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

      <TouchableOpacity
        style={styles.addRow}
        activeOpacity={0.8}
        onPress={() => setPicker({ mode: 'add' })}
        accessibilityRole="button"
        accessibilityLabel="Add exercise"
      >
        <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
        <Text style={styles.addRowLabel}>Add Exercise</Text>
      </TouchableOpacity>

      {plan.exercises.length > 0 && (
        <Text style={styles.hint}>Hold an exercise to replace it</Text>
      )}
      {calendarDataMode() === 'sample' && (
        <Text style={styles.footerNote}>Prototype · Sample plan data</Text>
      )}

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
                  if (menuFor) {
                    setPicker({ mode: 'replace', index: menuFor.index, exercise: menuFor.exercise });
                  }
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

      {/* ---- Replace/Add pop-up (the exercises tab, recommendations pinned) ---- */}
      <Modal
        visible={picker !== null}
        animationType="slide"
        onRequestClose={closePicker}
      >
        <View style={[styles.pickerRoot, { paddingTop: insets.top + spacing.md }]}>
          <View style={styles.pickerHeader}>
            <TouchableOpacity
              onPress={closePicker}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Close picker"
            >
              <Ionicons name="close" size={26} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.pickerTitle}>
              {picker?.mode === 'add' ? 'Add Exercise' : 'Replace Exercise'}
            </Text>
            <View style={styles.pickerHeaderSpacer} />
          </View>
          <Text style={styles.pickerLede} numberOfLines={1}>
            {picker?.mode === 'add'
              ? `Adding to ${plan.title}`
              : `Swapping out ${picker?.exercise.name ?? ''}`}
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
            {catalogOffline ? (
              <>
                {mockRecommended.length > 0 && (
                  <>
                    <Text style={styles.sectionLabel}>RECOMMENDED</Text>
                    <View style={styles.groupCard}>
                      {mockRecommended.map((ex, i) => renderMockRow(ex, i, true))}
                    </View>
                  </>
                )}
                <Text style={styles.sectionLabel}>ALL EXERCISES</Text>
                <View style={styles.groupCard}>
                  {mockAll.map((ex, i) => renderMockRow(ex, i, false))}
                  {mockAll.length === 0 && (
                    <View style={styles.pickerRow}>
                      <Text style={styles.pickerRowMuscle}>
                        No exercises match “{query}”.
                      </Text>
                    </View>
                  )}
                </View>
              </>
            ) : (
              <>
                {(catalogRecommended == null || catalogRecommended.length > 0) && (
                  <>
                    <Text style={styles.sectionLabel}>RECOMMENDED</Text>
                    <View style={styles.groupCard}>
                      {catalogRecommended == null
                        ? loadingRow
                        : catalogRecommended.map((row, i) => renderCatalogRow(row, i, true))}
                    </View>
                  </>
                )}
                <Text style={styles.sectionLabel}>ALL EXERCISES</Text>
                <View style={styles.groupCard}>
                  {catalogAll == null
                    ? loadingRow
                    : catalogAll.map((row, i) => renderCatalogRow(row, i, false))}
                  {catalogAll != null && catalogAll.length === 0 && (
                    <View style={styles.pickerRow}>
                      <Text style={styles.pickerRowMuscle}>
                        {query.trim()
                          ? `No exercises match “${query.trim()}”.`
                          : 'No exercises available.'}
                      </Text>
                    </View>
                  )}
                </View>
              </>
            )}
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
    addRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      borderStyle: 'dashed',
      paddingVertical: spacing.lg,
    },
    addRowLabel: {
      ...sfPro,
      fontSize: text.callout,
      fontWeight: weight.semibold,
      color: c.primary,
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

    // Replace/Add pop-up
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
