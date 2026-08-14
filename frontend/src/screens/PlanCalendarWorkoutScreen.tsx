import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  elevation,
  radius,
  spacing,
  text,
  tracking,
  useTheme,
  weight,
  type ColorPalette,
} from '../theme';
import { useTabBarInset } from '../navigation/useTabBarInset';
import {
  GOLD,
  MUSCLE_COLORS,
  MUSCLE_EDGE,
  MUSCLE_INK,
  buzzAllSetsComplete,
  buzzSetComplete,
  fromIso,
  sfPro,
  shortDate,
  type PlanCalendarParamList,
  type PlannedExercise,
} from '../lib/planCalendarPrototype';
import {
  getSetLogs,
  logSet,
  plannedDayForDate,
  resetSetLogs,
  subscribePlanCalendar,
  type SetLog,
} from '../lib/planCalendarPrototypeStore';

type Route = RouteProp<PlanCalendarParamList, 'PlanCalendarWorkout'>;

const SCREEN_W = Dimensions.get('window').width;
/** How long the gold outline shows before the card swipes to the back. */
const GOLD_HOLD_MS = 500;

/** '185 lb' -> '185', '+10 lb' -> '+10', 'Bodyweight' -> 'BW'. */
function weightPlaceholder(weight: string): string {
  if (weight === 'Bodyweight') return 'BW';
  return weight.replace(/\s*lb$/i, '');
}

/**
 * PROTOTYPE — workout detail for one planned exercise. The set breakdown is a
 * deck of stacked cards: fill in reps/weight on the top card, tap the gold
 * check, and the card flashes a gold outline, swipes to the back of the deck
 * (with a light haptic), and surfaces the next set. When every set is logged
 * the deck collapses into a two-column grid of the completed cards.
 */
export default function PlanCalendarWorkoutScreen() {
  const route = useRoute<Route>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const tabBarInset = useTabBarInset();

  // Re-render on set logs / replacements from the session store.
  const [, forceRender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribePlanCalendar(forceRender), []);

  const { dateIso, exerciseIndex } = route.params;
  const plan = plannedDayForDate(dateIso);
  const exercise = plan.exercises[exerciseIndex];

  if (!exercise) {
    return (
      <View style={[styles.container, styles.missingWrap]}>
        <Text style={styles.missingText}>This exercise is not in the sample plan.</Text>
      </View>
    );
  }

  const color = MUSCLE_COLORS[exercise.muscle];
  const logs = getSetLogs(dateIso, exerciseIndex);
  const allDone = logs.length >= exercise.sets;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: spacing.xxxl + tabBarInset }]}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View
        style={[
          styles.muscleChip,
          { backgroundColor: color, borderColor: MUSCLE_EDGE[exercise.muscle] },
        ]}
      >
        <Text style={[styles.muscleChipLabel, { color: MUSCLE_INK[exercise.muscle] }]}>
          {exercise.muscle}
        </Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statTile}>
          <Text style={styles.statValue}>
            {exercise.sets} × {exercise.reps}
          </Text>
          <Text style={styles.statLabel}>SETS × REPS</Text>
        </View>
        <View style={styles.statTile}>
          <Text style={styles.statValue}>{exercise.weight}</Text>
          <Text style={styles.statLabel}>WEIGHT</Text>
        </View>
        <View style={styles.statTile}>
          <Text style={styles.statValue}>{exercise.rest}</Text>
          <Text style={styles.statLabel}>REST</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>SET BREAKDOWN</Text>
      {allDone ? (
        <>
          <View style={styles.gridWrap}>
            {logs.map((log, i) => (
              <View key={i} style={styles.gridCard}>
                <View style={styles.gridCardHeader}>
                  <Text style={styles.gridCardTitle}>SET {i + 1}</Text>
                  <Ionicons name="checkmark-circle" size={16} color={GOLD} />
                </View>
                <Text style={styles.gridCardReps}>{log.reps} reps</Text>
                <Text style={styles.gridCardWeight}>{log.weight}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity
            onPress={() => resetSetLogs(dateIso, exerciseIndex)}
            accessibilityRole="button"
            accessibilityLabel="Reset sets"
          >
            <Text style={styles.resetLink}>Reset sets (demo)</Text>
          </TouchableOpacity>
        </>
      ) : (
        <SetDeck
          exercise={exercise}
          completed={logs.length}
          styles={styles}
          colors={colors}
          onLog={(log, isLast) => {
            logSet(dateIso, exerciseIndex, log);
            if (isLast) buzzAllSetsComplete();
          }}
        />
      )}

      <Text style={styles.sectionLabel}>DETAILS</Text>
      <View style={styles.groupCard}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Muscle</Text>
          <View style={styles.rowValueWrap}>
            <View
              style={[
                styles.muscleDot,
                { backgroundColor: color, borderColor: MUSCLE_EDGE[exercise.muscle] },
              ]}
            />
            <Text style={styles.rowValue}>{exercise.muscle}</Text>
          </View>
        </View>
        <View style={[styles.row, styles.rowDivider]}>
          <Text style={styles.rowLabel}>Equipment</Text>
          <Text style={styles.rowValue}>{exercise.equipment}</Text>
        </View>
        <View style={[styles.row, styles.rowDivider]}>
          <Text style={styles.rowLabel}>Session</Text>
          <Text style={styles.rowValue}>
            {plan.weekday} · {plan.title}
          </Text>
        </View>
        <View style={[styles.row, styles.rowDivider]}>
          <Text style={styles.rowLabel}>Date</Text>
          <Text style={styles.rowValue}>{shortDate(fromIso(dateIso))}</Text>
        </View>
      </View>

      {exercise.note !== '' && (
        <>
          <Text style={styles.sectionLabel}>COACHING CUE</Text>
          <View style={styles.groupCard}>
            <View style={styles.cueRow}>
              <Ionicons name="bulb-outline" size={18} color={colors.accent} />
              <Text style={styles.cueText}>{exercise.note}</Text>
            </View>
          </View>
        </>
      )}

      <Text style={styles.footerNote}>Prototype · Sample plan data</Text>
    </ScrollView>
  );
}

/**
 * The stacked set-card deck. Owns only the animation + input state for the
 * TOP card; which set is on top comes from `completed` (the store), so the
 * deck survives leaving and re-entering the screen mid-exercise.
 */
function SetDeck({
  exercise,
  completed,
  onLog,
  styles,
  colors,
}: {
  exercise: PlannedExercise;
  completed: number;
  onLog: (log: SetLog, isLast: boolean) => void;
  styles: ReturnType<typeof createStyles>;
  colors: ColorPalette;
}) {
  const [reps, setReps] = useState('');
  const [weightIn, setWeightIn] = useState('');
  const busy = useRef(false);

  const cardX = useSharedValue(0);
  const cardScale = useSharedValue(1);
  const goldOp = useSharedValue(0);

  // New top card: clear inputs, kill the outline, spring in from the deck.
  useEffect(() => {
    setReps('');
    setWeightIn('');
    busy.current = false;
    cardX.value = 0;
    goldOp.value = 0;
    cardScale.value = 0.94;
    cardScale.value = withSpring(1, { damping: 16, stiffness: 200 });
  }, [completed, cardX, cardScale, goldOp]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: cardX.value },
      { rotate: `${cardX.value / 30}deg` },
      { scale: cardScale.value },
    ],
  }));
  const goldStyle = useAnimatedStyle(() => ({ opacity: goldOp.value }));

  const commit = (log: SetLog, isLast: boolean) => {
    onLog(log, isLast);
  };

  const onCheck = () => {
    if (busy.current) return;
    busy.current = true;
    const log: SetLog = {
      reps: reps.trim() || exercise.reps,
      weight: weightIn.trim() ? `${weightIn.trim()} lb` : exercise.weight,
    };
    const isLast = completed + 1 >= exercise.sets;
    buzzSetComplete();
    goldOp.value = withTiming(1, { duration: 200 });
    cardX.value = withDelay(
      GOLD_HOLD_MS,
      withTiming(
        SCREEN_W * 1.1,
        { duration: 320, easing: Easing.in(Easing.quad) },
        (finished) => {
          if (finished) runOnJS(commit)(log, isLast);
        },
      ),
    );
  };

  const behindCount = Math.min(exercise.sets - completed - 1, 2);

  return (
    <View style={styles.deckWrap}>
      {behindCount >= 2 && <View style={[styles.deckPeek, styles.deckPeekFar]} />}
      {behindCount >= 1 && <View style={[styles.deckPeek, styles.deckPeekNear]} />}

      <Animated.View style={[styles.setCard, cardStyle]}>
        <View style={styles.setCardHeader}>
          <Text style={styles.setCardTitle}>
            Set {completed + 1} of {exercise.sets}
          </Text>
          <Text style={styles.setCardTarget}>
            Target {exercise.reps} · {exercise.weight}
          </Text>
        </View>

        <View style={styles.inputRow}>
          <View style={styles.inputBox}>
            <Text style={styles.inputLabel}>REPS</Text>
            <TextInput
              style={styles.input}
              value={reps}
              onChangeText={setReps}
              placeholder={exercise.reps}
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={5}
            />
          </View>
          <View style={styles.inputBox}>
            <Text style={styles.inputLabel}>WEIGHT (LB)</Text>
            <TextInput
              style={styles.input}
              value={weightIn}
              onChangeText={setWeightIn}
              placeholder={weightPlaceholder(exercise.weight)}
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              maxLength={6}
            />
          </View>
        </View>

        <View style={styles.checkRow}>
          <TouchableOpacity
            style={styles.checkButton}
            activeOpacity={0.8}
            onPress={onCheck}
            accessibilityRole="button"
            accessibilityLabel={`Complete set ${completed + 1}`}
          >
            <Ionicons name="checkmark" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <Animated.View pointerEvents="none" style={[styles.goldOutline, goldStyle]} />
      </Animated.View>
    </View>
  );
}

function createStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    content: {
      padding: spacing.lg,
    },
    missingWrap: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    missingText: {
      ...sfPro,
      fontSize: text.body,
      color: c.textMuted,
    },
    muscleChip: {
      alignSelf: 'flex-start',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      borderWidth: 1,
      marginBottom: spacing.lg,
    },
    muscleChipLabel: {
      ...sfPro,
      fontSize: text.body,
      fontWeight: weight.semibold,
    },
    statsRow: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    statTile: {
      flex: 1,
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.sm,
      alignItems: 'center',
      gap: spacing.xs,
      shadowColor: c.shadow,
      ...elevation.level1,
    },
    statValue: {
      ...sfPro,
      fontSize: text.headline,
      lineHeight: 24,
      fontWeight: weight.bold,
      letterSpacing: tracking.tight,
      color: c.text,
    },
    statLabel: {
      ...sfPro,
      fontSize: text.caption,
      fontWeight: weight.semibold,
      letterSpacing: tracking.wider,
      color: c.textMuted,
    },
    sectionLabel: {
      ...sfPro,
      fontSize: text.caption,
      fontWeight: weight.semibold,
      letterSpacing: tracking.widest,
      color: c.textMuted,
      marginTop: spacing.xxl,
      marginBottom: spacing.sm,
      marginLeft: spacing.md,
    },

    // The deck
    deckWrap: {
      paddingTop: spacing.xl,
    },
    deckPeek: {
      position: 'absolute',
      height: 56,
      borderRadius: radius.xl,
      backgroundColor: c.surface,
      shadowColor: c.shadow,
      ...elevation.level1,
    },
    deckPeekNear: {
      top: spacing.sm + 2,
      left: spacing.md,
      right: spacing.md,
    },
    deckPeekFar: {
      top: 0,
      left: spacing.xxl,
      right: spacing.xxl,
      opacity: 0.7,
    },
    setCard: {
      backgroundColor: c.surface,
      borderRadius: radius.xl,
      padding: spacing.lg,
      shadowColor: c.shadow,
      ...elevation.level2,
    },
    setCardHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    setCardTitle: {
      ...sfPro,
      fontSize: text.headline,
      fontWeight: weight.bold,
      color: c.text,
    },
    setCardTarget: {
      ...sfPro,
      fontSize: text.footnote,
      color: c.textMuted,
    },
    inputRow: {
      flexDirection: 'row',
      gap: spacing.md,
      marginTop: spacing.lg,
    },
    inputBox: {
      flex: 1,
      backgroundColor: c.background,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      gap: spacing.xs,
    },
    inputLabel: {
      ...sfPro,
      fontSize: text.caption,
      fontWeight: weight.semibold,
      letterSpacing: tracking.wider,
      color: c.textMuted,
    },
    input: {
      ...sfPro,
      fontSize: text.title,
      fontWeight: weight.bold,
      color: c.text,
      textAlign: 'center',
      minWidth: 80,
      paddingVertical: 0,
    },
    checkRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginTop: spacing.md,
    },
    checkButton: {
      width: 40,
      height: 40,
      borderRadius: radius.pill,
      backgroundColor: GOLD,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.shadow,
      ...elevation.level2,
    },
    goldOutline: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: radius.xl,
      borderWidth: 3,
      borderColor: GOLD,
    },

    // Completed grid (2 columns)
    gridWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: spacing.md,
    },
    gridCard: {
      width: '48%',
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderColor: GOLD,
      padding: spacing.lg,
    },
    gridCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    gridCardTitle: {
      ...sfPro,
      fontSize: text.caption,
      fontWeight: weight.semibold,
      letterSpacing: tracking.wider,
      color: c.textMuted,
    },
    gridCardReps: {
      ...sfPro,
      fontSize: text.headline,
      fontWeight: weight.bold,
      color: c.text,
      marginTop: spacing.sm,
    },
    gridCardWeight: {
      ...sfPro,
      fontSize: text.footnote,
      color: c.textSecondary,
      marginTop: spacing.xxs,
    },
    resetLink: {
      ...sfPro,
      fontSize: text.footnote,
      color: c.textMuted,
      textAlign: 'center',
      marginTop: spacing.md,
    },

    // Grouped facts
    groupCard: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.lg,
      shadowColor: c.shadow,
      ...elevation.level1,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.md,
      gap: spacing.md,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    rowLabel: {
      ...sfPro,
      fontSize: text.callout,
      color: c.text,
    },
    rowValueWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    muscleDot: {
      width: 8,
      height: 8,
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
    },
    rowValue: {
      ...sfPro,
      fontSize: text.callout,
      color: c.textSecondary,
      textAlign: 'right',
      flexShrink: 1,
    },
    cueRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      paddingVertical: spacing.md,
    },
    cueText: {
      ...sfPro,
      flex: 1,
      fontSize: text.body,
      lineHeight: 20,
      color: c.textSecondary,
    },
    footerNote: {
      ...sfPro,
      fontSize: text.caption,
      color: c.textMuted,
      textAlign: 'center',
      marginTop: spacing.xl,
    },
  });
}
