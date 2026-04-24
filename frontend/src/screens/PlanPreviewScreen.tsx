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
import { useTheme, planSlotIconColors, type PlanSlotIconColors, type ColorPalette } from '../theme';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import { formatAtWeightFromLb } from '../lib/weightDisplay';
import {
  createPlan,
  generateSingleSession,
  GENERATE_SESSIONS_TIMEOUT_MESSAGE,
  type PlanSlot,
  type PlanSlotExercise,
} from '../services/planService';
import { generateWorkoutPreview, type WorkoutPreview } from '../services/workoutService';
import {
  runPipeline,
  runPipelineSafe,
  regeneratePipelineWeek,
  regeneratePipelineCardioSessions,
  planDraftToWeekPlans,
  sessionDraftToPlanSlotExercises,
  buildWorkoutPreviewFromSessionDraft,
  mapGroqPreviewExercise,
  exerciseDraftFromGenerateResult,
} from '../lib/planPipeline';
import {
  linesForPlanGenerationSnapshot,
  linesLegacyFormNotInAiRequest,
} from '../lib/planGenerationSummary';
import {
  AI_PROGRAMMING_TRANSPARENCY,
  NOT_MEDICAL_FOOTNOTE_SHORT,
} from '../constants/wellnessCopy';
import {
  bodyTagChipColors,
  previewSecondaryChipLabels,
  shortBodyTagLabel,
} from '../lib/previewExerciseMeta';
import type { PlanDraft, PlanInputs, SessionDraft } from '../types/plan';
import { formatLocalYmd, getWeekStartMonday } from '../lib/planCalendar';
import { navigateFromPlanToExerciseDetail, isLinkableLibraryExerciseId } from '../lib/exerciseNavigation';
import {
  exercisesLikeFromPrescription,
  getWorkoutDisplayEstimateMinutes,
} from '../lib/estimateWorkoutMinutes';

type PlanPreviewScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'PlanPreview'>;
type PlanPreviewScreenRouteProp = RouteProp<RootStackParamList, 'PlanPreview'>;

function regenFailureAlertTitle(errorMessage: string | undefined): string {
  return errorMessage === GENERATE_SESSIONS_TIMEOUT_MESSAGE
    ? 'Request timed out'
    : 'Regeneration failed';
}

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
  /** Snapshot for Apply — matches this card even if planDraft lookup desyncs after edits. */
  applyExercises?: PlanSlotExercise[];
}

interface WeekPlan {
  weekNumber: number;
  workouts: Record<string, PlanWorkout[]>;
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** When library metadata omitted, treat obvious machine/conditioning names as cardio. */
const CARDIO_EXERCISE_NAME = /\b(treadmill|rower|rowing machine|elliptical|bike|bicycle|ski erg|skierg|stair|stepper|assault|airdyne|swim|pool|arc trainer)\b/i;

/** True if this session includes cardio work (typed cardio day, or any Cardio-tagged / obvious cardio exercise). */
function sessionIncludesCardioExercise(session: SessionDraft): boolean {
  if (session.type === 'cardio') return true;
  for (const e of session.exercises ?? []) {
    if ((e.primaryMuscleGroup ?? '').trim().toLowerCase() === 'cardio') return true;
    if ((e.primaryMuscleGroup ?? '').trim().length > 0) continue;
    if (CARDIO_EXERCISE_NAME.test(e.name ?? '')) return true;
  }
  return false;
}

/** How many calendar sessions this week include at least one cardio exercise. */
function countSessionsWithCardioExerciseInWeek(
  draft: PlanDraft | null,
  weekIndex: number,
): number | null {
  if (!draft?.weeks?.length) return null;
  const wk = draft.weeks.find((w) => w.weekIndex === weekIndex);
  if (!wk) return null;
  let n = 0;
  for (const d of wk.days) {
    if (!d.session) continue;
    if (sessionIncludesCardioExercise(d.session)) n++;
  }
  return n;
}

/** Cache Groq workout previews so reopening the same card does not call the API again. */
function groqPreviewCacheKey(week: number, day: string, workoutId: string): string {
  return `${week}|${day}|${workoutId}`;
}

function groqExerciseSecondaryMuscles(e: unknown): string[] | undefined {
  const x = e as {
    secondaryMuscleGroups?: unknown;
    secondaryMuscleGroup?: string;
  };
  if (Array.isArray(x.secondaryMuscleGroups)) {
    const arr = x.secondaryMuscleGroups.filter(
      (v): v is string => typeof v === 'string' && v.trim().length > 0,
    );
    if (arr.length) return arr.map((s) => s.trim());
  }
  const one = typeof x.secondaryMuscleGroup === 'string' ? x.secondaryMuscleGroup.trim() : '';
  return one ? [one] : undefined;
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

/** Exercises for API apply — prefer card snapshot, else same mapping as planDraftToWeekPlans uses. */
function slotExercisesFromDraft(
  draft: PlanDraft,
  weekNumber: number,
  dayOfWeek: string,
): PlanSlotExercise[] | undefined {
  const wk = draft.weeks.find((w) => w.weekIndex === weekNumber);
  const day = wk?.days.find((d) => d.weekday === dayOfWeek);
  const session = day?.session;
  if (!session) return undefined;
  return sessionDraftToPlanSlotExercises(session, weekNumber, dayOfWeek);
}

function legacyGoalToPlanGoal(
  g: 'fat loss' | 'strength' | 'endurance' | 'hybrid',
): PlanInputs['goal'] {
  if (g === 'fat loss') return 'fat_loss';
  if (g === 'hybrid') return 'balanced';
  if (g === 'endurance') return 'endurance';
  return 'strength';
}

/** Prefer Generate Plan snapshot goal for reps display; else legacy route goal. */
function previewFormattingGoal(
  planInputs: PlanInputs | null | undefined,
  legacyRouteGoal: RootStackParamList['PlanPreview']['inputs']['goal'],
): PlanInputs['goal'] {
  if (planInputs?.goal) return planInputs.goal;
  return legacyGoalToPlanGoal(legacyRouteGoal);
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
function generateFullPlan(
  inputs: PlanPreviewScreenRouteProp['params']['inputs'],
  draftId: string,
  icons: PlanSlotIconColors,
): WeekPlan[] {
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
          iconColor: icons.strength,
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
            iconColor: icons.cardioAlt,
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
          iconColor: icons.strength,
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
            iconColor: icons.recovery,
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
          iconColor: icons.strength,
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
            iconColor: icons.recovery,
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
  draftId: string,
  icons: PlanSlotIconColors,
): WeekPlan[] {
  return generateFullPlan(inputs, draftId, icons);
}

export default function PlanPreviewScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const slotIcons = useMemo(() => planSlotIconColors(colors), [colors]);
  const styles = useMemo(() => createPlanPreviewStyles(colors), [colors]);
  const { weightUnit } = useUserPreferences();
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
  const [generationSummaryOpen, setGenerationSummaryOpen] = useState(false);

  const [loadingPreview, setLoadingPreview] = useState(!!planInputs);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [planDraft, setPlanDraft] = useState<PlanDraft | null>(null);
  const [planData, setPlanData] = useState<WeekPlan[]>(() =>
    planInputs ? [] : getInitialPlanData(inputs, draftId, planSlotIconColors(colors))
  );
  const [cardToReopen, setCardToReopen] = useState(returnToPlanCard ?? null);
  useEffect(() => {
    setCardToReopen(returnToPlanCard ?? null);
  }, [returnToPlanCard?.workoutId, returnToPlanCard?.weekNumber, returnToPlanCard?.day]);
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
          repairIfInvalid: true,
        });
        if (cancelled) return;
        if (result.ok) {
          setPlanDraft(result.draft);
          setPlanData(planDraftToWeekPlans(result.draft) as WeekPlan[]);
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
            setPreviewData(
              buildWorkoutPreviewFromSessionDraft(session, workout.title, {
                goal: previewFormattingGoal(planInputs, inputs.goal),
              }),
            );
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

        const formatGoal = previewFormattingGoal(planInputs, inputs.goal);
        const mapped: WorkoutPreview = {
          ...result,
          exercises: (result.exercises ?? []).map((e, idx) =>
            mapGroqPreviewExercise(
              {
                name: e.name,
                sets: e.sets,
                reps: typeof e.reps === 'number' ? e.reps : String(e.reps ?? ''),
                weight: e.weight,
                notes: e.notes,
                prescriptionType: e.prescriptionType,
                exerciseId:
                  typeof (e as { exerciseId?: string }).exerciseId === 'string'
                    ? (e as { exerciseId: string }).exerciseId
                    : undefined,
                secondaryMuscleGroups: groqExerciseSecondaryMuscles(e),
              },
              idx,
              formatGoal,
            ),
          ),
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

  const generationSummaryLines = useMemo(
    () => (planInputs ? linesForPlanGenerationSnapshot(planInputs) : []),
    [planInputs],
  );
  const generationLegacyNotSentLines = useMemo(() => linesLegacyFormNotInAiRequest(), []);
  
  // Calculate summaries for current week
  const weekSummary = useMemo(() => {
    if (!currentWeek) {
      return { sessions: 0, strength: 0, cardio: 0, recovery: 0, sessionsWithCardioExercise: 0 };
    }

    let sessions = 0;
    let strength = 0;
    let cardio = 0;
    let recovery = 0;

    DAYS_OF_WEEK.forEach((day) => {
      const workouts = currentWeek.workouts[day] || [];
      sessions += workouts.length;

      workouts.forEach((workout) => {
        if (workout.type === 'strength') strength++;
        else if (workout.type === 'cardio') cardio++;
        else if (workout.type === 'recovery') recovery++;
      });
    });

    const fromDraft = countSessionsWithCardioExerciseInWeek(planDraft, selectedWeek);
    const sessionsWithCardioExercise =
      fromDraft !== null ? fromDraft : cardio;

    return { sessions, strength, cardio, recovery, sessionsWithCardioExercise };
  }, [currentWeek, planDraft, selectedWeek]);

  /** Balanced/endurance + modality prefs: conditioning is baked into strength days, not a separate day. */
  const conditioningInStrengthSessions = useMemo(() => {
    if (!planInputs) return false;
    const hasMods = (planInputs.cardioModalities?.length ?? 0) > 0;
    return (
      hasMods &&
      (planInputs.goal === 'balanced' || planInputs.goal === 'endurance')
    );
  }, [planInputs]);

  const intensityToDifficulty = (intensity: Intensity): 'beginner' | 'intermediate' | 'advanced' => {
    if (intensity === 'Easy') return 'beginner';
    if (intensity === 'Hard') return 'advanced';
    return 'intermediate';
  };

  const handlePreviewExerciseRowPress = useCallback(
    (exerciseName: string, exerciseId?: string) => {
      const id = exerciseId?.trim() ?? '';
      if (!isLinkableLibraryExerciseId(id)) {
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
      navigateFromPlanToExerciseDetail(navigation, id, 'preview');
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
          setPreviewData(
            buildWorkoutPreviewFromSessionDraft(session, workout.title, {
              goal: previewFormattingGoal(planInputs, inputs.goal),
            }),
          );
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
        const formatGoal = previewFormattingGoal(planInputs, inputs.goal);
        const mapped: WorkoutPreview = {
          ...result,
          exercises: (result.exercises ?? []).map((e, idx) =>
            mapGroqPreviewExercise(
              {
                name: e.name,
                sets: e.sets,
                reps: typeof e.reps === 'number' ? e.reps : String(e.reps ?? ''),
                weight: e.weight,
                notes: e.notes,
                prescriptionType: e.prescriptionType,
                exerciseId:
                  typeof (e as { exerciseId?: string }).exerciseId === 'string'
                    ? (e as { exerciseId: string }).exerciseId
                    : undefined,
                secondaryMuscleGroups: groqExerciseSecondaryMuscles(e),
              },
              idx,
              formatGoal,
            ),
          ),
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

  const handleRetryGenerate = useCallback(async () => {
    if (!planInputs) return;
    setGenerateError(null);
    setLoadingPreview(true);
    try {
      const result = await runPipelineSafe(planInputs, draftId, {
        repairIfInvalid: true,
      });
      if (result.ok) {
        setPlanDraft(result.draft);
        setPlanData(planDraftToWeekPlans(result.draft) as WeekPlan[]);
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
      if (planInputs && planDraft) {
        const result = await regeneratePipelineWeek(
          planInputs,
          draftId,
          planDraft,
          weekNum,
          { repairIfInvalid: true }
        );
        if (!result.ok) {
          Alert.alert(regenFailureAlertTitle(result.error), result.error || "Couldn't generate. Try again.");
          return;
        }
        setPlanDraft(result.draft);
        const weekPlans = planDraftToWeekPlans(result.draft) as WeekPlan[];
        setPlanData((prev) =>
          prev.map((w) => (w.weekNumber === weekNum ? weekPlans[weekNum - 1] : w))
        );
      } else if (planInputs) {
        const result = await runPipelineSafe(planInputs, draftId, { repairIfInvalid: true });
        if (!result.ok) {
          Alert.alert(regenFailureAlertTitle(result.error), result.error || "Couldn't generate. Try again.");
          return;
        }
        setPlanDraft(result.draft);
        const weekPlans = planDraftToWeekPlans(result.draft) as WeekPlan[];
        setPlanData((prev) =>
          prev.map((w) => (w.weekNumber === weekNum ? weekPlans[weekNum - 1] : w))
        );
      } else {
        await new Promise((r) => setTimeout(r, 1500));
        const newPlan = generateFullPlan(inputs, draftId, slotIcons);
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
      if (planInputs && planDraft) {
        const result = await regeneratePipelineCardioSessions(planInputs, draftId, planDraft, {
          repairIfInvalid: true,
        });
        if (!result.ok) {
          Alert.alert(regenFailureAlertTitle(result.error), result.error || "Couldn't generate. Try again.");
          return;
        }
        setPlanDraft(result.draft);
        setPlanData(planDraftToWeekPlans(result.draft) as WeekPlan[]);
      } else if (planInputs) {
        const result = await runPipelineSafe(planInputs, draftId, { repairIfInvalid: true });
        if (!result.ok) {
          Alert.alert(regenFailureAlertTitle(result.error), result.error || "Couldn't generate. Try again.");
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
          Alert.alert(regenFailureAlertTitle(result.error), result.error || "Couldn't generate. Try again.");
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

    setPlanDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        weeks: prev.weeks.map((wk) => {
          if (wk.weekIndex !== selectedWeek) return wk;
          const fromIdx = wk.days.findIndex((d) => d.weekday === fromDay);
          const toIdx = wk.days.findIndex((d) => d.weekday === toDay);
          if (fromIdx < 0 || toIdx < 0) return wk;
          const days = [...wk.days];
          const a = days[fromIdx].session;
          const b = days[toIdx].session;
          days[fromIdx] = { ...days[fromIdx], session: b };
          days[toIdx] = { ...days[toIdx], session: a };
          return { ...wk, days };
        }),
      };
    });
    
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
          cardioFinisher: result.cardioFinisher,
          exercises: (result.exercises ?? []).map((e) => exerciseDraftFromGenerateResult(e, planInputs)),
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
        setPreviewData(
          buildWorkoutPreviewFromSessionDraft(newSession, result.name, {
            goal: previewFormattingGoal(planInputs, inputs.goal),
          }),
        );
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
      const ic = planSlotIconColors(colors);
      const templates: Record<WorkoutType, Pick<PlanWorkout, 'title' | 'detailLine' | 'iconColor' | 'intensity'>> = {
        cardio: { title: 'Cardio', detailLine: 'Zone 2 or intervals', iconColor: ic.cardio, intensity: 'Medium' },
        strength: { title: 'Strength', detailLine: 'Full body or split', iconColor: ic.strength, intensity: 'Medium' },
        recovery: { title: 'Recovery', detailLine: 'Stretch / mobility', iconColor: ic.recovery, intensity: 'Easy' },
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
    setPlanDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        weeks: prev.weeks.map((w) =>
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
    });
    setSwapModalVisible(false);
    setSelectedDayForSwap(null);
  }, [selectedWeek, selectedDayForSwap, colors]);

  const handleApply = async () => {
    setApplying(true);
    try {
      const slots: PlanSlot[] = [];
      planData.forEach((week) => {
        DAYS_OF_WEEK.forEach((dayOfWeek) => {
          const workouts = week.workouts[dayOfWeek] ?? [];
          workouts.forEach((w, orderInDay) => {
            const exercises =
              w.applyExercises?.length
                ? w.applyExercises
                : planDraft != null
                  ? slotExercisesFromDraft(planDraft, week.weekNumber, dayOfWeek)
                  : undefined;
            slots.push({
              weekNumber: week.weekNumber,
              dayOfWeek,
              title: w.title,
              detailLine: w.detailLine ?? undefined,
              type: w.type,
              durationMinutes: w.durationMinutes,
              intensity: w.intensity,
              orderInDay,
              ...(exercises?.length ? { exercises } : {}),
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
        return { backgroundColor: colors.successSoft, color: colors.success };
      case 'replaced':
        return { backgroundColor: colors.warningSoft, color: colors.warning };
      case 'moved':
        return { backgroundColor: colors.primarySoft, color: colors.primary };
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
          <Text style={[styles.loadingText, { color: colors.text }]}>
            {planInputs && planInputs.weeksCount > 1
              ? 'Generating your plan… Multi-week previews take longer (often about 1–2 minutes).'
              : 'Generating your plan… This may take a minute.'}
          </Text>
        </View>
      )}

      {generateError && !loadingPreview && (
        <View style={[styles.errorCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.errorTitle, { color: colors.text }]}>
            {generateError === GENERATE_SESSIONS_TIMEOUT_MESSAGE
              ? 'Request timed out'
              : "Couldn't generate. Try again."}
          </Text>
          <Text
            style={[styles.errorDetail, { color: colors.textSecondary }]}
            numberOfLines={generateError === GENERATE_SESSIONS_TIMEOUT_MESSAGE ? 6 : 3}
          >
            {generateError}
          </Text>
          <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={handleRetryGenerate}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={styles.previewBodyScroll}
        contentContainerStyle={styles.previewBodyScrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Week Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.weekTabs}
          contentContainerStyle={styles.weekTabsContent}
        >
          {planData.map((week) => (
            <TouchableOpacity
              key={week.weekNumber}
              style={[
                styles.weekTab,
                selectedWeek === week.weekNumber && styles.weekTabActive,
              ]}
              onPress={() => setSelectedWeek(week.weekNumber)}
            >
              <Text
                style={[
                  styles.weekTabText,
                  selectedWeek === week.weekNumber && styles.weekTabTextActive,
                ]}
              >
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
              <Text style={styles.summaryLabel}>Has cardio</Text>
              <Text style={styles.summaryValue}>{weekSummary.sessionsWithCardioExercise}</Text>
            </View>
          </View>
          {conditioningInStrengthSessions ? (
            <Text style={styles.summaryHint}>
              Has cardio counts any session with a cardio exercise (including short finishers on strength
              days), not only a full cardio-type day.
            </Text>
          ) : null}
        </View>

        {planInputs ? (
          <Text style={styles.previewCoachSurfaceHint}>
            Tap a session for warm-up, why this workout, cool-down, and any per-exercise coaching notes the
            generator included. Expand{' '}
            <Text style={{ fontWeight: '700', color: colors.textSecondary }}>What drove this preview</Text>
            {' '}for what was sent to the model vs fields only on the form.
          </Text>
        ) : null}

        {planInputs && generationSummaryLines.length > 0 ? (
          <View style={styles.genSummarySection}>
            <TouchableOpacity
              style={styles.genSummaryHeader}
              onPress={() => setGenerationSummaryOpen((o) => !o)}
              accessibilityRole="button"
              accessibilityLabel={
                generationSummaryOpen
                  ? 'Hide what drove this preview'
                  : 'Show what drove this preview'
              }
            >
              <Text style={styles.genSummaryTitle}>What drove this preview</Text>
              <Ionicons
                name={generationSummaryOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
            {generationSummaryOpen ? (
              <View style={styles.genSummaryBody}>
                {generationSummaryLines.map((line, i) => (
                  <Text
                    key={`${i}-${line.slice(0, 24)}`}
                    style={[styles.genSummaryLine, { color: colors.textSecondary }]}
                  >
                    {line}
                  </Text>
                ))}
                <Text style={[styles.genSummarySubhead, { color: colors.textMuted }]}>
                  Also on Generate Plan (not in the AI request)
                </Text>
                {generationLegacyNotSentLines.map((line, i) => (
                  <Text
                    key={`legacy-${i}-${line.slice(0, 20)}`}
                    style={[styles.genSummarySubLine, { color: colors.textMuted }]}
                  >
                    {line}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Adjust this week — practical rerolls based on current pipeline actions */}
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
                <Text style={styles.regenerateButtonText}>Rebuild Week</Text>
              )}
            </TouchableOpacity>
            {weekSummary.sessionsWithCardioExercise > 0 ? (
              <TouchableOpacity
                style={[styles.regenerateButton, regenerating === 'cardio' && styles.regenerateButtonActive]}
                onPress={handleRegenerateCardioOnly}
                disabled={!!regenerating}
              >
                {regenerating === 'cardio' ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.regenerateButtonText}>Refresh Cardio</Text>
                )}
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.regenerateButton, regenerating === 'easier' && styles.regenerateButtonActive]}
              onPress={handleMakeEasier}
              disabled={!!regenerating}
            >
              {regenerating === 'easier' ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.regenerateButtonText}>Reduce Intensity</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>

        <View style={styles.dayListColumn}>
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
                    <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.dayActionIcon}
                    onPress={() => handleSwapWorkout(day)}
                    accessibilityLabel="Swap workout"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="swap-horizontal" size={22} color={colors.textSecondary} />
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
        </View>
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
                    {previewCard.day} •{' '}
                    {getWorkoutDisplayEstimateMinutes(
                      exercisesLikeFromPrescription(
                        previewData?.exercises?.length
                          ? previewData.exercises
                          : previewCard.workout.applyExercises,
                      ),
                      previewCard.workout.durationMinutes,
                    ) ?? previewCard.workout.durationMinutes}{' '}
                    min • {formatWorkoutTypeLabel(previewCard.workout.type)}
                  </Text>
                  {planInputs ? (
                    <Text style={styles.progressionHint}>
                      {progressionHintFromPlanInputs(planInputs)}
                    </Text>
                  ) : null}
                  <Text style={styles.modalWellnessFootnote}>
                    {AI_PROGRAMMING_TRANSPARENCY} {NOT_MEDICAL_FOOTNOTE_SHORT}
                  </Text>
                  {previewLoading ? (
                    <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 24 }} />
                  ) : previewData ? (
                    <>
                      {(previewData.warmUp || previewData.reasoning || previewData.coolDown) ? (
                        <View style={styles.previewReasoning}>
                          <Text style={styles.previewSessionAdviceHeading}>Session advice</Text>
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
                          {previewData.exercises.some((e) => e.notes?.trim()) ? (
                            <Text style={styles.previewExercisesSubLabel}>
                              Per-exercise notes appear below the set prescription when the model added them
                              (common for beginners).
                            </Text>
                          ) : null}
                          {(previewData.exercises || [])
                            .slice()
                            .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
                            .map((ex, idx) => {
                              const tagLabel = ex.bodyTag ?? shortBodyTagLabel(ex.primaryMuscleGroup, ex.name);
                              const chipStyle = bodyTagChipColors(tagLabel, colors);
                              const legacySecondary = (ex as { secondaryMuscleGroup?: string })
                                .secondaryMuscleGroup;
                              const secondaryChipLabels = previewSecondaryChipLabels(
                                ex.secondaryMuscleGroups,
                                legacySecondary,
                                ex.primaryMuscleGroup,
                                ex.name,
                                tagLabel,
                              );
                              const showReplace = !!(planDraft && planInputs && !ex.isSyntheticFinisher);
                              return (
                                <View key={idx} style={styles.previewExerciseRow}>
                                  <View
                                    style={[styles.previewBodyTagChip, { backgroundColor: chipStyle.backgroundColor }]}
                                    accessibilityElementsHidden
                                    importantForAccessibility="no-hide-descendants"
                                  >
                                    <Text style={[styles.previewBodyTagText, { color: chipStyle.color }]} numberOfLines={1}>
                                      {tagLabel}
                                    </Text>
                                  </View>
                                  <TouchableOpacity
                                    style={styles.previewExerciseTextBlock}
                                    onPress={() => handlePreviewExerciseRowPress(ex.name, ex.exerciseId)}
                                    activeOpacity={0.65}
                                    accessibilityRole="button"
                                    accessibilityLabel={`View ${ex.name} in exercise library`}
                                  >
                                    <View style={styles.previewExerciseTitleRow}>
                                      <Text style={styles.previewExerciseName}>{ex.name}</Text>
                                      {secondaryChipLabels.map((secLabel, secIdx) => {
                                        const secChipStyle = bodyTagChipColors(secLabel, colors);
                                        return (
                                          <View
                                            key={`${secLabel}-${secIdx}`}
                                            style={[
                                              styles.previewSecondaryTagChip,
                                              { backgroundColor: secChipStyle.backgroundColor },
                                            ]}
                                            accessibilityElementsHidden
                                            importantForAccessibility="no-hide-descendants"
                                          >
                                            <Text
                                              style={[styles.previewBodyTagText, { color: secChipStyle.color }]}
                                              numberOfLines={1}
                                            >
                                              {secLabel}
                                            </Text>
                                          </View>
                                        );
                                      })}
                                    </View>
                                    <Text style={styles.previewExerciseMeta}>
                                      {ex.sets} × {ex.reps}
                                      {ex.weight != null ? formatAtWeightFromLb(ex.weight, weightUnit) : ''}
                                    </Text>
                                    {ex.notes?.trim() ? (
                                      <Text style={styles.previewExerciseNotes}>{ex.notes.trim()}</Text>
                                    ) : null}
                                  </TouchableOpacity>
                                  {showReplace ? (
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
                                        <Ionicons name="refresh-outline" size={22} color={colors.textSecondary} />
                                      )}
                                    </TouchableOpacity>
                                  ) : null}
                                </View>
                              );
                            })}
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
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <Text style={styles.primaryButtonText}>Apply to Plan</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function createPlanPreviewStyles(colors: ColorPalette) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backButton: {
    padding: 4,
  },
  backButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
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
    color: colors.onPrimary,
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
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
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
    backgroundColor: colors.primary,
  },
  weekTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  weekTabTextActive: {
    color: colors.onPrimary,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
    color: colors.textMuted,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  summaryHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 10,
    lineHeight: 17,
    textAlign: 'center',
  },
  previewCoachSurfaceHint: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    textAlign: 'center',
  },
  genSummarySection: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  genSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  genSummaryTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  genSummaryBody: {
    marginTop: 8,
    paddingBottom: 4,
  },
  genSummaryLine: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 4,
  },
  genSummarySubhead: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },
  genSummarySubLine: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 3,
  },
  adjustWeekSection: {
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  adjustWeekLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
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
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  regenerateButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  regenerateButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  /** Single vertical scroll for preview body (avoids nested flex:1 list + visible scrollbar). */
  previewBodyScroll: {
    flex: 1,
  },
  previewBodyScrollContent: {
    paddingBottom: 100,
  },
  dayListColumn: {
    paddingHorizontal: 16,
    paddingTop: 8,
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
    color: colors.text,
  },
  dayActions: {
    flexDirection: 'row',
    gap: 8,
  },
  dayActionButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayActionButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  dayActionTextActive: {
    color: colors.onPrimary,
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
    borderBottomColor: colors.border,
  },
  restDayName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  restDayBadge: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    opacity: 0.9,
  },
  workoutStack: {
    gap: 12,
  },
  workoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.onPrimary,
  },
  workoutContent: {
    flex: 1,
  },
  workoutTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  workoutDetailLine: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  moveIndicator: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  moveIndicatorText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.onPrimary,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.onPrimary,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  progressionHint: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
    marginBottom: 12,
    fontStyle: 'italic',
  },
  modalWellnessFootnote: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: 10,
  },
  previewReasoning: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
  },
  previewSessionAdviceHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 10,
  },
  previewReasoningLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  previewReasoningText: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
  },
  reasoningToggleText: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  previewExercises: {
    marginBottom: 16,
  },
  previewExercisesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  previewExercisesSubLabel: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
    marginTop: -4,
    marginBottom: 10,
  },
  previewExerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 10,
  },
  previewBodyTagChip: {
    minWidth: 56,
    maxWidth: 88,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  previewBodyTagText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  previewExerciseTextBlock: {
    flex: 1,
    marginRight: 4,
    minWidth: 0,
  },
  previewExerciseTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  previewSecondaryTagChip: {
    minWidth: 48,
    maxWidth: 88,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  previewReplaceIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    flexShrink: 0,
  },
  previewExerciseName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flexShrink: 1,
  },
  previewExerciseMeta: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  previewExerciseNotes: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
    marginTop: 6,
    fontStyle: 'italic',
  },
  previewNoExercises: {
    fontSize: 14,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  modalOptions: {
    gap: 12,
  },
  modalOption: {
    padding: 16,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  modalCancel: {
    marginTop: 16,
    padding: 16,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  });
}
