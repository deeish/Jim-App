import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../types/navigation';
import { elevation, leading, radius, SOFT_ALPHA, spacing, text, tracking, useTheme, weight } from '../theme';
import { useTabBarInset } from '../navigation/useTabBarInset';
import type { ColorPalette } from '../theme/colors';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import { storedInjuryTagsToAvoidList } from '../constants/injuryTags';
import type { GoalOption, ExperienceOption } from '../contexts/UserPreferencesContext';
import type { EquipmentOption } from '../constants/equipment';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  normalizeContext,
  getRecommendation,
  mapPatternToWeekdays,
  splitFamilyToLabel,
  DAY_TYPE_LABELS,
} from '../lib/planRecommendation';
import { buildPlanInputs, planInputsToFormPatch } from '../lib/planInputs';
import {
  loadPlanPreviewDraft,
  clearPlanPreviewDraft,
  type PersistedPlanPreviewDraft,
} from '../lib/planPreviewDraftStorage';
import { MonthCalendarPicker } from '../components/MonthCalendarPicker';
import BenchPressLoader from '../components/BenchPressLoader';
import {
  WELLNESS_SCOPE_TITLE,
  WELLNESS_SCOPE_BODY,
  NOT_MEDICAL_FOOTNOTE_SHORT,
} from '../constants/wellnessCopy';

const NativeDateTimePicker =
  Platform.OS === 'web'
    ? null
    : (require('@react-native-community/datetimepicker').default as React.ComponentType<any>);
const NativeDateTimePickerAndroid =
  Platform.OS === 'web'
    ? null
    : (require('@react-native-community/datetimepicker').DateTimePickerAndroid as {
        open: (params: {
          value: Date;
          mode: 'date';
          minimumDate?: Date;
          onChange: (event: DateTimePickerEvent, selectedDate?: Date) => void;
        }) => void;
      });

type GeneratePlanScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'GeneratePlan'>;
type GeneratePlanScreenRouteProp = RouteProp<RootStackParamList, 'GeneratePlan'>;

type Props = {
  navigation: GeneratePlanScreenNavigationProp;
  route: GeneratePlanScreenRouteProp;
};

type Goal = 'fat loss' | 'strength' | 'endurance' | 'hybrid';
type PrimaryLocation = 'gym' | 'home';
/** Plan style = training emphasis only. Week structure is from Recommended split + Training split preference. */
type PlanStyle =
  | 'lift_zone2' | 'lift_intervals' | 'circuit_leaning'
  | 'heavy_compounds' | 'powerbuilding' | 'strength_conditioning'
  | 'base_building' | 'intervals_focus' | 'mixed_endurance'
  | 'even_split' | 'strength_bias' | 'muscle_bias';
type ProgramType = PlanStyle;
type EquipmentItem = 'barbell' | 'dumbbells' | 'machines' | 'cable' | 'kettlebells' | 'pull-up bar' | 'bands' | 'cardio machines' | 'none';
type DetailedEquipment = 'barbell' | 'rack' | 'cables' | 'machines' | 'dumbbells' | 'pull-up bar' | 'cardio machines' | 'pool access';
type CardioEquipment = 'treadmill' | 'bike' | 'rower' | 'none';
type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
type StrengthSplitPreference = 'full body' | 'upper-lower' | 'ppl' | '3-day full body' | 'surprise me';
type TrainingSplitPreference = 'full body' | 'upper-lower' | 'ppl' | 'body part' | 'ai decide' | 'custom';
type HybridGoalRatio = 'more strength' | 'balanced' | 'more cardio';
type EquipmentAccess = 'dumbbells' | 'bands' | 'pull-up bar' | 'barbell' | 'machines' | 'none';
type CardioModality = 'run' | 'bike' | 'swim' | 'row' | 'elliptical';

const DEFAULT_CARDIO_MODALITY_PREFERENCE: CardioModality[] = ['run'];
type ProgressionStyle = 'build' | 'build + deload' | 'maintain';
type ProgressionTarget = 'add weight' | 'add reps' | 'mix' | 'add time' | 'add intensity';
type StrengthFocusPriority = 'upper' | 'lower' | 'balanced';
type HybridFocusPriority = 'strength priority' | 'cardio priority';
type FocusPriority = StrengthFocusPriority | HybridFocusPriority;
type AvoidItem = 'knees' | 'shoulders' | 'lower back' | 'avoid running' | 'avoid barbell' | 'avoid jumping' | 'avoid overhead';
type WorkoutDetailLevel = 'simple' | 'detailed';
type StrengthFormat = 'straight sets' | 'supersets' | 'circuit';
type CardioFormat = 'intervals' | 'steady-state' | 'tempo';
type RestDayPreference = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday' | 'none';

interface PlanStyleOption {
  value: PlanStyle;
  label: string;
}

interface GeneratePlanInputs {
  goal: Goal | null;
  /** Optional secondary emphasis blended into generation. */
  secondaryGoal: Goal | null;
  programType: ProgramType | null;
  programVariationIndex: number;
  trainingDays: DayOfWeek[];
  startDateISO: string;
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
  weekdayWeekendSplit: boolean;
  workoutDetailLevel: WorkoutDetailLevel;
  strengthFormat: StrengthFormat;
  cardioFormat: CardioFormat;
  trainingSplitPreference: TrainingSplitPreference | null;
  customSplitHint: string;
  /** When user saves a custom split from the sheet */
  customSplit: CustomSplitData | null;
  equipmentAccess: EquipmentAccess[];
  age: number | null;
}

const DAYS_OF_WEEK: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function getTodayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse `YYYY-MM-DD` as a **local** calendar date.
 * `new Date("YYYY-MM-DD")` alone is UTC midnight and shifts the day in many timezones.
 */
function parseIsoDate(value: string): Date {
  const fallback = new Date();
  const trimmed = value.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const d = parseInt(m[3], 10);
    const local = new Date(y, mo, d);
    if (!Number.isNaN(local.getTime())) return local;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const DAY_JS_INDEX: Record<DayOfWeek, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

function nextTrainingDayIsoFromToday(trainingDays: DayOfWeek[]): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (!trainingDays.length) return toIsoDate(today);
  const todayIndex = today.getDay();
  let minDays = 7;
  for (const day of trainingDays) {
    const diff = (DAY_JS_INDEX[day] - todayIndex + 7) % 7;
    if (diff < minDays) minDays = diff;
  }
  const result = new Date(today);
  result.setDate(today.getDate() + minDays);
  return toIsoDate(result);
}

function formatStartDateLabel(iso: string): string {
  const date = parseIsoDate(iso);
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

// Custom split builder — Day templates (Day 1, Day 2, …) + rotation rule; app maps to selected weekdays
type PrimaryMuscle = 'Chest' | 'Back' | 'Legs' | 'Shoulders' | 'Arms' | 'Full Body';
type SecondaryMuscle = 'Triceps' | 'Biceps' | 'Forearms' | 'Core' | 'Calves';
type AbsPref = 'none' | 'sometimes' | 'often';
type CardioPref = 'none' | 'easy' | 'mixed';
type RotationRule = 'repeat_weekly' | 'rotate_forward' | 'auto_balance';

export interface DayTemplate {
  /** Main focus: 1–2 muscles. Min 1, max 2. */
  primaries: PrimaryMuscle[];
  secondaries: SecondaryMuscle[];
}
export interface CustomSplitData {
  name?: string;
  id?: string;
  templates: DayTemplate[];
  rotationRule: RotationRule;
  abs: AbsPref;
  cardio: CardioPref;
}
export interface SavedCustomSplit extends CustomSplitData {
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt?: number;
}

const PRIMARY_OPTIONS: PrimaryMuscle[] = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Full Body'];
const SECONDARY_OPTIONS: SecondaryMuscle[] = ['Triceps', 'Biceps', 'Forearms', 'Core', 'Calves'];
const ROTATION_LABELS: Record<RotationRule, string> = {
  repeat_weekly: 'Repeat pattern',
  rotate_forward: 'Shift each week',
  auto_balance: 'Balance recovery',
};
const ROTATION_EXAMPLES: Record<RotationRule, string> = {
  repeat_weekly: 'Same mapping every week.',
  rotate_forward: 'Day 1 moves to the next workout day next week.',
  auto_balance: 'Avoid repeating same muscle groups too close together.',
};

/** Base templates pre-fill Day 1..N. build(n) returns array of DayTemplate. */
const TEMPLATES: { id: string; label: string; build: (n: number) => DayTemplate[] }[] = [
  { id: 'bodypart', label: 'Body Part Split', build: (n) => Array.from({ length: n }, (_, i) => (i < 5 ? { primaries: [(['Chest', 'Back', 'Legs', 'Shoulders', 'Arms'] as PrimaryMuscle[])[i]], secondaries: [] } : { primaries: [], secondaries: [] })) },
  { id: 'ppl', label: 'PPL', build: (n) => Array.from({ length: n }, (_, i) => ({ primaries: [(['Chest', 'Back', 'Legs'] as PrimaryMuscle[])[i % 3]], secondaries: [] })) },
  { id: 'ul', label: 'Upper/Lower', build: (n) => Array.from({ length: n }, (_, i) => ({ primaries: [(i % 2 === 0 ? 'Chest' : 'Legs') as PrimaryMuscle], secondaries: [] })) },
  { id: 'blank', label: 'Blank', build: (n) => Array.from({ length: n }, () => ({ primaries: [], secondaries: [] })) },
];

function normalizeCustomSplit(
  value: CustomSplitData | null | undefined,
  orderedDays: DayOfWeek[]
): CustomSplitData {
  if (!value) {
    return { templates: [], rotationRule: 'repeat_weekly', abs: 'none', cardio: 'none' };
  }
  if ('templates' in value && Array.isArray(value.templates)) {
    const templates = (value.templates as DayTemplate[]).map((t) => {
      const primaries: PrimaryMuscle[] = 'primaries' in t && Array.isArray(t.primaries) ? (t.primaries as PrimaryMuscle[]).slice(0, 2) : ('primary' in t && (t as { primary?: PrimaryMuscle | null }).primary ? [(t as { primary: PrimaryMuscle }).primary] : []);
      return { primaries, secondaries: t.secondaries ?? [] };
    });
    return { name: value.name, id: value.id, templates, rotationRule: value.rotationRule ?? 'repeat_weekly', abs: value.abs, cardio: value.cardio };
  }
  const days = (value as { days?: Partial<Record<DayOfWeek, { primary?: PrimaryMuscle | null; primaries?: PrimaryMuscle[]; secondaries?: SecondaryMuscle[] }>> }).days;
  const templates = orderedDays.map((d) => {
    const row = days?.[d];
    const primaries = row?.primaries?.slice(0, 2) ?? (row?.primary ? [row.primary] : []);
    return { primaries, secondaries: row?.secondaries ?? [] };
  });
  return { templates, rotationRule: 'repeat_weekly', abs: value.abs, cardio: value.cardio };
}

function autoNameFromTemplates(templates: DayTemplate[]): string {
  return templates
    .slice(0, 6)
    .map((t) => (t.primaries.length ? t.primaries.join('+') + (t.secondaries.length ? '+' + t.secondaries.slice(0, 2).map((s) => s.slice(0, 2)).join('+') : '') : '—'))
    .join(' • ');
}

const GOAL_LABELS: Record<Goal, string> = {
  'fat loss': 'Fat loss',
  strength: 'Strength',
  endurance: 'Endurance',
  hybrid: 'Balanced (Strength + Cardio)',
};

const GOAL_DESCRIPTORS: Record<Goal, string> = {
  'fat loss': 'Lift to keep muscle + add cardio/steps',
  strength: 'Heavier compounds + longer rest',
  endurance: 'More cardio volume + strength support',
  hybrid: 'Strength and cardio in one plan',
};

const DEFAULT_GYM_EQUIPMENT: EquipmentItem[] = ['barbell', 'dumbbells', 'machines', 'cable', 'kettlebells', 'pull-up bar', 'bands', 'cardio machines'];

function prefGoalToForm(g: GoalOption): Goal | null {
  if (g === 'Strength' || g === 'Hypertrophy') return 'strength';
  if (g === 'Fat loss') return 'fat loss';
  if (g === 'Endurance') return 'endurance';
  if (g === 'General fitness') return 'hybrid';
  return null;
}

function prefExperienceToForm(e: ExperienceOption): ExperienceLevel {
  return e.toLowerCase() as ExperienceLevel;
}

const PREF_EQUIPMENT_MAP: Partial<Record<EquipmentOption, EquipmentItem>> = {
  'Bodyweight': 'none',
  'Barbell': 'barbell',
  'Dumbbell': 'dumbbells',
  'Machine': 'machines',
  'Smith Machine': 'machines',
  'Cable': 'cable',
  'Kettlebell': 'kettlebells',
  'Pull-up Bar': 'pull-up bar',
  'Resistance Band': 'bands',
};

function prefEquipmentToForm(list: EquipmentOption[]): EquipmentItem[] {
  if (list.length === 0) return [...DEFAULT_GYM_EQUIPMENT];
  const mapped = list.flatMap(e => {
    const item = PREF_EQUIPMENT_MAP[e];
    return item ? [item] : [];
  });
  const unique = [...new Set(mapped)] as EquipmentItem[];
  // The form still has no word for TRX, medicine balls, or battle ropes, so a
  // profile listing only those mapped to nothing — and an empty list made
  // "Generate Plan" a full-colour button that silently returned. Training with
  // no equipment is a real plan; having none to offer is not a reason to stop.
  return unique.length > 0 ? unique : ['none'];
}

const DURATION_PRESETS = [30, 45, 60, 75] as const;
const DURATION_MIN = 15;
const DURATION_MAX = 180;
const DURATION_STEP = 5;

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

function getPlanStyleOptions(goal: Goal | null): PlanStyleOption[] {
  if (!goal) return [];
  switch (goal) {
    case 'fat loss':
      return [
        { value: 'lift_zone2', label: 'Steady cardio + lifting (easy pace)' },
        { value: 'lift_intervals', label: 'Intervals + lifting (hard but shorter)' },
        { value: 'circuit_leaning', label: 'Circuit-style lifting (faster pace)' },
      ];
    case 'strength':
      return [
        { value: 'heavy_compounds', label: 'Heavy strength focus (lower reps)' },
        { value: 'powerbuilding', label: 'Strength + muscle focus (more accessories)' },
        { value: 'strength_conditioning', label: 'Strength + cardio (mixed)' },
      ];
    case 'endurance':
      return [
        { value: 'base_building', label: 'Build endurance base (easy steady work)' },
        { value: 'intervals_focus', label: 'Speed/interval focus (hard efforts)' },
        { value: 'mixed_endurance', label: 'Balanced endurance (steady + intervals)' },
      ];
    case 'hybrid':
      return [
        { value: 'even_split', label: 'Balanced' },
        { value: 'strength_bias', label: 'More strength' },
        { value: 'muscle_bias', label: 'More muscle (more volume)' },
      ];
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

/** One-line summary for the "resume your generated plan" card. */
function resumePreviewSummary(d: PersistedPlanPreviewDraft): string {
  const pi = d.params.planInputs;
  const parts: string[] = [];
  if (pi?.weeksCount) parts.push(`${pi.weeksCount}-week plan`);
  if (pi?.daysPerWeek) parts.push(`${pi.daysPerWeek} days/week`);
  const saved = new Date(d.savedAtIso);
  if (!Number.isNaN(saved.getTime())) {
    parts.push(
      `generated ${saved.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`,
    );
  }
  return parts.length ? parts.join(' · ') : 'Your last generated preview was never applied.';
}

export default function GeneratePlanScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createGeneratePlanStyles(colors), [colors]);
  // The tab bar floats over this screen; the wizard footer must sit above it.
  // The inset (88pt iOS / 70 web) also covers the home-indicator area the
  // footer's SafeAreaView used to pad, so it replaces that edge entirely.
  const tabBarInset = useTabBarInset();
  const {
    hydrated: prefsHydrated,
    goal: prefGoal,
    secondaryGoal: prefSecondaryGoal,
    experience: prefExperience,
    equipment: prefEquipment,
    trainingFrequency,
    trainingDaysFlexible,
    preferredTrainingDays,
    injuryTagIds,
    injuryNotes,
  } = useUserPreferences();
  const [inputs, setInputs] = useState<GeneratePlanInputs>(() => ({
    goal: prefGoalToForm(prefGoal),
    // Two profile goals (e.g. Strength + Hypertrophy) can collapse to the same
    // form goal — drop the secondary in that case so it never duplicates primary.
    secondaryGoal: (() => {
      const mapped = prefSecondaryGoal ? prefGoalToForm(prefSecondaryGoal) : null;
      return mapped && mapped !== prefGoalToForm(prefGoal) ? mapped : null;
    })(),
    programType: null,
    programVariationIndex: 0,
    trainingDays: getDefaultTrainingDays(4),
    startDateISO: getTodayIsoDate(),
    autoScheduleMode: false,
    restDayPreference: null,
    allowDoubleSessions: false,
    maxDoubleDaysPerWeek: 1,
    weeks: 1,
    timePerSession: { min: 30, max: 60 },
    useAdvancedDurationCaps: false,
    primaryLocation: 'gym',
    availableEquipment: prefEquipmentToForm(prefEquipment),
    detailedEquipment: [],
    cardioEquipment: null,
    experienceLevel: prefExperienceToForm(prefExperience),
    strengthSplitPreference: null,
    hybridGoalRatio: null,
    cardioModalityPreference: [...DEFAULT_CARDIO_MODALITY_PREFERENCE],
    weekdayMaxMinutes: 60,
    weekendMaxMinutes: 90,
    perDayTimeCaps: {},
    usePerDayTimeCaps: false,
    progressionStyle: 'build',
    deloadEnabled: false,
    deloadFrequency: 4,
    difficultyRamp: 50,
    progressionTarget: null,
    maxHardDaysInRow: 1, // 1 = avoid back-to-back, 2 = allow
    maxHardDaysPerWeek: 2,
    focusPriority: null,
    avoidList: [],
    sessionCaps: {
      strength: { min: 45, max: 60 },
      cardio: { min: 20, max: 45 },
      recovery: { min: 10, max: 20 },
    },
    weekdayWeekendSplit: false,
    workoutDetailLevel: 'detailed',
    strengthFormat: 'straight sets',
    cardioFormat: 'intervals',
    trainingSplitPreference: null,
    customSplitHint: '',
    customSplit: null,
    equipmentAccess: [],
    age: null,
  }));
  /**
   * Wizard state. The screen is split into 3 steps so users aren't dumped onto a single
   * 3000-line form. State (`inputs`, handlers, modals) is unchanged — only which section
   * of JSX is visible. `currentStep === 1` is equivalent to the old `showAdvanced === true`
   * so dependent modal-closing logic still works.
   */
  const [currentStep, setCurrentStep] = useState<0 | 1 | 2>(0);
  const showAdvanced = currentStep === 1;
  const scrollViewRef = useRef<ScrollView>(null);

  /**
   * A generated preview that was never applied (e.g. the app was killed on the
   * preview screen). Offering to resume reopens it from storage without another
   * generation call. Skipped for auto/onboarding and edit-inputs entries.
   */
  const [resumeDraft, setResumeDraft] = useState<PersistedPlanPreviewDraft | null>(null);
  useEffect(() => {
    if (route.params?.autoGenerate || route.params?.editFromSnapshot) return;
    let cancelled = false;
    loadPlanPreviewDraft().then((d) => {
      if (!cancelled) setResumeDraft(d);
    });
    return () => {
      cancelled = true;
    };
  }, [route.params?.autoGenerate, route.params?.editFromSnapshot]);

  const handleResumePreview = useCallback(() => {
    if (!resumeDraft) return;
    setResumeDraft(null);
    // Draft stays in storage until applied or discarded, so it survives another kill.
    navigation.navigate('PlanPreview', resumeDraft.params);
  }, [resumeDraft, navigation]);

  const handleDiscardResumeDraft = useCallback(() => {
    setResumeDraft(null);
    void clearPlanPreviewDraft();
  }, []);

  // From Home/onboarding the Plan stack can mount with this screen as its only
  // route — nothing to pop, so fall back to the plan list (same pattern as History).
  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('PlanList');
  }, [navigation]);
  const [showRecommendationDetails, setShowRecommendationDetails] = useState(false);
  const [showCustomSplitSheet, setShowCustomSplitSheet] = useState(false);
  const [customSplitDraft, setCustomSplitDraft] = useState<CustomSplitData>({ templates: [], rotationRule: 'repeat_weekly', abs: 'none', cardio: 'none' });
  const [allowMultipleMainFocus, setAllowMultipleMainFocus] = useState(false);
  const [savedCustomSplits, setSavedCustomSplits] = useState<SavedCustomSplit[]>([]);
  const [showSavedSplitsPicker, setShowSavedSplitsPicker] = useState(false);
  const [openDurationOverrides, setOpenDurationOverrides] = useState(false);
  const [openAvoidInjuries, setOpenAvoidInjuries] = useState(false);
  const [openPerDayTime, setOpenPerDayTime] = useState(false);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showWellnessDetail, setShowWellnessDetail] = useState(false);

  const seededProfileIntoPlanInputs = useRef(false);
  const [profileSeeded, setProfileSeeded] = useState(false);
  const editFromSnapshot = route.params?.editFromSnapshot;

  useEffect(() => {
    if (!prefsHydrated || editFromSnapshot || seededProfileIntoPlanInputs.current) return;
    seededProfileIntoPlanInputs.current = true;
    const fromInjuries = storedInjuryTagsToAvoidList(injuryTagIds) as AvoidItem[];
    const trainingDays: DayOfWeek[] =
      trainingDaysFlexible || preferredTrainingDays.length === 0
        ? getDefaultTrainingDays(trainingFrequency)
        : [...(preferredTrainingDays as DayOfWeek[])].sort(
            (a, b) => DAYS_OF_WEEK.indexOf(a) - DAYS_OF_WEEK.indexOf(b),
          );
    setInputs((prev) => ({
      ...prev,
      trainingDays,
      startDateISO: nextTrainingDayIsoFromToday(trainingDays),
      avoidList: Array.from(new Set([...fromInjuries, ...prev.avoidList])),
      customSplitHint: injuryNotes.trim() ? injuryNotes.trim() : prev.customSplitHint,
    }));
    setProfileSeeded(true);
  }, [
    prefsHydrated,
    editFromSnapshot,
    injuryTagIds,
    injuryNotes,
    preferredTrainingDays,
    trainingDaysFlexible,
    trainingFrequency,
  ]);

  // Track the suggested start (next selected training day, today included)
  // as the user toggles days — but only until they pick a date themselves;
  // after that, retoggling days must not silently stomp their choice.
  const startDateTouched = useRef(false);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (startDateTouched.current) return;
    setInputs((prev) => ({
      ...prev,
      startDateISO: nextTrainingDayIsoFromToday(prev.trainingDays),
    }));
  }, [inputs.trainingDays]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      const actionType = e.data.action.type;
      // Only prompt on explicit user back navigation, not on programmatic resets (e.g. apply from PlanPreview)
      if (actionType !== 'GO_BACK' && actionType !== 'POP') return;
      // react-native-web's Alert.alert is a NO-OP, so preventing the action
      // there would strand the user on this screen with a dead back button —
      // let web navigate away without the discard prompt.
      if (Platform.OS === 'web') return;
      e.preventDefault();
      Alert.alert(
        'Discard plan settings?',
        'Going back will lose your current configuration.',
        [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]
      );
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    if (!editFromSnapshot) return;
    const patch = planInputsToFormPatch(editFromSnapshot) as Partial<GeneratePlanInputs>;
    setInputs((prev) => ({ ...prev, ...patch }));
  }, [editFromSnapshot]);

  // AsyncStorage is fast, not instant, and the picker asserted "No saved
  // splits yet" in the gap — telling a user their saved work did not exist.
  const [splitsLoaded, setSplitsLoaded] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem('jim_saved_custom_splits')
      .then((raw) => {
        if (raw) {
          try { setSavedCustomSplits(JSON.parse(raw)); } catch (e) {
            console.warn('Failed to parse saved custom splits:', e);
          }
        }
      })
      .finally(() => setSplitsLoaded(true));
  }, []);

  useEffect(() => {
    if (!showAdvanced) {
      setShowCustomSplitSheet(false);
      setShowSavedSplitsPicker(false);
    }
  }, [showAdvanced]);

  const orderedTrainingDays = inputs.trainingDays.length ? [...inputs.trainingDays].sort((a, b) => DAYS_OF_WEEK.indexOf(a) - DAYS_OF_WEEK.indexOf(b)) : [];
  const defaultTemplateCount = Math.max(1, orderedTrainingDays.length);

  const getDefaultDraft = useCallback((): CustomSplitData => {
    const templates = Array.from({ length: defaultTemplateCount }, () => ({ primaries: [], secondaries: [] as SecondaryMuscle[] }));
    return { templates, rotationRule: 'repeat_weekly', abs: 'none', cardio: 'none' };
  }, [defaultTemplateCount]);

  const week1MappingPreview = useCallback((draft: CustomSplitData) => {
    const N = draft.templates.length;
    if (!N || !orderedTrainingDays.length) return '—';
    return orderedTrainingDays
      .map((_, i) => `Day ${(i % N) + 1}`)
      .join(' • ');
  }, [orderedTrainingDays]);

  const week2StartsAtPreview = useCallback((draft: CustomSplitData) => {
    if (draft.rotationRule !== 'rotate_forward') return null;
    const N = draft.templates.length;
    const D = orderedTrainingDays.length;
    if (!N || !D) return null;
    const startIndex = D % N;
    if (startIndex === 0) return null;
    return `Day ${startIndex + 1}`;
  }, [orderedTrainingDays]);

  const stepWeeksDown = useCallback(() => setInputs(prev => ({ ...prev, weeks: Math.max(1, prev.weeks - 1) })), []);
  const stepWeeksUp = useCallback(() => setInputs(prev => ({ ...prev, weeks: Math.min(8, prev.weeks + 1) })), []);
  const stepAgeDown = useCallback(() => setInputs(prev => ({ ...prev, age: prev.age != null ? Math.max(13, prev.age - 1) : null })), []);
  const stepAgeUp = useCallback(() => setInputs(prev => ({ ...prev, age: prev.age != null ? Math.min(100, prev.age + 1) : 25 })), []);
  const stepDurationMinDown = useCallback(() => setInputs(prev => {
    const current = prev.timePerSession.min;
    const next = Math.max(DURATION_MIN, Math.round((current - DURATION_STEP) / DURATION_STEP) * DURATION_STEP);
    const max = Math.max(next, prev.timePerSession.max);
    return { ...prev, timePerSession: { min: next, max } };
  }), []);
  const stepDurationMinUp = useCallback(() => setInputs(prev => {
    const current = prev.timePerSession.min;
    const next = Math.min(prev.timePerSession.max, Math.min(DURATION_MAX, Math.round((current + DURATION_STEP) / DURATION_STEP) * DURATION_STEP));
    return { ...prev, timePerSession: { ...prev.timePerSession, min: next } };
  }), []);
  const stepDurationMaxDown = useCallback(() => setInputs(prev => {
    const current = prev.timePerSession.max;
    const next = Math.max(prev.timePerSession.min, Math.max(DURATION_MIN, Math.round((current - DURATION_STEP) / DURATION_STEP) * DURATION_STEP));
    return { ...prev, timePerSession: { ...prev.timePerSession, max: next } };
  }), []);
  const stepDurationMaxUp = useCallback(() => setInputs(prev => {
    const current = prev.timePerSession.max;
    const next = Math.min(DURATION_MAX, Math.round((current + DURATION_STEP) / DURATION_STEP) * DURATION_STEP);
    return { ...prev, timePerSession: { ...prev.timePerSession, max: next } };
  }), []);

  const holdWeeksDown = useHoldToRepeat(stepWeeksDown);
  const holdWeeksUp = useHoldToRepeat(stepWeeksUp);
  const holdAgeDown = useHoldToRepeat(stepAgeDown);
  const holdAgeUp = useHoldToRepeat(stepAgeUp);
  const holdDurationMinDown = useHoldToRepeat(stepDurationMinDown);
  const holdDurationMinUp = useHoldToRepeat(stepDurationMinUp);
  const holdDurationMaxDown = useHoldToRepeat(stepDurationMaxDown);
  const holdDurationMaxUp = useHoldToRepeat(stepDurationMaxUp);

  const daysPerWeek = inputs.trainingDays.length;
  const recContext = React.useMemo(
    () =>
      normalizeContext({
        goal: inputs.goal,
        planStyle: inputs.programType,
        trainingDays: inputs.trainingDays,
        timePerSession: inputs.timePerSession,
        trainingSplitPreference: inputs.trainingSplitPreference,
      }),
    [inputs.goal, inputs.programType, inputs.trainingDays, inputs.timePerSession, inputs.trainingSplitPreference]
  );
  const recommendation = React.useMemo(() => getRecommendation(recContext), [recContext]);
  const effectiveSplitPreference =
    inputs.trainingSplitPreference === 'ai decide' || inputs.trainingSplitPreference === null
      ? (recommendation?.recommendedSplit ?? null)
      : inputs.trainingSplitPreference;

  const planSummary = `${daysPerWeek} day${daysPerWeek !== 1 ? 's' : ''}/week • ${inputs.weeks} week${inputs.weeks !== 1 ? 's' : ''} • ${inputs.timePerSession.min}–${inputs.timePerSession.max} min`;

  const durationOverridesSummary = useMemo(() => {
    const { strength, cardio, recovery } = inputs.sessionCaps;
    return `Str ${strength.min}–${strength.max} · Cardio ${cardio.min}–${cardio.max} · Recovery ${recovery.min}–${recovery.max} min`;
  }, [inputs.sessionCaps]);

  const avoidListSummary = useMemo(() => {
    const n = inputs.avoidList.length;
    return n === 0 ? 'None selected' : `${n} selected`;
  }, [inputs.avoidList]);

  const perDayTimeSummary = useMemo(() => {
    if (!inputs.usePerDayTimeCaps) return 'Same cap as workout duration';
    return 'Custom limit per training day';
  }, [inputs.usePerDayTimeCaps]);

  const handleGoalSelect = (goal: Goal) => {
    setInputs(prev => ({
      ...prev,
      goal,
      // Keep the two goals distinct.
      secondaryGoal: prev.secondaryGoal === goal ? null : prev.secondaryGoal,
      programType: null,
      programVariationIndex: 0,
      strengthSplitPreference: null,
      hybridGoalRatio: null,
      cardioModalityPreference:
        goal === 'hybrid' || goal === 'endurance' ? [...DEFAULT_CARDIO_MODALITY_PREFERENCE] : [],
    }));
  };

  const handleSecondaryGoalSelect = (goal: Goal) => {
    setInputs(prev => ({
      ...prev,
      secondaryGoal: prev.secondaryGoal === goal ? null : goal,
    }));
  };

  const handleProgramTypeSelect = (programType: ProgramType) => {
    setInputs(prev => ({
      ...prev,
      programType,
      programVariationIndex: 0,
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

  const handleStartDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (event.type === 'dismissed') {
      setShowStartDatePicker(false);
      return;
    }
    if (selectedDate) {
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      startDateTouched.current = true;
      setInputs((prev) => ({ ...prev, startDateISO: `${year}-${month}-${day}` }));
    }
    if (Platform.OS !== 'ios') setShowStartDatePicker(false);
  };

  const applyStartDateISO = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD format, for example 2026-04-20.');
      return false;
    }
    const parsed = parseIsoDate(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      Alert.alert('Invalid date', 'Please enter a valid calendar date.');
      return false;
    }
    const today = parseIsoDate(getTodayIsoDate());
    parsed.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    if (parsed < today) {
      Alert.alert('Past date', 'Choose today or a future date.');
      return false;
    }
    startDateTouched.current = true;
    setInputs((prev) => ({ ...prev, startDateISO: toIsoDate(parsed) }));
    setShowStartDatePicker(false);
    return true;
  }, []);

  const openStartDatePicker = useCallback(() => {
    const current = parseIsoDate(inputs.startDateISO);
    if (Platform.OS === 'android') {
      NativeDateTimePickerAndroid?.open({
        value: current,
        mode: 'date',
        minimumDate: new Date(),
        onChange: handleStartDateChange,
      });
      return;
    }
    setShowStartDatePicker(true);
  }, [inputs.startDateISO]);

  const handlePrimaryLocationSelect = (location: PrimaryLocation) => {
    setInputs(prev => ({
      ...prev,
      primaryLocation: location,
      cardioEquipment: location === 'home' ? null : prev.cardioEquipment,
      availableEquipment: location === 'gym' ? DEFAULT_GYM_EQUIPMENT : prev.availableEquipment,
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

  const handleGenerate = (opts?: { replace?: boolean; fromOnboarding?: boolean }) => {
    if (!inputs.goal || !inputs.primaryLocation || !inputs.availableEquipment.length || !inputs.trainingDays.length) {
      return;
    }

    // Normalize perDayTimeCaps: only include days with a numeric cap (omit 'default' / undefined)
    const perDayTimeCapsForPreview: Record<string, number> = {};
    for (const [day, cap] of Object.entries(inputs.perDayTimeCaps)) {
      if (typeof cap === 'number') perDayTimeCapsForPreview[day] = cap;
    }

    const planInputs = buildPlanInputs({
      form: {
        goal: inputs.goal!,
        secondaryGoal: inputs.secondaryGoal,
        programType: inputs.programType ?? '',
        trainingDays: inputs.trainingDays,
        startDateISO: inputs.startDateISO,
        timePerSession: inputs.timePerSession,
        primaryLocation: inputs.primaryLocation,
        weeks: inputs.weeks,
        workoutDetailLevel: inputs.workoutDetailLevel,
        progressionStyle: inputs.progressionStyle,
        maxHardDaysInRow: inputs.maxHardDaysInRow,
        maxHardDaysPerWeek: inputs.maxHardDaysPerWeek,
        avoidList: inputs.avoidList,
        sessionCaps: inputs.sessionCaps,
        useAdvancedDurationCaps: inputs.useAdvancedDurationCaps,
        trainingSplitPreference: inputs.trainingSplitPreference,
        customSplit: inputs.trainingSplitPreference === 'custom' && inputs.customSplit ? inputs.customSplit : null,
        cardioModalityPreference: inputs.cardioModalityPreference,
        availableEquipment: inputs.availableEquipment,
        experienceLevel: inputs.experienceLevel ?? 'intermediate',
        restrictions: inputs.customSplitHint,
      },
      effectiveSplitPreference: effectiveSplitPreference ?? null,
      useRecommended: !!(recommendation && effectiveSplitPreference === recommendation.recommendedSplit),
    });
    const previewParams = {
      planInputs,
      inputs: {
        goal: inputs.goal!,
        programType: inputs.programType || '',
        programVariationIndex: inputs.programVariationIndex,
        trainingDays: inputs.trainingDays,
        startDateISO: inputs.startDateISO,
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
        weekdayWeekendSplit: inputs.weekdayWeekendSplit,
        workoutDetailLevel: inputs.workoutDetailLevel,
        strengthFormat: inputs.strengthFormat,
        cardioFormat: inputs.cardioFormat,
        trainingSplitPreference: effectiveSplitPreference ?? inputs.trainingSplitPreference,
        customSplitHint: inputs.customSplitHint?.trim() || undefined,
        customSplit: (inputs.trainingSplitPreference === 'custom' && inputs.customSplit ? inputs.customSplit : undefined) as RootStackParamList['PlanPreview']['inputs']['customSplit'],
        equipmentAccess: inputs.equipmentAccess,
        age: inputs.age ?? undefined,
      },
      draftId: `draft-${Date.now()}`,
      fromOnboarding: opts?.fromOnboarding,
    };
    // A fresh generation supersedes any resumable preview backup.
    setResumeDraft(null);
    if (opts?.replace) navigation.replace('PlanPreview', previewParams);
    else navigation.navigate('PlanPreview', previewParams);
  };

  const didAutoGenerate = useRef(false);
  const [autoFallback, setAutoFallback] = useState(false);
  const autoGenerate = !!route.params?.autoGenerate;
  useEffect(() => {
    if (!autoGenerate || didAutoGenerate.current || !profileSeeded) return;
    const ready =
      !!inputs.goal &&
      !!inputs.primaryLocation &&
      inputs.availableEquipment.length > 0 &&
      inputs.trainingDays.length > 0;
    if (!ready) {
      // Couldn't auto-build (e.g. no mappable goal) — show the form instead of dead-ending.
      setAutoFallback(true);
      return;
    }
    didAutoGenerate.current = true;
    handleGenerate({ replace: true, fromOnboarding: route.params?.fromOnboarding });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerate, profileSeeded, inputs.goal, inputs.primaryLocation, inputs.availableEquipment, inputs.trainingDays]);

  /**
   * Per-step "ready to advance" flags. These mirror the legacy `canGenerate` predicate
   * sliced by step, so the Next button gates the user before they hit Generate. We never
   * weaken the final canGenerate check — it's still the AND of the two readiness flags.
   */
  const basicsReady = !!inputs.goal && inputs.trainingDays.length > 0;
  const detailsReady =
    !!inputs.primaryLocation &&
    (inputs.primaryLocation === 'gym' || inputs.availableEquipment.length > 0) &&
    inputs.timePerSession.min > 0 &&
    inputs.timePerSession.max > 0;
  const canGenerate = basicsReady && detailsReady;

  const STEP_LABELS = ['Basics', 'Details', 'Review'] as const;
  const TOTAL_STEPS = STEP_LABELS.length;
  const stepCanAdvance =
    currentStep === 0 ? basicsReady : currentStep === 1 ? detailsReady : canGenerate;

  // Send the ScrollView back to the top whenever the visible step changes — each step
  // should feel like a fresh page rather than a jump into mid-form.
  useEffect(() => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  }, [currentStep]);

  const handleWizardNext = useCallback(() => {
    if (currentStep < TOTAL_STEPS - 1) {
      setCurrentStep((s) => ((s + 1) as 0 | 1 | 2));
    }
  }, [currentStep, TOTAL_STEPS]);

  const handleWizardBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((s) => ((s - 1) as 0 | 1 | 2));
    }
  }, [currentStep]);

  // Header back steps the wizard back first; leaving the screen (and hitting
  // the discard guard in `handleBack`) only happens from step 1.
  const handleHeaderBack = useCallback(() => {
    if (currentStep > 0) handleWizardBack();
    else handleBack();
  }, [currentStep, handleWizardBack, handleBack]);



  if (autoGenerate && !autoFallback) {
    return (
      <View style={styles.outerContainer}>
        <SafeAreaView style={[styles.container, styles.autoGenCenter]} edges={['top', 'bottom']}>
          <BenchPressLoader size={200} colors={colors} />
          <Text style={styles.autoGenTitle}>Building your plan…</Text>
          <Text style={styles.autoGenSub}>Setting things up from your answers.</Text>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.outerContainer}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleHeaderBack}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={22} color={colors.primary} />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>New Plan</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <View
          style={styles.stepProgressTrack}
          accessibilityRole="progressbar"
          accessibilityLabel={`Step ${currentStep + 1} of ${TOTAL_STEPS}: ${STEP_LABELS[currentStep]}`}
        >
          <View
            style={[
              styles.stepProgressFill,
              { width: `${((currentStep + 1) / TOTAL_STEPS) * 100}%` },
            ]}
          />
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={styles.content}
          // Content scrolls under the floating CTA and the glass tab bar; pad
          // for both so the last section can always scroll clear of them.
          contentContainerStyle={[styles.contentContainer, { paddingBottom: tabBarInset + 88 }]}
          showsVerticalScrollIndicator={true}
          showsHorizontalScrollIndicator={false}
        >

        {currentStep === 0 && resumeDraft ? (
          <View style={styles.resumeCard}>
            <View style={styles.resumeCardHeader}>
              <Ionicons name="sparkles" size={18} color={colors.primary} />
              <Text style={styles.resumeCardTitle}>Resume your generated plan?</Text>
            </View>
            <Text style={styles.resumeCardMeta}>{resumePreviewSummary(resumeDraft)}</Text>
            <View style={styles.resumeCardActions}>
              <TouchableOpacity
                style={styles.resumeBtn}
                onPress={handleResumePreview}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <Text style={styles.resumeBtnText}>Resume preview</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.resumeDiscardBtn}
                onPress={handleDiscardResumeDraft}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <Text style={styles.resumeDiscardBtnText}>Discard</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* The other way to get a plan: coach-built templates. Lives here (and
            in PlanScreen's no-plan hero) instead of the Plan header — choosing
            a template is a creation-time decision, so the fork belongs at the
            start of the creation flow. */}
        {currentStep === 0 && (
          <TouchableOpacity
            style={styles.templateEntryCard}
            onPress={() => navigation.navigate('Templates')}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Start from a template"
          >
            <View style={styles.templateEntryIcon}>
              <Ionicons name="grid-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.templateEntryText}>
              <Text style={styles.templateEntryTitle}>Start from a template</Text>
              <Text style={styles.templateEntrySub}>Coach-built programs, ready to apply.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Step 1: Plan basics — goal, training days, weeks, start date */}
        {currentStep === 0 && (
        <>
        {/* Goal Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Goal</Text>
          <View style={styles.sectionCard}>
          <View style={styles.goalChipsRow}>
            {(['fat loss', 'strength', 'endurance', 'hybrid'] as Goal[]).map(goal => (
              <TouchableOpacity
                key={goal}
                style={[styles.goalChip, inputs.goal === goal && styles.goalChipSelected]}
                onPress={() => handleGoalSelect(goal)}
              >
                <Text style={[styles.goalChipTitle, inputs.goal === goal && styles.goalChipTitleSelected]}>
                  {GOAL_LABELS[goal]}
                </Text>
                <Text style={[styles.goalChipDescriptor, inputs.goal === goal && styles.goalChipDescriptorSelected]}>
                  {GOAL_DESCRIPTORS[goal]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {inputs.goal ? (
            <View style={{ marginTop: spacing.lg }}>
              <Text style={styles.inCardLabel}>Secondary focus (optional)</Text>
              <View style={styles.goalChipsRow}>
                {(['fat loss', 'strength', 'endurance', 'hybrid'] as Goal[])
                  .filter(g => g !== inputs.goal)
                  .map(goal => (
                    <TouchableOpacity
                      key={goal}
                      style={[styles.goalChip, inputs.secondaryGoal === goal && styles.goalChipSelected]}
                      onPress={() => handleSecondaryGoalSelect(goal)}
                    >
                      <Text
                        style={[
                          styles.goalChipTitle,
                          inputs.secondaryGoal === goal && styles.goalChipTitleSelected,
                        ]}
                      >
                        {GOAL_LABELS[goal]}
                      </Text>
                    </TouchableOpacity>
                  ))}
              </View>
            </View>
          ) : null}
          </View>
        </View>

        {/* Training days */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Training days</Text>
          <View style={styles.sectionCard}>
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
            {daysPerWeek} day{daysPerWeek !== 1 ? 's' : ''}/week
          </Text>
          </View>
        </View>

        {/* Schedule: weeks to generate + start date */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Schedule</Text>
          <View style={styles.sectionCard}>
            <View style={styles.formRow}>
              <Text style={styles.formRowLabel}>Weeks</Text>
              <View style={styles.stepperGroup}>
                <TouchableOpacity
                  style={styles.stepperButton}
                  onPressIn={holdWeeksDown.onPressIn}
                  onPressOut={holdWeeksDown.onPressOut}
                  accessibilityRole="button"
                  accessibilityLabel="Fewer weeks"
                >
                  <Ionicons name="remove" size={18} color={colors.primary} />
                </TouchableOpacity>
                <Text style={styles.stepperValue}>{inputs.weeks}</Text>
                <TouchableOpacity
                  style={styles.stepperButton}
                  onPressIn={holdWeeksUp.onPressIn}
                  onPressOut={holdWeeksUp.onPressOut}
                  accessibilityRole="button"
                  accessibilityLabel="More weeks"
                >
                  <Ionicons name="add" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.formRowDivider} />
            <TouchableOpacity
              style={styles.formRow}
              onPress={openStartDatePicker}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Choose start date"
            >
              <Text style={styles.formRowLabel}>Starts</Text>
              <View style={styles.formRowValueGroup}>
                <Text style={styles.formRowValue}>{formatStartDateLabel(inputs.startDateISO)}</Text>
                <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
            {showStartDatePicker && Platform.OS === 'ios' ? (
              <View style={styles.startDatePickerWrap}>
                {NativeDateTimePicker ? (
                  <NativeDateTimePicker
                    value={parseIsoDate(inputs.startDateISO)}
                    mode="date"
                    display="spinner"
                    onChange={handleStartDateChange}
                    minimumDate={new Date()}
                  />
                ) : null}
                <TouchableOpacity
                  style={styles.startDateDoneButton}
                  onPress={() => setShowStartDatePicker(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.startDateDoneButtonText}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
          {inputs.weeks > 1 ? (
            <Text style={styles.sectionFootnote}>Multi-week plans take longer to generate.</Text>
          ) : null}
        </View>
        </>
        )}

        {/* Step 2: Plan details — location, equipment, duration, plan style, split, progression, etc. */}
        {currentStep === 1 && (
          <>
        {/* Primary location — first: constrains available exercises */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Location</Text>
          <View style={styles.sectionCard}>
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
        </View>

        {/* Experience level */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Experience</Text>
          <View style={styles.sectionCard}>
          <View style={styles.optionsRow}>
            {(['beginner', 'intermediate', 'advanced'] as ExperienceLevel[]).map(level => (
              <TouchableOpacity
                key={level}
                style={[styles.optionButton, inputs.experienceLevel === level && styles.optionButtonSelected]}
                onPress={() => setInputs(prev => ({ ...prev, experienceLevel: level }))}
              >
                <Text
                  style={[styles.optionButtonText, inputs.experienceLevel === level && styles.optionButtonTextSelected]}
                  // "Intermediate" is wider under iOS SF than under web font
                  // metrics, so on-device it broke mid-word ("Intermediat/e").
                  // Single line + shrink-to-fit is how a segmented label
                  // handles a chip it cannot widen.
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          </View>
        </View>

        {/* Age (optional) */}
        <View style={styles.section}>
          <View style={styles.sectionCard}>
            <View style={styles.formRow}>
              <Text style={styles.formRowLabel}>Age</Text>
              <View style={styles.stepperGroup}>
                <TouchableOpacity
                  style={styles.stepperButton}
                  onPressIn={holdAgeDown.onPressIn}
                  onPressOut={holdAgeDown.onPressOut}
                  accessibilityRole="button"
                  accessibilityLabel="Decrease age"
                >
                  <Ionicons name="remove" size={18} color={colors.primary} />
                </TouchableOpacity>
                <Text style={styles.stepperValue}>
                  {inputs.age != null ? inputs.age : '—'}
                </Text>
                <TouchableOpacity
                  style={styles.stepperButton}
                  onPressIn={holdAgeUp.onPressIn}
                  onPressOut={holdAgeUp.onPressOut}
                  accessibilityRole="button"
                  accessibilityLabel="Increase age"
                >
                  <Ionicons name="add" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
            {inputs.age != null && (
              <TouchableOpacity
                style={{ marginTop: spacing.sm }}
                onPress={() => setInputs(prev => ({ ...prev, age: null }))}
                accessibilityRole="button"
                accessibilityLabel="Clear age"
              >
                <Text style={styles.clearLink}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.sectionFootnote}>Optional. Tunes recovery and progression.</Text>
        </View>

        {/* Gym: assume standard equipment (no selector). Home: equipment selector shown below. */}
        {inputs.primaryLocation === 'home' && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Equipment</Text>
              <View style={styles.sectionCard}>
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
              <Text style={styles.sectionFootnote}>Select at least one.</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Cardio equipment</Text>
              <View style={styles.sectionCard}>
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
                    <Text
                      style={[styles.optionButtonText, inputs.cardioEquipment === cardio && styles.optionButtonTextSelected]}
                      // Same single-word overflow risk as the Experience row,
                      // but four-across: "Treadmill" on a 375pt phone needs a
                      // deeper shrink floor than the three-across rows.
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.65}
                    >
                      {cardio.charAt(0).toUpperCase() + cardio.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              </View>
            </View>
          </>
        )}

        {/* Workout duration — presets + optional range */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Duration</Text>
          <View style={styles.sectionCard}>
          {(() => {
            const { min, max } = inputs.timePerSession;
            const isPreset = min === max && DURATION_PRESETS.includes(min as 30 | 45 | 60 | 75);
            const isRange = !isPreset;
            return (
              <>
                <View style={styles.durationChipsRow}>
                  {DURATION_PRESETS.map(mins => {
                    const selected = isPreset && min === mins;
                    return (
                      <TouchableOpacity
                        key={mins}
                        style={[styles.durationChip, selected && styles.durationChipSelected]}
                        onPress={() => setInputs(prev => ({ ...prev, timePerSession: { min: mins, max: mins } }))}
                      >
                        <Text style={[styles.durationChipText, selected && styles.durationChipTextSelected]}>
                          {mins} min
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity
                    style={[styles.durationChip, isRange && styles.durationChipSelected]}
                    onPress={() => {
                      if (!isRange) {
                        setInputs(prev => ({ ...prev, timePerSession: { min: 30, max: 60 } }));
                      }
                    }}
                  >
                    <Text style={[styles.durationChipText, isRange && styles.durationChipTextSelected]}>
                      Range
                    </Text>
                  </TouchableOpacity>
                </View>
                {isRange && (
                  <View style={styles.durationRangeControl}>
                    <View style={styles.durationRangeRow}>
                      <Text style={styles.durationRangeLabel}>From</Text>
                      <View style={styles.stepperGroup}>
                        <TouchableOpacity
                          style={styles.stepperButton}
                          onPressIn={holdDurationMinDown.onPressIn}
                          onPressOut={holdDurationMinDown.onPressOut}
                          accessibilityRole="button"
                          accessibilityLabel="Decrease minimum duration"
                        >
                          <Ionicons name="remove" size={18} color={colors.primary} />
                        </TouchableOpacity>
                        <Text style={styles.stepperValue}>{min}</Text>
                        <TouchableOpacity
                          style={styles.stepperButton}
                          onPressIn={holdDurationMinUp.onPressIn}
                          onPressOut={holdDurationMinUp.onPressOut}
                          accessibilityRole="button"
                          accessibilityLabel="Increase minimum duration"
                        >
                          <Ionicons name="add" size={18} color={colors.primary} />
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.durationRangeUnit}>min</Text>
                    </View>
                    <View style={styles.durationRangeRow}>
                      <Text style={styles.durationRangeLabel}>To</Text>
                      <View style={styles.stepperGroup}>
                        <TouchableOpacity
                          style={styles.stepperButton}
                          onPressIn={holdDurationMaxDown.onPressIn}
                          onPressOut={holdDurationMaxDown.onPressOut}
                          accessibilityRole="button"
                          accessibilityLabel="Decrease maximum duration"
                        >
                          <Ionicons name="remove" size={18} color={colors.primary} />
                        </TouchableOpacity>
                        <Text style={styles.stepperValue}>{max}</Text>
                        <TouchableOpacity
                          style={styles.stepperButton}
                          onPressIn={holdDurationMaxUp.onPressIn}
                          onPressOut={holdDurationMaxUp.onPressOut}
                          accessibilityRole="button"
                          accessibilityLabel="Increase maximum duration"
                        >
                          <Ionicons name="add" size={18} color={colors.primary} />
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.durationRangeUnit}>min</Text>
                    </View>
                  </View>
                )}
              </>
            );
          })()}
          </View>
        </View>

        {/* Plan style (conditional on goal) */}
        {inputs.goal && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Plan style</Text>
            <View style={styles.sectionCard}>
            <View style={styles.planStyleList}>
              {getPlanStyleOptions(inputs.goal).map(option => {
                const isSelected = inputs.programType === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.planStyleOption, isSelected && styles.planStyleOptionSelected]}
                    onPress={() => handleProgramTypeSelect(option.value)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.planStyleRadio, isSelected && styles.planStyleRadioSelected]}>
                      {isSelected && <View style={styles.planStyleRadioDot} />}
                    </View>
                    <Text style={[styles.planStyleOptionText, isSelected && styles.planStyleOptionTextSelected]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            </View>
            <Text style={styles.sectionFootnote}>Sets intensity and cardio mix. The split organizes lifting days.</Text>
          </View>
        )}

        {/* Training split preference — includes Recommended badge and compact recommendation row */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Split</Text>
          <View style={styles.sectionCard}>
          <View style={styles.splitTileGrid}>
            {(['full body', 'upper-lower', 'ppl', 'body part', 'custom'] as TrainingSplitPreference[]).map(split => {
              const days = daysPerWeek;
              const pplDisabled = days >= 2 && days <= 3;
              const bodyPartDisabled = days <= 3;
              const isDisabled =
                (split === 'ppl' && pplDisabled) || (split === 'body part' && bodyPartDisabled);
              const isRecommendedSplit = !isDisabled && recommendation && (split === recommendation.recommendedSplit);
              const isSelected = inputs.trainingSplitPreference === split;

              const SPLIT_LABELS: Record<string, string> = {
                'full body': 'Full Body',
                'upper-lower': 'Upper / Lower',
                'ppl': 'Push / Pull / Legs',
                'body part': 'Body Part Days',
                'custom': 'Custom…',
              };
              const DISABLED_NOTES: Partial<Record<string, string>> = {
                'ppl': '4+ days',
                'body part': '4+ days',
              };

              const handleSplitPress = () => {
                if (isDisabled) return;
                if (split === 'custom') {
                  const normalized = normalizeCustomSplit(inputs.customSplit, orderedTrainingDays);
                  const draft = normalized.templates.length > 0
                    ? normalized
                    : { ...getDefaultDraft(), name: normalized.name, id: normalized.id };
                  setCustomSplitDraft(draft);
                  setAllowMultipleMainFocus(draft.templates.some((t) => t.primaries.length > 1));
                  setShowCustomSplitSheet(true);
                  return;
                }
                setInputs(prev => ({ ...prev, trainingSplitPreference: split }));
                if (recommendation && split === recommendation.recommendedSplit) setShowRecommendationDetails(true);
              };

              return (
                <TouchableOpacity
                  key={split}
                  style={[
                    styles.splitTile,
                    isSelected && styles.splitTileSelected,
                    isDisabled && styles.splitTileDisabled,
                    split === 'custom' && styles.splitTileFullWidth,
                  ]}
                  onPress={handleSplitPress}
                  disabled={isDisabled}
                  activeOpacity={isDisabled ? 1 : 0.7}
                >
                  <View style={styles.splitTileHeader}>
                    <View style={[styles.planStyleRadio, isSelected && styles.planStyleRadioSelected]}>
                      {isSelected && <View style={styles.planStyleRadioDot} />}
                    </View>
                    <Text style={[
                      styles.splitTileLabel,
                      isSelected && styles.splitTileLabelSelected,
                      isDisabled && styles.splitTileLabelDisabled,
                    ]} numberOfLines={2}>
                      {SPLIT_LABELS[split] ?? split}
                    </Text>
                    {isRecommendedSplit && (
                      <View style={[styles.splitOptionBadge, isSelected && styles.splitOptionBadgeSelected]}>
                        <Text style={[styles.splitOptionBadgeText, isSelected && styles.splitOptionBadgeTextSelected]}>Rec</Text>
                      </View>
                    )}
                    {split === 'body part' && !isDisabled && (
                      <TouchableOpacity
                        onPress={() => Alert.alert('Body Part Days', 'One muscle group per day (e.g. chest, back, legs). Good for volume and recovery.')}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="information-circle-outline" size={16} color={isSelected ? colors.onPrimary : colors.textMuted} />
                      </TouchableOpacity>
                    )}
                    {split === 'custom' && (
                      <Ionicons name="chevron-forward" size={16} color={isSelected ? colors.onPrimary : colors.textMuted} />
                    )}
                  </View>
                  {isDisabled && DISABLED_NOTES[split] && (
                    <Text style={styles.splitTileDisabledNote}>needs {DISABLED_NOTES[split]}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
          {/* When custom split is saved: show compact label + View/Edit. Otherwise show Recommended row (don't show both). */}
          {inputs.trainingSplitPreference === 'custom' && inputs.customSplit && (
            <View style={styles.customSplitSavedBlock}>
              <TouchableOpacity style={styles.recommendationCompactRow} onPress={() => { const d = normalizeCustomSplit(inputs.customSplit, orderedTrainingDays); setCustomSplitDraft(d); setAllowMultipleMainFocus(d.templates.some((t) => t.primaries.length > 1)); setShowCustomSplitSheet(true); }} activeOpacity={0.8}>
                <Text style={styles.recommendationCompactText} numberOfLines={1}>
                  {inputs.customSplit.name ? `Custom: ${inputs.customSplit.name}` : 'Custom split saved'}
                </Text>
                <Text style={styles.recommendationEditLink}>View/Edit</Text>
              </TouchableOpacity>
              <View style={styles.customSplitSavedActions}>
                <Text style={styles.customSplitLastUsed}>Last used: {inputs.customSplit.name || autoNameFromTemplates(inputs.customSplit.templates) || '—'}</Text>
                <TouchableOpacity onPress={() => setShowSavedSplitsPicker(true)} activeOpacity={0.8}>
                  <Text style={styles.recommendationEditLink}>Choose saved split…</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          {/* Compact recommendation row — only when not using a saved custom split */}
          {recommendation && !(inputs.trainingSplitPreference === 'custom' && inputs.customSplit) && (
            <>
              <TouchableOpacity
                style={styles.recommendationCompactRow}
                onPress={() => setShowRecommendationDetails((v) => !v)}
                activeOpacity={0.8}
              >
                <Text style={styles.recommendationCompactText} numberOfLines={1}>
                  Recommended: {(() => {
                    const showDayCounts = recommendation.cardioDays > 0 || recommendation.recoveryDays > 0;
                    const useShortFormat = showDayCounts && recommendation.recommendedLiftingLabel;
                    const goalDisplayName = inputs.goal === 'hybrid' ? 'Balanced' : inputs.goal === 'fat loss' ? 'Fat Loss' : inputs.goal === 'strength' ? 'Strength' : inputs.goal === 'endurance' ? 'Endurance' : '';
                    const shortTitle = `${daysPerWeek}-day ${goalDisplayName} Mix`;
                    return useShortFormat ? shortTitle : (recommendation.recommendedStructureName ?? splitFamilyToLabel(recommendation.recommendedSplit));
                  })()}
                </Text>
                <Ionicons
                  name={showRecommendationDetails ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={colors.primary}
                  style={styles.recommendationChevron}
                />
              </TouchableOpacity>

              {/* Expanded panel — 3 layers: (1) split + alternative, (2) one-line why, (3) weekly pattern (lighter) */}
              {showRecommendationDetails && (
                <View style={styles.recommendationExpanded}>
                  {(() => {
                    const isUsingRecommended = inputs.trainingSplitPreference === recommendation.recommendedSplit;
                    const weekdaysForPreview = inputs.trainingDays.length > 0 ? inputs.trainingDays : (recommendation.suggestedDaySchedules[0] ?? []);
                    const preview =
                      weekdaysForPreview.length > 0
                        ? mapPatternToWeekdays(recommendation.recommendedPattern, weekdaysForPreview, recommendation.recommendedDayLabels)
                        : recommendation.recommendedPattern.map((d) => DAY_TYPE_LABELS[d] ?? d).join(' • ');
                    const oneLineWhy = (recommendation.reasonText?.split('.')[0] ?? '') + (recommendation.reasonText?.includes('.') ? '.' : '');
                    return (
                      <>
                        <Text style={styles.recommendationExpandedTitle}>
                          {recommendation.recommendedStructureName ?? splitFamilyToLabel(recommendation.recommendedSplit)}
                        </Text>
                        {recommendation.alternativeSplit && (
                          <Text style={styles.recommendationExpandedAlternative}>
                            Alternative: {recommendation.alternativeStructureName ?? splitFamilyToLabel(recommendation.alternativeSplit)}
                          </Text>
                        )}
                        <Text style={styles.recommendationExpandedWhy}>{oneLineWhy}</Text>
                        <Text style={styles.recommendedSplitPreviewLabel}>Weekly pattern</Text>
                        <Text style={styles.recommendationPatternLighter}>{preview}</Text>
                        {!isUsingRecommended && (
                          <TouchableOpacity
                            style={styles.useRecommendedButton}
                            onPress={() => setInputs(prev => ({ ...prev, trainingSplitPreference: recommendation.recommendedSplit }))}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.useRecommendedButtonText}>Use recommended</Text>
                          </TouchableOpacity>
                        )}
                        {recommendation.warning && (
                          <Text style={styles.recommendedSplitWarning}>{recommendation.warning}</Text>
                        )}
                        {recommendation.recoverySuggestion && (
                          <Text style={styles.recommendedSplitRecoverySuggestion}>{recommendation.recoverySuggestion}</Text>
                        )}
                        {daysPerWeek === 7 && (
                          <Text style={styles.recommendedSplitGuardrail}>Includes at least 1 rest day — 7 hard days/week isn’t recommended.</Text>
                        )}
                        {recommendation.suggestedDaySchedules.length > 0 && (
                          <View style={styles.suggestedSchedulesSection}>
                            <Text style={styles.suggestedSchedulesLabel}>Suggested week layouts:</Text>
                            <View style={styles.suggestedSchedulesRow}>
                              {recommendation.suggestedDaySchedules.map((days, i) => (
                                <TouchableOpacity
                                  key={i}
                                  style={styles.suggestedScheduleChip}
                                  onPress={() => setInputs((prev) => ({ ...prev, trainingDays: days as DayOfWeek[] }))}
                                  activeOpacity={0.8}
                                >
                                  <Text style={styles.suggestedScheduleChipText}>
                                    {days.map((d) => d.slice(0, 2)).join('/')}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </View>
                        )}
                      </>
                    );
                  })()}
                </View>
              )}
            </>
          )}
          </View>
        </View>

        {/* Custom split builder — bottom sheet (Day templates + rotation) */}
        <Modal visible={showCustomSplitSheet} animationType="slide" transparent onRequestClose={() => setShowCustomSplitSheet(false)}>
          <Pressable accessible={false} style={styles.customSplitBackdrop} onPress={() => setShowCustomSplitSheet(false)}>
            <Pressable style={styles.customSplitPanel} accessible={false} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.customSplitTitle}>Build your split</Text>
              <Text style={styles.customSplitSubtitle}>Define Day 1, Day 2… We'll map them to your selected weekdays.</Text>

              {/* Optional split name */}
              <TextInput
                style={styles.customSplitNameInput}
                placeholder="Split name (optional)"
                placeholderTextColor={colors.textMuted}
                value={customSplitDraft.name ?? ''}
                onChangeText={(text) => setCustomSplitDraft((prev) => ({ ...prev, name: text.trim() || undefined }))}
              />

              {/* Step 1: Base template */}
              <Text style={styles.customSplitStepLabel}>Step 1: Choose a base template (optional)</Text>
              <View style={styles.customSplitTemplatesRow}>
                {TEMPLATES.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={styles.customSplitTemplateBtn}
                    onPress={() => setCustomSplitDraft((prev) => {
                      const n = Math.max(prev.templates.length || defaultTemplateCount, defaultTemplateCount);
                      return { ...prev, templates: t.build(n) };
                    })}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.customSplitTemplateBtnText}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Step 2: Workout days (templates) */}
              <Text style={styles.customSplitStepLabel}>Step 2: Build your workout days (templates)</Text>
              <View style={styles.toggleRow}>
                <View style={styles.toggleLabelContainer}>
                  <Text style={styles.customSplitDayLabel}>Advanced: allow multiple main focuses</Text>
                </View>
                <TouchableOpacity
                  style={[styles.toggleSwitch, allowMultipleMainFocus && styles.toggleSwitchOn]}
                  accessibilityRole="switch"
                  accessibilityLabel="Allow multiple main focuses"
                  accessibilityState={{ checked: allowMultipleMainFocus }}
                  onPress={() => setAllowMultipleMainFocus((v) => !v)}
                >
                  <View style={[styles.toggleThumb, allowMultipleMainFocus && styles.toggleThumbOn]} />
                </TouchableOpacity>
              </View>
              {allowMultipleMainFocus && (
                <Text style={styles.customSplitWarning}>Volume may be high; keep sessions longer.</Text>
              )}
              <ScrollView style={styles.customSplitScroll} showsVerticalScrollIndicator={false}>
                {(customSplitDraft.templates.length ? customSplitDraft.templates : [{ primaries: [], secondaries: [] }]).map((dayData, idx) => (
                  <View key={`template-${idx}`} style={styles.customSplitDayCard} collapsable={false}>
                    <View style={styles.customSplitDayCardHeader}>
                      <Text style={styles.customSplitDayName}>Day {idx + 1}</Text>
                      <View style={styles.customSplitDayActions}>
                        <TouchableOpacity
                          style={styles.customSplitDayActionBtn}
                          onPress={() => setCustomSplitDraft((prev) => {
                            const t = [...(prev.templates.length ? prev.templates : [{ primaries: [], secondaries: [] }])];
                            t.splice(idx + 1, 0, { primaries: [...dayData.primaries], secondaries: [...dayData.secondaries] });
                            return { ...prev, templates: t };
                          })}
                        >
                          <Text style={styles.customSplitDayActionText}>Duplicate</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.customSplitDayActionBtn}
                          onPress={() => setCustomSplitDraft((prev) => {
                            const t = [...(prev.templates.length ? prev.templates : [{ primaries: [], secondaries: [] }])];
                            t.splice(idx + 1, 0, { primaries: [], secondaries: [] as SecondaryMuscle[] });
                            return { ...prev, templates: t };
                          })}
                        >
                          <Text style={styles.customSplitDayActionText}>Add below</Text>
                        </TouchableOpacity>
                        {customSplitDraft.templates.length > 1 && (
                          <TouchableOpacity
                            style={styles.customSplitDayActionBtn}
                            onPress={() => setCustomSplitDraft((prev) => {
                              const t = prev.templates.filter((_, i) => i !== idx);
                              return { ...prev, templates: t.length ? t : [{ primaries: [], secondaries: [] }] };
                            })}
                          >
                            <Text style={styles.customSplitDayActionTextDanger}>Remove</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                    <View style={styles.customSplitDayCardBody}>
                      <View style={styles.customSplitLabelRow}>
                        <Text style={styles.customSplitDayLabel}>
                          {allowMultipleMainFocus ? 'Main focus (pick 1–2)' : 'Main focus (pick 1)'}
                        </Text>
                        <Text style={styles.customSplitCounter}>
                          {dayData.primaries.length}/{allowMultipleMainFocus ? 2 : 1} selected
                        </Text>
                      </View>
                      <View style={styles.customSplitChipsRow}>
                        {PRIMARY_OPTIONS.map((opt) => {
                          const maxPrimaries = allowMultipleMainFocus ? 2 : 1;
                          const selected = dayData.primaries.includes(opt);
                          const canAdd = !selected && dayData.primaries.length < maxPrimaries;
                          const canTap = selected || canAdd;
                          return (
                            <TouchableOpacity
                              key={opt}
                              style={[styles.customSplitChip, selected && styles.customSplitChipSelected, !canTap && styles.customSplitChipDisabled]}
                              onPress={() => {
                                if (!canTap) return;
                                setCustomSplitDraft((prev) => {
                                  const t = [...(prev.templates.length ? prev.templates : [{ primaries: [], secondaries: [] }])];
                                  if (!t[idx]) return prev;
                                  const next = selected ? t[idx].primaries.filter((p) => p !== opt) : [...t[idx].primaries, opt].slice(0, allowMultipleMainFocus ? 2 : 1);
                                  t[idx] = { ...t[idx], primaries: next };
                                  return { ...prev, templates: t };
                                });
                              }}
                              activeOpacity={0.8}
                              disabled={!canTap}
                            >
                              <Text style={[styles.customSplitChipText, selected && styles.customSplitChipTextSelected]}>{opt}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <View style={styles.customSplitLabelRow}>
                        <Text style={styles.customSplitDayLabel}>Add-ons (pick 0–2)</Text>
                        <Text style={styles.customSplitCounter}>{dayData.secondaries.length}/2 selected</Text>
                      </View>
                      <View style={styles.customSplitChipsRow}>
                        {SECONDARY_OPTIONS.map((opt) => {
                          const selected = dayData.secondaries.includes(opt);
                          const canAdd = selected || dayData.secondaries.length < 2;
                          return (
                            <TouchableOpacity
                              key={opt}
                              style={[styles.customSplitChip, selected && styles.customSplitChipSelected, !canAdd && styles.customSplitChipDisabled]}
                              onPress={() => {
                                if (!canAdd) return;
                                setCustomSplitDraft((prev) => {
const t = [...(prev.templates.length ? prev.templates : [{ primaries: [], secondaries: [] }])];
                                if (!t[idx]) return prev;
                                const next = selected ? t[idx].secondaries.filter((s) => s !== opt) : [...t[idx].secondaries, opt];
                                t[idx] = { ...t[idx], secondaries: next };
                                  return { ...prev, templates: t };
                                });
                              }}
                              activeOpacity={0.8}
                              disabled={!canAdd}
                            >
                              <Text style={[styles.customSplitChipText, selected && styles.customSplitChipTextSelected]}>{opt}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                ))}
                <TouchableOpacity
                  style={styles.customSplitAddDayBtn}
                  onPress={() => setCustomSplitDraft((prev) => ({ ...prev, templates: [...(prev.templates.length ? prev.templates : [{ primaries: [], secondaries: [] }]), { primaries: [], secondaries: [] }] }))}
                >
                  <Text style={styles.customSplitAddDayBtnText}>+ Add workout day</Text>
                </TouchableOpacity>

                {/* How should we cycle? */}
                <Text style={styles.customSplitStepLabel}>How should we cycle this?</Text>
                <View style={styles.customSplitChipsRow}>
                  {(['repeat_weekly', 'rotate_forward', 'auto_balance'] as RotationRule[]).map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.customSplitChip, customSplitDraft.rotationRule === opt && styles.customSplitChipSelected]}
                      onPress={() => setCustomSplitDraft((prev) => ({ ...prev, rotationRule: opt }))}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.customSplitChipText, customSplitDraft.rotationRule === opt && styles.customSplitChipTextSelected]}>{ROTATION_LABELS[opt]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.customSplitCycleExample}>{ROTATION_EXAMPLES[customSplitDraft.rotationRule]}</Text>

                {/* Add-ons */}
                <View style={styles.customSplitAddons}>
                  <Text style={styles.customSplitDayLabel}>Abs</Text>
                  <View style={styles.customSplitChipsRow}>
                    {(['none', 'sometimes', 'often'] as AbsPref[]).map((opt) => (
                      <TouchableOpacity key={opt} style={[styles.customSplitChip, customSplitDraft.abs === opt && styles.customSplitChipSelected]} onPress={() => setCustomSplitDraft((prev) => ({ ...prev, abs: opt }))} activeOpacity={0.8}>
                        <Text style={[styles.customSplitChipText, customSplitDraft.abs === opt && styles.customSplitChipTextSelected]}>{opt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.customSplitDayLabel}>Cardio</Text>
                  <View style={styles.customSplitChipsRow}>
                    {(['none', 'easy', 'mixed'] as CardioPref[]).map((opt) => (
                      <TouchableOpacity key={opt} style={[styles.customSplitChip, customSplitDraft.cardio === opt && styles.customSplitChipSelected]} onPress={() => setCustomSplitDraft((prev) => ({ ...prev, cardio: opt }))} activeOpacity={0.8}>
                        <Text style={[styles.customSplitChipText, customSplitDraft.cardio === opt && styles.customSplitChipTextSelected]}>{opt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Step 3: Preview */}
                <Text style={styles.customSplitStepLabel}>Step 3: Preview</Text>
                <Text style={styles.customSplitPreviewLabel}>Your selected days</Text>
                <Text style={styles.customSplitPreviewLine}>{orderedTrainingDays.length ? orderedTrainingDays.map((d) => d.slice(0, 3)).join(' ') : '—'}</Text>
                <Text style={styles.customSplitPreviewLabel}>Week 1 mapping</Text>
                <Text style={styles.customSplitPreviewLine}>{week1MappingPreview(customSplitDraft)}</Text>
                {week2StartsAtPreview(customSplitDraft) && (
                  <Text style={styles.customSplitPreviewLine}>Week 2 starts at {week2StartsAtPreview(customSplitDraft)}</Text>
                )}
                <View style={{ height: 80 }} />
              </ScrollView>

              {/* Sticky footer */}
              <View style={styles.customSplitFooter}>
                <TouchableOpacity style={styles.customSplitCancelBtn} onPress={() => setShowCustomSplitSheet(false)} activeOpacity={0.8}>
                  <Text style={styles.customSplitCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.customSplitSaveBtn}
                  onPress={() => {
                    const templates = customSplitDraft.templates.length ? customSplitDraft.templates : [{ primaries: [], secondaries: [] }];
                    const missingMain = templates.some((t) => t.primaries.length < 1);
                    if (missingMain) {
                      Alert.alert('Main focus required', 'Each workout day needs at least one main focus (pick 1–2).');
                      return;
                    }
                    const name = (customSplitDraft.name?.trim() || autoNameFromTemplates(templates)) || 'Custom split';
                    const payload: CustomSplitData = { ...customSplitDraft, templates, name };
                    const now = Date.now();
                    const saved: SavedCustomSplit = { ...payload, id: payload.id ?? `split-${now}`, name, createdAt: now, lastUsedAt: now };
                    setSavedCustomSplits((prev) => {
                      const without = prev.filter((s) => s.id !== saved.id);
                      const next = [...without, saved];
                      AsyncStorage.setItem('jim_saved_custom_splits', JSON.stringify(next)).catch((e) => {
                        console.warn('Failed to save custom splits:', e);
                      });
                      return next;
                    });
                    setInputs((prev) => ({ ...prev, trainingSplitPreference: 'custom', customSplit: { ...payload, id: saved.id } }));
                    setShowCustomSplitSheet(false);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.customSplitSaveBtnText}>Save split</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Choose saved split — modal list */}
        <Modal visible={showSavedSplitsPicker} animationType="slide" transparent onRequestClose={() => setShowSavedSplitsPicker(false)}>
          <Pressable accessible={false} style={styles.customSplitBackdrop} onPress={() => setShowSavedSplitsPicker(false)}>
            <View style={[styles.customSplitPanel, { maxHeight: '60%' }]}>
              <Text style={styles.customSplitTitle}>Choose saved split</Text>
              <ScrollView style={styles.customSplitScroll}>
                {!splitsLoaded ? (
                  <Text style={styles.customSplitPreviewLine}>Loading your splits…</Text>
                ) : savedCustomSplits.length === 0 ? (
                  <Text style={styles.customSplitPreviewLine}>No saved splits yet. Create one in View/Edit.</Text>
                ) : (
                  savedCustomSplits.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      style={styles.customSplitSavedRow}
                      onPress={() => {
                        const updated = { ...s, lastUsedAt: Date.now() };
                        setInputs((prev) => ({ ...prev, trainingSplitPreference: 'custom', customSplit: updated }));
                        setSavedCustomSplits((prev) => prev.map((x) => (x.id === s.id ? updated : x)));
                        setShowSavedSplitsPicker(false);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.customSplitSavedRowName}>{s.name}</Text>
                      <Text style={styles.customSplitPreviewLine} numberOfLines={1}>{autoNameFromTemplates(s.templates)}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
              <TouchableOpacity style={styles.customSplitCancelBtn} onPress={() => setShowSavedSplitsPicker(false)}>
                <Text style={styles.customSplitCancelBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>

        {/* Hybrid control (conditional on goal) */}
        {inputs.goal === 'hybrid' && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Emphasis</Text>
            <View style={styles.sectionCard}>
            <View style={styles.optionsRow}>
              {(['more strength', 'balanced', 'more cardio'] as HybridGoalRatio[]).map(ratio => (
                <TouchableOpacity
                  key={ratio}
                  style={[styles.optionButton, inputs.hybridGoalRatio === ratio && styles.optionButtonSelected]}
                  onPress={() => setInputs(prev => ({ ...prev, hybridGoalRatio: ratio }))}
                >
                  <Text
                    style={[styles.optionButtonText, inputs.hybridGoalRatio === ratio && styles.optionButtonTextSelected]}
                    // "Strength-leaning" is the longest chip label in this file
                    // — wider than the "Intermediate" that broke on device.
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    {ratio === 'more strength' ? 'Strength-leaning' : ratio === 'balanced' ? 'Balanced' : 'Cardio-leaning'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            </View>
          </View>
        )}

        {/* Workout detail level (Advanced) */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Detail</Text>
          <View style={styles.sectionCard}>
          <View style={styles.optionsRow}>
            {(['simple', 'detailed'] as WorkoutDetailLevel[]).map(level => (
              <TouchableOpacity
                key={level}
                style={[styles.optionButton, inputs.workoutDetailLevel === level && styles.optionButtonSelected]}
                onPress={() => setInputs(prev => ({ ...prev, workoutDetailLevel: level }))}
              >
                <Text style={[styles.optionButtonText, inputs.workoutDetailLevel === level && styles.optionButtonTextSelected]}>
                  {level === 'simple' ? 'Simple' : 'Detailed'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          </View>
          <Text style={styles.sectionFootnote}>Detailed includes the full exercise list with sets and reps.</Text>
        </View>

            {/* Progression Style */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Progression</Text>
              <View style={styles.sectionCard}>
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
                    <Text
                      style={[styles.optionButtonText, inputs.progressionStyle === style && styles.optionButtonTextSelected]}
                      // Keeps "Build + Deload" on one line instead of wrapping
                      // into a taller chip than its two neighbors.
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      {style === 'build' ? 'Build' : style === 'build + deload' ? 'Build + Deload' : 'Maintain'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              </View>
            </View>

            {/* Duration by workout type — collapsed by default */}
            <View style={styles.section}>
              <View style={styles.sectionCard}>
              <TouchableOpacity
                style={styles.accordionHeader}
                onPress={() => setOpenDurationOverrides((v) => !v)}
                activeOpacity={0.75}
              >
                <View style={styles.accordionHeaderText}>
                  <Text style={styles.accordionTitle}>Duration by workout type</Text>
                  <Text style={styles.accordionSummary} numberOfLines={2}>{durationOverridesSummary}</Text>
                </View>
                <Ionicons name={openDurationOverrides ? 'chevron-up' : 'chevron-down'} size={22} color={colors.textMuted} />
              </TouchableOpacity>
              {openDurationOverrides && (
                <View style={styles.accordionBody}>
                  <Text style={styles.sectionSubtitle}>Override strength, cardio, and recovery session lengths (minutes).</Text>
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
              )}
              </View>
            </View>

            {/* Avoid back-to-back intense days — toggle only (default ON) */}
            <View style={styles.section}>
              <View style={styles.sectionCard}>
              <View style={[styles.toggleRow, styles.toggleRowFlush]}>
                <View style={styles.toggleLabelContainer}>
                  <Text style={styles.switchRowLabel}>Avoid back-to-back intense days</Text>
                </View>
                <TouchableOpacity
                  style={[styles.toggleSwitch, inputs.maxHardDaysInRow === 1 && styles.toggleSwitchOn]}
                  accessibilityRole="switch"
                  accessibilityLabel="Avoid back-to-back intense days"
                  accessibilityState={{ checked: inputs.maxHardDaysInRow === 1 }}
                  onPress={() => setInputs(prev => ({ ...prev, maxHardDaysInRow: prev.maxHardDaysInRow === 1 ? 2 : 1 }))}
                >
                  <View style={[styles.toggleThumb, inputs.maxHardDaysInRow === 1 && styles.toggleThumbOn]} />
                </TouchableOpacity>
              </View>
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionCard}>
              <TouchableOpacity
                style={styles.accordionHeader}
                onPress={() => setOpenAvoidInjuries((v) => !v)}
                activeOpacity={0.75}
              >
                <View style={styles.accordionHeaderText}>
                  <Text style={styles.accordionTitle}>Injuries & exercises to avoid</Text>
                  <Text style={styles.accordionSummary}>{avoidListSummary}</Text>
                </View>
                <Ionicons name={openAvoidInjuries ? 'chevron-up' : 'chevron-down'} size={22} color={colors.textMuted} />
              </TouchableOpacity>
              {openAvoidInjuries && (
                <View style={styles.accordionBody}>
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
              )}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionCard}>
              <TouchableOpacity
                style={styles.accordionHeader}
                onPress={() => setOpenPerDayTime((v) => !v)}
                activeOpacity={0.75}
              >
                <View style={styles.accordionHeaderText}>
                  <Text style={styles.accordionTitle}>Per-day time limits</Text>
                  <Text style={styles.accordionSummary}>{perDayTimeSummary}</Text>
                </View>
                <Ionicons name={openPerDayTime ? 'chevron-up' : 'chevron-down'} size={22} color={colors.textMuted} />
              </TouchableOpacity>
              {openPerDayTime && (
                <View style={styles.accordionBody}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleLabelContainer}>
                  <Text style={styles.switchRowLabel}>Set different time limits per training day</Text>
                </View>
                <TouchableOpacity
                  style={[styles.toggleSwitch, inputs.usePerDayTimeCaps && styles.toggleSwitchOn]}
                  accessibilityRole="switch"
                  accessibilityLabel="Set different time limits per training day"
                  accessibilityState={{ checked: inputs.usePerDayTimeCaps }}
                  onPress={() => {
                    setInputs(prev => {
                      const next = !prev.usePerDayTimeCaps;
                      return { ...prev, usePerDayTimeCaps: next };
                    });
                    setOpenPerDayTime(true);
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
                                style={styles.stepperButton}
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
                                <Ionicons name="remove" size={16} color={colors.primary} />
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
                                style={styles.stepperButton}
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
                                <Ionicons name="add" size={16} color={colors.primary} />
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
              )}
              </View>
            </View>

            {(inputs.goal === 'endurance' || inputs.goal === 'hybrid') && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Cardio types</Text>
                <View style={styles.sectionCard}>
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
              </View>
            )}

            {(inputs.goal === 'strength' || inputs.goal === 'hybrid') && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Focus</Text>
                <View style={styles.sectionCard}>
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
              </View>
            )}
          </>
        )}

        {/* Step 3: Review — recap + wellness scope. Generate button lives in the footer. */}
        {currentStep === 2 && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Review</Text>
              <View style={styles.sectionCard}>
              <View style={styles.reviewSummaryGrid}>
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewRowLabel}>Goal</Text>
                  <Text style={styles.reviewRowValue}>{inputs.goal ? GOAL_LABELS[inputs.goal] : '—'}</Text>
                </View>
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewRowLabel}>Schedule</Text>
                  <Text style={styles.reviewRowValue}>
                    {`${daysPerWeek} day${daysPerWeek !== 1 ? 's' : ''}/week · ${inputs.weeks} week${inputs.weeks !== 1 ? 's' : ''}`}
                  </Text>
                </View>
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewRowLabel}>Where</Text>
                  <Text style={styles.reviewRowValue}>
                    {inputs.primaryLocation
                      ? inputs.primaryLocation.charAt(0).toUpperCase() + inputs.primaryLocation.slice(1)
                      : '—'}
                  </Text>
                </View>
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewRowLabel}>Time/session</Text>
                  <Text style={styles.reviewRowValue}>{`${inputs.timePerSession.min}–${inputs.timePerSession.max} min`}</Text>
                </View>
                {inputs.programType ? (
                  <View style={styles.reviewRow}>
                    <Text style={styles.reviewRowLabel}>Style</Text>
                    <Text style={styles.reviewRowValue}>{inputs.programType}</Text>
                  </View>
                ) : null}
                {effectiveSplitPreference ? (
                  <View style={styles.reviewRow}>
                    <Text style={styles.reviewRowLabel}>Split</Text>
                    <Text style={styles.reviewRowValue}>
                      {effectiveSplitPreference === 'custom'
                        ? 'Custom split'
                        : splitFamilyToLabel(effectiveSplitPreference)}
                    </Text>
                  </View>
                ) : null}
                {inputs.avoidList.length > 0 ? (
                  <View style={styles.reviewRow}>
                    <Text style={styles.reviewRowLabel}>Avoiding</Text>
                    <Text style={styles.reviewRowValue}>{inputs.avoidList.join(', ')}</Text>
                  </View>
                ) : null}
              </View>
              {!canGenerate && (
                <Text style={styles.reviewWarning}>
                  Missing required basics. Tap Back to complete the earlier steps.
                </Text>
              )}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionCard}>
                <TouchableOpacity
                  style={styles.wellnessToggleRow}
                  onPress={() => setShowWellnessDetail(v => !v)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.wellnessTitle}>{WELLNESS_SCOPE_TITLE}</Text>
                  <Ionicons
                    name={showWellnessDetail ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>
                {showWellnessDetail && (
                  <Text style={styles.wellnessScopeBody}>{WELLNESS_SCOPE_BODY}</Text>
                )}
                <Text style={styles.sectionHelper}>{NOT_MEDICAL_FOOTNOTE_SHORT}</Text>
              </View>
            </View>
          </>
        )}

        </ScrollView>

        {/* Single floating CTA — content scrolls under it and the glass tab bar. */}
        {currentStep < TOTAL_STEPS - 1 ? (
          <TouchableOpacity
            style={[
              styles.floatingCta,
              { bottom: Math.max(tabBarInset, spacing.lg) },
              !stepCanAdvance && styles.floatingCtaDisabled,
            ]}
            onPress={handleWizardNext}
            disabled={!stepCanAdvance}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Continue to step ${currentStep + 2}`}
          >
            <Text style={styles.floatingCtaText}>Next</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              styles.floatingCta,
              { bottom: Math.max(tabBarInset, spacing.lg) },
              !canGenerate && styles.floatingCtaDisabled,
            ]}
            onPress={() => handleGenerate()}
            disabled={!canGenerate}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Generate plan preview"
          >
            <Text style={styles.floatingCtaText}>
              {inputs.weeks === 1 ? 'Generate Plan' : `Generate ${inputs.weeks}-Week Plan`}
            </Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>

      {/* Must stay outside `showAdvanced` — otherwise web modal never mounts when options are collapsed */}
      <Modal
        visible={showStartDatePicker && Platform.OS === 'web'}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStartDatePicker(false)}
      >
        <Pressable accessible={false} style={styles.startDateModalBackdrop} onPress={() => setShowStartDatePicker(false)}>
          <Pressable style={styles.startDateModalPanel} accessible={false} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.startDateModalTitle}>Choose start date</Text>
            <Text style={styles.sectionSubtitle}>Tap a day. Grey days are before today.</Text>
            <MonthCalendarPicker
              selectedIso={inputs.startDateISO}
              minIso={getTodayIsoDate()}
              colors={colors}
              onSelectDay={(iso) => applyStartDateISO(iso)}
            />
            <View style={styles.startDateModalActions}>
              <TouchableOpacity
                style={styles.customSplitCancelBtn}
                onPress={() => setShowStartDatePicker(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.customSplitCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function createGeneratePlanStyles(c: ColorPalette) {
  return StyleSheet.create({
  outerContainer: {
    flex: 1,
    width: '100%',
    backgroundColor: c.background,
  },
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  autoGenCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  autoGenTitle: {
    fontSize: text.headline,
    fontWeight: weight.bold,
    color: c.text,
    marginTop: spacing.lg,
  },
  autoGenSub: {
    fontSize: text.body,
    color: c.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    width: 80,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  backButtonText: {
    fontSize: text.callout,
    color: c.primary,
    fontWeight: weight.regular,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: text.headline,
    fontWeight: weight.semibold,
    color: c.text,
  },
  headerSpacer: {
    width: 80,
  },
  /** Hairline step indicator under the header — fill width is set inline per step. */
  stepProgressTrack: {
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: c.border,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  stepProgressFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: c.primary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.lg,
  },
  templateEntryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  templateEntryIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: c.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateEntryText: { flex: 1, minWidth: 0 },
  templateEntryTitle: { fontSize: text.callout, fontWeight: weight.semibold, color: c.text },
  templateEntrySub: { fontSize: text.footnote, color: c.textMuted, marginTop: spacing.xxs },
  resumeCard: {
    backgroundColor: c.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    marginBottom: spacing.xxl,
  },
  resumeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  resumeCardTitle: { fontSize: text.callout, fontWeight: weight.semibold, color: c.text, flexShrink: 1 },
  resumeCardMeta: { fontSize: text.body, color: c.textSecondary, marginTop: spacing.sm, lineHeight: leading.body },
  resumeCardActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  resumeBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: c.primary,
    alignItems: 'center',
  },
  resumeBtnText: { fontSize: text.body, fontWeight: weight.semibold, color: c.onPrimary },
  resumeDiscardBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumeDiscardBtnText: { fontSize: text.body, fontWeight: weight.semibold, color: c.textSecondary },
  reviewSummaryGrid: {
    gap: spacing.sm,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
  },
  reviewRowLabel: {
    fontSize: text.body,
    color: c.textMuted,
    fontWeight: weight.semibold,
    flexShrink: 0,
  },
  reviewRowValue: {
    fontSize: text.body,
    color: c.text,
    fontWeight: weight.medium,
    textAlign: 'right',
    flexShrink: 1,
  },
  reviewWarning: {
    marginTop: spacing.md,
    fontSize: text.body,
    color: c.error,
  },
  /** iOS form row: label left, value/control right. */
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    gap: spacing.md,
  },
  formRowLabel: {
    fontSize: text.body,
    fontWeight: weight.medium,
    color: c.text,
  },
  formRowValue: {
    fontSize: text.body,
    color: c.textSecondary,
  },
  formRowValueGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  formRowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.border,
  },
  /** iOS-style stepper: two circular tinted buttons around the value. */
  stepperGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: c.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    fontSize: text.callout,
    fontWeight: weight.semibold,
    color: c.text,
    minWidth: 36,
    textAlign: 'center',
  },
  clearLink: {
    fontSize: text.body,
    fontWeight: weight.semibold,
    color: c.primary,
  },
  startDatePickerWrap: {
    marginTop: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: c.background,
    paddingVertical: spacing.sm,
  },
  startDateDoneButton: {
    alignSelf: 'flex-end',
    marginTop: spacing.xs,
    marginRight: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  startDateDoneButtonText: {
    color: c.primary,
    fontSize: text.callout,
    fontWeight: weight.semibold,
  },
  startDateModalBackdrop: {
    flex: 1,
    width: '100%',
    backgroundColor: c.scrim,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  startDateModalPanel: {
    width: '100%',
    maxWidth: 380,
    borderRadius: radius.lg,
    backgroundColor: c.surface,
    padding: spacing.lg,
  },
  startDateModalTitle: {
    fontSize: text.headline,
    fontWeight: weight.heavy,
    color: c.text,
    marginBottom: spacing.sm,
  },
  startDateModalActions: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  accordionHeaderText: {
    flex: 1,
  },
  accordionTitle: {
    fontSize: text.callout,
    fontWeight: weight.semibold,
    color: c.text,
    marginBottom: spacing.xs,
  },
  accordionSummary: {
    fontSize: text.footnote,
    color: c.textMuted,
    lineHeight: leading.footnote,
  },
  accordionBody: {
    paddingTop: spacing.md,
  },
  section: {
    marginBottom: spacing.xxl,
  },
  /** iOS grouped-table section: uppercase caption label + white card below. */
  sectionLabel: {
    fontSize: text.caption,
    fontWeight: weight.bold,
    letterSpacing: tracking.wider,
    textTransform: 'uppercase',
    color: c.textMuted,
    marginBottom: spacing.sm,
    marginLeft: spacing.lg,
  },
  sectionCard: {
    backgroundColor: c.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  sectionFootnote: {
    fontSize: text.footnote,
    lineHeight: leading.footnote,
    color: c.textMuted,
    marginTop: spacing.sm,
    marginHorizontal: spacing.lg,
  },
  inCardLabel: {
    fontSize: text.footnote,
    fontWeight: weight.semibold,
    color: c.textMuted,
    marginBottom: spacing.sm,
  },
  switchRowLabel: {
    fontSize: text.body,
    fontWeight: weight.medium,
    color: c.text,
    lineHeight: leading.body,
  },
  toggleRowFlush: {
    marginBottom: spacing.none,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
  sectionSubtitle: {
    fontSize: text.footnote,
    lineHeight: leading.footnote,
    color: c.textMuted,
    marginBottom: spacing.md,
  },
  sectionHelper: {
    fontSize: text.footnote,
    lineHeight: leading.footnote,
    color: c.textMuted,
    marginTop: spacing.xs,
  },
  wellnessTitle: {
    fontSize: text.callout,
    fontWeight: weight.semibold,
    color: c.text,
    flex: 1,
  },
  wellnessScopeBody: {
    fontSize: text.body,
    color: c.textSecondary,
    lineHeight: leading.body,
    marginBottom: spacing.sm,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  goalChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  goalChip: {
    flex: 1,
    minWidth: '47%',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  goalChipSelected: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  goalChipTitle: {
    fontSize: text.callout,
    fontWeight: weight.bold,
    color: c.text,
    marginBottom: spacing.xs,
  },
  goalChipTitleSelected: {
    color: c.onPrimary,
  },
  goalChipDescriptor: {
    fontSize: text.caption,
    color: c.textMuted,
    lineHeight: leading.caption,
  },
  goalChipDescriptorSelected: {
    color: c.onPrimary,
    opacity: 0.9,
  },
  optionButton: {
    flex: 1,
    paddingVertical: spacing.md,
    // sm, not lg: three-across rows leave ~100pt per chip on a 390pt phone, and
    // "Intermediate" at body/semibold needs the extra width or it wraps mid-word.
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
  },
  optionButtonSelected: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  optionButtonText: {
    fontSize: text.body,
    fontWeight: weight.semibold,
    color: c.textSecondary,
    textAlign: 'center',
  },
  optionButtonTextSelected: {
    color: c.onPrimary,
  },
  recommendationCompactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: c.background,
    borderRadius: radius.sm,
  },
  recommendationCompactText: {
    fontSize: text.body,
    color: c.textSecondary,
    flex: 1,
  },
  recommendationEditLink: {
    fontSize: text.body,
    color: c.primary,
    fontWeight: weight.semibold,
  },
  recommendationChevron: {
    marginLeft: spacing.sm,
  },
  recommendationExpanded: {
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: c.background,
    borderRadius: radius.sm,
  },
  recommendationExpandedTitle: {
    fontSize: text.body,
    fontWeight: weight.bold,
    color: c.text,
    marginBottom: spacing.xs,
  },
  recommendationExpandedAlternative: {
    fontSize: text.body,
    color: c.textSecondary,
    marginBottom: spacing.sm,
  },
  recommendationExpandedWhy: {
    fontSize: text.footnote,
    color: c.textMuted,
    marginBottom: spacing.md,
  },
  recommendationPatternLighter: {
    fontSize: text.caption,
    color: c.textMuted,
    marginTop: spacing.xxs,
    marginBottom: spacing.md,
  },
  useRecommendedButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.primary,
  },
  useRecommendedButtonText: {
    fontSize: text.body,
    fontWeight: weight.semibold,
    color: c.primary,
  },
  recommendedSplitWarning: {
    fontSize: text.caption,
    color: c.warning,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  recommendedSplitRecoverySuggestion: {
    fontSize: text.caption,
    color: c.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  recommendedSplitGuardrail: {
    fontSize: text.footnote,
    color: c.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.xxs,
  },
  recommendedSplitPreviewLabel: {
    fontSize: text.caption,
    color: c.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.xxs,
  },
  suggestedSchedulesSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  suggestedSchedulesLabel: {
    fontSize: text.caption,
    color: c.textMuted,
    fontWeight: weight.semibold,
    marginBottom: spacing.sm,
  },
  suggestedSchedulesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  suggestedScheduleChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  suggestedScheduleChipText: {
    fontSize: text.footnote,
    fontWeight: weight.semibold,
    color: c.textSecondary,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  daysPerWeekText: {
    fontSize: text.footnote,
    color: c.textMuted,
    marginTop: spacing.sm,
  },
  dayToggle: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    minWidth: 50,
    alignItems: 'center',
  },
  dayToggleSelected: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  dayToggleText: {
    fontSize: text.body,
    fontWeight: weight.semibold,
    color: c.textSecondary,
  },
  dayToggleTextSelected: {
    color: c.onPrimary,
  },
  durationChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  durationChip: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  durationChipSelected: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  durationChipText: {
    fontSize: text.body,
    fontWeight: weight.semibold,
    color: c.textSecondary,
  },
  durationChipTextSelected: {
    color: c.onPrimary,
  },
  durationRangeControl: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: c.border,
    gap: spacing.md,
  },
  durationRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  durationRangeLabel: {
    fontSize: text.body,
    color: c.textMuted,
    fontWeight: weight.semibold,
    minWidth: 32,
  },
  durationRangeUnit: {
    fontSize: text.body,
    color: c.textMuted,
  },
  customSplitBackdrop: {
    flex: 1,
    backgroundColor: c.scrim,
    justifyContent: 'flex-end',
  },
  customSplitPanel: {
    backgroundColor: c.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '85%',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  customSplitTitle: {
    fontSize: text.headline,
    fontWeight: weight.bold,
    color: c.text,
    marginBottom: spacing.xs,
  },
  customSplitSubtitle: {
    fontSize: text.body,
    color: c.textSecondary,
    marginBottom: spacing.md,
  },
  customSplitNameInput: {
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: text.callout,
    color: c.text,
    marginBottom: spacing.md,
    backgroundColor: c.surface,
  },
  customSplitStepLabel: {
    fontSize: text.body,
    fontWeight: weight.semibold,
    color: c.text,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  customSplitTemplatesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  customSplitTemplateBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: c.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: c.border,
  },
  customSplitTemplateBtnText: {
    fontSize: text.body,
    color: c.text,
    fontWeight: weight.semibold,
  },
  customSplitScroll: {
    maxHeight: 320,
  },
  customSplitDayCard: {
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    overflow: 'hidden',
  },
  customSplitDayCardBody: {
    marginTop: spacing.xs,
  },
  customSplitLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  customSplitCounter: {
    fontSize: text.caption,
    color: c.textMuted,
  },
  customSplitDayCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  customSplitDayName: {
    fontSize: text.body,
    fontWeight: weight.bold,
    color: c.text,
  },
  customSplitDayActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  customSplitDayActionBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  customSplitDayActionText: {
    fontSize: text.footnote,
    color: c.primary,
    fontWeight: weight.semibold,
  },
  customSplitDayActionTextDanger: {
    fontSize: text.footnote,
    color: c.error ?? '#c00',
    fontWeight: weight.semibold,
  },
  customSplitAddDayBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: c.border,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
    alignItems: 'center',
  },
  customSplitAddDayBtnText: {
    fontSize: text.body,
    color: c.primary,
    fontWeight: weight.semibold,
  },
  customSplitDayLabel: {
    fontSize: text.footnote,
    color: c.textMuted,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  customSplitChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  customSplitChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: c.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: c.border,
  },
  customSplitChipSelected: {
    borderColor: c.primary,
    backgroundColor: c.primary,
  },
  customSplitChipDisabled: {
    opacity: 0.5,
  },
  customSplitCycleExample: {
    fontSize: text.caption,
    color: c.textMuted,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  customSplitChipText: {
    fontSize: text.footnote,
    color: c.textSecondary,
  },
  customSplitChipTextSelected: {
    color: c.onPrimary,
    fontWeight: weight.semibold,
  },
  customSplitAddons: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  customSplitPreviewLabel: {
    fontSize: text.footnote,
    color: c.textMuted,
    marginBottom: spacing.xs,
  },
  customSplitPreviewLine: {
    fontSize: text.body,
    color: c.text,
  },
  customSplitWarning: {
    fontSize: text.footnote,
    color: c.warning ?? c.error,
    marginTop: spacing.sm,
  },
  customSplitFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  customSplitCancelBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: c.border,
  },
  customSplitCancelBtnText: {
    fontSize: text.callout,
    color: c.textSecondary,
  },
  customSplitSaveBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.sm,
    backgroundColor: c.primary,
  },
  customSplitSaveBtnText: {
    fontSize: text.callout,
    fontWeight: weight.semibold,
    color: c.onPrimary,
  },
  customSplitSavedBlock: {
    marginTop: spacing.md,
  },
  customSplitSavedActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  customSplitLastUsed: {
    fontSize: text.footnote,
    color: c.textMuted,
  },
  customSplitSavedRow: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  customSplitSavedRowName: {
    fontSize: text.callout,
    fontWeight: weight.semibold,
    color: c.text,
    marginBottom: spacing.xxs,
  },
  chipsRowMargin: {
    marginTop: spacing.sm,
  },
  chipGroupLabel: {
    fontSize: text.footnote,
    color: c.textMuted,
    fontWeight: weight.semibold,
    marginRight: spacing.sm,
    width: '100%',
    marginBottom: spacing.xs,
  },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  chipSelected: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  chipText: {
    fontSize: text.body,
    color: c.textSecondary,
    fontWeight: weight.semibold,
  },
  chipTextSelected: {
    color: c.onPrimary,
  },
  sessionCapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sessionCapLabel: {
    fontSize: text.body,
    color: c.textSecondary,
    fontWeight: weight.semibold,
    minWidth: 80,
  },
  sessionCapInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  sessionCapInput: {
    flex: 1,
    backgroundColor: c.background,
    borderRadius: radius.sm,
    padding: spacing.sm,
    fontSize: text.body,
    color: c.text,
  },
  sessionCapSeparator: {
    fontSize: text.body,
    color: c.textSecondary,
  },
  sessionCapUnit: {
    fontSize: text.footnote,
    color: c.textMuted,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  toggleLabelContainer: {
    flex: 1,
  },
  toggleSwitch: {
    width: 50,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: c.border,
    padding: spacing.xxs,
  },
  toggleSwitchOn: {
    backgroundColor: c.primary,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
  },
  toggleThumbOn: {
    transform: [{ translateX: 22 }],
  },
  perDayCapsSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  helperText: {
    fontSize: text.footnote,
    color: c.textMuted,
    marginBottom: spacing.md,
  },
  shortcutButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  shortcutButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  shortcutButtonText: {
    fontSize: text.footnote,
    color: c.textSecondary,
    fontWeight: weight.semibold,
  },
  perDayCapsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  perDayCapItem: {
    width: '48%',
    minWidth: 140,
    padding: spacing.md,
    backgroundColor: c.background,
    borderRadius: radius.sm,
  },
  perDayCapLabel: {
    fontSize: text.body,
    color: c.text,
    marginBottom: spacing.sm,
    fontWeight: weight.semibold,
    textAlign: 'center',
  },
  customToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  customToggleSwitch: {
    width: 40,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: c.border,
    padding: spacing.xxs,
  },
  customToggleSwitchOn: {
    backgroundColor: c.primary,
  },
  customToggleThumb: {
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
  },
  customToggleThumbOn: {
    transform: [{ translateX: 18 }],
  },
  customToggleLabel: {
    fontSize: text.footnote,
    color: c.textSecondary,
    fontWeight: weight.medium,
  },
  dayCapStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  dayCapInput: {
    width: 60,
    height: 32,
    backgroundColor: c.surface,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    fontSize: text.body,
    color: c.text,
    textAlign: 'center',
    fontWeight: weight.semibold,
  },
  defaultIndicator: {
    fontSize: text.caption,
    color: c.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  /** Single full-width CTA floating above the glass tab bar; `bottom` is set inline. */
  floatingCta: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: c.primary,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.level2,
    shadowColor: c.shadow,
  },
  floatingCtaDisabled: {
    opacity: 0.5,
  },
  floatingCtaText: {
    fontSize: text.callout,
    fontWeight: weight.semibold,
    color: c.onPrimary,
  },
  planStyleList: {
    gap: spacing.sm,
  },
  planStyleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  planStyleOptionSelected: {
    borderColor: c.primary,
    backgroundColor: c.primary,
  },
  planStyleRadio: {
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: c.border,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  planStyleRadioSelected: {
    borderColor: c.onPrimary,
  },
  planStyleRadioDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: c.onPrimary,
  },
  planStyleOptionText: {
    fontSize: text.body,
    fontWeight: weight.semibold,
    color: c.textSecondary,
    flex: 1,
  },
  planStyleOptionTextSelected: {
    color: c.onPrimary,
  },
  splitOptionBadge: {
    alignSelf: 'flex-start',
    backgroundColor: c.primarySoft,
    // xs, not sm: this "Rec" badge shares a row with splitTileLabel, which is
    // flex:1 + numberOfLines={2} inside a 47%-wide tile. The badge's own type
    // stepped up onto the scale, so it gives the width back in padding rather
    // than taking it from a label that has to fit "Push / Pull / Legs".
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: c.primary,
  },
  splitOptionBadgeText: {
    fontSize: text.caption,
    fontWeight: weight.bold,
    color: c.primary,
    letterSpacing: tracking.wide,
  },
  splitOptionBadgeSelected: {
    backgroundColor: `${c.onPrimary}${SOFT_ALPHA}`,
    borderColor: c.onPrimary,
  },
  splitOptionBadgeTextSelected: {
    color: c.onPrimary,
  },
  splitTileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  splitTile: {
    flex: 1,
    minWidth: '47%',
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  splitTileSelected: {
    borderColor: c.primary,
    backgroundColor: c.primary,
  },
  splitTileDisabled: {
    opacity: 0.45,
  },
  splitTileFullWidth: {
    flexBasis: '100%',
    flex: 0,
  },
  splitTileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  splitTileLabel: {
    flex: 1,
    fontSize: text.body,
    fontWeight: weight.semibold,
    color: c.textSecondary,
  },
  splitTileLabelSelected: {
    color: c.onPrimary,
  },
  splitTileLabelDisabled: {
    color: c.textMuted,
  },
  splitTileDisabledNote: {
    fontSize: text.caption,
    color: c.textMuted,
    marginTop: spacing.xs,
  },
  wellnessToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  });
}
