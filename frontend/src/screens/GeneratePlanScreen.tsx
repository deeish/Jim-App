import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../types/navigation';
import { useTheme } from '../theme/ThemeContext';
import { colors as themeColors } from '../theme/colors';

type GeneratePlanScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'GeneratePlan'>;
type GeneratePlanScreenRouteProp = RouteProp<RootStackParamList, 'GeneratePlan'>;

type Props = {
  navigation: GeneratePlanScreenNavigationProp;
  route: GeneratePlanScreenRouteProp;
};

type Goal = 'fat loss' | 'strength' | 'endurance' | 'hybrid';
type PrimaryLocation = 'gym' | 'home';
type ProgramType = 'full body' | 'upper-lower' | 'push-pull-legs' | '5x5 style' | 'strength + cardio split' | 'circuit focus' | 'mixed' | 'base + intervals + long' | 'interval focus' | 'base building' | '2 strength + 2 cardio' | '3+2 split' | 'alternating';
type EquipmentItem = 'barbell' | 'dumbbells' | 'machines' | 'cable' | 'kettlebells' | 'pull-up bar' | 'bands' | 'cardio machines' | 'none';
type DetailedEquipment = 'barbell' | 'rack' | 'cables' | 'machines' | 'dumbbells' | 'pull-up bar' | 'cardio machines' | 'pool access';
type CardioEquipment = 'treadmill' | 'bike' | 'rower' | 'none';
type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
type StrengthSplitPreference = 'full body' | 'upper-lower' | 'ppl' | '3-day full body' | 'surprise me';
type TrainingSplitPreference = 'full body' | 'upper-lower' | 'ppl' | 'ai decide' | 'custom';
type HybridGoalRatio = 'more strength' | 'balanced' | 'more cardio';
type EquipmentAccess = 'dumbbells' | 'bands' | 'pull-up bar' | 'barbell' | 'machines' | 'none';
type CardioModality = 'run' | 'bike' | 'swim' | 'row' | 'elliptical';
type ProgressionStyle = 'build' | 'build + deload' | 'maintain';
type ProgressionTarget = 'add weight' | 'add reps' | 'mix' | 'add time' | 'add intensity';
type StrengthFocusPriority = 'upper' | 'lower' | 'balanced';
type HybridFocusPriority = 'strength priority' | 'cardio priority';
type FocusPriority = StrengthFocusPriority | HybridFocusPriority;
type AvoidItem = 'knees' | 'shoulders' | 'lower back' | 'avoid running' | 'avoid barbell' | 'avoid jumping' | 'avoid overhead';
type CurrentActivityLevel = '0' | '1-2' | '3-4' | '5+';
type PreferredExercise = 'bench' | 'squat' | 'deadlift' | 'pull-ups' | 'overhead press' | 'rows';
type WorkoutDetailLevel = 'simple' | 'detailed';
type StrengthFormat = 'straight sets' | 'supersets' | 'circuit';
type CardioFormat = 'intervals' | 'steady-state' | 'tempo';
type RestDayPreference = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday' | 'none';

interface WeeklySplit {
  label: string;
  preview: string;
  programType: ProgramType;
}

interface GeneratePlanInputs {
  goal: Goal | null;
  programType: ProgramType | null;
  programVariationIndex: number;
  trainingDays: DayOfWeek[];
  autoScheduleMode: boolean;
  restDayPreference: RestDayPreference | null;
  allowDoubleSessions: boolean;
  maxDoubleDaysPerWeek: number;
  weeks: number;
  timePerSession: { min: number; max: number };
  useAdvancedDurationCaps: boolean;
  primaryLocation: PrimaryLocation | null;
  availableEquipment: EquipmentItem[];
  detailedEquipment: DetailedEquipment[];
  cardioEquipment: CardioEquipment | null;
  experienceLevel: ExperienceLevel | null;
  strengthSplitPreference: StrengthSplitPreference | null;
  hybridGoalRatio: HybridGoalRatio | null;
  cardioModalityPreference: CardioModality[];
  weekdayMaxMinutes: number;
  weekendMaxMinutes: number;
  perDayTimeCaps: Partial<Record<DayOfWeek, number | 'default'>>;
  usePerDayTimeCaps: boolean;
  progressionStyle: ProgressionStyle | null;
  deloadEnabled: boolean;
  deloadFrequency: number;
  difficultyRamp: number;
  progressionTarget: ProgressionTarget | null;
  maxHardDaysInRow: number;
  maxHardDaysPerWeek: number;
  focusPriority: FocusPriority | null;
  avoidList: AvoidItem[];
  sessionCaps: {
    strength: { min: number; max: number };
    cardio: { min: number; max: number };
    recovery: { min: number; max: number };
  };
  currentActivityLevel: CurrentActivityLevel | null;
  preferredExercises: PreferredExercise[];
  weekdayWeekendSplit: boolean;
  workoutDetailLevel: WorkoutDetailLevel;
  strengthFormat: StrengthFormat;
  cardioFormat: CardioFormat;
  trainingSplitPreference: TrainingSplitPreference | null;
  customSplitHint: string;
  equipmentAccess: EquipmentAccess[];
  age: number | null;
}

const DAYS_OF_WEEK: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Hook for hold-to-repeat on +/- buttons: first tap runs once, then repeat after delay. */
function useHoldToRepeat(
  onStep: () => void,
  options?: { delayBeforeRepeat?: number; intervalMs?: number }
) {
  const delay = options?.delayBeforeRepeat ?? 400;
  const intervalMs = options?.intervalMs ?? 80;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;

  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const onPressIn = useCallback(() => {
    onStepRef.current();
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      intervalRef.current = setInterval(() => onStepRef.current(), intervalMs);
    }, delay);
  }, [delay, intervalMs]);

  const onPressOut = useCallback(() => clear(), [clear]);
  useEffect(() => () => clear(), [clear]);

  return { onPressIn, onPressOut };
}

function getDefaultTrainingDays(daysPerWeek: number): DayOfWeek[] {
  const patterns: Record<number, DayOfWeek[]> = {
    1: ['Monday'],
    2: ['Monday', 'Thursday'],
    3: ['Monday', 'Wednesday', 'Friday'],
    4: ['Monday', 'Tuesday', 'Thursday', 'Friday'],
    5: ['Monday', 'Tuesday', 'Wednesday', 'Friday', 'Saturday'],
    6: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    7: DAYS_OF_WEEK,
  };
  return patterns[daysPerWeek] || DAYS_OF_WEEK.slice(0, daysPerWeek);
}

function generateWeeklySplitVariations(goal: Goal, programType: ProgramType, trainingDays: DayOfWeek[]): WeeklySplit[] {
  const variations: WeeklySplit[] = [];
  
  if (goal === 'strength') {
    if (programType === 'full body') {
      variations.push({
        label: 'Full Body',
        preview: trainingDays.map(d => `${d.slice(0, 3)} Full Body`).join(' • '),
        programType: 'full body',
      });
    } else if (programType === 'upper-lower') {
      variations.push({
        label: 'Upper-Lower',
        preview: trainingDays.map((d, i) => `${d.slice(0, 3)} ${i % 2 === 0 ? 'Upper' : 'Lower'}`).join(' • '),
        programType: 'upper-lower',
      });
    }
  } else if (goal === 'hybrid') {
    if (programType === '2 strength + 2 cardio') {
      variations.push({
        label: '2+2 Split',
        preview: trainingDays.map((d, i) => `${d.slice(0, 3)} ${i % 2 === 0 ? 'Strength' : 'Cardio'}`).join(' • '),
        programType: '2 strength + 2 cardio',
      });
    }
  }
  
  return variations.length > 0 ? variations : [{
    label: 'Custom',
    preview: trainingDays.map(d => d.slice(0, 3)).join(' • '),
    programType: programType,
  }];
}

function getProgramTypeOptions(goal: Goal | null): ProgramType[] {
  if (!goal) return [];
  
  switch (goal) {
    case 'strength':
      return ['full body', 'upper-lower', 'push-pull-legs', '5x5 style'];
    case 'fat loss':
      return ['strength + cardio split', 'circuit focus', 'mixed'];
    case 'endurance':
      return ['base + intervals + long', 'interval focus', 'base building'];
    case 'hybrid':
      return ['2 strength + 2 cardio', '3+2 split', 'alternating'];
    default:
      return [];
  }
}

function getProgressionTargetOptions(goal: Goal | null): ProgressionTarget[] {
  if (!goal) return [];
  
  if (goal === 'strength' || goal === 'hybrid' || goal === 'fat loss') {
    return ['add weight', 'add reps', 'mix'];
  } else {
    return ['add time', 'add intensity', 'mix'];
  }
}

export default function GeneratePlanScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const [inputs, setInputs] = useState<GeneratePlanInputs>({
    goal: null,
    programType: null,
    programVariationIndex: 0,
    trainingDays: getDefaultTrainingDays(4),
    autoScheduleMode: false,
    restDayPreference: null,
    allowDoubleSessions: false,
    maxDoubleDaysPerWeek: 1,
    weeks: 1,
    timePerSession: { min: 30, max: 60 },
    useAdvancedDurationCaps: false,
    primaryLocation: null,
    availableEquipment: [],
    detailedEquipment: [],
    cardioEquipment: null,
    experienceLevel: null,
    strengthSplitPreference: null,
    hybridGoalRatio: null,
    cardioModalityPreference: [],
    weekdayMaxMinutes: 60,
    weekendMaxMinutes: 90,
    perDayTimeCaps: {},
    usePerDayTimeCaps: false,
    progressionStyle: null,
    deloadEnabled: false,
    deloadFrequency: 4,
    difficultyRamp: 50,
    progressionTarget: null,
    maxHardDaysInRow: 1,
    maxHardDaysPerWeek: 2,
    focusPriority: null,
    avoidList: [],
    sessionCaps: {
      strength: { min: 45, max: 60 },
      cardio: { min: 20, max: 45 },
      recovery: { min: 10, max: 20 },
    },
    currentActivityLevel: null,
    preferredExercises: [],
    weekdayWeekendSplit: false,
    workoutDetailLevel: 'simple',
    strengthFormat: 'straight sets',
    cardioFormat: 'intervals',
    trainingSplitPreference: null,
    customSplitHint: '',
    equipmentAccess: [],
    age: null,
  });
  const [generating, setGenerating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const stepWeeksDown = useCallback(() => setInputs(prev => ({ ...prev, weeks: Math.max(1, prev.weeks - 1) })), []);
  const stepWeeksUp = useCallback(() => setInputs(prev => ({ ...prev, weeks: Math.min(8, prev.weeks + 1) })), []);
  const stepAgeDown = useCallback(() => setInputs(prev => ({ ...prev, age: prev.age != null ? Math.max(13, prev.age - 1) : null })), []);
  const stepAgeUp = useCallback(() => setInputs(prev => ({ ...prev, age: prev.age != null ? Math.min(100, prev.age + 1) : 25 })), []);
  const stepMaxHardInRowDown = useCallback(() => setInputs(prev => ({ ...prev, maxHardDaysInRow: Math.max(1, prev.maxHardDaysInRow - 1) })), []);
  const stepMaxHardInRowUp = useCallback(() => setInputs(prev => ({ ...prev, maxHardDaysInRow: Math.min(2, prev.maxHardDaysInRow + 1) })), []);
  const stepMaxHardPerWeekDown = useCallback(() => setInputs(prev => ({ ...prev, maxHardDaysPerWeek: Math.max(2, prev.maxHardDaysPerWeek - 1) })), []);
  const stepMaxHardPerWeekUp = useCallback(() => setInputs(prev => ({ ...prev, maxHardDaysPerWeek: Math.min(3, prev.maxHardDaysPerWeek + 1) })), []);

  const holdWeeksDown = useHoldToRepeat(stepWeeksDown);
  const holdWeeksUp = useHoldToRepeat(stepWeeksUp);
  const holdAgeDown = useHoldToRepeat(stepAgeDown);
  const holdAgeUp = useHoldToRepeat(stepAgeUp);
  const holdMaxHardInRowDown = useHoldToRepeat(stepMaxHardInRowDown);
  const holdMaxHardInRowUp = useHoldToRepeat(stepMaxHardInRowUp);
  const holdMaxHardPerWeekDown = useHoldToRepeat(stepMaxHardPerWeekDown);
  const holdMaxHardPerWeekUp = useHoldToRepeat(stepMaxHardPerWeekUp);
  
  const weeklySplitVariations = inputs.goal && inputs.programType
    ? generateWeeklySplitVariations(inputs.goal, inputs.programType, inputs.trainingDays)
    : [];
  
  const currentSplit = weeklySplitVariations[inputs.programVariationIndex] || null;
  
  const daysPerWeek = inputs.trainingDays.length;

  const planSummary = `${daysPerWeek} day${daysPerWeek !== 1 ? 's' : ''}/week • ${inputs.weeks} week${inputs.weeks !== 1 ? 's' : ''} • ${inputs.timePerSession.min}–${inputs.timePerSession.max} min`;

  const handleGoalSelect = (goal: Goal) => {
    setInputs(prev => ({
      ...prev,
      goal,
      programType: null,
      programVariationIndex: 0,
      strengthSplitPreference: null,
      hybridGoalRatio: null,
      cardioModalityPreference: [],
    }));
  };

  const handleProgramTypeSelect = (programType: ProgramType) => {
    setInputs(prev => ({
      ...prev,
      programType,
      programVariationIndex: 0,
    }));
  };

  const handleCycleSplitVariation = () => {
    if (weeklySplitVariations.length <= 1) return;
    setInputs(prev => ({
      ...prev,
      programVariationIndex: (prev.programVariationIndex + 1) % weeklySplitVariations.length,
    }));
  };

  const handleTrainingDayToggle = (day: DayOfWeek) => {
    setInputs(prev => {
      const isSelected = prev.trainingDays.includes(day);
      if (isSelected) {
        if (prev.trainingDays.length <= 1) return prev;
        return { ...prev, trainingDays: prev.trainingDays.filter(d => d !== day) };
      } else {
        if (prev.trainingDays.length >= 7) return prev;
        return {
          ...prev,
          trainingDays: [...prev.trainingDays, day].sort((a, b) => 
            DAYS_OF_WEEK.indexOf(a) - DAYS_OF_WEEK.indexOf(b)
          ),
        };
      }
    });
  };

  const handlePrimaryLocationSelect = (location: PrimaryLocation) => {
    setInputs(prev => ({
      ...prev,
      primaryLocation: location,
      cardioEquipment: location === 'home' ? null : prev.cardioEquipment,
    }));
  };

  const handleEquipmentToggle = (equipment: EquipmentItem) => {
    setInputs(prev => ({
      ...prev,
      availableEquipment: prev.availableEquipment.includes(equipment)
        ? prev.availableEquipment.filter(e => e !== equipment)
        : [...prev.availableEquipment, equipment],
    }));
  };

  const handleCardioEquipmentSelect = (cardio: CardioEquipment) => {
    setInputs(prev => ({ ...prev, cardioEquipment: cardio }));
  };

  const handleProgressionTargetSelect = (target: ProgressionTarget) => {
    setInputs(prev => ({ ...prev, progressionTarget: target }));
  };

  const handleGenerate = async () => {
    const progressionStyle = inputs.progressionStyle ?? 'build';
    if (!inputs.goal || !inputs.primaryLocation || !inputs.availableEquipment.length || !inputs.trainingDays.length) {
      return;
    }

    setGenerating(true);

    // Normalize perDayTimeCaps: only include days with a numeric cap (omit 'default' / undefined)
    const perDayTimeCapsForPreview: Record<string, number> = {};
    for (const [day, cap] of Object.entries(inputs.perDayTimeCaps)) {
      if (typeof cap === 'number') perDayTimeCapsForPreview[day] = cap;
    }

    setTimeout(() => {
      setGenerating(false);
      navigation.navigate('PlanPreview', {
        inputs: {
          goal: inputs.goal!,
          programType: inputs.programType || '',
          programVariationIndex: inputs.programVariationIndex,
          trainingDays: inputs.trainingDays,
          autoScheduleMode: false,
          restDayPreference: inputs.restDayPreference,
          allowDoubleSessions: false,
          maxDoubleDaysPerWeek: 0,
          weeks: inputs.weeks,
          timePerSession: inputs.timePerSession,
          primaryLocation: inputs.primaryLocation,
          availableEquipment: inputs.availableEquipment,
          detailedEquipment: inputs.detailedEquipment,
          cardioEquipment: inputs.cardioEquipment,
          experienceLevel: inputs.experienceLevel ?? 'intermediate',
          strengthSplitPreference: inputs.strengthSplitPreference,
          hybridGoalRatio: inputs.hybridGoalRatio,
          cardioModalityPreference: inputs.cardioModalityPreference,
          weekdayMaxMinutes: inputs.weekdayMaxMinutes,
          weekendMaxMinutes: inputs.weekendMaxMinutes,
          perDayTimeCaps: perDayTimeCapsForPreview,
          progressionStyle: inputs.progressionStyle ?? 'build',
          deloadEnabled: inputs.deloadEnabled,
          deloadFrequency: inputs.deloadFrequency,
          difficultyRamp: inputs.difficultyRamp,
          progressionTarget: inputs.progressionTarget,
          maxHardDaysInRow: inputs.maxHardDaysInRow,
          maxHardDaysPerWeek: inputs.maxHardDaysPerWeek,
          focusPriority: inputs.focusPriority,
          avoidList: inputs.avoidList,
          sessionCaps: inputs.sessionCaps,
          currentActivityLevel: inputs.currentActivityLevel,
          preferredExercises: inputs.preferredExercises,
          weekdayWeekendSplit: inputs.weekdayWeekendSplit,
          workoutDetailLevel: inputs.workoutDetailLevel,
          strengthFormat: inputs.strengthFormat,
          cardioFormat: inputs.cardioFormat,
          trainingSplitPreference: inputs.trainingSplitPreference,
          customSplitHint: inputs.customSplitHint?.trim() || undefined,
          equipmentAccess: inputs.equipmentAccess,
          age: inputs.age ?? undefined,
        },
        draftId: `draft-${Date.now()}`,
      });
    }, 1500);
  };

  const canGenerate = 
    inputs.goal && 
    inputs.programType && 
    inputs.primaryLocation && 
    inputs.availableEquipment.length > 0 && 
    (inputs.primaryLocation === 'gym' || inputs.cardioEquipment !== null) &&
    inputs.trainingDays.length > 0 &&
    inputs.timePerSession.min > 0 && 
    inputs.timePerSession.max > 0;



  return (
    <View style={styles.outerContainer}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Generate Plan</Text>
            <Text style={styles.headerSubtitle}>{planSummary}</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView 
          style={styles.content} 
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={true}
          showsHorizontalScrollIndicator={false}
        >
        {/* Goal Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What's your goal?</Text>
          <View style={styles.optionsRow}>
            {(['fat loss', 'strength', 'endurance', 'hybrid'] as Goal[]).map(goal => (
              <TouchableOpacity
                key={goal}
                style={[styles.optionButton, inputs.goal === goal && styles.optionButtonSelected]}
                onPress={() => handleGoalSelect(goal)}
              >
                <Text style={[styles.optionButtonText, inputs.goal === goal && styles.optionButtonTextSelected]}>
                  {goal.charAt(0).toUpperCase() + goal.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {inputs.goal && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Program type</Text>
            <Text style={styles.sectionSubtitle}>Choose your training split</Text>
            <View style={styles.optionsRow}>
              {getProgramTypeOptions(inputs.goal).map(programType => (
                <TouchableOpacity
                  key={programType}
                  style={[styles.optionButton, inputs.programType === programType && styles.optionButtonSelected]}
                  onPress={() => handleProgramTypeSelect(programType)}
                >
                  <Text style={[styles.optionButtonText, inputs.programType === programType && styles.optionButtonTextSelected]}>
                    {programType.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            {currentSplit && (
              <TouchableOpacity
                style={styles.splitPreview}
                onPress={handleCycleSplitVariation}
                activeOpacity={0.7}
                disabled={weeklySplitVariations.length <= 1}
              >
                <View style={styles.splitPreviewContent}>
                  <Text style={styles.splitPreviewLabel}>Week layout:</Text>
                  <Text style={styles.splitPreviewText}>{currentSplit.preview}</Text>
                  {weeklySplitVariations.length > 1 && (
                    <Text style={styles.splitPreviewHint}>Tap to cycle variations</Text>
                  )}
                </View>
                {weeklySplitVariations.length > 1 && (
                  <Text style={styles.splitPreviewArrow}>›</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Training Days */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Training days</Text>
          <Text style={styles.sectionSubtitle}>Select which days you want to train</Text>
          <View style={styles.daysGrid}>
            {DAYS_OF_WEEK.map(day => {
              const isSelected = inputs.trainingDays.includes(day);
              const shortDay = day.slice(0, 3);
              return (
                <TouchableOpacity
                  key={day}
                  style={[styles.dayToggle, isSelected && styles.dayToggleSelected]}
                  onPress={() => handleTrainingDayToggle(day)}
                >
                  <Text style={[styles.dayToggleText, isSelected && styles.dayToggleTextSelected]}>
                    {shortDay}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.daysPerWeekText}>
            {daysPerWeek} day{daysPerWeek !== 1 ? 's' : ''}/week selected
          </Text>
        </View>

        {/* Weeks */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Weeks to generate</Text>
          <View style={styles.numberInputRow}>
            <TouchableOpacity
              style={styles.numberButton}
              onPressIn={holdWeeksDown.onPressIn}
              onPressOut={holdWeeksDown.onPressOut}
            >
              <Text style={styles.numberButtonText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.numberDisplay}>{inputs.weeks}</Text>
            <TouchableOpacity
              style={styles.numberButton}
              onPressIn={holdWeeksUp.onPressIn}
              onPressOut={holdWeeksUp.onPressOut}
            >
              <Text style={styles.numberButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Duration */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Workout duration</Text>
          <Text style={styles.sectionSubtitle}>How long should workouts be?</Text>
          <View style={styles.timeRangeRow}>
            <View style={styles.timeInput}>
              <Text style={styles.timeLabel}>Min</Text>
              <TextInput
                style={styles.timeInputField}
                value={inputs.timePerSession.min.toString()}
                onChangeText={(text) => {
                  const num = parseInt(text) || 0;
                  setInputs(prev => {
                    const newMin = Math.max(15, Math.min(120, num));
                    const newMax = newMin > prev.timePerSession.max ? newMin : prev.timePerSession.max;
                    return { ...prev, timePerSession: { min: newMin, max: newMax } };
                  });
                }}
                keyboardType="numeric"
              />
            </View>
            <Text style={styles.timeSeparator}>–</Text>
            <View style={styles.timeInput}>
              <Text style={styles.timeLabel}>Max</Text>
              <TextInput
                style={styles.timeInputField}
                value={inputs.timePerSession.max.toString()}
                onChangeText={(text) => {
                  const num = parseInt(text) || 0;
                  setInputs(prev => {
                    const newMax = Math.max(prev.timePerSession.min, Math.min(180, num));
                    return { ...prev, timePerSession: { ...prev.timePerSession, max: newMax } };
                  });
                }}
                keyboardType="numeric"
              />
            </View>
            <Text style={styles.timeUnit}>min</Text>
          </View>
        </View>

        {/* Age */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Age</Text>
          <Text style={styles.sectionSubtitle}>Optional – can help tailor the plan</Text>
          <View style={styles.numberInputRow}>
            <TouchableOpacity
              style={styles.numberButton}
              onPressIn={holdAgeDown.onPressIn}
              onPressOut={holdAgeDown.onPressOut}
            >
              <Text style={styles.numberButtonText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.numberDisplay}>
              {inputs.age != null ? inputs.age : '—'}
            </Text>
            <TouchableOpacity
              style={styles.numberButton}
              onPressIn={holdAgeUp.onPressIn}
              onPressOut={holdAgeUp.onPressOut}
            >
              <Text style={styles.numberButtonText}>+</Text>
            </TouchableOpacity>
          </View>
          {inputs.age != null && (
            <TouchableOpacity
              style={{ marginTop: 8 }}
              onPress={() => setInputs(prev => ({ ...prev, age: null }))}
            >
              <Text style={[styles.sectionSubtitle, { color: themeColors.primary }]}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Training split preference — right after workout duration */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Training split preference</Text>
          <Text style={styles.sectionSubtitle}>How should workouts be structured?</Text>
          <View style={styles.optionsRow}>
            {(['full body', 'upper-lower', 'ppl', 'ai decide', 'custom'] as TrainingSplitPreference[]).map(split => (
              <TouchableOpacity
                key={split}
                style={[styles.optionButton, inputs.trainingSplitPreference === split && styles.optionButtonSelected]}
                onPress={() => setInputs(prev => ({ ...prev, trainingSplitPreference: split }))}
              >
                <Text style={[styles.optionButtonText, inputs.trainingSplitPreference === split && styles.optionButtonTextSelected]}>
                  {split === 'full body' ? 'Full Body' : split === 'upper-lower' ? 'Upper/Lower' : split === 'ppl' ? 'PPL' : split === 'ai decide' ? 'AI Decide' : 'Custom (I have a split)'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {inputs.trainingSplitPreference === 'custom' && (
            <TextInput
              style={styles.customSplitInput}
              placeholder="Write your split (ex: chest/tri, back/bi…)"
              placeholderTextColor={colors.textMuted}
              value={inputs.customSplitHint}
              onChangeText={(text) => setInputs(prev => ({ ...prev, customSplitHint: text }))}
              multiline
              maxLength={300}
            />
          )}
        </View>

        {/* Hybrid control */}
        {inputs.goal === 'hybrid' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Hybrid emphasis</Text>
            <Text style={styles.sectionSubtitle}>Balance between strength and cardio</Text>
            <View style={styles.optionsRow}>
              {(['more strength', 'balanced', 'more cardio'] as HybridGoalRatio[]).map(ratio => (
                <TouchableOpacity
                  key={ratio}
                  style={[styles.optionButton, inputs.hybridGoalRatio === ratio && styles.optionButtonSelected]}
                  onPress={() => setInputs(prev => ({ ...prev, hybridGoalRatio: ratio }))}
                >
                  <Text style={[styles.optionButtonText, inputs.hybridGoalRatio === ratio && styles.optionButtonTextSelected]}>
                    {ratio === 'more strength' ? 'Strength-leaning' : ratio === 'balanced' ? 'Balanced' : 'Cardio-leaning'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Equipment */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Primary location</Text>
          <Text style={styles.sectionSubtitle}>Where will you train?</Text>
          <View style={styles.optionsRow}>
            {(['gym', 'home'] as PrimaryLocation[]).map(location => (
              <TouchableOpacity
                key={location}
                style={[styles.optionButton, inputs.primaryLocation === location && styles.optionButtonSelected]}
                onPress={() => handlePrimaryLocationSelect(location)}
              >
                <Text style={[styles.optionButtonText, inputs.primaryLocation === location && styles.optionButtonTextSelected]}>
                  {location.charAt(0).toUpperCase() + location.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Equipment access — shown right below Primary location when Home is selected */}
        {inputs.primaryLocation === 'home' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Equipment access</Text>
            <Text style={styles.sectionSubtitle}>What equipment do you have at home?</Text>
            <View style={styles.chipsRow}>
              {(['dumbbells', 'bands', 'pull-up bar', 'barbell', 'machines', 'none'] as EquipmentAccess[]).map(equipment => {
                const isSelected = inputs.equipmentAccess.includes(equipment);
                return (
                  <TouchableOpacity
                    key={equipment}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                    onPress={() => {
                      setInputs(prev => ({
                        ...prev,
                        equipmentAccess: isSelected
                          ? prev.equipmentAccess.filter(e => e !== equipment)
                          : [...prev.equipmentAccess, equipment],
                      }));
                    }}
                  >
                    <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                      {equipment === 'pull-up bar' ? 'Pull-up Bar' : equipment.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {inputs.primaryLocation && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Available equipment</Text>
              <Text style={styles.sectionSubtitle}>Select what you have access to</Text>
              <View style={styles.chipsRow}>
                {(['barbell', 'dumbbells', 'machines', 'cable', 'kettlebells', 'pull-up bar', 'bands', 'cardio machines', 'none'] as EquipmentItem[]).map(equipment => {
                  const isSelected = inputs.availableEquipment.includes(equipment);
                  return (
                    <TouchableOpacity
                      key={equipment}
                      style={[styles.chip, isSelected && styles.chipSelected]}
                      onPress={() => handleEquipmentToggle(equipment)}
                    >
                      <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                        {equipment.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {inputs.primaryLocation === 'home' && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Cardio equipment</Text>
                <Text style={styles.sectionSubtitle}>Do you have: treadmill/bike/rower or none?</Text>
                <View style={styles.optionsRow}>
                  {(['treadmill', 'bike', 'rower', 'none'] as CardioEquipment[]).map(cardio => (
                    <TouchableOpacity
                      key={cardio}
                      style={[styles.optionButton, inputs.cardioEquipment === cardio && styles.optionButtonSelected]}
                      onPress={() => setInputs(prev => ({
                        ...prev,
                        cardioEquipment: prev.cardioEquipment === cardio ? null : cardio,
                      }))}
                    >
                      <Text style={[styles.optionButtonText, inputs.cardioEquipment === cardio && styles.optionButtonTextSelected]}>
                        {cardio.charAt(0).toUpperCase() + cardio.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        {/* Advanced Options Accordion */}
        <TouchableOpacity
          style={styles.advancedToggle}
          onPress={() => setShowAdvanced(!showAdvanced)}
          activeOpacity={0.7}
        >
          <Text style={styles.advancedToggleText}>Advanced (optional)</Text>
          <Text style={styles.advancedToggleIcon}>{showAdvanced ? '▼' : '▶'}</Text>
        </TouchableOpacity>

        {showAdvanced && (
          <>
            {/* Progression Style */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Progression style</Text>
              <Text style={styles.sectionSubtitle}>How should the plan change week to week?</Text>
              <View style={styles.optionsRow}>
                {(['build', 'build + deload', 'maintain'] as ProgressionStyle[]).map(style => (
                  <TouchableOpacity
                    key={style}
                    style={[styles.optionButton, inputs.progressionStyle === style && styles.optionButtonSelected]}
                    onPress={() => {
                      setInputs(prev => ({
                        ...prev,
                        progressionStyle: style,
                        deloadEnabled: style === 'build + deload',
                      }));
                    }}
                  >
                    <Text style={[styles.optionButtonText, inputs.progressionStyle === style && styles.optionButtonTextSelected]}>
                      {style === 'build' ? 'Build' : style === 'build + deload' ? 'Build + Deload' : 'Maintain'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Advanced duration overrides */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Advanced duration overrides (optional)</Text>
              <Text style={styles.sectionSubtitle}>Override duration per workout type</Text>
              
              <View style={styles.sessionCapRow}>
                <Text style={styles.sessionCapLabel}>Strength:</Text>
                <View style={styles.sessionCapInputs}>
                  <TextInput
                    style={styles.sessionCapInput}
                    value={inputs.sessionCaps.strength.min.toString()}
                    onChangeText={(text) => {
                      const num = parseInt(text) || 0;
                      setInputs(prev => {
                        const newMin = Math.max(30, Math.min(prev.sessionCaps.strength.max, num));
                        return {
                          ...prev,
                          sessionCaps: {
                            ...prev.sessionCaps,
                            strength: { ...prev.sessionCaps.strength, min: newMin },
                          },
                        };
                      });
                    }}
                    keyboardType="numeric"
                  />
                  <Text style={styles.sessionCapSeparator}>–</Text>
                  <TextInput
                    style={styles.sessionCapInput}
                    value={inputs.sessionCaps.strength.max.toString()}
                    onChangeText={(text) => {
                      const num = parseInt(text) || 0;
                      setInputs(prev => {
                        const newMax = Math.max(prev.sessionCaps.strength.min, Math.min(90, num));
                        return {
                          ...prev,
                          sessionCaps: {
                            ...prev.sessionCaps,
                            strength: { ...prev.sessionCaps.strength, max: newMax },
                          },
                        };
                      });
                    }}
                    keyboardType="numeric"
                  />
                  <Text style={styles.sessionCapUnit}>min</Text>
                </View>
              </View>

              <View style={styles.sessionCapRow}>
                <Text style={styles.sessionCapLabel}>Cardio:</Text>
                <View style={styles.sessionCapInputs}>
                  <TextInput
                    style={styles.sessionCapInput}
                    value={inputs.sessionCaps.cardio.min.toString()}
                    onChangeText={(text) => {
                      const num = parseInt(text) || 0;
                      setInputs(prev => {
                        const newMin = Math.max(15, Math.min(prev.sessionCaps.cardio.max, num));
                        return {
                          ...prev,
                          sessionCaps: {
                            ...prev.sessionCaps,
                            cardio: { ...prev.sessionCaps.cardio, min: newMin },
                          },
                        };
                      });
                    }}
                    keyboardType="numeric"
                  />
                  <Text style={styles.sessionCapSeparator}>–</Text>
                  <TextInput
                    style={styles.sessionCapInput}
                    value={inputs.sessionCaps.cardio.max.toString()}
                    onChangeText={(text) => {
                      const num = parseInt(text) || 0;
                      setInputs(prev => {
                        const newMax = Math.max(prev.sessionCaps.cardio.min, Math.min(60, num));
                        return {
                          ...prev,
                          sessionCaps: {
                            ...prev.sessionCaps,
                            cardio: { ...prev.sessionCaps.cardio, max: newMax },
                          },
                        };
                      });
                    }}
                    keyboardType="numeric"
                  />
                  <Text style={styles.sessionCapUnit}>min</Text>
                </View>
              </View>

              <View style={styles.sessionCapRow}>
                <Text style={styles.sessionCapLabel}>Recovery:</Text>
                <View style={styles.sessionCapInputs}>
                  <TextInput
                    style={styles.sessionCapInput}
                    value={inputs.sessionCaps.recovery.min.toString()}
                    onChangeText={(text) => {
                      const num = parseInt(text) || 0;
                      setInputs(prev => {
                        const newMin = Math.max(5, Math.min(prev.sessionCaps.recovery.max, num));
                        return {
                          ...prev,
                          sessionCaps: {
                            ...prev.sessionCaps,
                            recovery: { ...prev.sessionCaps.recovery, min: newMin },
                          },
                        };
                      });
                    }}
                    keyboardType="numeric"
                  />
                  <Text style={styles.sessionCapSeparator}>–</Text>
                  <TextInput
                    style={styles.sessionCapInput}
                    value={inputs.sessionCaps.recovery.max.toString()}
                    onChangeText={(text) => {
                      const num = parseInt(text) || 0;
                      setInputs(prev => {
                        const newMax = Math.max(prev.sessionCaps.recovery.min, Math.min(30, num));
                        return {
                          ...prev,
                          sessionCaps: {
                            ...prev.sessionCaps,
                            recovery: { ...prev.sessionCaps.recovery, max: newMax },
                          },
                        };
                      });
                    }}
                    keyboardType="numeric"
                  />
                  <Text style={styles.sessionCapUnit}>min</Text>
                </View>
              </View>
            </View>

            {/* Hard day limits */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Hard day limits</Text>
              <Text style={styles.sectionSubtitle}>Prevent back-to-back hard days</Text>
              <Text style={styles.definitionText}>A "hard day" is a workout with high intensity, heavy weights, or maximum effort exercises.</Text>
              <View style={styles.constraintRow}>
                <View style={styles.constraintItem}>
                  <Text style={styles.constraintLabel}>Max hard days in a row:</Text>
                  <View style={styles.numberInputRow}>
                    <TouchableOpacity
                      style={styles.numberButton}
                      onPressIn={holdMaxHardInRowDown.onPressIn}
                      onPressOut={holdMaxHardInRowDown.onPressOut}
                    >
                      <Text style={styles.numberButtonText}>−</Text>
                    </TouchableOpacity>
                    <Text style={styles.numberDisplay}>{inputs.maxHardDaysInRow}</Text>
                    <TouchableOpacity
                      style={styles.numberButton}
                      onPressIn={holdMaxHardInRowUp.onPressIn}
                      onPressOut={holdMaxHardInRowUp.onPressOut}
                    >
                      <Text style={styles.numberButtonText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.constraintItem}>
                  <Text style={styles.constraintLabel}>Max hard days/week:</Text>
                  <View style={styles.numberInputRow}>
                    <TouchableOpacity
                      style={styles.numberButton}
                      onPressIn={holdMaxHardPerWeekDown.onPressIn}
                      onPressOut={holdMaxHardPerWeekDown.onPressOut}
                    >
                      <Text style={styles.numberButtonText}>−</Text>
                    </TouchableOpacity>
                    <Text style={styles.numberDisplay}>{inputs.maxHardDaysPerWeek}</Text>
                    <TouchableOpacity
                      style={styles.numberButton}
                      onPressIn={holdMaxHardPerWeekUp.onPressIn}
                      onPressOut={holdMaxHardPerWeekUp.onPressOut}
                    >
                      <Text style={styles.numberButtonText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Injuries / Avoid list</Text>
              <Text style={styles.sectionSubtitle}>Select what to avoid</Text>
              <View style={styles.chipsRow}>
                <Text style={styles.chipGroupLabel}>Body areas:</Text>
                {(['knees', 'shoulders', 'lower back'] as AvoidItem[]).map(item => {
                  const isSelected = inputs.avoidList.includes(item);
                  return (
                    <TouchableOpacity
                      key={item}
                      style={[styles.chip, isSelected && styles.chipSelected]}
                      onPress={() => {
                        setInputs(prev => ({
                          ...prev,
                          avoidList: isSelected
                            ? prev.avoidList.filter(a => a !== item)
                            : [...prev.avoidList, item],
                        }));
                      }}
                    >
                      <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                        {item.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={[styles.chipsRow, styles.chipsRowMargin]}>
                <Text style={styles.chipGroupLabel}>Avoid movements/equipment:</Text>
                {(['avoid running', 'avoid barbell', 'avoid jumping', 'avoid overhead'] as AvoidItem[]).map(item => {
                  const isSelected = inputs.avoidList.includes(item);
                  return (
                    <TouchableOpacity
                      key={item}
                      style={[styles.chip, isSelected && styles.chipSelected]}
                      onPress={() => {
                        setInputs(prev => ({
                          ...prev,
                          avoidList: isSelected
                            ? prev.avoidList.filter(a => a !== item)
                            : [...prev.avoidList, item],
                        }));
                      }}
                    >
                      <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                        {item.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Current activity level (optional)</Text>
              <Text style={styles.sectionSubtitle}>How many days/week are you currently training?</Text>
              <View style={styles.optionsRow}>
                {(['0', '1-2', '3-4', '5+'] as CurrentActivityLevel[]).map(level => (
                  <TouchableOpacity
                    key={level}
                    style={[styles.optionButton, inputs.currentActivityLevel === level && styles.optionButtonSelected]}
                    onPress={() => setInputs(prev => ({
                      ...prev,
                      currentActivityLevel: prev.currentActivityLevel === level ? null : level,
                    }))}
                  >
                    <Text style={[styles.optionButtonText, inputs.currentActivityLevel === level && styles.optionButtonTextSelected]}>
                      {level === '0' ? '0' : level === '1-2' ? '1–2' : level === '3-4' ? '3–4' : '5+'} days/week
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Preferred exercises (optional)</Text>
              <Text style={styles.sectionSubtitle}>Include these exercises when possible</Text>
              {inputs.avoidList.includes('avoid barbell') && (
                <Text style={styles.warningText}>Note: Barbell exercises (squat, deadlift, bench) are disabled because "Avoid Barbell" is selected.</Text>
              )}
              <View style={styles.chipsRow}>
                {(['bench', 'squat', 'deadlift', 'pull-ups', 'overhead press', 'rows'] as PreferredExercise[]).map(exercise => {
                  const isSelected = inputs.preferredExercises.includes(exercise);
                  const isBarbellExercise = ['bench', 'squat', 'deadlift'].includes(exercise);
                  const isDisabled = inputs.avoidList.includes('avoid barbell') && isBarbellExercise;
                  return (
                    <TouchableOpacity
                      key={exercise}
                      style={[
                        styles.chip, 
                        isSelected && styles.chipSelected,
                        isDisabled && styles.chipDisabled
                      ]}
                      onPress={() => {
                        if (isDisabled) return;
                        setInputs(prev => {
                          // If selecting a barbell exercise while avoid barbell is active, remove avoid barbell
                          if (isBarbellExercise && !isSelected && prev.avoidList.includes('avoid barbell')) {
                            return {
                              ...prev,
                              avoidList: prev.avoidList.filter(a => a !== 'avoid barbell'),
                              preferredExercises: [...prev.preferredExercises, exercise],
                            };
                          }
                          return {
                            ...prev,
                            preferredExercises: isSelected
                              ? prev.preferredExercises.filter(e => e !== exercise)
                              : [...prev.preferredExercises, exercise],
                          };
                        });
                      }}
                      disabled={isDisabled}
                    >
                      <Text style={[
                        styles.chipText, 
                        isSelected && styles.chipTextSelected,
                        isDisabled && styles.chipTextDisabled
                      ]}>
                        {exercise === 'pull-ups' ? 'Pull-Ups' : 
                         exercise === 'overhead press' ? 'Overhead Press' :
                         exercise.charAt(0).toUpperCase() + exercise.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleLabelContainer}>
                  <Text style={styles.sectionTitle}>Time availability</Text>
                  <Text style={styles.sectionSubtitle}>Set different time limits per day</Text>
                </View>
                <TouchableOpacity
                  style={[styles.toggleSwitch, inputs.usePerDayTimeCaps && styles.toggleSwitchOn]}
                  onPress={() => {
                    setInputs(prev => ({ ...prev, usePerDayTimeCaps: !prev.usePerDayTimeCaps }));
                  }}
                >
                  <View style={[styles.toggleThumb, inputs.usePerDayTimeCaps && styles.toggleThumbOn]} />
                </TouchableOpacity>
              </View>
              
              {inputs.usePerDayTimeCaps && (
                <View style={styles.perDayCapsSection}>
                  <Text style={styles.helperText}>Caps apply to total time for that day.</Text>
                  
                  {/* Shortcut buttons */}
                  <View style={styles.shortcutButtonsRow}>
                    <TouchableOpacity
                      style={styles.shortcutButton}
                      onPress={() => {
                        setInputs(prev => {
                          const caps: Partial<Record<DayOfWeek, number | 'default'>> = {};
                          prev.trainingDays.forEach(day => {
                            caps[day] = Math.round((prev.timePerSession.min + prev.timePerSession.max) / 2 / 5) * 5;
                          });
                          return { ...prev, perDayTimeCaps: { ...prev.perDayTimeCaps, ...caps } };
                        });
                      }}
                    >
                      <Text style={styles.shortcutButtonText}>Apply to all</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.shortcutButton}
                      onPress={() => {
                        setInputs(prev => {
                          const weekdayCaps: Partial<Record<DayOfWeek, number | 'default'>> = {};
                          const weekdays: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
                          const avgCap = Math.round((prev.timePerSession.min + prev.timePerSession.max) / 2 / 5) * 5;
                          weekdays.forEach(day => {
                            if (prev.trainingDays.includes(day)) {
                              weekdayCaps[day] = avgCap;
                            }
                          });
                          return { ...prev, perDayTimeCaps: { ...prev.perDayTimeCaps, ...weekdayCaps } };
                        });
                      }}
                    >
                      <Text style={styles.shortcutButtonText}>Weekdays</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.shortcutButton}
                      onPress={() => {
                        setInputs(prev => {
                          const weekendCaps: Partial<Record<DayOfWeek, number | 'default'>> = {};
                          const weekends: DayOfWeek[] = ['Saturday', 'Sunday'];
                          const avgCap = Math.round((prev.timePerSession.min + prev.timePerSession.max) / 2 / 5) * 5;
                          weekends.forEach(day => {
                            if (prev.trainingDays.includes(day)) {
                              weekendCaps[day] = avgCap;
                            }
                          });
                          return { ...prev, perDayTimeCaps: { ...prev.perDayTimeCaps, ...weekendCaps } };
                        });
                      }}
                    >
                      <Text style={styles.shortcutButtonText}>Weekends</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Day caps grid - only show training days */}
                  <View style={styles.perDayCapsGrid}>
                    {inputs.trainingDays.map(day => {
                      const dayCap = inputs.perDayTimeCaps[day];
                      const isCustom = dayCap !== undefined && dayCap !== 'default';
                      const customValue = typeof dayCap === 'number' ? dayCap : Math.round((inputs.timePerSession.min + inputs.timePerSession.max) / 2 / 5) * 5;
                      
                      return (
                        <View key={day} style={styles.perDayCapItem}>
                          <Text style={styles.perDayCapLabel}>{day.slice(0, 3)}</Text>
                          
                          {/* Custom toggle */}
                          <TouchableOpacity
                            style={styles.customToggle}
                            onPress={() => {
                              setInputs(prev => {
                                if (prev.perDayTimeCaps[day] === 'default' || prev.perDayTimeCaps[day] === undefined) {
                                  // Switch to custom
                                  const defaultVal = Math.round((prev.timePerSession.min + prev.timePerSession.max) / 2 / 5) * 5;
                                  return {
                                    ...prev,
                                    perDayTimeCaps: { ...prev.perDayTimeCaps, [day]: defaultVal },
                                  };
                                } else {
                                  // Switch to default
                                  return {
                                    ...prev,
                                    perDayTimeCaps: { ...prev.perDayTimeCaps, [day]: 'default' },
                                  };
                                }
                              });
                            }}
                          >
                            <View style={[styles.customToggleSwitch, isCustom && styles.customToggleSwitchOn]}>
                              <View style={[styles.customToggleThumb, isCustom && styles.customToggleThumbOn]} />
                            </View>
                            <Text style={styles.customToggleLabel}>Custom</Text>
                          </TouchableOpacity>

                          {/* Number input (only if custom) */}
                          {isCustom && (
                            <View style={styles.dayCapStepper}>
                              <TouchableOpacity
                                style={styles.dayCapButton}
                                onPress={() => {
                                  setInputs(prev => {
                                    const current = typeof prev.perDayTimeCaps[day] === 'number' ? prev.perDayTimeCaps[day]! : 45;
                                    const newValue = Math.max(0, Math.round((current - 5) / 5) * 5);
                                    return {
                                      ...prev,
                                      perDayTimeCaps: { ...prev.perDayTimeCaps, [day]: newValue },
                                    };
                                  });
                                }}
                              >
                                <Text style={styles.dayCapButtonText}>−</Text>
                              </TouchableOpacity>
                              <TextInput
                                style={styles.dayCapInput}
                                value={customValue.toString()}
                                onChangeText={(text) => {
                                  const num = parseInt(text) || 0;
                                  const clamped = Math.max(0, Math.min(180, Math.round(num / 5) * 5));
                                  setInputs(prev => ({
                                    ...prev,
                                    perDayTimeCaps: { ...prev.perDayTimeCaps, [day]: clamped },
                                  }));
                                }}
                                keyboardType="numeric"
                                selectTextOnFocus
                              />
                              <TouchableOpacity
                                style={styles.dayCapButton}
                                onPress={() => {
                                  setInputs(prev => {
                                    const current = typeof prev.perDayTimeCaps[day] === 'number' ? prev.perDayTimeCaps[day]! : 45;
                                    const newValue = Math.min(180, Math.round((current + 5) / 5) * 5);
                                    return {
                                      ...prev,
                                      perDayTimeCaps: { ...prev.perDayTimeCaps, [day]: newValue },
                                    };
                                  });
                                }}
                              >
                                <Text style={styles.dayCapButtonText}>+</Text>
                              </TouchableOpacity>
                            </View>
                          )}

                          {/* Default indicator */}
                          {!isCustom && (
                            <Text style={styles.defaultIndicator}>Default</Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Workout detail level</Text>
              <Text style={styles.sectionSubtitle}>How detailed should workouts be?</Text>
              <View style={styles.optionsRow}>
                {(['simple', 'detailed'] as WorkoutDetailLevel[]).map(level => (
                  <TouchableOpacity
                    key={level}
                    style={[styles.optionButton, inputs.workoutDetailLevel === level && styles.optionButtonSelected]}
                    onPress={() => setInputs(prev => ({ ...prev, workoutDetailLevel: level }))}
                  >
                    <Text style={[styles.optionButtonText, inputs.workoutDetailLevel === level && styles.optionButtonTextSelected]}>
                      {level === 'simple' ? 'Simple (title + duration + type)' : 'Detailed (full exercise list + sets/reps)'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {(inputs.goal === 'strength' || inputs.goal === 'hybrid') && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Strength split preference</Text>
                <Text style={styles.sectionSubtitle}>How should strength workouts be split?</Text>
                <View style={styles.optionsRow}>
                  {(['full body', 'upper-lower', 'ppl', '3-day full body', 'surprise me'] as StrengthSplitPreference[]).map(split => (
                    <TouchableOpacity
                      key={split}
                      style={[styles.optionButton, inputs.strengthSplitPreference === split && styles.optionButtonSelected]}
                      onPress={() => setInputs(prev => ({
                        ...prev,
                        strengthSplitPreference: prev.strengthSplitPreference === split ? null : split,
                      }))}
                    >
                      <Text style={[styles.optionButtonText, inputs.strengthSplitPreference === split && styles.optionButtonTextSelected]}>
                        {split === 'full body' ? 'Full Body' : split === 'upper-lower' ? 'Upper-Lower' : split === 'ppl' ? 'PPL' : split === '3-day full body' ? '3-day Full Body' : 'Surprise me'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}


            {(inputs.goal === 'endurance' || inputs.goal === 'hybrid') && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Cardio modality preferences</Text>
                <Text style={styles.sectionSubtitle}>Preferred cardio types (select multiple)</Text>
                <View style={styles.chipsRow}>
                  {(['run', 'bike', 'swim', 'row', 'elliptical'] as CardioModality[]).map(modality => {
                    const isSelected = inputs.cardioModalityPreference.includes(modality);
                    return (
                      <TouchableOpacity
                        key={modality}
                        style={[styles.chip, isSelected && styles.chipSelected]}
                        onPress={() => {
                          setInputs(prev => ({
                            ...prev,
                            cardioModalityPreference: isSelected
                              ? prev.cardioModalityPreference.filter(m => m !== modality)
                              : [...prev.cardioModalityPreference, modality],
                          }));
                        }}
                      >
                        <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                          {modality === 'run' ? 'Run' : modality.charAt(0).toUpperCase() + modality.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {(inputs.goal === 'strength' || inputs.goal === 'hybrid') && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Focus priority</Text>
                <Text style={styles.sectionSubtitle}>What should the plan emphasize?</Text>
                <View style={styles.optionsRow}>
                  {inputs.goal === 'strength' ? (
                    (['upper', 'lower', 'balanced'] as StrengthFocusPriority[]).map(priority => (
                      <TouchableOpacity
                        key={priority}
                        style={[styles.optionButton, inputs.focusPriority === priority && styles.optionButtonSelected]}
                        onPress={() => setInputs(prev => ({
                          ...prev,
                          focusPriority: prev.focusPriority === priority ? null : priority,
                        }))}
                      >
                        <Text style={[styles.optionButtonText, inputs.focusPriority === priority && styles.optionButtonTextSelected]}>
                          {priority.charAt(0).toUpperCase() + priority.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))
                  ) : (
                    (['strength priority', 'cardio priority'] as HybridFocusPriority[]).map(priority => (
                      <TouchableOpacity
                        key={priority}
                        style={[styles.optionButton, inputs.focusPriority === priority && styles.optionButtonSelected]}
                        onPress={() => setInputs(prev => ({
                          ...prev,
                          focusPriority: prev.focusPriority === priority ? null : priority,
                        }))}
                      >
                        <Text style={[styles.optionButtonText, inputs.focusPriority === priority && styles.optionButtonTextSelected]}>
                          {priority.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                        </Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              </View>
            )}
          </>
        )}
        </ScrollView>

        <SafeAreaView style={styles.footerContainer} edges={['bottom']}>
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.generateButton, !canGenerate && styles.generateButtonDisabled]}
              onPress={handleGenerate}
              disabled={!canGenerate || generating}
            >
              {generating ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <Text style={styles.generateButtonText}>
                  Generate Week 1 Preview
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    width: '100%',
    backgroundColor: themeColors.background,
  },
  container: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
    backgroundColor: themeColors.surface,
  },
  backButton: {
    padding: 4,
  },
  backButtonText: {
    fontSize: 16,
    color: themeColors.primary,
    fontWeight: '600',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: themeColors.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: themeColors.textSecondary,
    fontWeight: '500',
    marginTop: 2,
  },
  headerSpacer: {
    width: 60,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 180,
  },
  section: {
    marginBottom: 24,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: themeColors.text,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: themeColors.textSecondary,
    marginBottom: 12,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: themeColors.surface,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  optionButtonSelected: {
    backgroundColor: themeColors.primary,
    borderColor: themeColors.primary,
  },
  optionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: themeColors.textSecondary,
  },
  optionButtonTextSelected: {
    color: themeColors.background,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  daysPerWeekText: {
    fontSize: 14,
    color: themeColors.textSecondary,
    fontWeight: '500',
    marginTop: 4,
  },
  dayToggle: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: themeColors.surface,
    borderWidth: 1,
    borderColor: themeColors.border,
    minWidth: 50,
    alignItems: 'center',
  },
  dayToggleSelected: {
    backgroundColor: themeColors.primary,
    borderColor: themeColors.primary,
  },
  dayToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: themeColors.textSecondary,
  },
  dayToggleTextSelected: {
    color: themeColors.background,
  },
  numberInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  numberButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: themeColors.surface,
    borderWidth: 1,
    borderColor: themeColors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numberButtonText: {
    fontSize: 18,
    color: themeColors.text,
    fontWeight: '600',
  },
  numberDisplay: {
    fontSize: 18,
    fontWeight: '700',
    color: themeColors.text,
    minWidth: 40,
    textAlign: 'center',
  },
  timeRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  timeInput: {
    width: 72,
    maxWidth: 72,
  },
  timeLabel: {
    fontSize: 12,
    color: themeColors.textMuted,
    marginBottom: 4,
  },
  timeInputField: {
    backgroundColor: themeColors.surface,
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 16,
    color: themeColors.text,
    minHeight: 40,
  },
  customSplitInput: {
    marginTop: 10,
    backgroundColor: themeColors.surface,
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: themeColors.text,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  timeSeparator: {
    fontSize: 16,
    color: themeColors.textSecondary,
  },
  timeUnit: {
    fontSize: 14,
    color: themeColors.textSecondary,
  },
  chipsRowMargin: {
    marginTop: 8,
  },
  chipGroupLabel: {
    fontSize: 12,
    color: themeColors.textMuted,
    fontWeight: '600',
    marginRight: 8,
    width: '100%',
    marginBottom: 4,
  },
  daysPerWeekRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
  },
  daysPerWeekLabel: {
    fontSize: 14,
    color: themeColors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: themeColors.surface,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  chipSelected: {
    backgroundColor: themeColors.primary,
    borderColor: themeColors.primary,
  },
  chipText: {
    fontSize: 13,
    color: themeColors.textSecondary,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: themeColors.background,
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipTextDisabled: {
    opacity: 0.5,
  },
  warningText: {
    fontSize: 12,
    color: themeColors.warning,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  definitionText: {
    fontSize: 12,
    color: themeColors.textMuted,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: themeColors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: themeColors.border,
    marginBottom: 16,
  },
  advancedToggleText: {
    fontSize: 14,
    color: themeColors.textSecondary,
    fontWeight: '600',
  },
  advancedToggleIcon: {
    fontSize: 12,
    color: themeColors.textMuted,
  },
  advancedDurationSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
  },
  sessionCapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sessionCapLabel: {
    fontSize: 14,
    color: themeColors.textSecondary,
    fontWeight: '600',
    minWidth: 80,
  },
  sessionCapInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  sessionCapInput: {
    flex: 1,
    backgroundColor: themeColors.surface,
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
    color: themeColors.text,
  },
  sessionCapSeparator: {
    fontSize: 14,
    color: themeColors.textSecondary,
  },
  sessionCapUnit: {
    fontSize: 12,
    color: themeColors.textMuted,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  toggleLabelContainer: {
    flex: 1,
  },
  toggleSwitch: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: themeColors.border,
    padding: 2,
  },
  toggleSwitchOn: {
    backgroundColor: themeColors.primary,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: themeColors.background,
  },
  toggleThumbOn: {
    transform: [{ translateX: 22 }],
  },
  doubleSessionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
  },
  constraintRow: {
    flexDirection: 'row',
    gap: 16,
  },
  constraintItem: {
    flex: 1,
  },
  constraintLabel: {
    fontSize: 12,
    color: themeColors.textMuted,
    marginBottom: 8,
  },
  perDayCapsSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
  },
  helperText: {
    fontSize: 12,
    color: themeColors.textMuted,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  shortcutButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  shortcutButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: themeColors.surface,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  shortcutButtonText: {
    fontSize: 12,
    color: themeColors.textSecondary,
    fontWeight: '600',
  },
  perDayCapsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  perDayCapItem: {
    width: '48%',
    minWidth: 140,
    padding: 12,
    backgroundColor: themeColors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  perDayCapLabel: {
    fontSize: 13,
    color: themeColors.text,
    marginBottom: 8,
    fontWeight: '600',
    textAlign: 'center',
  },
  customToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    gap: 8,
  },
  customToggleSwitch: {
    width: 40,
    height: 22,
    borderRadius: 11,
    backgroundColor: themeColors.border,
    padding: 2,
  },
  customToggleSwitchOn: {
    backgroundColor: themeColors.primary,
  },
  customToggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: themeColors.background,
  },
  customToggleThumbOn: {
    transform: [{ translateX: 18 }],
  },
  customToggleLabel: {
    fontSize: 12,
    color: themeColors.textSecondary,
    fontWeight: '500',
  },
  dayCapStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dayCapButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: themeColors.background,
    borderWidth: 1,
    borderColor: themeColors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCapButtonText: {
    fontSize: 16,
    color: themeColors.text,
    fontWeight: '600',
  },
  dayCapInput: {
    width: 60,
    height: 32,
    backgroundColor: themeColors.background,
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 14,
    color: themeColors.text,
    textAlign: 'center',
    fontWeight: '600',
  },
  defaultIndicator: {
    fontSize: 11,
    color: themeColors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
  },
  timeAvailabilityRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
  },
  timeAvailabilityItem: {
    flex: 1,
    alignItems: 'center',
  },
  timeAvailabilityLabel: {
    fontSize: 12,
    color: themeColors.textMuted,
    marginBottom: 8,
  },
  timeAvailabilityUnit: {
    fontSize: 12,
    color: themeColors.textMuted,
    marginTop: 4,
  },
  splitPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: themeColors.surface,
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  splitPreviewContent: {
    flex: 1,
  },
  splitPreviewLabel: {
    fontSize: 12,
    color: themeColors.textMuted,
    marginBottom: 4,
    fontWeight: '600',
  },
  splitPreviewText: {
    fontSize: 13,
    color: themeColors.text,
    fontWeight: '500',
  },
  splitPreviewHint: {
    fontSize: 11,
    color: themeColors.textMuted,
    marginTop: 4,
    fontStyle: 'italic',
  },
  splitPreviewArrow: {
    fontSize: 18,
    color: themeColors.primary,
    fontWeight: '600',
    marginLeft: 8,
  },
  footerContainer: {
    backgroundColor: themeColors.surface,
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
  },
  footer: {
    padding: 16,
  },
  generateButton: {
    backgroundColor: themeColors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateButtonDisabled: {
    opacity: 0.6,
  },
  generateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: themeColors.background,
  },
});
