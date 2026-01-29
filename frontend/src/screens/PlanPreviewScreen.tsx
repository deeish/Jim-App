import React, { useState, useMemo, useCallback } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { colors } from '../theme/colors';

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
      } else if (inputs.goal === 'cardio' || inputs.goal === 'endurance') {
        const workoutType = index % 2 === 0 ? 'Interval Run' : 'Long Run';
        workouts.push({
          id: `draft-w${weekNum}-${day}-1`,
          title: workoutType,
          detailLine: index % 2 === 0 ? '6×1 min hard' : 'Zone 2',
          iconColor: '#E67E22',
          durationMinutes: Math.round(inputs.timePerSession.min * weekMultiplier),
          intensity: index === 0 ? 'Hard' : 'Easy',
          type: 'cardio',
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
        // Hybrid or fat loss
        if (index % 3 === 0) {
          workouts.push({
            id: `draft-w${weekNum}-${day}-1`,
            title: 'Upper Body',
            detailLine: '6 exercises • Push focus',
            iconColor: '#C7A46A',
            durationMinutes: Math.round(inputs.timePerSession.min * weekMultiplier),
            intensity: 'Hard',
            type: 'strength',
            changeType: 'new',
            source: 'ai',
            draftId: draftId,
            week: weekNum,
          });
        } else {
          workouts.push({
            id: `draft-w${weekNum}-${day}-1`,
            title: 'Interval Run',
            detailLine: '6×1 min hard',
            iconColor: '#E67E22',
            durationMinutes: Math.round((inputs.timePerSession.min - 10) * weekMultiplier),
            intensity: 'Hard',
            type: 'cardio',
            changeType: 'new',
            source: 'ai',
            draftId: draftId,
            week: weekNum,
          });
        }
        
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

export default function PlanPreviewScreen({ navigation, route }: Props) {
  const { inputs, draftId } = route.params;
  const [applying, setApplying] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [swapModalVisible, setSwapModalVisible] = useState(false);
  const [selectedDayForSwap, setSelectedDayForSwap] = useState<string | null>(null);
  const [moveMode, setMoveMode] = useState<{ workoutId: string; fromDay: string } | null>(null);
  
  // Generate full plan for all weeks
  const [planData, setPlanData] = useState<WeekPlan[]>(() => 
    generateFullPlan(inputs, draftId)
  );
  
  const currentWeek = planData.find(w => w.weekNumber === selectedWeek) || planData[0];
  
  // Calculate summaries for current week
  const weekSummary = useMemo(() => {
    if (!currentWeek) return { sessions: 0, strength: 0, cardio: 0, recovery: 0, hardDays: 0 };
    
    let sessions = 0;
    let strength = 0;
    let cardio = 0;
    let recovery = 0;
    let hardDays = 0;
    
    DAYS_OF_WEEK.forEach(day => {
      const workouts = currentWeek.workouts[day] || [];
      sessions += workouts.length;
      
      workouts.forEach(workout => {
        if (workout.type === 'strength') strength++;
        else if (workout.type === 'cardio') cardio++;
        else if (workout.type === 'recovery') recovery++;
        
        if (workout.intensity === 'Hard') {
          hardDays++;
        }
      });
    });
    
    return { sessions, strength, cardio, recovery, hardDays };
  }, [currentWeek]);
  
  const handleRegenerateWeek = async (weekNum: number) => {
    setRegenerating(`week-${weekNum}`);
    // Simulate regeneration
    setTimeout(() => {
      const newPlan = generateFullPlan(inputs, draftId);
      setPlanData(prev => prev.map(w => 
        w.weekNumber === weekNum ? newPlan[weekNum - 1] : w
      ));
      setRegenerating(null);
    }, 1500);
  };
  
  const handleRegenerateCardioOnly = async () => {
    setRegenerating('cardio');
    // Simulate regenerating only cardio workouts
    setTimeout(() => {
      setPlanData(prev => prev.map(week => ({
        ...week,
        workouts: Object.fromEntries(
          Object.entries(week.workouts).map(([day, workouts]) => [
            day,
            workouts.map(w => 
              w.type === 'cardio' 
                ? { ...w, title: 'New Cardio', detailLine: 'Regenerated', changeType: 'replaced' as const }
                : w
            )
          ])
        )
      })));
      setRegenerating(null);
    }, 1500);
  };
  
  const handleMakeEasier = async () => {
    setRegenerating('easier');
    setTimeout(() => {
      setPlanData(prev => prev.map(week => ({
        ...week,
        workouts: Object.fromEntries(
          Object.entries(week.workouts).map(([day, workouts]) => [
            day,
            workouts.map(w => ({
              ...w,
              intensity: w.intensity === 'Hard' ? 'Medium' : w.intensity === 'Medium' ? 'Easy' : w.intensity,
              changeType: w.intensity !== 'Easy' ? 'replaced' as const : w.changeType,
            }))
          ])
        )
      })));
      setRegenerating(null);
    }, 1500);
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
  
  const handleApply = async () => {
    setApplying(true);
    // In a real app, this would save the draft to the plan
    setTimeout(() => {
      setApplying(false);
      navigation.navigate('Plan');
    }, 1000);
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
          {weekSummary.hardDays > 0 && (
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Hard Days</Text>
              <Text style={[styles.summaryValue, styles.hardDaysWarning]}>
                {weekSummary.hardDays}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Regenerate Controls */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.regenerateControls}>
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
      </ScrollView>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {DAYS_OF_WEEK.map(day => {
          const workouts = currentWeek?.workouts[day] || [];
          const isMoveTarget = moveMode && moveMode.fromDay !== day;
          
          return (
            <View key={day} style={styles.daySection}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayTitle}>{day}</Text>
                <View style={styles.dayActions}>
                  {workouts.length > 0 && (
                    <TouchableOpacity
                      style={styles.dayActionButton}
                      onPress={() => handleSwapWorkout(day)}
                    >
                      <Text style={styles.dayActionText}>Swap</Text>
                    </TouchableOpacity>
                  )}
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

              {workouts.length === 0 ? (
                <View style={styles.emptyDay}>
                  <Text style={styles.emptyDayText}>No workout planned</Text>
                </View>
              ) : (
                <View style={styles.workoutStack}>
                  {workouts.map((workout) => {
                    const badgeStyle = getChangeBadgeStyle(workout.changeType);
                    
                    return (
                      <TouchableOpacity
                        key={workout.id}
                        style={styles.workoutCard}
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
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Swap Workout Modal */}
      <Modal
        visible={swapModalVisible}
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
                onPress={() => {
                  Alert.alert('Swap', 'Workout swapped (mock)');
                  setSwapModalVisible(false);
                }}
              >
                <Text style={styles.modalOptionText}>Replace with Cardio</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalOption}
                onPress={() => {
                  Alert.alert('Swap', 'Workout swapped (mock)');
                  setSwapModalVisible(false);
                }}
              >
                <Text style={styles.modalOptionText}>Replace with Strength</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalOption}
                onPress={() => {
                  Alert.alert('Swap', 'Workout swapped (mock)');
                  setSwapModalVisible(false);
                }}
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
          onPress={() => navigation.goBack()}
          disabled={applying}
        >
          <Text style={styles.secondaryButtonText}>Edit Inputs</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleApply}
          disabled={applying}
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
    color: colors.background,
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
  hardDaysWarning: {
    color: colors.warning,
  },
  regenerateControls: {
    maxHeight: 50,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
    color: colors.background,
  },
  emptyDay: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  emptyDayText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
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
    color: colors.background,
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
    color: colors.background,
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
    color: colors.background,
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
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
    marginBottom: 20,
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
