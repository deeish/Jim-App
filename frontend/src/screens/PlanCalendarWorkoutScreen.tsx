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
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
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
  dayHasLocalLogs,
  getSetLogs,
  isDayLogged,
  logSet,
  plannedDayForDate,
  subscribePlanCalendar,
  type SetLog,
} from '../lib/planCalendarPrototypeStore';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import {
  formatWeightFromLb,
  kgToLb,
  lbToKg,
  roundLb,
  type WeightUnit,
} from '../lib/weightDisplay';
import { getExerciseHistory } from '../services/workoutService';
import { buzzRestOver } from '../lib/planCalendarPrototype';

type Route = RouteProp<PlanCalendarParamList, 'PlanCalendarWorkout'>;
type Nav = NativeStackNavigationProp<PlanCalendarParamList, 'PlanCalendarWorkout'>;

const SCREEN_W = Dimensions.get('window').width;
/** How long the gold outline shows before the card swipes to the back. */
const GOLD_HOLD_MS = 500;

/** '185 lb' → the user's unit ('84 kg'); non-weights pass through. */
function displayWeight(weight: string, unit: WeightUnit): string {
  const m = weight.match(/^\+?([\d.]+)\s*lb$/i);
  if (!m) return weight;
  return formatWeightFromLb(Number(m[1]), unit);
}

/** Weight-input placeholder as a bare number in the user's unit. */
function weightInputPlaceholder(weight: string, unit: WeightUnit): string {
  if (weight === 'Bodyweight') return 'BW';
  const m = weight.match(/^\+?([\d.]+)\s*lb$/i);
  if (!m) return '—';
  const lb = Number(m[1]);
  return String(Math.round(unit === 'kg' ? lbToKg(lb) : lb));
}

/** '2:30' → 150; '—'/unparseable → null (no rest timer). */
function restSecondsOf(rest: string): number | null {
  const m = rest.match(/^(\d+):(\d{2})$/);
  if (!m) return null;
  const s = Number(m[1]) * 60 + Number(m[2]);
  return s > 0 ? s : null;
}

function formatSeconds(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
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
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const tabBarInset = useTabBarInset();

  // Re-render on set logs / replacements from the session store.
  const [, forceRender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribePlanCalendar(forceRender), []);

  const { dateIso, exerciseIndex } = route.params;
  const plan = plannedDayForDate(dateIso);
  const exercise = plan.exercises[exerciseIndex];

  const { weightUnit } = useUserPreferences();
  const unit: WeightUnit = weightUnit === 'kg' ? 'kg' : 'lb';

  // Last logged performance for this exercise — prefills the deck and shows a
  // "Last time" line. Catalog-linked exercises only; failures stay silent.
  const [lastTop, setLastTop] = useState<{ weightLb: number; reps: number } | null>(null);
  const historyExerciseId = exercise?.exerciseId;
  useEffect(() => {
    setLastTop(null);
    if (!historyExerciseId) return;
    let stale = false;
    getExerciseHistory(historyExerciseId, 1)
      .then((h) => {
        if (stale) return;
        // Heaviest weighted set of the most recent session (weights are
        // canonical pounds; bodyweight-only sessions yield nothing).
        const sets = h.sessions[0]?.sets ?? [];
        const top = sets.reduce<{ weightLb: number; reps: number } | null>(
          (best, s) =>
            s.weight != null && s.weight > 0 && (best == null || s.weight > best.weightLb)
              ? { weightLb: s.weight, reps: s.reps }
              : best,
          null,
        );
        setLastTop(top);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [historyExerciseId]);

  const logs = getSetLogs(dateIso, exerciseIndex);

  // Rest countdown — lives in the REST stat tile (one timer, always visible
  // above the deck; the prescribed rest it replaces is what it counts down
  // from). Starts when a set lands (not before the first, not after the
  // last), ticks to zero with a soft haptic; tap the tile to skip.
  const [restLeft, setRestLeft] = useState<number | null>(null);
  const prevLogged = useRef(logs.length);
  useEffect(() => {
    if (exercise && logs.length > prevLogged.current && logs.length < exercise.sets) {
      setRestLeft(restSecondsOf(exercise.rest));
    }
    prevLogged.current = logs.length;
  }, [logs.length, exercise]);
  useEffect(() => {
    if (restLeft == null) return;
    if (restLeft <= 0) {
      setRestLeft(null);
      // Warning pattern, not the selection tick: this is the one haptic that
      // fires while the phone is likely face-down between sets.
      buzzRestOver();
      return;
    }
    const t = setTimeout(() => setRestLeft((v) => (v == null ? null : v - 1)), 1000);
    return () => clearTimeout(t);
  }, [restLeft]);

  if (!exercise) {
    return (
      <View style={[styles.container, styles.missingWrap]}>
        <Text style={styles.missingText}>This exercise is not in the sample plan.</Text>
      </View>
    );
  }

  const color = MUSCLE_COLORS[exercise.muscle];
  const allDone = logs.length >= exercise.sets;
  // A submitted session is closed — the deck never returns, even for sets a
  // partial finish skipped (the write-once log would silently ignore them).
  const dayLogged = isDayLogged(dateIso);
  // With local logs the record is authoritative: sets it lacks were skipped.
  // A logged day with NO local record (finished on another device, snapshot
  // pruned) shows the prescription as the completed values instead.
  const daySkipsKnown = dayHasLocalLogs(dateIso);
  const showGrid = allDone || dayLogged;

  // Celebration burst the moment the exercise's last set lands.
  const prevAllDone = useRef(allDone);
  const [celebrating, setCelebrating] = useState(false);
  useEffect(() => {
    if (allDone && !prevAllDone.current) {
      setCelebrating(true);
      const t = setTimeout(() => setCelebrating(false), 1500);
      prevAllDone.current = allDone;
      return () => clearTimeout(t);
    }
    prevAllDone.current = allDone;
  }, [allDone]);

  return (
    <View style={styles.container}>
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
          <Text style={styles.statValue}>{displayWeight(exercise.weight, unit)}</Text>
          <Text style={styles.statLabel}>WEIGHT</Text>
        </View>
        {restLeft != null ? (
          <TouchableOpacity
            style={[styles.statTile, styles.statTileResting]}
            activeOpacity={0.8}
            onPress={() => setRestLeft(null)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss rest timer"
          >
            <Text style={[styles.statValue, styles.statValueResting]}>
              {formatSeconds(restLeft)}
            </Text>
            <Text style={styles.statLabel}>REST</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{exercise.rest}</Text>
            <Text style={styles.statLabel}>REST</Text>
          </View>
        )}
      </View>

      <Text style={styles.sectionLabel}>SET BREAKDOWN</Text>
      {showGrid ? (
        <View style={styles.gridWrap}>
          {Array.from({ length: Math.max(exercise.sets, logs.length) }, (_, i) => {
            const log: SetLog | undefined = logs[i];
            const done = log != null || !daySkipsKnown;
            const repsText = log?.reps ?? exercise.reps;
            return (
              <View key={i} style={[styles.gridCard, !done && styles.gridCardSkipped]}>
                <View style={styles.gridCardHeader}>
                  <Text style={styles.gridCardTitle}>SET {i + 1}</Text>
                  {done ? (
                    <Ionicons name="checkmark-circle" size={16} color={GOLD} />
                  ) : (
                    <Ionicons name="remove-circle-outline" size={16} color={colors.textMuted} />
                  )}
                </View>
                <Text style={[styles.gridCardReps, !done && styles.gridCardRepsSkipped]}>
                  {/(min|sec)/i.test(repsText) ? repsText : `${repsText} reps`}
                </Text>
                <Text style={styles.gridCardWeight}>
                  {done ? displayWeight(log?.weight ?? exercise.weight, unit) : 'Not logged'}
                </Text>
              </View>
            );
          })}
        </View>
      ) : (
        <SetDeck
          exercise={exercise}
          completed={logs.length}
          styles={styles}
          colors={colors}
          unit={unit}
          lastTop={lastTop}
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
        {/* Bridge into the exercise library: form cues, mistakes, Jim score,
            easier/harder versions — at the moment you're about to do the
            movement. Only when the catalog id is known (live plan rows and
            catalog-picked swaps; sample rows have no id). */}
        {exercise.exerciseId ? (
          <TouchableOpacity
            style={[styles.row, styles.rowDivider]}
            activeOpacity={0.8}
            onPress={() =>
              navigation.navigate('ExerciseDetail', { exerciseId: exercise.exerciseId! })
            }
            accessibilityRole="button"
            accessibilityLabel="Open exercise guide"
          >
            <View style={styles.rowValueWrap}>
              <Ionicons name="book-outline" size={17} color={colors.primary} />
              <Text style={[styles.rowLabel, { color: colors.primary }]}>Exercise Guide</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        ) : null}
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

    </ScrollView>
    {celebrating && <CompletionBurst styles={styles} />}
    </View>
  );
}

/** One flying confetti dot of the completion burst. */
function BurstDot({
  angle,
  dist,
  color,
  delay,
}: {
  angle: number;
  dist: number;
  color: string;
  delay: number;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [p, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - p.value,
    transform: [
      { translateX: Math.cos(angle) * dist * p.value },
      { translateY: Math.sin(angle) * dist * p.value - 30 * p.value },
      { scale: 1 - 0.35 * p.value },
    ],
  }));
  return <Animated.View style={[{ position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: color }, style]} />;
}

/**
 * The exercise-complete celebration: a gold check springs in while the muscle
 * palette bursts outward. Pure reanimated, so it plays on web and mobile.
 */
function CompletionBurst({ styles }: { styles: ReturnType<typeof createStyles> }) {
  const check = useSharedValue(0);
  useEffect(() => {
    check.value = withSpring(1, { damping: 11, stiffness: 180 });
  }, [check]);
  const checkStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, check.value * 2),
    transform: [{ scale: check.value }],
  }));
  const burstColors = (Object.values(MUSCLE_COLORS) as string[]).filter((c) => c !== '#FFFFFF');
  return (
    <View pointerEvents="none" style={styles.celebrationOverlay}>
      {burstColors.map((c, i) => (
        <BurstDot
          key={i}
          angle={(i / burstColors.length) * Math.PI * 2}
          dist={110 + (i % 3) * 26}
          color={c}
          delay={i * 16}
        />
      ))}
      <Animated.View style={checkStyle}>
        <Ionicons name="checkmark-circle" size={96} color={GOLD} />
      </Animated.View>
    </View>
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
  unit,
  lastTop,
}: {
  exercise: PlannedExercise;
  completed: number;
  onLog: (log: SetLog, isLast: boolean) => void;
  styles: ReturnType<typeof createStyles>;
  colors: ColorPalette;
  unit: WeightUnit;
  lastTop: { weightLb: number; reps: number } | null;
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

  // Time-based work ('10 min', '45 sec') gets a duration input, not a rep count.
  const timedMatch = exercise.reps.match(/(\d+)\s*(min|sec)/i);
  const timedUnit = timedMatch ? timedMatch[2].toLowerCase() : null;

  const onCheck = () => {
    if (busy.current) return;
    busy.current = true;
    // Typed weight arrives in the user's unit; the store (and backend logs)
    // stay canonical in POUNDS. Empty inputs log what the placeholder shows
    // (last performance when known, the prescription otherwise).
    const typedWeight = Number(weightIn.trim());
    const weightValid = weightIn.trim() !== '' && Number.isFinite(typedWeight) && typedWeight > 0;
    const typedReps = Number(reps.trim());
    const repsValid = reps.trim() !== '' && Number.isFinite(typedReps) && typedReps > 0;
    const log: SetLog = {
      reps: timedUnit
        ? repsValid
          ? `${typedReps} ${timedUnit}`
          : exercise.reps
        : repsValid
          ? String(typedReps)
          : lastTop
            ? String(lastTop.reps)
            : exercise.reps,
      weight: weightValid
        ? `${roundLb(unit === 'kg' ? kgToLb(typedWeight) : typedWeight)} lb`
        : lastTop
          ? `${roundLb(lastTop.weightLb)} lb`
          : exercise.weight,
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
            Target {exercise.reps} · {displayWeight(exercise.weight, unit)}
          </Text>
        </View>
        {lastTop && (
          <Text style={styles.lastTimeLine}>
            Last time: {formatWeightFromLb(lastTop.weightLb, unit)} × {lastTop.reps}
          </Text>
        )}
        <View style={styles.inputRow}>
          <View style={styles.inputBox}>
            <Text style={styles.inputLabel}>
              {timedUnit ? `TIME (${timedUnit.toUpperCase()})` : 'REPS'}
            </Text>
            <TextInput
              style={styles.input}
              value={reps}
              onChangeText={setReps}
              placeholder={
                timedUnit
                  ? timedMatch![1]
                  : lastTop
                    ? String(lastTop.reps)
                    : exercise.reps
              }
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={5}
            />
          </View>
          <View style={styles.inputBox}>
            <Text style={styles.inputLabel}>WEIGHT ({unit.toUpperCase()})</Text>
            <TextInput
              style={styles.input}
              value={weightIn}
              onChangeText={setWeightIn}
              placeholder={
                lastTop
                  ? String(Math.round(unit === 'kg' ? lbToKg(lastTop.weightLb) : lastTop.weightLb))
                  : weightInputPlaceholder(exercise.weight, unit)
              }
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
      // Reserved for the resting state's gold ring — keeps all three tiles
      // the same size whether or not the countdown is running.
      borderWidth: 2,
      borderColor: 'transparent',
    },
    statTileResting: {
      borderColor: GOLD,
    },
    statValueResting: {
      color: GOLD,
      fontVariant: ['tabular-nums'],
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
    lastTimeLine: {
      ...sfPro,
      fontSize: text.footnote,
      color: c.textMuted,
      marginTop: spacing.xs,
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
    /** A set the logged session skipped: present, but visibly not done. */
    gridCardSkipped: {
      borderColor: c.border,
    },
    gridCardRepsSkipped: {
      color: c.textMuted,
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
    celebrationOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10,
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
