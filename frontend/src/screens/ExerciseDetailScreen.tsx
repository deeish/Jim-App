import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { getExerciseById, Exercise } from '../services/exerciseService';
import { colors } from '../theme/colors';

type ExerciseDetailScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'ExerciseDetail'>;
type ExerciseDetailScreenRouteProp = RouteProp<RootStackParamList, 'ExerciseDetail'>;

type Props = {
  navigation: ExerciseDetailScreenNavigationProp;
  route: ExerciseDetailScreenRouteProp;
};

export default function ExerciseDetailScreen({ navigation, route }: Props) {
  const { exerciseId } = route.params || {};
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (exerciseId) {
      loadExercise();
    }
  }, [exerciseId]);

  const loadExercise = async () => {
    if (!exerciseId) return;
    try {
      setLoading(true);
      const data = await getExerciseById(exerciseId);
      setExercise(data);
    } catch (error) {
      console.error('Error loading exercise:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!exercise) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Exercise not found</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backButton}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButtonContainer}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Exercise Name */}
        <View style={styles.titleSection}>
          <Text style={styles.exerciseName}>{exercise.name}</Text>
          {exercise.difficulty && (
            <View style={styles.difficultyBadge}>
              <Text style={styles.difficultyText}>{exercise.difficulty}</Text>
            </View>
          )}
        </View>

        {/* Description */}
        {exercise.description && (
          <View style={styles.section}>
            <Text style={styles.description}>{exercise.description}</Text>
          </View>
        )}

        {/* Primary Muscle Group */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Target Muscles</Text>
          <View style={styles.tagsContainer}>
            <View style={[styles.tag, styles.primaryTag]}>
              <Text style={styles.tagText}>{exercise.primaryMuscleGroup}</Text>
            </View>
            {exercise.subMuscles.map((muscle, index) => (
              <View key={index} style={styles.tag}>
                <Text style={styles.tagText}>{muscle}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Secondary Muscles */}
        {exercise.secondaryMuscleGroups.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Secondary Muscles</Text>
            <View style={styles.tagsContainer}>
              {exercise.secondaryMuscleGroups.map((muscle, index) => (
                <View key={index} style={[styles.tag, styles.secondaryTag]}>
                  <Text style={styles.tagText}>{muscle}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Equipment */}
        {exercise.equipment.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Equipment</Text>
            <View style={styles.tagsContainer}>
              {exercise.equipment.map((eq, index) => (
                <View key={index} style={[styles.tag, styles.equipmentTag]}>
                  <Text style={styles.tagText}>{eq}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Movement Patterns */}
        {exercise.movementPatterns.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Movement Pattern</Text>
            <View style={styles.tagsContainer}>
              {exercise.movementPatterns.map((pattern, index) => (
                <View key={index} style={[styles.tag, styles.movementTag]}>
                  <Text style={styles.tagText}>{pattern}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Instructions */}
        {exercise.instructions && exercise.instructions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>How to Perform</Text>
            {exercise.instructions.map((instruction, index) => (
              <View key={index} style={styles.instructionItem}>
                <View style={styles.instructionNumber}>
                  <Text style={styles.instructionNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.instructionText}>{instruction}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Aliases */}
        {exercise.aliases && exercise.aliases.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Also Known As</Text>
            <Text style={styles.aliasesText}>{exercise.aliases.join(', ')}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 18,
    color: colors.textTertiary,
    marginBottom: 20,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backButtonContainer: {
    alignSelf: 'flex-start',
  },
  backButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
  backButton: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  titleSection: {
    padding: 20,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  exerciseName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    flex: 1,
    marginRight: 12,
  },
  difficultyBadge: {
    backgroundColor: colors.primary + '20',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  difficultyText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
    textTransform: 'capitalize',
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  primaryTag: {
    backgroundColor: colors.primary + '25',
    borderColor: colors.primary,
  },
  secondaryTag: {
    backgroundColor: colors.background,
    borderColor: colors.border,
  },
  equipmentTag: {
    backgroundColor: colors.background,
    borderColor: colors.border,
  },
  movementTag: {
    backgroundColor: colors.background,
    borderColor: colors.border,
  },
  tagText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  instructionItem: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  instructionNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  instructionNumberText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  instructionText: {
    flex: 1,
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  aliasesText: {
    fontSize: 15,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
});
