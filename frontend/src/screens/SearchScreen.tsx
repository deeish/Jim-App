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
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useFocusEffect, useScrollToTop, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { useTheme } from '../theme/ThemeContext';
import { palette, type ColorPalette } from '../theme/colors';
import Button from '../components/Button';
import { searchExercises, Exercise, getSavedExerciseIds, getSavedExercises, saveExercise, unsaveExercise } from '../services/exerciseService';
import { RECOMMENDED_INFO } from '../constants/recommendedInfo';
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
import { toWorkoutExercisePayloads } from '../lib/workoutExercisePayload';
import { EQUIPMENT_OPTIONS } from '../constants/equipment';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import { buzzSelection } from '../lib/planCalendarPrototype';

import { elevation, elevationUp, radius, spacing, text, weight } from '../theme';
import { useTabBarInset } from '../navigation/useTabBarInset';
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
  'Push', 'Pull', 'Squat', 'Hinge', 'Lunge', 'Carry', 'Core', 'Cardio'
];

// Cap for browse-mode responses (no search text — with or without chips). The
// catalog has 5000+ rows and broad chip selections (e.g. Dumbbell + Bodyweight)
// match thousands; nobody scrolls past 300 popularity-sorted rows, and `count`
// still reports total matches for the "top N of M" subtext. Text search stays
// uncapped: it is relevance-ranked, so a capped name match would be confusing.
const BROWSE_LIMIT = 300;

/** Order-insensitive equality for equipment selections (both are duplicate-free). */
const equipmentSetsEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((item) => b.includes(item));

/**
 * Equipment narrows results only when it's a real subset — all selected (or
 * none) matches everything, so it isn't an active filter and gets no chip.
 * Single definition so the search request and the chip/badge UI can't desync.
 */
const isEquipmentNarrowed = (equipment: string[]) =>
  equipment.length > 0 && equipment.length < EQUIPMENT_OPTIONS.length;


interface FilterState {
  searchQuery: string;
  muscleGroups: string[]; // Parent groups (Chest, Back, etc.)
  subMuscles: string[]; // Specific muscles (Upper Chest, Lower Chest, etc.)
  equipment: string[];
  movementPatterns: string[];
  /** Only the curated staples (rows carrying the Recommended star). */
  recommendedOnly: boolean;
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
  /** Partial chips have a pale fill, so their label/glyph go blue, not white. */
  chipTextPartial: StyleProp<TextStyle>;
  chipTextSelected: StyleProp<TextStyle>;
  chipCount: StyleProp<TextStyle>;
  chipCountSelected: StyleProp<TextStyle>;
};

type ChipRowStyles = {
  chipRowBleed: StyleProp<ViewStyle>;
  chipRowContent: StyleProp<ViewStyle>;
  chipRowFade: StyleProp<ViewStyle>;
  chipRowFadeLeft: StyleProp<ViewStyle>;
  chipRowFadeRight: StyleProp<ViewStyle>;
};

type SectionStyles = ChipStyles & ChipRowStyles & {
  section: StyleProp<ViewStyle>;
  sectionHeader: StyleProp<ViewStyle>;
  sectionTitle: StyleProp<TextStyle>;
  sectionBadge: StyleProp<ViewStyle>;
  sectionBadgeText: StyleProp<TextStyle>;
  sectionDescription: StyleProp<TextStyle>;
};

type RefineStyles = ChipStyles & ChipRowStyles & {
  refineSection: StyleProp<ViewStyle>;
  refineCaption: StyleProp<TextStyle>;
};

// ——— Recommended scope bar ———
// The iOS search "scope bar" (Mail, App Store): an All | ★ Recommended
// segmented control docked under the search field. A scope is a mode the
// control itself always displays, so unlike the chips it never appears as a
// removable token in the active-filter row. Track/thumb geometry mirrors the
// calendar's PlanCalendarScopeBar; module scope for the same
// stable-component-type reason as the chip helpers above.

/** Inset between the segmented track and its sliding thumb. */
const SCOPE_PAD = 2;

type ScopeStyles = {
  scopeTrack: StyleProp<ViewStyle>;
  scopeThumb: StyleProp<ViewStyle>;
  scopeButton: StyleProp<ViewStyle>;
  scopeLabel: StyleProp<TextStyle>;
  scopeLabelActive: StyleProp<TextStyle>;
};

const RecommendedScopeBar = React.memo(function RecommendedScopeBar({
  recommendedOnly,
  onChange,
  styles,
  colors,
}: {
  recommendedOnly: boolean;
  onChange: (next: boolean) => void;
  styles: ScopeStyles;
  colors: ColorPalette;
}) {
  const [trackW, setTrackW] = useState(0);
  const segW = trackW > 0 ? (trackW - SCOPE_PAD * 2) / 2 : 0;
  const thumbX = useRef(new Animated.Value(0)).current;

  // Slide the thumb under the active segment (the mount run is a no-op: the
  // screen always starts on All, so 0 → 0).
  useEffect(() => {
    Animated.timing(thumbX, {
      toValue: recommendedOnly ? segW : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [recommendedOnly, segW, thumbX]);

  return (
    <View style={styles.scopeTrack} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
      {segW > 0 && (
        <Animated.View
          style={[styles.scopeThumb, { width: segW, transform: [{ translateX: thumbX }] }]}
        />
      )}
      <TouchableOpacity
        style={styles.scopeButton}
        onPress={() => onChange(false)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="All exercises"
        accessibilityState={{ selected: !recommendedOnly }}
      >
        <Text style={[styles.scopeLabel, !recommendedOnly && styles.scopeLabelActive]}>All</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.scopeButton}
        onPress={() => onChange(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Recommended only"
        accessibilityState={{ selected: recommendedOnly }}
      >
        <Ionicons
          name={recommendedOnly ? 'star' : 'star-outline'}
          size={13}
          color={recommendedOnly ? colors.primary : colors.textSecondary}
        />
        <Text style={[styles.scopeLabel, recommendedOnly && styles.scopeLabelActive]}>
          Recommended
        </Text>
      </TouchableOpacity>
    </View>
  );
});

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
      <Text
        style={[
          styles.chipText,
          isSelected && styles.chipTextSelected,
          showPartial && styles.chipTextPartial,
        ]}
      >
        {label}
      </Text>
      {count && (
        <Text
          style={[
            styles.chipCount,
            isSelected && styles.chipCountSelected,
            showPartial && styles.chipTextPartial,
          ]}
        >
          {count}
        </Text>
      )}
      {isSelected && !showPartial && (
        <Ionicons name="checkmark" size={14} color={palette.onPrimary} />
      )}
      {showPartial && <Ionicons name="remove" size={14} color={palette.primary} />}
    </TouchableOpacity>
  );
});

// ——— Single-row chip strip with overflow affordances ———
// One row, horizontally scrollable — the iOS App Store / Fitness chip pattern.
// A plain padded scroll row failed here before (it clipped cleanly at the
// margin and read as complete — users never learned Arms/Cardio/Core existed),
// so this row makes the overflow itself visible: it bleeds to the container
// edge so an overflowing chip is cut mid-pill (the "peek"), and a soft fade
// sits on whichever edge still hides chips, disappearing at the ends of the
// scroll range.
const ChipScrollRow = React.memo(function ChipScrollRow({
  children,
  bleedStyle,
  contentStyle,
  fadeColor,
  styles,
}: {
  children: React.ReactNode;
  /** Negative horizontal margin escaping the parent's padding; omit if the row is already full-width. */
  bleedStyle?: StyleProp<ViewStyle>;
  /** Must restore the margin the bleed removed, so chips align with the section title at rest. */
  contentStyle: StyleProp<ViewStyle>;
  /** The color behind the row — fades must blend clipped chips into exactly this. */
  fadeColor: string;
  styles: ChipRowStyles;
}) {
  // Measurements live in a ref (no re-render per scroll frame); only fade
  // visibility flips drive animation.
  const metrics = useRef({ x: 0, viewport: 0, content: 0 });
  const visible = useRef({ start: false, end: false });
  const startFade = useRef(new Animated.Value(0)).current;
  const endFade = useRef(new Animated.Value(0)).current;

  const syncFades = useCallback(() => {
    const { x, viewport, content } = metrics.current;
    const overflow = content - viewport;
    const wantStart = overflow > 1 && x > 4;
    const wantEnd = overflow > 1 && x < overflow - 4;
    if (wantStart !== visible.current.start) {
      visible.current.start = wantStart;
      Animated.timing(startFade, {
        toValue: wantStart ? 1 : 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
    }
    if (wantEnd !== visible.current.end) {
      visible.current.end = wantEnd;
      Animated.timing(endFade, {
        toValue: wantEnd ? 1 : 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
    }
  }, [startFade, endFade]);

  return (
    <View style={bleedStyle}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={contentStyle}
        onLayout={(e) => {
          metrics.current.viewport = e.nativeEvent.layout.width;
          syncFades();
        }}
        onContentSizeChange={(width) => {
          metrics.current.content = width;
          syncFades();
        }}
        onScroll={(e) => {
          metrics.current.x = e.nativeEvent.contentOffset.x;
          syncFades();
        }}
        scrollEventThrottle={16}
      >
        {children}
      </ScrollView>
      <Animated.View
        pointerEvents="none"
        style={[styles.chipRowFade, styles.chipRowFadeLeft, { opacity: startFade }]}
      >
        <LinearGradient
          colors={[fadeColor, fadeColor + '00']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.chipRowFade, styles.chipRowFadeRight, { opacity: endFade }]}
      >
        <LinearGradient
          colors={[fadeColor + '00', fadeColor]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
});

const ActiveFilterChip = React.memo(function ActiveFilterChip({
  label,
  onRemove,
  onPress,
  styles,
  colors,
}: {
  label: string;
  onRemove: () => void;
  /** Tap on the chip body (not the ×) — e.g. jump to the section this chip summarizes. */
  onPress?: () => void;
  styles: { activeFilterChip: StyleProp<ViewStyle>; activeFilterText: StyleProp<TextStyle> };
  colors: ColorPalette;
}) {
  const inner = (
    <>
      <Text style={styles.activeFilterText}>{label}</Text>
      <TouchableOpacity
        onPress={onRemove}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${label} filter`}
      >
        <Ionicons name="close-circle" size={16} color={colors.primary} />
      </TouchableOpacity>
    </>
  );
  if (onPress) {
    return (
      <TouchableOpacity
        style={styles.activeFilterChip}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${label} filter, tap to adjust`}
      >
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={styles.activeFilterChip}>{inner}</View>;
});

const FilterSection = React.memo(function FilterSection({
  title,
  options,
  selectedValues,
  onSelect,
  description,
  badgeText,
  fadeColor,
  styles,
}: {
  title?: string;
  options: string[];
  selectedValues: string[];
  onSelect: (value: string) => void;
  description?: string;
  /** Overrides the selected-count badge (e.g. equipment's "All" / "8/12"). */
  badgeText?: string;
  fadeColor: string;
  styles: SectionStyles;
}) {
  return (
    <View style={styles.section}>
      {title ? (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {(badgeText != null || selectedValues.length > 0) && (
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>{badgeText ?? selectedValues.length}</Text>
            </View>
          )}
        </View>
      ) : null}
      {description && (
        <Text style={styles.sectionDescription}>{description}</Text>
      )}
      <ChipScrollRow
        bleedStyle={styles.chipRowBleed}
        contentStyle={styles.chipRowContent}
        fadeColor={fadeColor}
        styles={styles}
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
      </ChipScrollRow>
    </View>
  );
});

// Inline sub-muscle chip row shown under the muscle row when a parent is selected.
// Deliberately no card chrome: tapping a muscle chip is the moment the user most
// wants results, and the old boxed "Refine <group>" card pushed them ~110px down.
// The caption leads with the group name so stacked rows (Chest + Back) stay legible.
const RefineSection = React.memo(function RefineSection({
  parentGroup,
  subMuscles,
  selectedSubMuscles,
  onToggleSubMuscle,
  fadeColor,
  styles,
}: {
  parentGroup: string;
  subMuscles: string[];
  selectedSubMuscles: string[];
  onToggleSubMuscle: (subMuscle: string) => void;
  fadeColor: string;
  styles: RefineStyles;
}) {
  const selectedCount = selectedSubMuscles.length;
  const totalCount = subMuscles.length;

  return (
    <View style={styles.refineSection}>
      <Text style={styles.refineCaption}>
        {selectedCount === 0
          ? `All ${parentGroup.toLowerCase()} · tap to narrow`
          : `${parentGroup} · narrowed to ${selectedCount} of ${totalCount}`}
      </Text>
      <ChipScrollRow
        bleedStyle={styles.chipRowBleed}
        contentStyle={styles.chipRowContent}
        fadeColor={fadeColor}
        styles={styles}
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
      </ChipScrollRow>
    </View>
  );
});

// ——— Result row, hoisted + memoized ———
// Selecting an exercise in add-mode replaces the `selectedIds` Set, which
// recreates `renderItem` and makes the FlatList re-render every mounted cell
// (~50 with windowSize 7). ExerciseGroupCard is memoized, but it used to get
// four fresh arrow functions per cell per render, so the memo never bailed and
// every visible card re-rendered on each tap — a perceptible checkmark delay.
// This wrapper takes only primitives + stable callbacks and builds the
// per-exercise closures itself, so a toggle re-renders exactly one row.
const ResultRow = React.memo(function ResultRow({
  group,
  inAddMode,
  selected,
  disabled,
  saved,
  onToggleSelect,
  onOpenDetail,
  onToggleLike,
}: {
  group: ExerciseGroup;
  inAddMode: boolean;
  /** Whether any exercise in the group is selected (only meaningful in add-mode). */
  selected: boolean;
  disabled: boolean;
  saved: boolean;
  onToggleSelect: (exercise: Exercise) => void;
  onOpenDetail: (exerciseId: string) => void;
  onToggleLike: (exerciseId: string) => void;
}) {
  const primaryId = group.primaryExercise.id;
  const handleLike = useCallback(() => onToggleLike(primaryId), [onToggleLike, primaryId]);
  const handlePress = useCallback(
    (exercise: Exercise) => {
      if (inAddMode) onToggleSelect(exercise);
      else onOpenDetail(exercise.id);
    },
    [inAddMode, onToggleSelect, onOpenDetail],
  );
  const handleInfo = useCallback(
    (exercise: Exercise) => onOpenDetail(exercise.id),
    [onOpenDetail],
  );
  return (
    <ExerciseGroupCard
      group={group}
      isSelected={inAddMode ? selected : undefined}
      isDisabled={disabled}
      saved={saved}
      onLikePress={handleLike}
      onPress={handlePress}
      onPressVariation={handlePress}
      onPressInfo={handleInfo}
    />
  );
});

export default function SearchScreen({ navigation }: Props) {
  const route = useRoute<SearchScreenRouteProp>();
  // The tab bar floats over this screen; lists and in-flow footers must both
  // keep their last row / buttons clear of it.
  const tabBarInset = useTabBarInset();
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
    recommendedOnly: false,
  });

  // Equipment + movement patterns live behind ONE collapsed row: equipment is a
  // set-once preference (usually pre-filled from onboarding) and movement
  // patterns are rarely touched, so two separate ~60px rows just pushed the
  // first result a full card lower. One tap to expand both.
  const [showMoreFilters, setShowMoreFilters] = useState(false);
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

  // Re-tapping the Exercises tab scrolls the visible list back to the top —
  // standard iOS muscle memory for escaping a deep scroll. One ref per list;
  // the hook no-ops on whichever list isn't mounted.
  const allListRef = useRef<FlatList>(null);
  const savedListRef = useRef<FlatList>(null);
  // The hook's type rejects nullable refs, but a null current is exactly the
  // unmounted-list no-op we rely on; FlatList satisfies it structurally.
  useScrollToTop(allListRef as React.RefObject<FlatList>);
  useScrollToTop(savedListRef as React.RefObject<FlatList>);
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
      recommendedOnly: false,
    });
  };

  const equipmentNarrowed = isEquipmentNarrowed(filters.equipment);

  // Reset returns to the page default (profile gear, no chips, no text). Grey it
  // out when already there — not when the chip count is 0, because a home-gym
  // user's default state legitimately shows one "My equipment" chip.
  const isDefaultFilterState =
    filters.searchQuery.trim().length === 0 &&
    filters.muscleGroups.length === 0 &&
    filters.subMuscles.length === 0 &&
    filters.movementPatterns.length === 0 &&
    !filters.recommendedOnly &&
    equipmentSetsEqual(filters.equipment, profileEquipment);

  // Chips for the active-filter row. The header badge is this list's length —
  // one source of truth, so the badge can never disagree with the rendered chips.
  const getActiveFilters = () => {
    const active: Array<{ label: string; category: string; value: string; isParent?: boolean }> = [];

    // (The Recommended scope is deliberately NOT a chip: the scope bar under
    // the search field always shows that state itself, so a removable token
    // here would double-report it.)

    // Selected parent groups (each searches the whole group unless narrowed by sub-muscles below).
    filters.muscleGroups.forEach(g => {
      active.push({ label: g, category: 'muscleGroups', value: g, isParent: true });
    });

    // Narrowing sub-muscles, shown alongside their parent group.
    filters.subMuscles.forEach(m => {
      active.push({ label: m, category: 'subMuscles', value: m });
    });

    // ONE summary chip for equipment instead of a chip per item (a full home-gym
    // profile used to fill the row with up to 12 chips that narrowed nothing new).
    // "My equipment" says *why* results are filtered when the selection is the
    // profile's gear, which makes the × decision safer.
    if (equipmentNarrowed) {
      active.push({
        label: equipmentSetsEqual(filters.equipment, profileEquipment)
          ? `My equipment · ${filters.equipment.length}`
          : `Equipment · ${filters.equipment.length}`,
        category: 'equipmentSummary',
        value: 'equipment',
      });
    }
    filters.movementPatterns.forEach(p => active.push({ label: p, category: 'movementPatterns', value: p }));

    return active;
  };

  // Monotonic id per search request. Overlapping requests can resolve out of
  // order (a slow failure landing after a later success), so every state write
  // below checks that no newer request has started since this one — otherwise a
  // stale error overwrites fresh results, or stale results overwrite newer ones
  // while typing quickly.
  const requestSeq = useRef(0);

  // Search exercises when filters change
  const performSearch = useCallback(async (currentFilters: FilterState) => {
    const seq = ++requestSeq.current;
    // All equipment selected narrows nothing, so treat it as unset: don't send
    // the param and don't count it. This keeps the all-gear default on the
    // capped browse branch (instead of pulling the whole catalog uncapped) and
    // un-hides the few gear-less catalog rows, which match no equipment list.
    const equipmentNarrowed = isEquipmentNarrowed(currentFilters.equipment);
    const activeCount =
      currentFilters.muscleGroups.length +
      currentFilters.subMuscles.length +
      (equipmentNarrowed ? 1 : 0) +
      currentFilters.movementPatterns.length +
      (currentFilters.recommendedOnly ? 1 : 0);
    const hasSearch = currentFilters.searchQuery.trim().length > 0;

    setIsLoading(true);
    setError(null);

    try {
      // When the user types, search the whole catalog by text alone — chip filters
      // (especially the profile-seeded equipment) must never silently hide a name
      // match. Chips only narrow when browsing without a search term. With no text
      // and no effective chips, browse the whole catalog (popular first, capped) so
      // the page is never blank.
      const searchParams = hasSearch
        ? { searchQuery: currentFilters.searchQuery.trim() }
        : activeCount === 0
          ? { limit: BROWSE_LIMIT }
          : {
              muscleGroups: currentFilters.muscleGroups.length > 0 ? currentFilters.muscleGroups : undefined,
              subMuscles: currentFilters.subMuscles.length > 0 ? currentFilters.subMuscles : undefined,
              equipment: equipmentNarrowed ? currentFilters.equipment : undefined,
              movementPatterns: currentFilters.movementPatterns.length > 0 ? currentFilters.movementPatterns : undefined,
              recommendedOnly: currentFilters.recommendedOnly || undefined,
              limit: BROWSE_LIMIT,
            };

      const response = await searchExercises(searchParams);
      if (seq !== requestSeq.current) return; // stale response — a newer search is in flight
      setTotalMatchCount(response.count ?? response.exercises.length);
      setExercises(response.exercises);
      // Flat, relevance-ranked list while searching (so the exact variant you typed
      // is visible, not buried under "Show variations"); grouped families when browsing.
      const grouped = hasSearch
        ? response.exercises.map((e) => ({ baseName: e.name, exercises: [e], primaryExercise: e }))
        : groupExercises(response.exercises);
      setExerciseGroups(grouped);
    } catch (err: any) {
      if (seq !== requestSeq.current) return; // stale failure — a newer search owns the UI state
      console.error('Error searching exercises:', err);
      setError(err.message || 'Failed to search exercises');
      setExercises([]);
      setExerciseGroups([]);
    } finally {
      if (seq === requestSeq.current) setIsLoading(false);
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
  // Server capped the response (browse/chip mode): `exercises` is the top slice.
  const resultsCapped = totalMatchCount > exercises.length;
  // When capped, the grouped-row count would contradict the "top N of M" subtext
  // (fewer family cards than N), so "found" reports the server's total matches.
  const foundCount = resultsCapped ? totalMatchCount : resultCount;
  const activeFilters = getActiveFilters();
  const activeFilterCount = activeFilters.length;
  const searchActive = filters.searchQuery.trim().length > 0;
  // No chips and no text: the list is the capped, popularity-sorted whole catalog.
  // (The Recommended scope also leaves "browse all" — it narrows to the staples.)
  const isBrowsingAll = activeFilterCount === 0 && !searchActive && !filters.recommendedOnly;

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
      } else if (category === 'equipmentSummary') {
        // × on the summary chip clears the equipment narrowing. Select-all (not
        // empty) so the Equipment Available checkboxes read "everything works",
        // matching what the search now does with the param omitted.
        updated.equipment = [...EQUIPMENT_OPTIONS];
      } else if (category === 'movementPatterns') {
        updated.movementPatterns = prev.movementPatterns.filter(v => v !== value);
      }
      return updated;
    });
  };

  // Selected exercise objects for add-mode, keyed by id, alongside selectedIds.
  // Chip-driven searches are capped (BROWSE_LIMIT), so a selected row can drop
  // out of the current results array on a re-search; the submit handlers must
  // still be able to build its payload. Set/delete are idempotent, so mutating
  // the ref inside the state updater is safe even if React replays it.
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

  // Stable per-item callbacks for ResultRow. `navigation` is stable. The like
  // handler is recreated whenever saved state changes, so route it through a
  // ref — otherwise one heart tap would change the `onToggleLike` prop of every
  // row and re-render the whole list (same class of bug as the selection Set).
  const openExerciseDetail = useCallback(
    (exerciseId: string) => navigation.navigate('ExerciseDetail', { exerciseId }),
    [navigation],
  );
  const toggleLikeRef = useRef(handleToggleExerciseLike);
  useEffect(() => {
    toggleLikeRef.current = handleToggleExerciseLike;
  }, [handleToggleExerciseLike]);
  const onToggleLike = useCallback((exerciseId: string) => {
    toggleLikeRef.current(exerciseId);
  }, []);

  // Set lookups so renderItem stays O(1) per row instead of scanning arrays.
  const savedIdSet = useMemo(() => new Set(savedExerciseIds), [savedExerciseIds]);
  const existingIdSet = useMemo(
    () => new Set(addToWorkout?.existingExerciseIds ?? []),
    [addToWorkout],
  );

  // Render a single exercise card for the virtualized results FlatList. The list used to
  // be a non-virtualized ScrollView that mounted every card (~hundreds) at once, which
  // caused multi-second jank on broad filters. The FlatList now renders only the cards
  // near the viewport and recycles the rest. This callback is still recreated when
  // `selectedIds` changes (so the tapped row can flip), but it hands ResultRow only
  // primitives + stable callbacks, so React.memo skips every card except the tapped one.
  const renderExerciseCard = useCallback(
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
      sets: 3,
      reps: 10,
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
      // Land on Workout only when the request came from there (pre-start list or a live
      // session) — that's still the right place to be. Plan's context menu and WorkoutDetail
      // aren't mid-workout, so jumping to Workout there would be a non-sequitur; land back on
      // Plan instead.
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
        searchContainer: {
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        searchInputRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: colors.background,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          borderWidth: 1,
          borderColor: colors.border,
        },
        searchInput: {
          flex: 1,
          paddingVertical: spacing.md,
          fontSize: text.callout,
          color: colors.text,
        },
        activeFiltersContainer: {
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          paddingVertical: spacing.md,
        },
        activeFiltersScroll: { paddingHorizontal: spacing.lg, gap: spacing.sm },
        activeFilterChip: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.primary + '20',
          borderRadius: radius.xl,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderWidth: 1,
          borderColor: colors.primary,
          marginRight: spacing.sm,
        },
        activeFilterText: { color: colors.primary, fontSize: text.body, fontWeight: weight.semibold, marginRight: spacing.sm },
        activeFiltersDimmed: { opacity: 0.4 },
        activeFiltersPausedNote: {
          fontSize: text.footnote,
          color: colors.textMuted,
          paddingHorizontal: spacing.lg,
          marginBottom: spacing.sm,
        },
        content: { flex: 1 },
        contentContainer: { paddingBottom: 100 },
        section: { marginTop: spacing.xxl, paddingHorizontal: spacing.lg },
        sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
        sectionTitle: { fontSize: text.headline, fontWeight: weight.semibold, color: colors.text },
        sectionBadge: {
          backgroundColor: colors.primary,
          borderRadius: radius.md,
          minWidth: 20,
          height: 20,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: spacing.sm,
        },
        sectionBadgeText: { color: colors.onPrimary, fontSize: text.caption, fontWeight: weight.bold },
        sectionDescription: { fontSize: text.body, color: colors.textMuted, marginBottom: spacing.md },
        // ChipScrollRow: the bleed escapes the section's lg padding so chips
        // clip at the container's true edge (mid-pill = the scroll affordance);
        // the content padding restores the margin so the row aligns with its
        // title at rest and at full scroll.
        chipRowBleed: { marginHorizontal: -spacing.lg },
        chipRowContent: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg },
        chipRowFade: { position: 'absolute', top: 0, bottom: 0, width: 32 },
        chipRowFadeLeft: { left: 0 },
        chipRowFadeRight: { right: 0 },
        resultsFooterNote: {
          fontSize: text.footnote,
          color: colors.textMuted,
          textAlign: 'center',
          paddingVertical: spacing.xl,
          paddingHorizontal: spacing.lg,
        },
        // Recommended scope bar — iOS segmented-control geometry; the track
        // tone is the standard system segmented grey (same hardcode as the
        // calendar's scope bar; no palette token exists for it).
        scopeTrack: {
          flexDirection: 'row',
          backgroundColor: '#E4E4E9',
          borderRadius: radius.md,
          marginTop: spacing.md,
        },
        scopeThumb: {
          position: 'absolute',
          top: SCOPE_PAD,
          bottom: SCOPE_PAD,
          left: SCOPE_PAD,
          // Concentric with the track: inner radius = outer radius − inset,
          // the iOS segmented-control rule (a smaller token reads as a squared
          // thumb rattling inside a rounder track).
          borderRadius: radius.md - SCOPE_PAD,
          backgroundColor: colors.surface,
          shadowColor: colors.shadow,
          ...elevation.level1,
        },
        scopeButton: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
          paddingVertical: spacing.sm,
        },
        scopeLabel: { fontSize: text.body, fontWeight: weight.medium, color: colors.textSecondary },
        scopeLabelActive: { fontWeight: weight.semibold, color: colors.text },
        scopeCaption: {
          fontSize: text.footnote,
          color: colors.textMuted,
          marginTop: spacing.sm,
          marginHorizontal: spacing.xs,
        },
        chip: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderRadius: radius.xl,
          backgroundColor: colors.surface,
          borderWidth: 1.5,
          borderColor: colors.border,
          marginRight: spacing.sm,
          gap: spacing.sm,
        },
        chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
        chipText: { fontSize: text.body, color: colors.textSecondary, fontWeight: weight.medium },
        chipTextSelected: { color: colors.onPrimary, fontWeight: weight.semibold },
        chipTextPartial: { color: colors.primary },
        chipCount: { fontSize: text.caption, color: colors.textMuted, fontWeight: weight.semibold, marginLeft: spacing.xs },
        chipCountSelected: { color: colors.onPrimary },
        chipPartial: {
          backgroundColor: colors.primary + '60',
          borderColor: colors.primary,
          borderStyle: 'dashed',
        },
        refineSection: { marginTop: spacing.md, paddingHorizontal: spacing.lg },
        refineCaption: { fontSize: text.body, color: colors.textMuted, marginBottom: spacing.sm },
        // Tight, uniform rhythm for the collapsible rows (Equipment + Advanced Filters).
        // marginBottom: spacing.none — the results section's own marginTop spaces it from the list.
        advancedSection: { marginTop: spacing.md, paddingHorizontal: spacing.lg, marginBottom: spacing.none },
        advancedToggle: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          marginBottom: spacing.lg,
        },
        advancedToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
        advancedToggleText: { fontSize: text.callout, fontWeight: weight.semibold, color: colors.textSecondary },
        advancedBadge: {
          backgroundColor: colors.primary,
          borderRadius: radius.md,
          minWidth: 20,
          height: 20,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: spacing.sm,
        },
        advancedBadgeText: { color: colors.onPrimary, fontSize: text.caption, fontWeight: weight.bold },
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
        retryButton: {
          marginTop: spacing.md,
          paddingHorizontal: spacing.xxl,
          paddingVertical: spacing.sm,
          borderRadius: radius.sm,
          borderWidth: 1,
          borderColor: colors.primary,
        },
        retryButtonText: { color: colors.primary, fontSize: text.body, fontWeight: weight.semibold },
        bottomBar: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          shadowColor: colors.shadow,
          ...elevationUp,
        },
        resultCountContainer: { flex: 1, marginRight: spacing.md },
        resultCountText: { fontSize: text.callout, color: colors.textSecondary, fontWeight: weight.medium },
        viewResultsButtonContainer: { width: 140 },
        viewResultsButton: { paddingVertical: spacing.lg },
        resultsHeader: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
        resultsHeaderText: { fontSize: text.title, fontWeight: weight.semibold, color: colors.text },
        resultsSubtext: { fontSize: text.body, fontWeight: weight.regular, color: colors.textMuted },
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

      {activeTab === 'saved' ? (
        // Virtualized like the main results list — the saved list can grow unbounded,
        // and a plain .map would re-introduce the mount-everything jank FlatList fixed.
        <FlatList
          ref={savedListRef}
          style={styles.content}
          contentContainerStyle={[styles.contentContainer, { paddingBottom: 100 + tabBarInset }]}
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

        {/* Recommended scope — the iOS search scope-bar pattern (Mail, App
            Store), docked inside the search container so the field and its
            scope read as one control. Dimmed while a search term is active,
            matching the chips-never-narrow-text-search convention. The
            caption replaces the old (i) → alert explainer. */}
        <View style={searchActive ? styles.activeFiltersDimmed : null}>
          <RecommendedScopeBar
            recommendedOnly={filters.recommendedOnly}
            onChange={(next) => {
              if (next === filters.recommendedOnly) return;
              buzzSelection();
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setFilters(prev => ({ ...prev, recommendedOnly: next }));
            }}
            styles={styles}
            colors={colors}
          />
          {filters.recommendedOnly && (
            <Text style={styles.scopeCaption}>{RECOMMENDED_INFO.caption}</Text>
          )}
        </View>
      </View>

      {/* Active Filters — dimmed while a search term is active: text search
          deliberately ignores chips (a typed name must never be hidden), so the
          row must not claim filters it is not applying. */}
      {activeFilters.length > 0 && (
        <View style={[styles.activeFiltersContainer, searchActive && styles.activeFiltersDimmed]}>
          {searchActive && (
            <Text style={styles.activeFiltersPausedNote}>Not applied while searching</Text>
          )}
          <ChipScrollRow
            contentStyle={styles.activeFiltersScroll}
            fadeColor={colors.surface}
            styles={styles}
          >
            {activeFilters.map((filter, index) => (
              <ActiveFilterChip
                key={`${filter.category}-${filter.value}-${index}`}
                label={filter.label}
                onRemove={() => removeFilter(filter.category, filter.value)}
                onPress={
                  filter.category === 'equipmentSummary'
                    ? () => setShowMoreFilters(true)
                    : undefined
                }
                styles={styles}
                colors={colors}
              />
            ))}
          </ChipScrollRow>
        </View>
      )}

      {/* Content */}
      <FlatList
        ref={allListRef}
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: 100 + tabBarInset }]}
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
          ) : !isLoading && !error && (activeFilterCount > 0 || filters.recommendedOnly) ? (
            <View style={styles.resultsPreview}>
              <Text style={styles.resultsPreviewText}>No exercises found</Text>
              <Text style={styles.resultsPreviewHint}>Try adjusting your filters</Text>
            </View>
          ) : null
        }
        // The cap note lives at the END of the list — a reader 300 rows deep is
        // the only person it concerns. Announcing it above the first row made
        // the page open on an apology.
        ListFooterComponent={
          !isLoading && !error && resultsCapped && activeTab === 'all' ? (
            <Text style={styles.resultsFooterNote}>
              Showing the {exercises.length} most popular of {totalMatchCount} — search or refine
              to see the rest.
            </Text>
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
          {/* One scrollable row, not a wrap. A wrapped grid was tried after the
              first scroll row hid Arms/Cardio/Core (it clipped cleanly at the
              margin and read as complete). ChipScrollRow fixes the affordance
              instead: full-bleed peek + edge fades say "there's more" without
              costing a second line. */}
          <ChipScrollRow
            bleedStyle={styles.chipRowBleed}
            contentStyle={styles.chipRowContent}
            fadeColor={colors.background}
            styles={styles}
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
          </ChipScrollRow>
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
                fadeColor={colors.background}
                styles={styles}
              />
            );
          }
          return null;
        })}

        {/* More filters — equipment + movement patterns behind one collapsed row */}
        <View style={styles.advancedSection}>
          <TouchableOpacity
            style={styles.advancedToggle}
            onPress={() => setShowMoreFilters(!showMoreFilters)}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <View style={styles.advancedToggleLeft}>
              <Ionicons
                name={showMoreFilters ? 'chevron-down' : 'chevron-forward'}
                size={16}
                color={colors.textSecondary}
              />
              <Text style={styles.advancedToggleText}>More filters</Text>
            </View>
            {(equipmentNarrowed || filters.movementPatterns.length > 0) && (
              <View style={styles.advancedBadge}>
                <Text style={styles.advancedBadgeText}>
                  {(equipmentNarrowed ? 1 : 0) + filters.movementPatterns.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {showMoreFilters && (
            <>
              <FilterSection
                title="Equipment Available"
                badgeText={
                  filters.equipment.length === EQUIPMENT_OPTIONS.length
                    ? 'All'
                    : `${filters.equipment.length}/${EQUIPMENT_OPTIONS.length}`
                }
                options={[...EQUIPMENT_OPTIONS]}
                selectedValues={filters.equipment}
                onSelect={(value) => toggleFilter('equipment', value)}
                description="What equipment do you have access to?"
                fadeColor={colors.background}
                styles={styles}
              />
              <FilterSection
                title="Movement Pattern"
                options={MOVEMENT_PATTERNS}
                selectedValues={filters.movementPatterns}
                onSelect={(value) => toggleFilter('movementPatterns', value)}
                description="Filter by exercise movement type (optional)"
                fadeColor={colors.background}
                styles={styles}
              />
            </>
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
            <Text style={[styles.resultsPreviewText, { color: colors.error }]}>
              Error
            </Text>
            <Text style={styles.resultsPreviewHint}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => performSearch(filters)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Retry search"
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Exercise Results header — cards render below as virtualized FlatList items */}
        {!isLoading && !error && resultCount > 0 && (
          <View style={[styles.resultsHeader, { marginTop: spacing.xxl }]}>
            {isBrowsingAll ? (
              <>
                <Text style={styles.resultsHeaderText}>Popular exercises</Text>
                <Text style={styles.resultsSubtext}>Search or filter to narrow the list.</Text>
              </>
            ) : (
              <>
                <Text style={styles.resultsHeaderText}>
                  {foundCount} exercise{foundCount !== 1 ? 's' : ''} found
                  {!resultsCapped &&
                    exerciseGroups.length > 0 &&
                    exercises.length > exerciseGroups.length && (
                      <Text style={styles.resultsSubtext}>
                        {' '}({exercises.length} total including variations)
                      </Text>
                    )}
                </Text>
              </>
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
        <View style={[styles.bottomBar, { paddingBottom: spacing.md + tabBarInset }]}>
          <View style={styles.resultCountContainer}>
            <Text style={styles.resultCountText}>
              {isLoading
                ? 'Searching...'
                : activeFilterCount > 0 || filters.recommendedOnly || filters.searchQuery.trim().length > 0
                ? 'No exercises match your filters'
                : 'No exercises to show'}
            </Text>
          </View>
          {(activeFilterCount > 0 || filters.recommendedOnly) && (
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