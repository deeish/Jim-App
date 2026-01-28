import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Workout, ExerciseSession, CompletedSet } from '../types/workout';
import Button from './Button';
import { colors } from '../theme/colors';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';

interface WorkoutSessionState {
  workout: Workout;
  currentExerciseIndex: number;
  startTime: Date;
}

interface WorkoutSessionProps {
  session: WorkoutSessionState;
  onComplete: (sessionData: any) => void;
  onUpdate: (session: WorkoutSessionState) => void;
  navigation?: NativeStackNavigationProp<RootStackParamList>;
}

// Compact Rest Banner
function RestBanner({
  seconds,
  isPaused,
  onPause,
  onResume,
  onSkip,
  onAddTime,
}: {
  seconds: number;
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onAddTime: (additional: number) => void;
}) {
  const [timeRemaining, setTimeRemaining] = useState(seconds);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setTimeRemaining(seconds);
  }, [seconds]);

  useEffect(() => {
    if (isPaused || timeRemaining <= 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (timeRemaining <= 0) {
        onSkip();
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          onSkip();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPaused, timeRemaining, onSkip]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const sec = secs % 60;
    return `${mins}:${sec.toString().padStart(2, '0')}`;
  };

  if (isPaused) {
    return (
      <View style={styles.restBanner}>
        <Text style={styles.restBannerText}>Rest paused</Text>
        <TouchableOpacity
          style={styles.restBannerButton}
          onPress={onResume}
        >
          <Text style={styles.restBannerButtonText}>Resume</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.restBanner}>
      <Text style={styles.restBannerText}>Rest {formatTime(timeRemaining)}</Text>
      <View style={styles.restBannerControls}>
        <TouchableOpacity
          style={styles.restBannerButton}
          onPress={onPause}
        >
          <Text style={styles.restBannerButtonText}>Pause</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.restBannerButton}
          onPress={() => onAddTime(15)}
        >
          <Text style={styles.restBannerButtonText}>+15</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.restBannerButton}
          onPress={onSkip}
        >
          <Text style={styles.restBannerButtonText}>Skip</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Full Rest Timer Component (when actively resting)
function RestTimer({
  seconds,
  onComplete,
  onPause,
  onResume,
  onSkip,
  onAddTime,
  isPaused,
}: {
  seconds: number;
  onComplete: () => void;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onAddTime: (additionalSeconds: number) => void;
  isPaused: boolean;
}) {
  const [timeRemaining, setTimeRemaining] = useState(seconds);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setTimeRemaining(seconds);
  }, [seconds]);

  useEffect(() => {
    if (isPaused || timeRemaining <= 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (timeRemaining <= 0) {
        onComplete();
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          onComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPaused, timeRemaining, onComplete]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const sec = secs % 60;
    return `${mins}:${sec.toString().padStart(2, '0')}`;
  };

  if (timeRemaining <= 0) {
    return null;
  }

  return (
    <View style={styles.restTimerContainer}>
      <Text style={styles.restTimerLabel}>Rest</Text>
      <Text style={styles.restTimerTime}>{formatTime(timeRemaining)}</Text>
      <View style={styles.restTimerControls}>
        <TouchableOpacity
          style={styles.restTimerButton}
          onPress={isPaused ? onResume : onPause}
        >
          <Text style={styles.restTimerButtonText}>{isPaused ? '▶' : '⏸'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.restTimerButton}
          onPress={() => onAddTime(15)}
        >
          <Text style={styles.restTimerButtonText}>+15s</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.restTimerButton}
          onPress={() => onAddTime(30)}
        >
          <Text style={styles.restTimerButtonText}>+30s</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.restTimerButton}
          onPress={onSkip}
        >
          <Text style={styles.restTimerButtonText}>Skip</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function WorkoutSession({
  session,
  onComplete,
  onUpdate,
  navigation,
}: WorkoutSessionProps) {
  const [exerciseSessions, setExerciseSessions] = useState<ExerciseSession[]>(() => {
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
  const [showNotesModal, setShowNotesModal] = useState<number | null>(null);
  const [exerciseNotes, setExerciseNotes] = useState<Record<number, string>>({});
  const [overallNotes, setOverallNotes] = useState('');
  const [showOverallNotes, setShowOverallNotes] = useState(false);
  const [restTimerActive, setRestTimerActive] = useState(false);
  const [restTimerSeconds, setRestTimerSeconds] = useState(90);
  const [restTimerPaused, setRestTimerPaused] = useState(false);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(session.currentExerciseIndex);
  const [showFinishScreen, setShowFinishScreen] = useState(false);
  const [expandedExerciseIndex, setExpandedExerciseIndex] = useState<number | null>(currentExerciseIndex);
  const [showAdvancedLogging, setShowAdvancedLogging] = useState(false);
  const [showExerciseOptions, setShowExerciseOptions] = useState<number | null>(null);
  const [showEditPrescriptionModal, setShowEditPrescriptionModal] = useState<number | null>(null);
  const [focusedSetIndex, setFocusedSetIndex] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string } | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const scrollViewRef = useRef<ScrollView>(null);
  const exerciseRefs = useRef<Record<number, View | null>>({});
  const [topSectionHeight, setTopSectionHeight] = useState(0);
  const topSectionRef = useRef<View>(null);

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ msg });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = undefined;
    }, 2000);
  };

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

  const getCompletedExercisesCount = () => {
    return exerciseSessions.filter(
      (es) => es.completedSets.every((set) => set.completed)
    ).length;
  };

  const getTotalCompletedSets = () => {
    return exerciseSessions.reduce(
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
    return exerciseSessions.every((es) =>
      es.completedSets.every((set) => set.completed)
    );
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
        setRestTimerSeconds(90);
        setRestTimerActive(true);
        setRestTimerPaused(false);
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

  const handleSkipExercise = () => {
    if (currentExerciseIndex < exerciseSessions.length - 1) {
      const nextIndex = currentExerciseIndex + 1;
      setCurrentExerciseIndex(nextIndex);
      setExpandedExerciseIndex(nextIndex);
      onUpdate({
        ...session,
        currentExerciseIndex: nextIndex,
      });
      // Auto-scroll to next exercise
      setTimeout(() => {
        scrollToExercise(nextIndex);
      }, 100);
    }
  };

  const handleReplaceExercise = () => {
    if (navigation) {
      navigation.navigate('Search');
    }
  };

  const handleEndWorkout = () => {
    if (isWorkoutComplete()) {
      setShowFinishScreen(true);
    } else {
      setShowEndModal(true);
    }
  };

  const confirmEndWorkout = () => {
    setShowEndModal(false);
    setShowFinishScreen(true);
  };

  const handleFinishComplete = () => {
    const endTime = new Date();
    const totalTime = Math.floor((endTime.getTime() - session.startTime.getTime()) / 1000);
    const totalVolume = exerciseSessions.reduce((total, es) => {
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

  const handleRestTimerComplete = () => {
    setRestTimerActive(false);
    setRestTimerPaused(false);
    setRestTimerSeconds(90);
    // Auto-transition UI back to lifting state (bottom CTA will reappear automatically)
  };

  const handlePrimaryAction = () => {
    if (isWorkoutComplete()) {
      handleEndWorkout();
      return;
    }
    const currentExercise = getCurrentExercise();
    if (!currentExercise) return;
    const firstIncompleteIdx = currentExercise.completedSets.findIndex((s) => !s.completed);
    const effectiveSetIdx = focusedSetIndex ?? firstIncompleteIdx;
    const targetSet = effectiveSetIdx >= 0 ? currentExercise.completedSets[effectiveSetIdx] : null;
    const currentDone = !targetSet || targetSet.completed;
    if (currentDone) {
      if (currentExerciseIndex < exerciseSessions.length - 1) {
        setFocusedSetIndex(null);
        const nextIndex = currentExerciseIndex + 1;
        setCurrentExerciseIndex(nextIndex);
        setExpandedExerciseIndex(nextIndex);
        onUpdate({ ...session, currentExerciseIndex: nextIndex });
        setTimeout(() => scrollToExercise(nextIndex), 100);
      } else {
        handleEndWorkout();
      }
    } else {
      handleSetComplete(currentExerciseIndex, effectiveSetIdx);
    }
  };

  const getPrimaryActionLabel = () => {
    if (isWorkoutComplete()) {
      return 'Finish Workout';
    }
    if (restTimerActive) {
      return null;
    }
    const currentExercise = getCurrentExercise();
    if (!currentExercise) return 'Start Workout';
    const totalSets = currentExercise.completedSets.length;
    const firstIncompleteIdx = currentExercise.completedSets.findIndex((s) => !s.completed);
    const effectiveSetIdx = focusedSetIndex ?? firstIncompleteIdx;
    const nextSet = effectiveSetIdx >= 0 ? currentExercise.completedSets[effectiveSetIdx] : null;
    if (!nextSet || nextSet.completed) {
      // Current exercise fully completed — show "Start [NextExerciseName]" when there is a next exercise
      if (currentExerciseIndex < exerciseSessions.length - 1) {
        const nextExercise = exerciseSessions[currentExerciseIndex + 1].exercise;
        return `Start ${nextExercise.name}`;
      }
      return 'Finish Workout';
    }
    return `Complete Set ${effectiveSetIdx + 1}/${totalSets}`;
  };

  const currentExerciseSession = exerciseSessions[currentExerciseIndex];
  const completedExercises = getCompletedExercisesCount();
  const totalExercises = exerciseSessions.length;
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
      {/* Header and Progress Section - measured for rest banner positioning */}
      <View 
        ref={topSectionRef}
        onLayout={(event) => {
          const { height } = event.nativeEvent.layout;
          setTopSectionHeight(height);
        }}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              <Text style={styles.workoutName}>{session.workout.name}</Text>
              <Text style={styles.workoutDate}>
                {session.workout.day || new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </Text>
            </View>
            <View style={styles.headerRight}>
              <Text style={styles.duration}>
                {session.workout.estimatedDuration
                  ? `Est. ${session.workout.estimatedDuration} min`
                  : `Elapsed ${formatTime(elapsedTime)}`}
              </Text>
              {session.workout.focus && (
                <Text style={styles.focus}>{session.workout.focus}</Text>
              )}
              <TouchableOpacity
                style={styles.headerMenuButton}
                onPress={handleEndWorkout}
              >
                <Text style={styles.headerMenuButtonText}>⋯</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Session Progress */}
        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressText}>
              {completedExercises} / {totalExercises} exercises completed
            </Text>
            {(() => {
              const currentExercise = getCurrentExercise();
              const isCurrentExerciseComplete = currentExercise?.completedSets.every((set) => set.completed);
              // Only show next exercise if current exercise is complete
              if (isCurrentExerciseComplete && currentExerciseIndex < exerciseSessions.length - 1) {
                return (
                  <Text style={styles.nextExerciseText}>
                    Next exercise: {exerciseSessions[currentExerciseIndex + 1].exercise.name}
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

      {/* Rest Timer - Overlay banner (doesn't take layout space) */}
      {restTimerActive && (
        <View style={[styles.restBannerOverlay, { top: topSectionHeight }]}>
          <RestBanner
            seconds={restTimerSeconds}
            isPaused={restTimerPaused}
            onPause={() => setRestTimerPaused(true)}
            onResume={() => setRestTimerPaused(false)}
            onSkip={handleRestTimerComplete}
            onAddTime={(additional) => setRestTimerSeconds((prev) => prev + additional)}
          />
        </View>
      )}

      {/* Exercise List */}
      <ScrollView 
        ref={scrollViewRef}
        style={styles.content} 
        showsVerticalScrollIndicator={false}
      >
        {exerciseSessions.map((exerciseSession, index) => (
          <View
            key={index}
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
              restTimerActive={restTimerActive}
              onNotesPress={() => setShowNotesModal(index)}
              onOptionsPress={() => setShowExerciseOptions(index)}
              notes={exerciseNotes[index] || ''}
              navigation={navigation}
              showAdvancedLogging={showAdvancedLogging}
              onToggleAdvancedLogging={() => setShowAdvancedLogging(!showAdvancedLogging)}
              onSkip={handleSkipExercise}
              onReplace={handleReplaceExercise}
              exercise={exerciseSession.exercise}
              onEditPrescription={() => setShowEditPrescriptionModal(index)}
              focusedSetIndex={index === currentExerciseIndex ? focusedSetIndex : null}
              onFocusSet={(setIdx) => setFocusedSetIndex(setIdx)}
            />
          </View>
        ))}
      </ScrollView>

      {/* Primary CTA - Hidden during rest */}
      {!restTimerActive && (
        <View style={styles.footer}>
          <Button
            title={getPrimaryActionLabel() || 'Continue'}
            onPress={handlePrimaryAction}
            style={styles.primaryButton}
          />
        </View>
      )}

      {/* Exercise Options Modal */}
      {showExerciseOptions !== null && (
        <ExerciseOptionsModal
          visible={showExerciseOptions !== null}
          onClose={() => setShowExerciseOptions(null)}
          onSwap={() => {
            setShowExerciseOptions(null);
            handleReplaceExercise();
          }}
          onEditLoad={() => {
            setShowExerciseOptions(null);
            Alert.alert('Edit Load', 'Feature coming soon');
          }}
          onSkip={() => {
            setShowExerciseOptions(null);
            handleSkipExercise();
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
              Are you sure you want to end this workout? Your progress will be saved.
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
  restTimerActive = false,
  onNotesPress,
  onOptionsPress,
  notes,
  navigation,
  showAdvancedLogging,
  onToggleAdvancedLogging,
  onSkip,
  onReplace,
  exercise,
  onEditPrescription,
  focusedSetIndex,
  onFocusSet,
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
  restTimerActive?: boolean;
  onNotesPress: () => void;
  onOptionsPress: () => void;
  notes: string;
  navigation?: NativeStackNavigationProp<RootStackParamList>;
  showAdvancedLogging: boolean;
  onToggleAdvancedLogging: () => void;
  onSkip: () => void;
  onReplace: () => void;
  exercise: any;
  onEditPrescription: () => void;
  focusedSetIndex: number | null;
  onFocusSet: (setIndex: number) => void;
}) {
  const [showHistoryExpanded, setShowHistoryExpanded] = useState(false);
  const [weightStep, setWeightStep] = useState(5);
  const [editingReps, setEditingReps] = useState(false);
  const [editingWeight, setEditingWeight] = useState(false);
  const [editRepsValue, setEditRepsValue] = useState('');
  const [editWeightValue, setEditWeightValue] = useState('');
  const repeatRef = useRef<{ timeout?: ReturnType<typeof setTimeout>; interval?: ReturnType<typeof setInterval> }>({});
  const exerciseData = exercise || exerciseSession.exercise;
  const firstIncompleteIdx = exerciseSession.completedSets.findIndex((s) => !s.completed);
  const nextSetIdx = focusedSetIndex ?? firstIncompleteIdx;
  useEffect(() => {
    setEditingReps(false);
    setEditingWeight(false);
  }, [nextSetIdx]);
  const completedSets = exerciseSession.completedSets.filter((set) => set.completed);
  const lastWeight = completedSets.length > 0 
    ? completedSets[completedSets.length - 1].weight 
    : exerciseData.weight;

  // Collapsed view: title + prescription + set pills. Not clickable; expansion follows current exercise.
  if (!isExpanded) {
    return (
      <View style={[styles.exerciseCardCollapsed, isCurrent && styles.exerciseCardCurrent]}>
        <View style={styles.exerciseCardCollapsedContent}>
          <View style={styles.exerciseCardCollapsedHeader}>
            <Text style={styles.exerciseCardNameCollapsed}>{exerciseData.name}</Text>
            {isCurrent && (
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>Active</Text>
              </View>
            )}
          </View>
          <Text style={styles.exerciseCardInfoCollapsed}>
            {exerciseSession.completedSets.length}×{exerciseData.reps}
            {exerciseData.weight === 0 || (!exerciseData.weight && !lastWeight) ? ' (BW)' : (lastWeight || exerciseData.weight) ? ` @ ${lastWeight || exerciseData.weight}` : ''}
          </Text>
          <View style={styles.exerciseCardCollapsedPills}>
            {exerciseSession.completedSets.map((set, setIdx) => (
              <View
                key={setIdx}
                style={[
                  styles.setTrackerPillCollapsed,
                  set.completed && styles.setTrackerPillCompleted,
                ]}
              >
                <Text
                  style={[
                    styles.setTrackerPillText,
                    set.completed && styles.setTrackerPillTextCompleted,
                  ]}
                >
                  {set.completed ? '✓' : setIdx + 1}
                </Text>
              </View>
            ))}
          </View>
        </View>
        <TouchableOpacity onPress={onOptionsPress} style={styles.optionsButton}>
          <Text style={styles.optionsButtonText}>⋯</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Expanded view — Row 1: title+ACTIVE, Row 2: Plan (tappable) + Last, Row 3: pills + Set N/total, Row 4: Reps/Weight steppers, compact log
  const nextSet = nextSetIdx >= 0 ? exerciseSession.completedSets[nextSetIdx] : null;
  const completedCount = exerciseSession.completedSets.filter((s) => s.completed).length;
  const totalSets = exerciseSession.completedSets.length;
  const lastCompleted = completedCount > 0 ? exerciseSession.completedSets[completedCount - 1] : null;
  const planLabel = `Plan: ${exerciseData.sets}×${exerciseData.reps}${exerciseData.weight != null && exerciseData.weight !== 0 ? ` @ ${exerciseData.weight}` : exerciseData.weight === 0 ? ' (BW)' : ''}`;

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

      {/* Row 2: Plan (tappable) + optional "Last: 7 @ 215" */}
      <View style={[styles.prescriptionRow, isCurrent && styles.prescriptionRowTappable]}>
        {isCurrent ? (
          <TouchableOpacity
            style={styles.prescriptionRowTouchable}
            onPress={onEditPrescription}
            activeOpacity={0.6}
          >
            <Text style={styles.exerciseCardInfo}>{planLabel}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.exerciseCardInfo}>{planLabel}</Text>
        )}
      </View>
      {lastCompleted != null && (
        <Text style={styles.lastSetLine}>
          Last set today: {lastCompleted.reps}×{lastCompleted.weight != null && lastCompleted.weight > 0 ? lastCompleted.weight : 'BW'}
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
                    set.completed && styles.setTrackerPillTextCompleted,
                    isFocused && !set.completed && styles.setTrackerPillTextFocused,
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
            Set {nextSetIdx >= 0 ? nextSetIdx + 1 : totalSets}/{totalSets}
          </Text>
          {isCurrent && (
            <>
              <TouchableOpacity
                style={[styles.setPillControl, (totalSets <= 1 || restTimerActive) && styles.setPillControlDisabled]}
                onPress={() => onRemoveSet(index)}
                disabled={totalSets <= 1 || restTimerActive}
                activeOpacity={0.7}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={[styles.setPillControlText, (totalSets <= 1 || restTimerActive) && styles.setPillControlTextDisabled]}>−</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.setPillControl, restTimerActive && styles.setPillControlDisabled]}
                onPress={() => onAddSet(index)}
                disabled={restTimerActive}
                activeOpacity={0.7}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={[styles.setPillControlText, restTimerActive && styles.setPillControlTextDisabled]}>+</Text>
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
              <Text style={styles.stepperLabel}>Weight</Text>
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
                      const n = s === '' || s.toLowerCase() === 'bw' ? 0 : parseFloat(s);
                      if (!isNaN(n) && n >= 0) onSetUpdate(index, nextSetIdx, 'weight', n);
                      setEditingWeight(false);
                    }}
                  />
                ) : (
                  <TouchableOpacity
                    style={styles.stepperValueTouch}
                    onPress={() => {
                      setEditWeightValue(nextSet.weight != null ? String(nextSet.weight) : '');
                      setEditingWeight(true);
                    }}
                  >
                    <Text style={styles.stepperValue}>
                      {nextSet.weight != null && nextSet.weight > 0 ? nextSet.weight : 'BW'}
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
                    <Text style={[styles.weightStepChipText, weightStep === step && styles.weightStepChipTextActive]}>
                      {step}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        );
      })()}

      {/* "View sets" / chevron — history hidden by default */}
      {totalSets > 0 && (
        <TouchableOpacity
          style={styles.viewSetsRow}
          onPress={() => setShowHistoryExpanded((v) => !v)}
          activeOpacity={0.7}
        >
          <Text style={styles.viewSetsLabel}>
            {showHistoryExpanded ? 'Hide sets' : 'View sets'}
          </Text>
          <Text style={styles.viewSetsChevron}>{showHistoryExpanded ? ' ⌃' : ' ›'}</Text>
        </TouchableOpacity>
      )}
      {totalSets > 0 && showHistoryExpanded && (
        <View style={styles.compactLogRow}>
          {exerciseSession.completedSets.map((set, setIdx) => (
            <View key={setIdx} style={styles.setHistoryChip}>
              <Text style={styles.setHistoryChipText}>
                {setIdx + 1}: {set.completed ? `${set.reps}×${set.weight != null && set.weight > 0 ? set.weight : 'BW'}` : '—'}
              </Text>
            </View>
          ))}
        </View>
      )}

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
  const [isEditing, setIsEditing] = useState(false);
  const [reps, setReps] = useState(set.reps.toString());
  const [weight, setWeight] = useState(set.weight?.toString() || '');
  const [rpe, setRpe] = useState(set.rpe?.toString() || '');

  if (set.completed) {
    return null; // Completed sets shown in read-only section
  }

  if (!isEditing) {
    return (
      <TouchableOpacity
        style={styles.setRowReadOnly}
        onPress={() => setIsEditing(true)}
      >
        <Text style={styles.setRowReadOnlyText}>
          {set.reps} reps
          {set.weight ? ` @ ${set.weight}` : ''}
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
          const num = parseFloat(text) || 0;
          onUpdate(exerciseIndex, setIndex, 'weight', num);
        }}
        keyboardType="decimal-pad"
        placeholder={set.weight ? `${set.weight}` : 'Weight'}
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
  onSwap,
  onEditLoad,
  onSkip,
  onNotes,
  onAddSet,
  onToggleAdvancedLogging,
  showAdvancedLogging,
}: {
  visible: boolean;
  onClose: () => void;
  onSwap: () => void;
  onEditLoad: () => void;
  onSkip: () => void;
  onNotes: () => void;
  onAddSet: () => void;
  onToggleAdvancedLogging: () => void;
  showAdvancedLogging: boolean;
}) {
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
            <TouchableOpacity style={styles.optionItem} onPress={onNotes}>
              <Text style={styles.optionItemText}>Notes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.optionItem} onPress={onEditLoad}>
              <Text style={styles.optionItemText}>Edit Load</Text>
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
              <Text style={[styles.optionItemText, styles.optionItemDestructiveText]}>Skip Exercise</Text>
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
  const [weight, setWeight] = useState(initialWeight);
  const [reps, setReps] = useState(initialReps);
  const [rpe, setRpe] = useState<number | undefined>(initialRpe);
  const [applyToRemaining, setApplyToRemaining] = useState(false);

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
                <Text style={styles.editPrescriptionLabel}>Weight (lbs)</Text>
                <View style={styles.editModalStepperRow}>
                  <TouchableOpacity
                    style={styles.stepperButton}
                    onPress={() => setWeight((w) => Math.max(0, w - 5))}
                  >
                    <Text style={styles.stepperButtonText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.editModalStepperValue}>{weight}</Text>
                  <TouchableOpacity
                    style={styles.stepperButton}
                    onPress={() => setWeight((w) => w + 5)}
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
  const [isSaved, setIsSaved] = useState(false);
  
  const totalSets = exerciseSessions.reduce(
    (total, es) => total + es.completedSets.filter((set) => set.completed).length,
    0
  );
  const totalVolume = exerciseSessions.reduce((total, es) => {
    return (
      total +
      es.completedSets
        .filter((set) => set.completed && set.weight) // Exclude bodyweight exercises
        .reduce((vol, set) => vol + (set.reps || 0) * (set.weight || 0), 0)
    );
  }, 0);

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
        <View style={styles.finishStat}>
          <Text style={styles.finishStatValue}>{totalVolume.toLocaleString()}</Text>
          <Text style={styles.finishStatLabel}>Total Volume (lbs)</Text>
          <Text style={styles.finishStatSubtext}>Excludes bodyweight</Text>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.surface,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  workoutName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  workoutDate: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  duration: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
  focus: {
    fontSize: 14,
    color: colors.textTertiary,
  },
  headerMenuButton: {
    padding: 8,
  },
  headerMenuButtonText: {
    fontSize: 24,
    color: colors.textTertiary,
  },
  progressSection: {
    backgroundColor: colors.surface,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  progressHeader: {
    marginBottom: 8,
  },
  progressText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  progressBar: {
    height: 12,
    backgroundColor: colors.border,
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 6,
  },
  nextExerciseText: {
    fontSize: 14,
    color: colors.textTertiary,
    marginTop: 4,
  },
  restBannerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  restBanner: {
    backgroundColor: colors.primary + '20',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  restBannerText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  restBannerControls: {
    flexDirection: 'row',
    gap: 8,
  },
  restBannerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  restBannerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  restTimerWidgetContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'flex-end',
  },
  restTimerWidget: {
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  restTimerWidgetText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  restTimerContainer: {
    backgroundColor: colors.primary + '20',
    padding: 16,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  restTimerLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  restTimerTime: {
    fontSize: 48,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 12,
  },
  restTimerControls: {
    flexDirection: 'row',
    gap: 8,
  },
  restTimerButton: {
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  restTimerButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  exerciseCardCollapsed: {
    backgroundColor: colors.surface,
    margin: 12,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exerciseCardCollapsedContent: {
    flex: 1,
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
    color: colors.text,
  },
  activeBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  exerciseCardInfoCollapsed: {
    fontSize: 14,
    color: colors.textSecondary,
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
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  exerciseCard: {
    backgroundColor: colors.surface,
    margin: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exerciseCardCurrent: {
    borderColor: colors.primary + '99',
    borderWidth: 1,
  },
  exerciseCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  exerciseCardHeaderCurrent: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary + '99',
    marginLeft: -12,
    paddingLeft: 12,
    marginBottom: 8,
  },
  exerciseCardHeaderLeft: {
    flex: 1,
  },
  exerciseCardHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  exerciseCardHeaderRight: {
    flexDirection: 'row',
    gap: 8,
  },
  exerciseCardName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  muscleTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  muscleTag: {
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  muscleTagText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '500',
  },
  optionsButton: {
    padding: 4,
  },
  optionsButtonText: {
    fontSize: 20,
    color: colors.textTertiary,
  },
  collapseButton: {
    padding: 4,
  },
  collapseButtonText: {
    fontSize: 24,
    color: colors.textTertiary,
  },
  exerciseCardInfo: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  prescriptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  prescriptionRowTappable: {
    marginHorizontal: -4,
    marginLeft: -4,
  },
  prescriptionRowTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingVertical: 8,
    paddingRight: 8,
  },
  prescriptionEditHint: {
    fontSize: 12,
    color: colors.textTertiary,
    marginLeft: 8,
  },
  editPrescriptionText: {
    fontSize: 16,
    color: colors.primary,
    marginLeft: 4,
  },
  completedSetsContainer: {
    marginBottom: 12,
    marginTop: 8,
  },
  completedSetsLabel: {
    fontSize: 14,
    color: colors.textTertiary,
    marginBottom: 8,
  },
  completedSetsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  completedSetBadge: {
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  completedSetText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  setTrackerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingVertical: 4,
  },
  setProgressLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  lastSetLine: {
    fontSize: 12,
    color: colors.textTertiary,
    marginBottom: 8,
  },
  loggingControlsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  stepperBlock: {
    flex: 1,
  },
  stepperLabel: {
    fontSize: 12,
    color: colors.textTertiary,
    marginBottom: 4,
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
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  stepperValue: {
    minWidth: 44,
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
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
    color: colors.text,
    textAlign: 'center',
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  weightStepRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  weightStepChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  weightStepChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '20',
  },
  weightStepChipText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  weightStepChipTextActive: {
    color: colors.primary,
  },
  viewSetsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    marginBottom: 4,
  },
  viewSetsLabel: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
  },
  viewSetsChevron: {
    fontSize: 13,
    color: colors.primary,
    marginLeft: 4,
  },
  compactLogRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  setHistoryChip: {
    backgroundColor: colors.background,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  setHistoryChipText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  compactLogItem: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  setTrackerPillFocused: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  setTrackerPillFuture: {
    borderColor: colors.border,
    backgroundColor: 'transparent',
    opacity: 0.7,
  },
  setTrackerPillTextFocused: {
    color: colors.primary,
  },
  setTrackerPillTextFuture: {
    color: colors.textTertiary,
  },
  setTrackerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  setPillControl: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.text,
  },
  setPillControlTextDisabled: {
    color: colors.textTertiary,
  },
  setTrackerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
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
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  setTrackerPillCompleted: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  setTrackerPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  setTrackerPillTextCompleted: {
    color: '#FFFFFF',
  },
  setTrackerDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  setTrackerDotText: {
    fontSize: 16,
    color: colors.textTertiary,
  },
  setTrackerDotCompleted: {
    color: colors.primary,
    fontWeight: 'bold',
  },
  currentSetContainer: {
    marginBottom: 12,
  },
  currentSetLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  setsContainer: {
    marginBottom: 12,
  },
  setRowReadOnly: {
    padding: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  setRowReadOnlyText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
    marginBottom: 4,
  },
  setRowEditHint: {
    fontSize: 12,
    color: colors.textTertiary,
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
    backgroundColor: colors.primary,
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
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  setCheckboxCompleted: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
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
    color: colors.textSecondary,
  },
  setInput: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 16,
  },
  setInputRpe: {
    flex: 0.5,
  },
  addSetButton: {
    padding: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 8,
  },
  addSetButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  exerciseNotesPreview: {
    marginTop: 8,
    padding: 8,
    backgroundColor: colors.background,
    borderRadius: 8,
  },
  exerciseNotesPreviewText: {
    fontSize: 14,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  advancedToggle: {
    marginTop: 12,
    padding: 8,
    alignItems: 'center',
  },
  advancedToggleText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    padding: 16,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
    backgroundColor: colors.text,
    color: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    fontSize: 14,
    fontWeight: '500',
    overflow: 'hidden',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 24,
    width: '80%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  modalText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  modalSubtext: {
    fontSize: 14,
    color: colors.textTertiary,
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
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalButtonConfirm: {
    backgroundColor: colors.error,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  modalButtonConfirmText: {
    color: '#FFFFFF',
  },
  modalCloseText: {
    fontSize: 24,
    color: colors.textTertiary,
  },
  optionsModal: {
    backgroundColor: colors.surface,
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
    borderBottomColor: colors.border,
  },
  optionsModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  optionsList: {
    padding: 8,
  },
  optionDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8,
    marginHorizontal: 8,
  },
  optionItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionItemText: {
    fontSize: 16,
    color: colors.text,
  },
  optionItemDestructive: {
    borderBottomWidth: 0,
  },
  optionItemDestructiveText: {
    color: colors.error,
  },
  editPrescriptionOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  editPrescriptionModalContainer: {
    width: '100%',
  },
  editPrescriptionModal: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    width: '100%',
    paddingBottom: 24,
  },
  editPrescriptionModalHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
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
    color: colors.text,
    marginBottom: 2,
  },
  editPrescriptionModalSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
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
    color: colors.textSecondary,
    marginBottom: 8,
  },
  editPrescriptionInput: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
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
    color: colors.text,
    textAlign: 'center',
  },
  editPrescriptionToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 8,
  },
  editPrescriptionToggleLabel: {
    fontSize: 16,
    color: colors.text,
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
    backgroundColor: colors.surface,
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
    borderBottomColor: colors.border,
  },
  notesModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  notesInput: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 16,
    margin: 20,
    color: colors.text,
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  finishTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
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
    color: colors.primary,
    marginBottom: 8,
  },
  finishStatLabel: {
    fontSize: 14,
    color: colors.textTertiary,
    marginTop: 4,
  },
  finishStatSubtext: {
    fontSize: 12,
    color: colors.textMuted,
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
    color: colors.textTertiary,
    fontSize: 16,
  },
});
