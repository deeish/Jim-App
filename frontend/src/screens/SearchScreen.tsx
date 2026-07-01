import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  TextInput,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
  ActivityIndicator,
  Alert,
  BackHandler,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { useTheme } from '../theme/ThemeContext';
import type { ColorPalette } from '../theme/colors';
import Button from '../components/Button';
import { searchExercises, Exercise, getSavedExerciseIds, getSavedExercises, saveExercise, unsaveExercise } from '../services/exerciseService';
import ExerciseGroupCard from '../components/ExerciseGroupCard';
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
import { EQUIPMENT_OPTIONS } from '../constants/equipment';
import { useUserPreferences } from '../contexts/UserPreferencesContext';

type SearchScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Search'>;
type SearchScreenRouteProp = RouteProp<RootStackParamList, 'Search'>;

type Props = {
  navigation: SearchScreenNavigationProp;
};

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Muscle group hierarchy - parent groups with their sub-muscles (chip order = object insertion order)
const MUSCLE_HIERARCHY: Record<string, string[]> = {
  'Chest': ['Upper Chest', 'Mid Chest', 'Lower Chest'],
  'Back': ['Upper Back', 'Mid Back', 'Lower Back', 'Lats', 'Traps'],
  'Legs': ['Quads', 'Hamstrings', 'Glutes', 'Calves', 'Inner Thighs', 'Outer Thighs'],
  'Shoulders': ['Front Delts', 'Side Delts', 'Rear Delts', 'Rotator Cuff'],
  'Arms': ['Biceps', 'Triceps', 'Forearms'],
  /** Conditioning / machines / running / cycling — primaryMuscleGroup "Cardio" in API. Parent-only chip. */
  'Cardio': [],
  'Core': ['Upper Abs', 'Lower Abs', 'Obliques'],
};

// Main muscle groups (parent categories)
const MAIN_MUSCLE_GROUPS = Object.keys(MUSCLE_HIERARCHY);

// Get all sub-muscles for a given parent
const getSubMuscles = (parent: string): string[] => {
  return MUSCLE_HIERARCHY[parent] || [];
};

// Get all sub-muscles across all parents
const getAllSubMuscles = (): string[] => {
  return Object.values(MUSCLE_HIERARCHY).flat();
};

// Advanced/optional filters - collapsed by default
const MOVEMENT_PATTERNS = [
  'Push', 'Pull', 'Squat', 'Hinge', 'Lunge', 'Carry'
];

// With no text and no chips the page browses the whole catalog (popular first).
// Capped so the response stays a reasonable size — the catalog has 5000+ rows.
const BROWSE_ALL_LIMIT = 300;


interface FilterState {
  searchQuery: string;
  muscleGroups: string[]; // Parent groups (Chest, Back, etc.)
  subMuscles: string[]; // Specific muscles (Upper Chest, Lower Chest, etc.)
  equipment: string[];
  movementPatterns: string[];
}

// ——— Filter chip UI, hoisted to module scope ———
// These were defined inside SearchScreen, so every render created brand-new
// component types and React fully remounted each chip row (losing horizontal
// scroll position on every keystroke). Module scope keeps the tree stable;
// the screen's themed styles come in as props.

type ChipStyles = {
  chip: StyleProp<ViewStyle>;
  chipSelected: StyleProp<ViewStyle>;
  chipPartial: StyleProp<ViewStyle>;
  chipText: StyleProp<TextStyle>;
  chipTextSelected: StyleProp<TextStyle>;
  chipCount: StyleProp<TextStyle>;
  chipCountSelected: StyleProp<TextStyle>;
};

type SectionStyles = ChipStyles & {
  section: StyleProp<ViewStyle>;
  sectionHeader: StyleProp<ViewStyle>;
  sectionTitle: StyleProp<TextStyle>;
  sectionBadge: StyleProp<ViewStyle>;
  sectionBadgeText: StyleProp<TextStyle>;
  sectionDescription: StyleProp<TextStyle>;
  chipsContainer: StyleProp<ViewStyle>;
};

type RefineStyles = ChipStyles & {
  refineSection: StyleProp<ViewStyle>;
  refineHeader: StyleProp<ViewStyle>;
  refineTitle: StyleProp<TextStyle>;
  refineSubtitle: StyleProp<TextStyle>;
  chipsContainer: StyleProp<ViewStyle>;
};

const Chip = React.memo(function Chip({
  label,
  isSelected,
  onPress,
  selectionState,
  count,
  styles,
}: {
  label: string;
  isSelected: boolean;
  onPress: () => void;
  selectionState?: 'none' | 'partial' | 'full';
  count?: string;
  styles: ChipStyles;
}) {
  const showPartial = selectionState === 'partial';
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        isSelected && styles.chipSelected,
        showPartial && styles.chipPartial,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${label} filter${isSelected ? ', selected' : ''}`}
      accessibilityState={{ selected: isSelected }}
    >
      <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
        {label}
      </Text>
      {count && (
        <Text style={[styles.chipCount, isSelected && styles.chipCountSelected]}>
          {count}
        </Text>
      )}
      {isSelected && !showPartial && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
      {showPartial && <Ionicons name="remove" size={14} color="#FFFFFF" />}
    </TouchableOpacity>
  );
});

const ActiveFilterChip = React.memo(function ActiveFilterChip({
  label,
  onRemove,
  styles,
  colors,
}: {
  label: string;
  onRemove: () => void;
  styles: { activeFilterChip: StyleProp<ViewStyle>; activeFilterText: StyleProp<TextStyle> };
  colors: ColorPalette;
}) {
  return (
    <View style={styles.activeFilterChip}>
      <Text style={styles.activeFilterText}>{label}</Text>
      <TouchableOpacity
        onPress={onRemove}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${label} filter`}
      >
        <Ionicons name="close-circle" size={16} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
});

const FilterSection = React.memo(function FilterSection({
  title,
  options,
  selectedValues,
  onSelect,
  description,
  styles,
}: {
  title?: string;
  options: string[];
  selectedValues: string[];
  onSelect: (value: string) => void;
  description?: string;
  styles: SectionStyles;
}) {
  return (
    <View style={styles.section}>
      {title ? (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {selectedValues.length > 0 && (
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>{selectedValues.length}</Text>
            </View>
          )}
        </View>
      ) : null}
      {description && (
        <Text style={styles.sectionDescription}>{description}</Text>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsContainer}
      >
        {options.map((option) => (
          <Chip
            key={option}
            label={option}
            isSelected={selectedValues.includes(option)}
            onPress={() => onSelect(option)}
            styles={styles}
          />
        ))}
      </ScrollView>
    </View>
  );
});

// Refine section for sub-muscles when a parent is selected
const RefineSection = React.memo(function RefineSection({
  parentGroup,
  subMuscles,
  selectedSubMuscles,
  onToggleSubMuscle,
  styles,
}: {
  parentGroup: string;
  subMuscles: string[];
  selectedSubMuscles: string[];
  onToggleSubMuscle: (subMuscle: string) => void;
  styles: RefineStyles;
}) {
  const selectedCount = selectedSubMuscles.length;
  const totalCount = subMuscles.length;

  return (
    <View style={styles.refineSection}>
      <View style={styles.refineHeader}>
        <Text style={styles.refineTitle}>Refine {parentGroup}</Text>
        <Text style={styles.refineSubtitle}>
          {selectedCount === 0
            ? `All ${parentGroup.toLowerCase()} · tap to narrow`
            : `Narrowed to ${selectedCount} of ${totalCount}`}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsContainer}
      >
        {subMuscles.map((subMuscle) => (
          <Chip
            key={subMuscle}
            label={subMuscle}
            isSelected={selectedSubMuscles.includes(subMuscle)}
            onPress={() => onToggleSubMuscle(subMuscle)}
            styles={styles}
          />
        ))}
      </ScrollView>
    </View>
  );
});

export default function SearchScreen({ navigation }: Props) {
  const route = useRoute<SearchScreenRouteProp>();
  const addToPlan = route.params?.addToPlan;
  const addToWorkout = route.params?.addToWorkout;
  const addMode = addToPlan ? 'plan' : addToWorkout ? 'workout' : null;
  const { colors } = useTheme();
  const { hydrated: prefsHydrated, equipment: profileEquipment } = useUserPreferences();
  const [filters, setFilters] = useState<FilterState>({
    searchQuery: '',
    muscleGroups: [],
    subMuscles: [],
    equipment: [],
    movementPatterns: [],
  });

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  // Equipment is a set-once preference (usually pre-filled from onboarding), so it
  // starts collapsed to de-clutter the top of the screen. One tap to expand.
  const [showEquipment, setShowEquipment] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [exerciseGroups, setExerciseGroups] = useState<ExerciseGroup[]>([]);
  // Total matches on the server; exceeds exercises.length when browse mode capped the list.
  const [totalMatchCount, setTotalMatchCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addingToPlan, setAddingToPlan] = useState(false);
  const [savedExerciseIds, setSavedExerciseIds] = useState<string[]>([]);
  // Ids with an in-flight save/unsave request. A ref (not state) so guarding
  // against a double-fire doesn't re-render the row and drop the next tap.
  const inFlightLikeIds = useRef<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'all' | 'saved'>('all');
  const [savedExercisesList, setSavedExercisesList] = useState<Exercise[]>([]);
  const [loadingSavedList, setLoadingSavedList] = useState(false);

  // Seed equipment filter from profile once preferences load (only if user hasn’t set filters yet)
  useEffect(() => {
    if (!prefsHydrated || profileEquipment.length === 0) return;
    setFilters((prev) => {
      if (prev.equipment.length > 0) return prev;
      return { ...prev, equipment: [...profileEquipment] };
    });
  }, [prefsHydrated, profileEquipment]);

  // Load saved exercise ids on mount
  useEffect(() => {
    let cancelled = false;
    getSavedExerciseIds()
      .then((ids) => {
        if (!cancelled) {
          if (__DEV__) console.log('[SearchScreen] initial savedExerciseIds', ids?.length ?? 0, ids);
          setSavedExerciseIds(ids ?? []);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          if (__DEV__) console.warn('[SearchScreen] initial getSavedExerciseIds failed', e);
          setSavedExerciseIds([]);
        }
      });
    return () => { cancelled = true; };
  }, []);

  // Refetch saved ids when screen gains focus (e.g. back from detail) so hearts stay in sync
  useFocusEffect(
    useCallback(() => {
      getSavedExerciseIds()
        .then((ids) => {
          if (__DEV__) console.log('[SearchScreen] focus: refreshed savedExerciseIds', ids?.length ?? 0);
          setSavedExerciseIds(ids ?? []);
        })
        .catch((e) => {
          if (__DEV__) console.warn('[SearchScreen] focus: getSavedExerciseIds failed', e);
        });
    }, [])
  );

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

  // Fetch full saved exercises whenever the Saved tab is opened
  const loadSavedList = useCallback(async () => {
    setLoadingSavedList(true);
    try {
      const list = await getSavedExercises();
      setSavedExercisesList(list);
    } catch (e) {
      console.warn('[SearchScreen] getSavedExercises failed:', e);
      setSavedExercisesList([]);
    } finally {
      setLoadingSavedList(false);
    }
  }, []);

  const switchTab = useCallback(
    (tab: 'all' | 'saved') => {
      if (tab === 'saved') loadSavedList();
      setActiveTab(tab);
    },
    [loadSavedList],
  );

  const handleToggleExerciseLike = useCallback(async (exerciseId: string) => {
    // Ignore taps while this exercise's request is in flight; the heart has
    // already flipped optimistically, so there's nothing more to do until it
    // settles.
    if (inFlightLikeIds.current.has(exerciseId)) return;
    inFlightLikeIds.current.add(exerciseId);

    const wasSaved = savedExerciseIds.includes(exerciseId);
    const removed = wasSaved ? savedExercisesList.find((e) => e.id === exerciseId) : undefined;

    // Optimistic update so the heart responds to the very first tap.
    setSavedExerciseIds((prev) =>
      wasSaved
        ? prev.filter((id) => id !== exerciseId)
        : prev.includes(exerciseId)
          ? prev
          : [...prev, exerciseId],
    );
    if (wasSaved) setSavedExercisesList((prev) => prev.filter((e) => e.id !== exerciseId));

    try {
      if (wasSaved) await unsaveExercise(exerciseId);
      else await saveExercise(exerciseId);
    } catch (e) {
      if (__DEV__) console.warn('[SearchScreen] handleToggleExerciseLike failed', exerciseId, e);
      // Revert the optimistic change so the UI matches the server.
      setSavedExerciseIds((prev) =>
        wasSaved
          ? prev.includes(exerciseId)
            ? prev
            : [...prev, exerciseId]
          : prev.filter((id) => id !== exerciseId),
      );
      if (removed) {
        setSavedExercisesList((prev) => (prev.some((e) => e.id === removed.id) ? prev : [...prev, removed]));
      }
    } finally {
      inFlightLikeIds.current.delete(exerciseId);
    }
  }, [savedExerciseIds, savedExercisesList]);

  // Toggle a main muscle group (parent). Selecting adds the parent only, which searches the
  // whole group (the backend ANDs primaryMuscleGroup with any sub-muscle narrowing). Sub-muscles
  // start unselected and act as optional "narrow to" filters in the Refine section below.
  const toggleMuscleGroup = (group: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFilters(prev => {
      const isActive = prev.muscleGroups.includes(group);
      const subMuscles = getSubMuscles(group);

      if (isActive) {
        // Deselecting the group: remove the parent and any of its narrowing sub-muscles.
        return {
          ...prev,
          muscleGroups: prev.muscleGroups.filter(g => g !== group),
          subMuscles: prev.subMuscles.filter(m => !subMuscles.includes(m)),
        };
      }
      // Selecting the group: add the parent only (shows every exercise in the group).
      return {
        ...prev,
        muscleGroups: [...prev.muscleGroups, group],
      };
    });
  };

  // Toggle a specific sub-muscle as a "narrow to" filter within an already-selected group.
  // The parent stays selected; sub-muscles only narrow the results (the backend ANDs them with
  // the parent's primaryMuscleGroup). Removing the last sub-muscle reverts to the whole group.
  const toggleSubMuscle = (subMuscle: string, parentGroup: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFilters(prev => {
      const isSelected = prev.subMuscles.includes(subMuscle);
      if (isSelected) {
        // Remove this narrowing sub-muscle; the parent group stays selected.
        return {
          ...prev,
          subMuscles: prev.subMuscles.filter(m => m !== subMuscle),
        };
      }
      // Add this narrowing sub-muscle; make sure the parent group is selected.
      return {
        ...prev,
        subMuscles: [...prev.subMuscles, subMuscle],
        muscleGroups: prev.muscleGroups.includes(parentGroup)
          ? prev.muscleGroups
          : [...prev.muscleGroups, parentGroup],
      };
    });
  };

  // Toggle equipment or movement patterns (unchanged)
  const toggleFilter = (category: 'equipment' | 'movementPatterns', value: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFilters(prev => {
      const currentArray = prev[category];
      const isSelected = currentArray.includes(value);
      return {
        ...prev,
        [category]: isSelected
          ? currentArray.filter(v => v !== value)
          : [...currentArray, value],
      };
    });
  };

  // Selection state for a parent chip:
  //  - 'full'    → group selected with no narrowing (showing every exercise in the group)
  //  - 'partial' → group selected and narrowed to specific sub-muscles
  //  - 'none'    → not selected
  const getMuscleGroupState = (group: string): 'none' | 'partial' | 'full' => {
    const subMuscles = getSubMuscles(group);

    if (subMuscles.length === 0) {
      // Parent-only group (e.g. Cardio).
      return filters.muscleGroups.includes(group) ? 'full' : 'none';
    }

    const selectedSubMuscles = filters.subMuscles.filter(m => subMuscles.includes(m));
    if (selectedSubMuscles.length > 0) return 'partial';
    return filters.muscleGroups.includes(group) ? 'full' : 'none';
  };

  const resetFilters = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFilters({
      searchQuery: '',
      muscleGroups: [],
      subMuscles: [],
      // Restore the user's default equipment (seeded from their profile) rather
      // than clearing it — this matches the page's initial state, so Reset
      // returns to "my gear" instead of stripping past it to show exercises for
      // equipment they don't own.
      equipment: [...profileEquipment],
      movementPatterns: [],
    });
  };

  const getActiveFilterCount = () => {
    // Each active group and each narrowing sub-muscle is one chip in the active-filter row.
    return (
      filters.muscleGroups.length +
      filters.subMuscles.length +
      filters.equipment.length +
      filters.movementPatterns.length
    );
  };

  // Search exercises when filters change
  const performSearch = useCallback(async (currentFilters: FilterState) => {
    const activeCount = 
      currentFilters.muscleGroups.length +
      currentFilters.subMuscles.length +
      currentFilters.equipment.length +
      currentFilters.movementPatterns.length;
    const hasSearch = currentFilters.searchQuery.trim().length > 0;

    setIsLoading(true);
    setError(null);

    try {
      // When the user types, search the whole catalog by text alone — chip filters
      // (especially the profile-seeded equipment) must never silently hide a name
      // match. Chips only narrow when browsing without a search term. With no text
      // and no chips at all, browse the whole catalog (popular first, capped) so
      // the page is never blank.
      const searchParams = hasSearch
        ? { searchQuery: currentFilters.searchQuery.trim() }
        : activeCount === 0
          ? { limit: BROWSE_ALL_LIMIT }
          : {
              muscleGroups: currentFilters.muscleGroups.length > 0 ? currentFilters.muscleGroups : undefined,
              subMuscles: currentFilters.subMuscles.length > 0 ? currentFilters.subMuscles : undefined,
              equipment: currentFilters.equipment.length > 0 ? currentFilters.equipment : undefined,
              movementPatterns: currentFilters.movementPatterns.length > 0 ? currentFilters.movementPatterns : undefined,
            };

      const response = await searchExercises(searchParams);
      setTotalMatchCount(response.count ?? response.exercises.length);
      setExercises(response.exercises);
      // Flat, relevance-ranked list while searching (so the exact variant you typed
      // is visible, not buried under "Show variations"); grouped families when browsing.
      const grouped = hasSearch
        ? response.exercises.map((e) => ({ baseName: e.name, exercises: [e], primaryExercise: e }))
        : groupExercises(response.exercises);
      setExerciseGroups(grouped);
    } catch (err: any) {
      console.error('Error searching exercises:', err);
      setError(err.message || 'Failed to search exercises');
      setExercises([]);
      setExerciseGroups([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Re-search on ANY filter change (text or chips). Keying on the whole `filters`
  // object means tapping a chip after typing always refreshes results (the old
  // split effects dropped that case), and `filters` is always current (no stale
  // closure). Debounce only while typing.
  useEffect(() => {
    // Wait for preferences so the first fetch runs once with the profile-seeded
    // equipment (the seed effect rewrites `filters` right after hydration, which
    // cancels this timeout before an unseeded browse request can fire).
    if (!prefsHydrated) return;
    const hasText = filters.searchQuery.trim().length > 0;
    const timeout = setTimeout(() => performSearch(filters), hasText ? 250 : 0);
    return () => clearTimeout(timeout);
  }, [filters, performSearch, prefsHydrated]);

  const resultCount = exerciseGroups.length > 0 ? exerciseGroups.length : exercises.length;
  const activeFilterCount = getActiveFilterCount();
  // No chips and no text: the list is the capped, popularity-sorted whole catalog.
  const isBrowsingAll = activeFilterCount === 0 && filters.searchQuery.trim().length === 0;

  // Get all active filters for display
  const getActiveFilters = () => {
    const active: Array<{ label: string; category: string; value: string; isParent?: boolean }> = [];
    
    // Selected parent groups (each searches the whole group unless narrowed by sub-muscles below).
    filters.muscleGroups.forEach(g => {
      active.push({ label: g, category: 'muscleGroups', value: g, isParent: true });
    });

    // Narrowing sub-muscles, shown alongside their parent group.
    filters.subMuscles.forEach(m => {
      active.push({ label: m, category: 'subMuscles', value: m });
    });

    filters.equipment.forEach(e => active.push({ label: e, category: 'equipment', value: e }));
    filters.movementPatterns.forEach(p => active.push({ label: p, category: 'movementPatterns', value: p }));
    
    return active;
  };

  const removeFilter = (category: string, value: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFilters(prev => {
      const updated = { ...prev };
      if (category === 'muscleGroups') {
        // Remove parent and all its children
        const subMuscles = getSubMuscles(value);
        updated.muscleGroups = prev.muscleGroups.filter(v => v !== value);
        updated.subMuscles = prev.subMuscles.filter(m => !subMuscles.includes(m));
      } else if (category === 'subMuscles') {
        // Remove just this narrowing sub-muscle; the parent group stays selected.
        updated.subMuscles = prev.subMuscles.filter(v => v !== value);
      } else if (category === 'equipment') {
        updated.equipment = prev.equipment.filter(v => v !== value);
      } else if (category === 'movementPatterns') {
        updated.movementPatterns = prev.movementPatterns.filter(v => v !== value);
      }
      return updated;
    });
  };

  const toggleSelectForAddToPlan = useCallback((exerciseId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(exerciseId)) next.delete(exerciseId);
      else next.add(exerciseId);
      return next;
    });
  }, []);

  /** Derive a short workout title from selected exercises' primary muscle groups (e.g. "Chest & Triceps"). */
  const deriveWorkoutTitle = useCallback((selected: Exercise[]): string => {
    const groups = [...new Set(selected.map(e => e.primaryMuscleGroup).filter(Boolean))];
    if (groups.length === 0) return 'Custom';
    if (groups.length === 1) return groups[0];
    return groups.slice(0, 3).join(' & ');
  }, []);

  // Saved tab data, grouped the same way as search results.
  const savedGroups = useMemo(() => groupExercises(savedExercisesList), [savedExercisesList]);

  // Render a single exercise card for the virtualized results FlatList. The list used to
  // be a non-virtualized ScrollView that mounted every card (~hundreds) at once, which
  // caused multi-second jank on broad filters. The FlatList now renders only the cards
  // near the viewport and recycles the rest.
  const renderExerciseCard = useCallback(
    ({ item: group }: { item: ExerciseGroup }) => {
      const isAnyInGroupSelected = group.exercises.some((e) => selectedIds.has(e.id));
      const existingIds = addToWorkout?.existingExerciseIds ?? [];
      const isAlreadyInWorkout =
        existingIds.length > 0 && group.exercises.some((e) => existingIds.includes(e.id));
      return (
        <ExerciseGroupCard
          group={group}
          isSelected={addMode ? isAnyInGroupSelected : undefined}
          isDisabled={isAlreadyInWorkout}
          saved={savedExerciseIds.includes(group.primaryExercise.id)}
          onLikePress={() => handleToggleExerciseLike(group.primaryExercise.id)}
          onPress={(exercise) => {
            if (addMode) toggleSelectForAddToPlan(exercise.id);
            else navigation.navigate('ExerciseDetail', { exerciseId: exercise.id });
          }}
          onPressVariation={(exercise) => {
            if (addMode) toggleSelectForAddToPlan(exercise.id);
            else navigation.navigate('ExerciseDetail', { exerciseId: exercise.id });
          }}
          onPressInfo={(exercise) =>
            navigation.navigate('ExerciseDetail', { exerciseId: exercise.id })
          }
        />
      );
    },
    [
      selectedIds,
      addMode,
      addToWorkout,
      savedExerciseIds,
      handleToggleExerciseLike,
      toggleSelectForAddToPlan,
      navigation,
    ],
  );

  const submitAddToPlan = useCallback(async () => {
    if (!addToPlan || selectedIds.size === 0) return;
    const { day, weekIndex, weekMondayIso: weekMondayParam } = addToPlan;
    const weekMondayIso =
      weekMondayParam ?? formatLocalYmd(getCalendarWeekRange(weekIndex).start);

    const selectedExercises = exercises.filter(e => selectedIds.has(e.id));
    if (selectedExercises.length === 0) {
      Alert.alert('No exercises', 'Selected exercises could not be found. Try searching again and reselect.');
      return;
    }

    const workoutExercises = selectedExercises.map((e, i) => ({
      name: e.name,
      sets: 3,
      reps: 10,
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
          'This calendar week is before your program start. Use the week arrows on Plan to pick a later week.',
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

      setSelectedIds(new Set());
      const tabNav = (navigation as any)?.getParent?.();
      if (tabNav) tabNav.navigate('Plan');
      const successMsg =
        anchorYmd != null
          ? `Added ${selectedExercises.length} exercise(s) to ${day} for this calendar week.`
          : weekNumber === 1
            ? `Added ${selectedExercises.length} exercise(s) to ${day}.`
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
  }, [addToPlan, exercises, selectedIds, navigation, deriveWorkoutTitle]);

  const submitAddToWorkout = useCallback(async () => {
    if (!addToWorkout || selectedIds.size === 0) return;
    const selectedExercises = exercises.filter(e => selectedIds.has(e.id));
    if (selectedExercises.length === 0) {
      Alert.alert('No exercises', 'Selected exercises could not be found. Try searching again and reselect.');
      return;
    }

    const newExercises = selectedExercises.map((e, i) => ({
      name: e.name,
      sets: 3,
      reps: 10,
      exerciseId: e.id,
      orderIndex: i,
    }));

    setAddingToPlan(true);
    try {
      const workout = await getWorkoutById(addToWorkout.workoutId);
      const existingExercises = (workout.exercises || []).map((ex, idx) => ({
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        weight: ex.weight,
        notes: ex.notes,
        exerciseId: ex.exerciseId,
        orderIndex: idx,
      }));
      const merged = [
        ...existingExercises,
        ...newExercises.map((e, i) => ({ ...e, orderIndex: existingExercises.length + i })),
      ];
      await updateWorkout(addToWorkout.workoutId, { exercises: merged });

      setSelectedIds(new Set());
      navigation.setParams({ addToWorkout: undefined });
      const tabNav = (navigation as any)?.getParent?.();
      if (tabNav) tabNav.navigate('Workout', { workoutId: addToWorkout.workoutId });
      Alert.alert('Done', `Added ${selectedExercises.length} exercise(s) to ${addToWorkout.workoutName}.`);
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
  }, [addToWorkout, exercises, selectedIds, navigation]);

  const activeFilters = getActiveFilters();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        header: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 16,
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
        headerTitle: { fontSize: 28, fontWeight: 'bold', color: colors.text },
        filterBadge: {
          backgroundColor: colors.primary,
          borderRadius: 12,
          minWidth: 24,
          height: 24,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 8,
        },
        filterBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
        resetButton: { fontSize: 16, color: colors.primary, fontWeight: '600' },
        resetButtonDisabled: { opacity: 0.4 },
        searchContainer: {
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        searchInputRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: colors.background,
          borderRadius: 12,
          paddingHorizontal: 12,
          borderWidth: 1,
          borderColor: colors.border,
        },
        searchInput: {
          flex: 1,
          paddingVertical: 12,
          fontSize: 16,
          color: colors.text,
        },
        activeFiltersContainer: {
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          paddingVertical: 12,
        },
        activeFiltersScroll: { paddingHorizontal: 16, gap: 8 },
        activeFilterChip: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.primary + '20',
          borderRadius: 20,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderWidth: 1,
          borderColor: colors.primary,
          marginRight: 8,
        },
        activeFilterText: { color: colors.primary, fontSize: 14, fontWeight: '600', marginRight: 6 },
        content: { flex: 1 },
        contentContainer: { paddingBottom: 100 },
        section: { marginTop: 24, paddingHorizontal: 16 },
        sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
        sectionTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
        sectionBadge: {
          backgroundColor: colors.primary,
          borderRadius: 10,
          minWidth: 20,
          height: 20,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 6,
        },
        sectionBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
        sectionDescription: { fontSize: 14, color: colors.textMuted, marginBottom: 12 },
        chipsContainer: { flexDirection: 'row', gap: 8, paddingRight: 16 },
        chip: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: 20,
          backgroundColor: colors.surface,
          borderWidth: 1.5,
          borderColor: colors.border,
          marginRight: 8,
          gap: 6,
        },
        chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
        chipText: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
        chipTextSelected: { color: '#FFFFFF', fontWeight: '600' },
        chipCount: { fontSize: 11, color: colors.textMuted, fontWeight: '600', marginLeft: 4 },
        chipCountSelected: { color: '#FFFFFF' },
        chipPartial: {
          backgroundColor: colors.primary + '60',
          borderColor: colors.primary,
          borderStyle: 'dashed',
        },
        refineSection: {
          marginTop: 16,
          marginHorizontal: 16,
          padding: 16,
          backgroundColor: colors.surface,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
        },
        refineHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        },
        refineTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
        refineSubtitle: { fontSize: 13, color: colors.textMuted },
        // Tight, uniform rhythm for the collapsible rows (Equipment + Advanced Filters).
        // marginBottom: 0 — the results section's own marginTop spaces it from the list.
        advancedSection: { marginTop: 12, paddingHorizontal: 16, marginBottom: 0 },
        advancedToggle: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 12,
          paddingHorizontal: 16,
          backgroundColor: colors.surface,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          marginBottom: 16,
        },
        advancedToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
        advancedToggleText: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
        advancedBadge: {
          backgroundColor: colors.primary,
          borderRadius: 10,
          minWidth: 20,
          height: 20,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 6,
        },
        advancedBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
        resultsPreview: {
          marginTop: 16,
          marginHorizontal: 16,
          padding: 14,
          backgroundColor: colors.surface,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
        },
        resultsPreviewText: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 4 },
        resultsPreviewHint: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
        bottomBar: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          elevation: 8,
        },
        resultCountContainer: { flex: 1, marginRight: 12 },
        resultCountText: { fontSize: 16, color: colors.textSecondary, fontWeight: '500' },
        viewResultsButtonContainer: { width: 140 },
        viewResultsButton: { paddingVertical: 14 },
        resultsHeader: { paddingHorizontal: 16, paddingBottom: 12 },
        resultsHeaderText: { fontSize: 20, fontWeight: '600', color: colors.text },
        resultsSubtext: { fontSize: 14, fontWeight: '400', color: colors.textMuted },
        addToPlanBanner: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
        },
        addToPlanBannerText: { fontSize: 14, fontWeight: '600', flex: 1 },
        addToPlanCancelText: { fontSize: 15, fontWeight: '600' },
        addToPlanFooter: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 14,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        addToPlanFooterText: { fontSize: 16, fontWeight: '600', color: colors.text },
        addToPlanFooterButton: { minWidth: 160 },
        segmentContainer: {
          paddingHorizontal: 16,
          paddingVertical: 10,
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        segmentRow: {
          flexDirection: 'row',
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
        },
        segmentBtn: {
          flex: 1,
          paddingVertical: 8,
          alignItems: 'center',
          backgroundColor: colors.background,
        },
        segmentBtnActive: { backgroundColor: colors.primary },
        segmentBtnText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
        segmentBtnTextActive: { color: '#FFFFFF' },
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
              setSelectedIds(new Set());
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
          <TouchableOpacity onPress={resetFilters} activeOpacity={0.7}>
            <Text style={[styles.resetButton, activeFilterCount === 0 && styles.resetButtonDisabled]}>
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

      {activeTab === 'saved' ? (
        // Virtualized like the main results list — the saved list can grow unbounded,
        // and a plain .map would re-introduce the mount-everything jank FlatList fixed.
        <FlatList
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          data={savedGroups}
          keyExtractor={(group, index) => `saved-${group.baseName}-${index}`}
          renderItem={renderExerciseCard}
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
      ) : (
        <>
      {/* Search Input */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputRow}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, muscle, or cardio (e.g. treadmill, bike)…"
            placeholderTextColor={colors.textMuted}
            value={filters.searchQuery}
            onChangeText={(text) => setFilters(prev => ({ ...prev, searchQuery: text }))}
            returnKeyType="search"
          />
          {filters.searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setFilters(prev => ({ ...prev, searchQuery: '' }))}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Active Filters */}
      {activeFilters.length > 0 && (
        <View style={styles.activeFiltersContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.activeFiltersScroll}
          >
            {activeFilters.map((filter, index) => (
              <ActiveFilterChip
                key={`${filter.category}-${filter.value}-${index}`}
                label={filter.label}
                onRemove={() => removeFilter(filter.category, filter.value)}
                styles={styles}
                colors={colors}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* Content */}
      <FlatList
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        data={exerciseGroups}
        keyExtractor={(group, index) => `${group.baseName}-${index}`}
        renderItem={renderExerciseCard}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        ListEmptyComponent={
          !isLoading && !error && filters.searchQuery.trim().length > 0 ? (
            <View style={styles.resultsPreview}>
              <Text style={styles.resultsPreviewText}>
                No matches for “{filters.searchQuery.trim()}”
              </Text>
              <Text style={styles.resultsPreviewHint}>Try fewer words or check the spelling</Text>
            </View>
          ) : !isLoading && !error && activeFilterCount > 0 ? (
            <View style={styles.resultsPreview}>
              <Text style={styles.resultsPreviewText}>No exercises found</Text>
              <Text style={styles.resultsPreviewHint}>Try adjusting your filters</Text>
            </View>
          ) : null
        }
        ListHeaderComponent={
          <>
        {/* Primary Filters - Most Important */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Muscles & cardio</Text>
            {(filters.muscleGroups.length > 0 || filters.subMuscles.length > 0) && (
              <View style={styles.sectionBadge}>
                <Text style={styles.sectionBadgeText}>
                  {filters.muscleGroups.length + filters.subMuscles.length}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.sectionDescription}>
            Pick a group, or tap Cardio for treadmills, bikes, rowing, circuits, and conditioning.
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsContainer}
          >
            {MAIN_MUSCLE_GROUPS.map((group) => {
              const state = getMuscleGroupState(group);
              const subMuscles = getSubMuscles(group);
              const selectedSubMuscles = filters.subMuscles.filter(m => subMuscles.includes(m));
              return (
                <Chip
                  key={group}
                  label={group}
                  isSelected={state === 'full'}
                  selectionState={state}
                  count={state === 'partial' ? `${selectedSubMuscles.length}/${subMuscles.length}` : undefined}
                  onPress={() => toggleMuscleGroup(group)}
                  styles={styles}
                />
              );
            })}
          </ScrollView>
        </View>

        {/* Refine Sections - Show when a parent group is selected */}
        {MAIN_MUSCLE_GROUPS.map((group) => {
          const state = getMuscleGroupState(group);
          const subMuscles = getSubMuscles(group);
          const selectedSubMuscles = filters.subMuscles.filter(m => subMuscles.includes(m));
          
          // Show refine section if parent is selected and has sub-muscles (e.g. Cardio is parent-only)
          if (state !== 'none' && subMuscles.length > 0) {
            return (
              <RefineSection
                key={`refine-${group}`}
                parentGroup={group}
                subMuscles={subMuscles}
                selectedSubMuscles={selectedSubMuscles}
                onToggleSubMuscle={(subMuscle) => toggleSubMuscle(subMuscle, group)}
                styles={styles}
              />
            );
          }
          return null;
        })}

        {/* Equipment Available - Collapsed by default (set-once preference) */}
        <View style={styles.advancedSection}>
          <TouchableOpacity
            style={styles.advancedToggle}
            onPress={() => setShowEquipment(!showEquipment)}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <View style={styles.advancedToggleLeft}>
              <Ionicons
                name={showEquipment ? 'chevron-down' : 'chevron-forward'}
                size={16}
                color={colors.textSecondary}
              />
              <Text style={styles.advancedToggleText}>Equipment Available</Text>
            </View>
            <View style={styles.advancedBadge}>
              <Text style={styles.advancedBadgeText}>
                {filters.equipment.length === EQUIPMENT_OPTIONS.length
                  ? 'All'
                  : `${filters.equipment.length}/${EQUIPMENT_OPTIONS.length}`}
              </Text>
            </View>
          </TouchableOpacity>

          {showEquipment && (
            <FilterSection
              options={[...EQUIPMENT_OPTIONS]}
              selectedValues={filters.equipment}
              onSelect={(value) => toggleFilter('equipment', value)}
              description="What equipment do you have access to?"
              styles={styles}
            />
          )}
        </View>

        {/* Advanced Filters - Collapsed by default */}
        <View style={styles.advancedSection}>
          <TouchableOpacity
            style={styles.advancedToggle}
            onPress={() => setShowAdvancedFilters(!showAdvancedFilters)}
            activeOpacity={0.7}
          >
            <View style={styles.advancedToggleLeft}>
              <Ionicons
                name={showAdvancedFilters ? 'chevron-down' : 'chevron-forward'}
                size={16}
                color={colors.textSecondary}
              />
              <Text style={styles.advancedToggleText}>Advanced Filters</Text>
            </View>
            {filters.movementPatterns.length > 0 && (
              <View style={styles.advancedBadge}>
                <Text style={styles.advancedBadgeText}>{filters.movementPatterns.length}</Text>
              </View>
            )}
          </TouchableOpacity>

          {showAdvancedFilters && (
            <FilterSection
              title="Movement Pattern"
              options={MOVEMENT_PATTERNS}
              selectedValues={filters.movementPatterns}
              onSelect={(value) => toggleFilter('movementPatterns', value)}
              description="Filter by exercise movement type (optional)"
              styles={styles}
            />
          )}
        </View>

        {/* Results Preview Area */}
        {isLoading && (
          <View style={styles.resultsPreview}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.resultsPreviewHint}>Searching exercises...</Text>
          </View>
        )}

        {error && (
          <View style={styles.resultsPreview}>
            <Text style={[styles.resultsPreviewText, { color: '#FF6B6B' }]}>
              Error
            </Text>
            <Text style={styles.resultsPreviewHint}>{error}</Text>
          </View>
        )}

        {/* Exercise Results header — cards render below as virtualized FlatList items */}
        {!isLoading && !error && resultCount > 0 && (
          <View style={[styles.resultsHeader, { marginTop: 24 }]}>
            {isBrowsingAll ? (
              <>
                <Text style={styles.resultsHeaderText}>Popular exercises</Text>
                <Text style={styles.resultsSubtext}>
                  {totalMatchCount > exercises.length
                    ? `Showing the top ${exercises.length} of ${totalMatchCount}. Search or filter to see the rest.`
                    : 'Search or filter to narrow the list.'}
                </Text>
              </>
            ) : (
              <Text style={styles.resultsHeaderText}>
                {resultCount} exercise{resultCount !== 1 ? 's' : ''} found
                {exerciseGroups.length > 0 && exercises.length > exerciseGroups.length && (
                  <Text style={styles.resultsSubtext}>
                    {' '}({exercises.length} total including variations)
                  </Text>
                )}
              </Text>
            )}
          </View>
        )}
          </>
        }
      />
        </>
      )}

      {/* Sticky Bottom Bar - Only show when no results or loading (and not viewing saved list) */}
      {(isLoading || resultCount === 0) && !addMode && activeTab === 'all' && (
        <View style={styles.bottomBar}>
          <View style={styles.resultCountContainer}>
            <Text style={styles.resultCountText}>
              {isLoading
                ? 'Searching...'
                : activeFilterCount > 0 || filters.searchQuery.trim().length > 0
                ? 'No exercises match your filters'
                : 'No exercises to show'}
            </Text>
          </View>
          {activeFilterCount > 0 && (
            <View style={styles.viewResultsButtonContainer}>
              <Button
                title="Clear Filters"
                onPress={resetFilters}
                variant="secondary"
                style={styles.viewResultsButton}
              />
            </View>
          )}
        </View>
      )}

      {/* Add to plan / add to workout footer */}
      {addMode && (
        <View style={styles.addToPlanFooter}>
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