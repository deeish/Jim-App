import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CommonActions, useIsFocused } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../types/navigation';
import { useTheme } from '../theme/ThemeContext';
import { colors as themeColors } from '../theme/colors';
import { createPlan, generateSingleSession, type PlanSlot } from '../services/planService';
import { generateWorkoutPreview, type WorkoutPreview } from '../services/workoutService';
import {
  runPipeline,
  runPipelineSafe,
  planDraftToWeekPlans,
  formatDraftReps,
  type PipelineDebugInfo,
} from '../lib/planPipeline';
import type { PlanDraft, PlanInputs, SessionDraft } from '../types/plan';
import { formatLocalYmd, getWeekStartMonday } from '../lib/planCalendar';

type PlanPreviewScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'PlanPreview'>;
type PlanPreviewScreenRouteProp = RouteProp<RootStackParamList, 'PlanPreview'>;

type Props = {
  navigation: PlanPreviewScreenNavigationProp;
  route: PlanPreviewScreenRouteProp;
};

type Intensity = 'Easy' | 'Medium' | 'Hard';
type WorkoutType = 'strength' | 'cardio' | 'recovery';

interface PlanWorkout {
  id: string;
  title: string;
  detailLine: string;
  iconColor: string;
  durationMinutes: number;
  intensity: Intensity;
  type: WorkoutType;
  changeType?: 'new' | 'replaced' | 'moved';
  source?: 'manual' | 'ai';
  locked?: boolean;
  draftId?: string;
  week: number;
}

interface WeekPlan {
  weekNumber: number;
  workouts: Record<string, PlanWorkout[]>;
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Cache Groq workout previews so reopening the same card does not call the API again. */
function groqPreviewCacheKey(week: number, day: string, workoutId: string): string {
  return `${week}|${day}|${workoutId}`;
}

/** Open exercise library detail from Plan stack (ExerciseDetail lives under Search tab). */
function navigateToTabExerciseDetail(
  navigation: PlanPreviewScreenNavigationProp,
  exerciseId: string,
  planPreviewParams: any,
  returnToPlanCard?: { weekNumber: number; day: string; workoutId: string },
): void {
  const nav = navigation as any;
  const tabNav = nav?.getParent?.()?.getParent?.() ?? nav?.getParent?.();
  if (tabNav?.navigate) {
    tabNav.navigate('Search', {
      screen: 'ExerciseDetail',
      params: { exerciseId, returnToPlanPreview: true, planPreviewParams, returnToPlanCard },
    });
  }
}

const REASONING_PREVIEW_CHARS = 220;

type ReasoningSectionKey = 'warmUp' | 'reasoning' | 'coolDown';

function clipReasoningParagraph(text: string, maxChars: number): { short: string; needsMore: boolean } {
  const t = text.trim();
  if (t.length <= maxChars) return { short: t, needsMore: false };
  let cut = t.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > maxChars * 0.55) cut = cut.slice(0, lastSpace);
  return { short: `${cut.trim()}…`, needsMore: true };
}

function formatWorkoutTypeLabel(type: PlanWorkout['type']): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function progressionHintFromPlanInputs(planInputs: PlanInputs | undefined): string | null {
  if (!planInputs) return null;
  if (!planInputs.progressionStyle) {
    return 'Progression: when sets feel solid, add a small amount of weight or 1–2 reps next week.';
  }
  switch (planInputs.progressionStyle) {
    case 'build':
      return 'Progression: add weight or reps when you hit the top of each rep range on all sets.';
    case 'build_deload':
      return 'Progression: build for a few weeks, then use a lighter deload week before ramping again.';
    case 'maintain':
      return 'Progression: keep loads steady; prioritize technique and recovery.';
    default:
      return 'Progression: when sets feel solid, add a small amount of weight or 1–2 reps next week.';
  }
}

function parseRepScalar(reps: string): number {
  const m = String(reps).match(/\d+/);
  return m ? parseInt(m[0], 10) : 8;
}

function legacyGoalToPlanGoal(
  g: 'fat loss' | 'strength' | 'endurance' | 'hybrid',
): PlanInputs['goal'] {
  if (g === 'fat loss') return 'fat_loss';
  if (g === 'hybrid') return 'balanced';
  if (g === 'endurance') return 'endurance';
  return 'strength';
}

/** Modal payload from pipeline session (single source of truth with the week list). */
function workoutPreviewFromSessionDraft(
  session: SessionDraft,
  cardTitle: string,
  goal: PlanInputs['goal'],
): WorkoutPreview {
  const working = session.exercises.filter((e) => (e.sets ?? 0) > 0);
  return {
    name: cardTitle,
    reasoning: session.whyThisWorkout,
    warmUp: session.warmup,
    coolDown: session.cooldown,
    exercises: working.map((e, idx) => ({
      name: e.name,
      sets: e.sets,
      reps: /\d+\s*[–-]\s*\d+/.test(String(e.reps))
        ? e.reps
        : formatDraftReps(parseRepScalar(e.reps), goal),
      orderIndex: idx,
      exerciseId: e.exerciseId ?? undefined,
    })),
  };
}

/** Map frontend equipment keys to backend/exercise library display names. */
function mapEquipmentToBackend(equipment: string[]): string[] {
  const map: Record<string, string> = {
    barbell: 'Barbell',
    dumbbells: 'Dumbbell',
    machines: 'Machine',
    cable: 'Cable',
    kettlebells: 'Kettlebell',
    'pull-up bar': 'Pull-up Bar',
    bands: 'Resistance Band',
    'cardio machines': 'Machine',
  };
  return equipment.map((e) => map[e.toLowerCase()] ?? e.charAt(0).toUpperCase() + e.slice(1));
}

/** Map frontend programType to backend program template id. */
function programTypeToTemplateId(programType: string): string | undefined {
  const p = (programType || '').toLowerCase();
  if (p.includes('push-pull-legs') || p === 'ppl') return 'ppl';
  if (p.includes('upper-lower')) return 'upper-lower-4';
  if (p.includes('full body')) return 'full-body-3';
  return undefined;
}

// Generate plan for all weeks
function generateFullPlan(inputs: PlanPreviewScreenRouteProp['params']['inputs'], draftId: string): WeekPlan[] {
  const weeks: WeekPlan[] = [];
  const numWeeks = inputs.weeks || 1;
  
  for (let weekNum = 1; weekNum <= numWeeks; weekNum++) {
    const plan: Record<string, PlanWorkout[]> = {};
    const trainingDays = inputs.trainingDays || [];
    
    let doubleSessionCount = 0;
    const maxDoubleDays = inputs.allowDoubleSessions ? inputs.maxDoubleDaysPerWeek : 0;
    
    trainingDays.forEach((day, index) => {
      const workouts: PlanWorkout[] = [];
      const isDoubleDay = inputs.allowDoubleSessions && doubleSessionCount < maxDoubleDays && index < maxDoubleDays;
      
      // Add progression based on week number
      const weekMultiplier = 1 + (weekNum - 1) * 0.1; // 10% increase per week
      
      if (inputs.goal === 'strength') {
        const workoutType = index % 2 === 0 ? 'Upper Body' : 'Lower Body';
        workouts.push({
          id: `draft-w${weekNum}-${day}-1`,
          title: workoutType,
          detailLine: '6 exercises • Push focus',
          iconColor: '#C7A46A',
          durationMinutes: Math.round((inputs.timePerSession.min + 10) * weekMultiplier),
          intensity: index === 0 ? 'Hard' : 'Medium',
          type: 'strength',
          changeType: 'new',
          source: 'ai',
          draftId: draftId,
          week: weekNum,
        });
        
        if (isDoubleDay) {
          workouts.push({
            id: `draft-w${weekNum}-${day}-2`,
            title: 'Cardio',
            detailLine: 'Zone 2',
            iconColor: '#2ECC71',
            durationMinutes: inputs.timePerSession.min - 15,
            intensity: 'Easy',
            type: 'cardio',
            changeType: 'new',
            source: 'ai',
            draftId: draftId,
            week: weekNum,
          });
          doubleSessionCount++;
        }
      } else if (inputs.goal === 'endurance') {
        // Mixed days: strength + run (no cardio-only days)
        const strengthPart = index % 2 === 0 ? 'Lower Body' : 'Full Body';
        workouts.push({
          id: `draft-w${weekNum}-${day}-1`,
          title: `${strengthPart} + Run`,
          detailLine: index % 2 === 0 ? '4 exercises + 20 min run' : '5 exercises + 15 min run',
          iconColor: '#C7A46A',
          durationMinutes: Math.round(inputs.timePerSession.min * weekMultiplier),
          intensity: index === 0 ? 'Hard' : 'Medium',
          type: 'strength',
          changeType: 'new',
          source: 'ai',
          draftId: draftId,
          week: weekNum,
        });
        
        if (isDoubleDay) {
          workouts.push({
            id: `draft-w${weekNum}-${day}-2`,
            title: 'Recovery',
            detailLine: 'Stretch & mobility',
            iconColor: '#9B59B6',
            durationMinutes: 15,
            intensity: 'Easy',
            type: 'recovery',
            changeType: 'new',
            source: 'ai',
            draftId: draftId,
            week: weekNum,
          });
          doubleSessionCount++;
        }
      } else {
        // Hybrid or fat loss: strength-focused days only (no standalone cardio)
        const types = ['Upper Body', 'Lower Body', 'Full Body'];
        const workoutType = types[index % 3];
        const detailLines = ['6 exercises • Push focus', '6 exercises • Legs & core', '5 exercises • Full body'];
        workouts.push({
          id: `draft-w${weekNum}-${day}-1`,
          title: workoutType,
          detailLine: detailLines[index % 3],
          iconColor: '#C7A46A',
          durationMinutes: Math.round(inputs.timePerSession.min * weekMultiplier),
          intensity: index === 0 ? 'Hard' : 'Medium',
          type: 'strength',
          changeType: 'new',
          source: 'ai',
          draftId: draftId,
          week: weekNum,
        });
        
        if (isDoubleDay) {
          workouts.push({
            id: `draft-w${weekNum}-${day}-2`,
            title: 'Recovery',
            detailLine: 'Stretch & mobility',
            iconColor: '#9B59B6',
            durationMinutes: 15,
            intensity: 'Easy',
            type: 'recovery',
            changeType: 'new',
            source: 'ai',
            draftId: draftId,
            week: weekNum,
          });
          doubleSessionCount++;
        }
      }
      
      plan[day] = workouts;
    });
    
    weeks.push({
      weekNumber: weekNum,
      workouts: plan,
    });
  }
  
  return weeks;
}

function getInitialPlanData(
  inputs: RootStackParamList['PlanPreview']['inputs'],
  draftId: string
): WeekPlan[] {
  return generateFullPlan(inputs, draftId);
}

export default function PlanPreviewScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const { inputs, draftId, planInputs, returnToPlanCard } = route.params;
  const isFocused = useIsFocused();
  const [applying, setApplying] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [swapModalVisible, setSwapModalVisible] = useState(false);
  const [selectedDayForSwap, setSelectedDayForSwap] = useState<string | null>(null);
  const [moveMode, setMoveMode] = useState<{ workoutId: string; fromDay: string } | null>(null);
  const [previewCard, setPreviewCard] = useState<{ workout: PlanWorkout; day: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<WorkoutPreview | null>(null);
  /** True when modal shows PlanDraft session; false after "alternate" Groq preview. */
  const [previewUsesDraft, setPreviewUsesDraft] = useState(true);
  const [replacingExerciseName, setReplacingExerciseName] = useState<string | null>(null);
  const [expandedReasoning, setExpandedReasoning] = useState<Partial<Record<ReasoningSectionKey, boolean>>>({});

  const [loadingPreview, setLoadingPreview] = useState(!!planInputs);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [planDraft, setPlanDraft] = useState<PlanDraft | null>(null);
  const [planData, setPlanData] = useState<WeekPlan[]>(() =>
    planInputs ? [] : getInitialPlanData(inputs, draftId)
  );
  const [cardToReopen, setCardToReopen] = useState(returnToPlanCard ?? null);
  useEffect(() => {
    setCardToReopen(returnToPlanCard ?? null);
  }, [returnToPlanCard?.workoutId, returnToPlanCard?.weekNumber, returnToPlanCard?.day]);
  const [debugInfo, setDebugInfo] = useState<PipelineDebugInfo | null>(null);
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);

  const groqPreviewCacheRef = useRef<Map<string, WorkoutPreview>>(new Map());

  useEffect(() => {
    groqPreviewCacheRef.current.clear();
  }, [planDraft]);

  useEffect(() => {
    if (!planInputs) return;
    setGenerateError(null);
    setLoadingPreview(true);
    let cancelled = false;
    const frameId = requestAnimationFrame(async () => {
      try {
        const result = await runPipelineSafe(planInputs, draftId, {
          captureDebug: __DEV__,
          repairIfInvalid: true,
        });
        if (cancelled) return;
        if (result.ok) {
          setPlanDraft(result.draft);
          setPlanData(planDraftToWeekPlans(result.draft) as WeekPlan[]);
          if (result.debug) setDebugInfo(result.debug);
        } else {
          setGenerateError(result.error || "Couldn't generate. Try again.");
        }
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [planInputs, draftId]);

  useEffect(() => {
    setExpandedReasoning({});
  }, [previewCard?.day, previewCard?.workout.id]);

  // When user switches away from Plan tab, hide modals so global RN Modal doesn't block the other tab.
  useEffect(() => {
    if (isFocused) return;
    setPreviewCard(null);
    setPreviewData(null);
    setPreviewLoading(false);
    setPreviewUsesDraft(true);
    setSwapModalVisible(false);
  }, [isFocused]);
  
  // When returning from ExerciseDetail, reopen the exact workout card.
  useEffect(() => {
    if (!cardToReopen || !planInputs) return;
    if (!planDraft) return; // need planDraft to show draft-based session exercises

    let cancelled = false;
    const run = async (): Promise<void> => {
      try {
        setExpandedReasoning({});
        setSelectedWeek(cardToReopen.weekNumber);

        const weekPlan = planData.find((w) => w.weekNumber === cardToReopen.weekNumber);
        const workout =
          weekPlan?.workouts[cardToReopen.day]?.find((w) => w.id === cardToReopen.workoutId) ??
          weekPlan?.workouts[cardToReopen.day]?.[0];

        if (!workout) {
          if (!cancelled) setCardToReopen(null);
          return;
        }

        // Show the card immediately; if we need Groq fallback we can still replace previewData.
        setPreviewCard({ workout, day: cardToReopen.day });
        setPreviewData(null);
        setPreviewLoading(true);

        if (workout.type === 'recovery') {
          setPreviewUsesDraft(true);
          setPreviewData({ name: workout.title, exercises: [], reasoning: workout.detailLine });
          return;
        }

        const wkDraft = planDraft.weeks.find((w) => w.weekIndex === cardToReopen.weekNumber);
        const dayDraft = wkDraft?.days.find((d) => d.weekday === cardToReopen.day);
        const session = dayDraft?.session;

        if (session?.exercises?.length) {
          if (!cancelled) {
            setPreviewData(workoutPreviewFromSessionDraft(session, workout.title, planInputs.goal));
            setPreviewUsesDraft(true);
          }
          return;
        }

        // Groq fallback (cache avoids repeated calls when user taps back multiple times).
        const cacheKey = groqPreviewCacheKey(cardToReopen.weekNumber, cardToReopen.day, workout.id);
        const cached = groqPreviewCacheRef.current.get(cacheKey);
        if (cached) {
          if (!cancelled) {
            setPreviewUsesDraft(false);
            setPreviewData(cached);
          }
          return;
        }

        const result = await generateWorkoutPreview(cardToReopen.day, {
          focus: workout.title,
          duration: workout.durationMinutes,
          difficulty: intensityToDifficulty(workout.intensity),
          goal: inputs.goal ?? undefined,
          experience: inputs.experienceLevel ?? undefined,
          equipment: inputs.availableEquipment?.length ? mapEquipmentToBackend(inputs.availableEquipment) : undefined,
          limitations: inputs.avoidList?.length ? inputs.avoidList : undefined,
          programTemplateId: programTypeToTemplateId(inputs.programType ?? ''),
          programDayFocus: workout.title,
        });

        const planGoal = legacyGoalToPlanGoal(inputs.goal);
        const mapped: WorkoutPreview = {
          ...result,
          exercises: (result.exercises ?? []).map((e, idx) => ({
            name: e.name,
            sets: e.sets,
            reps:
              typeof e.reps === 'number' ? formatDraftReps(e.reps, planGoal) : String(e.reps ?? ''),
            weight: e.weight,
            notes: e.notes,
            orderIndex: idx,
            exerciseId: typeof (e as { exerciseId?: string }).exerciseId === 'string'
              ? (e as { exerciseId: string }).exerciseId
              : undefined,
          })),
        };

        groqPreviewCacheRef.current.set(cacheKey, mapped);
        if (!cancelled) {
          setPreviewUsesDraft(false);
          setPreviewData(mapped);
        }
      } catch (_e) {
        if (!cancelled) setPreviewData({ name: cardToReopen?.workoutId ?? 'Workout', exercises: [], reasoning: 'Could not load preview.' });
      } finally {
        if (!cancelled) setPreviewLoading(false);
        if (!cancelled) setCardToReopen(null);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [cardToReopen, planDraft, planData, planInputs, inputs]);
  
  const currentWeek = planData.find(w => w.weekNumber === selectedWeek) || planData[0];
  
  // Calculate summaries for current week
  const weekSummary = useMemo(() => {
    if (!currentWeek) return { sessions: 0, strength: 0, cardio: 0, recovery: 0 };

    let sessions = 0;
    let strength = 0;
    let cardio = 0;
    let recovery = 0;

    DAYS_OF_WEEK.forEach(day => {
      const workouts = currentWeek.workouts[day] || [];
      sessions += workouts.length;

      workouts.forEach(workout => {
        if (workout.type === 'strength') strength++;
        else if (workout.type === 'cardio') cardio++;
        else if (workout.type === 'recovery') recovery++;
      });
    });

    return { sessions, strength, cardio, recovery };
  }, [currentWeek]);

  const intensityToDifficulty = (intensity: Intensity): 'beginner' | 'intermediate' | 'advanced' => {
    if (intensity === 'Easy') return 'beginner';
    if (intensity === 'Hard') return 'advanced';
    return 'intermediate';
  };

  const handlePreviewExerciseRowPress = useCallback(
    (
      exerciseName: string,
      exerciseId?: string,
      returnToPlanCard?: { weekNumber: number; day: string; workoutId: string },
    ) => {
      const id = exerciseId?.trim();
      if (!id) {
        Alert.alert(
          'Exercise details',
          `“${exerciseName}” isn’t linked to the library yet. Open the Exercises tab and search by name.`,
        );
        return;
      }
      // Close the modal before navigating so the new screen isn't shown "behind" the preview overlay.
      setPreviewCard(null);
      setPreviewData(null);
      setPreviewLoading(false);
      setPreviewUsesDraft(true);
      navigateToTabExerciseDetail(navigation, id, { inputs, draftId, planInputs }, returnToPlanCard);
    },
    [navigation],
  );

  const handleCardPress = useCallback(
    async (workout: PlanWorkout, day: string) => {
      if (workout.type === 'recovery') {
        setPreviewCard({ workout, day });
        setPreviewUsesDraft(true);
        setPreviewData({ name: workout.title, exercises: [], reasoning: workout.detailLine });
        return;
      }
      setPreviewCard({ workout, day });

      if (planDraft && planInputs) {
        const wk = planDraft.weeks.find((w) => w.weekIndex === selectedWeek);
        const dayDraft = wk?.days.find((d) => d.weekday === day);
        const session = dayDraft?.session;
        if (session?.exercises?.length) {
          groqPreviewCacheRef.current.delete(
            groqPreviewCacheKey(selectedWeek, day, workout.id),
          );
          setPreviewLoading(false);
          setPreviewData(workoutPreviewFromSessionDraft(session, workout.title, planInputs.goal));
          setPreviewUsesDraft(true);
          return;
        }
      }

      const cacheKey = groqPreviewCacheKey(selectedWeek, day, workout.id);
      const cached = groqPreviewCacheRef.current.get(cacheKey);
      if (cached) {
        setPreviewUsesDraft(false);
        setPreviewLoading(false);
        setPreviewData(cached);
        return;
      }

      setPreviewUsesDraft(false);
      setPreviewLoading(true);
      setPreviewData(null);
      try {
        const result = await generateWorkoutPreview(day, {
          focus: workout.title,
          duration: workout.durationMinutes,
          difficulty: intensityToDifficulty(workout.intensity),
          goal: inputs.goal ?? undefined,
          experience: inputs.experienceLevel ?? undefined,
          equipment: inputs.availableEquipment?.length ? mapEquipmentToBackend(inputs.availableEquipment) : undefined,
          limitations: inputs.avoidList?.length ? inputs.avoidList : undefined,
          programTemplateId: programTypeToTemplateId(inputs.programType ?? ''),
          programDayFocus: workout.title,
        });
        const planGoal = legacyGoalToPlanGoal(inputs.goal);
        const mapped: WorkoutPreview = {
          ...result,
          exercises: (result.exercises ?? []).map((e, idx) => ({
            name: e.name,
            sets: e.sets,
            reps:
              typeof e.reps === 'number'
                ? formatDraftReps(e.reps, planGoal)
                : String(e.reps ?? ''),
            weight: e.weight,
            notes: e.notes,
            orderIndex: idx,
            exerciseId: typeof (e as { exerciseId?: string }).exerciseId === 'string'
              ? (e as { exerciseId: string }).exerciseId
              : undefined,
          })),
        };
        groqPreviewCacheRef.current.set(cacheKey, mapped);
        setPreviewData(mapped);
      } catch (_e) {
        setPreviewData({ name: workout.title, exercises: [], reasoning: 'Could not load preview.' });
      } finally {
        setPreviewLoading(false);
      }
    },
    [
      inputs.goal,
      inputs.experienceLevel,
      inputs.availableEquipment,
      inputs.avoidList,
      inputs.programType,
      planDraft,
      planInputs,
      selectedWeek,
    ],
  );

  const handleRegenerateAlternatePreview = useCallback(async () => {
    if (!previewCard || !planInputs) return;
    const { workout, day } = previewCard;
    if (workout.type === 'recovery') return;
    setPreviewLoading(true);
    try {
      const result = await generateWorkoutPreview(day, {
        focus: workout.title,
        duration: workout.durationMinutes,
        difficulty: intensityToDifficulty(workout.intensity),
        goal: inputs.goal ?? undefined,
        experience: inputs.experienceLevel ?? undefined,
        equipment: inputs.availableEquipment?.length ? mapEquipmentToBackend(inputs.availableEquipment) : undefined,
        limitations: inputs.avoidList?.length ? inputs.avoidList : undefined,
        programTemplateId: programTypeToTemplateId(inputs.programType ?? ''),
        programDayFocus: workout.title,
      });
      const mapped: WorkoutPreview = {
        ...result,
        exercises: (result.exercises ?? []).map((e, idx) => ({
          name: e.name,
          sets: e.sets,
          reps:
            typeof e.reps === 'number'
              ? formatDraftReps(e.reps, planInputs.goal)
              : String(e.reps ?? ''),
          weight: e.weight,
          notes: e.notes,
          orderIndex: idx,
          exerciseId: typeof (e as { exerciseId?: string }).exerciseId === 'string'
            ? (e as { exerciseId: string }).exerciseId
            : undefined,
        })),
      };
      groqPreviewCacheRef.current.set(
        groqPreviewCacheKey(selectedWeek, day, workout.id),
        mapped,
      );
      setPreviewData(mapped);
      setPreviewUsesDraft(false);
    } catch (_e) {
      Alert.alert('Preview failed', 'Could not generate alternate preview. Try again.');
    } finally {
      setPreviewLoading(false);
    }
  }, [
    previewCard,
    planInputs,
    selectedWeek,
    inputs.goal,
    inputs.experienceLevel,
    inputs.availableEquipment,
    inputs.avoidList,
    inputs.programType,
  ]);

  const handleRetryGenerate = useCallback(async () => {
    if (!planInputs) return;
    setGenerateError(null);
    setLoadingPreview(true);
    try {
      const result = await runPipelineSafe(planInputs, draftId, {
        captureDebug: __DEV__,
        repairIfInvalid: true,
      });
      if (result.ok) {
        setPlanDraft(result.draft);
        setPlanData(planDraftToWeekPlans(result.draft) as WeekPlan[]);
        if (result.debug) setDebugInfo(result.debug);
      } else {
        setGenerateError(result.error || "Couldn't generate. Try again.");
      }
    } finally {
      setLoadingPreview(false);
    }
  }, [planInputs, draftId]);

  const handleRegenerateWeek = async (weekNum: number) => {
    setRegenerating(`week-${weekNum}`);
    try {
      if (planInputs) {
        const result = await runPipelineSafe(planInputs, draftId, { repairIfInvalid: true });
        if (!result.ok) {
          Alert.alert('Regeneration failed', result.error || "Couldn't generate. Try again.");
          return;
        }
        setPlanDraft(result.draft);
        const weekPlans = planDraftToWeekPlans(result.draft) as WeekPlan[];
        setPlanData((prev) =>
          prev.map((w) => (w.weekNumber === weekNum ? weekPlans[weekNum - 1] : w))
        );
      } else {
        await new Promise((r) => setTimeout(r, 1500));
        const newPlan = generateFullPlan(inputs, draftId);
        setPlanData((prev) =>
          prev.map((w) => (w.weekNumber === weekNum ? newPlan[weekNum - 1] : w))
        );
      }
    } catch (_e) {
      Alert.alert('Regeneration failed', "Couldn't generate. Try again.");
    } finally {
      setRegenerating(null);
    }
  };

  const handleRegenerateCardioOnly = async () => {
    setRegenerating('cardio');
    try {
      if (planInputs) {
        const result = await runPipelineSafe(planInputs, draftId, { repairIfInvalid: true });
        if (!result.ok) {
          Alert.alert('Regeneration failed', result.error || "Couldn't generate. Try again.");
          return;
        }
        setPlanDraft(result.draft);
        setPlanData(planDraftToWeekPlans(result.draft) as WeekPlan[]);
      } else {
        await new Promise((r) => setTimeout(r, 1500));
        setPlanData((prev) =>
          prev.map((week) => ({
            ...week,
            workouts: Object.fromEntries(
              Object.entries(week.workouts).map(([day, workouts]) => [
                day,
                workouts.map((w) =>
                  w.type === 'cardio'
                    ? { ...w, title: 'New Cardio', detailLine: 'Regenerated', changeType: 'replaced' as const }
                    : w
                ),
              ])
            ),
          }))
        );
      }
    } catch (_e) {
      Alert.alert('Regeneration failed', "Couldn't generate. Try again.");
    } finally {
      setRegenerating(null);
    }
  };

  const handleMakeEasier = async () => {
    setRegenerating('easier');
    try {
      if (planInputs) {
        const result = await runPipelineSafe(planInputs, draftId, { repairIfInvalid: true, makeItEasier: true });
        if (!result.ok) {
          Alert.alert('Regeneration failed', result.error || "Couldn't generate. Try again.");
          return;
        }
        setPlanDraft(result.draft);
        setPlanData(planDraftToWeekPlans(result.draft) as WeekPlan[]);
      } else {
        await new Promise((r) => setTimeout(r, 1500));
        setPlanData((prev) =>
          prev.map((week) => ({
            ...week,
            workouts: Object.fromEntries(
              Object.entries(week.workouts).map(([day, workouts]) => [
                day,
                workouts.map((w) => ({
                  ...w,
                  intensity:
                    w.intensity === 'Hard' ? 'Medium' : w.intensity === 'Medium' ? 'Easy' : w.intensity,
                  changeType: w.intensity !== 'Easy' ? ('replaced' as const) : w.changeType,
                })),
              ])
            ),
          }))
        );
      }
    } catch (_e) {
      Alert.alert('Regeneration failed', "Couldn't generate. Try again.");
    } finally {
      setRegenerating(null);
    }
  };
  
  const handleSwapModality = async (from: string, to: string) => {
    setRegenerating('swap');
    setTimeout(() => {
      setPlanData(prev => prev.map(week => ({
        ...week,
        workouts: Object.fromEntries(
          Object.entries(week.workouts).map(([day, workouts]) => [
            day,
            workouts.map(w => {
              if (w.title.toLowerCase().includes(from.toLowerCase())) {
                return {
                  ...w,
                  title: w.title.replace(new RegExp(from, 'i'), to),
                  changeType: 'replaced' as const,
                };
              }
              return w;
            })
          ])
        )
      })));
      setRegenerating(null);
    }, 1500);
  };
  
  const handleMoveWorkout = useCallback((workoutId: string, fromDay: string) => {
    setMoveMode({ workoutId, fromDay });
  }, []);
  
  const handleMoveToDay = useCallback((toDay: string) => {
    if (!moveMode) return;
    
    const { workoutId, fromDay } = moveMode;
    
    setPlanData(prev => prev.map(week => {
      if (week.weekNumber !== selectedWeek) return week;
      
      const workouts = { ...week.workouts };
      const fromWorkouts = workouts[fromDay] || [];
      const workout = fromWorkouts.find(w => w.id === workoutId);
      
      if (!workout) return week;
      
      workouts[fromDay] = fromWorkouts.filter(w => w.id !== workoutId);
      workouts[toDay] = [...(workouts[toDay] || []), { ...workout, changeType: 'moved' as const }];
      
      return {
        ...week,
        workouts,
      };
    }));
    
    setMoveMode(null);
  }, [moveMode, selectedWeek]);
  
  const handleSwapWorkout = useCallback((day: string) => {
    setSelectedDayForSwap(day);
    setSwapModalVisible(true);
  }, []);

  const handleRemoveWorkout = useCallback(
    (day: string) => {
      if (!planDraft) return;
      if (previewCard?.day === day) {
        setPreviewCard(null);
        setPreviewData(null);
      }
      const updated: PlanDraft = {
        ...planDraft,
        weeks: planDraft.weeks.map((w) =>
          w.weekIndex === selectedWeek
            ? {
                ...w,
                days: w.days.map((d) =>
                  d.weekday === day ? { ...d, session: null } : d,
                ),
              }
            : w,
        ),
      };
      setPlanDraft(updated);
      setPlanData(planDraftToWeekPlans(updated) as WeekPlan[]);
    },
    [planDraft, selectedWeek, previewCard?.day],
  );

  const handleReplaceExercise = useCallback(
    async (exerciseName: string) => {
      if (!previewCard || !planDraft || !planInputs) return;
      const week = planDraft.weeks.find((w) => w.weekIndex === selectedWeek);
      const dayDraft = week?.days.find((d) => d.weekday === previewCard.day);
      const session = dayDraft?.session;
      if (!session) return;
      setReplacingExerciseName(exerciseName);
      try {
        const avoidConstraints = [
          ...(planInputs.injuriesAvoid?.bodyAreas ?? []),
          ...(planInputs.injuriesAvoid?.movementsOrEquipment ?? []),
        ];
        const goal =
          planInputs.goal === 'fat_loss'
            ? 'fat loss'
            : planInputs.goal === 'balanced'
              ? 'hybrid'
              : planInputs.goal;
        const result = await generateSingleSession({
          goal,
          location: planInputs.location,
          detailLevel: planInputs.detailLevel,
          avoidConstraints: avoidConstraints.length ? avoidConstraints : undefined,
          type: session.type,
          title: session.title,
          durationMin: session.durationMin,
          durationMax: session.durationMax,
          isHardDay: session.isHardDay,
          weekIndex: selectedWeek,
          weekday: previewCard.day,
          excludeExerciseNames: [exerciseName],
        });
        const newSession: import('../types/plan').SessionDraft = {
          type: session.type,
          title: result.name,
          focusTags: session.focusTags,
          durationMin: session.durationMin,
          durationMax: session.durationMax,
          isHardDay: session.isHardDay,
          warmup: result.warmUp,
          whyThisWorkout: result.reasoning,
          cooldown: result.coolDown,
          exercises: (result.exercises ?? []).map((e) => ({
            exerciseId: e.exerciseId ?? null,
            name: e.name ?? 'Exercise',
            sets: typeof e.sets === 'number' ? e.sets : 3,
            reps:
              typeof e.reps === 'number'
                ? formatDraftReps(e.reps, planInputs.goal)
                : '8–12',
            notes: e.notes,
          })),
        };
        if (newSession.exercises.length === 0) {
          newSession.exercises = [{ exerciseId: null, name: 'Generated', sets: 3, reps: '8–10' }];
        }
        const updated: PlanDraft = {
          ...planDraft,
          weeks: planDraft.weeks.map((w) =>
            w.weekIndex === selectedWeek
              ? {
                  ...w,
                  days: w.days.map((d) =>
                    d.weekday === previewCard.day
                      ? { ...d, session: newSession }
                      : d,
                  ),
                }
              : w,
          ),
        };
        setPlanDraft(updated);
        setPlanData(planDraftToWeekPlans(updated) as WeekPlan[]);
        setPreviewData({
          name: result.name,
          reasoning: result.reasoning,
          warmUp: result.warmUp,
          coolDown: result.coolDown,
          exercises: (result.exercises ?? []).map((e, idx) => ({
            name: e.name,
            sets: e.sets,
            reps:
              typeof e.reps === 'number'
                ? formatDraftReps(e.reps, planInputs.goal)
                : String(e.reps ?? '8–12'),
            weight: e.weight,
            notes: e.notes,
            orderIndex: idx,
            exerciseId: typeof (e as { exerciseId?: string }).exerciseId === 'string'
              ? (e as { exerciseId: string }).exerciseId
              : undefined,
          })),
        });
        setPreviewUsesDraft(false);
      } catch (e) {
        Alert.alert('Replace failed', (e as Error)?.message ?? "Couldn't replace exercise. Try again.");
      } finally {
        setReplacingExerciseName(null);
      }
    },
    [previewCard, planDraft, planInputs, selectedWeek],
  );

  const handleReplaceWithType = useCallback((newType: WorkoutType) => {
    if (!selectedDayForSwap) return;
    const day = selectedDayForSwap;
    setPlanData(prev => prev.map(week => {
      if (week.weekNumber !== selectedWeek) return week;
      const existing = week.workouts[day]?.[0];
      const durationMinutes = existing?.durationMinutes ?? 45;
      const templates: Record<WorkoutType, Pick<PlanWorkout, 'title' | 'detailLine' | 'iconColor' | 'intensity'>> = {
        cardio: { title: 'Cardio', detailLine: 'Zone 2 or intervals', iconColor: '#E67E22', intensity: 'Medium' },
        strength: { title: 'Strength', detailLine: 'Full body or split', iconColor: '#C7A46A', intensity: 'Medium' },
        recovery: { title: 'Recovery', detailLine: 'Stretch / mobility', iconColor: '#9B59B6', intensity: 'Easy' },
      };
      const t = templates[newType];
      const newWorkout: PlanWorkout = {
        id: `draft-swap-${week.weekNumber}-${day}-${Date.now()}`,
        title: t.title,
        detailLine: t.detailLine,
        iconColor: t.iconColor,
        durationMinutes,
        intensity: t.intensity,
        type: newType,
        changeType: 'replaced',
        source: 'ai',
        week: week.weekNumber,
      };
      return {
        ...week,
        workouts: { ...week.workouts, [day]: [newWorkout] },
      };
    }));
    setSwapModalVisible(false);
    setSelectedDayForSwap(null);
  }, [selectedWeek, selectedDayForSwap]);

  const handleApply = async () => {
    setApplying(true);
    try {
      const slots: PlanSlot[] = [];
      planData.forEach((week) => {
        DAYS_OF_WEEK.forEach((dayOfWeek) => {
          const workouts = week.workouts[dayOfWeek] ?? [];
          workouts.forEach((w, orderInDay) => {
            slots.push({
              weekNumber: week.weekNumber,
              dayOfWeek,
              title: w.title,
              detailLine: w.detailLine ?? undefined,
              type: w.type,
              durationMinutes: w.durationMinutes,
              intensity: w.intensity,
              orderInDay,
            });
          });
        });
      });
      const goalForApi = planInputs
        ? planInputs.goal === 'fat_loss'
          ? 'fat loss'
          : planInputs.goal === 'balanced'
            ? 'hybrid'
            : planInputs.goal
        : inputs.goal;
      await createPlan({
        name: `Plan ${new Date().toLocaleDateString()}`,
        weekAnchorMonday: formatLocalYmd(getWeekStartMonday(new Date())),
        slots,
        goal: goalForApi ?? undefined,
        experience: inputs.experienceLevel ?? undefined,
        equipment: inputs.availableEquipment?.length ? mapEquipmentToBackend(inputs.availableEquipment) : undefined,
        limitations: inputs.avoidList?.length ? inputs.avoidList : undefined,
        programTemplateId: programTypeToTemplateId(inputs.programType ?? ''),
      });
      // Plan tab stack root is PlanList (calendar). Reset so Preview/Generate aren’t left on the stack.
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'PlanList' }],
        }),
      );
    } catch (err) {
      console.error('Failed to apply plan:', err);
      Alert.alert('Could not save plan', 'Check your connection and try again.');
    } finally {
      setApplying(false);
    }
  };
  
  const getChangeBadgeStyle = (changeType?: string) => {
    switch (changeType) {
      case 'new':
        return { backgroundColor: 'rgba(107, 143, 113, 0.2)', color: colors.success };
      case 'replaced':
        return { backgroundColor: 'rgba(217, 119, 69, 0.2)', color: colors.warning };
      case 'moved':
        return { backgroundColor: 'rgba(199, 164, 106, 0.2)', color: colors.primary };
      default:
        return { backgroundColor: 'transparent', color: colors.text };
    }
  };
  
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Preview Plan</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loadingPreview && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.text }]}>Generating your plan… This may take a minute.</Text>
        </View>
      )}

      {generateError && !loadingPreview && (
        <View style={[styles.errorCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.errorTitle, { color: colors.text }]}>Couldn't generate. Try again.</Text>
          <Text style={[styles.errorDetail, { color: colors.textSecondary }]} numberOfLines={2}>
            {generateError}
          </Text>
          <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={handleRetryGenerate}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Week Tabs */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.weekTabs}
        contentContainerStyle={styles.weekTabsContent}
      >
        {planData.map(week => (
          <TouchableOpacity
            key={week.weekNumber}
            style={[
              styles.weekTab,
              selectedWeek === week.weekNumber && styles.weekTabActive
            ]}
            onPress={() => setSelectedWeek(week.weekNumber)}
          >
            <Text style={[
              styles.weekTabText,
              selectedWeek === week.weekNumber && styles.weekTabTextActive
            ]}>
              Week {week.weekNumber}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Week Summary */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Sessions</Text>
            <Text style={styles.summaryValue}>{weekSummary.sessions}/week</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Strength</Text>
            <Text style={styles.summaryValue}>{weekSummary.strength}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Cardio</Text>
            <Text style={styles.summaryValue}>{weekSummary.cardio}</Text>
          </View>
        </View>
      </View>

      {/* Adjust this week — secondary to Apply; same actions as before */}
      <View style={styles.adjustWeekSection}>
        <Text style={styles.adjustWeekLabel}>Adjust this week</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.adjustWeekScrollContent}>
          <TouchableOpacity
            style={[styles.regenerateButton, regenerating === `week-${selectedWeek}` && styles.regenerateButtonActive]}
            onPress={() => handleRegenerateWeek(selectedWeek)}
            disabled={!!regenerating}
          >
            {regenerating === `week-${selectedWeek}` ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={styles.regenerateButtonText}>Regenerate Week</Text>
            )}
          </TouchableOpacity>
          {weekSummary.cardio > 0 ? (
            <>
              <TouchableOpacity
                style={[styles.regenerateButton, regenerating === 'cardio' && styles.regenerateButtonActive]}
                onPress={handleRegenerateCardioOnly}
                disabled={!!regenerating}
              >
                {regenerating === 'cardio' ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.regenerateButtonText}>Regenerate Cardio</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.regenerateButton, regenerating === 'swap' && styles.regenerateButtonActive]}
                onPress={() => handleSwapModality('run', 'bike')}
                disabled={!!regenerating}
              >
                {regenerating === 'swap' ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.regenerateButtonText}>Swap Run → Bike</Text>
                )}
              </TouchableOpacity>
            </>
          ) : null}
          <TouchableOpacity
            style={[styles.regenerateButton, regenerating === 'easier' && styles.regenerateButtonActive]}
            onPress={handleMakeEasier}
            disabled={!!regenerating}
          >
            {regenerating === 'easier' ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={styles.regenerateButtonText}>Make It Easier</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {DAYS_OF_WEEK.map(day => {
          const workouts = currentWeek?.workouts[day] || [];
          const isMoveTarget = moveMode && moveMode.fromDay !== day;

          if (workouts.length === 0) {
            return (
              <View key={day} style={styles.restDayRow}>
                <Text style={styles.restDayName}>{day}</Text>
                <Text style={styles.restDayBadge}>Rest</Text>
              </View>
            );
          }

          return (
            <View key={day} style={styles.daySection}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayTitle}>{day}</Text>
                <View style={styles.dayActions}>
                  <TouchableOpacity
                    style={styles.dayActionIcon}
                    onPress={() => handleRemoveWorkout(day)}
                    accessibilityLabel="Remove workout"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={20} color={themeColors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.dayActionIcon}
                    onPress={() => handleSwapWorkout(day)}
                    accessibilityLabel="Swap workout"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="swap-horizontal" size={22} color={themeColors.textSecondary} />
                  </TouchableOpacity>
                  {moveMode && (
                    <TouchableOpacity
                      style={[styles.dayActionButton, isMoveTarget && styles.dayActionButtonActive]}
                      onPress={() => handleMoveToDay(day)}
                    >
                      <Text style={[styles.dayActionText, isMoveTarget && styles.dayActionTextActive]}>
                        Move Here
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={styles.workoutStack}>
                {workouts.map(workout => {
                  const badgeStyle = getChangeBadgeStyle(workout.changeType);

                  return (
                    <TouchableOpacity
                      key={workout.id}
                      style={styles.workoutCard}
                      onPress={() => handleCardPress(workout, day)}
                      onLongPress={() => handleMoveWorkout(workout.id, day)}
                      activeOpacity={0.7}
                    >
                      {workout.changeType && (
                        <View style={[styles.changeBadge, { backgroundColor: badgeStyle.backgroundColor }]}>
                          <Text style={[styles.changeBadgeText, { color: badgeStyle.color }]}>
                            {workout.changeType.toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={[styles.workoutIcon, { backgroundColor: workout.iconColor }]}>
                        <Text style={styles.workoutTypeBadge}>
                          {workout.type.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.workoutContent}>
                        <Text style={styles.workoutTitle}>{workout.title}</Text>
                        <Text style={styles.workoutDetailLine}>{workout.detailLine}</Text>
                      </View>
                      {moveMode?.workoutId === workout.id && (
                        <View style={styles.moveIndicator}>
                          <Text style={styles.moveIndicatorText}>Moving...</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Workout detail preview modal: exercises + reasoning */}
      <Modal
        // `Modal` is a global overlay; gate by focus so it can't block the other tab.
        visible={!!previewCard && isFocused}
        transparent
        animationType="slide"
        onRequestClose={() => { setPreviewCard(null); setPreviewData(null); }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {previewCard && (
                <>
                  <Text style={styles.modalTitle}>{previewCard.workout.title}</Text>
                  <Text style={styles.modalSubtitle}>
                    {previewCard.day} • {previewCard.workout.durationMinutes} min • {formatWorkoutTypeLabel(previewCard.workout.type)}
                  </Text>
                  {planInputs ? (
                    <Text style={styles.progressionHint}>
                      {progressionHintFromPlanInputs(planInputs)}
                    </Text>
                  ) : null}
                  {planInputs && previewCard.workout.type !== 'recovery' && previewUsesDraft ? (
                    <TouchableOpacity
                      style={styles.alternatePreviewButton}
                      onPress={handleRegenerateAlternatePreview}
                      disabled={previewLoading}
                    >
                      <Text style={styles.alternatePreviewText}>Generate alternate preview</Text>
                    </TouchableOpacity>
                  ) : null}
                  {planInputs && previewCard.workout.type !== 'recovery' && !previewUsesDraft ? (
                    <TouchableOpacity
                      style={styles.alternatePreviewButton}
                      onPress={() => {
                        if (!previewCard || !planDraft || !planInputs) return;
                        const wk = planDraft.weeks.find((w) => w.weekIndex === selectedWeek);
                        const dayDraft = wk?.days.find((d) => d.weekday === previewCard.day);
                        const session = dayDraft?.session;
                        if (session?.exercises?.length) {
                          setPreviewData(
                            workoutPreviewFromSessionDraft(session, previewCard.workout.title, planInputs.goal),
                          );
                          setPreviewUsesDraft(true);
                        }
                      }}
                    >
                      <Text style={styles.alternatePreviewText}>Back to plan exercises</Text>
                    </TouchableOpacity>
                  ) : null}
                  {previewLoading ? (
                    <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 24 }} />
                  ) : previewData ? (
                    <>
                      {(previewData.warmUp || previewData.reasoning || previewData.coolDown) ? (
                        <View style={styles.previewReasoning}>
                          {previewData.warmUp ? (
                            <>
                              <Text style={styles.previewReasoningLabel}>Warm-up</Text>
                              {(() => {
                                const expanded = !!expandedReasoning.warmUp;
                                const { short, needsMore } = clipReasoningParagraph(previewData.warmUp, REASONING_PREVIEW_CHARS);
                                return (
                                  <>
                                    <Text style={styles.previewReasoningText}>{expanded ? previewData.warmUp : short}</Text>
                                    {needsMore ? (
                                      <TouchableOpacity
                                        onPress={() => setExpandedReasoning(p => ({ ...p, warmUp: !p.warmUp }))}
                                        hitSlop={{ top: 6, bottom: 6 }}
                                      >
                                        <Text style={styles.reasoningToggleText}>{expanded ? 'Show less' : 'Show more'}</Text>
                                      </TouchableOpacity>
                                    ) : null}
                                  </>
                                );
                              })()}
                            </>
                          ) : null}
                          {previewData.reasoning ? (
                            <>
                              <Text style={[styles.previewReasoningLabel, !!previewData.warmUp && { marginTop: 12 }]}>Why this workout</Text>
                              {(() => {
                                const expanded = !!expandedReasoning.reasoning;
                                const { short, needsMore } = clipReasoningParagraph(previewData.reasoning, REASONING_PREVIEW_CHARS);
                                return (
                                  <>
                                    <Text style={styles.previewReasoningText}>{expanded ? previewData.reasoning : short}</Text>
                                    {needsMore ? (
                                      <TouchableOpacity
                                        onPress={() => setExpandedReasoning(p => ({ ...p, reasoning: !p.reasoning }))}
                                        hitSlop={{ top: 6, bottom: 6 }}
                                      >
                                        <Text style={styles.reasoningToggleText}>{expanded ? 'Show less' : 'Show more'}</Text>
                                      </TouchableOpacity>
                                    ) : null}
                                  </>
                                );
                              })()}
                            </>
                          ) : null}
                          {previewData.coolDown ? (
                            <>
                              <Text style={[styles.previewReasoningLabel, (!!previewData.warmUp || !!previewData.reasoning) && { marginTop: 12 }]}>Cool-down</Text>
                              {(() => {
                                const expanded = !!expandedReasoning.coolDown;
                                const { short, needsMore } = clipReasoningParagraph(previewData.coolDown, REASONING_PREVIEW_CHARS);
                                return (
                                  <>
                                    <Text style={styles.previewReasoningText}>{expanded ? previewData.coolDown : short}</Text>
                                    {needsMore ? (
                                      <TouchableOpacity
                                        onPress={() => setExpandedReasoning(p => ({ ...p, coolDown: !p.coolDown }))}
                                        hitSlop={{ top: 6, bottom: 6 }}
                                      >
                                        <Text style={styles.reasoningToggleText}>{expanded ? 'Show less' : 'Show more'}</Text>
                                      </TouchableOpacity>
                                    ) : null}
                                  </>
                                );
                              })()}
                            </>
                          ) : null}
                        </View>
                      ) : null}
                      {previewData.exercises?.length ? (
                        <View style={styles.previewExercises}>
                          <Text style={styles.previewExercisesLabel}>Exercises</Text>
                          {(previewData.exercises || [])
                            .slice()
                            .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
                            .map((ex, idx) => (
                              <View key={idx} style={styles.previewExerciseRow}>
                                <TouchableOpacity
                                  style={styles.previewExerciseTextBlock}
                                  onPress={() =>
                                    previewCard
                                      ? handlePreviewExerciseRowPress(ex.name, ex.exerciseId, {
                                          weekNumber: selectedWeek,
                                          day: previewCard.day,
                                          workoutId: previewCard.workout.id,
                                        })
                                      : handlePreviewExerciseRowPress(ex.name, ex.exerciseId)
                                  }
                                  activeOpacity={0.65}
                                  accessibilityRole="button"
                                  accessibilityLabel={`View ${ex.name} in exercise library`}
                                >
                                  <Text style={styles.previewExerciseName}>{ex.name}</Text>
                                  <Text style={styles.previewExerciseMeta}>
                                    {ex.sets} × {ex.reps}
                                    {ex.weight != null ? ` @ ${ex.weight} lb` : ''}
                                  </Text>
                                </TouchableOpacity>
                                {planDraft && planInputs && (
                                  <TouchableOpacity
                                    style={styles.previewReplaceIconBtn}
                                    onPress={() => handleReplaceExercise(ex.name)}
                                    disabled={!!replacingExerciseName}
                                    accessibilityLabel={`Replace ${ex.name}`}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                  >
                                    {replacingExerciseName === ex.name ? (
                                      <ActivityIndicator size="small" color={colors.primary} />
                                    ) : (
                                      <Ionicons name="refresh-outline" size={22} color={themeColors.textSecondary} />
                                    )}
                                  </TouchableOpacity>
                                )}
                              </View>
                            ))}
                        </View>
                      ) : (
                        <Text style={styles.previewNoExercises}>No exercises for this slot.</Text>
                      )}
                    </>
                  ) : null}
                </>
              )}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => { setPreviewCard(null); setPreviewData(null); }}
            >
              <Text style={styles.modalCancelText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Swap Workout Modal */}
      <Modal
        visible={swapModalVisible && isFocused}
        transparent
        animationType="slide"
        onRequestClose={() => setSwapModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Swap Workout</Text>
            <Text style={styles.modalSubtitle}>
              Replace workout on {selectedDayForSwap}?
            </Text>
            <View style={styles.modalOptions}>
              <TouchableOpacity
                style={styles.modalOption}
                onPress={() => handleReplaceWithType('cardio')}
              >
                <Text style={styles.modalOptionText}>Replace with Cardio</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalOption}
                onPress={() => handleReplaceWithType('strength')}
              >
                <Text style={styles.modalOptionText}>Replace with Strength</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalOption}
                onPress={() => handleReplaceWithType('recovery')}
              >
                <Text style={styles.modalOptionText}>Replace with Recovery</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setSwapModalVisible(false)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {typeof __DEV__ !== 'undefined' && __DEV__ && debugInfo && (
        <View style={[styles.debugPanel, { borderColor: themeColors.border, backgroundColor: themeColors.surface }]}>
          <TouchableOpacity
            style={styles.debugPanelHeader}
            onPress={() => setDebugPanelOpen((o) => !o)}
          >
            <Text style={[styles.debugPanelTitle, { color: themeColors.text }]}>
              🐛 Debug: Pipeline
            </Text>
            <Text style={[styles.debugPanelToggle, { color: themeColors.primary }]}>
              {debugPanelOpen ? '▼' : '▶'}
            </Text>
          </TouchableOpacity>
          {debugPanelOpen && (
            <ScrollView style={styles.debugPanelContent} nestedScrollEnabled>
              <Text style={[styles.debugSectionTitle, { color: themeColors.text }]}>PlanInputs</Text>
              <Text style={[styles.debugJson, { color: themeColors.textSecondary }]} selectable>
                {JSON.stringify(debugInfo.planInputs, null, 2)}
              </Text>
              <Text style={[styles.debugSectionTitle, { color: themeColors.text }]}>WeekSkeleton</Text>
              <Text style={[styles.debugJson, { color: themeColors.textSecondary }]} selectable>
                {JSON.stringify(debugInfo.weekSkeleton, null, 2)}
              </Text>
              <Text style={[styles.debugSectionTitle, { color: themeColors.text }]}>TemplateAssignments</Text>
              <Text style={[styles.debugJson, { color: themeColors.textSecondary }]} selectable>
                {JSON.stringify(debugInfo.templateAssignments, null, 2)}
              </Text>
              <Text style={[styles.debugSectionTitle, { color: themeColors.text }]}>SessionSpecs (to Grok)</Text>
              <Text style={[styles.debugJson, { color: themeColors.textSecondary }]} selectable>
                {JSON.stringify(debugInfo.sessionSpecs, null, 2)}
              </Text>
              <Text style={[styles.debugSectionTitle, { color: themeColors.text }]}>Raw Grok response</Text>
              <Text style={[styles.debugJson, { color: themeColors.textSecondary }]} selectable>
                {JSON.stringify(debugInfo.rawGrokResponse, null, 2)}
              </Text>
              <Text style={[styles.debugSectionTitle, { color: themeColors.text }]}>Normalization / validation</Text>
              <Text style={[styles.debugJson, { color: themeColors.textSecondary }]} selectable>
                {JSON.stringify(debugInfo.normalizationWarnings, null, 2)}
              </Text>
            </ScrollView>
          )}
        </View>
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => {
            if (planInputs) {
              navigation.navigate('GeneratePlan', { editFromSnapshot: planInputs });
            } else {
              navigation.goBack();
            }
          }}
          disabled={applying}
        >
          <Text style={styles.secondaryButtonText}>Edit Inputs</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleApply}
          disabled={applying || planData.length === 0}
        >
          {applying ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <Text style={styles.primaryButtonText}>Apply to Plan</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: themeColors.text,
  },
  headerSpacer: {
    width: 60,
  },
  loadingOverlay: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  errorCard: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  errorDetail: {
    fontSize: 14,
    marginBottom: 12,
  },
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  retryButtonText: {
    color: themeColors.background,
    fontWeight: '600',
  },
  debugPanel: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    maxHeight: 320,
  },
  debugPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  debugPanelTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  debugPanelToggle: {
    fontSize: 12,
  },
  debugPanelContent: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    maxHeight: 280,
  },
  debugSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 4,
  },
  debugJson: {
    fontSize: 11,
    fontFamily: 'monospace',
  },
  weekTabs: {
    maxHeight: 50,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
    backgroundColor: themeColors.surface,
  },
  weekTabsContent: {
    paddingHorizontal: 8,
  },
  weekTab: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 4,
    borderRadius: 8,
  },
  weekTabActive: {
    backgroundColor: themeColors.primary,
  },
  weekTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: themeColors.textSecondary,
  },
  weekTabTextActive: {
    color: themeColors.background,
  },
  summaryCard: {
    backgroundColor: themeColors.surface,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: themeColors.textMuted,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
    color: themeColors.text,
  },
  adjustWeekSection: {
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 12,
    backgroundColor: themeColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
  },
  adjustWeekLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: themeColors.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  adjustWeekScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 2,
  },
  regenerateButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 6,
    backgroundColor: themeColors.background,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  regenerateButtonActive: {
    backgroundColor: themeColors.primary,
    borderColor: themeColors.primary,
  },
  regenerateButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: themeColors.textSecondary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  daySection: {
    marginBottom: 18,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dayTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: themeColors.text,
  },
  dayActions: {
    flexDirection: 'row',
    gap: 8,
  },
  dayActionButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: themeColors.background,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  dayActionButtonActive: {
    backgroundColor: themeColors.primary,
    borderColor: themeColors.primary,
  },
  dayActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: themeColors.textSecondary,
  },
  dayActionTextActive: {
    color: themeColors.background,
  },
  dayActionIcon: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: 4,
  },
  restDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: themeColors.border,
  },
  restDayName: {
    fontSize: 14,
    fontWeight: '600',
    color: themeColors.textMuted,
  },
  restDayBadge: {
    fontSize: 13,
    fontWeight: '600',
    color: themeColors.textMuted,
    opacity: 0.9,
  },
  workoutStack: {
    gap: 12,
  },
  workoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: themeColors.surface,
    borderRadius: 12,
    padding: 12,
    position: 'relative',
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  changeBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  changeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  workoutIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  workoutTypeBadge: {
    fontSize: 16,
    fontWeight: '700',
    color: themeColors.background,
  },
  workoutContent: {
    flex: 1,
  },
  workoutTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: themeColors.text,
    marginBottom: 2,
  },
  workoutDetailLine: {
    fontSize: 13,
    color: themeColors.textSecondary,
  },
  moveIndicator: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: themeColors.primary,
    borderRadius: 4,
  },
  moveIndicatorText: {
    fontSize: 10,
    fontWeight: '600',
    color: themeColors.background,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
    backgroundColor: themeColors.surface,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: themeColors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: themeColors.background,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: themeColors.surface,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: themeColors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: themeColors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: themeColors.text,
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: themeColors.textSecondary,
    marginBottom: 8,
  },
  progressionHint: {
    fontSize: 13,
    color: themeColors.textMuted,
    lineHeight: 19,
    marginBottom: 12,
    fontStyle: 'italic',
  },
  alternatePreviewButton: {
    alignSelf: 'flex-start',
    marginBottom: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: themeColors.border,
    backgroundColor: themeColors.background,
  },
  alternatePreviewText: {
    fontSize: 13,
    fontWeight: '600',
    color: themeColors.primary,
  },
  previewReasoning: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: themeColors.background,
    borderRadius: 8,
  },
  previewReasoningLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: themeColors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  previewReasoningText: {
    fontSize: 15,
    color: themeColors.text,
    lineHeight: 22,
  },
  reasoningToggleText: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: themeColors.primary,
  },
  previewExercises: {
    marginBottom: 16,
  },
  previewExercisesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: themeColors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  previewExerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
  },
  previewExerciseTextBlock: {
    flex: 1,
    marginRight: 12,
  },
  previewReplaceIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: themeColors.background,
    borderWidth: 1,
    borderColor: themeColors.border,
    flexShrink: 0,
  },
  previewExerciseName: {
    fontSize: 16,
    fontWeight: '600',
    color: themeColors.text,
  },
  previewExerciseMeta: {
    fontSize: 14,
    color: themeColors.textSecondary,
    marginTop: 2,
  },
  previewNoExercises: {
    fontSize: 14,
    color: themeColors.textMuted,
    fontStyle: 'italic',
  },
  modalOptions: {
    gap: 12,
  },
  modalOption: {
    padding: 16,
    backgroundColor: themeColors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  modalOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: themeColors.text,
  },
  modalCancel: {
    marginTop: 16,
    padding: 16,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: themeColors.textSecondary,
  },
});
