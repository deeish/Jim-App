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
import { Workout, ExerciseSession, CompletedSet, type WorkoutSessionRestoredSnapshot } from '../types/workout';
import { saveWorkoutDraft } from '../lib/workoutDraftStorage';
import { getWorkoutDisplayEstimateMinutes } from '../lib/estimateWorkoutMinutes';
import { navigateFromWorkoutToExerciseDetail, isLinkableLibraryExerciseId } from '../lib/exerciseNavigation';
import Button from './Button';
import { useTheme } from '../theme';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import {
  formatAtWeightFromLb,
  formatWeightCompactFromLb,
  kgToLb,
  lbToKg,
} from '../lib/weightDisplay';
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
  onComplete: (sessionData: any) => void;
  onUpdate: Dispatch<SetStateAction<WorkoutSessionState | null>>;
  onExitWithoutFinishing?: () => void | Promise<void>;
  navigation?: NativeStackNavigationProp<RootStackParamList>;
}

export default function WorkoutSession({
  session,
  serverWorkout,
  onComplete,
  onUpdate,
  onExitWithoutFinishing,
  navigation,
}: WorkoutSessionProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createWorkoutSessionStyles(colors), [colors]);
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
    if (!session.restoredSnapshot) return;
    onUpdate((s) => (s ? { ...s, restoredSnapshot: undefined } : s));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time strip after hydrate
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

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((new Date().getTime() - session.startTime.getTime()) / 1000);
      setElapsedTime(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [session.startTime]);

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
    const planned = session.workout.estimatedDuration ?? null;
    const activePrescription = exerciseSessions
      .filter((es) => !es.skipped)
      .map((es) => es.exercise);
    const prescription =
      activePrescription.length > 0 ? activePrescription : session.workout.exercises ?? [];
    const displayMin = getWorkoutDisplayEstimateMinutes(prescription, planned);

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
          if (m === displayMin || m === planned) continue;
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
    exerciseSessions,
    elapsedTime,
  ]);

  const getCompletedExercisesCount = () => {
    return exerciseSessions.filter(
      (es) => !es.skipped && es.completedSets.every((set) => set.completed)
    ).length;
  };

  const getTotalCompletedSets = () => {
    return exerciseSessions
      .filter((es) => !es.skipped)
      .reduce(
        (total, es) => total + es.completedSets.filter((set) => set.completed).length,
        0
      );
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

  const handleReplaceExercise = () => {
    if (navigation) {
      navigation.navigate('Search');
    }
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
          },
        },
      });
    }
  };

  const handleEndWorkout = () => {
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
    const totalVolume = exerciseSessions
      .filter((es) => !es.skipped)
      .reduce((total, es) => {
        return (
          total +
          es.completedSets
            .filter((set) => set.completed && set.weight) // Exclude bodyweight exercises
            .reduce((vol, set) => vol + (set.reps || 0) * (set.weight || 0), 0)
        );
      }, 0);

    onComplete({
      workout: session.workout,
      exercises: exerciseSessions,
      startTime: session.startTime,
      endTime,
      totalTime,
      totalSets: getTotalCompletedSets(),
      totalVolume,
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
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
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
              onReplace={handleReplaceExercise}
              exercise={exerciseSession.exercise}
              onEditPrescription={() => setShowEditPrescriptionModal(index)}
              focusedSetIndex={index === currentExerciseIndex ? focusedSetIndex : null}
              onFocusSet={(setIdx) => setFocusedSetIndex(setIdx)}
              onSelectExercise={handleSelectExercise}
              onUnskip={handleUnskipExercise}
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
          onSwap={() => {
            setShowExerciseOptions(null);
            handleReplaceExercise();
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
  onReplace,
  exercise,
  onEditPrescription,
  focusedSetIndex,
  onFocusSet,
  onSelectExercise,
  onUnskip,
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
  onReplace: () => void;
  exercise: any;
  onEditPrescription: () => void;
  focusedSetIndex: number | null;
  onFocusSet: (setIndex: number) => void;
  onSelectExercise: (index: number) => void;
  onUnskip: (exerciseIndex: number) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createWorkoutSessionStyles(colors), [colors]);
  const { weightUnit } = useUserPreferences();
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
    const planShort = `${exerciseSession.completedSets.length}×${exerciseData.reps}${
      exerciseData.weight === 0 || (!exerciseData.weight && !lastWeight)
        ? ' (BW)'
        : wLb
          ? formatAtWeightFromLb(wLb, weightUnit)
          : ''
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
  const planLabel = `Plan: ${exerciseData.sets}×${exerciseData.reps}${
    exerciseData.weight != null && exerciseData.weight !== 0
      ? formatAtWeightFromLb(exerciseData.weight, weightUnit)
      : exerciseData.weight === 0
        ? ' (BW)'
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
      {lastCompleted != null && (
        <Text style={styles.lastSetLine}>
          Last set today: {lastCompleted.reps}×
          {lastCompleted.weight != null && lastCompleted.weight > 0
            ? formatWeightCompactFromLb(lastCompleted.weight, weightUnit)
            : 'BW'}
        </Text>
      )}

      {/* Row 3: Set pills (tappable when active) + Set x/y + [ – ] [ + ] */}
      <View style={styles.setTrackerContainer}>
        <View style={styles.setTrackerDots}>
          {exerciseSession.completedSets.map((set, setIdx) => {
            const isFocused = isCurrent && nextSetIdx === setIdx;
            const isFuture = !set.completed && !isFocused;
            const pill = (
              <View
                key={setIdx}
                style={[
                  styles.setTrackerPill,
                  set.completed && styles.setTrackerPillCompleted,
                  isFocused && styles.setTrackerPillFocused,
                  isFuture && styles.setTrackerPillFuture,
                ]}
              >
                <Text
                  style={[
                    styles.setTrackerPillText,
                    set.completed && !isFocused && styles.setTrackerPillTextCompleted,
                    isFocused && styles.setTrackerPillTextFocused,
                    isFuture && styles.setTrackerPillTextFuture,
                  ]}
                >
                  {set.completed ? '✓' : setIdx + 1}
                </Text>
              </View>
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
                            : 'BW'}
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


      {notes && (
        <View style={styles.exerciseNotesPreview}>
          <Text style={styles.exerciseNotesPreviewText}>{notes}</Text>
        </View>
      )}
    </View>
  );
}

// Simplified Set Row Component - Read-only display for editing
function SetRow({
  set,
  exerciseIndex,
  setIndex,
  onComplete,
  onUpdate,
  showAdvancedLogging,
}: {
  set: CompletedSet;
  exerciseIndex: number;
  setIndex: number;
  onComplete: (exerciseIndex: number, setIndex: number) => void;
  onUpdate: (exerciseIndex: number, setIndex: number, field: 'reps' | 'weight' | 'rpe', value: number) => void;
  showAdvancedLogging: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createWorkoutSessionStyles(colors), [colors]);
  const { weightUnit } = useUserPreferences();
  const [isEditing, setIsEditing] = useState(false);
  const [reps, setReps] = useState(set.reps.toString());
  const [weight, setWeight] = useState('');
  const [rpe, setRpe] = useState(set.rpe?.toString() || '');

  if (set.completed) {
    return null; // Completed sets shown in read-only section
  }

  if (!isEditing) {
    return (
      <TouchableOpacity
        style={styles.setRowReadOnly}
        onPress={() => {
          setReps(String(set.reps));
          setWeight(
            set.weight != null && set.weight > 0
              ? weightUnit === 'kg'
                ? String(Math.round(lbToKg(set.weight) * 10) / 10)
                : String(set.weight)
              : '',
          );
          setRpe(set.rpe?.toString() ?? '');
          setIsEditing(true);
        }}
      >
        <Text style={styles.setRowReadOnlyText}>
          {set.reps} reps
          {set.weight ? formatAtWeightFromLb(set.weight, weightUnit) : ''}
          {showAdvancedLogging && set.rpe ? ` • RPE ${set.rpe}` : ''}
        </Text>
        <Text style={styles.setRowEditHint}>Tap to edit</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.setRow}>
      <Text style={styles.setNumber}>{set.setNumber}</Text>
      <TextInput
        style={styles.setInput}
        value={reps}
        onChangeText={(text) => {
          setReps(text);
          const num = parseInt(text) || 0;
          onUpdate(exerciseIndex, setIndex, 'reps', num);
        }}
        keyboardType="numeric"
        placeholder={`${set.reps} reps`}
        autoFocus
      />
      <TextInput
        style={styles.setInput}
        value={weight}
        onChangeText={(text) => {
          setWeight(text);
          const num = parseFloat(text);
          if (isNaN(num)) return;
          const lb = weightUnit === 'kg' ? kgToLb(num) : num;
          onUpdate(exerciseIndex, setIndex, 'weight', Math.round(lb * 10) / 10);
        }}
        keyboardType="decimal-pad"
        placeholder={
          set.weight
            ? weightUnit === 'kg'
              ? String(Math.round(lbToKg(set.weight) * 10) / 10)
              : `${set.weight}`
            : weightUnit === 'kg'
              ? 'kg'
              : 'lb'
        }
      />
      {showAdvancedLogging && (
        <TextInput
          style={[styles.setInput, styles.setInputRpe]}
          value={rpe}
          onChangeText={(text) => {
            setRpe(text);
            const num = parseInt(text) || 0;
            if (num >= 1 && num <= 10) {
              onUpdate(exerciseIndex, setIndex, 'rpe', num);
            }
          }}
          keyboardType="numeric"
          placeholder="RPE"
          maxLength={2}
        />
      )}
      <TouchableOpacity
        style={styles.setRowDoneButton}
        onPress={() => setIsEditing(false)}
      >
        <Text style={styles.setRowDoneButtonText}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

// Exercise Options Modal
function ExerciseOptionsModal({
  visible,
  onClose,
  libraryGuideAvailable,
  onLibraryGuide,
  onSwap,
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
  onSwap: () => void;
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
            <TouchableOpacity style={styles.optionItem} onPress={onSwap}>
              <Text style={styles.optionItemText}>Swap Exercise</Text>
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

// Workout Finish Screen
function WorkoutFinishScreen({
  session,
  exerciseSessions,
  elapsedTime,
  overallNotes,
  exerciseNotes,
  onComplete,
  onBack,
}: {
  session: WorkoutSessionState;
  exerciseSessions: ExerciseSession[];
  elapsedTime: number;
  overallNotes: string;
  exerciseNotes: Record<number, string>;
  onComplete: () => void;
  onBack: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createWorkoutSessionStyles(colors), [colors]);
  const [isSaved, setIsSaved] = useState(false);
  
  const totalSets = exerciseSessions
    .filter((es) => !es.skipped)
    .reduce((total, es) => total + es.completedSets.filter((set) => set.completed).length, 0);

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
    <View style={styles.finishContainer}>
      <Text style={styles.finishTitle}>Workout Complete! 🎉</Text>
      
      <View style={styles.finishStats}>
        <View style={styles.finishStat}>
          <Text style={styles.finishStatValue}>{formatTime(elapsedTime)}</Text>
          <Text style={styles.finishStatLabel}>Total Time</Text>
        </View>
        <View style={styles.finishStat}>
          <Text style={styles.finishStatValue}>{totalSets}</Text>
          <Text style={styles.finishStatLabel}>Total Sets</Text>
        </View>
      </View>

      <View style={styles.finishActions}>
        <Button
          title={isSaved ? "Saved ✓" : "Save Workout"}
          onPress={handleSave}
          disabled={isSaved}
          style={styles.finishButton}
        />
        <Button
          title="View History"
          onPress={onComplete}
          variant="secondary"
          disabled={isSaved}
          style={styles.finishButton}
        />
        {!isSaved && (
          <TouchableOpacity
            style={styles.finishBackButton}
            onPress={onBack}
          >
            <Text style={styles.finishBackButtonText}>← Back to Workout</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
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
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
  },
  workoutName: {
    fontSize: 22,
    fontWeight: '700',
    color: palette.text,
    marginBottom: 2,
  },
  workoutDate: {
    fontSize: 15,
    color: palette.textSecondary,
    marginBottom: 6,
  },
  workoutMetaLine: {
    fontSize: 13,
    lineHeight: 18,
    color: palette.textTertiary,
    fontWeight: '500',
  },
  headerMenuButton: {
    padding: 4,
    marginTop: 2,
  },
  headerMenuButtonText: {
    fontSize: 24,
    color: palette.textTertiary,
  },
  progressSection: {
    backgroundColor: palette.surface,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
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
    gap: 6,
    marginTop: 6,
    paddingVertical: 7,
    paddingHorizontal: 10,
    alignSelf: 'stretch',
    backgroundColor: palette.primary + '1c',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.primary + '44',
  },
  exerciseGuideCollapsedText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: palette.primary,
  },
  exerciseGuideChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexShrink: 1,
    maxWidth: '100%',
    gap: 6,
    marginTop: 4,
    marginBottom: 2,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: palette.primary + '18',
    borderWidth: 1,
    borderColor: palette.primary + '40',
  },
  exerciseGuideChipInRow: {
    alignSelf: 'center',
    flexShrink: 0,
    marginTop: 0,
    marginBottom: 0,
    paddingVertical: 5,
    paddingHorizontal: 10,
    gap: 5,
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
    fontSize: 13,
    fontWeight: '800',
    color: palette.text,
  },
  exerciseGuideChipMuted: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.textMuted,
  },
  exerciseGuideChipLabelInRow: {
    flexShrink: 0,
  },
  exerciseGuideChipStrongInRow: {
    fontSize: 12,
    fontWeight: '800',
    color: palette.text,
  },
  exerciseGuideChipMutedInRow: {
    fontSize: 11,
    fontWeight: '700',
    color: palette.textMuted,
  },
  progressHeader: {
    marginBottom: 6,
  },
  progressText: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.textSecondary,
  },
  progressBar: {
    height: 4,
    backgroundColor: palette.background,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: palette.primary,
    opacity: 0.85,
    borderRadius: 2,
  },
  nextExerciseText: {
    fontSize: 14,
    color: palette.textTertiary,
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 8,
    paddingBottom: 6,
  },
  exerciseCardCollapsed: {
    backgroundColor: palette.surface,
    marginHorizontal: 12,
    marginBottom: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
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
    fontSize: 13,
    color: palette.textSecondary,
    marginTop: 4,
    fontWeight: '500',
  },
  unskipButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.primary + '55',
    backgroundColor: palette.surface,
  },
  unskipButtonText: {
    fontSize: 14,
    fontWeight: '700',
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
    gap: 8,
    marginBottom: 4,
  },
  exerciseCardNameCollapsed: {
    fontSize: 18,
    fontWeight: '600',
    color: palette.text,
  },
  activeBadge: {
    backgroundColor: palette.primary + '33',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.primary + '55',
  },
  activeBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: palette.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  skippedBadge: {
    backgroundColor: palette.primary + '33',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.primary + '66',
  },
  skippedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: palette.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  exerciseCardInfoCollapsed: {
    fontSize: 14,
    color: palette.textSecondary,
    marginBottom: 8,
  },
  exerciseCardCollapsedPills: {
    flexDirection: 'row',
    gap: 4,
  },
  setTrackerPillCollapsed: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: palette.background,
    borderWidth: 2,
    borderColor: palette.border,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  exerciseCard: {
    backgroundColor: palette.surface,
    marginHorizontal: 12,
    marginBottom: 5,
    padding: 8,
    borderRadius: 12,
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
    marginBottom: 2,
  },
  exerciseCardHeaderCurrent: {
    marginBottom: 2,
  },
  exerciseCardHeaderLeft: {
    flex: 1,
  },
  exerciseCardHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  exerciseCardHeaderRight: {
    flexDirection: 'row',
    gap: 8,
  },
  exerciseCardName: {
    fontSize: 17,
    fontWeight: '700',
    color: palette.text,
    flexShrink: 1,
  },
  muscleTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  muscleTag: {
    backgroundColor: palette.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  muscleTagText: {
    fontSize: 12,
    color: palette.primary,
    fontWeight: '500',
  },
  optionsButton: {
    padding: 4,
  },
  optionsButtonText: {
    fontSize: 20,
    color: palette.textTertiary,
  },
  collapseButton: {
    padding: 4,
  },
  collapseButtonText: {
    fontSize: 24,
    color: palette.textTertiary,
  },
  exerciseCardInfo: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.textSecondary,
    marginBottom: 4,
  },
  planAndGuideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 2,
    flexWrap: 'wrap',
  },
  planCell: {
    flex: 1,
    minWidth: 100,
  },
  exerciseCardInfoCompact: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.textSecondary,
    marginBottom: 0,
  },
  prescriptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  prescriptionRowTappable: {
    marginHorizontal: -4,
    marginLeft: -4,
  },
  prescriptionRowTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingVertical: 4,
    paddingRight: 8,
  },
  prescriptionEditHint: {
    fontSize: 12,
    color: palette.textTertiary,
    marginLeft: 8,
  },
  editPrescriptionText: {
    fontSize: 16,
    color: palette.primary,
    marginLeft: 4,
  },
  completedSetsContainer: {
    marginBottom: 12,
    marginTop: 8,
  },
  completedSetsLabel: {
    fontSize: 14,
    color: palette.textTertiary,
    marginBottom: 8,
  },
  completedSetsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  completedSetBadge: {
    backgroundColor: palette.background,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
  },
  completedSetText: {
    fontSize: 12,
    color: palette.textSecondary,
  },
  setTrackerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
    paddingVertical: 0,
  },
  setProgressLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.textSecondary,
  },
  lastSetLine: {
    fontSize: 12,
    color: palette.textTertiary,
    marginBottom: 3,
  },
  loggingBand: {
    backgroundColor: palette.background,
    borderRadius: 10,
    padding: 8,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: palette.border,
  },
  loggingControlsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 0,
  },
  stepperBlock: {
    flex: 1,
  },
  stepperLabel: {
    fontSize: 11,
    color: palette.textTertiary,
    marginBottom: 2,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: palette.background,
    borderWidth: 1,
    borderColor: palette.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: palette.text,
  },
  stepperValue: {
    minWidth: 44,
    fontSize: 18,
    fontWeight: '600',
    color: palette.text,
    textAlign: 'center',
  },
  stepperValueTouch: {
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 4,
  },
  stepperValueInput: {
    width: 52,
    fontSize: 18,
    fontWeight: '600',
    color: palette.text,
    textAlign: 'center',
    backgroundColor: palette.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  weightStepRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  weightStepChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.background,
  },
  weightStepChipActive: {
    borderColor: palette.primary,
    backgroundColor: palette.primary + '20',
  },
  weightStepChipText: {
    fontSize: 12,
    color: palette.textSecondary,
    fontWeight: '600',
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
    gap: 8,
  },
  setPillControl: {
    minWidth: 40,
    minHeight: 40,
    borderRadius: 8,
    backgroundColor: palette.background,
    borderWidth: 1,
    borderColor: palette.border,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  setPillControlDisabled: {
    opacity: 0.5,
  },
  setPillControlText: {
    fontSize: 18,
    fontWeight: '600',
    color: palette.text,
  },
  setPillControlTextDisabled: {
    color: palette.textTertiary,
  },
  setTrackerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.textSecondary,
  },
  setTrackerDots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  setTrackerPill: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.background,
    borderWidth: 2,
    borderColor: palette.border,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  setTrackerPillCompleted: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  setTrackerPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.textTertiary,
  },
  setTrackerPillTextCompleted: {
    color: '#FFFFFF',
  },
  setTrackerDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.background,
    borderWidth: 2,
    borderColor: palette.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  setTrackerDotText: {
    fontSize: 16,
    color: palette.textTertiary,
  },
  setTrackerDotCompleted: {
    color: palette.primary,
    fontWeight: 'bold',
  },
  currentSetContainer: {
    marginBottom: 12,
  },
  currentSetLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.text,
    marginBottom: 12,
  },
  setsContainer: {
    marginBottom: 12,
  },
  setRowReadOnly: {
    padding: 12,
    backgroundColor: palette.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 8,
  },
  setRowReadOnlyText: {
    fontSize: 16,
    color: palette.text,
    fontWeight: '500',
    marginBottom: 4,
  },
  setRowEditHint: {
    fontSize: 12,
    color: palette.textTertiary,
    fontStyle: 'italic',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  setRowDoneButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: palette.primary,
    borderRadius: 6,
  },
  setRowDoneButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  setCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
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
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  setNumber: {
    width: 30,
    fontSize: 16,
    fontWeight: '600',
    color: palette.textSecondary,
  },
  setInput: {
    flex: 1,
    backgroundColor: palette.background,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    color: palette.text,
    fontSize: 16,
  },
  setInputRpe: {
    flex: 0.5,
  },
  addSetButton: {
    padding: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: palette.border,
    marginTop: 8,
  },
  addSetButtonText: {
    color: palette.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  exerciseNotesPreview: {
    marginTop: 8,
    padding: 8,
    backgroundColor: palette.background,
    borderRadius: 8,
  },
  exerciseNotesPreviewText: {
    fontSize: 14,
    color: palette.textTertiary,
    fontStyle: 'italic',
  },
  advancedToggle: {
    marginTop: 12,
    padding: 8,
    alignItems: 'center',
  },
  advancedToggleText: {
    color: palette.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    gap: 8,
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  footerAddLibraryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.primary + '40',
    backgroundColor: palette.background,
  },
  footerAddLibraryCardText: {
    flex: 1,
    minWidth: 0,
  },
  footerAddLibraryCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.text,
  },
  footerAddLibraryCardSub: {
    fontSize: 11,
    color: palette.textMuted,
    marginTop: 1,
    fontWeight: '500',
  },
  primaryButton: {
    minHeight: 56,
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
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    fontSize: 14,
    fontWeight: '500',
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
    borderRadius: 12,
    padding: 24,
    width: '80%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: palette.text,
    marginBottom: 12,
  },
  modalText: {
    fontSize: 16,
    color: palette.textSecondary,
    marginBottom: 8,
  },
  modalSubtext: {
    fontSize: 14,
    color: palette.textTertiary,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
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
    fontSize: 16,
    fontWeight: '600',
    color: palette.text,
  },
  modalButtonConfirmText: {
    color: '#FFFFFF',
  },
  modalCloseText: {
    fontSize: 24,
    color: palette.textTertiary,
  },
  optionsModal: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    width: '100%',
    position: 'absolute',
    bottom: 0,
    maxHeight: '50%',
  },
  optionsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  optionsModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: palette.text,
  },
  optionsList: {
    padding: 8,
  },
  optionDivider: {
    height: 1,
    backgroundColor: palette.border,
    marginVertical: 8,
    marginHorizontal: 8,
  },
  optionItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  optionItemText: {
    fontSize: 16,
    color: palette.text,
  },
  optionItemSubtext: {
    fontSize: 13,
    color: palette.textMuted,
    marginTop: 4,
    lineHeight: 18,
  },
  sessionMenuCard: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    padding: 20,
    width: '88%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: palette.border,
  },
  sessionMenuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sessionMenuRow: {
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  sessionMenuRowFirst: {
    borderTopWidth: 0,
    paddingTop: 0,
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
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    width: '100%',
    paddingBottom: 24,
  },
  editPrescriptionModalHandle: {
    width: 40,
    height: 4,
    backgroundColor: palette.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  editPrescriptionModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  editPrescriptionModalHeaderText: {
    flex: 1,
  },
  editPrescriptionModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: palette.text,
    marginBottom: 2,
  },
  editPrescriptionModalSubtitle: {
    fontSize: 14,
    color: palette.textSecondary,
  },
  editPrescriptionModalClose: {
    padding: 4,
  },
  editPrescriptionModalBody: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 16,
  },
  editPrescriptionField: {
    marginBottom: 16,
  },
  editPrescriptionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.textSecondary,
    marginBottom: 8,
  },
  editPrescriptionInput: {
    backgroundColor: palette.background,
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: palette.border,
    color: palette.text,
    fontSize: 16,
  },
  editModalStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  editModalStepperValue: {
    minWidth: 48,
    fontSize: 18,
    fontWeight: '600',
    color: palette.text,
    textAlign: 'center',
  },
  editPrescriptionToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    marginTop: 8,
  },
  editPrescriptionToggleLabel: {
    fontSize: 16,
    color: palette.text,
  },
  editPrescriptionModalFooter: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
  },
  editPrescriptionModalButton: {
    flex: 1,
  },
  notesModal: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    width: '100%',
    position: 'absolute',
    bottom: 0,
  },
  notesModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  notesModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: palette.text,
  },
  notesInput: {
    backgroundColor: palette.background,
    borderRadius: 8,
    padding: 16,
    margin: 20,
    color: palette.text,
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: palette.border,
  },
  notesModalButtons: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
  },
  notesModalButton: {
    flex: 1,
  },
  finishContainer: {
    flex: 1,
    backgroundColor: palette.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  finishTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: palette.text,
    marginBottom: 40,
  },
  finishStats: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 40,
    width: '100%',
    justifyContent: 'space-around',
  },
  finishStat: {
    alignItems: 'center',
  },
  finishStatValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: palette.primary,
    marginBottom: 8,
  },
  finishStatLabel: {
    fontSize: 14,
    color: palette.textTertiary,
    marginTop: 4,
  },
  finishStatSubtext: {
    fontSize: 12,
    color: palette.textMuted,
    marginTop: 2,
  },
  finishActions: {
    width: '100%',
    gap: 12,
  },
  finishButton: {
    minHeight: 56,
  },
  finishBackButton: {
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  finishBackButtonText: {
    color: palette.textTertiary,
    fontSize: 16,
  },
  });
}
