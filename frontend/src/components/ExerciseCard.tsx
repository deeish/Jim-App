import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Exercise } from '../types/workout';
import { useTheme } from '../theme/ThemeContext';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import { formatAtWeightFromLb } from '../lib/weightDisplay';

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
  const { weightUnit } = useUserPreferences();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: colors.surface,
          borderRadius: 14,
          marginBottom: 10,
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
          paddingVertical: 14,
          paddingLeft: 16,
          paddingRight: 8,
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
          borderRadius: 8,
          backgroundColor: colors.primary + '22',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        },
        indexPillText: {
          fontSize: 13,
          fontWeight: '800',
          color: colors.primary,
        },
        exerciseName: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 4 },
        prescription: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
        hint: {
          fontSize: 12,
          color: colors.textMuted,
          marginTop: 6,
          fontWeight: '500',
        },
        notes: { fontSize: 13, color: colors.textTertiary, fontStyle: 'italic', marginTop: 8, lineHeight: 18 },
        chevron: { alignSelf: 'center', marginLeft: 4, opacity: 0.5 },
        removeWrap: {
          justifyContent: 'center',
          paddingRight: 10,
          paddingLeft: 4,
        },
        removeBtn: {
          width: 40,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 10,
        },
      }),
    [colors]
  );

  const formatPrescription = () => {
    const setsReps = `${exercise.sets}×${exercise.reps}`;
    if (exercise.reps === 1 && exercise.weight === 0) return `${exercise.sets}×${exercise.reps}s`;
    if (exercise.weight === 0 || !exercise.weight) return `${setsReps} (BW)`;
    return `${setsReps}${formatAtWeightFromLb(exercise.weight, weightUnit)}`;
  };

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
          <View style={[styles.mainPress, { paddingRight: 16 }]}>{body}</View>
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
