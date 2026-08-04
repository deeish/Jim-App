import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Exercise } from '../types/workout';
import { useTheme } from '../theme/ThemeContext';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import { leading, radius, spacing, text, weight } from '../theme';
import {
  formatExercisePrescriptionExerciseCard,
  profileGoalToPlanGoal,
} from '../lib/workoutExerciseDisplay';

interface ExerciseCardProps {
  exercise: Exercise;
  index: number;
  /** Tap card (e.g. open exercise library detail). */
  onPress?: () => void;
  /** Remove from parent workout list. */
  onRemove?: () => void;
  /** Hide coaching / notes for a cleaner preview row. */
  showNotes?: boolean;
  /** Show busy state on remove control. */
  removing?: boolean;
  /** Show 1-based order badge (workout preview list). */
  showOrderBadge?: boolean;
}

export default function ExerciseCard({
  exercise,
  index,
  onPress,
  onRemove,
  showNotes = true,
  removing = false,
  showOrderBadge = false,
}: ExerciseCardProps) {
  const { colors } = useTheme();
  const { weightUnit, goal } = useUserPreferences();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          marginBottom: spacing.md,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
        },
        cardTappable: {
          borderColor: colors.primary + '33',
        },
        row: {
          flexDirection: 'row',
          alignItems: 'stretch',
        },
        mainPress: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: spacing.lg,
          paddingLeft: spacing.lg,
          paddingRight: spacing.sm,
          minHeight: 72,
        },
        mainPressPressed: {
          backgroundColor: colors.background + 'CC',
        },
        textBlock: {
          flex: 1,
          minWidth: 0,
        },
        indexPill: {
          width: 28,
          height: 28,
          borderRadius: radius.sm,
          backgroundColor: colors.primary + '22',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: spacing.md,
        },
        indexPillText: {
          fontSize: text.body,
          fontWeight: weight.heavy,
          color: colors.primary,
        },
        exerciseName: { fontSize: text.headline, fontWeight: weight.bold, color: colors.text, marginBottom: spacing.xs },
        prescription: { fontSize: text.body, color: colors.textSecondary, fontWeight: weight.medium },
        hint: {
          fontSize: text.footnote,
          color: colors.textMuted,
          marginTop: spacing.sm,
          fontWeight: weight.medium,
        },
        notes: { fontSize: text.body, color: colors.textTertiary, fontStyle: 'italic', marginTop: spacing.sm, lineHeight: leading.body },
        chevron: { alignSelf: 'center', marginLeft: spacing.xs, opacity: 0.5 },
        removeWrap: {
          justifyContent: 'center',
          paddingRight: spacing.md,
          paddingLeft: spacing.xs,
        },
        removeBtn: {
          width: 40,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.md,
        },
      }),
    [colors]
  );

  const formatPrescription = () =>
    formatExercisePrescriptionExerciseCard(exercise, profileGoalToPlanGoal(goal), weightUnit);

  const body = (
    <>
      {showOrderBadge ? (
        <View style={styles.indexPill}>
          <Text style={styles.indexPillText}>{index + 1}</Text>
        </View>
      ) : null}
      <View style={styles.textBlock}>
        <Text style={styles.exerciseName} numberOfLines={2}>
          {exercise.name}
        </Text>
        <Text style={styles.prescription}>{formatPrescription()}</Text>
        {onPress && (
          <Text style={styles.hint}>Tap for exercise details</Text>
        )}
        {showNotes && exercise.notes ? <Text style={styles.notes}>{exercise.notes}</Text> : null}
      </View>
      {onPress ? (
        <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} style={styles.chevron} />
      ) : null}
    </>
  );

  return (
    <View style={[styles.card, onPress ? styles.cardTappable : null]}>
      <View style={styles.row}>
        {onPress ? (
          <Pressable
            style={({ pressed }) => [styles.mainPress, pressed && styles.mainPressPressed]}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={`${exercise.name}, ${formatPrescription()}. Open exercise details.`}
          >
            {body}
          </Pressable>
        ) : (
          <View style={[styles.mainPress, { paddingRight: spacing.lg }]}>{body}</View>
        )}
        {onRemove ? (
          <View style={styles.removeWrap}>
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={onRemove}
              disabled={removing}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${exercise.name} from workout`}
            >
              {removing ? (
                <ActivityIndicator size="small" color={colors.textMuted} />
              ) : (
                <Ionicons name="trash-outline" size={22} color={colors.textMuted} />
              )}
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </View>
  );
}
