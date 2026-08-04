import React, { useState, useEffect, useRef, useMemo, useCallback, type Dispatch, type SetStateAction } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Modal,
  TextInput,
  Alert,
  Switch,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Workout,
  ExerciseSession,
  CompletedSet,
  type WorkoutSessionRestoredSnapshot,
  type LastExercisePerformance,
  type LastPerformanceMap,
  type PersonalBestMap,
} from '../types/workout';
import { saveWorkoutDraft } from '../lib/workoutDraftStorage';
import {
  getLastPerformance,
  getPersonalBests,
  type SaveWorkoutLogParams,
} from '../services/workoutService';
import { applyLastPerformancePrefill, formatLastTimeLine } from '../lib/lastPerformanceDisplay';
import {
  collectSessionAchievements,
  formatAchievementDetail,
  formatAchievementLabel,
  summarizeSessionTotals,
} from '../lib/sessionAchievements';
import { exerciseUsesTimeDisplay } from '../lib/exercisePrescription';
import {
  formatSuggestionLine,
  suggestNextTargetForExercise,
} from '../lib/nextTargetSuggestion';
import { resolveWorkoutEtaMinutes, type EtaPlanSlotLike } from '../lib/estimateWorkoutMinutes';
import { navigateFromWorkoutToExerciseDetail, isLinkableLibraryExerciseId } from '../lib/exerciseNavigation';
import Button from './Button';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { haptics } from '../lib/haptics';
import {
  duration,
  easing,
  leading,
  radius,
  spacing,
  spring,
  text,
  tracking,
  useTheme,
  weight,
} from '../theme';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import {
  formatAtWeightFromLb,
  formatVolumeFromLb,
  formatWeightCompactFromLb,
  kgToLb,
  lbToKg,
} from '../lib/weightDisplay';
import { formatPlanTargetRepDisplay, profileGoalToPlanGoal } from '../lib/workoutExerciseDisplay';
import type { ColorPalette } from '../theme/colors';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';

function findNextNonSkippedAfter(sessions: ExerciseSession[], fromIndex: number): number | null {
  for (let i = fromIndex + 1; i < sessions.length; i++) {
    if (!sessions[i].skipped) return i;
  }
  return null;
}

function resolveNextCurrentIndexAfterSkip(skippedIndex: number, sessions: ExerciseSession[]): number {
  for (let i = skippedIndex + 1; i < sessions.length; i++) {
    if (!sessions[i].skipped) return i;
  }
  for (let i = skippedIndex - 1; i >= 0; i--) {
    if (!sessions[i].skipped) return i;
  }
  return 0;
}

interface WorkoutSessionState {
  workout: Workout;
  currentExerciseIndex: number;
  startTime: Date;
  restoredSnapshot?: WorkoutSessionRestoredSnapshot | null;
}

interface WorkoutSessionProps {
  session: WorkoutSessionState;
  /** Fetched template from server while session is active; new exercises are merged into the live session. */
  serverWorkout?: Workout | null;
  /** When set, ETA matches Plan tab blending (estimatedDuration ↔ slot.durationMinutes). */
  etaPlanSlot?: EtaPlanSlotLike | null;
  onComplete: (sessionData?: SaveWorkoutLogParams) => void;
  onUpdate: Dispatch<SetStateAction<WorkoutSessionState | null>>;
  onExitWithoutFinishing?: () => void | Promise<void>;
  navigation?: NativeStackNavigationProp<RootStackParamList>;
}

export default function WorkoutSession({
  session,
  serverWorkout,
  etaPlanSlot,
  onComplete,
  onUpdate,
  onExitWithoutFinishing,
  navigation,
}: WorkoutSessionProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createWorkoutSessionStyles(colors), [colors]);
  const { weightUnit } = useUserPreferences();
  const snap = session.restoredSnapshot;

  const [exerciseSessions, setExerciseSessions] = useState<ExerciseSession[]>(() => {
    if (snap?.exerciseSessions?.length) {
      return snap.exerciseSessions;
    }
    return session.workout.exercises.map((exercise, index) => ({
      exerciseIndex: index,
      exercise,
      completedSets: Array.from({ length: exercise.sets }, (_, i) => ({
        setNumber: i + 1,
        reps: exercise.reps,
        weight: exercise.weight,
        completed: false,
      })),
    }));
  });

  const [lastPerformance, setLastPerformance] = useState<LastPerformanceMap>({});
  const [personalBests, setPersonalBests] = useState<PersonalBestMap>({});
  /** Latched at init: the snapshot itself is stripped one tick after mount. */
  const wasRestoredRef = useRef(!!session.restoredSnapshot);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showEndModal, setShowEndModal] = useState(false);
  const [showSessionMenu, setShowSessionMenu] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState<number | null>(null);
  const [exerciseNotes, setExerciseNotes] = useState<Record<number, string>>(() => snap?.exerciseNotes ?? {});
  const [overallNotes, setOverallNotes] = useState(() => snap?.overallNotes ?? '');
  const [showOverallNotes, setShowOverallNotes] = useState(false);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(session.currentExerciseIndex);
  const [showFinishScreen, setShowFinishScreen] = useState(false);
  const [expandedExerciseIndex, setExpandedExerciseIndex] = useState<number | null>(() =>
    snap?.expandedExerciseIndex ?? session.currentExerciseIndex
  );
  const [showAdvancedLogging, setShowAdvancedLogging] = useState(() => snap?.showAdvancedLogging ?? false);
  const [showExerciseOptions, setShowExerciseOptions] = useState<number | null>(null);
  const [showEditPrescriptionModal, setShowEditPrescriptionModal] = useState<number | null>(null);
  const [focusedSetIndex, setFocusedSetIndex] = useState<number | null>(() => snap?.focusedSetIndex ?? null);
  const [toast, setToast] = useState<{ msg: string } | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const scrollViewRef = useRef<ScrollView>(null);
  const exerciseRefs = useRef<Record<number, View | null>>({});
  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ msg });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = null;
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!session.restoredSnapshot) return;
    onUpdate((s) => (s ? { ...s, restoredSnapshot: undefined } : s));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time strip after hydrate
  }, []);

  // Save an initial draft immediately on session start so the workout survives an unexpected app kill.
  useEffect(() => {
    saveWorkoutDraft({
      workout: session.workout,
      startTimeIso: session.startTime.toISOString(),
      currentExerciseIndex,
      exerciseSessions,
      exerciseNotes,
      overallNotes,
      expandedExerciseIndex,
      focusedSetIndex,
      showAdvancedLogging,
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-only save
  }, []);

  /** When Search adds exercises to this workout on the server, append matching session rows (preserves logged sets). */
  useEffect(() => {
    if (!serverWorkout?.exercises?.length || serverWorkout.id !== session.workout.id) return;
    setExerciseSessions((prev) => {
      if (serverWorkout.exercises.length <= prev.length) return prev;
      const newOnes = serverWorkout.exercises.slice(prev.length);
      const appended: ExerciseSession[] = newOnes.map((exercise, i) => ({
        exerciseIndex: prev.length + i,
        exercise,
        completedSets: Array.from({ length: exercise.sets }, (_, j) => ({
          setNumber: j + 1,
          reps: exercise.reps,
          weight: exercise.weight,
          completed: false,
        })),
      }));
      const n = appended.length;
      queueMicrotask(() => {
        onUpdateRef.current((prevSession) =>
          prevSession ? { ...prevSession, workout: serverWorkout } : prevSession
        );
        showToast(`Added ${n} exercise${n > 1 ? 's' : ''} from library`);
      });
      return [...prev, ...appended];
    });
  }, [serverWorkout, session.workout.id]);

  /** Stable key of the session's library exercise ids; refires when Search appends exercises. */
  const linkableIdsKey = useMemo(
    () =>
      Array.from(
        new Set(
          exerciseSessions
            .map((es) => es.exercise.exerciseId)
            .filter((id): id is string => isLinkableLibraryExerciseId(id)),
        ),
      )
        .sort()
        .join(','),
    [exerciseSessions],
  );

  /**
   * Fetch each exercise's most recent logged performance for the "Last time"
   * line, and seed untouched weight inputs from it, preferring the next-target
   * suggestion over the raw last weight. Prefill runs once per exercise id so
   * later refetches (e.g. Search appending exercises) can't overwrite a set
   * the user deliberately cleared. Restored drafts keep the line but never the
   * prefill; a failed fetch silently shows nothing. The unit is read through a
   * ref so a lb/kg toggle doesn't refire the network call.
   */
  const weightUnitRef = useRef(weightUnit);
  weightUnitRef.current = weightUnit;
  const prefilledIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!linkableIdsKey) return;
    let cancelled = false;
    getLastPerformance(linkableIdsKey.split(','))
      .then((map) => {
        if (cancelled) return;
        setLastPerformance((prev) => ({ ...prev, ...map }));
        if (wasRestoredRef.current) return;
        const fresh: LastPerformanceMap = {};
        for (const [id, perf] of Object.entries(map)) {
          if (!prefilledIdsRef.current.has(id)) {
            fresh[id] = perf;
            prefilledIdsRef.current.add(id);
          }
        }
        if (Object.keys(fresh).length === 0) return;
        setExerciseSessions((prev) =>
          applyLastPerformancePrefill(
            prev,
            fresh,
            (es, perf) =>
              suggestNextTargetForExercise(
                es.exercise,
                perf.sets,
                weightUnitRef.current,
              )?.weightLb ?? null,
          ),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [linkableIdsKey]);

  /**
   * All-time heaviest set per exercise, for the finish screen's personal-best
   * claims. Fetched here at session start rather than on the finish screen for
   * two reasons: the log is only POSTed once the finish screen is dismissed, so
   * reading now is what guarantees a record excludes the session in progress;
   * and the most emotionally important screen in the app shouldn't hang on a
   * network call. A failed fetch just means no record is claimed.
   *
   * Kept separate from the last-performance fetch above so neither can break
   * the other — and the two answer genuinely different questions: that one is
   * bounded to the 30 most recent logs, this one is unbounded (§3.7a).
   */
  useEffect(() => {
    if (!linkableIdsKey) return;
    let cancelled = false;
    getPersonalBests(linkableIdsKey.split(','))
      .then((map) => {
        if (cancelled) return;
        setPersonalBests((prev) => ({ ...prev, ...map }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [linkableIdsKey]);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((new Date().getTime() - session.startTime.getTime()) / 1000);
      setElapsedTime(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [session.startTime]);

  // Auto-save draft every 30 seconds so the session survives an unexpected app
  // kill. The interval reads through a ref: a closure over state here would
  // persist the mount-time snapshot forever (deps stay stable all session).
  const draftStateRef = useRef({
    currentExerciseIndex,
    exerciseSessions,
    exerciseNotes,
    overallNotes,
    expandedExerciseIndex,
    focusedSetIndex,
    showAdvancedLogging,
  });
  draftStateRef.current = {
    currentExerciseIndex,
    exerciseSessions,
    exerciseNotes,
    overallNotes,
    expandedExerciseIndex,
    focusedSetIndex,
    showAdvancedLogging,
  };
  useEffect(() => {
    const interval = setInterval(() => {
      saveWorkoutDraft({
        workout: session.workout,
        startTimeIso: session.startTime.toISOString(),
        ...draftStateRef.current,
      }).catch(() => {});
    }, 30_000);
    return () => clearInterval(interval);
  }, [session.workout, session.startTime]);

  const formatTime = (seconds: number) => {
    if (seconds < 3600) {
      // mm:ss format until 59:59
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      // h:mm:ss format after 59:59
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
  };

  const workoutMetaLine = useMemo(() => {
    const parts: string[] = [];
    const activePrescription = exerciseSessions
      .filter((es) => !es.skipped)
      .map((es) => es.exercise);
    const prescription =
      activePrescription.length > 0 ? activePrescription : session.workout.exercises ?? [];
    const plannedStrip =
      session.workout.estimatedDuration ?? etaPlanSlot?.durationMinutes ?? null;
    const displayMin = resolveWorkoutEtaMinutes(
      session.workout,
      etaPlanSlot ?? null,
      prescription,
    );

    if (displayMin != null) {
      parts.push(`Est. ${displayMin} min`);
    } else {
      parts.push(`Elapsed ${formatTime(elapsedTime)}`);
    }
    const n = exerciseSessions.filter((es) => !es.skipped).length;
    const exercisePhrase = `${n} ${n === 1 ? 'exercise' : 'exercises'}`;
    const focusRaw = session.workout.focus?.trim();
    if (focusRaw) {
      const segments = focusRaw.split(/\s*·\s*/).map((s) => s.trim()).filter(Boolean);
      for (const seg of segments) {
        if (/^\d+\s*min$/i.test(seg)) {
          const m = parseInt(seg, 10);
          if (m === displayMin || m === plannedStrip) continue;
        }
        if (/^\d+\s*exercises?$/i.test(seg)) {
          continue;
        }
        parts.push(seg);
      }
    }
    parts.push(exercisePhrase);
    return parts.join(' · ');
  }, [
    session.workout.estimatedDuration,
    session.workout.focus,
    session.workout.exercises,
    etaPlanSlot?.durationMinutes,
    exerciseSessions,
    elapsedTime,
  ]);

  const getCompletedExercisesCount = () => {
    return exerciseSessions.filter(
      (es) => !es.skipped && es.completedSets.every((set) => set.completed)
    ).length;
  };


  const getCurrentExercise = () => {
    return exerciseSessions[currentExerciseIndex];
  };

  const getNextIncompleteSet = () => {
    const currentExercise = getCurrentExercise();
    if (!currentExercise) return null;
    return currentExercise.completedSets.find((set) => !set.completed);
  };

  const isWorkoutComplete = () => {
    const active = exerciseSessions.filter((es) => !es.skipped);
    if (active.length === 0) return true;
    return active.every((es) => es.completedSets.every((set) => set.completed));
  };

  const handleSetComplete = (exerciseIndex: number, setIndex: number) => {
    setFocusedSetIndex(null);

    // Read before the update, and fire outside the updater — React may invoke a
    // state updater more than once, and a double buzz on one tap is worse than
    // none. Only ticking a set is worth confirming; un-ticking is a correction.
    const isCompleting = !exerciseSessions[exerciseIndex]?.completedSets[setIndex]?.completed;
    if (isCompleting) {
      const sets = exerciseSessions[exerciseIndex].completedSets;
      const lastOutstanding = sets.every((s, i) => i === setIndex || s.completed);
      // Finishing the exercise gets the success pattern; a set gets a light tick.
      if (lastOutstanding) haptics.success();
      else haptics.step();
    }

    setExerciseSessions((prev) => {
      const updated = [...prev];
      const sets = updated[exerciseIndex].completedSets;
      const wasCompleted = sets[setIndex].completed;
      updated[exerciseIndex].completedSets[setIndex].completed = !wasCompleted;
      // Copy last set: when completing a set, copy its reps/weight to the next set (default for next)
      if (!wasCompleted && setIndex < sets.length - 1) {
        const next = setIndex + 1;
        if (!sets[next].completed) {
          updated[exerciseIndex].completedSets[next].reps = sets[setIndex].reps;
          updated[exerciseIndex].completedSets[next].weight = sets[setIndex].weight;
        }
      }
      return updated;
    });

    // Keep active exercise in view
    if (exerciseIndex === currentExerciseIndex) {
      setTimeout(() => {
        scrollToExercise(exerciseIndex);
      }, 100);
    }
  };

  const handleSetUpdate = (
    exerciseIndex: number,
    setIndex: number,
    field: 'reps' | 'weight' | 'rpe',
    value: number
  ) => {
    setExerciseSessions((prev) => {
      const updated = [...prev];
      if (field === 'reps') {
        updated[exerciseIndex].completedSets[setIndex].reps = value;
      } else if (field === 'weight') {
        updated[exerciseIndex].completedSets[setIndex].weight = value;
      } else if (field === 'rpe') {
        updated[exerciseIndex].completedSets[setIndex].rpe = value;
      }
      return updated;
    });
  };

  const handleSetUpdateDelta = (
    exerciseIndex: number,
    setIndex: number,
    field: 'reps' | 'weight',
    delta: number
  ) => {
    setExerciseSessions((prev) => {
      const updated = [...prev];
      const set = updated[exerciseIndex].completedSets[setIndex];
      if (field === 'reps') {
        const v = (set.reps ?? 0) + delta;
        updated[exerciseIndex].completedSets[setIndex].reps = Math.max(1, v);
      } else {
        const v = (set.weight ?? 0) + delta;
        updated[exerciseIndex].completedSets[setIndex].weight = Math.max(0, v);
      }
      return updated;
    });
  };

  const handleAddSet = (exerciseIndex: number) => {
    const prevLen = exerciseSessions[exerciseIndex].completedSets.length;
    const plan = exerciseSessions[exerciseIndex].exercise;
    const sets = exerciseSessions[exerciseIndex].completedSets;
    const firstIncomplete = sets.findIndex((s) => !s.completed);
    const lastSetCompleted = prevLen > 0 && sets[prevLen - 1].completed;
    const wasOnLastSet =
      focusedSetIndex === prevLen - 1 || (focusedSetIndex === null && firstIncomplete === prevLen - 1);
    const shouldJumpToNew =
      exerciseIndex === currentExerciseIndex && wasOnLastSet && lastSetCompleted;

    setExerciseSessions((prev) => {
      const updated = [...prev];
      const arr = updated[exerciseIndex].completedSets;
      const lastSet = arr.length > 0 ? arr[arr.length - 1] : null;
      const weight = lastSet?.weight ?? plan.weight ?? 0;
      const reps = lastSet?.reps ?? plan.reps;
      updated[exerciseIndex].completedSets.push({
        setNumber: arr.length + 1,
        reps,
        weight,
        completed: false,
      });
      return updated;
    });
    if (shouldJumpToNew) {
      setFocusedSetIndex(prevLen);
    }
    showToast(`Added set (${prevLen + 1} total)`);
  };

  const handleRemoveSet = (exerciseIndex: number) => {
    const sets = exerciseSessions[exerciseIndex].completedSets;
    if (sets.length <= 1) return;
    const lastSet = sets[sets.length - 1];
    const shouldConfirm = lastSet.completed; // "has data" = completed
    const setLabel = sets.length;
    const newLen = sets.length - 1;
    const doRemove = () => {
      setExerciseSessions((prev) => {
        const u = [...prev];
        u[exerciseIndex] = {
          ...prev[exerciseIndex],
          completedSets: prev[exerciseIndex].completedSets.slice(0, -1),
        };
        return u;
      });
      setFocusedSetIndex((p) => {
        if (p === null || exerciseIndex !== currentExerciseIndex) return p;
        return Math.min(p, newLen - 1);
      });
      showToast(`Removed set (${newLen} total)`);
    };
    if (shouldConfirm) {
      Alert.alert(
        `Remove Set ${setLabel}?`,
        'This will delete logged data.',
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: doRemove }]
      );
    } else {
      doRemove();
    }
  };

  const handleEditPrescriptionSave = (
    exerciseIndex: number,
    weight: number,
    reps: number,
    applyToRemaining: boolean,
    rpe?: number
  ) => {
    setExerciseSessions((prev) => {
      const updated = [...prev];
      const sets = updated[exerciseIndex].completedSets;
      const incompleteIndices = sets
        .map((s, i) => (s.completed ? -1 : i))
        .filter((i) => i >= 0);
      const toUpdate = applyToRemaining ? incompleteIndices : incompleteIndices.slice(0, 1);
      toUpdate.forEach((setIdx) => {
        updated[exerciseIndex].completedSets[setIdx].weight = weight;
        updated[exerciseIndex].completedSets[setIdx].reps = reps;
        if (rpe != null) updated[exerciseIndex].completedSets[setIdx].rpe = rpe;
      });
      return updated;
    });
    setShowEditPrescriptionModal(null);
  };

  const scrollToExercise = (index: number) => {
    const ref = exerciseRefs.current[index];
    if (ref && scrollViewRef.current) {
      ref.measureLayout(
        scrollViewRef.current as any,
        (x, y) => {
          scrollViewRef.current?.scrollTo({ y: y - 20, animated: true });
        },
        () => {}
      );
    }
  };

  /** Jump to any exercise (e.g. after collapsing or correcting the wrong one). */
  const handleSelectExercise = (index: number) => {
    if (exerciseSessions[index]?.skipped) return;
    setCurrentExerciseIndex(index);
    setExpandedExerciseIndex(index);
    setFocusedSetIndex(null);
    onUpdate({
      ...session,
      currentExerciseIndex: index,
    });
    setTimeout(() => scrollToExercise(index), 100);
  };

  const handleSkipExercise = (exerciseIndex: number) => {
    if (exerciseSessions[exerciseIndex]?.skipped) return;
    setExerciseSessions((prev) => {
      const updated = prev.map((es, i) => (i === exerciseIndex ? { ...es, skipped: true } : es));
      const nextIdx = resolveNextCurrentIndexAfterSkip(exerciseIndex, updated);
      queueMicrotask(() => {
        setCurrentExerciseIndex(nextIdx);
        setExpandedExerciseIndex(nextIdx);
        setFocusedSetIndex(null);
        onUpdateRef.current((s) => (s ? { ...s, currentExerciseIndex: nextIdx } : s));
        setTimeout(() => scrollToExercise(nextIdx), 100);
        showToast('Skipped');
      });
      return updated;
    });
  };

  const handleUnskipExercise = (exerciseIndex: number) => {
    if (!exerciseSessions[exerciseIndex]?.skipped) return;
    setExerciseSessions((prev) =>
      prev.map((es, i) => (i === exerciseIndex ? { ...es, skipped: false } : es))
    );
    setCurrentExerciseIndex(exerciseIndex);
    setExpandedExerciseIndex(exerciseIndex);
    setFocusedSetIndex(null);
    onUpdateRef.current((s) => (s ? { ...s, currentExerciseIndex: exerciseIndex } : s));
    setTimeout(() => scrollToExercise(exerciseIndex), 100);
    showToast('Included again');
  };

  const handleAddExerciseFromLibrary = () => {
    const w = session.workout;
    if (!w?.id) {
      showToast('Save this workout before adding exercises');
      return;
    }
    const existingExerciseIds = exerciseSessions
      .map((es) => es.exercise.exerciseId)
      .filter((id): id is string => !!id);
    const tabNav = (navigation as { getParent?: () => { navigate: (name: string, params?: object) => void } })
      ?.getParent?.();
    if (tabNav) {
      tabNav.navigate('Search', {
        screen: 'SearchList',
        params: {
          addToWorkout: {
            workoutId: w.id,
            workoutName: w.name,
            existingExerciseIds,
            origin: 'session',
          },
        },
      });
    }
  };

  const handleEndWorkout = () => {
    const allSkipped =
      exerciseSessions.length > 0 && exerciseSessions.every((es) => es.skipped);
    if (allSkipped) {
      Alert.alert(
        'All exercises skipped',
        'You skipped every exercise. Are you sure you want to finish without logging anything?',
        [
          { text: 'Keep training', style: 'cancel' },
          { text: 'Finish anyway', style: 'destructive', onPress: () => setShowFinishScreen(true) },
        ]
      );
      return;
    }
    if (isWorkoutComplete()) {
      setShowFinishScreen(true);
    } else {
      setShowEndModal(true);
    }
  };

  const handleSaveProgressAndExit = async () => {
    setShowSessionMenu(false);
    if (!onExitWithoutFinishing) return;
    try {
      await saveWorkoutDraft({
        workout: session.workout,
        startTimeIso: session.startTime.toISOString(),
        currentExerciseIndex,
        exerciseSessions,
        exerciseNotes,
        overallNotes,
        expandedExerciseIndex,
        focusedSetIndex,
        showAdvancedLogging,
      });
      showToast('Saved. Resume anytime from the Workout tab.');
      await Promise.resolve(onExitWithoutFinishing());
    } catch {
      showToast('Could not save progress');
    }
  };

  const confirmEndWorkout = () => {
    setShowEndModal(false);
    setShowFinishScreen(true);
  };

  const handleFinishComplete = () => {
    const endTime = new Date();
    const totalTime = Math.floor((endTime.getTime() - session.startTime.getTime()) / 1000);
    // Same helper the finish screen renders from, so the numbers the user was
    // just shown and the ones written to history can't drift apart.
    const totals = summarizeSessionTotals(exerciseSessions);

    onComplete({
      workout: session.workout,
      exercises: exerciseSessions,
      startTime: session.startTime,
      endTime,
      totalTime,
      totalSets: totals.completedSets,
      totalVolume: totals.volumeLb,
      overallNotes,
      exerciseNotes,
    });
  };

  const handlePrimaryAction = () => {
    if (isWorkoutComplete()) {
      handleEndWorkout();
      return;
    }
    const currentExercise = getCurrentExercise();
    if (!currentExercise) return;

    const allSetsComplete = currentExercise.completedSets.every((s) => s.completed);
    if (allSetsComplete) {
      const nextIndex = findNextNonSkippedAfter(exerciseSessions, currentExerciseIndex);
      if (nextIndex != null) {
        setFocusedSetIndex(null);
        setCurrentExerciseIndex(nextIndex);
        setExpandedExerciseIndex(nextIndex);
        onUpdate({ ...session, currentExerciseIndex: nextIndex });
        setTimeout(() => scrollToExercise(nextIndex), 100);
      } else {
        handleEndWorkout();
      }
      return;
    }

    const firstIncompleteIdx = currentExercise.completedSets.findIndex((s) => !s.completed);
    const effectiveSetIdx = focusedSetIndex ?? firstIncompleteIdx;
    const targetIncomplete =
      effectiveSetIdx >= 0 && !currentExercise.completedSets[effectiveSetIdx].completed
        ? effectiveSetIdx
        : firstIncompleteIdx;

    if (targetIncomplete >= 0) {
      handleSetComplete(currentExerciseIndex, targetIncomplete);
    }
  };

  const openExerciseLibraryGuide = useCallback(
    (exerciseIndex: number) => {
      const es = exerciseSessions[exerciseIndex];
      if (!es || es.skipped) return;
      const id = es.exercise.exerciseId;
      if (!navigation) {
        Alert.alert('Navigation unavailable', 'Use the Exercises tab to search for this movement.');
        return;
      }
      if (!isLinkableLibraryExerciseId(id)) {
        Alert.alert(
          'No library page',
          'This exercise is not linked to the library, so there is no video or full description. You can swap it for a similar exercise from the library.',
        );
        return;
      }
      navigateFromWorkoutToExerciseDetail(navigation, id as string);
    },
    [exerciseSessions, navigation],
  );

  const getPrimaryActionLabel = () => {
    if (isWorkoutComplete()) {
      return 'Finish Workout';
    }
    const currentExercise = getCurrentExercise();
    if (!currentExercise) return 'Start Workout';
    const totalSets = currentExercise.completedSets.length;
    const allSetsComplete = currentExercise.completedSets.every((s) => s.completed);
    if (allSetsComplete) {
      const nextIdx = findNextNonSkippedAfter(exerciseSessions, currentExerciseIndex);
      if (nextIdx != null) {
        return `Start ${exerciseSessions[nextIdx].exercise.name}`;
      }
      return 'Finish Workout';
    }
    const firstIncompleteIdx = currentExercise.completedSets.findIndex((s) => !s.completed);
    const effectiveSetIdx = focusedSetIndex ?? firstIncompleteIdx;
    const targetIncomplete =
      effectiveSetIdx >= 0 && !currentExercise.completedSets[effectiveSetIdx].completed
        ? effectiveSetIdx
        : firstIncompleteIdx;
    if (targetIncomplete >= 0) {
      return `Complete Set ${targetIncomplete + 1}/${totalSets}`;
    }
    return 'Continue';
  };

  const completedExercises = getCompletedExercisesCount();
  const totalExercises = exerciseSessions.filter((es) => !es.skipped).length;
  const skippedCount = exerciseSessions.filter((es) => es.skipped).length;
  const progress = totalExercises > 0 ? (completedExercises / totalExercises) * 100 : 0;

  // Show finish screen if confirmed
  if (showFinishScreen) {
    return (
      <WorkoutFinishScreen
        session={session}
        exerciseSessions={exerciseSessions}
        elapsedTime={elapsedTime}
        overallNotes={overallNotes}
        exerciseNotes={exerciseNotes}
        lastPerformance={lastPerformance}
        personalBests={personalBests}
        onComplete={handleFinishComplete}
        onBack={() => {
          setShowFinishScreen(false);
          setShowEndModal(true);
        }}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Header and Progress */}
      <View>
        {/* Header — title + date + single meta line (no duplicate duration) */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              <Text style={styles.workoutName}>{session.workout.name}</Text>
              <Text style={styles.workoutDate}>
                {session.workout.day ||
                  new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </Text>
              <Text style={styles.workoutMetaLine} numberOfLines={2}>
                {workoutMetaLine}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.headerMenuButton}
              onPress={() => setShowSessionMenu(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.headerMenuButtonText}>⋯</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Session Progress */}
        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressText}>
              {completedExercises} / {totalExercises} exercises completed
              {skippedCount > 0 ? ` · ${skippedCount} skipped` : ''}
            </Text>
            {(() => {
              const currentExercise = getCurrentExercise();
              const isCurrentExerciseComplete = currentExercise?.completedSets.every((set) => set.completed);
              const nextIdx = findNextNonSkippedAfter(exerciseSessions, currentExerciseIndex);
              if (isCurrentExerciseComplete && nextIdx != null) {
                return (
                  <Text style={styles.nextExerciseText}>
                    Next exercise: {exerciseSessions[nextIdx].exercise.name}
                  </Text>
                );
              }
              return null;
            })()}
          </View>
          <WorkoutProgressBar progress={progress} />
        </View>
      </View>

      {/* Exercise List */}
      <ScrollView 
        ref={scrollViewRef}
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {exerciseSessions.map((exerciseSession, index) => (
          <View
            key={exerciseSession.exercise.exerciseId ? `${exerciseSession.exercise.exerciseId}-${index}` : `slot-${index}`}
            ref={(ref) => {
              exerciseRefs.current[index] = ref;
            }}
          >
            <ExerciseCard
              exerciseSession={exerciseSession}
              index={index}
              isCurrent={index === currentExerciseIndex}
              isExpanded={expandedExerciseIndex === index}
              onCollapse={() => {
                // Collapse this card (including active) to compact state: title + prescription + set pills
                setExpandedExerciseIndex(null);
              }}
              onSetComplete={handleSetComplete}
              onSetUpdate={handleSetUpdate}
              onSetUpdateDelta={handleSetUpdateDelta}
              onAddSet={handleAddSet}
              onRemoveSet={handleRemoveSet}
              onNotesPress={() => setShowNotesModal(index)}
              onOptionsPress={() => setShowExerciseOptions(index)}
              notes={exerciseNotes[index] || ''}
              navigation={navigation}
              showAdvancedLogging={showAdvancedLogging}
              onToggleAdvancedLogging={() => setShowAdvancedLogging(!showAdvancedLogging)}
              exercise={exerciseSession.exercise}
              onEditPrescription={() => setShowEditPrescriptionModal(index)}
              focusedSetIndex={index === currentExerciseIndex ? focusedSetIndex : null}
              onFocusSet={(setIdx) => setFocusedSetIndex(setIdx)}
              onSelectExercise={handleSelectExercise}
              onUnskip={handleUnskipExercise}
              lastPerformance={
                exerciseSession.exercise.exerciseId
                  ? lastPerformance[exerciseSession.exercise.exerciseId]
                  : undefined
              }
            />
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(16, 8 + insets.bottom) }]}>
        <TouchableOpacity
          style={styles.footerAddLibraryCard}
          onPress={handleAddExerciseFromLibrary}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Add exercises from library"
        >
          <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
          <View style={styles.footerAddLibraryCardText}>
            <Text style={styles.footerAddLibraryCardTitle}>Add from library</Text>
            <Text style={styles.footerAddLibraryCardSub}>Search library · add to workout</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
        <Button
          title={getPrimaryActionLabel() || 'Continue'}
          onPress={handlePrimaryAction}
          style={styles.primaryButton}
        />
        {onExitWithoutFinishing ? (
          <TouchableOpacity
            style={styles.saveExitButton}
            onPress={handleSaveProgressAndExit}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Save progress and exit workout"
          >
            <Text style={styles.saveExitButtonText}>Save & Exit</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Exercise Options Modal */}
      {showExerciseOptions !== null && (
        <ExerciseOptionsModal
          visible={showExerciseOptions !== null}
          onClose={() => setShowExerciseOptions(null)}
          libraryGuideAvailable={
            showExerciseOptions !== null &&
            isLinkableLibraryExerciseId(exerciseSessions[showExerciseOptions]?.exercise?.exerciseId)
          }
          onLibraryGuide={() => {
            const idx = showExerciseOptions;
            if (idx !== null) openExerciseLibraryGuide(idx);
          }}
          onSkip={() => {
            const idx = showExerciseOptions;
            setShowExerciseOptions(null);
            if (idx !== null) handleSkipExercise(idx);
          }}
          onNotes={() => {
            setShowExerciseOptions(null);
            setShowNotesModal(showExerciseOptions);
          }}
          onAddSet={() => {
            if (showExerciseOptions !== null) {
              handleAddSet(showExerciseOptions);
            }
          }}
          onToggleAdvancedLogging={() => setShowAdvancedLogging(!showAdvancedLogging)}
          showAdvancedLogging={showAdvancedLogging}
        />
      )}

      {/* Edit Prescription Modal */}
      {showEditPrescriptionModal !== null && (() => {
        const es = exerciseSessions[showEditPrescriptionModal];
        const nextSet = es?.completedSets.find((s) => !s.completed);
        const defaultWeight = nextSet?.weight ?? es?.exercise?.weight ?? 0;
        const defaultReps = nextSet?.reps ?? es?.exercise?.reps ?? 10;
        const defaultRpe = nextSet?.rpe;
        return (
          <EditPrescriptionModal
            visible={true}
            exerciseName={es?.exercise?.name ?? ''}
            initialWeight={defaultWeight}
            initialReps={defaultReps}
            initialRpe={defaultRpe}
            hasRemainingSets={(es?.completedSets.filter((s) => !s.completed).length ?? 0) > 1}
            onSave={(weight, reps, applyToRemaining, rpe) =>
              handleEditPrescriptionSave(showEditPrescriptionModal, weight, reps, applyToRemaining, rpe)
            }
            onClose={() => setShowEditPrescriptionModal(null)}
          />
        );
      })()}

      {/* Notes Modal */}
      {showNotesModal !== null && (
        <NotesModal
          visible={showNotesModal !== null}
          exerciseName={exerciseSessions[showNotesModal].exercise.name}
          notes={exerciseNotes[showNotesModal] || ''}
          onSave={(notes) => {
            setExerciseNotes((prev) => ({ ...prev, [showNotesModal]: notes }));
            setShowNotesModal(null);
          }}
          onClose={() => setShowNotesModal(null)}
        />
      )}

      {/* Overall Notes Modal */}
      <NotesModal
        visible={showOverallNotes}
        exerciseName="Session Notes"
        notes={overallNotes}
        onSave={(notes) => {
          setOverallNotes(notes);
          setShowOverallNotes(false);
        }}
        onClose={() => setShowOverallNotes(false)}
      />

      {/* Session menu: finish vs save & exit */}
      <Modal
        visible={showSessionMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSessionMenu(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowSessionMenu(false)}>
          <Pressable style={styles.sessionMenuCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sessionMenuHeader}>
              <Text style={styles.modalTitle}>Workout</Text>
              <TouchableOpacity onPress={() => setShowSessionMenu(false)} hitSlop={12}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.sessionMenuRow, styles.sessionMenuRowFirst]}
              onPress={() => {
                setShowSessionMenu(false);
                handleEndWorkout();
              }}
            >
              <Text style={styles.optionItemText}>Finish workout</Text>
              <Text style={styles.optionItemSubtext}>Review and save to History</Text>
            </TouchableOpacity>
            {onExitWithoutFinishing ? (
              <TouchableOpacity style={styles.sessionMenuRow} onPress={handleSaveProgressAndExit}>
                <Text style={styles.optionItemText}>Save progress & exit</Text>
                <Text style={styles.optionItemSubtext}>Progress saved on device · resume from Workout</Text>
              </TouchableOpacity>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* End Workout Confirmation */}
      <Modal
        visible={showEndModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEndModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>End Workout?</Text>
            <Text style={styles.modalText}>
              Continue to the finish screen to review and save this session to History.
            </Text>
            <Text style={styles.modalSubtext}>
              {completedExercises} of {totalExercises} exercises completed
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowEndModal(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={confirmEndWorkout}
              >
                <Text style={[styles.modalButtonText, styles.modalButtonConfirmText]}>
                  End Workout
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Toast: "Added set (4 total)" / "Removed set (3 total)" */}
      {toast && (
        <View style={styles.toastContainer}>
          <Text style={styles.toastText}>{toast.msg}</Text>
        </View>
      )}
    </View>
  );
}

/**
 * The session progress bar, which fills rather than jumps.
 *
 * Completing the last set of an exercise moves this by a whole segment, and a
 * hard cut gives the user nothing to connect the set they just logged to the
 * progress they just made. The animation is what carries that.
 */
function WorkoutProgressBar({ progress }: { progress: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createWorkoutSessionStyles(colors), [colors]);
  const width = useSharedValue(progress);

  useEffect(() => {
    width.value = withTiming(progress, {
      duration: duration.base,
      easing: Easing.bezier(...easing.standard),
    });
  }, [progress, width]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  return (
    <View style={styles.progressBar}>
      <Animated.View style={[styles.progressFill, fillStyle]} />
    </View>
  );
}

/**
 * One set marker. Pops when it flips to complete.
 *
 * Deliberately keyed on the transition rather than the value: re-entering the
 * screen with sets already logged must not replay the whole row, and un-ticking
 * a set is a correction, which should feel like an undo rather than a reward.
 */
function SetPill({
  completed,
  isFocused,
  isFuture,
  label,
}: {
  completed: boolean;
  isFocused: boolean;
  isFuture: boolean;
  label: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createWorkoutSessionStyles(colors), [colors]);
  const scale = useSharedValue(1);
  const wasCompleted = useRef(completed);

  useEffect(() => {
    if (completed && !wasCompleted.current) {
      scale.value = withSequence(
        withTiming(1.22, { duration: duration.instant }),
        withSpring(1, spring.bouncy),
      );
    }
    wasCompleted.current = completed;
  }, [completed, scale]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      style={[
        styles.setTrackerPill,
        completed && styles.setTrackerPillCompleted,
        isFocused && styles.setTrackerPillFocused,
        isFuture && styles.setTrackerPillFuture,
        animatedStyle,
      ]}
    >
      <Text
        style={[
          styles.setTrackerPillText,
          completed && !isFocused && styles.setTrackerPillTextCompleted,
          isFocused && styles.setTrackerPillTextFocused,
          isFuture && styles.setTrackerPillTextFuture,
        ]}
      >
        {label}
      </Text>
    </Animated.View>
  );
}

// Exercise Card Component with Progressive Disclosure
function ExerciseCard({
  exerciseSession,
  index,
  isCurrent,
  isExpanded,
  onCollapse,
  onSetComplete,
  onSetUpdate,
  onSetUpdateDelta,
  onAddSet,
  onRemoveSet,
  onNotesPress,
  onOptionsPress,
  notes,
  navigation,
  showAdvancedLogging,
  onToggleAdvancedLogging,
  exercise,
  onEditPrescription,
  focusedSetIndex,
  onFocusSet,
  onSelectExercise,
  onUnskip,
  lastPerformance,
}: {
  exerciseSession: ExerciseSession;
  index: number;
  isCurrent: boolean;
  isExpanded: boolean;
  onCollapse: () => void;
  onSetComplete: (exerciseIndex: number, setIndex: number) => void;
  onSetUpdate: (exerciseIndex: number, setIndex: number, field: 'reps' | 'weight' | 'rpe', value: number) => void;
  onSetUpdateDelta: (exerciseIndex: number, setIndex: number, field: 'reps' | 'weight', delta: number) => void;
  onAddSet: (exerciseIndex: number) => void;
  onRemoveSet: (exerciseIndex: number) => void;
  onNotesPress: () => void;
  onOptionsPress: () => void;
  notes: string;
  navigation?: NativeStackNavigationProp<RootStackParamList>;
  showAdvancedLogging: boolean;
  onToggleAdvancedLogging: () => void;
  exercise: any;
  onEditPrescription: () => void;
  focusedSetIndex: number | null;
  onFocusSet: (setIndex: number) => void;
  onSelectExercise: (index: number) => void;
  onUnskip: (exerciseIndex: number) => void;
  lastPerformance?: LastExercisePerformance;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createWorkoutSessionStyles(colors), [colors]);
  const { weightUnit, goal } = useUserPreferences();
  const planGoal = useMemo(() => profileGoalToPlanGoal(goal), [goal]);
  const [weightStep, setWeightStep] = useState(5);
  const [editingReps, setEditingReps] = useState(false);
  const [editingWeight, setEditingWeight] = useState(false);
  const [editRepsValue, setEditRepsValue] = useState('');
  const [editWeightValue, setEditWeightValue] = useState('');
  const repeatRef = useRef<{ timeout?: ReturnType<typeof setTimeout>; interval?: ReturnType<typeof setInterval> }>({});
  const exerciseData = exercise || exerciseSession.exercise;
  const sessionSetCount = exerciseSession.completedSets.length;
  const firstIncompleteIdx = exerciseSession.completedSets.findIndex((s) => !s.completed);
  /** Focused set for editing, or first incomplete, or last set when all complete (so reps/weight stay editable). */
  const nextSetIdx =
    focusedSetIndex !== null
      ? focusedSetIndex
      : firstIncompleteIdx >= 0
        ? firstIncompleteIdx
        : sessionSetCount > 0
          ? sessionSetCount - 1
          : -1;
  useEffect(() => {
    setEditingReps(false);
    setEditingWeight(false);
  }, [nextSetIdx]);
  const completedSets = exerciseSession.completedSets.filter((set) => set.completed);
  const lastWeight = completedSets.length > 0
    ? completedSets[completedSets.length - 1].weight
    : exerciseData.weight;
  /** Memoized: the parent re-renders every second from the elapsed-time ticker. */
  const historyLines = useMemo(() => {
    const isTimeBased = exerciseUsesTimeDisplay(
      exerciseData.prescriptionType,
      exerciseData.name,
      exerciseData.primaryMuscleGroup,
    );
    return {
      lastTimeLine: formatLastTimeLine(lastPerformance, weightUnit, isTimeBased),
      suggestionLine: formatSuggestionLine(
        lastPerformance
          ? suggestNextTargetForExercise(exerciseData, lastPerformance.sets, weightUnit)
          : null,
        weightUnit,
      ),
    };
  }, [lastPerformance, weightUnit, exerciseData]);

  if (exerciseSession.skipped) {
    return (
      <View
        style={[styles.exerciseCardCollapsed, styles.exerciseCardSkipped]}
        accessibilityRole="summary"
        accessibilityLabel={`${exerciseData.name}, skipped for today. Use Include again to add back to this session.`}
      >
        <View style={styles.exerciseCardCollapsedContent}>
          <View style={styles.exerciseCardCollapsedHeader}>
            <Text
              style={[styles.exerciseCardNameCollapsed, styles.exerciseCardNameSkipped]}
              numberOfLines={2}
            >
              {exerciseData.name}
            </Text>
            <View style={styles.skippedBadge}>
              <Text style={styles.skippedBadgeText}>Skipped</Text>
            </View>
          </View>
          <Text style={styles.exerciseCardSkippedHint}>
            Not in today&apos;s progress or saved workout log
          </Text>
          <TouchableOpacity
            style={styles.unskipButton}
            onPress={() => onUnskip(index)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Include again"
          >
            <Text style={styles.unskipButtonText}>Include again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Collapsed view: scannable title + plan + progress (no full set pill row)
  if (!isExpanded) {
    const collapsedTotal = exerciseSession.completedSets.length;
    const collapsedDone = exerciseSession.completedSets.filter((s) => s.completed).length;
    const wLb = lastWeight || exerciseData.weight;
    const repShown = formatPlanTargetRepDisplay(exerciseData, planGoal);
    const planShort = `${exerciseSession.completedSets.length}×${repShown}${
      wLb ? formatAtWeightFromLb(wLb, weightUnit) : ''
    }`;
    const canOpenLibraryGuide =
      !!navigation && isLinkableLibraryExerciseId(exerciseData.exerciseId);
    const openLibraryGuide = () => {
      if (!navigation) {
        Alert.alert('Navigation unavailable', 'Use the Exercises tab to search for this movement.');
        return;
      }
      const id = exerciseData.exerciseId;
      if (!isLinkableLibraryExerciseId(id)) {
        Alert.alert(
          'No library page',
          'This exercise is not linked to the library, so there is no video or full description.',
        );
        return;
      }
      navigateFromWorkoutToExerciseDetail(navigation, id);
    };

    return (
      <View style={[styles.exerciseCardCollapsed, isCurrent && styles.exerciseCardCurrent]}>
        <View style={styles.exerciseCardCollapsedMainCol}>
          <Pressable
            style={({ pressed }) => [
              styles.exerciseCardCollapsedPressable,
              pressed && styles.exerciseCardCollapsedPressed,
            ]}
            onPress={() => onSelectExercise(index)}
            accessibilityRole="button"
            accessibilityLabel={`${isCurrent ? 'Current exercise: ' : ''}${exerciseData.name}. Tap to open.`}
          >
            <View style={styles.exerciseCardCollapsedContent}>
              <View style={styles.exerciseCardCollapsedHeader}>
                <Text style={styles.exerciseCardNameCollapsed} numberOfLines={2}>
                  {exerciseData.name}
                </Text>
                {isCurrent && (
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>Active</Text>
                  </View>
                )}
              </View>
              <Text style={styles.exerciseCardInfoCollapsed}>
                {planShort} · {collapsedDone}/{collapsedTotal} sets
              </Text>
            </View>
          </Pressable>
          {isCurrent && canOpenLibraryGuide ? (
            <TouchableOpacity
              style={styles.exerciseGuideCollapsed}
              onPress={openLibraryGuide}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Open how-to steps and demo for this exercise"
            >
              <Ionicons name="play-circle" size={18} color={colors.primary} />
              <Text style={styles.exerciseGuideCollapsedText}>How to & demo</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity onPress={onOptionsPress} style={styles.optionsButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.optionsButtonText}>⋯</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Expanded view — Row 1: title+ACTIVE, Row 2: Plan (tappable) + Last, Row 3: pills + Set N/total, Row 4: Reps/Weight steppers, compact log
  const nextSet = nextSetIdx >= 0 ? exerciseSession.completedSets[nextSetIdx] : null;
  const completedCount = exerciseSession.completedSets.filter((s) => s.completed).length;
  const lastCompleted = completedCount > 0 ? exerciseSession.completedSets[completedCount - 1] : null;
  const repShownPlan = formatPlanTargetRepDisplay(exerciseData, planGoal);
  const planLabel = `Plan: ${exerciseData.sets}×${repShownPlan}${
    exerciseData.weight != null && exerciseData.weight !== 0
      ? formatAtWeightFromLb(exerciseData.weight, weightUnit)
      : ''
  }`;

  return (
    <View style={[styles.exerciseCard, isCurrent && styles.exerciseCardCurrent]}>
      {/* Row 1: Exercise name + ACTIVE badge + options/collapse */}
      <View style={[styles.exerciseCardHeader, isCurrent && styles.exerciseCardHeaderCurrent]}>
        <View style={styles.exerciseCardHeaderLeft}>
          <View style={styles.exerciseCardHeaderTitleRow}>
            <Text style={styles.exerciseCardName}>{exerciseData.name}</Text>
            {isCurrent && (
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>Active</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.exerciseCardHeaderRight}>
          <TouchableOpacity onPress={onOptionsPress} style={styles.optionsButton}>
            <Text style={styles.optionsButtonText}>⋯</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onCollapse} style={styles.collapseButton}>
            <Text style={styles.collapseButtonText}>−</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Plan + guide on one row: saves vertical space; chip stays high-contrast on the right */}
      <View style={styles.planAndGuideRow}>
        <View style={[styles.planCell, isCurrent && styles.prescriptionRowTappable]}>
          {isCurrent ? (
            <TouchableOpacity
              style={styles.prescriptionRowTouchable}
              onPress={onEditPrescription}
              activeOpacity={0.6}
            >
              <Text style={styles.exerciseCardInfoCompact}>{planLabel}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.exerciseCardInfoCompact}>{planLabel}</Text>
          )}
        </View>
        {navigation && isLinkableLibraryExerciseId(exerciseData.exerciseId) ? (
          <TouchableOpacity
            style={[
              styles.exerciseGuideChip,
              styles.exerciseGuideChipInRow,
              isCurrent && styles.exerciseGuideChipCurrent,
            ]}
            onPress={() => navigateFromWorkoutToExerciseDetail(navigation, exerciseData.exerciseId!)}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Open how-to steps, description and demo for this exercise in the Exercises tab"
          >
            <Ionicons name="play-circle" size={16} color={colors.primary} />
            <Text style={styles.exerciseGuideChipLabelInRow} numberOfLines={1}>
              <Text style={styles.exerciseGuideChipStrongInRow}>How to</Text>
              <Text style={styles.exerciseGuideChipMutedInRow}> & demo</Text>
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>
      {historyLines.lastTimeLine != null && (
        <Text style={styles.lastSetLine}>{historyLines.lastTimeLine}</Text>
      )}
      {historyLines.suggestionLine != null && (
        <Text style={styles.suggestionLine}>{historyLines.suggestionLine}</Text>
      )}
      {lastCompleted != null && (
        <Text style={styles.lastSetLine}>
          Last set today: {lastCompleted.reps}×
          {lastCompleted.weight != null && lastCompleted.weight > 0
            ? formatWeightCompactFromLb(lastCompleted.weight, weightUnit)
            : '—'}
        </Text>
      )}

      {/* Row 3: Set pills (tappable when active) + Set x/y + [ – ] [ + ] */}
      <View style={styles.setTrackerContainer}>
        <View style={styles.setTrackerDots}>
          {exerciseSession.completedSets.map((set, setIdx) => {
            const isFocused = isCurrent && nextSetIdx === setIdx;
            const isFuture = !set.completed && !isFocused;
            const pill = (
              <SetPill
                key={setIdx}
                completed={set.completed}
                isFocused={isFocused}
                isFuture={isFuture}
                label={set.completed ? '✓' : String(setIdx + 1)}
              />
            );
            if (isCurrent && onFocusSet) {
              return (
                <TouchableOpacity
                  key={setIdx}
                  onPress={() => onFocusSet(setIdx)}
                  activeOpacity={0.7}
                >
                  {pill}
                </TouchableOpacity>
              );
            }
            return pill;
          })}
        </View>
        <View style={styles.setTrackerRightRow}>
          <Text style={styles.setProgressLabel}>
            Set {nextSetIdx >= 0 ? nextSetIdx + 1 : sessionSetCount}/{sessionSetCount}
          </Text>
          {isCurrent && (
            <>
              <TouchableOpacity
                style={[styles.setPillControl, sessionSetCount <= 1 && styles.setPillControlDisabled]}
                onPress={() => onRemoveSet(index)}
                disabled={sessionSetCount <= 1}
                activeOpacity={0.7}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={[styles.setPillControlText, sessionSetCount <= 1 && styles.setPillControlTextDisabled]}>−</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.setPillControl}
                onPress={() => onAddSet(index)}
                activeOpacity={0.7}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={styles.setPillControlText}>+</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Row 4: Reps / Weight steppers — tap value to type, long-press +/- to repeat, weight step 5/2.5/10 */}
      {isCurrent && nextSet != null && (() => {
        const stepReps = (delta: number) => onSetUpdateDelta(index, nextSetIdx, 'reps', delta);
        const stepWeight = (delta: number) => onSetUpdateDelta(index, nextSetIdx, 'weight', delta);
        const startRepeat = (delta: number, field: 'reps' | 'weight') => {
          const step = () => (field === 'reps' ? stepReps(delta) : stepWeight(delta));
          step();
          repeatRef.current.timeout = setTimeout(() => {
            repeatRef.current.interval = setInterval(step, 100);
          }, 500);
        };
        const stopRepeat = () => {
          if (repeatRef.current.timeout) clearTimeout(repeatRef.current.timeout);
          if (repeatRef.current.interval) clearInterval(repeatRef.current.interval);
          repeatRef.current = {};
        };
        return (
          <>
            <View style={styles.loggingBand}>
              <View style={styles.loggingControlsRow}>
                <View style={styles.stepperBlock}>
                  <Text style={styles.stepperLabel}>Reps</Text>
                  <View style={styles.stepper}>
                    <TouchableOpacity
                      style={styles.stepperButton}
                      onPressIn={() => startRepeat(-1, 'reps')}
                      onPressOut={stopRepeat}
                    >
                      <Text style={styles.stepperButtonText}>−</Text>
                    </TouchableOpacity>
                    {editingReps ? (
                      <TextInput
                        style={styles.stepperValueInput}
                        value={editRepsValue}
                        onChangeText={setEditRepsValue}
                        keyboardType="number-pad"
                        autoFocus
                        onBlur={() => {
                          const n = parseInt(editRepsValue, 10);
                          if (!isNaN(n) && n >= 1) onSetUpdate(index, nextSetIdx, 'reps', n);
                          setEditingReps(false);
                        }}
                      />
                    ) : (
                      <TouchableOpacity
                        style={styles.stepperValueTouch}
                        onPress={() => {
                          setEditRepsValue(String(nextSet.reps));
                          setEditingReps(true);
                        }}
                      >
                        <Text style={styles.stepperValue}>{nextSet.reps}</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.stepperButton}
                      onPressIn={() => startRepeat(1, 'reps')}
                      onPressOut={stopRepeat}
                    >
                      <Text style={styles.stepperButtonText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.stepperBlock}>
                  <Text style={styles.stepperLabel}>
                    Weight{weightUnit === 'kg' ? ' (kg)' : ' (lb)'}
                  </Text>
                  <View style={styles.stepper}>
                    <TouchableOpacity
                      style={styles.stepperButton}
                      onPressIn={() => startRepeat(-weightStep, 'weight')}
                      onPressOut={stopRepeat}
                    >
                      <Text style={styles.stepperButtonText}>−</Text>
                    </TouchableOpacity>
                    {editingWeight ? (
                      <TextInput
                        style={styles.stepperValueInput}
                        value={editWeightValue}
                        onChangeText={setEditWeightValue}
                        keyboardType="decimal-pad"
                        autoFocus
                        onBlur={() => {
                          const s = editWeightValue.trim();
                          if (s === '' || s.toLowerCase() === 'bw') {
                            onSetUpdate(index, nextSetIdx, 'weight', 0);
                            setEditingWeight(false);
                            return;
                          }
                          const n = parseFloat(s);
                          if (!isNaN(n) && n >= 0) {
                            const lb = weightUnit === 'kg' ? kgToLb(n) : n;
                            onSetUpdate(
                              index,
                              nextSetIdx,
                              'weight',
                              Math.round(lb * 10) / 10,
                            );
                          }
                          setEditingWeight(false);
                        }}
                      />
                    ) : (
                      <TouchableOpacity
                        style={styles.stepperValueTouch}
                        onPress={() => {
                          const w = nextSet.weight;
                          if (w != null && w > 0) {
                            setEditWeightValue(
                              weightUnit === 'kg'
                                ? String(Math.round(lbToKg(w) * 10) / 10)
                                : String(w),
                            );
                          } else {
                            setEditWeightValue('');
                          }
                          setEditingWeight(true);
                        }}
                      >
                        <Text style={styles.stepperValue}>
                          {nextSet.weight != null && nextSet.weight > 0
                            ? weightUnit === 'kg'
                              ? String(Math.round(lbToKg(nextSet.weight) * 10) / 10)
                              : String(nextSet.weight)
                            : '—'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.stepperButton}
                      onPressIn={() => startRepeat(weightStep, 'weight')}
                      onPressOut={stopRepeat}
                    >
                      <Text style={styles.stepperButtonText}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.weightStepRow}>
                    {([5, 2.5, 10] as const).map((step) => (
                      <TouchableOpacity
                        key={String(step)}
                        style={[styles.weightStepChip, weightStep === step && styles.weightStepChipActive]}
                        onPress={() => setWeightStep(step)}
                      >
                        <Text
                          style={[styles.weightStepChipText, weightStep === step && styles.weightStepChipTextActive]}
                        >
                          {step}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            </View>
          </>
        );
      })()}


      {/* `notes` defaults to '' (see the `exerciseNotes[index] || ''` prop). A bare
          `notes && (...)` renders that empty string, and an empty string is a text
          node — which react-native-web rejects as a child of a <View> ("Unexpected
          text node"), firing once per card on every live session. Guard on a
          non-empty value so nothing renders when there is no note. */}
      {notes ? (
        <View style={styles.exerciseNotesPreview}>
          <Text style={styles.exerciseNotesPreviewText}>{notes}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ExerciseOptionsModal({
  visible,
  onClose,
  libraryGuideAvailable,
  onLibraryGuide,
  onSkip,
  onNotes,
  onAddSet,
  onToggleAdvancedLogging,
  showAdvancedLogging,
}: {
  visible: boolean;
  onClose: () => void;
  libraryGuideAvailable?: boolean;
  onLibraryGuide?: () => void;
  onSkip: () => void;
  onNotes: () => void;
  onAddSet: () => void;
  onToggleAdvancedLogging: () => void;
  showAdvancedLogging: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createWorkoutSessionStyles(colors), [colors]);
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.optionsModal}>
          <View style={styles.optionsModalHeader}>
            <Text style={styles.optionsModalTitle}>Exercise Options</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.optionsList}>
            {libraryGuideAvailable && onLibraryGuide ? (
              <>
                <TouchableOpacity
                  style={styles.optionItem}
                  onPress={() => {
                    onLibraryGuide();
                    onClose();
                  }}
                >
                  <Text style={styles.optionItemText}>How to & demo</Text>
                  <Text style={styles.optionItemSubtext}>Steps and YouTube demo in Exercises tab</Text>
                </TouchableOpacity>
                <View style={styles.optionDivider} />
              </>
            ) : null}
            <TouchableOpacity style={styles.optionItem} onPress={onNotes}>
              <Text style={styles.optionItemText}>Notes</Text>
            </TouchableOpacity>

            <View style={styles.optionDivider} />

            <TouchableOpacity style={styles.optionItem} onPress={() => {
              onAddSet();
              onClose();
            }}>
              <Text style={styles.optionItemText}>+ Add Set</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.optionItem} onPress={() => {
              onToggleAdvancedLogging();
              onClose();
            }}>
              <Text style={styles.optionItemText}>
                {showAdvancedLogging ? '− Hide RPE' : '+ Add RPE'}
              </Text>
            </TouchableOpacity>

            <View style={styles.optionDivider} />

            <TouchableOpacity style={[styles.optionItem, styles.optionItemDestructive]} onPress={onSkip}>
              <Text style={[styles.optionItemText, styles.optionItemDestructiveText]}>Skip for today</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Edit Set Modal (bottom sheet) — Weight/Reps steppers, optional RPE, Apply to remaining
function EditPrescriptionModal({
  visible,
  exerciseName,
  initialWeight,
  initialReps,
  initialRpe,
  hasRemainingSets,
  onSave,
  onClose,
}: {
  visible: boolean;
  exerciseName: string;
  initialWeight: number;
  initialReps: number;
  initialRpe?: number;
  hasRemainingSets: boolean;
  onSave: (weight: number, reps: number, applyToRemaining: boolean, rpe?: number) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createWorkoutSessionStyles(colors), [colors]);
  const { weightUnit } = useUserPreferences();
  const [weight, setWeight] = useState(initialWeight);
  const [reps, setReps] = useState(initialReps);
  const [rpe, setRpe] = useState<number | undefined>(initialRpe);
  const [applyToRemaining, setApplyToRemaining] = useState(false);

  const weightStepLb = weightUnit === 'kg' ? kgToLb(1) : 5;

  useEffect(() => {
    if (visible) {
      setWeight(initialWeight);
      setReps(initialReps);
      setRpe(initialRpe);
      setApplyToRemaining(false);
    }
  }, [visible, initialWeight, initialReps, initialRpe]);

  const handleSave = () => {
    if (reps < 1) return;
    onSave(weight, reps, applyToRemaining, rpe);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.editPrescriptionOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.editPrescriptionModalContainer}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={styles.editPrescriptionModal}
          >
            <View style={styles.editPrescriptionModalHandle} />
            <View style={styles.editPrescriptionModalHeader}>
              <View style={styles.editPrescriptionModalHeaderText}>
                <Text style={styles.editPrescriptionModalTitle}>Edit set</Text>
                <Text style={styles.editPrescriptionModalSubtitle} numberOfLines={1}>
                  {exerciseName}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.editPrescriptionModalClose}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.editPrescriptionModalBody}>
              <View style={styles.editPrescriptionField}>
                <Text style={styles.editPrescriptionLabel}>
                  Weight ({weightUnit === 'kg' ? 'kg' : 'lb'})
                </Text>
                <View style={styles.editModalStepperRow}>
                  <TouchableOpacity
                    style={styles.stepperButton}
                    onPress={() =>
                      setWeight((w) => Math.max(0, Math.round((w - weightStepLb) * 10) / 10))
                    }
                  >
                    <Text style={styles.stepperButtonText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.editModalStepperValue}>
                    {weightUnit === 'kg'
                      ? Math.round(lbToKg(weight) * 10) / 10
                      : weight}
                  </Text>
                  <TouchableOpacity
                    style={styles.stepperButton}
                    onPress={() =>
                      setWeight((w) => Math.round((w + weightStepLb) * 10) / 10)
                    }
                  >
                    <Text style={styles.stepperButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.editPrescriptionField}>
                <Text style={styles.editPrescriptionLabel}>Reps</Text>
                <View style={styles.editModalStepperRow}>
                  <TouchableOpacity
                    style={styles.stepperButton}
                    onPress={() => setReps((r) => Math.max(1, r - 1))}
                  >
                    <Text style={styles.stepperButtonText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.editModalStepperValue}>{reps}</Text>
                  <TouchableOpacity
                    style={styles.stepperButton}
                    onPress={() => setReps((r) => r + 1)}
                  >
                    <Text style={styles.stepperButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.editPrescriptionField}>
                <Text style={styles.editPrescriptionLabel}>RPE (optional)</Text>
                <View style={styles.editModalStepperRow}>
                  <TouchableOpacity
                    style={styles.stepperButton}
                    onPress={() => setRpe((v) => (v == null ? undefined : v <= 1 ? undefined : v - 1))}
                  >
                    <Text style={styles.stepperButtonText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.editModalStepperValue}>{rpe ?? '—'}</Text>
                  <TouchableOpacity
                    style={styles.stepperButton}
                    onPress={() => setRpe((v) => Math.min(10, (v ?? 0) + 1))}
                  >
                    <Text style={styles.stepperButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {hasRemainingSets && (
                <View style={styles.editPrescriptionToggleRow}>
                  <Text style={styles.editPrescriptionToggleLabel}>
                    Apply to remaining sets
                  </Text>
                  <Switch
                    value={applyToRemaining}
                    onValueChange={setApplyToRemaining}
                    trackColor={{ false: colors.border, true: colors.primary + '80' }}
                    thumbColor={applyToRemaining ? colors.primary : colors.textTertiary}
                  />
                </View>
              )}
            </View>
            <View style={styles.editPrescriptionModalFooter}>
              <Button
                title="Cancel"
                onPress={onClose}
                variant="secondary"
                style={styles.editPrescriptionModalButton}
              />
              <Button
                title="Save"
                onPress={handleSave}
                style={styles.editPrescriptionModalButton}
              />
            </View>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// Notes Modal
function NotesModal({
  visible,
  exerciseName,
  notes,
  onSave,
  onClose,
}: {
  visible: boolean;
  exerciseName: string;
  notes: string;
  onSave: (notes: string) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createWorkoutSessionStyles(colors), [colors]);
  const [currentNotes, setCurrentNotes] = useState(notes);

  useEffect(() => {
    setCurrentNotes(notes);
  }, [notes]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.notesModal}>
          <View style={styles.notesModalHeader}>
            <Text style={styles.notesModalTitle}>{exerciseName}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.notesInput}
            value={currentNotes}
            onChangeText={setCurrentNotes}
            placeholder="Add notes (e.g., 'felt heavy', 'elbow pain')..."
            multiline
            numberOfLines={6}
            placeholderTextColor={colors.textMuted}
          />
          <View style={styles.notesModalButtons}>
            <Button
              title="Cancel"
              onPress={onClose}
              variant="secondary"
              style={styles.notesModalButton}
            />
            <Button
              title="Save"
              onPress={() => onSave(currentNotes)}
              style={styles.notesModalButton}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Finish-screen highlights are a reel, not a report. */
const MAX_VISIBLE_ACHIEVEMENTS = 3;

// Workout Finish Screen
function WorkoutFinishScreen({
  session,
  exerciseSessions,
  elapsedTime,
  overallNotes,
  exerciseNotes,
  lastPerformance,
  personalBests,
  onComplete,
  onBack,
}: {
  session: WorkoutSessionState;
  exerciseSessions: ExerciseSession[];
  elapsedTime: number;
  overallNotes: string;
  exerciseNotes: Record<number, string>;
  lastPerformance: LastPerformanceMap;
  personalBests: PersonalBestMap;
  onComplete: () => void;
  onBack: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createWorkoutSessionStyles(colors), [colors]);
  const { weightUnit } = useUserPreferences();
  // This screen scrolls the full height rather than sitting centred, so on a
  // notched device its content would otherwise run under the status bar. The
  // rest of the app takes the top edge per screen the same way.
  const insets = useSafeAreaInsets();
  const [isSaved, setIsSaved] = useState(false);

  const totals = useMemo(
    () => summarizeSessionTotals(exerciseSessions),
    [exerciseSessions],
  );
  const achievements = useMemo(
    () =>
      collectSessionAchievements(
        exerciseSessions,
        lastPerformance,
        personalBests,
      ),
    [exerciseSessions, lastPerformance, personalBests],
  );
  const visibleAchievements = achievements.slice(0, MAX_VISIBLE_ACHIEVEMENTS);
  const hiddenAchievements = achievements.length - visibleAchievements.length;

  const formatTime = (seconds: number) => {
    if (seconds < 3600) {
      // mm:ss format until 59:59
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      // h:mm:ss format after 59:59
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
  };

  const handleSave = () => {
    setIsSaved(true);
    // Auto-complete after showing saved state
    setTimeout(() => {
      onComplete();
    }, 1000);
  };

  return (
    <ScrollView
      style={styles.finishContainer}
      contentContainerStyle={[
        styles.finishContent,
        {
          paddingTop: Math.max(insets.top, 20),
          paddingBottom: Math.max(insets.bottom, 20),
        },
      ]}
    >
      <Text style={styles.finishTitle}>Workout Complete!</Text>

      {/* Metrics that always exist, whatever was logged. */}
      <View style={styles.finishStats}>
        <View style={styles.finishStat}>
          <Text style={styles.finishStatValue}>{formatTime(elapsedTime)}</Text>
          <Text style={styles.finishStatLabel}>Time</Text>
        </View>
        <View style={styles.finishStat}>
          <Text style={styles.finishStatValue}>{totals.exercisesWorked}</Text>
          <Text style={styles.finishStatLabel}>Exercises</Text>
        </View>
        <View style={styles.finishStat}>
          <Text style={styles.finishStatValue}>{totals.completedSets}</Text>
          <Text style={styles.finishStatLabel}>Sets</Text>
        </View>
      </View>

      {/*
        Volume is hidden rather than shown as zero. Bodyweight work never has a
        weight, and generated plans ship none until the last-performance prefill
        starts filling it in, so plenty of real sessions total nothing — and
        "0 lb" reads as a broken screen rather than an honest one.
      */}
      {totals.hasWeightedWork && (
        <View style={styles.finishVolumeRow}>
          <Text style={styles.finishVolumeLabel}>Total volume</Text>
          <Text style={styles.finishVolumeValue}>
            {formatVolumeFromLb(totals.volumeLb, weightUnit)}
          </Text>
        </View>
      )}

      {achievements.length > 0 && (
        <View style={styles.finishHighlights}>
          <Text style={styles.finishSectionLabel}>Highlights</Text>
          {visibleAchievements.map((achievement) => (
            <View
              key={achievement.exerciseId}
              style={styles.finishHighlightRow}
            >
              <Ionicons
                name={
                  achievement.kind === 'personal-best'
                    ? 'trophy-outline'
                    : 'trending-up-outline'
                }
                size={20}
                color={
                  achievement.kind === 'personal-best'
                    ? colors.primary
                    : colors.secondary
                }
              />
              <View style={styles.finishHighlightText}>
                <Text style={styles.finishHighlightTitle}>
                  {`${formatAchievementLabel(achievement.kind)}: ${achievement.exerciseName}`}
                </Text>
                <Text style={styles.finishHighlightDetail}>
                  {formatAchievementDetail(achievement, weightUnit)}
                </Text>
              </View>
            </View>
          ))}
          {hiddenAchievements > 0 && (
            <Text style={styles.finishHighlightMore}>
              {`+${hiddenAchievements} more`}
            </Text>
          )}
        </View>
      )}

      <View style={styles.finishActions}>
        <Button
          title={isSaved ? "Saved ✓" : "Save Workout"}
          onPress={handleSave}
          disabled={isSaved}
          style={styles.finishButton}
        />
        {/*
          There is deliberately no second button here. The old "View History"
          one saved and returned to the Workout tab, exactly as the primary
          button does, so it offered a second route to one outcome under a label
          that promised something else.
        */}
        {!isSaved && (
          <TouchableOpacity
            style={styles.finishBackButton}
            onPress={onBack}
          >
            <Text style={styles.finishBackButtonText}>← Back to Workout</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

function createWorkoutSessionStyles(palette: ColorPalette) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  header: {
    backgroundColor: palette.surface,
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
  },
  workoutName: {
    fontSize: text.title,
    fontWeight: weight.bold,
    color: palette.text,
    marginBottom: spacing.xxs,
  },
  workoutDate: {
    fontSize: text.callout,
    color: palette.textSecondary,
    marginBottom: spacing.sm,
  },
  workoutMetaLine: {
    fontSize: text.body,
    lineHeight: leading.body,
    color: palette.textTertiary,
    fontWeight: weight.medium,
  },
  headerMenuButton: {
    padding: spacing.xs,
    marginTop: spacing.xxs,
  },
  headerMenuButtonText: {
    fontSize: text.title,
    color: palette.textTertiary,
  },
  progressSection: {
    backgroundColor: palette.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  exerciseCardCollapsedMainCol: {
    flex: 1,
    minWidth: 0,
  },
  exerciseGuideCollapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignSelf: 'stretch',
    backgroundColor: palette.primary + '1c',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.primary + '44',
  },
  exerciseGuideCollapsedText: {
    flex: 1,
    fontSize: text.body,
    fontWeight: weight.bold,
    color: palette.primary,
  },
  exerciseGuideChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexShrink: 1,
    maxWidth: '100%',
    gap: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.xxs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: palette.primary + '18',
    borderWidth: 1,
    borderColor: palette.primary + '40',
  },
  exerciseGuideChipInRow: {
    alignSelf: 'center',
    flexShrink: 0,
    marginTop: spacing.none,
    marginBottom: spacing.none,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
    borderWidth: 1.5,
    borderColor: palette.primary + '55',
    backgroundColor: palette.primary + '22',
  },
  exerciseGuideChipCurrent: {
    backgroundColor: palette.primary + '2e',
    borderColor: palette.primary + '70',
  },
  exerciseGuideChipLabel: {
    flexShrink: 1,
  },
  exerciseGuideChipStrong: {
    fontSize: text.body,
    fontWeight: weight.heavy,
    color: palette.text,
  },
  exerciseGuideChipMuted: {
    fontSize: text.footnote,
    fontWeight: weight.semibold,
    color: palette.textMuted,
  },
  exerciseGuideChipLabelInRow: {
    flexShrink: 0,
  },
  exerciseGuideChipStrongInRow: {
    fontSize: text.footnote,
    fontWeight: weight.heavy,
    color: palette.text,
  },
  exerciseGuideChipMutedInRow: {
    fontSize: text.caption,
    fontWeight: weight.bold,
    color: palette.textMuted,
  },
  progressHeader: {
    marginBottom: spacing.sm,
  },
  progressText: {
    fontSize: text.body,
    fontWeight: weight.semibold,
    color: palette.textSecondary,
  },
  progressBar: {
    height: 4,
    backgroundColor: palette.background,
    borderRadius: radius.xs,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: palette.primary,
    opacity: 0.85,
    borderRadius: radius.xs,
  },
  nextExerciseText: {
    fontSize: text.body,
    color: palette.textTertiary,
    marginTop: spacing.xs,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  exerciseCardCollapsed: {
    backgroundColor: palette.surface,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exerciseCardSkipped: {
    minHeight: 72,
    justifyContent: 'center',
    backgroundColor: palette.primary + '14',
    borderColor: palette.primary + '44',
    borderWidth: 1,
    borderStyle: 'solid',
  },
  exerciseCardNameSkipped: {
    opacity: 0.9,
    textDecorationLine: 'line-through',
    textDecorationColor: palette.textSecondary,
  },
  exerciseCardSkippedHint: {
    fontSize: text.body,
    color: palette.textSecondary,
    marginTop: spacing.xs,
    fontWeight: weight.medium,
  },
  unskipButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.primary + '55',
    backgroundColor: palette.surface,
  },
  unskipButtonText: {
    fontSize: text.body,
    fontWeight: weight.bold,
    color: palette.primary,
  },
  exerciseCardCollapsedContent: {
    flex: 1,
  },
  exerciseCardCollapsedPressable: {
    flex: 1,
    minWidth: 0,
  },
  exerciseCardCollapsedPressed: {
    opacity: 0.88,
  },
  exerciseCardCollapsedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  exerciseCardNameCollapsed: {
    fontSize: text.headline,
    fontWeight: weight.semibold,
    color: palette.text,
  },
  activeBadge: {
    backgroundColor: palette.primary + '33',
    // xs, not sm: uppercase "ACTIVE" sits beside the exercise name in the
    // collapsed card, and its type stepped up onto the scale. Any width this
    // pill gains comes straight out of the name next to it.
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.primary + '55',
  },
  activeBadgeText: {
    fontSize: text.caption,
    fontWeight: weight.bold,
    color: palette.primary,
    textTransform: 'uppercase',
    letterSpacing: tracking.wide,
  },
  skippedBadge: {
    backgroundColor: palette.primary + '33',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.primary + '66',
  },
  skippedBadgeText: {
    fontSize: text.caption,
    fontWeight: weight.heavy,
    color: palette.primary,
    textTransform: 'uppercase',
    letterSpacing: tracking.wider,
  },
  exerciseCardInfoCollapsed: {
    fontSize: text.body,
    color: palette.textSecondary,
    marginBottom: spacing.sm,
  },
  exerciseCardCollapsedPills: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  setTrackerPillCollapsed: {
    minWidth: 24,
    height: 24,
    borderRadius: radius.md,
    backgroundColor: palette.background,
    borderWidth: 2,
    borderColor: palette.border,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  exerciseCard: {
    backgroundColor: palette.surface,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
  },
  exerciseCardCurrent: {
    borderColor: palette.primary + '44',
    backgroundColor: palette.background,
  },
  exerciseCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xxs,
  },
  exerciseCardHeaderCurrent: {
    marginBottom: spacing.xxs,
  },
  exerciseCardHeaderLeft: {
    flex: 1,
  },
  exerciseCardHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xxs,
  },
  exerciseCardHeaderRight: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  exerciseCardName: {
    fontSize: text.headline,
    fontWeight: weight.bold,
    color: palette.text,
    flexShrink: 1,
  },
  muscleTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  muscleTag: {
    backgroundColor: palette.primary + '15',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  muscleTagText: {
    fontSize: text.footnote,
    color: palette.primary,
    fontWeight: weight.medium,
  },
  optionsButton: {
    padding: spacing.xs,
  },
  optionsButtonText: {
    fontSize: text.title,
    color: palette.textTertiary,
  },
  collapseButton: {
    padding: spacing.xs,
  },
  collapseButtonText: {
    fontSize: text.title,
    color: palette.textTertiary,
  },
  exerciseCardInfo: {
    fontSize: text.body,
    fontWeight: weight.semibold,
    color: palette.textSecondary,
    marginBottom: spacing.xs,
  },
  planAndGuideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.xxs,
    flexWrap: 'wrap',
  },
  planCell: {
    flex: 1,
    minWidth: 100,
  },
  exerciseCardInfoCompact: {
    fontSize: text.body,
    fontWeight: weight.semibold,
    color: palette.textSecondary,
    marginBottom: spacing.none,
  },
  prescriptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  prescriptionRowTappable: {
    marginHorizontal: -4,
    marginLeft: -4,
  },
  prescriptionRowTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingVertical: spacing.xs,
    paddingRight: spacing.sm,
  },
  prescriptionEditHint: {
    fontSize: text.footnote,
    color: palette.textTertiary,
    marginLeft: spacing.sm,
  },
  editPrescriptionText: {
    fontSize: text.callout,
    color: palette.primary,
    marginLeft: spacing.xs,
  },
  completedSetsContainer: {
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  completedSetsLabel: {
    fontSize: text.body,
    color: palette.textTertiary,
    marginBottom: spacing.sm,
  },
  completedSetsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  completedSetBadge: {
    backgroundColor: palette.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
  },
  completedSetText: {
    fontSize: text.footnote,
    color: palette.textSecondary,
  },
  setTrackerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
    paddingVertical: spacing.none,
  },
  setProgressLabel: {
    fontSize: text.body,
    fontWeight: weight.semibold,
    color: palette.textSecondary,
  },
  lastSetLine: {
    fontSize: text.footnote,
    color: palette.textTertiary,
    marginBottom: spacing.xs,
  },
  suggestionLine: {
    fontSize: text.footnote,
    color: palette.primary,
    fontWeight: weight.semibold,
    marginBottom: spacing.xs,
  },
  loggingBand: {
    backgroundColor: palette.background,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.none,
    borderWidth: 1,
    borderColor: palette.border,
  },
  loggingControlsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.none,
  },
  stepperBlock: {
    flex: 1,
  },
  stepperLabel: {
    fontSize: text.caption,
    color: palette.textTertiary,
    marginBottom: spacing.xxs,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: palette.background,
    borderWidth: 1,
    borderColor: palette.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperButtonText: {
    fontSize: text.headline,
    fontWeight: weight.semibold,
    color: palette.text,
  },
  stepperValue: {
    minWidth: 44,
    fontSize: text.headline,
    fontWeight: weight.semibold,
    color: palette.text,
    textAlign: 'center',
  },
  stepperValueTouch: {
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  stepperValueInput: {
    width: 52,
    fontSize: text.headline,
    fontWeight: weight.semibold,
    color: palette.text,
    textAlign: 'center',
    backgroundColor: palette.background,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  weightStepRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
    flexWrap: 'wrap',
  },
  weightStepChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.background,
  },
  weightStepChipActive: {
    borderColor: palette.primary,
    backgroundColor: palette.primary + '20',
  },
  weightStepChipText: {
    fontSize: text.footnote,
    color: palette.textSecondary,
    fontWeight: weight.semibold,
  },
  weightStepChipTextActive: {
    color: palette.primary,
  },
  setTrackerPillFocused: {
    borderColor: palette.primary,
    borderWidth: 2,
  },
  setTrackerPillFuture: {
    borderColor: palette.border,
    backgroundColor: 'transparent',
    opacity: 0.7,
  },
  setTrackerPillTextFocused: {
    color: palette.primary,
  },
  setTrackerPillTextFuture: {
    color: palette.textTertiary,
  },
  setTrackerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  setPillControl: {
    minWidth: 40,
    minHeight: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.background,
    borderWidth: 1,
    borderColor: palette.border,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  setPillControlDisabled: {
    opacity: 0.5,
  },
  setPillControlText: {
    fontSize: text.headline,
    fontWeight: weight.semibold,
    color: palette.text,
  },
  setPillControlTextDisabled: {
    color: palette.textTertiary,
  },
  setTrackerLabel: {
    fontSize: text.body,
    fontWeight: weight.semibold,
    color: palette.textSecondary,
  },
  setTrackerDots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    flex: 1,
  },
  setTrackerPill: {
    minWidth: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: palette.background,
    borderWidth: 2,
    borderColor: palette.border,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  setTrackerPillCompleted: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  setTrackerPillText: {
    fontSize: text.body,
    fontWeight: weight.semibold,
    color: palette.textTertiary,
  },
  setTrackerPillTextCompleted: {
    color: palette.onPrimary,
  },
  setTrackerDot: {
    width: 32,
    height: 32,
    borderRadius: radius.lg,
    backgroundColor: palette.background,
    borderWidth: 2,
    borderColor: palette.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  setTrackerDotText: {
    fontSize: text.callout,
    color: palette.textTertiary,
  },
  setTrackerDotCompleted: {
    color: palette.primary,
    fontWeight: weight.bold,
  },
  currentSetContainer: {
    marginBottom: spacing.md,
  },
  currentSetLabel: {
    fontSize: text.callout,
    fontWeight: weight.semibold,
    color: palette.text,
    marginBottom: spacing.md,
  },
  setsContainer: {
    marginBottom: spacing.md,
  },
  setCheckbox: {
    width: 24,
    height: 24,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: palette.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  setCheckboxCompleted: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  setCheckboxCheck: {
    color: palette.onPrimary,
    fontSize: text.body,
    fontWeight: weight.bold,
  },
  setNumber: {
    width: 30,
    fontSize: text.callout,
    fontWeight: weight.semibold,
    color: palette.textSecondary,
  },
  setInput: {
    flex: 1,
    backgroundColor: palette.background,
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
    color: palette.text,
    fontSize: text.callout,
  },
  setInputRpe: {
    flex: 0.5,
  },
  addSetButton: {
    padding: spacing.md,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: palette.border,
    marginTop: spacing.sm,
  },
  addSetButtonText: {
    color: palette.primary,
    fontSize: text.callout,
    fontWeight: weight.semibold,
  },
  exerciseNotesPreview: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: palette.background,
    borderRadius: radius.sm,
  },
  exerciseNotesPreviewText: {
    fontSize: text.body,
    color: palette.textTertiary,
    fontStyle: 'italic',
  },
  advancedToggle: {
    marginTop: spacing.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  advancedToggleText: {
    color: palette.primary,
    fontSize: text.body,
    fontWeight: weight.semibold,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  footerAddLibraryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.primary + '40',
    backgroundColor: palette.background,
  },
  footerAddLibraryCardText: {
    flex: 1,
    minWidth: 0,
  },
  footerAddLibraryCardTitle: {
    fontSize: text.callout,
    fontWeight: weight.bold,
    color: palette.text,
  },
  footerAddLibraryCardSub: {
    fontSize: text.caption,
    color: palette.textMuted,
    marginTop: spacing.xxs,
    fontWeight: weight.medium,
  },
  primaryButton: {
    minHeight: 56,
  },
  saveExitButton: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  saveExitButtonText: {
    fontSize: text.body,
    fontWeight: weight.semibold,
    color: palette.textSecondary,
  },
  toastContainer: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastText: {
    backgroundColor: palette.text,
    color: palette.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    fontSize: text.body,
    fontWeight: weight.medium,
    overflow: 'hidden',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: palette.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: spacing.xxl,
    width: '80%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: text.title,
    fontWeight: weight.bold,
    color: palette.text,
    marginBottom: spacing.md,
  },
  modalText: {
    fontSize: text.callout,
    color: palette.textSecondary,
    marginBottom: spacing.sm,
  },
  modalSubtext: {
    fontSize: text.body,
    color: palette.textTertiary,
    marginBottom: spacing.xxl,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  modalButton: {
    flex: 1,
    padding: spacing.lg,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: palette.background,
    borderWidth: 1,
    borderColor: palette.border,
  },
  modalButtonConfirm: {
    backgroundColor: palette.error,
  },
  modalButtonText: {
    fontSize: text.callout,
    fontWeight: weight.semibold,
    color: palette.text,
  },
  modalButtonConfirmText: {
    color: palette.onPrimary,
  },
  modalCloseText: {
    fontSize: text.title,
    color: palette.textTertiary,
  },
  optionsModal: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    width: '100%',
    position: 'absolute',
    bottom: 0,
    maxHeight: '50%',
  },
  optionsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  optionsModalTitle: {
    fontSize: text.title,
    fontWeight: weight.bold,
    color: palette.text,
  },
  optionsList: {
    padding: spacing.sm,
  },
  optionDivider: {
    height: 1,
    backgroundColor: palette.border,
    marginVertical: spacing.sm,
    marginHorizontal: spacing.sm,
  },
  optionItem: {
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  optionItemText: {
    fontSize: text.callout,
    color: palette.text,
  },
  optionItemSubtext: {
    fontSize: text.body,
    color: palette.textMuted,
    marginTop: spacing.xs,
    lineHeight: leading.body,
  },
  sessionMenuCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    width: '88%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: palette.border,
  },
  sessionMenuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  sessionMenuRow: {
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  sessionMenuRowFirst: {
    borderTopWidth: 0,
    paddingTop: spacing.none,
  },
  optionItemDestructive: {
    borderBottomWidth: 0,
  },
  optionItemDestructiveText: {
    color: palette.error,
  },
  editPrescriptionOverlay: {
    flex: 1,
    backgroundColor: palette.overlay,
    justifyContent: 'flex-end',
  },
  editPrescriptionModalContainer: {
    width: '100%',
  },
  editPrescriptionModal: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    width: '100%',
    paddingBottom: spacing.xxl,
  },
  editPrescriptionModalHandle: {
    width: 40,
    height: 4,
    backgroundColor: palette.border,
    borderRadius: radius.xs,
    alignSelf: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  editPrescriptionModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  editPrescriptionModalHeaderText: {
    flex: 1,
  },
  editPrescriptionModalTitle: {
    fontSize: text.title,
    fontWeight: weight.bold,
    color: palette.text,
    marginBottom: spacing.xxs,
  },
  editPrescriptionModalSubtitle: {
    fontSize: text.body,
    color: palette.textSecondary,
  },
  editPrescriptionModalClose: {
    padding: spacing.xs,
  },
  editPrescriptionModalBody: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  editPrescriptionField: {
    marginBottom: spacing.lg,
  },
  editPrescriptionLabel: {
    fontSize: text.body,
    fontWeight: weight.semibold,
    color: palette.textSecondary,
    marginBottom: spacing.sm,
  },
  editPrescriptionInput: {
    backgroundColor: palette.background,
    borderRadius: radius.sm,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.border,
    color: palette.text,
    fontSize: text.callout,
  },
  editModalStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  editModalStepperValue: {
    minWidth: 48,
    fontSize: text.headline,
    fontWeight: weight.semibold,
    color: palette.text,
    textAlign: 'center',
  },
  editPrescriptionToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    marginTop: spacing.sm,
  },
  editPrescriptionToggleLabel: {
    fontSize: text.callout,
    color: palette.text,
  },
  editPrescriptionModalFooter: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  editPrescriptionModalButton: {
    flex: 1,
  },
  notesModal: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '60%',
    width: '100%',
    position: 'absolute',
    bottom: 0,
  },
  notesModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  notesModalTitle: {
    fontSize: text.title,
    fontWeight: weight.bold,
    color: palette.text,
  },
  notesInput: {
    backgroundColor: palette.background,
    borderRadius: radius.sm,
    padding: spacing.lg,
    margin: spacing.xl,
    color: palette.text,
    fontSize: text.callout,
    minHeight: 120,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: palette.border,
  },
  notesModalButtons: {
    flexDirection: 'row',
    padding: spacing.xl,
    gap: spacing.md,
  },
  notesModalButton: {
    flex: 1,
  },
  finishContainer: {
    flex: 1,
    backgroundColor: palette.background,
  },
  // Scrolls rather than centres rigidly: highlights make this screen's height
  // depend on the session, and it still centres when there is little to show.
  // Vertical padding is applied inline from the safe-area insets.
  finishContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  finishTitle: {
    fontSize: text.display,
    fontWeight: weight.bold,
    color: palette.text,
    marginBottom: spacing.xxl,
  },
  finishStats: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginBottom: spacing.xl,
    width: '100%',
    justifyContent: 'space-around',
  },
  finishStat: {
    alignItems: 'center',
  },
  finishStatValue: {
    fontSize: text.display,
    fontWeight: weight.bold,
    color: palette.primary,
    marginBottom: spacing.sm,
  },
  finishStatLabel: {
    fontSize: text.body,
    color: palette.textTertiary,
    marginTop: spacing.xs,
  },
  finishStatSubtext: {
    fontSize: text.footnote,
    color: palette.textMuted,
    marginTop: spacing.xxs,
  },
  finishVolumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: spacing.xl,
  },
  finishVolumeLabel: {
    fontSize: text.body,
    color: palette.textSecondary,
  },
  finishVolumeValue: {
    fontSize: text.callout,
    fontWeight: weight.semibold,
    color: palette.text,
  },
  finishHighlights: {
    width: '100%',
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  finishSectionLabel: {
    fontSize: text.footnote,
    fontWeight: weight.semibold,
    letterSpacing: tracking.wider,
    textTransform: 'uppercase',
    color: palette.textMuted,
  },
  finishHighlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  finishHighlightText: {
    flex: 1,
    gap: spacing.xxs,
  },
  finishHighlightTitle: {
    fontSize: text.callout,
    fontWeight: weight.semibold,
    color: palette.text,
  },
  finishHighlightDetail: {
    fontSize: text.body,
    color: palette.textSecondary,
  },
  finishHighlightMore: {
    fontSize: text.body,
    color: palette.textMuted,
    textAlign: 'center',
  },
  finishActions: {
    width: '100%',
    gap: spacing.md,
    // Keeps the actions off the stats when there is no volume row or
    // highlights between them.
    marginTop: spacing.md,
  },
  finishButton: {
    minHeight: 56,
  },
  finishBackButton: {
    padding: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  finishBackButtonText: {
    color: palette.textTertiary,
    fontSize: text.callout,
  },
  });
}
