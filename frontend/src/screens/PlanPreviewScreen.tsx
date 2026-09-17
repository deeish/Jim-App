import React, { useState, useMemo, useCallback, useEffect } from 'react';
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
import PlanBuildLoader from '../components/PlanBuildLoader';
import { coachCheckDetailLines, coachCheckHeadline } from '../lib/planGenerationSummary';
import { moveWorkoutBetweenDays } from '../lib/planPreviewMove';
import {
  createPlan,
  GENERATE_SESSIONS_TIMEOUT_MESSAGE,
  type PlanSlot,
  type PlanSlotExercise,
} from '../services/planService';
import { refreshLiveCalendarData } from '../lib/planCalendarPrototypeStore';
import {
  runPipelineSafe,
  regeneratePipelineWeek,
  regeneratePipelineCardioSessions,
  applyRecordedSwaps,
  planDraftToWeekPlans,
  sessionDraftToPlanSlotExercises,
} from '../lib/planPipeline';
import { runKeepAlive } from '../lib/planGenerationKeepAlive';
import SheetModal from '../components/SheetModal';
import { generateWorkoutPreview } from '../services/workoutService';
import { daySummaryLine, findSession, statedPlanLine, weekPhases } from '../lib/planPreviewEdits';
import { getPreviewSession, setPreviewSession, subscribePreviewSession } from '../lib/planPreviewSession';
import {
  linesForPlanGenerationSnapshot,
} from '../lib/planGenerationSummary';
import { stripCoachAdviceBullets } from '../lib/planDetailLineDisplay';
import {
  AI_PROGRAMMING_TRANSPARENCY,
  NOT_MEDICAL_FOOTNOTE_SHORT,
} from '../constants/wellnessCopy';
import type { PlanDraft, SessionDraft } from '../types/plan';
import { formatLocalYmd, getWeekStartMonday, parseLocalYmd } from '../lib/planCalendar';
import {
  savePlanPreviewDraft,
  loadPlanPreviewDraft,
  clearPlanPreviewDraft,
  saveLastAppliedPlanInputs,
} from '../lib/planPreviewDraftStorage';

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



function formatWorkoutTypeLabel(type: PlanWorkout['type']): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}


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
  const { inputs, draftId, planInputs, fromOnboarding } = route.params;
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
  // The three sheets of the redesigned preview (2026-09-17): the coach
  // detail, the week's adjustments, and how the plan was built.
  const [coachSheet, setCoachSheet] = useState(false);
  const [adjustSheet, setAdjustSheet] = useState(false);
  const [builtSheet, setBuiltSheet] = useState(false);

  const [loadingPreview, setLoadingPreview] = useState(!!planInputs);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [planDraft, setPlanDraft] = useState<PlanDraft | null>(null);
  const [planData, setPlanData] = useState<WeekPlan[]>([]);

  useEffect(() => {
    if (!planInputs) return;
    setGenerateError(null);
    setLoadingPreview(true);
    let cancelled = false;
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
        // The run outlives this screen: backing out to edit one field and
        // returning joins the same request, and a finished run persists its
        // draft even if nobody is listening (planGenerationKeepAlive.ts).
        const result = await runKeepAlive(
          draftId,
          () => runPipelineSafe(planInputs, draftId, { repairIfInvalid: true }),
          async (r) => {
            if (r.ok) {
              await savePlanPreviewDraft({
                draftId,
                params: { planInputs, inputs, draftId, fromOnboarding },
                planDraft: r.draft,
              });
            }
          },
        );
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
    // inputs/fromOnboarding only feed the persisted params; the run is keyed by draftId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // When user switches away from Plan tab, hide modals so global RN Modal doesn't block the other tab.
  useEffect(() => {
    if (isFocused) return;
    setSwapModalVisible(false);
    setCoachSheet(false);
    setAdjustSheet(false);
    setBuiltSheet(false);
  }, [isFocused]);

  // The pushed day screen reads and edits the same draft through the shared
  // preview session: publish what this screen holds, take back what the day
  // screen changed (planPreviewSession.ts).
  useEffect(() => {
    setPreviewSession({ draftId, planDraft, planInputs, inputs });
  }, [draftId, planDraft, planInputs, inputs]);
  useEffect(() => {
    setPreviewSession({ regenerating });
  }, [regenerating]);
  useEffect(
    () =>
      subscribePreviewSession((s) => {
        if (s.draftId !== draftId) return;
        setPlanDraft((prev) => {
          if (s.planDraft === prev || !s.planDraft) return prev;
          setPlanData(planDraftToWeekPlans(s.planDraft) as WeekPlan[]);
          return s.planDraft;
        });
        setRegenerating((prev) => (prev === s.regenerating ? prev : s.regenerating));
      }),
    [draftId],
  );
  
  
  const currentWeek = planData.find(w => w.weekNumber === selectedWeek) || planData[0];
  const phases = useMemo(() => (planDraft ? weekPhases(planDraft, planInputs) : {}), [planDraft, planInputs]);
  /** One line under a day card, from the draft session (cardio and recovery read differently). */
  const cardLine = useCallback(
    (day: string, workout: PlanWorkout): string => {
      const session = findSession(planDraft, selectedWeek, day);
      if (session) return daySummaryLine(session);
      return stripCoachAdviceBullets(workout.detailLine) || formatWorkoutTypeLabel(workout.type);
    },
    [planDraft, selectedWeek],
  );

  // The week at a glance and the coach check, straight from the draft
  // (Tier 3 of the 2026-09-16 plan): one line per training day, and the
  // server's read of the week with the per-muscle volume behind a tap.
  const coachReport = useMemo(
    () => planDraft?.debugMeta?.coachCheck?.find((r) => r.weekIndex === selectedWeek),
    [planDraft, selectedWeek],
  );
  const coachHeadline = useMemo(() => coachCheckHeadline(coachReport), [coachReport]);
  const coachDetail = useMemo(() => coachCheckDetailLines(coachReport), [coachReport]);
  /** The headline without its "Coach check:" prefix (the dot says it), capitalised. */
  const coachLineText = useMemo(() => {
    const t = (coachHeadline ?? '').replace(/^Coach check: /, '');
    return t.charAt(0).toUpperCase() + t.slice(1);
  }, [coachHeadline]);
  const coachSeverity: 'ok' | 'note' = useMemo(
    () => (coachReport?.findings.some((f) => f.severity !== 'info') ? 'note' : 'ok'),
    [coachReport],
  );
  /** Bars for the coach sheet: weighted sets per muscle against the band, heaviest first. */
  const coachBars = useMemo(() => {
    if (!coachReport) return [];
    const band = coachReport.band;
    const entries = Object.entries(coachReport.volumeByMuscle)
      .filter(([, v]) => v.weighted > 0)
      .sort((a, b) => b[1].weighted - a[1].weighted);
    const scale = Math.max(band ? band.max * 1.15 : 0, ...entries.map(([, v]) => v.weighted), 1);
    return entries.map(([muscle, v]) => {
      const sets = Number.isInteger(v.weighted) ? String(v.weighted) : v.weighted.toFixed(1);
      const small = muscle === 'Arms' || muscle === 'Core';
      const min = band ? (small ? Math.round(band.min / 2) : band.min) : 0;
      const max = band ? band.max : Infinity;
      return {
        muscle,
        pct: Math.min(100, (v.weighted / scale) * 100),
        bandLeft: (min / scale) * 100,
        bandRight: band ? Math.min(100, (max / scale) * 100) : 100,
        inBand: v.weighted >= min && (muscle === 'Core' || v.weighted <= max),
        label: v.exposures > 0 ? `${sets} · ${v.exposures}d` : `${sets}`,
      };
    });
  }, [coachReport]);
  const generationSummaryLines = useMemo(
    () =>
      planInputs
        ? linesForPlanGenerationSnapshot(planInputs, planDraft?.debugMeta?.builtBy)
        : [],
    [planInputs, planDraft?.debugMeta?.builtBy],
  );
  
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
  const intensityToDifficulty = (intensity: Intensity): 'beginner' | 'intermediate' | 'advanced' => {
    if (intensity === 'Easy') return 'beginner';
    if (intensity === 'Hard') return 'advanced';
    return 'intermediate';
  };

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

  const openDay = useCallback(
    (day: string) => {
      navigation.navigate('PlanPreviewDay', { weekNumber: selectedWeek, day });
    },
    [navigation, selectedWeek],
  );

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
        const draft = applyRecordedSwaps(result.draft, getPreviewSession().recordedSwaps);
        setPlanDraft(draft);
        const weekPlans = planDraftToWeekPlans(draft) as WeekPlan[];
        setPlanData((prev) =>
          prev.map((w) => (w.weekNumber === weekNum ? weekPlans[weekNum - 1] : w))
        );
      } else if (planInputs) {
        const result = await runPipelineSafe(planInputs, draftId, { repairIfInvalid: true });
        if (!result.ok) {
          Alert.alert(regenFailureAlertTitle(result.error), result.error || "Couldn't generate. Try again.");
          return;
        }
        const draft = applyRecordedSwaps(result.draft, getPreviewSession().recordedSwaps);
        setPlanDraft(draft);
        const weekPlans = planDraftToWeekPlans(draft) as WeekPlan[];
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
    [planDraft, selectedWeek],
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
      // A day whose type was swapped in the preview has a card but no draft
      // session, and used to apply as an EMPTY day (July checklist 4.5).
      // Generate its content now, before the slots are built.
      const filledByDay = new Map<string, PlanSlotExercise[]>();
      for (const week of planData) {
        for (const dayOfWeek of DAYS_OF_WEEK) {
          for (const w of week.workouts[dayOfWeek] ?? []) {
            const already =
              (w.applyExercises?.length ?? 0) > 0 ||
              (planDraft != null &&
                (slotExercisesFromDraft(planDraft, week.weekNumber, dayOfWeek)?.length ?? 0) > 0);
            if (already || w.type === 'recovery') continue;
            try {
              const result = await generateWorkoutPreview(dayOfWeek, {
                focus: w.title,
                duration: w.durationMinutes,
                difficulty: intensityToDifficulty(w.intensity),
                goal: inputs.goal ?? undefined,
                experience: inputs.experienceLevel ?? undefined,
                equipment: inputs.availableEquipment?.length
                  ? mapEquipmentToBackend(inputs.availableEquipment)
                  : undefined,
                limitations: inputs.avoidList?.length ? inputs.avoidList : undefined,
                programTemplateId: programTypeToTemplateId(inputs.programType ?? ''),
                programDayFocus: w.title,
              });
              const rows: PlanSlotExercise[] = (result.exercises ?? []).flatMap((e, idx) => {
                const exerciseId = (e as { exerciseId?: unknown }).exerciseId;
                if (typeof exerciseId !== 'string' || !exerciseId) return [];
                const reps = typeof e.reps === 'number' ? e.reps : parseInt(String(e.reps ?? ''), 10);
                return [
                  {
                    exerciseId,
                    name: e.name,
                    sets: Math.max(1, Number(e.sets) || 1),
                    reps: Number.isFinite(reps) && reps > 0 ? reps : 8,
                    ...(typeof e.weight === 'number' ? { weight: e.weight } : {}),
                    ...(e.notes ? { notes: e.notes } : {}),
                    ...(e.prescriptionType ? { prescriptionType: e.prescriptionType } : {}),
                    orderIndex: idx,
                  },
                ];
              });
              if (rows.length > 0) filledByDay.set(`${week.weekNumber}:${dayOfWeek}`, rows);
            } catch {
              // The slot applies without exercises and the server fills it on demand.
            }
          }
        }
      }
      const slots: PlanSlot[] = [];
      planData.forEach((week) => {
        DAYS_OF_WEEK.forEach((dayOfWeek) => {
          const workouts = week.workouts[dayOfWeek] ?? [];
          workouts.forEach((w, orderInDay) => {
            const fromDraft =
              w.applyExercises?.length
                ? w.applyExercises
                : planDraft != null
                  ? slotExercisesFromDraft(planDraft, week.weekNumber, dayOfWeek)
                  : undefined;
            const exercises = fromDraft?.length
              ? fromDraft
              : filledByDay.get(`${week.weekNumber}:${dayOfWeek}`);
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
            : planInputs.goal === 'muscle'
              ? 'hypertrophy'
              : planInputs.goal
        : inputs.goal;
      const secondaryGoalForApi = planInputs?.secondaryGoal
        ? planInputs.secondaryGoal === 'fat_loss'
          ? 'fat loss'
          : planInputs.secondaryGoal === 'balanced'
            ? 'hybrid'
            : planInputs.secondaryGoal === 'muscle'
              ? 'hypertrophy'
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
          case 'muscle':
            return 'Muscle';
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
      // Applied — the persisted backup is no longer needed; the inputs are
      // kept so the next block can start from them when this plan ends.
      void clearPlanPreviewDraft();
      if (planInputs) void saveLastAppliedPlanInputs(planInputs);
      // The active plan changed: every calendar surface refetches now. (The
      // PlanList landing forces one too; the onboarding path lands on Home.)
      refreshLiveCalendarData(true);
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
          <PlanBuildLoader size={96} />
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
                    {phases[week.weekNumber] === 'deload' ? ' · deload' : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* The plan stated back, then the coach's one line (2026-09-17 redesign). */}
            {planDraft ? (
              <Text style={styles.statedLine}>{statedPlanLine(planDraft, planInputs)}</Text>
            ) : null}
            {coachHeadline ? (
              <TouchableOpacity
                style={styles.coachRow}
                onPress={() => setCoachSheet(true)}
                accessibilityRole="button"
                accessibilityLabel={`${coachHeadline}. Opens sets per muscle.`}
              >
                <View
                  style={[
                    styles.coachDot,
                    { backgroundColor: coachSeverity === 'ok' ? colors.success : colors.warning },
                  ]}
                />
                <Text style={styles.coachText} numberOfLines={2}>
                  {coachLineText}
                </Text>
                <Text style={styles.coachMore}>Details ›</Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}

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
                      onPress={() => openDay(day)}
                      onLongPress={() => handleMoveWorkout(workout.id, day)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`${day}, ${workout.title}. ${cardLine(day, workout)}. Opens the day.`}
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
                        <View style={styles.workoutTitleRow}>
                          <Text style={[styles.workoutTitle, styles.workoutTitleGrow]}>{workout.title}</Text>
                          {workout.intensity === 'Hard' ? <Text style={styles.hardTag}>Hard</Text> : null}
                        </View>
                        <Text style={styles.workoutDetailLine}>{cardLine(day, workout)}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
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

        {planData.length > 0 ? (
          <View style={styles.chipRow}>
            <TouchableOpacity
              style={styles.chip}
              onPress={() => setAdjustSheet(true)}
              disabled={!!regenerating}
              accessibilityRole="button"
            >
              <Text style={styles.chipText}>Adjust this week</Text>
            </TouchableOpacity>
            {planInputs ? (
              <TouchableOpacity style={styles.chip} onPress={() => setBuiltSheet(true)} accessibilityRole="button">
                <Text style={styles.chipText}>How this was built</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
      )}

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

      {/* Coach detail: sets per muscle against the band, then every note. */}
      <SheetModal visible={coachSheet && isFocused} onClose={() => setCoachSheet(false)} scrimColor={colors.scrim}>
        <View style={styles.sheetCard}>
          <View style={styles.sheetGrab} />
          <Text style={styles.sheetTitle}>Sets per muscle, week {selectedWeek}</Text>
          {coachReport && coachBars.length > 0 ? (
            <>
              <Text style={styles.sheetSub}>
                {coachReport.band
                  ? `Aim ${coachReport.band.min}–${coachReport.band.max} a week at your level. Bars inside the band are on target.`
                  : 'Weighted sets per muscle this week.'}
              </Text>
              {coachBars.map((b) => (
                <View key={b.muscle} style={styles.barRow} accessible accessibilityLabel={`${b.muscle}: ${b.label}`}>
                  <Text style={styles.barName}>{b.muscle}</Text>
                  <View style={styles.barTrack}>
                    {coachReport.band ? (
                      <View
                        style={[
                          styles.barBand,
                          { left: `${b.bandLeft}%`, right: `${100 - b.bandRight}%`, borderColor: colors.textMuted },
                        ]}
                      />
                    ) : null}
                    <View
                      style={[
                        styles.barFill,
                        { width: `${b.pct}%`, backgroundColor: b.inBand ? colors.success : colors.warning },
                      ]}
                    />
                  </View>
                  <Text style={styles.barValue}>{b.label}</Text>
                </View>
              ))}
            </>
          ) : (
            <Text style={styles.sheetSub}>No lifting this week, so there is nothing to count.</Text>
          )}
          {coachDetail.filter((l) => !/^Sets per muscle|^[A-Z][a-z]+: [\d.]+ sets/.test(l)).map((line, i) => (
            <Text key={`${i}-${line.slice(0, 16)}`} style={styles.sheetNote}>
              {line}
            </Text>
          ))}
        </View>
      </SheetModal>

      {/* Adjust this week: the rerolls that used to sit above the days. */}
      <SheetModal visible={adjustSheet && isFocused} onClose={() => setAdjustSheet(false)} scrimColor={colors.scrim}>
        <View style={styles.sheetCard}>
          <View style={styles.sheetGrab} />
          <Text style={styles.sheetTitle}>Adjust week {selectedWeek}</Text>
          <Text style={styles.sheetSub}>Your swaps are kept when a week is rebuilt.</Text>
          <TouchableOpacity
            style={styles.sheetAction}
            onPress={() => {
              setAdjustSheet(false);
              void handleRegenerateWeek(selectedWeek);
            }}
            accessibilityRole="button"
          >
            <Text style={styles.sheetActionTitle}>Rebuild this week</Text>
            <Text style={styles.sheetActionSub}>A fresh set of days for the same goal and schedule.</Text>
          </TouchableOpacity>
          {weekSummary.sessionsWithCardioExercise > 0 ? (
            <TouchableOpacity
              style={styles.sheetAction}
              onPress={() => {
                setAdjustSheet(false);
                void handleRegenerateCardioOnly();
              }}
              accessibilityRole="button"
            >
              <Text style={styles.sheetActionTitle}>Rebuild the cardio only</Text>
              <Text style={styles.sheetActionSub}>Keeps every lifting day as it is.</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.sheetAction}
            onPress={() => {
              setAdjustSheet(false);
              void handleMakeEasier();
            }}
            accessibilityRole="button"
          >
            <Text style={styles.sheetActionTitle}>Reduce intensity</Text>
            <Text style={styles.sheetActionSub}>Rebuilds the week a step easier.</Text>
          </TouchableOpacity>
        </View>
      </SheetModal>

      {/* How this was built: what was sent, who built it, the policy line, once. */}
      <SheetModal visible={builtSheet && isFocused} onClose={() => setBuiltSheet(false)} scrimColor={colors.scrim}>
        <View style={styles.sheetCard}>
          <View style={styles.sheetGrab} />
          <Text style={styles.sheetTitle}>How this was built</Text>
          {generationSummaryLines.map((line, i) => (
            <Text key={`${i}-${line.slice(0, 24)}`} style={styles.sheetNote}>
              {line}
            </Text>
          ))}
          <Text style={styles.sheetFoot}>{AI_PROGRAMMING_TRANSPARENCY}</Text>
          <Text style={styles.sheetFoot}>{NOT_MEDICAL_FOOTNOTE_SHORT}</Text>
        </View>
      </SheetModal>

      <View style={[styles.footer, { paddingBottom: spacing.lg + tabBarInset }]}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => {
            const goEdit = () => {
              if (planInputs) {
                navigation.navigate('GeneratePlan', { editFromSnapshot: planInputs });
              } else {
                navigation.goBack();
              }
            };
            const swaps = getPreviewSession().recordedSwaps.length;
            if (swaps > 0) {
              Alert.alert(
                'Leave this preview?',
                `Your ${swaps} swap${swaps === 1 ? '' : 's'} on this preview will be lost when the plan is regenerated.`,
                [
                  { text: 'Stay', style: 'cancel' },
                  { text: 'Edit inputs', style: 'destructive', onPress: goEdit },
                ],
              );
              return;
            }
            goEdit();
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
            (applying || loadingPreview || !!regenerating || planData.length === 0) && styles.primaryButtonDisabled,
          ]}
          onPress={handleApply}
          disabled={applying || loadingPreview || !!regenerating || planData.length === 0}
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
  statedLine: {
    fontSize: text.footnote,
    lineHeight: leading.footnote,
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  coachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  coachDot: { width: 8, height: 8, borderRadius: radius.pill },
  coachText: { flex: 1, fontSize: text.footnote, lineHeight: leading.footnote, color: colors.text },
  coachMore: { fontSize: text.footnote, fontWeight: weight.semibold, color: colors.primary },
  workoutTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  workoutTitleGrow: { flexShrink: 1 },
  hardTag: {
    fontSize: text.caption,
    fontWeight: weight.bold,
    letterSpacing: tracking.wider,
    textTransform: 'uppercase',
    color: colors.warning,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: radius.sm,
    backgroundColor: colors.warningSoft,
  },
  chipRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { fontSize: text.footnote, fontWeight: weight.semibold, color: colors.textSecondary },
  sheetCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    maxHeight: '80%',
  },
  sheetGrab: { width: 36, height: 4, borderRadius: radius.pill, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md },
  sheetTitle: { fontSize: text.headline, fontWeight: weight.bold, color: colors.text, marginBottom: spacing.xs },
  sheetSub: { fontSize: text.footnote, lineHeight: leading.footnote, color: colors.textSecondary, marginBottom: spacing.md },
  sheetNote: { fontSize: text.footnote, lineHeight: leading.footnote, color: colors.textSecondary, marginTop: spacing.xs },
  sheetFoot: { fontSize: text.caption, lineHeight: leading.caption, color: colors.textMuted, marginTop: spacing.md },
  sheetAction: { paddingVertical: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sheetActionTitle: { fontSize: text.body, fontWeight: weight.semibold, color: colors.text },
  sheetActionSub: { fontSize: text.footnote, color: colors.textSecondary, marginTop: 2 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  barName: { width: 76, fontSize: text.footnote, color: colors.text },
  barTrack: { flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: colors.border, position: 'relative' },
  barBand: { position: 'absolute', top: -3, bottom: -3, borderLeftWidth: 1, borderRightWidth: 1, borderStyle: 'dashed' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: radius.pill },
  barValue: { width: 54, textAlign: 'right', fontSize: text.caption, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
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
