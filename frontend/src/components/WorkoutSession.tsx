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
  const [showExerciseDetail, setShowExerciseDetail] = useState<number | null>(null);
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
  const scrollViewRef = useRef<ScrollView>(null);
  const exerciseRefs = useRef<Record<number, View | null>>({});

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((new Date().getTime() - session.startTime.getTime()) / 1000);
      setElapsedTime(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [session.startTime]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
    setExerciseSessions((prev) => {
      const updated = [...prev];
      const wasCompleted = updated[exerciseIndex].completedSets[setIndex].completed;
      updated[exerciseIndex].completedSets[setIndex].completed = !wasCompleted;
      
      // Auto-start rest timer after completing a set (if not last set)
      if (!wasCompleted && setIndex < updated[exerciseIndex].completedSets.length - 1) {
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

  const handleAddSet = (exerciseIndex: number) => {
    setExerciseSessions((prev) => {
      const updated = [...prev];
      const lastSet = updated[exerciseIndex].completedSets[
        updated[exerciseIndex].completedSets.length - 1
      ];
      updated[exerciseIndex].completedSets.push({
        setNumber: updated[exerciseIndex].completedSets.length + 1,
        reps: lastSet.reps,
        weight: lastSet.weight,
        completed: false,
      });
      return updated;
    });
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
  };

  const handlePrimaryAction = () => {
    if (isWorkoutComplete()) {
      handleEndWorkout();
      return;
    }

    if (restTimerActive) {
      if (restTimerPaused) {
        // Resume rest
        setRestTimerPaused(false);
      } else {
        // Skip rest
        handleRestTimerComplete();
      }
    } else {
      const nextSet = getNextIncompleteSet();
      if (!nextSet) {
        // Move to next exercise
        if (currentExerciseIndex < exerciseSessions.length - 1) {
          const nextIndex = currentExerciseIndex + 1;
          setCurrentExerciseIndex(nextIndex);
          setExpandedExerciseIndex(nextIndex);
          onUpdate({
            ...session,
            currentExerciseIndex: nextIndex,
          });
          setTimeout(() => {
            scrollToExercise(nextIndex);
          }, 100);
        } else {
          handleEndWorkout();
        }
      } else {
        // Complete next set
        const currentExercise = getCurrentExercise();
        const setIndex = currentExercise.completedSets.findIndex((set) => !set.completed);
        if (setIndex !== -1) {
          handleSetComplete(currentExerciseIndex, setIndex);
        }
      }
    }
  };

  const getPrimaryActionLabel = () => {
    if (isWorkoutComplete()) {
      return 'Finish Workout';
    }
    if (restTimerActive) {
      return restTimerPaused ? 'Resume Rest' : 'Skip Rest';
    }
    const currentExercise = getCurrentExercise();
    if (!currentExercise) return 'Start Workout';
    
    const completedSetsCount = currentExercise.completedSets.filter((set) => set.completed).length;
    const totalSets = currentExercise.completedSets.length;
    const nextSet = getNextIncompleteSet();
    
    if (!nextSet) {
      return 'Next Exercise';
    }
    return `Complete Set ${completedSetsCount + 1}/${totalSets}`;
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
                : `${formatTime(elapsedTime)} (${Math.floor(elapsedTime / 60)} min)`}
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

      {/* Rest Timer - Compact banner when active, or Start Rest button */}
      {restTimerActive ? (
        <RestBanner
          seconds={restTimerSeconds}
          isPaused={restTimerPaused}
          onPause={() => setRestTimerPaused(true)}
          onResume={() => setRestTimerPaused(false)}
          onSkip={handleRestTimerComplete}
          onAddTime={(additional) => setRestTimerSeconds((prev) => prev + additional)}
        />
      ) : (() => {
        const currentExercise = getCurrentExercise();
        const completedSetsCount = currentExercise?.completedSets.filter((set) => set.completed).length || 0;
        const totalSets = currentExercise?.completedSets.length || 0;
        // Show "Start Rest" if there are completed sets but rest hasn't started
        if (completedSetsCount > 0 && completedSetsCount < totalSets) {
          return (
            <View style={styles.restBanner}>
              <Text style={styles.restBannerText}>Rest recommended</Text>
              <TouchableOpacity
                style={styles.restBannerButton}
                onPress={() => {
                  setRestTimerSeconds(90);
                  setRestTimerActive(true);
                  setRestTimerPaused(false);
                }}
              >
                <Text style={styles.restBannerButtonText}>Start Rest</Text>
              </TouchableOpacity>
            </View>
          );
        }
        return null;
      })()}

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
              onExpand={() => {
                // Auto-collapse others when expanding a new one
                setExpandedExerciseIndex(index);
                if (index !== currentExerciseIndex) {
                  setCurrentExerciseIndex(index);
                  onUpdate({
                    ...session,
                    currentExerciseIndex: index,
                  });
                }
                setTimeout(() => {
                  scrollToExercise(index);
                }, 100);
              }}
              onCollapse={() => {
                // Don't allow collapsing the current exercise
                if (index !== currentExerciseIndex) {
                  setExpandedExerciseIndex(null);
                }
              }}
              onSetComplete={handleSetComplete}
              onSetUpdate={handleSetUpdate}
              onAddSet={handleAddSet}
              onExercisePress={() => setShowExerciseDetail(index)}
              onNotesPress={() => setShowNotesModal(index)}
              onOptionsPress={() => setShowExerciseOptions(index)}
              notes={exerciseNotes[index] || ''}
              navigation={navigation}
              showAdvancedLogging={showAdvancedLogging}
              onToggleAdvancedLogging={() => setShowAdvancedLogging(!showAdvancedLogging)}
              onSkip={handleSkipExercise}
              onReplace={handleReplaceExercise}
            />
          </View>
        ))}
      </ScrollView>

      {/* Primary CTA */}
      <View style={styles.footer}>
        <Button
          title={getPrimaryActionLabel()}
          onPress={handlePrimaryAction}
          style={styles.primaryButton}
        />
      </View>

      {/* Exercise Detail Modal */}
      {showExerciseDetail !== null && (
        <ExerciseDetailModal
          visible={showExerciseDetail !== null}
          exercise={exerciseSessions[showExerciseDetail].exercise}
          onClose={() => setShowExerciseDetail(null)}
          navigation={navigation}
        />
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
        />
      )}

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
    </View>
  );
}

// Exercise Card Component with Progressive Disclosure
function ExerciseCard({
  exerciseSession,
  index,
  isCurrent,
  isExpanded,
  onExpand,
  onCollapse,
  onSetComplete,
  onSetUpdate,
  onAddSet,
  onExercisePress,
  onNotesPress,
  onOptionsPress,
  notes,
  navigation,
  showAdvancedLogging,
  onToggleAdvancedLogging,
  onSkip,
  onReplace,
}: {
  exerciseSession: ExerciseSession;
  index: number;
  isCurrent: boolean;
  isExpanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onSetComplete: (exerciseIndex: number, setIndex: number) => void;
  onSetUpdate: (exerciseIndex: number, setIndex: number, field: 'reps' | 'weight' | 'rpe', value: number) => void;
  onAddSet: (exerciseIndex: number) => void;
  onExercisePress: () => void;
  onNotesPress: () => void;
  onOptionsPress: () => void;
  notes: string;
  navigation?: NativeStackNavigationProp<RootStackParamList>;
  showAdvancedLogging: boolean;
  onToggleAdvancedLogging: () => void;
  onSkip: () => void;
  onReplace: () => void;
}) {
  const exercise = exerciseSession.exercise;
  const completedSets = exerciseSession.completedSets.filter((set) => set.completed);
  const lastWeight = completedSets.length > 0 
    ? completedSets[completedSets.length - 1].weight 
    : exercise.weight;

  // Collapsed view
  if (!isExpanded) {
    return (
      <TouchableOpacity
        style={[styles.exerciseCardCollapsed, isCurrent && styles.exerciseCardCurrent]}
        onPress={onExpand}
        activeOpacity={0.7}
      >
        <View style={styles.exerciseCardCollapsedContent}>
          <View style={styles.exerciseCardCollapsedHeader}>
            <Text style={styles.exerciseCardNameCollapsed}>{exercise.name}</Text>
            {isCurrent && (
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>Active</Text>
              </View>
            )}
          </View>
          <Text style={styles.exerciseCardInfoCollapsed}>
            {exercise.sets}×{exercise.reps}
            {lastWeight ? ` @ ${lastWeight}` : exercise.weight ? ` @ ${exercise.weight}` : ''}
          </Text>
        </View>
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            onOptionsPress();
          }}
          style={styles.optionsButton}
        >
          <Text style={styles.optionsButtonText}>⋯</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  // Expanded view
  return (
    <View style={[styles.exerciseCard, isCurrent && styles.exerciseCardCurrent]}>
      <View style={styles.exerciseCardHeader}>
        <View style={styles.exerciseCardHeaderLeft}>
          <View style={styles.exerciseCardHeaderTitleRow}>
            <Text style={styles.exerciseCardName}>{exercise.name}</Text>
            {isCurrent && (
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>Active</Text>
              </View>
            )}
          </View>
          {exercise.targetMuscles && exercise.targetMuscles.length > 0 && (
            <View style={styles.muscleTags}>
              {exercise.targetMuscles.slice(0, 3).map((muscle, i) => (
                <View key={i} style={styles.muscleTag}>
                  <Text style={styles.muscleTagText}>{muscle}</Text>
                </View>
              ))}
            </View>
          )}
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

      <Text style={styles.exerciseCardInfo}>
        {exercise.sets}×{exercise.reps}
        {exercise.weight ? ` @ ${exercise.weight}` : ''}
      </Text>

      {/* Completed Sets (read-only) */}
      {completedSets.length > 0 && (
        <View style={styles.completedSetsContainer}>
          <Text style={styles.completedSetsLabel}>Completed:</Text>
          <View style={styles.completedSetsList}>
            {completedSets.map((set, i) => (
              <View key={i} style={styles.completedSetBadge}>
                <Text style={styles.completedSetText}>
                  {set.reps}×{set.weight ? set.weight : 'BW'}
                  {showAdvancedLogging && set.rpe && ` • RPE ${set.rpe}`}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Set Tracker */}
      <View style={styles.setTrackerContainer}>
        <Text style={styles.setTrackerLabel}>
          Sets: {completedSets.length}/{exerciseSession.completedSets.length}
        </Text>
        <View style={styles.setTrackerDots}>
          {exerciseSession.completedSets.map((set, setIdx) => (
            <View key={setIdx} style={styles.setTrackerDot}>
              <Text style={[
                styles.setTrackerDotText,
                set.completed && styles.setTrackerDotCompleted
              ]}>
                {set.completed ? '✓' : '○'}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Add Set Button */}
      <TouchableOpacity
        style={styles.addSetButton}
        onPress={() => onAddSet(index)}
      >
        <Text style={styles.addSetButtonText}>+ Add Set</Text>
      </TouchableOpacity>

      {notes && (
        <View style={styles.exerciseNotesPreview}>
          <Text style={styles.exerciseNotesPreviewText}>{notes}</Text>
        </View>
      )}

      {/* Advanced Logging Toggle */}
      <TouchableOpacity
        style={styles.advancedToggle}
        onPress={onToggleAdvancedLogging}
      >
        <Text style={styles.advancedToggleText}>
          {showAdvancedLogging ? '− Hide RPE' : '+ Add RPE'}
        </Text>
      </TouchableOpacity>
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
}: {
  visible: boolean;
  onClose: () => void;
  onSwap: () => void;
  onEditLoad: () => void;
  onSkip: () => void;
  onNotes: () => void;
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
            <TouchableOpacity style={[styles.optionItem, styles.optionItemDestructive]} onPress={onSkip}>
              <Text style={[styles.optionItemText, styles.optionItemDestructiveText]}>Skip Exercise</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Exercise Detail Modal
function ExerciseDetailModal({
  visible,
  exercise,
  onClose,
  navigation,
}: {
  visible: boolean;
  exercise: any;
  onClose: () => void;
  navigation?: NativeStackNavigationProp<RootStackParamList>;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.exerciseDetailModal}>
          <View style={styles.exerciseDetailHeader}>
            <Text style={styles.exerciseDetailTitle}>{exercise.name}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.exerciseDetailContent}>
            {exercise.notes && (
              <View style={styles.exerciseDetailSection}>
                <Text style={styles.exerciseDetailSectionTitle}>Form Cues</Text>
                <Text style={styles.exerciseDetailText}>{exercise.notes}</Text>
              </View>
            )}
            {exercise.exerciseId && navigation && (
              <Button
                title="View Full Details"
                onPress={() => {
                  onClose();
                  navigation.navigate('ExerciseDetail', { exerciseId: exercise.exerciseId });
                }}
                style={styles.exerciseDetailButton}
              />
            )}
          </ScrollView>
        </View>
      </View>
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
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.finishContainer}>
      <Text style={styles.finishTitle}>Workout Complete! 🎉</Text>
      
      <View style={styles.finishStats}>
        <View style={styles.finishStat}>
          <Text style={styles.finishStatValue}>{formatTime(elapsedTime)}</Text>
          <Text style={styles.finishStatLabel}>Total Time ({Math.floor(elapsedTime / 60)} min)</Text>
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
          title="Save Workout"
          onPress={onComplete}
          style={styles.finishButton}
        />
        <Button
          title="View History"
          onPress={onComplete}
          variant="secondary"
          style={styles.finishButton}
        />
        <TouchableOpacity
          style={styles.finishBackButton}
          onPress={onBack}
        >
          <Text style={styles.finishBackButtonText}>← Back to Workout</Text>
        </TouchableOpacity>
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
    height: 10,
    backgroundColor: colors.border,
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 5,
  },
  nextExerciseText: {
    fontSize: 14,
    color: colors.textTertiary,
    marginTop: 4,
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
  },
  exerciseCard: {
    backgroundColor: colors.surface,
    margin: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exerciseCardCurrent: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  exerciseCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
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
    marginBottom: 16,
  },
  completedSetsContainer: {
    marginBottom: 16,
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
    marginBottom: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
  },
  setTrackerLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  setTrackerDots: {
    flexDirection: 'row',
    gap: 8,
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
  exerciseDetailModal: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    width: '100%',
    position: 'absolute',
    bottom: 0,
  },
  exerciseDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  exerciseDetailTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  exerciseDetailContent: {
    padding: 20,
  },
  exerciseDetailSection: {
    marginBottom: 20,
  },
  exerciseDetailSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  exerciseDetailText: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  exerciseDetailButton: {
    marginTop: 20,
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
