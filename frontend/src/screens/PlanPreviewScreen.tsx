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
import { leading, planSlotIconColors, radius, spacing, text, tracking, type ColorPalette, useTheme, weight } from '../theme';
import { useTabBarInset } from '../navigation/useTabBarInset';
import BenchPressLoader from '../components/BenchPressLoader';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import { formatAtWeightFromLb } from '../lib/weightDisplay';
import { moveWorkoutBetweenDays } from '../lib/planPreviewMove';
import { formatRestSecondsForPreview } from '../lib/exercisePrescription';
import {
  createPlan,
  GENERATE_SESSIONS_TIMEOUT_MESSAGE,
  type PlanSlot,
  type PlanSlotExercise,
} from '../services/planService';
import { generateWorkoutPreview, type WorkoutPreview } from '../services/workoutService';
import { replaceExercise } from '../services/exerciseService';
import {
  runPipelineSafe,
  regeneratePipelineWeek,
  regeneratePipelineCardioSessions,
  planDraftToWeekPlans,
  sessionDraftToPlanSlotExercises,
  buildWorkoutPreviewFromSessionDraft,
  mapGroqPreviewExercise,
} from '../lib/planPipeline';
import {
  linesForPlanGenerationSnapshot,
  linesLegacyFormNotInAiRequest,
} from '../lib/planGenerationSummary';
import { stripCoachAdviceBullets } from '../lib/planDetailLineDisplay';
import {
  formatExercisePrescriptionCompact,
  profileGoalToPlanGoal,
} from '../lib/workoutExerciseDisplay';
import {
  AI_PROGRAMMING_TRANSPARENCY,
  NOT_MEDICAL_FOOTNOTE_SHORT,
} from '../constants/wellnessCopy';
import {
  bodyTagChipColors,
  previewSecondaryChipLabels,
  shortBodyTagLabel,
} from '../lib/previewExerciseMeta';
import type { ExerciseDraft, PlanDraft, PlanInputs, SessionDraft } from '../types/plan';
import { formatLocalYmd, getWeekStartMonday, parseLocalYmd } from '../lib/planCalendar';
import {
  savePlanPreviewDraft,
  loadPlanPreviewDraft,
  clearPlanPreviewDraft,
} from '../lib/planPreviewDraftStorage';
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
  /** Heuristic estimate displayed on the card (volume-aware, blended toward planned). */
  durationMinutes: number;
  /**
   * Planned slot duration (mean of `durationMin`/`durationMax`) — the stable anchor that
   * any volume-aware re-estimate (e.g. detail modal) should blend against. Without this,
   * a re-estimate that uses `durationMinutes` as the anchor drifts on every render.
   */
  plannedDurationMinutes?: number;
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


export default function PlanPreviewScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createPlanPreviewStyles(colors), [colors]);
  // The tab bar floats over this screen; the apply/edit footer must sit above it.
  const tabBarInset = useTabBarInset();
  const { weightUnit, goal } = useUserPreferences();
  const { inputs, draftId, planInputs, returnToPlanCard, fromOnboarding } = route.params;
  const goHome = () => {
    // Clear the Plan stack so a stale Preview isn't left mounted, then switch to the Home tab.
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'PlanList' }] }));
    navigation.getParent()?.navigate('Home' as never);
  };
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
  const [replacingExerciseName, setReplacingExerciseName] = useState<string | null>(null);
  const [expandedReasoning, setExpandedReasoning] = useState<Partial<Record<ReasoningSectionKey, boolean>>>({});
  const [generationSummaryOpen, setGenerationSummaryOpen] = useState(false);

  const [loadingPreview, setLoadingPreview] = useState(!!planInputs);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [planDraft, setPlanDraft] = useState<PlanDraft | null>(null);
  const [planData, setPlanData] = useState<WeekPlan[]>([]);
  const [cardToReopen, setCardToReopen] = useState(returnToPlanCard ?? null);
  useEffect(() => {
    setCardToReopen(returnToPlanCard ?? null);
  }, [returnToPlanCard?.workoutId, returnToPlanCard?.weekNumber, returnToPlanCard?.day]);
  const groqPreviewCacheRef = useRef<Map<string, WorkoutPreview>>(new Map());

  const planGoal = useMemo(() => profileGoalToPlanGoal(goal), [goal]);

  useEffect(() => {
    groqPreviewCacheRef.current.clear();
  }, [planDraft]);

  useEffect(() => {
    if (!planInputs) return;
    setGenerateError(null);
    setLoadingPreview(true);
    let cancelled = false;
    const controller = new AbortController();
    const frameId = requestAnimationFrame(async () => {
      try {
        // Same draft already persisted (resume after app kill, or remount of the
        // same preview) — hydrate instead of burning another generation slot.
        const persisted = await loadPlanPreviewDraft();
        if (cancelled) return;
        if (persisted?.draftId === draftId) {
          setPlanDraft(persisted.planDraft);
          setPlanData(planDraftToWeekPlans(persisted.planDraft) as WeekPlan[]);
          return;
        }
        const result = await runPipelineSafe(planInputs, draftId, {
          repairIfInvalid: true,
          signal: controller.signal,
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
      // Abort the in-flight Groq generation so leaving (e.g. "Edit inputs")
      // stops burning free-tier tokens server-side.
      controller.abort();
    };
  }, [planInputs, draftId]);

  // Back up the generated preview (and any edits to it) so an app kill or crash
  // during preview can be resumed from the Generate screen instead of lost.
  useEffect(() => {
    if (!planDraft || !planInputs) return;
    void savePlanPreviewDraft({
      draftId,
      params: { planInputs, inputs, draftId, fromOnboarding },
      planDraft,
    });
  }, [planDraft, planInputs, inputs, draftId, fromOnboarding]);

  useEffect(() => {
    setExpandedReasoning({});
  }, [previewCard?.day, previewCard?.workout.id]);

  // When user switches away from Plan tab, hide modals so global RN Modal doesn't block the other tab.
  useEffect(() => {
    if (isFocused) return;
    setPreviewCard(null);
    setPreviewData(null);
    setPreviewLoading(false);
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
          setPreviewData({ name: workout.title, exercises: [], reasoning: stripCoachAdviceBullets(workout.detailLine) });
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
          }
          return;
        }

        // Groq fallback (cache avoids repeated calls when user taps back multiple times).
        const cacheKey = groqPreviewCacheKey(cardToReopen.weekNumber, cardToReopen.day, workout.id);
        const cached = groqPreviewCacheRef.current.get(cacheKey);
        if (cached) {
          if (!cancelled) {
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
      return { sessions: 0, strength: 0, sessionsWithCardioExercise: 0 };
    }

    let sessions = 0;
    let strength = 0;
    let cardio = 0;

    DAYS_OF_WEEK.forEach((day) => {
      const workouts = currentWeek.workouts[day] || [];
      sessions += workouts.length;

      workouts.forEach((workout) => {
        if (workout.type === 'strength') strength++;
        else if (workout.type === 'cardio') cardio++;
      });
    });

    const fromDraft = countSessionsWithCardioExerciseInWeek(planDraft, selectedWeek);
    const sessionsWithCardioExercise = fromDraft !== null ? fromDraft : cardio;

    return { sessions, strength, sessionsWithCardioExercise };
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
      navigateFromPlanToExerciseDetail(navigation, id, 'preview');
    },
    [navigation],
  );

  const handleCardPress = useCallback(
    async (workout: PlanWorkout, day: string) => {
      setPreviewLoading(false);
      if (workout.type === 'recovery') {
        setPreviewCard({ workout, day });
        setPreviewData({ name: workout.title, exercises: [], reasoning: stripCoachAdviceBullets(workout.detailLine) });
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
          return;
        }
      }

      const cacheKey = groqPreviewCacheKey(selectedWeek, day, workout.id);
      const cached = groqPreviewCacheRef.current.get(cacheKey);
      if (cached) {
        setPreviewLoading(false);
        setPreviewData(cached);
        return;
      }

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
      }
    } catch (_e) {
      Alert.alert('Regeneration failed', "Couldn't generate. Try again.");
    } finally {
      setRegenerating(null);
      setMoveMode(null);
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
      }
    } catch (_e) {
      Alert.alert('Regeneration failed', "Couldn't generate. Try again.");
    } finally {
      setRegenerating(null);
      setMoveMode(null);
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
      }
    } catch (_e) {
      Alert.alert('Regeneration failed', "Couldn't generate. Try again.");
    } finally {
      setRegenerating(null);
      setMoveMode(null);
    }
  };

  const handleMoveWorkout = useCallback((workoutId: string, fromDay: string) => {
    setMoveMode({ workoutId, fromDay });
  }, []);
  
  const handleMoveToDay = useCallback((toDay: string) => {
    if (!moveMode) return;
    
    const { workoutId, fromDay } = moveMode;
    
    setPlanData(prev => prev.map(week => {
      if (week.weekNumber !== selectedWeek) return week;
      // ⚠ The display used to APPEND to the destination while the draft below
      // SWAPPED the two days' sessions. They agree only when the destination is
      // empty; onto an occupied day the display showed two workouts there and
      // none at the origin, and since `handleApply` reads slots from HERE and
      // exercises from the DRAFT, Apply wrote the destination twice and lost
      // the origin's session outright. One shared definition now, and the swap
      // is the correct one — a day holds one session, and the calendar's word
      // for moving onto a taken day is "make room".
      return {
        ...week,
        workouts: moveWorkoutBetweenDays(
          week.workouts,
          workoutId,
          fromDay,
          toDay,
          (workout) => ({ ...workout, changeType: 'moved' as const }),
        ),
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
      // Only the tapped exercise should change — find it, swap it, keep the rest.
      const targetIndex = session.exercises.findIndex((e) => e.name === exerciseName);
      if (targetIndex < 0) return;
      const target = session.exercises[targetIndex];
      setReplacingExerciseName(exerciseName);
      try {
        const avoidConstraints = [
          ...(planInputs.injuriesAvoid?.bodyAreas ?? []),
          ...(planInputs.injuriesAvoid?.movementsOrEquipment ?? []),
        ];
        // Catalog-based swap: one alternative that matches the target's muscle, isn't
        // already in the day, and doesn't repeat another exercise's movement pattern
        // (so flat-barbell-bench isn't "replaced" with flat-dumbbell-bench).
        const picked = await replaceExercise({
          targetName: target.name,
          targetExerciseId: target.exerciseId ?? undefined,
          dayExerciseNames: session.exercises.map((e) => e.name).filter(Boolean),
          dayExerciseIds: session.exercises
            .map((e) => e.exerciseId)
            .filter((id): id is string => !!id),
          location: planInputs.location,
          avoid: avoidConstraints.length ? avoidConstraints : undefined,
        });
        if (!picked) {
          Alert.alert(
            'No replacement found',
            "Couldn't find a different exercise that fits this day. Try again.",
          );
          return;
        }
        // Keep the slot's prescription (sets/reps/rest); only the identity changes.
        const replacement: ExerciseDraft = {
          ...target,
          exerciseId: picked.id,
          name: picked.name,
          primaryMuscleGroup: picked.primaryMuscleGroup,
          secondaryMuscleGroups: picked.secondaryMuscleGroups?.length
            ? [...picked.secondaryMuscleGroups]
            : undefined,
          notes: undefined,
        };
        const newSession: SessionDraft = {
          ...session,
          exercises: session.exercises.map((ex, i) => (i === targetIndex ? replacement : ex)),
        };
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
          buildWorkoutPreviewFromSessionDraft(newSession, newSession.title, {
            goal: previewFormattingGoal(planInputs, inputs.goal),
          }),
        );
      } catch (e) {
        Alert.alert('Replace failed', (e as Error)?.message ?? "Couldn't replace exercise. Try again.");
      } finally {
        setReplacingExerciseName(null);
      }
    },
    [previewCard, planDraft, planInputs, selectedWeek, inputs.goal],
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
      const secondaryGoalForApi = planInputs?.secondaryGoal
        ? planInputs.secondaryGoal === 'fat_loss'
          ? 'fat loss'
          : planInputs.secondaryGoal === 'balanced'
            ? 'hybrid'
            : planInputs.secondaryGoal
        : undefined;
      const goalIdToLabel = (g?: string | null): string | null => {
        switch (g) {
          case 'fat_loss':
            return 'Fat Loss';
          case 'balanced':
            return 'Balanced';
          case 'endurance':
            return 'Endurance';
          case 'strength':
            return 'Strength';
          default:
            return null;
        }
      };
      const primaryLabel =
        goalIdToLabel(planInputs?.goal) ??
        (inputs.goal === 'fat loss'
          ? 'Fat Loss'
          : inputs.goal === 'hybrid'
            ? 'Balanced'
            : inputs.goal === 'endurance'
              ? 'Endurance'
              : 'Strength');
      const secondaryLabel = goalIdToLabel(planInputs?.secondaryGoal ?? null);
      // Reflect a chosen secondary emphasis in the plan name (e.g. "Strength + Fat Loss").
      const goalLabel = secondaryLabel
        ? `${primaryLabel} + ${secondaryLabel}`
        : primaryLabel;
      const daysCount = planInputs?.daysPerWeek ?? inputs.trainingDays?.length ?? 4;
      const weeksCount = planInputs?.weeksCount ?? inputs.weeks ?? 1;
      const derivedName = `${goalLabel} · ${daysCount}d/wk · ${weeksCount > 1 ? `${weeksCount} wks` : '1 wk'}`;
      await createPlan({
        name: derivedName,
        weekAnchorMonday: formatLocalYmd(getWeekStartMonday(
          planInputs?.startDateISO ? parseLocalYmd(planInputs.startDateISO) : new Date()
        )),
        slots,
        goal: goalForApi ?? undefined,
        secondaryGoal: secondaryGoalForApi,
        experience: inputs.experienceLevel ?? undefined,
        equipment: inputs.availableEquipment?.length ? mapEquipmentToBackend(inputs.availableEquipment) : undefined,
        limitations: inputs.avoidList?.length ? inputs.avoidList : undefined,
        programTemplateId: programTypeToTemplateId(inputs.programType ?? ''),
      });
      // Applied — the persisted backup is no longer needed.
      void clearPlanPreviewDraft();
      // First plan from onboarding → drop the user on Home (greeting + today's session).
      // Otherwise reset the Plan stack to PlanList so Preview/Generate aren't left on the stack.
      if (fromOnboarding) {
        goHome();
      } else {
        navigation.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: 'PlanList' }],
          }),
        );
      }
    } catch {
      Alert.alert('Could not save plan', 'Check your connection and try again.');
    } finally {
      setApplying(false);
    }
  };
  
  const getChangeBadgeStyle = (changeType?: string) => {
    switch (changeType) {
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
        <TouchableOpacity
          onPress={() => (fromOnboarding ? goHome() : navigation.goBack())}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>{fromOnboarding ? '← Home' : '← Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Preview Plan</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loadingPreview && (
        <View style={styles.loadingOverlay}>
          <BenchPressLoader size={200} colors={colors} />
          <Text style={[styles.loadingText, { color: colors.text }]}>
            {fromOnboarding
              ? 'Building your plan… This may take a minute.'
              : planInputs && planInputs.weeksCount > 1
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

      {!loadingPreview && (
      <ScrollView
        style={styles.previewBodyScroll}
        contentContainerStyle={styles.previewBodyScrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {planData.length > 0 && (
          <>
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
          </>
        )}

        {planInputs ? (
          <Text style={styles.previewCoachSurfaceHint}>
            Tap a session for warm-up, why this workout, cool-down, and any per-exercise coaching notes the
            generator included. Expand{' '}
            <Text style={{ fontWeight: weight.bold, color: colors.textSecondary }}>What drove this preview</Text>
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
        {!loadingPreview && <View style={styles.adjustWeekSection}>
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
        </View>}

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
                    onPress={() =>
                      Alert.alert(
                        'Remove workout?',
                        `Remove the workout on ${day}?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Remove', style: 'destructive', onPress: () => handleRemoveWorkout(day) },
                        ],
                      )
                    }
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
                    <>
                      {moveMode.fromDay === day && (
                        <TouchableOpacity
                          style={styles.dayActionButton}
                          onPress={() => setMoveMode(null)}
                        >
                          <Text style={styles.dayActionText}>Cancel</Text>
                        </TouchableOpacity>
                      )}
                      {isMoveTarget && (
                        <TouchableOpacity
                          style={[styles.dayActionButton, styles.dayActionButtonActive]}
                          onPress={() => handleMoveToDay(day)}
                        >
                          <Text style={[styles.dayActionText, styles.dayActionTextActive]}>
                            Move Here
                          </Text>
                        </TouchableOpacity>
                      )}
                    </>
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
                      {(workout.changeType === 'replaced' || workout.changeType === 'moved') && (
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
                        <Text style={styles.workoutDetailLine}>{stripCoachAdviceBullets(workout.detailLine)}</Text>
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
      )}

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
                      // Anchor to the slot's planned duration (stable across renders),
                      // not the card's already-blended estimate. Falls back to the
                      // card estimate for mock / swap cards that lack a planned slot.
                      previewCard.workout.plannedDurationMinutes ??
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
                    <View style={{ marginVertical: spacing.lg, alignItems: 'center' }}>
                      <BenchPressLoader size={140} colors={colors} />
                    </View>
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
                              <Text style={[styles.previewReasoningLabel, !!previewData.warmUp && { marginTop: spacing.md }]}>Why this workout</Text>
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
                              <Text style={[styles.previewReasoningLabel, (!!previewData.warmUp || !!previewData.reasoning) && { marginTop: spacing.md }]}>Cool-down</Text>
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
                                      {formatExercisePrescriptionCompact(
                                        {
                                          name: ex.name,
                                          sets: ex.sets,
                                          reps: ex.reps,
                                          prescriptionType: ex.prescriptionType,
                                          primaryMuscleGroup: ex.primaryMuscleGroup,
                                        },
                                        planGoal,
                                      )}
                                      {ex.weight != null ? formatAtWeightFromLb(ex.weight, weightUnit) : ''}
                                      {typeof ex.restSeconds === 'number' && ex.restSeconds > 0
                                        ? ` · ${formatRestSecondsForPreview(ex.restSeconds)} rest`
                                        : ''}
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

      <View style={[styles.footer, { paddingBottom: spacing.lg + tabBarInset }]}>
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
        {/* Rendered OUTSIDE the loadingPreview gate, so for the whole
            1-2 minute generation a full-colour primary button sat here,
            `disabled` but with no disabled styling, silently swallowing
            taps. There is nothing to apply until the plan exists. */}
        <TouchableOpacity
          style={[
            styles.primaryButton,
            (applying || loadingPreview || planData.length === 0) && styles.primaryButtonDisabled,
          ]}
          onPress={handleApply}
          disabled={applying || loadingPreview || planData.length === 0}
        >
          {applying ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <Text style={styles.primaryButtonText}>
              {loadingPreview ? 'Building your plan…' : 'Apply to Plan'}
            </Text>
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backButton: {
    padding: spacing.xs,
  },
  backButtonText: {
    fontSize: text.callout,
    color: colors.primary,
    fontWeight: weight.semibold,
  },
  headerTitle: {
    fontSize: text.headline,
    fontWeight: weight.bold,
    color: colors.text,
  },
  headerSpacer: {
    width: 60,
  },
  loadingOverlay: {
    flex: 1,
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: text.callout,
    textAlign: 'center',
  },
  errorCard: {
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  errorTitle: {
    fontSize: text.callout,
    fontWeight: weight.bold,
    marginBottom: spacing.xs,
  },
  errorDetail: {
    fontSize: text.body,
    marginBottom: spacing.md,
  },
  retryButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  retryButtonText: {
    color: colors.onPrimary,
    fontWeight: weight.semibold,
  },
  weekTabs: {
    maxHeight: 50,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  weekTabsContent: {
    paddingHorizontal: spacing.sm,
  },
  weekTab: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.xs,
    borderRadius: radius.sm,
  },
  weekTabActive: {
    backgroundColor: colors.primary,
  },
  weekTabText: {
    fontSize: text.body,
    fontWeight: weight.semibold,
    color: colors.textSecondary,
  },
  weekTabTextActive: {
    color: colors.onPrimary,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
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
    fontSize: text.footnote,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  summaryValue: {
    fontSize: text.callout,
    fontWeight: weight.bold,
    color: colors.text,
  },
  summaryHint: {
    fontSize: text.footnote,
    color: colors.textMuted,
    marginTop: spacing.md,
    lineHeight: leading.footnote,
    textAlign: 'center',
  },
  previewCoachSurfaceHint: {
    fontSize: text.footnote,
    lineHeight: leading.footnote,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    textAlign: 'center',
  },
  genSummarySection: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  genSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  genSummaryTitle: {
    fontSize: text.footnote,
    fontWeight: weight.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: tracking.wide,
  },
  genSummaryBody: {
    marginTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  genSummaryLine: {
    fontSize: text.body,
    lineHeight: leading.body,
    marginBottom: spacing.xs,
  },
  genSummarySubhead: {
    fontSize: text.caption,
    fontWeight: weight.semibold,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: tracking.wide,
  },
  genSummarySubLine: {
    fontSize: text.footnote,
    lineHeight: leading.footnote,
    marginBottom: spacing.xs,
  },
  adjustWeekSection: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  adjustWeekLabel: {
    fontSize: text.footnote,
    fontWeight: weight.semibold,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: tracking.wide,
  },
  adjustWeekScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.xxs,
  },
  regenerateButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  regenerateButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  regenerateButtonText: {
    fontSize: text.footnote,
    fontWeight: weight.semibold,
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  daySection: {
    marginBottom: spacing.lg,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  dayTitle: {
    fontSize: text.headline,
    fontWeight: weight.bold,
    color: colors.text,
  },
  dayActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dayActionButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.xs,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayActionButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayActionText: {
    fontSize: text.footnote,
    fontWeight: weight.semibold,
    color: colors.textSecondary,
  },
  dayActionTextActive: {
    color: colors.onPrimary,
  },
  dayActionIcon: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radius.xs,
  },
  restDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.xxs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  restDayName: {
    fontSize: text.body,
    fontWeight: weight.semibold,
    color: colors.textMuted,
  },
  restDayBadge: {
    fontSize: text.body,
    fontWeight: weight.semibold,
    color: colors.textMuted,
    opacity: 0.9,
  },
  workoutStack: {
    gap: spacing.md,
  },
  workoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.border,
  },
  changeBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.xs,
  },
  changeBadgeText: {
    fontSize: text.caption,
    fontWeight: weight.bold,
  },
  workoutIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    marginRight: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  workoutTypeBadge: {
    fontSize: text.callout,
    fontWeight: weight.bold,
    color: colors.onPrimary,
  },
  workoutContent: {
    flex: 1,
  },
  workoutTitle: {
    fontSize: text.callout,
    fontWeight: weight.semibold,
    color: colors.text,
    marginBottom: spacing.xxs,
  },
  workoutDetailLine: {
    fontSize: text.body,
    color: colors.textSecondary,
  },
  moveIndicator: {
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.xs,
  },
  moveIndicatorText: {
    fontSize: text.caption,
    fontWeight: weight.semibold,
    color: colors.onPrimary,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** A disabled button must LOOK disabled — see the footer comment. */
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    fontSize: text.callout,
    fontWeight: weight.semibold,
    color: colors.onPrimary,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingVertical: spacing.lg,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    fontSize: text.callout,
    fontWeight: weight.semibold,
    color: colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: text.title,
    fontWeight: weight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  modalSubtitle: {
    fontSize: text.body,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  progressionHint: {
    fontSize: text.body,
    color: colors.textMuted,
    lineHeight: leading.body,
    marginBottom: spacing.md,
    fontStyle: 'italic',
  },
  modalWellnessFootnote: {
    fontSize: text.footnote,
    color: colors.textMuted,
    lineHeight: leading.footnote,
    marginBottom: spacing.md,
  },
  previewReasoning: {
    marginBottom: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
  },
  previewSessionAdviceHeading: {
    fontSize: text.body,
    fontWeight: weight.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  previewReasoningLabel: {
    fontSize: text.footnote,
    fontWeight: weight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: tracking.wider,
  },
  previewReasoningText: {
    fontSize: text.callout,
    color: colors.text,
    lineHeight: leading.callout,
  },
  reasoningToggleText: {
    marginTop: spacing.sm,
    fontSize: text.body,
    fontWeight: weight.semibold,
    color: colors.primary,
  },
  previewExercises: {
    marginBottom: spacing.lg,
  },
  previewExercisesLabel: {
    fontSize: text.footnote,
    fontWeight: weight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: tracking.wider,
  },
  previewExercisesSubLabel: {
    fontSize: text.footnote,
    color: colors.textMuted,
    lineHeight: leading.footnote,
    marginTop: -4,
    marginBottom: spacing.md,
  },
  previewExerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    marginBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  previewBodyTagChip: {
    minWidth: 56,
    maxWidth: 88,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  previewBodyTagText: {
    fontSize: text.caption,
    fontWeight: weight.bold,
    letterSpacing: tracking.wide,
  },
  previewExerciseTextBlock: {
    flex: 1,
    marginRight: spacing.xs,
    minWidth: 0,
  },
  previewExerciseTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  previewSecondaryTagChip: {
    minWidth: 48,
    maxWidth: 88,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  previewReplaceIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    flexShrink: 0,
  },
  previewExerciseName: {
    fontSize: text.callout,
    fontWeight: weight.semibold,
    color: colors.text,
    flexShrink: 1,
  },
  previewExerciseMeta: {
    fontSize: text.body,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  previewExerciseNotes: {
    fontSize: text.body,
    color: colors.textMuted,
    lineHeight: leading.body,
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  previewNoExercises: {
    fontSize: text.body,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  modalOptions: {
    gap: spacing.md,
  },
  modalOption: {
    padding: spacing.lg,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalOptionText: {
    fontSize: text.callout,
    fontWeight: weight.semibold,
    color: colors.text,
  },
  modalCancel: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: text.callout,
    fontWeight: weight.semibold,
    color: colors.textSecondary,
  },
  });
}
