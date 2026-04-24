import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
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
import { useTheme } from '../theme';
import type { ColorPalette } from '../theme/colors';
import {
  normalizeContext,
  getRecommendation,
  mapPatternToWeekdays,
  splitFamilyToLabel,
  DAY_TYPE_LABELS,
} from '../lib/planRecommendation';
import { buildPlanInputs, planInputsToFormPatch } from '../lib/planInputs';
import { MonthCalendarPicker } from '../components/MonthCalendarPicker';
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

export default function GeneratePlanScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createGeneratePlanStyles(colors), [colors]);
  const [inputs, setInputs] = useState<GeneratePlanInputs>({
    goal: null,
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
    availableEquipment: [...DEFAULT_GYM_EQUIPMENT],
    detailedEquipment: [],
    cardioEquipment: null,
    experienceLevel: null,
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
    workoutDetailLevel: 'simple',
    strengthFormat: 'straight sets',
    cardioFormat: 'intervals',
    trainingSplitPreference: null,
    customSplitHint: '',
    customSplit: null,
    equipmentAccess: [],
    age: null,
  });
  const [generating, setGenerating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
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

  const editFromSnapshot = route.params?.editFromSnapshot;
  useEffect(() => {
    if (!editFromSnapshot) return;
    const patch = planInputsToFormPatch(editFromSnapshot) as Partial<GeneratePlanInputs>;
    setInputs((prev) => ({ ...prev, ...patch }));
  }, [editFromSnapshot]);

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

  const summaryStripLine = useMemo(() => {
    const goalPart = inputs.goal ? GOAL_LABELS[inputs.goal] : 'Pick a goal';
    return `${goalPart} · ${daysPerWeek}d/wk · ${inputs.weeks}wk · ${inputs.timePerSession.min}–${inputs.timePerSession.max} min`;
  }, [inputs.goal, daysPerWeek, inputs.weeks, inputs.timePerSession.min, inputs.timePerSession.max]);

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
      programType: null,
      programVariationIndex: 0,
      strengthSplitPreference: null,
      hybridGoalRatio: null,
      cardioModalityPreference:
        goal === 'hybrid' || goal === 'endurance' ? [...DEFAULT_CARDIO_MODALITY_PREFERENCE] : [],
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
      const planInputs = buildPlanInputs({
        form: {
          goal: inputs.goal!,
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
        },
        effectiveSplitPreference: effectiveSplitPreference ?? null,
        useRecommended: !!(recommendation && effectiveSplitPreference === recommendation.recommendedSplit),
      });
      navigation.navigate('PlanPreview', {
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
      });
    }, 1500);
  };

  const canGenerate =
    !!inputs.goal &&
    inputs.trainingDays.length > 0 &&
    !!inputs.primaryLocation &&
    (inputs.primaryLocation === 'gym' || (inputs.availableEquipment.length > 0 && inputs.cardioEquipment !== null)) &&
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

        <View style={styles.summaryStrip}>
          <Text style={styles.summaryStripLabel}>At a glance</Text>
          <Text style={styles.summaryStripLine} numberOfLines={2}>{summaryStripLine}</Text>
        </View>

        <ScrollView 
          style={styles.content} 
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={true}
          showsHorizontalScrollIndicator={false}
        >
        {/* Plan basics — always visible */}
        <View style={styles.essentialsPanel}>
          <Text style={styles.essentialsKicker}>Plan basics</Text>
          <Text style={styles.essentialsSubkicker}>Goal, weekly schedule, and how many weeks to generate</Text>

        {/* Goal Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What's your goal?</Text>
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
        </View>

        {/* Training days */}
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

        {/* Plan length (weeks) */}
        <View style={styles.planLengthSection}>
          <View style={styles.planLengthTitleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.planLengthTitle}>Plan length</Text>
              <Text style={styles.planLengthHint}>How many weeks to generate (1 = preview length)</Text>
            </View>
            <View style={styles.planLengthStepper}>
              <TouchableOpacity
                style={styles.planLengthButton}
                onPressIn={holdWeeksDown.onPressIn}
                onPressOut={holdWeeksDown.onPressOut}
              >
                <Text style={styles.planLengthButtonText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.planLengthValue}>{inputs.weeks}</Text>
              <Text style={styles.planLengthUnit}>{inputs.weeks === 1 ? 'week' : 'weeks'}</Text>
              <TouchableOpacity
                style={styles.planLengthButton}
                onPressIn={holdWeeksUp.onPressIn}
                onPressOut={holdWeeksUp.onPressOut}
              >
                <Text style={styles.planLengthButtonText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
          {inputs.weeks > 1 ? (
            <Text style={[styles.planLengthHint, { marginTop: 10 }]}>
              Multi-week previews run more AI work and take longer. Choose 1 week for the
              fastest preview; you can extend the plan after you apply it.
            </Text>
          ) : null}
          <View style={styles.startDateSection}>
            <Text style={styles.planLengthTitle}>Start date</Text>
            <Text style={styles.planLengthHint}>Choose when Week 1 should begin</Text>
            <TouchableOpacity
              style={styles.startDateButton}
              onPress={openStartDatePicker}
              activeOpacity={0.8}
            >
              <Text style={styles.startDateButtonText}>{formatStartDateLabel(inputs.startDateISO)}</Text>
              <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
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
        </View>
        </View>

        <View style={styles.zoneDivider} />

        <TouchableOpacity
          style={[styles.advancedToggle, showAdvanced && styles.advancedToggleExpanded]}
          onPress={() => setShowAdvanced(!showAdvanced)}
          activeOpacity={0.7}
        >
          <View style={styles.advancedToggleTextBlock}>
            <Text style={styles.advancedToggleTitle}>More plan options</Text>
            <Text style={styles.advancedToggleHint}>Location, session time, style & split, optional limits</Text>
          </View>
          <Ionicons
            name={showAdvanced ? 'chevron-down' : 'chevron-forward'}
            size={22}
            color={colors.textMuted}
          />
        </TouchableOpacity>

        {showAdvanced && (
          <View style={styles.advancedSurface}>
          <View style={styles.advancedIntro}>
            <Text style={styles.advancedIntroTitle}>Optional details</Text>
            <Text style={styles.advancedIntroBody}>Everything below refines location, workouts, and limits. Plan basics stay above.</Text>
          </View>
        {/* Primary location — first: constrains available exercises */}
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

        {/* Equipment — required when Home; Gym assumes standard equipment */}
        {/* Equipment access — shown immediately when Home is selected */}
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

        {/* Gym: assume standard equipment (no selector). Home: equipment selector shown above. */}
        {inputs.primaryLocation === 'home' && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Available equipment</Text>
              <Text style={styles.sectionSubtitle}>Select what you have at home (required for exercise selection)</Text>
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
          </>
        )}

        {/* Workout duration — presets + optional range */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Workout duration</Text>
          <Text style={styles.sectionSubtitle}>How long should workouts be?</Text>
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
                      <Text style={styles.durationRangeLabel}>Min</Text>
                      <View style={styles.numberInputRow}>
                        <TouchableOpacity
                          style={styles.numberButton}
                          onPressIn={holdDurationMinDown.onPressIn}
                          onPressOut={holdDurationMinDown.onPressOut}
                        >
                          <Text style={styles.numberButtonText}>−</Text>
                        </TouchableOpacity>
                        <Text style={styles.numberDisplay}>{min}</Text>
                        <TouchableOpacity
                          style={styles.numberButton}
                          onPressIn={holdDurationMinUp.onPressIn}
                          onPressOut={holdDurationMinUp.onPressOut}
                        >
                          <Text style={styles.numberButtonText}>+</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.durationRangeUnit}>min</Text>
                    </View>
                    <View style={styles.durationRangeRow}>
                      <Text style={styles.durationRangeLabel}>Max</Text>
                      <View style={styles.numberInputRow}>
                        <TouchableOpacity
                          style={styles.numberButton}
                          onPressIn={holdDurationMaxDown.onPressIn}
                          onPressOut={holdDurationMaxDown.onPressOut}
                        >
                          <Text style={styles.numberButtonText}>−</Text>
                        </TouchableOpacity>
                        <Text style={styles.numberDisplay}>{max}</Text>
                        <TouchableOpacity
                          style={styles.numberButton}
                          onPressIn={holdDurationMaxUp.onPressIn}
                          onPressOut={holdDurationMaxUp.onPressOut}
                        >
                          <Text style={styles.numberButtonText}>+</Text>
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

        {/* Plan style (conditional on goal) */}
        {inputs.goal && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Plan style</Text>
            <Text style={styles.sectionSubtitle}>How should this plan prioritize your goal?</Text>
            <Text style={styles.sectionHelper}>This affects intensity and cardio style. The split decides how lifting days are organized.</Text>
            <View style={styles.optionsRow}>
              {getPlanStyleOptions(inputs.goal).map(option => (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.optionButton, inputs.programType === option.value && styles.optionButtonSelected]}
                  onPress={() => handleProgramTypeSelect(option.value)}
                >
                  <Text style={[styles.optionButtonText, inputs.programType === option.value && styles.optionButtonTextSelected]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Training split preference — includes Recommended badge and compact recommendation row */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Training split preference</Text>
          <Text style={styles.sectionSubtitle}>Pick a structure, or let the app choose the best one.</Text>
          <View style={styles.optionsRowCompact}>
            {(['full body', 'upper-lower', 'ppl', 'body part', 'custom'] as TrainingSplitPreference[]).map(split => {
              const days = daysPerWeek;
              const pplDisabled = days >= 2 && days <= 3;
              const bodyPartDisabled = days <= 3;
              const isDisabled =
                (split === 'ppl' && pplDisabled) || (split === 'body part' && bodyPartDisabled);
              const isRecommendedSplit = recommendation && (split === recommendation.recommendedSplit);
              const isSelected = inputs.trainingSplitPreference === split;
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

              if (split === 'body part') {
                return (
                  <View
                    key={split}
                    style={[
                      styles.optionButtonCompact,
                      isSelected && styles.optionButtonCompactSelected,
                      isDisabled && styles.optionButtonCompactDisabled,
                      styles.optionButtonBodyPartRowCompact,
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.optionButtonBodyPartLabelCompact}
                      onPress={handleSplitPress}
                      disabled={isDisabled}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.optionButtonTextCompact,
                        isSelected && styles.optionButtonTextCompactSelected,
                        isDisabled && styles.optionButtonTextCompactDisabled,
                      ]}>
                        Body Part Days
                      </Text>
                      {isRecommendedSplit && (
                        <TouchableOpacity
                          onPress={() => { setInputs(prev => ({ ...prev, trainingSplitPreference: 'body part' })); setShowRecommendationDetails(true); }}
                          style={styles.recommendedBadgeCompact}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.recommendedBadgeTextCompact}>Recommended</Text>
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => Alert.alert('Body Part Days', 'One muscle group per day (e.g. chest, back, legs). Good for volume and recovery.')}
                      style={styles.chipInfoIconCompact}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                );
              }

              return (
                <TouchableOpacity
                  key={split}
                  style={[
                    styles.optionButtonCompact,
                    isSelected && styles.optionButtonCompactSelected,
                    isDisabled && styles.optionButtonCompactDisabled,
                  ]}
                  onPress={handleSplitPress}
                  disabled={isDisabled}
                >
                  <View style={styles.optionButtonContentCompact}>
                    <Text style={[
                      styles.optionButtonTextCompact,
                      isSelected && styles.optionButtonTextCompactSelected,
                      isDisabled && styles.optionButtonTextCompactDisabled,
                    ]}>
                      {split === 'full body' ? 'Full Body' : split === 'upper-lower' ? 'Upper/Lower' : split === 'ppl' ? 'Push/Pull/Legs' : 'Custom'}
                    </Text>
                    {isRecommendedSplit && (
                      <TouchableOpacity
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        onPress={() => setShowRecommendationDetails(true)}
                        style={styles.recommendedBadgeCompact}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.recommendedBadgeTextCompact}>Recommended</Text>
                      </TouchableOpacity>
                    )}
                  </View>
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

        {/* Custom split builder — bottom sheet (Day templates + rotation) */}
        <Modal visible={showCustomSplitSheet} animationType="slide" transparent onRequestClose={() => setShowCustomSplitSheet(false)}>
          <Pressable style={styles.customSplitBackdrop} onPress={() => setShowCustomSplitSheet(false)}>
            <Pressable style={styles.customSplitPanel} onPress={(e) => e.stopPropagation()}>
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
                      return [...without, saved];
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
          <Pressable style={styles.customSplitBackdrop} onPress={() => setShowSavedSplitsPicker(false)}>
            <View style={[styles.customSplitPanel, { maxHeight: '60%' }]}>
              <Text style={styles.customSplitTitle}>Choose saved split</Text>
              <ScrollView style={styles.customSplitScroll}>
                {savedCustomSplits.length === 0 ? (
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

        {/* Age (optional) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Age</Text>
          <Text style={styles.sectionSubtitle}>Optional. Used to adjust recovery and progression rate.</Text>
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
              <Text style={[styles.sectionSubtitle, { color: colors.primary }]}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Hybrid control (conditional on goal) */}
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

        {/* Workout detail level (Advanced) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Workout detail level</Text>
          <Text style={styles.sectionSubtitle}>How detailed should workouts be?</Text>
          <View style={styles.optionsRow}>
            {(['simple', 'detailed'] as WorkoutDetailLevel[]).map(level => (
              <TouchableOpacity
                key={level}
                style={[styles.optionButton, inputs.workoutDetailLevel === level && styles.optionButtonSelected, inputs.workoutDetailLevel === level && styles.optionButtonSelectedRing]}
                onPress={() => setInputs(prev => ({ ...prev, workoutDetailLevel: level }))}
              >
                <Text style={[styles.optionButtonText, inputs.workoutDetailLevel === level && styles.optionButtonTextSelected]}>
                  {level === 'simple' ? 'Simple (title + duration + type)' : 'Detailed (full exercise list + sets/reps)'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

            {/* Progression Style */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Progression style</Text>
              <Text style={styles.sectionSubtitle}>How should the plan change week to week?</Text>
              <View style={styles.optionsRow}>
                {(['build', 'build + deload', 'maintain'] as ProgressionStyle[]).map(style => (
                  <TouchableOpacity
                    key={style}
                    style={[styles.optionButton, inputs.progressionStyle === style && styles.optionButtonSelected, inputs.progressionStyle === style && styles.optionButtonSelectedRing]}
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

            {/* Duration by workout type — collapsed by default */}
            <View style={styles.section}>
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

            {/* Avoid back-to-back intense days — toggle only (default ON) */}
            <View style={styles.section}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleLabelContainer}>
                  <Text style={styles.sectionSubtitle}>Avoid back-to-back intense days</Text>
                </View>
                <TouchableOpacity
                  style={[styles.toggleSwitch, inputs.maxHardDaysInRow === 1 && styles.toggleSwitchOn]}
                  onPress={() => setInputs(prev => ({ ...prev, maxHardDaysInRow: prev.maxHardDaysInRow === 1 ? 2 : 1 }))}
                >
                  <View style={[styles.toggleThumb, inputs.maxHardDaysInRow === 1 && styles.toggleThumbOn]} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.section}>
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
                  <Text style={styles.sectionSubtitle}>Select body areas and movements to steer clear of.</Text>
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

            <View style={styles.section}>
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
                  <Text style={styles.sectionSubtitle}>Set different time limits per training day</Text>
                </View>
                <TouchableOpacity
                  style={[styles.toggleSwitch, inputs.usePerDayTimeCaps && styles.toggleSwitchOn]}
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
              )}
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
                        {split === 'full body' ? 'Full Body' : split === 'upper-lower' ? 'Upper-Lower' : split === 'ppl' ? 'Push/Pull/Legs' : split === '3-day full body' ? '3-day Full Body' : 'Surprise me'}
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
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{WELLNESS_SCOPE_TITLE}</Text>
          <Text style={styles.wellnessScopeBody}>{WELLNESS_SCOPE_BODY}</Text>
          <Text style={styles.sectionHelper}>{NOT_MEDICAL_FOOTNOTE_SHORT}</Text>
        </View>

        </ScrollView>

        <SafeAreaView style={styles.footerContainer} edges={['bottom']}>
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.generateButton, !canGenerate && styles.generateButtonDisabled]}
              onPress={handleGenerate}
              disabled={!canGenerate || generating}
            >
              {generating ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Text style={styles.generateButtonText}>
                  Generate Week 1 Preview
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </SafeAreaView>

      {/* Must stay outside `showAdvanced` — otherwise web modal never mounts when options are collapsed */}
      <Modal
        visible={showStartDatePicker && Platform.OS === 'web'}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStartDatePicker(false)}
      >
        <Pressable style={styles.startDateModalBackdrop} onPress={() => setShowStartDatePicker(false)}>
          <Pressable style={styles.startDateModalPanel} onPress={(e) => e.stopPropagation()}>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    backgroundColor: c.surface,
  },
  backButton: {
    padding: 4,
  },
  backButtonText: {
    fontSize: 16,
    color: c.primary,
    fontWeight: '600',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: c.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: c.textSecondary,
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
  summaryStrip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: c.surface,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  summaryStripLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: c.textMuted,
    marginBottom: 4,
  },
  summaryStripLine: {
    fontSize: 13,
    fontWeight: '600',
    color: c.textSecondary,
    lineHeight: 18,
  },
  essentialsPanel: {
    backgroundColor: c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
    marginBottom: 8,
  },
  essentialsKicker: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: c.primary,
    marginBottom: 4,
  },
  essentialsSubkicker: {
    fontSize: 13,
    color: c.textMuted,
    marginBottom: 12,
    lineHeight: 18,
  },
  planLengthSection: {
    marginTop: 4,
    marginBottom: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  planLengthTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  planLengthTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: c.text,
    marginBottom: 4,
  },
  planLengthHint: {
    fontSize: 13,
    color: c.textSecondary,
    lineHeight: 18,
  },
  planLengthStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  planLengthButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: c.background,
    borderWidth: 1,
    borderColor: c.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  planLengthButtonText: {
    fontSize: 22,
    color: c.text,
    fontWeight: '600',
  },
  planLengthValue: {
    fontSize: 22,
    fontWeight: '800',
    color: c.text,
    minWidth: 28,
    textAlign: 'center',
  },
  planLengthUnit: {
    fontSize: 13,
    fontWeight: '600',
    color: c.textMuted,
    marginRight: 4,
  },
  startDateSection: {
    marginTop: 14,
  },
  startDateButton: {
    marginTop: 10,
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.background,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  startDateButtonText: {
    fontSize: 14,
    color: c.text,
    fontWeight: '600',
  },
  startDatePickerWrap: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.background,
    paddingVertical: 8,
  },
  startDateDoneButton: {
    alignSelf: 'flex-end',
    marginTop: 6,
    marginRight: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  startDateDoneButtonText: {
    color: c.text,
    fontSize: 13,
    fontWeight: '700',
  },
  startDateModalBackdrop: {
    flex: 1,
    width: '100%',
    backgroundColor: c.scrim,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  startDateModalPanel: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    padding: 16,
  },
  startDateModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: c.text,
    marginBottom: 8,
  },
  startDateModalActions: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  zoneDivider: {
    height: 10,
    marginBottom: 10,
  },
  advancedSurface: {
    marginTop: 4,
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    borderLeftWidth: 4,
    borderLeftColor: c.primary,
    backgroundColor: c.background,
  },
  advancedIntro: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
  },
  advancedIntroTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: c.textSecondary,
    marginBottom: 4,
  },
  advancedIntroBody: {
    fontSize: 13,
    color: c.textMuted,
    lineHeight: 18,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 10,
  },
  accordionHeaderText: {
    flex: 1,
  },
  accordionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: c.text,
    marginBottom: 4,
  },
  accordionSummary: {
    fontSize: 12,
    color: c.textMuted,
    lineHeight: 16,
  },
  accordionBody: {
    paddingTop: 4,
    paddingBottom: 8,
    paddingHorizontal: 4,
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
    color: c.text,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: c.textSecondary,
    marginBottom: 12,
  },
  sectionHelper: {
    fontSize: 12,
    color: c.textMuted,
    marginBottom: 10,
    fontStyle: 'italic',
  },
  wellnessScopeBody: {
    fontSize: 14,
    color: c.textSecondary,
    lineHeight: 21,
    marginBottom: 8,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionsRowCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  optionButtonCompact: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  optionButtonCompactSelected: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  optionButtonTextCompact: {
    fontSize: 13,
    fontWeight: '600',
    color: c.textSecondary,
  },
  optionButtonTextCompactSelected: {
    color: c.onPrimary,
  },
  optionButtonCompactDisabled: {
    opacity: 0.5,
  },
  optionButtonTextCompactDisabled: {
    color: c.textMuted,
  },
  optionButtonContentCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 3,
  },
  optionButtonBodyPartRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionButtonBodyPartLabelCompact: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  recommendedBadgeCompact: {
    backgroundColor: c.primarySoft,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  recommendedBadgeTextCompact: {
    fontSize: 9,
    fontWeight: '700',
    color: c.primary,
  },
  chipInfoIconCompact: {
    padding: 4,
    marginLeft: 2,
  },
  goalChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  goalChip: {
    flex: 1,
    minWidth: '47%',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  goalChipSelected: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  goalChipTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: c.text,
    marginBottom: 4,
  },
  goalChipTitleSelected: {
    color: c.onPrimary,
  },
  goalChipDescriptor: {
    fontSize: 11,
    color: c.textMuted,
    lineHeight: 14,
  },
  goalChipDescriptorSelected: {
    color: c.onPrimary,
    opacity: 0.9,
  },
  optionButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  optionButtonSelected: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  optionButtonSelectedRing: {
    borderWidth: 2,
    shadowColor: c.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  optionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: c.textSecondary,
  },
  optionButtonTextSelected: {
    color: c.onPrimary,
  },
  optionButtonDisabled: {
    opacity: 0.5,
  },
  optionButtonTextDisabled: {
    color: c.textMuted,
  },
  optionButtonContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  optionButtonBodyPartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionButtonBodyPartLabel: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  recommendedBadge: {
    backgroundColor: c.primarySoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  recommendedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: c.primary,
  },
  chipInfoIcon: {
    padding: 6,
    marginLeft: 4,
  },
  recommendationCompactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: c.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.border,
  },
  recommendationCompactText: {
    fontSize: 13,
    color: c.textSecondary,
    flex: 1,
  },
  recommendationEditLink: {
    fontSize: 13,
    color: c.primary,
    fontWeight: '600',
  },
  recommendationChevron: {
    marginLeft: 8,
  },
  recommendationExpanded: {
    marginTop: 8,
    padding: 12,
    backgroundColor: c.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.border,
  },
  recommendationExpandedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: c.text,
    marginBottom: 4,
  },
  recommendationExpandedAlternative: {
    fontSize: 13,
    color: c.textSecondary,
    marginBottom: 8,
  },
  recommendationExpandedWhy: {
    fontSize: 12,
    color: c.textMuted,
    fontStyle: 'italic',
    marginBottom: 10,
  },
  recommendationPatternLighter: {
    fontSize: 11,
    color: c.textMuted,
    marginTop: 2,
    marginBottom: 10,
  },
  useRecommendedButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.primary,
  },
  useRecommendedButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: c.primary,
  },
  recommendedSplitWarning: {
    fontSize: 11,
    color: c.warning,
    fontStyle: 'italic',
    marginTop: 4,
    marginBottom: 4,
  },
  recommendedSplitRecoverySuggestion: {
    fontSize: 11,
    color: c.textMuted,
    fontStyle: 'italic',
    marginTop: 4,
    marginBottom: 4,
  },
  recommendedSplitGuardrail: {
    fontSize: 12,
    color: c.textSecondary,
    fontStyle: 'italic',
    marginTop: 4,
    marginBottom: 2,
  },
  recommendedSplitPreviewLabel: {
    fontSize: 11,
    color: c.textSecondary,
    marginTop: 6,
    marginBottom: 2,
  },
  suggestedSchedulesSection: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  suggestedSchedulesLabel: {
    fontSize: 11,
    color: c.textMuted,
    fontWeight: '600',
    marginBottom: 6,
  },
  suggestedSchedulesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestedScheduleChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  suggestedScheduleChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: c.textSecondary,
  },
  sectionDeemphasized: {
    opacity: 0.85,
  },
  sectionTitleDeemphasized: {
    fontSize: 15,
    fontWeight: '600',
    color: c.textSecondary,
    marginBottom: 4,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  daysPerWeekText: {
    fontSize: 14,
    color: c.textSecondary,
    fontWeight: '500',
    marginTop: 4,
  },
  dayToggle: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
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
    fontSize: 14,
    fontWeight: '600',
    color: c.textSecondary,
  },
  dayToggleTextSelected: {
    color: c.onPrimary,
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
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numberButtonText: {
    fontSize: 18,
    color: c.text,
    fontWeight: '600',
  },
  numberDisplay: {
    fontSize: 18,
    fontWeight: '700',
    color: c.text,
    minWidth: 40,
    textAlign: 'center',
  },
  durationChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  durationChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  durationChipSelected: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  durationChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: c.textSecondary,
  },
  durationChipTextSelected: {
    color: c.onPrimary,
  },
  durationRangeControl: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: c.border,
    gap: 12,
  },
  durationRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  durationRangeLabel: {
    fontSize: 13,
    color: c.textMuted,
    fontWeight: '600',
    minWidth: 32,
  },
  durationRangeUnit: {
    fontSize: 13,
    color: c.textMuted,
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
    color: c.textMuted,
    marginBottom: 4,
  },
  timeInputField: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 16,
    color: c.text,
    minHeight: 40,
  },
  customSplitInput: {
    marginTop: 10,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: c.text,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  customSplitBackdrop: {
    flex: 1,
    backgroundColor: c.scrim,
    justifyContent: 'flex-end',
  },
  customSplitPanel: {
    backgroundColor: c.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  customSplitTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: c.text,
    marginBottom: 4,
  },
  customSplitSubtitle: {
    fontSize: 14,
    color: c.textSecondary,
    marginBottom: 12,
  },
  customSplitNameInput: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    color: c.text,
    marginBottom: 12,
    backgroundColor: c.surface,
  },
  customSplitStepLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: c.text,
    marginTop: 12,
    marginBottom: 6,
  },
  customSplitTemplatesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  customSplitTemplateBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: c.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.border,
  },
  customSplitTemplateBtnText: {
    fontSize: 13,
    color: c.text,
    fontWeight: '600',
  },
  customSplitScroll: {
    maxHeight: 320,
  },
  customSplitDayCard: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: c.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    overflow: 'hidden',
  },
  customSplitDayCardBody: {
    marginTop: 4,
  },
  customSplitLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  customSplitCounter: {
    fontSize: 11,
    color: c.textMuted,
  },
  customSplitDayCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  customSplitDayName: {
    fontSize: 14,
    fontWeight: '700',
    color: c.text,
  },
  customSplitDayActions: {
    flexDirection: 'row',
    gap: 8,
  },
  customSplitDayActionBtn: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  customSplitDayActionText: {
    fontSize: 12,
    color: c.primary,
    fontWeight: '600',
  },
  customSplitDayActionTextDanger: {
    fontSize: 12,
    color: c.error ?? '#c00',
    fontWeight: '600',
  },
  customSplitAddDayBtn: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: c.border,
    borderRadius: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  customSplitAddDayBtnText: {
    fontSize: 14,
    color: c.primary,
    fontWeight: '600',
  },
  customSplitDayLabel: {
    fontSize: 12,
    color: c.textMuted,
    marginTop: 6,
    marginBottom: 4,
  },
  customSplitChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  customSplitChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: c.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.border,
  },
  customSplitChipSelected: {
    borderColor: c.primary,
    backgroundColor: c.primarySoft,
  },
  customSplitChipDisabled: {
    opacity: 0.5,
  },
  customSplitCycleExample: {
    fontSize: 11,
    color: c.textMuted,
    marginTop: 6,
    marginBottom: 4,
    fontStyle: 'italic',
  },
  customSplitChipText: {
    fontSize: 12,
    color: c.textSecondary,
  },
  customSplitChipTextSelected: {
    color: c.primary,
    fontWeight: '600',
  },
  customSplitAddons: {
    marginTop: 8,
    marginBottom: 12,
  },
  customSplitPreviewLabel: {
    fontSize: 12,
    color: c.textMuted,
    marginBottom: 4,
  },
  customSplitPreviewLine: {
    fontSize: 13,
    color: c.text,
  },
  customSplitWarning: {
    fontSize: 12,
    color: c.warning ?? c.error,
    marginTop: 6,
  },
  customSplitFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  customSplitCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.border,
  },
  customSplitCancelBtnText: {
    fontSize: 15,
    color: c.textSecondary,
  },
  customSplitSaveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: c.primary,
  },
  customSplitSaveBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: c.onPrimary,
  },
  customSplitSavedBlock: {
    marginTop: 10,
  },
  customSplitSavedActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingHorizontal: 12,
  },
  customSplitLastUsed: {
    fontSize: 12,
    color: c.textMuted,
  },
  customSplitSavedRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  customSplitSavedRowName: {
    fontSize: 15,
    fontWeight: '600',
    color: c.text,
    marginBottom: 2,
  },
  timeSeparator: {
    fontSize: 16,
    color: c.textSecondary,
  },
  timeUnit: {
    fontSize: 14,
    color: c.textSecondary,
  },
  chipsRowMargin: {
    marginTop: 8,
  },
  chipGroupLabel: {
    fontSize: 12,
    color: c.textMuted,
    fontWeight: '600',
    marginRight: 8,
    width: '100%',
    marginBottom: 4,
  },
  daysPerWeekRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  daysPerWeekLabel: {
    fontSize: 14,
    color: c.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  chipSelected: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  chipText: {
    fontSize: 13,
    color: c.textSecondary,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: c.onPrimary,
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipTextDisabled: {
    opacity: 0.5,
  },
  warningText: {
    fontSize: 12,
    color: c.warning,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  definitionText: {
    fontSize: 12,
    color: c.textMuted,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    marginBottom: 8,
    gap: 8,
  },
  advancedToggleExpanded: {
    borderColor: c.primary,
    backgroundColor: c.primarySoft,
  },
  advancedToggleTextBlock: {
    flex: 1,
  },
  advancedToggleTitle: {
    fontSize: 16,
    color: c.text,
    fontWeight: '700',
    marginBottom: 3,
  },
  advancedToggleHint: {
    fontSize: 12,
    color: c.textMuted,
    lineHeight: 16,
  },
  advancedToggleText: {
    fontSize: 14,
    color: c.textSecondary,
    fontWeight: '600',
  },
  advancedToggleIcon: {
    fontSize: 12,
    color: c.textMuted,
  },
  advancedDurationSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  sessionCapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sessionCapLabel: {
    fontSize: 14,
    color: c.textSecondary,
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
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
    color: c.text,
  },
  sessionCapSeparator: {
    fontSize: 14,
    color: c.textSecondary,
  },
  sessionCapUnit: {
    fontSize: 12,
    color: c.textMuted,
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
    backgroundColor: c.border,
    padding: 2,
  },
  toggleSwitchOn: {
    backgroundColor: c.primary,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: c.background,
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
    borderTopColor: c.border,
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
    color: c.textMuted,
    marginBottom: 8,
  },
  perDayCapsSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  helperText: {
    fontSize: 12,
    color: c.textMuted,
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
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  shortcutButtonText: {
    fontSize: 12,
    color: c.textSecondary,
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
    backgroundColor: c.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.border,
  },
  perDayCapLabel: {
    fontSize: 13,
    color: c.text,
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
    backgroundColor: c.border,
    padding: 2,
  },
  customToggleSwitchOn: {
    backgroundColor: c.primary,
  },
  customToggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: c.background,
  },
  customToggleThumbOn: {
    transform: [{ translateX: 18 }],
  },
  customToggleLabel: {
    fontSize: 12,
    color: c.textSecondary,
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
    backgroundColor: c.background,
    borderWidth: 1,
    borderColor: c.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCapButtonText: {
    fontSize: 16,
    color: c.text,
    fontWeight: '600',
  },
  dayCapInput: {
    width: 60,
    height: 32,
    backgroundColor: c.background,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 14,
    color: c.text,
    textAlign: 'center',
    fontWeight: '600',
  },
  defaultIndicator: {
    fontSize: 11,
    color: c.textMuted,
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
    color: c.textMuted,
    marginBottom: 8,
  },
  timeAvailabilityUnit: {
    fontSize: 12,
    color: c.textMuted,
    marginTop: 4,
  },
  splitPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: c.border,
  },
  splitPreviewContent: {
    flex: 1,
  },
  splitPreviewLabel: {
    fontSize: 12,
    color: c.textMuted,
    marginBottom: 4,
    fontWeight: '600',
  },
  splitPreviewText: {
    fontSize: 13,
    color: c.text,
    fontWeight: '500',
  },
  splitPreviewHint: {
    fontSize: 11,
    color: c.textMuted,
    marginTop: 4,
    fontStyle: 'italic',
  },
  splitPreviewArrow: {
    fontSize: 18,
    color: c.primary,
    fontWeight: '600',
    marginLeft: 8,
  },
  footerContainer: {
    backgroundColor: c.surface,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  footer: {
    padding: 16,
  },
  generateButton: {
    backgroundColor: c.primary,
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
    color: c.onPrimary,
  },
  });
}
