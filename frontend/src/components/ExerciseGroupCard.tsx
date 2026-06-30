import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Exercise } from '../services/exerciseService';
import { ExerciseGroup, hasVariations, getVariationNames } from '../utils/exerciseGrouping';
import { useTheme } from '../theme/ThemeContext';
import ExerciseLikeButton from './ExerciseLikeButton';

interface ExerciseGroupCardProps {
  group: ExerciseGroup;
  onPress?: (exercise: Exercise) => void;
  onPressVariation?: (exercise: Exercise) => void;
  /**
   * Opens exercise details from the footer "more information" button. Always available,
   * even in select/add mode where the card body tap is wired to selection instead of
   * navigation — otherwise there is no way to view details while adding to a plan.
   */
  onPressInfo?: (exercise: Exercise) => void;
  /** When true, card shows selected state (e.g. for add-to-plan mode). */
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
  // Only show variations button if there are actual unique variations (different names)
  const hasVars = variationNames.length > 0;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          marginBottom: 12,
          marginHorizontal: 16,
        },
        card: {
          backgroundColor: colors.surface,
          padding: 16,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 3.84,
          elevation: 3,
        },
        header: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 8,
        },
        titleContainer: {
          flex: 1,
          marginRight: 8,
        },
        exerciseName: {
          fontSize: 18,
          fontWeight: '600',
          color: colors.text,
          marginBottom: 4,
        },
        variationsBadge: {
          alignSelf: 'flex-start',
          backgroundColor: colors.primary + '30',
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.primary,
        },
        variationsBadgeText: {
          fontSize: 10,
          fontWeight: '600',
          color: colors.primary,
        },
        difficultyBadge: {
          backgroundColor: colors.primary + '20',
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 8,
        },
        difficultyText: {
          fontSize: 11,
          fontWeight: '600',
          color: colors.primary,
          textTransform: 'capitalize',
        },
        description: {
          fontSize: 14,
          color: colors.textMuted,
          marginBottom: 12,
          lineHeight: 20,
        },
        tagsContainer: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
        },
        tag: {
          backgroundColor: colors.primary + '15',
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.primary + '30',
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
          fontSize: 12,
          fontWeight: '500',
          color: colors.textSecondary,
        },
        moreEquipment: {
          fontSize: 12,
          color: colors.textMuted,
          marginTop: 8,
          fontStyle: 'italic',
        },
        variationsButton: {
          marginTop: 12,
          paddingVertical: 8,
          paddingHorizontal: 12,
          backgroundColor: colors.background,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
        },
        variationsButtonText: {
          fontSize: 13,
          fontWeight: '600',
          color: colors.primary,
        },
        footer: {
          marginTop: 12,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          alignItems: 'flex-end',
        },
        tapHint: {
          fontSize: 12,
          color: colors.primary,
          fontWeight: '500',
        },
        infoButton: {
          paddingTop: 2,
          paddingBottom: 2,
          paddingLeft: 12,
        },
        variationsContainer: {
          marginTop: 8,
          backgroundColor: colors.background,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
        },
        variationItem: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        variationName: {
          fontSize: 14,
          color: colors.textSecondary,
          flex: 1,
        },
        variationArrow: {
          fontSize: 16,
          color: colors.primary,
          marginLeft: 8,
        },
        variationItemLast: {
          borderBottomWidth: 0,
        },
        debugText: {
          fontSize: 12,
          color: colors.textMuted,
          padding: 8,
          fontStyle: 'italic',
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

  const handleVariationPress = (variationName: string) => {
    if (isDisabled) return;
    const variationExercise = group.exercises.find(ex => ex.name === variationName);
    if (variationExercise && onPressVariation) {
      onPressVariation(variationExercise);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.card,
          isSelected && { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primary + '12' },
          isDisabled && { opacity: 0.5 },
        ]}
        onPress={handleCardPress}
        activeOpacity={isDisabled ? 1 : 0.7}
        disabled={isDisabled}
      >
        <View style={styles.header}>
          <View style={styles.titleContainer}>
            <Text style={styles.exerciseName}>{exercise.name}</Text>
            {hasVars && (
              <View style={styles.variationsBadge}>
                <Text style={styles.variationsBadgeText}>
                  {variationNames.length} variant{variationNames.length !== 1 ? 's' : ''}
                </Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {onLikePress != null && (
              <ExerciseLikeButton
                exerciseId={exercise.id}
                saved={saved ?? false}
                onSave={onLikePress}
                onUnsave={onLikePress}
                size={22}
              />
            )}
            {exercise.difficulty && (
              <View style={styles.difficultyBadge}>
                <Text style={styles.difficultyText}>{exercise.difficulty}</Text>
              </View>
            )}
          </View>
        </View>

        {exercise.description && (
          <Text style={styles.description} numberOfLines={2}>
            {exercise.description}
          </Text>
        )}

        <View style={styles.tagsContainer}>
          <View style={styles.tag}>
            <Text style={styles.tagText}>{exercise.primaryMuscleGroup}</Text>
          </View>
          {exercise.subMuscles.length > 0 && (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{exercise.subMuscles[0]}</Text>
            </View>
          )}
          {exercise.equipment.length > 0 && (
            <View style={[styles.tag, styles.equipmentTag]}>
              <Text style={styles.tagText}>{exercise.equipment[0]}</Text>
            </View>
          )}
          {exercise.movementPatterns.length > 0 && (
            <View style={[styles.tag, styles.movementTag]}>
              <Text style={styles.tagText}>{exercise.movementPatterns[0]}</Text>
            </View>
          )}
        </View>

        {exercise.equipment.length > 1 && (
          <Text style={styles.moreEquipment}>
            +{exercise.equipment.length - 1} more equipment
          </Text>
        )}

        {hasVars && (
          <TouchableOpacity
            style={styles.variationsButton}
            onPress={(e) => {
              e.stopPropagation();
              setShowVariations(!showVariations);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.variationsButtonText}>
              {showVariations ? '▼' : '▶'} Show {variationNames.length} variation{variationNames.length !== 1 ? 's' : ''}
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.footer}>
          {isDisabled ? (
            <Text style={[styles.tapHint, { color: colors.textMuted }]}>Already in workout</Text>
          ) : onPressInfo ? (
            <TouchableOpacity
              style={styles.infoButton}
              onPress={(e) => {
                e.stopPropagation();
                onPressInfo(exercise);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 16, right: 8 }}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={`View details for ${exercise.name}`}
            >
              <Text style={styles.tapHint}>Tap for more information →</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.tapHint}>Tap for more information →</Text>
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
                <Text style={styles.variationArrow}>→</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

    </View>
  );
}

export default React.memo(ExerciseGroupCard);
