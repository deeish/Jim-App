import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import Button from '../components/Button';

// Dummy data
const MUSCLE_OPTIONS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'];
const EQUIPMENT_OPTIONS = ['Bodyweight', 'Dumbbell', 'Barbell', 'Cable', 'Machine'];
const PATTERN_OPTIONS = ['Push', 'Pull', 'Squat', 'Hinge', 'Core', 'Carry'];

// Expanded lists for "More options" - full list
const ALL_EXPANDED_MUSCLES = [
  // Chest
  'Upper Chest', 'Lower Chest', 'Pecs', 'Serratus Anterior',
  // Back
  'Lats', 'Traps', 'Upper Back', 'Middle Back', 'Lower Back', 'Rhomboids', 'Erector Spinae', 'Teres Major', 'Teres Minor',
  // Legs
  'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Hip Flexors', 'Adductors', 'Abductors', 'IT Band', 'Shins',
  // Shoulders
  'Delts', 'Anterior Delts', 'Lateral Delts', 'Posterior Delts', 'Rotator Cuff',
  // Arms
  'Biceps', 'Triceps', 'Forearms', 'Brachialis', 'Brachioradialis',
  // Core
  'Abs', 'Obliques', 'Transverse Abdominis', 'Rectus Abdominis', 'Lower Back'
];

const ALL_EXPANDED_EQUIPMENT = [
  // Bodyweight accessories
  'TRX', 'Pull-up Bar', 'Dip Bars', 'Parallettes', 'Gymnastic Rings',
  // Free weights accessories
  'Kettlebell', 'Medicine Ball', 'Sandbag', 'Weighted Vest',
  // Resistance equipment
  'Resistance Band', 'Battle Rope', 'Suspension Trainer',
  // Machines & specialized
  'Smith Machine', 'Sled', 'Prowler', 'Rowing Machine', 'Assault Bike', 'Concept2 Rower'
];

const ALL_EXPANDED_PATTERNS = [
  // Basic patterns
  'Push', 'Pull', 'Squat', 'Hinge', 'Core', 'Carry',
  // Variations
  'Lunge', 'Step-up', 'Rotation', 'Anti-rotation', 'Flexion', 'Extension',
  // Exercise types
  'Isolation', 'Compound', 'Plyometric', 'Static', 'Dynamic', 'Eccentric', 'Isometric'
];

// Mapping functions to filter expanded options based on quick chip selection
const getFilteredMuscles = (selectedMuscle: string | null): string[] => {
  if (!selectedMuscle) return ALL_EXPANDED_MUSCLES;
  
  const muscleMap: Record<string, string[]> = {
    'Chest': ['Upper Chest', 'Lower Chest', 'Pecs', 'Serratus Anterior'],
    'Back': ['Lats', 'Traps', 'Upper Back', 'Middle Back', 'Lower Back', 'Rhomboids', 'Erector Spinae', 'Teres Major', 'Teres Minor'],
    'Legs': ['Quads', 'Hamstrings', 'Glutes', 'Calves', 'Hip Flexors', 'Adductors', 'Abductors', 'IT Band', 'Shins'],
    'Shoulders': ['Delts', 'Anterior Delts', 'Lateral Delts', 'Posterior Delts', 'Rotator Cuff'],
    'Arms': ['Biceps', 'Triceps', 'Forearms', 'Brachialis', 'Brachioradialis'],
    'Core': ['Abs', 'Obliques', 'Transverse Abdominis', 'Rectus Abdominis', 'Lower Back'],
  };
  
  return muscleMap[selectedMuscle] || ALL_EXPANDED_MUSCLES;
};

const getFilteredEquipment = (selectedEquipment: string | null): string[] => {
  if (!selectedEquipment) return ALL_EXPANDED_EQUIPMENT;
  
  const equipmentMap: Record<string, string[]> = {
    'Bodyweight': ['TRX', 'Pull-up Bar', 'Dip Bars', 'Parallettes', 'Gymnastic Rings', 'Suspension Trainer'],
    'Dumbbell': ['Kettlebell', 'Medicine Ball', 'Sandbag', 'Weighted Vest'],
    'Barbell': ['Smith Machine', 'Sled', 'Prowler'],
    'Cable': ['Resistance Band', 'Battle Rope', 'Suspension Trainer'],
    'Machine': ['Smith Machine', 'Sled', 'Prowler', 'Rowing Machine', 'Assault Bike', 'Concept2 Rower'],
  };
  
  return equipmentMap[selectedEquipment] || ALL_EXPANDED_EQUIPMENT;
};

const getFilteredPatterns = (selectedPattern: string | null): string[] => {
  if (!selectedPattern) return ALL_EXPANDED_PATTERNS;
  
  const patternMap: Record<string, string[]> = {
    'Push': ['Push', 'Isolation', 'Compound', 'Plyometric', 'Eccentric'],
    'Pull': ['Pull', 'Isolation', 'Compound', 'Eccentric'],
    'Squat': ['Squat', 'Lunge', 'Step-up', 'Plyometric', 'Compound'],
    'Hinge': ['Hinge', 'Compound', 'Eccentric'],
    'Core': ['Core', 'Rotation', 'Anti-rotation', 'Flexion', 'Extension', 'Static', 'Isometric'],
    'Carry': ['Carry', 'Static', 'Isometric'],
  };
  
  return patternMap[selectedPattern] || ALL_EXPANDED_PATTERNS;
};

interface FilterState {
  muscle: string | null;
  equipment: string | null;
  pattern: string | null;
  expandedMuscle: string | null;
  expandedEquipment: string | null;
  expandedPattern: string | null;
}

export default function SearchScreen() {
  const [filters, setFilters] = useState<FilterState>({
    muscle: null,
    equipment: null,
    pattern: null,
    expandedMuscle: null,
    expandedEquipment: null,
    expandedPattern: null,
  });

  const [expandedSections, setExpandedSections] = useState<{
    muscles: boolean;
    equipment: boolean;
    pattern: boolean;
  }>({
    muscles: false,
    equipment: false,
    pattern: false,
  });

  const toggleQuickChip = (category: 'muscle' | 'equipment' | 'pattern', value: string) => {
    setFilters(prev => {
      const newValue = prev[category] === value ? null : value;
      const updated = { ...prev, [category]: newValue };
      
      // Clear expanded selection if it's no longer valid after filtering
      if (category === 'muscle') {
        if (newValue && prev.expandedMuscle) {
          const filtered = getFilteredMuscles(newValue);
          if (!filtered.includes(prev.expandedMuscle)) {
            updated.expandedMuscle = null;
          }
        }
      } else if (category === 'equipment') {
        if (newValue && prev.expandedEquipment) {
          const filtered = getFilteredEquipment(newValue);
          if (!filtered.includes(prev.expandedEquipment)) {
            updated.expandedEquipment = null;
          }
        }
      } else if (category === 'pattern') {
        if (newValue && prev.expandedPattern) {
          const filtered = getFilteredPatterns(newValue);
          if (!filtered.includes(prev.expandedPattern)) {
            updated.expandedPattern = null;
          }
        }
      }
      
      return updated;
    });
  };

  const toggleExpandedOption = (
    category: 'expandedMuscle' | 'expandedEquipment' | 'expandedPattern',
    value: string
  ) => {
    setFilters(prev => ({
      ...prev,
      [category]: prev[category] === value ? null : value,
    }));
  };

  const toggleSection = (section: 'muscles' | 'equipment' | 'pattern') => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const resetFilters = () => {
    setFilters({
      muscle: null,
      equipment: null,
      pattern: null,
      expandedMuscle: null,
      expandedEquipment: null,
      expandedPattern: null,
    });
  };

  const getResultCount = () => {
    // Dummy count - in real app, this would be calculated from filtered data
    const activeFilters = [
      filters.muscle,
      filters.equipment,
      filters.pattern,
      filters.expandedMuscle,
      filters.expandedEquipment,
      filters.expandedPattern,
    ].filter(Boolean).length;
    
    // Return dummy count based on active filters
    return activeFilters > 0 ? Math.floor(Math.random() * 50) + 10 : 0;
  };

  const resultCount = getResultCount();

  // Get filtered lists based on quick chip selections
  const filteredMuscles = getFilteredMuscles(filters.muscle);
  const filteredEquipment = getFilteredEquipment(filters.equipment);
  const filteredPatterns = getFilteredPatterns(filters.pattern);

  const Chip = ({ 
    label, 
    isSelected, 
    onPress 
  }: { 
    label: string; 
    isSelected: boolean; 
    onPress: () => void;
  }) => (
    <TouchableOpacity
      style={[styles.chip, isSelected && styles.chipSelected]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const QuickChipsSection = ({
    title,
    options,
    selectedValue,
    onSelect,
  }: {
    title: string;
    options: string[];
    selectedValue: string | null;
    onSelect: (value: string) => void;
  }) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsContainer}
      >
        {options.map((option) => (
          <Chip
            key={option}
            label={option}
            isSelected={selectedValue === option}
            onPress={() => onSelect(option)}
          />
        ))}
      </ScrollView>
    </View>
  );

  const AccordionSection = ({
    title,
    options,
    selectedValue,
    onSelect,
    isExpanded,
    onToggle,
  }: {
    title: string;
    options: string[];
    selectedValue: string | null;
    onSelect: (value: string) => void;
    isExpanded: boolean;
    onToggle: () => void;
  }) => (
    <View style={styles.accordionSection}>
      <TouchableOpacity
        style={styles.accordionHeader}
        onPress={onToggle}
        activeOpacity={0.7}
      >
        <Text style={styles.accordionTitle}>{title}</Text>
        <Text style={styles.accordionIcon}>{isExpanded ? '−' : '+'}</Text>
      </TouchableOpacity>
      {isExpanded && (
        <View style={styles.accordionContent}>
          {options.map((option) => (
            <TouchableOpacity
              key={option}
              style={[
                styles.accordionItem,
                selectedValue === option && styles.accordionItemSelected,
              ]}
              onPress={() => onSelect(option)}
            >
              <Text
                style={[
                  styles.accordionItemText,
                  selectedValue === option && styles.accordionItemTextSelected,
                ]}
              >
                {option}
              </Text>
              {selectedValue === option && (
                <Text style={styles.checkmark}>✓</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Find Workouts</Text>
        <TouchableOpacity onPress={resetFilters} activeOpacity={0.7}>
          <Text style={styles.resetButton}>Reset</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Quick Chips Section */}
        <QuickChipsSection
          title="Muscle"
          options={MUSCLE_OPTIONS}
          selectedValue={filters.muscle}
          onSelect={(value) => toggleQuickChip('muscle', value)}
        />

        <QuickChipsSection
          title="Equipment"
          options={EQUIPMENT_OPTIONS}
          selectedValue={filters.equipment}
          onSelect={(value) => toggleQuickChip('equipment', value)}
        />

        <QuickChipsSection
          title="Movement"
          options={PATTERN_OPTIONS}
          selectedValue={filters.pattern}
          onSelect={(value) => toggleQuickChip('pattern', value)}
        />

        {/* More Options Section */}
        <View style={styles.moreOptionsSection}>
          <Text style={styles.moreOptionsTitle}>More options</Text>

          <AccordionSection
            title="Muscles"
            options={filteredMuscles}
            selectedValue={filters.expandedMuscle}
            onSelect={(value) => toggleExpandedOption('expandedMuscle', value)}
            isExpanded={expandedSections.muscles}
            onToggle={() => toggleSection('muscles')}
          />

          <AccordionSection
            title="Equipment"
            options={filteredEquipment}
            selectedValue={filters.expandedEquipment}
            onSelect={(value) => toggleExpandedOption('expandedEquipment', value)}
            isExpanded={expandedSections.equipment}
            onToggle={() => toggleSection('equipment')}
          />

          <AccordionSection
            title="Movement pattern"
            options={filteredPatterns}
            selectedValue={filters.expandedPattern}
            onSelect={(value) => toggleExpandedOption('expandedPattern', value)}
            isExpanded={expandedSections.pattern}
            onToggle={() => toggleSection('pattern')}
          />
        </View>
      </ScrollView>

      {/* Sticky Bottom Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.resultCountContainer}>
          <Text style={styles.resultCountText}>
            Show results ({resultCount})
          </Text>
        </View>
        <View style={styles.applyButtonContainer}>
          <Button
            title="Apply"
            onPress={() => {
              // Handle apply action
              console.log('Applying filters:', filters);
            }}
            variant="primary"
            style={styles.applyButton}
          />
        </View>
      </View>
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
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
  },
  resetButton: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  chipsContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 16,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
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
  moreOptionsSection: {
    marginTop: 32,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  moreOptionsTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  accordionSection: {
    marginBottom: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  accordionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  accordionIcon: {
    fontSize: 20,
    color: colors.primary,
    fontWeight: 'bold',
  },
  accordionContent: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  accordionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  accordionItemSelected: {
    backgroundColor: colors.primary + '20',
  },
  accordionItemText: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  accordionItemTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  checkmark: {
    fontSize: 18,
    color: colors.primary,
    fontWeight: 'bold',
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
  applyButtonContainer: {
    width: 120,
  },
  applyButton: {
    paddingVertical: 14,
  },
});