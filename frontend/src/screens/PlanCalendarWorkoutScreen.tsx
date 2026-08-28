import React, {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  ActivityIndicator,
  AppState,
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
  buzzEditApplied,
  buzzSetComplete,
  buzzTap,
  fromIso,
  sfPro,
  shortDate,
  todayIso,
  type PlanCalendarParamList,
  type PlannedExercise,
} from '../lib/planCalendarPrototype';
import {
  canMoveDay,
  dayHasLocalLogs,
  finishDaySession,
  getSetLogs,
  isDayFullyLogged,
  isDayLogged,
  logSet,
  moveMissedDay,
  moveTargetsForDay,
  plannedDayForDate,
  primeCelebrationBaselines,
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
import type { HistorySet } from '../lib/exerciseHistory';
import {
  formatLastTimeForSet,
  lastSetForIndex,
} from '../lib/lastPerformanceDisplay';
import {
  isLowerBodyExercise,
  parseRepsBand,
  suggestNextTarget,
} from '../lib/nextTargetSuggestion';
import { buzzRestOver } from '../lib/planCalendarPrototype';
import { activateKeepAwake, releaseKeepAwake } from '../lib/keepAwake';
import {
  clearRest,
  getRestTimer,
  isRestOver,
  remainingSeconds,
  shouldSignalRestOver,
  startRest,
  subscribeRestTimer,
} from '../lib/restTimer';

type Route = RouteProp<PlanCalendarParamList, 'PlanCalendarWorkout'>;
type Nav = NativeStackNavigationProp<PlanCalendarParamList, 'PlanCalendarWorkout'>;

const SCREEN_W = Dimensions.get('window').width;
/** How long the gold outline shows before the card swipes to the back. */
const GOLD_HOLD_MS = 500;

/**
 * A last log older than this stops driving the Target suggestion — a
 * two-month-old top set is evidence of what you once lifted, not what to load
 * today. The "Last time" line keeps rendering regardless: it shows its date.
 */
const SUGGESTION_STALE_DAYS = 60;

/** Muscles that take the bigger lower-body increment in the progression rule. */
const LOWER_MUSCLES: ReadonlySet<string> = new Set([
  'Quads',
  'Hamstrings',
  'Glutes',
  'Calves',
]);

/** The last logged session of the exercise, as the deck consumes it. */
type LastSession = { performedAt: string; sets: HistorySet[] };

/** '185 lb' → the user's unit ('84 kg'); non-weights pass through. An
 *  additive weight keeps its '+' ('+25 lb' → '+11 kg') — it means
 *  bodyweight PLUS the load, and dropping it misread as a 25 lb pull-up. */
function displayWeight(weight: string, unit: WeightUnit): string {
  const m = weight.match(/^(\+?)([\d.]+)\s*lb$/i);
  if (!m) return weight;
  return m[1] + formatWeightFromLb(Number(m[2]), unit);
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

/** Tagged so this screen's wake lock can never be released by another one. */
const KEEP_AWAKE_TAG = 'jim-workout-session';

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

  // Last logged session of this exercise — drives the set-aware "Last time"
  // line, the ghost inputs, and the next-target Target in the deck header.
  // Catalog-linked exercises only; failures stay silent.
  const [lastPerf, setLastPerf] = useState<LastSession | null>(null);
  const historyExerciseId = exercise?.exerciseId;
  useEffect(() => {
    setLastPerf(null);
    if (!historyExerciseId) return;
    let stale = false;
    getExerciseHistory(historyExerciseId, 1)
      .then((h) => {
        if (stale) return;
        const session = h.sessions[0];
        setLastPerf(
          session && session.sets.length > 0
            ? { performedAt: session.performedAt, sets: session.sets }
            : null,
        );
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [historyExerciseId]);

  // Deck-header Target: the double-progression verdict from the last session
  // (nextTargetSuggestion.ts — the same rule as the legacy Train flow), falling
  // back to the plan prescription when history is absent, stale, or bandless.
  const targetLine = useMemo(() => {
    if (!exercise) return '';
    if (lastPerf) {
      const ageDays =
        (Date.now() - new Date(lastPerf.performedAt).getTime()) / 86_400_000;
      const band = parseRepsBand(exercise.reps);
      if (band && Number.isFinite(ageDays) && ageDays <= SUGGESTION_STALE_DAYS) {
        const s = suggestNextTarget({
          lastSets: lastPerf.sets,
          repsMin: band.min,
          repsMax: band.max,
          reps: band.min,
          isTimeBased: false,
          isLowerBody:
            LOWER_MUSCLES.has(exercise.muscle) ||
            isLowerBodyExercise(undefined, exercise.name),
          unit,
        });
        if (s) {
          if (s.weightLb == null) return `Target ${s.targetReps} reps`;
          const w = formatWeightFromLb(s.weightLb, unit);
          const arrow =
            s.kind === 'increase_weight' ? ' ↑' : s.kind === 'reduce_weight' ? ' ↓' : '';
          return `Target ${s.targetReps} · ${w}${arrow}`;
        }
      }
    }
    return exercise.weight === '—'
      ? `Target ${exercise.reps}`
      : `Target ${exercise.reps} · ${displayWeight(exercise.weight, unit)}`;
  }, [exercise, lastPerf, unit]);

  const logs = getSetLogs(dateIso, exerciseIndex);

  // "Add another set" — session-scoped extras on top of the prescription
  // (a burnout set today, not an edit to the plan). Extra sets flow into the
  // day's workout log like any other; the button lives on the completed grid
  // and only while the day's log hasn't been submitted (write-once).
  const [extraSets, setExtraSets] = useState(0);
  useEffect(() => {
    setExtraSets(0);
  }, [dateIso, exerciseIndex]);
  const plannedSets = exercise ? exercise.sets + extraSets : 0;

  // Prevention nudge (the "finished workout on the wrong date" case): checking
  // sets on a FUTURE day while training now would date the log to that day.
  // Offer the clean fix BEFORE any set lands — only while today is open (an
  // occupied/logged today needs the calendar's make-room flow instead), and
  // only while the date has no logs to strand. Moving the whole day onto an
  // open today keeps exercise indexes intact, so this screen just re-points.
  const [nudgeBusy, setNudgeBusy] = useState(false);
  const [nudgeError, setNudgeError] = useState('');
  const showTodayNudge =
    dateIso > todayIso() && canMoveDay(dateIso) && moveTargetsForDay()[0].state === 'open';
  const moveToToday = async () => {
    if (nudgeBusy) return;
    setNudgeBusy(true);
    setNudgeError('');
    try {
      await moveMissedDay(dateIso, todayIso());
      buzzEditApplied();
      navigation.setParams({ dateIso: todayIso() });
    } catch {
      setNudgeError('Couldn’t move it — check your connection.');
    } finally {
      setNudgeBusy(false);
    }
  };

  // Rest countdown — lives in the REST stat tile (one timer, always visible
  // above the deck; while it runs the tile's label keeps showing what it is
  // counting down FROM). Starts when a set lands (not before the first, not
  // after the last); tap the tile to skip.
  //
  // The timer itself is a wall-clock module singleton (`lib/restTimer`), not
  // screen state and not a chain of setTimeouts — see that file for why. Here
  // we only re-render often enough to redraw the number, and derive the number
  // from the clock every time.
  const restTimer = useSyncExternalStore(subscribeRestTimer, getRestTimer, getRestTimer);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!restTimer) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    // Coming back from a locked screen has to recompute immediately rather
    // than wait out the rest of a tick — by then the answer is usually "0".
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNowMs(Date.now());
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [restTimer]);

  const prevLogged = useRef(logs.length);
  useEffect(() => {
    if (exercise && logs.length > prevLogged.current && logs.length < plannedSets) {
      startRest(restSecondsOf(exercise.rest) ?? 0);
    }
    prevLogged.current = logs.length;
  }, [logs.length, exercise, plannedSets]);

  useEffect(() => {
    if (!restTimer || !isRestOver(restTimer, nowMs)) return;
    // Warning pattern, not the selection tick: this is the one haptic that
    // fires while the phone is likely face-down between sets. It is suppressed
    // when we only noticed late — see `shouldSignalRestOver`.
    if (shouldSignalRestOver(restTimer, nowMs, AppState.currentState === 'active')) {
      buzzRestOver();
    }
    clearRest();
  }, [restTimer, nowMs]);

  const restLeft = restTimer ? remainingSeconds(restTimer, nowMs) : null;

  // Keep the screen awake while there are sets left to log or a rest is
  // running. Nothing did this before, so the phone locked during every rest
  // and each set began with FaceID. `expo-keep-awake` ships inside the `expo`
  // core package, so this needs no new binary.
  const keepAwake = (!!exercise && logs.length < plannedSets) || restTimer != null;
  useEffect(() => {
    if (!keepAwake) return;
    // Only release a lock we actually took — releasing one that never
    // activated throws "has not activated yet". `lib/keepAwake` swallows both
    // that and a denied lock, and (the reason it exists at all) guards the
    // native-module import that would otherwise white-screen the app.
    let held = false;
    void activateKeepAwake(KEEP_AWAKE_TAG).then((ok) => {
      held = ok;
    });
    return () => {
      if (held) void releaseKeepAwake(KEEP_AWAKE_TAG);
    };
  }, [keepAwake]);

  if (!exercise) {
    return (
      <View style={[styles.container, styles.missingWrap]}>
        <Text style={styles.missingText}>This exercise is not in the sample plan.</Text>
      </View>
    );
  }

  const color = MUSCLE_COLORS[exercise.muscle];
  const allDone = logs.length >= plannedSets;
  // A submitted session is closed — the deck never returns, even for sets a
  // partial finish skipped (the write-once log would silently ignore them).
  const dayLogged = isDayLogged(dateIso);
  // With local logs the record is authoritative: sets it lacks were skipped.
  // A logged day with NO local record (finished on another device, snapshot
  // pruned) shows the prescription as the completed values instead.
  const daySkipsKnown = dayHasLocalLogs(dateIso);
  const showGrid = allDone || dayLogged;

  // No per-exercise celebration: the round-13 CompletionBurst was removed
  // (Dylan, 2026-08-18) — a WORKOUT-finish celebration will replace it later;
  // resurrect the burst component from git history (commit 1f33f34's parent)
  // if it's wanted as the base. The Success haptic on the last set stays.

  return (
    <View style={styles.container}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: spacing.xxxl + tabBarInset }]}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {showTodayNudge && (
        <View style={styles.todayNudgeWrap}>
          <View style={styles.todayNudge}>
            <Ionicons name="today-outline" size={17} color={colors.primary} />
            <Text style={styles.todayNudgeText}>
              Training this now? It’s planned for {shortDate(fromIso(dateIso))}.
            </Text>
            <TouchableOpacity
              onPress={moveToToday}
              disabled={nudgeBusy}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Move this workout to today"
            >
              {nudgeBusy ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.todayNudgeAction}>Move to today</Text>
              )}
            </TouchableOpacity>
          </View>
          {nudgeError !== '' && <Text style={styles.todayNudgeError}>{nudgeError}</Text>}
        </View>
      )}

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

      {/* Tile values shrink to fit ONE line — "Bodyweight" is wider than a
          third-of-screen tile and wrapped mid-word ("Bodyweig / ht") on
          device. All three tiles get the same treatment so a shrunk value
          never sits next to a full-size one of the same length. */}
      <View style={styles.statsRow}>
        <View style={styles.statTile}>
          <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {exercise.sets} × {exercise.reps}
          </Text>
          <Text style={styles.statLabel}>SETS × REPS</Text>
        </View>
        <View style={styles.statTile}>
          <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {displayWeight(exercise.weight, unit)}
          </Text>
          <Text style={styles.statLabel}>WEIGHT</Text>
        </View>
        {restLeft != null ? (
          <TouchableOpacity
            style={[styles.statTile, styles.statTileResting]}
            activeOpacity={0.8}
            onPress={() => {
              buzzTap();
              clearRest();
            }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss rest timer"
          >
            <Text
              style={[styles.statValue, styles.statValueResting]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              {formatSeconds(restLeft)}
            </Text>
            {/* The prescription used to vanish the moment the countdown
                started, so "1:12" had nothing to be 1:12 OF.
                ⚠ Read off the TIMER, not off `exercise.rest`: the timer now
                outlives the screen that started it, so a rest begun on a
                3:00 compound keeps counting while you look at a 1:30
                isolation exercise, and the prescription here is not its. */}
            <Text style={styles.statLabel} numberOfLines={1}>
              {`OF ${formatSeconds(restTimer!.totalSeconds)}`}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.statTile}>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {exercise.rest}
            </Text>
            <Text style={styles.statLabel}>REST</Text>
          </View>
        )}
      </View>

      <Text style={styles.sectionLabel}>SET BREAKDOWN</Text>
      {showGrid ? (
        <>
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
        {/* One more beyond the prescription — hidden once the day's log is
            submitted (write-once: a set logged after submission could never
            reach the server record). */}
        {!dayLogged && (
          <TouchableOpacity
            style={styles.addSetRow}
            activeOpacity={0.7}
            onPress={() => {
              setExtraSets((e) => e + 1);
              buzzEditApplied();
            }}
            accessibilityRole="button"
            accessibilityLabel="Add another set"
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
            <Text style={styles.addSetLabel}>Add another set</Text>
          </TouchableOpacity>
        )}
        {/* The whole day's last set usually lands here — offer the same
            explicit door the day view has, right where the moment happens.
            Only when the FULL day is logged: a partial finish belongs to the
            day view's button, not a screen showing one exercise. */}
        {isDayFullyLogged(dateIso) && !dayLogged && (
          <TouchableOpacity
            style={styles.completeButton}
            activeOpacity={0.85}
            onPress={() => {
              buzzAllSetsComplete();
              navigation.navigate('PlanCalendarWorkoutComplete', { dateIso });
              // Celebrate immediately; sync AFTER the baselines land — a log
              // that POSTs first becomes the record its own claims compare to.
              void (async () => {
                await primeCelebrationBaselines(dateIso).catch(() => {});
                finishDaySession(dateIso);
              })();
            }}
            accessibilityRole="button"
            accessibilityLabel="Complete workout"
          >
            <Ionicons name="checkmark" size={20} color="#1C1C1E" />
            <Text style={styles.completeButtonLabel}>Complete Workout</Text>
          </TouchableOpacity>
        )}
        </>
      ) : (
        <SetDeck
          // The deck counts the session's planned sets — prescription plus
          // any extras added this session.
          exercise={{ ...exercise, sets: plannedSets }}
          completed={logs.length}
          styles={styles}
          colors={colors}
          unit={unit}
          lastPerf={lastPerf}
          targetLine={targetLine}
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
            onPress={() => {
              buzzTap();
              navigation.navigate('ExerciseDetail', { exerciseId: exercise.exerciseId! });
            }}
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
  lastPerf,
  targetLine,
}: {
  exercise: PlannedExercise;
  completed: number;
  onLog: (log: SetLog, isLast: boolean) => void;
  styles: ReturnType<typeof createStyles>;
  colors: ColorPalette;
  unit: WeightUnit;
  lastPerf: LastSession | null;
  targetLine: string;
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

  // This card's memory: the SAME set of the last session (set 2 shows last
  // time's set 2), falling back to that session's best set when today runs
  // longer. Line, ghost inputs, and the empty-check log all read this pick.
  const setNumber = completed + 1;
  const lastSet =
    !timedUnit && lastPerf ? lastSetForIndex(lastPerf.sets, setNumber) : null;
  const lastTimeLine = formatLastTimeForSet(
    lastPerf,
    setNumber,
    unit,
    timedUnit != null,
  );

  const onCheck = () => {
    if (busy.current) return;
    busy.current = true;
    // Typed weight arrives in the user's unit; the store (and backend logs)
    // stay canonical in POUNDS. Empty inputs log what the placeholder shows
    // (this set's last performance when known, the prescription otherwise).
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
          : lastSet
            ? String(lastSet.reps)
            : exercise.reps,
      weight: weightValid
        ? `${roundLb(unit === 'kg' ? kgToLb(typedWeight) : typedWeight)} lb`
        : lastSet?.weightLb != null
          ? `${roundLb(lastSet.weightLb)} lb`
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
          <Text style={styles.setCardTarget}>{targetLine}</Text>
        </View>
        {/* Always occupies its line. `lastPerf` starts null and resolves a
            beat later, so this text used to appear from nothing and push the
            weight and rep inputs down — while the user was reaching for them
            mid-set. Reserving the row keeps the deck still; only the words
            arrive. (The Target above still resolves late by design: the plan
            prescription is a true answer until history sharpens it.) */}
        <Text style={styles.lastTimeLine} numberOfLines={1}>
          {lastTimeLine ?? ' '}
        </Text>
        <View style={styles.inputRow}>
          <View style={styles.inputBox}>
            <Text style={styles.inputLabel}>
              {timedUnit ? `TIME (${timedUnit.toUpperCase()})` : 'REPS'}
            </Text>
            <TextInput
              style={styles.input}
              accessibilityLabel={timedUnit ? `Time in ${timedUnit}` : 'Reps'}
              value={reps}
              onChangeText={setReps}
              placeholder={
                timedUnit
                  ? timedMatch![1]
                  : lastSet
                    ? String(lastSet.reps)
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
              accessibilityLabel={`Weight in ${unit}`}
              value={weightIn}
              onChangeText={setWeightIn}
              placeholder={
                lastSet?.weightLb != null
                  ? String(
                      Math.round(unit === 'kg' ? lbToKg(lastSet.weightLb) : lastSet.weightLb),
                    )
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
    addSetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.border,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      marginTop: spacing.sm,
    },
    addSetLabel: {
      ...sfPro,
      fontSize: text.footnote,
      fontWeight: weight.semibold,
      color: c.primary,
    },
    completeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      height: 50,
      borderRadius: radius.pill,
      backgroundColor: GOLD,
      marginTop: spacing.md,
      shadowColor: c.shadow,
      ...elevation.level2,
    },
    completeButtonLabel: {
      ...sfPro,
      fontSize: text.callout,
      fontWeight: weight.semibold,
      // Constant near-black on the theme-invariant gold (white fails 4.5:1).
      color: '#1C1C1E',
    },
    todayNudgeWrap: {
      marginBottom: spacing.md,
    },
    todayNudge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: c.primarySoft,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    todayNudgeText: {
      ...sfPro,
      flex: 1,
      fontSize: text.footnote,
      fontWeight: weight.medium,
      color: c.textSecondary,
    },
    todayNudgeAction: {
      ...sfPro,
      fontSize: text.footnote,
      fontWeight: weight.bold,
      color: c.primary,
    },
    todayNudgeError: {
      ...sfPro,
      fontSize: text.caption,
      color: c.error,
      marginTop: spacing.xs,
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
    /**
     * `accent`, not the raw GOLD brand constant.
     *
     * GOLD (#F5A623) is a FILL colour. As small text it measures 2.03:1 on a
     * white card and 1.82:1 on the grey page — well under AA, and the app's
     * light theme is the default. `accent` is the palette's warm attention
     * colour (#9C4E00 light / #FFB340 dark) and clears 4.5:1 in both modes by
     * construction: 5.99:1 and 9.31:1. GOLD stays wherever it is a SHAPE —
     * rings, checkmarks, the rosette — because a large filled form is legible
     * at a ratio small type is not.
     */
    statValueResting: {
      color: c.accent,
      fontVariant: ['tabular-nums'],
    },
    statValue: {
      ...sfPro,
      fontSize: text.headline,
      // No explicit lineHeight: it fights adjustsFontSizeToFit on iOS — a
      // shrunk value renders low inside the fixed line box, sitting visibly
      // below its neighbours. All three tiles share this style, so heights
      // stay equal without it.
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
