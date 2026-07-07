import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Exercise } from '../services/exerciseService';
import { ExerciseGroup, getVariationNames } from '../utils/exerciseGrouping';
import { useTheme } from '../theme/ThemeContext';
import MuscleBodyTile from './MuscleBodyTile';
import ExerciseLikeButton from './ExerciseLikeButton';

interface ExerciseGroupCardProps {
  group: ExerciseGroup;
  onPress?: (exercise: Exercise) => void;
  onPressVariation?: (exercise: Exercise) => void;
  /**
   * Opens exercise details. In select/add mode the row body tap is wired to
   * selection instead of navigation, so the row shows a dedicated info button —
   * otherwise there would be no way to view details while adding to a plan.
   */
  onPressInfo?: (exercise: Exercise) => void;
  /** Defined only in select/add mode; true when any exercise in the group is selected. */
  isSelected?: boolean;
  /** When true, card is greyed out and not tappable (e.g. already in workout). */
  isDisabled?: boolean;
  /** Whether this exercise is saved/liked. When set with onLikePress, shows heart button. */
  saved?: boolean;
  onLikePress?: () => void;
}

function ExerciseGroupCard({ group, onPress, onPressVariation, onPressInfo, isSelected, isDisabled, saved, onLikePress }: ExerciseGroupCardProps) {
  const { colors } = useTheme();
  const [showVariations, setShowVariations] = useState(false);
  const exercise = group.primaryExercise;
  const variationNames = getVariationNames(group);
  // Only show variations toggle if there are actual unique variations (different names)
  const hasVars = variationNames.length > 0;
  // isSelected is only passed while adding to a plan/workout; its presence switches
  // the trailing affordance from a navigation chevron to a selection checkmark.
  const selectMode = isSelected !== undefined;

  const difficulty = exercise.difficulty
    ? exercise.difficulty.charAt(0).toUpperCase() + exercise.difficulty.slice(1)
    : undefined;
  const subtitle = isDisabled
    ? 'Already in workout'
    : [exercise.primaryMuscleGroup, exercise.equipment[0], difficulty]
        .filter(Boolean)
        .join(' · ');

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          marginBottom: 8,
          marginHorizontal: 16,
        },
        card: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
        },
        muscleDisc: {
          marginRight: 11,
        },
        titleCol: {
          flex: 1,
          marginRight: 8,
        },
        exerciseName: {
          fontSize: 16,
          fontWeight: '600',
          color: colors.text,
        },
        subtitle: {
          fontSize: 13,
          color: colors.textMuted,
          marginTop: 2,
        },
        variationsToggle: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 3,
          marginTop: 6,
          alignSelf: 'flex-start',
        },
        variationsToggleText: {
          fontSize: 12,
          fontWeight: '600',
          color: colors.primary,
        },
        rowRight: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
        },
        iconButton: {
          padding: 4,
        },
        variationsContainer: {
          marginTop: 4,
          marginLeft: 12,
          backgroundColor: colors.surface,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
        },
        variationItem: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        variationItemLast: {
          borderBottomWidth: 0,
        },
        variationName: {
          fontSize: 14,
          color: colors.textSecondary,
          flex: 1,
        },
        variationArrow: {
          marginLeft: 8,
        },
      }),
    [colors]
  );

  const handleCardPress = () => {
    if (isDisabled) return;
    if (onPress) {
      onPress(exercise);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.card,
          isSelected && { borderColor: colors.primary, backgroundColor: colors.primary + '12' },
          isDisabled && { opacity: 0.5 },
        ]}
        onPress={handleCardPress}
        activeOpacity={isDisabled ? 1 : 0.7}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={exercise.name}
        accessibilityState={{ selected: !!isSelected, disabled: !!isDisabled }}
      >
        {/* Mini body map: the exercise's target muscles lit on a silhouette —
            a leg curl reads hamstrings, a calf raise reads calves, before you
            read a word. */}
        <MuscleBodyTile exercise={exercise} size={44} style={styles.muscleDisc} />
        <View style={styles.titleCol}>
          <Text style={styles.exerciseName} numberOfLines={1}>
            {exercise.name}
          </Text>
          {!!subtitle && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
          {hasVars && (
            <TouchableOpacity
              style={styles.variationsToggle}
              onPress={(e) => {
                e.stopPropagation();
                setShowVariations(!showVariations);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 16 }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${showVariations ? 'Hide' : 'Show'} ${variationNames.length} variants of ${exercise.name}`}
            >
              <Ionicons
                name={showVariations ? 'chevron-down' : 'chevron-forward'}
                size={12}
                color={colors.primary}
              />
              <Text style={styles.variationsToggleText}>
                {variationNames.length} variant{variationNames.length !== 1 ? 's' : ''}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.rowRight}>
          {onLikePress != null && (
            <ExerciseLikeButton
              exerciseId={exercise.id}
              saved={saved ?? false}
              onSave={onLikePress}
              onUnsave={onLikePress}
              size={20}
            />
          )}
          {selectMode ? (
            <>
              {onPressInfo && !isDisabled && (
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    onPressInfo(exercise);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel={`View details for ${exercise.name}`}
                >
                  <Ionicons name="information-circle-outline" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              )}
              {!isDisabled && (
                <Ionicons
                  name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={isSelected ? colors.primary : colors.textMuted}
                />
              )}
            </>
          ) : (
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          )}
        </View>
      </TouchableOpacity>

      {/* Variations List */}
      {hasVars && showVariations && variationNames.length > 0 && (
        <View style={styles.variationsContainer}>
          {variationNames.map((variationName, index) => {
            // Find the first exercise with this name (in case of duplicates in dataset)
            const variationExercise = group.exercises.find(ex =>
              ex.name.trim().toLowerCase() === variationName.trim().toLowerCase() &&
              ex.id !== group.primaryExercise.id
            );
            return (
              <TouchableOpacity
                key={`${variationName}-${index}`}
                style={[
                  styles.variationItem,
                  index === variationNames.length - 1 && styles.variationItemLast
                ]}
                onPress={() => {
                  if (isDisabled) return;
                  if (variationExercise && onPressVariation) {
                    onPressVariation(variationExercise);
                  } else {
                    // Fallback: find any exercise with this name
                    const fallbackExercise = group.exercises.find(ex =>
                      ex.name.trim().toLowerCase() === variationName.trim().toLowerCase()
                    );
                    if (fallbackExercise && onPressVariation) {
                      onPressVariation(fallbackExercise);
                    }
                  }
                }}
                activeOpacity={isDisabled ? 1 : 0.7}
                disabled={isDisabled}
              >
                <Text style={styles.variationName}>{variationName}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.primary} style={styles.variationArrow} />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

    </View>
  );
}

export default React.memo(ExerciseGroupCard);
