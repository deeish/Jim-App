import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { colors } from '../theme/colors';
import Button from '../components/Button';
import { searchExercises, Exercise } from '../services/exerciseService';
import ExerciseGroupCard from '../components/ExerciseGroupCard';
import { groupExercises, ExerciseGroup } from '../utils/exerciseGrouping';

type SearchScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Search'>;

type Props = {
  navigation: SearchScreenNavigationProp;
};

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Muscle group hierarchy - parent groups with their sub-muscles
const MUSCLE_HIERARCHY: Record<string, string[]> = {
  'Chest': ['Upper Chest', 'Mid Chest', 'Lower Chest'],
  'Back': ['Upper Back', 'Mid Back', 'Lower Back', 'Lats', 'Traps'],
  'Legs': ['Quads', 'Hamstrings', 'Glutes', 'Calves', 'Inner Thighs', 'Outer Thighs'],
  'Shoulders': ['Front Delts', 'Side Delts', 'Rear Delts', 'Rotator Cuff'],
  'Arms': ['Biceps', 'Triceps', 'Forearms'],
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

const EQUIPMENT_OPTIONS = [
  // Most common first
  'Bodyweight', 'Dumbbell', 'Barbell', 'Cable', 'Machine',
  // Specialized equipment
  'Kettlebell', 'Resistance Band', 'TRX', 'Pull-up Bar',
  'Medicine Ball', 'Battle Rope', 'Smith Machine'
];

// Advanced/optional filters - collapsed by default
const MOVEMENT_PATTERNS = [
  'Push', 'Pull', 'Squat', 'Hinge', 'Lunge', 'Carry'
];


interface FilterState {
  searchQuery: string;
  muscleGroups: string[]; // Parent groups (Chest, Back, etc.)
  subMuscles: string[]; // Specific muscles (Upper Chest, Lower Chest, etc.)
  equipment: string[];
  movementPatterns: string[];
}

export default function SearchScreen({ navigation }: Props) {
  const [filters, setFilters] = useState<FilterState>({
    searchQuery: '',
    muscleGroups: [],
    subMuscles: [],
    equipment: [],
    movementPatterns: [],
  });

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [exerciseGroups, setExerciseGroups] = useState<ExerciseGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  // Toggle a main muscle group (parent)
  const toggleMuscleGroup = (group: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFilters(prev => {
      const isSelected = prev.muscleGroups.includes(group);
      const subMuscles = getSubMuscles(group);
      
      if (isSelected) {
        // Deselecting parent: remove parent and all its children
        return {
          ...prev,
          muscleGroups: prev.muscleGroups.filter(g => g !== group),
          subMuscles: prev.subMuscles.filter(m => !subMuscles.includes(m)),
        };
      } else {
        // Selecting parent: add parent and all its children
        return {
          ...prev,
          muscleGroups: [...prev.muscleGroups, group],
          subMuscles: [...prev.subMuscles, ...subMuscles],
        };
      }
    });
  };

  // Toggle a specific sub-muscle
  const toggleSubMuscle = (subMuscle: string, parentGroup: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFilters(prev => {
      const isSelected = prev.subMuscles.includes(subMuscle);
      const subMuscles = getSubMuscles(parentGroup);
      const selectedSubMuscles = prev.subMuscles.filter(m => subMuscles.includes(m));
      
      if (isSelected) {
        // Deselecting sub-muscle
        const newSubMuscles = prev.subMuscles.filter(m => m !== subMuscle);
        const allSubMusclesSelected = subMuscles.every(m => 
          m === subMuscle || newSubMuscles.includes(m)
        );
        
        // If not all sub-muscles are selected, remove parent from muscleGroups
        // If parent was selected, we need to check if we should keep it
        const shouldKeepParent = prev.muscleGroups.includes(parentGroup) && 
          newSubMuscles.filter(m => subMuscles.includes(m)).length > 0;
        
        return {
          ...prev,
          subMuscles: newSubMuscles,
          muscleGroups: shouldKeepParent 
            ? prev.muscleGroups 
            : prev.muscleGroups.filter(g => g !== parentGroup),
        };
      } else {
        // Selecting sub-muscle
        const newSubMuscles = [...prev.subMuscles, subMuscle];
        const allSubMusclesSelected = subMuscles.every(m => newSubMuscles.includes(m));
        
        // If all sub-muscles are now selected, add parent to muscleGroups
        return {
          ...prev,
          subMuscles: newSubMuscles,
          muscleGroups: allSubMusclesSelected && !prev.muscleGroups.includes(parentGroup)
            ? [...prev.muscleGroups, parentGroup]
            : prev.muscleGroups,
        };
      }
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

  // Get selection state for a muscle group
  const getMuscleGroupState = (group: string): 'none' | 'partial' | 'full' => {
    const subMuscles = getSubMuscles(group);
    const selectedSubMuscles = filters.subMuscles.filter(m => subMuscles.includes(m));
    
    if (selectedSubMuscles.length === 0) return 'none';
    if (selectedSubMuscles.length === subMuscles.length) return 'full';
    return 'partial';
  };

  const resetFilters = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFilters({
      searchQuery: '',
      muscleGroups: [],
      subMuscles: [],
      equipment: [],
      movementPatterns: [],
    });
  };

  const getActiveFilterCount = () => {
    // Count unique muscle selections (either parent groups or individual sub-muscles)
    const muscleCount = filters.muscleGroups.length > 0 
      ? filters.muscleGroups.length 
      : filters.subMuscles.length;
    
    return (
      muscleCount +
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
    
    // Don't search if no filters are active
    if (activeCount === 0 && !hasSearch) {
      setExercises([]);
      setExerciseGroups([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const searchParams = {
        searchQuery: currentFilters.searchQuery.trim() || undefined,
        muscleGroups: currentFilters.muscleGroups.length > 0 ? currentFilters.muscleGroups : undefined,
        subMuscles: currentFilters.subMuscles.length > 0 ? currentFilters.subMuscles : undefined,
        equipment: currentFilters.equipment.length > 0 ? currentFilters.equipment : undefined,
        movementPatterns: currentFilters.movementPatterns.length > 0 ? currentFilters.movementPatterns : undefined,
      };

      const response = await searchExercises(searchParams);
      setExercises(response.exercises);
      // Group exercises by base name
      const grouped = groupExercises(response.exercises);
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

  // Debounce search query changes
  useEffect(() => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    const timeout = setTimeout(() => {
      performSearch(filters);
    }, filters.searchQuery.trim().length > 0 ? 500 : 0); // 500ms debounce for text search

    setSearchTimeout(timeout);

    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [filters.searchQuery, performSearch]);

  // Search immediately when non-text filters change
  useEffect(() => {
    if (filters.searchQuery.trim().length === 0) {
      performSearch(filters);
    }
  }, [filters.muscleGroups, filters.subMuscles, filters.equipment, filters.movementPatterns, performSearch]);

  const resultCount = exerciseGroups.length > 0 ? exerciseGroups.length : exercises.length;
  const activeFilterCount = getActiveFilterCount();

  // Get all active filters for display
  const getActiveFilters = () => {
    const active: Array<{ label: string; category: string; value: string; isParent?: boolean }> = [];
    
    // Add muscle groups (parents) - show these instead of individual sub-muscles if parent is fully selected
    filters.muscleGroups.forEach(g => {
      active.push({ label: g, category: 'muscleGroups', value: g, isParent: true });
    });
    
    // Add sub-muscles that aren't part of a fully selected parent
    filters.subMuscles.forEach(m => {
      const parent = Object.keys(MUSCLE_HIERARCHY).find(p => 
        MUSCLE_HIERARCHY[p].includes(m)
      );
      // Only add if parent is not fully selected
      if (parent && !filters.muscleGroups.includes(parent)) {
        active.push({ label: m, category: 'subMuscles', value: m });
      }
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
        // Remove sub-muscle and check if parent should be removed
        const parent = Object.keys(MUSCLE_HIERARCHY).find(p => 
          MUSCLE_HIERARCHY[p].includes(value)
        );
        updated.subMuscles = prev.subMuscles.filter(v => v !== value);
        if (parent && prev.muscleGroups.includes(parent)) {
          updated.muscleGroups = prev.muscleGroups.filter(g => g !== parent);
        }
      } else if (category === 'equipment') {
        updated.equipment = prev.equipment.filter(v => v !== value);
      } else if (category === 'movementPatterns') {
        updated.movementPatterns = prev.movementPatterns.filter(v => v !== value);
      }
      return updated;
    });
  };

  const Chip = ({ 
    label, 
    isSelected, 
    onPress,
    selectionState,
    count,
  }: { 
    label: string; 
    isSelected: boolean; 
    onPress: () => void;
    selectionState?: 'none' | 'partial' | 'full';
    count?: string;
  }) => {
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
      >
        <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
          {label}
        </Text>
        {count && (
          <Text style={[styles.chipCount, isSelected && styles.chipCountSelected]}>
            {count}
          </Text>
        )}
        {isSelected && !showPartial && <Text style={styles.chipCheckmark}>✓</Text>}
        {showPartial && <Text style={styles.chipPartialIndicator}>◐</Text>}
      </TouchableOpacity>
    );
  };

  const ActiveFilterChip = ({
    label,
    onRemove,
  }: {
    label: string;
    onRemove: () => void;
  }) => (
    <View style={styles.activeFilterChip}>
      <Text style={styles.activeFilterText}>{label}</Text>
      <TouchableOpacity onPress={onRemove} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={styles.activeFilterRemove}>×</Text>
      </TouchableOpacity>
    </View>
  );

  const FilterSection = ({
    title,
    options,
    selectedValues,
    onSelect,
    description,
  }: {
    title: string;
    options: string[];
    selectedValues: string[];
    onSelect: (value: string) => void;
    description?: string;
  }) => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {selectedValues.length > 0 && (
          <View style={styles.sectionBadge}>
            <Text style={styles.sectionBadgeText}>{selectedValues.length}</Text>
          </View>
        )}
      </View>
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
          />
        ))}
      </ScrollView>
    </View>
  );

  // Refine section for sub-muscles when a parent is selected
  const RefineSection = ({
    parentGroup,
    subMuscles,
    selectedSubMuscles,
    onToggleSubMuscle,
  }: {
    parentGroup: string;
    subMuscles: string[];
    selectedSubMuscles: string[];
    onToggleSubMuscle: (subMuscle: string) => void;
  }) => {
    const selectedCount = selectedSubMuscles.length;
    const totalCount = subMuscles.length;
    
    return (
      <View style={styles.refineSection}>
        <View style={styles.refineHeader}>
          <Text style={styles.refineTitle}>Refine {parentGroup}</Text>
          <Text style={styles.refineSubtitle}>
            {selectedCount} of {totalCount} selected
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
            />
          ))}
        </ScrollView>
      </View>
    );
  };

  const activeFilters = getActiveFilters();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Find Workouts</Text>
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={resetFilters} activeOpacity={0.7}>
          <Text style={[styles.resetButton, activeFilterCount === 0 && styles.resetButtonDisabled]}>
            Reset
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, exercise, or muscle..."
          placeholderTextColor={colors.textMuted}
          value={filters.searchQuery}
          onChangeText={(text) => setFilters(prev => ({ ...prev, searchQuery: text }))}
          returnKeyType="search"
        />
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
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Primary Filters - Most Important */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Target Muscles</Text>
            {(filters.muscleGroups.length > 0 || filters.subMuscles.length > 0) && (
              <View style={styles.sectionBadge}>
                <Text style={styles.sectionBadgeText}>
                  {filters.muscleGroups.length > 0 
                    ? filters.muscleGroups.length 
                    : filters.subMuscles.length}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.sectionDescription}>
            Select muscle groups you want to train
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
              const isSelected = state === 'full' || state === 'partial';
              
              return (
                <Chip
                  key={group}
                  label={group}
                  isSelected={state === 'full'}
                  selectionState={state}
                  count={state === 'partial' ? `${selectedSubMuscles.length}/${subMuscles.length}` : undefined}
                  onPress={() => toggleMuscleGroup(group)}
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
          
          // Show refine section if parent is selected (full or partial)
          if (state !== 'none') {
            return (
              <RefineSection
                key={`refine-${group}`}
                parentGroup={group}
                subMuscles={subMuscles}
                selectedSubMuscles={selectedSubMuscles}
                onToggleSubMuscle={(subMuscle) => toggleSubMuscle(subMuscle, group)}
              />
            );
          }
          return null;
        })}

        <FilterSection
          title="Equipment Available"
          options={EQUIPMENT_OPTIONS}
          selectedValues={filters.equipment}
          onSelect={(value) => toggleFilter('equipment', value)}
          description="What equipment do you have access to?"
        />

        {/* Advanced Filters - Collapsed by default */}
        <View style={styles.advancedSection}>
          <TouchableOpacity
            style={styles.advancedToggle}
            onPress={() => setShowAdvancedFilters(!showAdvancedFilters)}
            activeOpacity={0.7}
          >
            <Text style={styles.advancedToggleText}>
              {showAdvancedFilters ? '▼' : '▶'} Advanced Filters
            </Text>
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

        {/* Exercise Results List */}
        {!isLoading && !error && resultCount > 0 && (
          <View style={styles.resultsSection}>
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsHeaderText}>
                {resultCount} exercise{resultCount !== 1 ? 's' : ''} found
                {exerciseGroups.length > 0 && exercises.length > exerciseGroups.length && (
                  <Text style={styles.resultsSubtext}>
                    {' '}({exercises.length} total including variations)
                  </Text>
                )}
              </Text>
            </View>
            {exerciseGroups.map((group, index) => (
              <ExerciseGroupCard
                key={`${group.baseName}-${index}`}
                group={group}
                onPress={(exercise) => {
                  navigation.navigate('ExerciseDetail', { exerciseId: exercise.id });
                }}
                onPressVariation={(exercise) => {
                  navigation.navigate('ExerciseDetail', { exerciseId: exercise.id });
                }}
              />
            ))}
          </View>
        )}

        {!isLoading && !error && resultCount === 0 && activeFilterCount > 0 && (
          <View style={styles.resultsPreview}>
            <Text style={styles.resultsPreviewText}>
              No exercises found
            </Text>
            <Text style={styles.resultsPreviewHint}>
              Try adjusting your filters
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Sticky Bottom Bar - Only show when no results or loading */}
      {(isLoading || resultCount === 0) && (
        <View style={styles.bottomBar}>
          <View style={styles.resultCountContainer}>
            <Text style={styles.resultCountText}>
              {isLoading
                ? 'Searching...'
                : activeFilterCount > 0 || filters.searchQuery.trim().length > 0
                ? 'No exercises match your filters'
                : 'Start filtering to find exercises'}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
  },
  filterBadge: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  filterBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  resetButton: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
  resetButtonDisabled: {
    opacity: 0.4,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInput: {
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  activeFiltersContainer: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 12,
  },
  activeFiltersScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
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
  activeFilterText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
    marginRight: 6,
  },
  activeFilterRemove: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: 'bold',
    lineHeight: 18,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 100, // Space for bottom bar
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  sectionBadge: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  sectionBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  sectionDescription: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 12,
  },
  chipsContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 16,
  },
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
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  chipCheckmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  chipCount: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
    marginLeft: 4,
  },
  chipCountSelected: {
    color: '#FFFFFF',
  },
  chipPartial: {
    backgroundColor: colors.primary + '60',
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  chipPartialIndicator: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
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
  refineTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  refineSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
  },
  advancedSection: {
    marginTop: 32,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
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
  advancedToggleText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  advancedBadge: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  advancedBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  resultsPreview: {
    marginTop: 24,
    marginHorizontal: 16,
    padding: 20,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  resultsPreviewText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  resultsPreviewHint: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  resultCountContainer: {
    flex: 1,
    marginRight: 12,
  },
  resultCountText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  viewResultsButtonContainer: {
    width: 140,
  },
  viewResultsButton: {
    paddingVertical: 14,
  },
  resultsSection: {
    marginTop: 24,
    paddingBottom: 20,
  },
  resultsHeader: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  resultsHeaderText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  resultsSubtext: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.textMuted,
  },
});