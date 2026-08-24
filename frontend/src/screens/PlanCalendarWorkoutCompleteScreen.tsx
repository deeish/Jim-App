import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  duration as motionDuration,
  easing as motionEasing,
  elevation,
  leading,
  radius,
  spacing,
  spring,
  text,
  tracking,
  useTheme,
  weight,
  type ColorPalette,
} from '../theme';
import { useTabBarInset } from '../navigation/useTabBarInset';
import RosetteSeal from '../components/RosetteSeal';
import {
  GOLD,
  MUSCLE_COLORS,
  MUSCLE_EDGE,
  MUSCLE_INK,
  buzzEditApplied,
  buzzSelection,
  buzzTap,
  fromIso,
  muscleGradient,
  sfPro,
  shortDate,
  todayIso,
  weekdayIndex,
  WEEKDAYS,
  type PlanCalendarParamList,
  type PrototypeMuscle,
} from '../lib/planCalendarPrototype';
import {
  celebrationBaselines,
  dayHasLocalLogs,
  getSetLogs,
  isDayFullyLogged,
  loggedSessionsFor,
  plannedDayForDate,
  saveDayAsWorkout,
  sessionStartIso,
  subscribePlanCalendar,
  type SetLog,
} from '../lib/planCalendarPrototypeStore';
import {
  calendarSessionsFromLogs,
  dominantMuscle,
  formatClock,
  loggedDurationSeconds,
  parseRepsCount,
  parseWeightLb,
  sessionsFromWorkoutLogs,
  streakWithSession,
} from '../lib/sessionCelebration';
import {
  collectSessionAchievements,
  formatAchievementDetail,
  formatAchievementLabel,
  summarizeSessionTotals,
  type SessionAchievement,
} from '../lib/sessionAchievements';
import { formatVolumeFromLb, formatWeightCompactFromLb, type WeightUnit } from '../lib/weightDisplay';
import { useUserPreferences } from '../contexts/UserPreferencesContext';

type Nav = NativeStackNavigationProp<PlanCalendarParamList, 'PlanCalendarWorkoutComplete'>;
type Route = RouteProp<PlanCalendarParamList, 'PlanCalendarWorkoutComplete'>;

/** Hero seal on the Moment; the morph shrinks it onto the Ledger header. */
const HERO_SEAL = 84;
const HEADER_SEAL = 26;
/** How far the Moment/Ledger layers slide during the crossfade. */
const LAYER_SHIFT = 32;
/** The Moment advances to the Ledger on its own after this long. */
const AUTO_ADVANCE_MS = 2800;

/** The Moment's celebratory dot burst — offsets from the hero seal's box. */
const PARTICLES: Array<{ dx: number; dy: number; size: number; color: string }> = [
  { dx: -34, dy: -6, size: 6, color: GOLD },
  { dx: -22, dy: 58, size: 5, color: '#FFD34D' },
  { dx: 24, dy: -18, size: 4, color: '#FFD34D' },
  { dx: 96, dy: 4, size: 5, color: GOLD },
  { dx: 104, dy: 52, size: 4, color: '#E8940F' },
  { dx: 58, dy: 92, size: 5, color: '#FFD34D' },
];

/** One receipt row on the Ledger. */
type LedgerRow = {
  key: string;
  name: string;
  /** Null for a history row whose exercise the plan no longer carries. */
  muscle: PrototypeMuscle | null;
  /** Best effort, in the deck's reps × weight grammar. */
  main: string;
  /** Set count — '4 sets', '2 of 3 sets', 'Not logged'. */
  sub: string;
  state: 'done' | 'partial' | 'empty';
  badge: SessionAchievement['kind'] | null;
};

function bestLoggedSet(logs: SetLog[]): { reps: number; weightLb?: number } | null {
  let best: { reps: number; weightLb?: number } | null = null;
  for (const l of logs) {
    const reps = parseRepsCount(l.reps);
    const weightLb = parseWeightLb(l.weight);
    if (!best) {
      best = { reps, weightLb };
      continue;
    }
    const bw = best.weightLb ?? 0;
    const cw = weightLb ?? 0;
    if (cw > bw || (cw === bw && reps > best.reps)) best = { reps, weightLb };
  }
  return best;
}

/** Staggered rise-in bound to one shared entry timeline (0 → 1). */
function Rise({
  timeline,
  start,
  end,
  style,
  children,
}: {
  timeline: SharedValue<number>;
  start: number;
  end: number;
  style?: object;
  children: React.ReactNode;
}) {
  const a = useAnimatedStyle(() => ({
    opacity: interpolate(timeline.value, [start, end], [0, 1], 'clamp'),
    transform: [
      { translateY: interpolate(timeline.value, [start, end], [14, 0], 'clamp') },
    ],
  }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

/**
 * The celebration flow behind "Complete Workout" — two phases in one screen:
 *
 * THE MOMENT: a charcoal poster (dark mode; the day's muscle gradient in
 * light) where the rosette seal stamps in, the duration counts up, and the
 * session's PB / beat-last-time claims rise in. Auto-advances, or tap /
 * swipe up.
 *
 * THE LEDGER: the session receipt — sets/volume tiles, a per-exercise ledger
 * in the deck's reps × weight grammar, "Save this workout", Done. The hero
 * seal MORPHS into the ledger header's seal (one shared transform), which is
 * the same mark the month grid stamps on the day.
 *
 * Stats are split across the phases on purpose (duration/streak/claims vs
 * sets/volume/receipt) — nothing repeats. Everything animates with
 * Reanimated + views + LinearGradient: OTA-safe, no new dependencies.
 */
export default function PlanCalendarWorkoutCompleteScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { dateIso } = route.params;
  // RECAP: the same page re-opened later from the day view's logged banner.
  // Same content, none of the first-run choreography — it lands on the
  // Ledger, nothing stamps or auto-advances, and the duration is withheld
  // (see heroSeconds). 'celebrate' is the finish-a-workout run.
  const recap = route.params.mode === 'recap';
  const { colors, mode } = useTheme();
  const dark = mode === 'dark';
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset();
  const { weightUnit } = useUserPreferences();
  const unit: WeightUnit = weightUnit === 'kg' ? 'kg' : 'lb';

  // Re-render when the baselines fetch lands (or any store update).
  const [, forceRender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribePlanCalendar(forceRender), []);

  const day = plannedDayForDate(dateIso);
  const date = fromIso(dateIso);
  const subtitle = `${day.title} · ${WEEKDAYS[weekdayIndex(date)]}, ${shortDate(date)}`;

  // Two sources, one page. This device's own set logs are richer — they know
  // the day's PLAN, so a cut-short session still lists what went unlogged —
  // and they are what the finish run itself renders. A day trained elsewhere
  // (another phone, before a reinstall, past the 14-day set-log window) has
  // none, and reads back from its stored workout log instead.
  const storedLogs = loggedSessionsFor(dateIso);
  const fromHistory = !dayHasLocalLogs(dateIso) && storedLogs.length > 0;
  const sessions = fromHistory
    ? sessionsFromWorkoutLogs(storedLogs)
    : calendarSessionsFromLogs(day.exercises, (i) => getSetLogs(dateIso, i));
  const totals = summarizeSessionTotals(sessions);
  const baselines = celebrationBaselines(dateIso);
  // Claims only from baselines captured before this day was logged — see
  // CelebrationBaselines.preLog. A recap of an older day has none, so it shows
  // the receipt without records rather than inventing one out of a later,
  // lighter session.
  const achievements =
    baselines?.preLog
      ? collectSessionAchievements(sessions, baselines.lastPerformance, baselines.personalBests)
      : [];
  const momentClaims = achievements.slice(0, 2);
  const badgeByExercise = new Map(achievements.map((a) => [a.exerciseId, a.kind]));
  const streak = baselines ? streakWithSession(baselines.statsSessions, date) : 0;

  // Duration is real only for a live TODAY session — a backdated log's
  // elapsed time means nothing, so the hero falls back to the exercise count
  // (which the Ledger doesn't show, keeping the phase split clean).
  //
  // ⚠ A RECAP must never recompute it: this measures now − first-set, so
  // revisiting at 9pm a session finished at 6am read "15:03:41". A recap takes
  // the elapsed time the workout log STORED instead, and shows the exercise
  // count when even that is unknown.
  const [liveSeconds] = useState<number | null>(() => {
    const start = sessionStartIso(dateIso);
    if (recap || !start || dateIso !== todayIso()) return null;
    return Math.max(0, Math.round((Date.now() - Date.parse(start)) / 1000));
  });
  const heroSeconds = recap ? loggedDurationSeconds(storedLogs) : liveSeconds;
  const [shownSeconds, setShownSeconds] = useState(0);
  useEffect(() => {
    // The count-up belongs to the finish moment; a recap shows the final time.
    if (recap || heroSeconds == null) return;
    const t0 = Date.now();
    const id = setInterval(() => {
      // Hold through the seal stamp, then ease the count up over 600ms.
      const k = Math.min(1, Math.max(0, (Date.now() - t0 - 500) / 600));
      setShownSeconds(Math.round(heroSeconds * (1 - Math.pow(1 - k, 3))));
      if (k >= 1) clearInterval(id);
    }, 33);
    return () => clearInterval(id);
  }, [heroSeconds, recap]);
  const displaySeconds = recap ? (heroSeconds ?? 0) : shownSeconds;

  // ---- The Moment's wash: charcoal in dark mode, muscle gradient in light.
  const historyIds = new Set(
    sessions.map((s) => s.exercise.exerciseId).filter((id): id is string => !!id),
  );
  const domMuscle =
    dominantMuscle(
      day.exercises.map((ex, i) => ({
        muscle: ex.muscle,
        logged: fromHistory
          ? !!ex.exerciseId && historyIds.has(ex.exerciseId)
          : getSetLogs(dateIso, i).length > 0,
      })),
    ) ?? 'Chest';
  const momentBg: [string, string, ...string[]] = dark
    ? ['#2A2E36', '#14161B', '#0A0D13']
    : muscleGradient(domMuscle);
  const ink = dark ? '#FFFFFF' : MUSCLE_INK[domMuscle];
  const whiteInk = ink === '#FFFFFF';
  const inkSoft = whiteInk ? 'rgba(255,255,255,0.75)' : 'rgba(28,28,30,0.72)';
  const inkFaint = whiteInk ? 'rgba(255,255,255,0.65)' : 'rgba(28,28,30,0.6)';
  const pillBg = whiteInk ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.4)';

  // ---- Phase machinery ----------------------------------------------------
  // A recap opens ON the Ledger — the receipt is what someone comes back for.
  // The Moment stays one "‹ Summary" tap away.
  const [phase, setPhase] = useState<'moment' | 'ledger'>(recap ? 'ledger' : 'moment');
  const phaseRef = useRef<'moment' | 'ledger'>(recap ? 'ledger' : 'moment');
  const phaseT = useSharedValue(recap ? 1 : 0);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The morph is over and the seal now belongs to the Ledger's scrolling
  // content rather than to the screen-positioned overlay. A recap never
  // morphs, so it is settled from the first frame.
  const [sealSettled, setSealSettled] = useState(recap);

  const goLedger = useCallback(() => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = null;
    if (phaseRef.current === 'ledger') return;
    phaseRef.current = 'ledger';
    buzzSelection();
    setPhase('ledger');
    phaseT.value = withTiming(
      1,
      {
        duration: motionDuration.slow,
        easing: Easing.bezier(...motionEasing.inOut),
      },
      // Hand the seal over to the Ledger's own content the moment it lands.
      // Not on an interrupted run: "‹ Summary" mid-morph must keep the
      // overlay, which is what carries it back to the hero slot.
      (finished) => {
        'worklet';
        if (finished) runOnJS(setSealSettled)(true);
      },
    );
  }, [phaseT]);

  // "‹ Summary" — returning disables the auto-advance so the Moment holds.
  const goMoment = useCallback(() => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = null;
    if (phaseRef.current === 'moment') return;
    phaseRef.current = 'moment';
    buzzTap();
    setPhase('moment');
    // Overlay takes the seal back before the reverse morph starts.
    setSealSettled(false);
    phaseT.value = withTiming(0, {
      duration: motionDuration.slow,
      easing: Easing.bezier(...motionEasing.inOut),
    });
  }, [phaseT]);

  useEffect(() => {
    // A recap already starts on the Ledger; nothing to advance to.
    if (recap) return;
    autoTimer.current = setTimeout(goLedger, AUTO_ADVANCE_MS);
    return () => {
      if (autoTimer.current) clearTimeout(autoTimer.current);
    };
    // Mount-only: the timer must not restart on re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const backToDay = useCallback(() => {
    buzzTap();
    navigation.navigate('PlanCalendarDay', { dateIso });
  }, [navigation, dateIso]);

  const swipeUp = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetY([-16, 16])
        .onEnd((e) => {
          if (e.translationY <= -40) goLedger();
        }),
    [goLedger],
  );

  // ---- Entry + morph animation --------------------------------------------
  // One entry timeline staggers the Moment's rows; the seal gets its own
  // spring stamp; phaseT crossfades the layers and drives the seal morph.
  const entry = useSharedValue(recap ? 1 : 0);
  const stamp = useSharedValue(recap ? 1 : 2.1);
  const sealOpacity = useSharedValue(0);
  const bob = useSharedValue(0);
  useEffect(() => {
    // A recap opens already at rest: the seal sits in the ledger header, the
    // rows are up. Nothing stamps in — you're re-reading a receipt, not
    // finishing a workout. (The bob still runs: it's the Moment's "swipe up
    // for details" hint, which still applies if you tap back to the poster.)
    if (recap) {
      // The inline seal is already in the header slot, so the overlay is
      // hidden here — it only needs to be ready in case "‹ Summary" sends it
      // back to the hero.
      sealOpacity.value = 1;
      bob.value = withRepeat(
        withSequence(
          withTiming(-5, { duration: 700, easing: Easing.bezier(...motionEasing.inOut) }),
          withTiming(0, { duration: 700, easing: Easing.bezier(...motionEasing.inOut) }),
        ),
        -1,
      );
      return;
    }
    entry.value = withDelay(
      350,
      withTiming(1, { duration: 700, easing: Easing.bezier(...motionEasing.standard) }),
    );
    sealOpacity.value = withDelay(150, withTiming(1, { duration: 200 }));
    // The stamp: oversized and transparent → springs down onto the page.
    stamp.value = withDelay(150, withSpring(1, spring.bouncy));
    bob.value = withDelay(
      1300,
      withRepeat(
        withSequence(
          withTiming(-5, { duration: 700, easing: Easing.bezier(...motionEasing.inOut) }),
          withTiming(0, { duration: 700, easing: Easing.bezier(...motionEasing.inOut) }),
        ),
        -1,
      ),
    );
    // Mount-only entry choreography.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The two seal anchors, measured relative to the screen root so the overlay
  // seal can glide between them. Sensible defaults cover the pre-measure frame.
  const rootRef = useRef<View>(null);
  const heroSlotRef = useRef<View>(null);
  const headerSlotRef = useRef<View>(null);
  const heroAnchor = useSharedValue<{ x: number; y: number }>({ x: spacing.xxl, y: 160 });
  const headerAnchor = useSharedValue<{ x: number; y: number }>({ x: spacing.xl, y: 120 });
  const measureAnchor = useCallback(
    (which: 'hero' | 'header') => () => {
      const node = which === 'hero' ? heroSlotRef.current : headerSlotRef.current;
      const root = rootRef.current;
      if (!node || !root) return;
      requestAnimationFrame(() => {
        node.measureInWindow((x, y) => {
          root.measureInWindow((rx, ry) => {
            if ([x, y, rx, ry].some((v) => typeof v !== 'number' || Number.isNaN(v))) return;
            // The layers are mid-slide when this measures (the ledger sits
            // LAYER_SHIFT low at phase 0, the moment LAYER_SHIFT high at
            // phase 1) — record the slot's RESTING position, or the seal
            // lands offset by exactly that slide.
            const shift =
              which === 'header'
                ? LAYER_SHIFT * (1 - phaseT.value)
                : -LAYER_SHIFT * phaseT.value;
            const value = { x: x - rx, y: y - ry - shift };
            if (which === 'hero') heroAnchor.value = value;
            else headerAnchor.value = value;
          });
        });
      });
    },
    [heroAnchor, headerAnchor],
  );

  const momentStyle = useAnimatedStyle(() => ({
    opacity: 1 - phaseT.value,
    transform: [{ translateY: -LAYER_SHIFT * phaseT.value }],
  }));
  const ledgerStyle = useAnimatedStyle(() => ({
    opacity: phaseT.value,
    transform: [{ translateY: LAYER_SHIFT * (1 - phaseT.value) }],
  }));
  const washStyle = useAnimatedStyle(() => ({ opacity: 1 - phaseT.value }));
  const sealStyle = useAnimatedStyle(() => {
    // Scale around the seal's center, so the translate targets the box's
    // top-left corner at the current scale.
    const s = interpolate(phaseT.value, [0, 1], [1, HEADER_SEAL / HERO_SEAL]) * stamp.value;
    const x = interpolate(phaseT.value, [0, 1], [heroAnchor.value.x, headerAnchor.value.x]);
    const y = interpolate(phaseT.value, [0, 1], [heroAnchor.value.y, headerAnchor.value.y]);
    return {
      // Yields to the inline seal once the morph lands, so nothing hovers
      // over the receipt while it scrolls.
      opacity: sealSettled ? 0 : sealOpacity.value,
      transform: [
        { translateX: x - (HERO_SEAL * (1 - s)) / 2 },
        { translateY: y - (HERO_SEAL * (1 - s)) / 2 },
        { scale: s },
      ],
    };
    // Explicit dep: sealSettled is plain React state, not a shared value.
  }, [sealSettled]);
  const bobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));
  const particleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(entry.value, [0.15, 0.4, 1], [0, 0.85, 0.4], 'clamp'),
    transform: [{ scale: interpolate(entry.value, [0.15, 0.4], [0.3, 1], 'clamp') }],
  }));

  // ---- Save this workout ---------------------------------------------------
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const onSave = useCallback(async () => {
    buzzTap();
    setSaveState('saving');
    try {
      await saveDayAsWorkout(dateIso);
      buzzEditApplied();
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, [dateIso]);

  // ---- Ledger rows ---------------------------------------------------------
  // A day read back from history lists what the LOG holds, in the order it was
  // performed — not today's plan for that weekday, which may have been edited
  // or replaced since. Nothing is "Not logged" there: an unrecorded set left
  // no trace to report. Muscle colour is recovered by matching the plan's
  // exercise ids; anything the plan no longer carries gets a neutral dot.
  const muscleById = new Map(
    day.exercises.filter((ex) => ex.exerciseId).map((ex) => [ex.exerciseId as string, ex.muscle]),
  );
  const historyRows: LedgerRow[] = sessions.map((s, i) => {
    const best = s.completedSets.reduce<{ reps: number; weight?: number } | null>((acc, cur) => {
      if (!acc) return { reps: cur.reps, weight: cur.weight };
      const aw = acc.weight ?? 0;
      const cw = cur.weight ?? 0;
      return cw > aw || (cw === aw && cur.reps > acc.reps)
        ? { reps: cur.reps, weight: cur.weight }
        : acc;
    }, null);
    const count = s.completedSets.length;
    // Timed work (planks, cardio bouts) logs zero reps and the log keeps no
    // duration per set, so there is no honest rep figure to print — the set
    // count below carries the row instead of a bogus "0 reps".
    const weightText = best?.weight != null ? formatWeightCompactFromLb(best.weight, unit) : null;
    const main = !best
      ? '—'
      : best.reps > 0
        ? weightText != null
          ? `${best.reps} × ${weightText}`
          : `${best.reps} reps`
        : (weightText ?? '—');
    return {
      key: `${i}-${s.exercise.name}`,
      name: s.exercise.name,
      muscle: (s.exercise.exerciseId && muscleById.get(s.exercise.exerciseId)) || null,
      main,
      sub: `${count} ${count === 1 ? 'set' : 'sets'}`,
      state: 'done',
      badge: (s.exercise.exerciseId && badgeByExercise.get(s.exercise.exerciseId)) || null,
    };
  });
  const planRows: LedgerRow[] = day.exercises.map((ex, i) => {
    const logs = getSetLogs(dateIso, i);
    const state: LedgerRow['state'] =
      logs.length === 0 ? 'empty' : logs.length >= ex.sets ? 'done' : 'partial';
    const best = bestLoggedSet(logs);
    let main = '—';
    if (best) {
      if (/min|sec/i.test(ex.reps)) {
        const raw = logs[logs.length - 1];
        main = best.weightLb != null
          ? `${raw.reps} @ ${formatWeightCompactFromLb(best.weightLb, unit)}`
          : raw.reps;
      } else if (best.weightLb != null) {
        main = `${best.reps} × ${formatWeightCompactFromLb(best.weightLb, unit)}`;
      } else {
        main = `${Math.max(...logs.map((l) => parseRepsCount(l.reps)))} reps`;
      }
    }
    const sub =
      state === 'empty'
        ? 'Not logged'
        : state === 'partial'
          ? `${logs.length} of ${ex.sets} sets`
          : `${logs.length} ${logs.length === 1 ? 'set' : 'sets'}`;
    return {
      key: `${i}-${ex.name}`,
      name: ex.name,
      muscle: ex.muscle,
      main,
      sub,
      state,
      badge: (ex.exerciseId && badgeByExercise.get(ex.exerciseId)) || null,
    };
  });
  const rows = fromHistory ? historyRows : planRows;
  // Only the local record knows what was skipped; a stored log carries no
  // record of the sets that were never performed.
  const cutShort = !fromHistory && !isDayFullyLogged(dateIso);

  return (
    <View ref={rootRef} style={styles.root} collapsable={false}>
      {/* The Moment's wash, crossfading to the flat page as the Ledger rises. */}
      <Animated.View style={[StyleSheet.absoluteFillObject, washStyle]} pointerEvents="none">
        <LinearGradient
          colors={momentBg}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        {dark && (
          // Faked radial glow behind the seal (no radial gradients in RN):
          // stacked soft gold circles.
          <>
            <View style={[styles.glow, { width: 320, height: 320, opacity: 0.5 }]} />
            <View style={[styles.glow, { width: 210, height: 210, opacity: 0.7, top: 96, left: -22 }]} />
          </>
        )}
      </Animated.View>

      {/* ---- THE LEDGER (beneath the Moment; rises as it leaves) ---- */}
      <Animated.View
        style={[styles.layer, ledgerStyle]}
        pointerEvents={phase === 'ledger' ? 'auto' : 'none'}
      >
        <ScrollView
          style={styles.ledgerScroll}
          contentContainerStyle={[
            styles.ledgerContent,
            { paddingTop: insets.top + spacing.md },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            style={styles.backPill}
            activeOpacity={0.8}
            onPress={goMoment}
            accessibilityRole="button"
            accessibilityLabel="Back to summary"
          >
            <Ionicons name="chevron-back" size={16} color={colors.primary} />
            <Text style={styles.backPillLabel}>Summary</Text>
          </TouchableOpacity>

          <View style={styles.ledgerHeaderRow}>
            {/* The morphing seal lands here, and once it has, the REAL seal
                takes over inside this slot — see sealSettled. The overlay is
                screen-positioned, so leaving it in charge left the seal
                hovering over the list as the receipt scrolled under it. */}
            <View
              ref={headerSlotRef}
              collapsable={false}
              onLayout={measureAnchor('header')}
              style={styles.headerSealSlot}
            >
              {sealSettled && (
                <View style={styles.headerSealInline} pointerEvents="none">
                  <RosetteSeal size={HERO_SEAL} />
                </View>
              )}
            </View>
            <Text style={styles.ledgerTitle}>Workout complete</Text>
          </View>
          <Text style={styles.ledgerSub}>{subtitle}</Text>

          <View style={styles.tileRow}>
            <View style={styles.tile}>
              <Text style={styles.tileLabel}>SETS</Text>
              <Text style={styles.tileValue}>{totals.completedSets}</Text>
            </View>
            {totals.hasWeightedWork && (
              <View style={styles.tile}>
                <Text style={styles.tileLabel}>VOLUME</Text>
                <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {formatVolumeFromLb(totals.volumeLb, unit)}
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.sectionLabel}>EXERCISES</Text>
          <View style={styles.rowsWrap}>
            {rows.map((row) => (
              <View key={row.key} style={styles.exRow}>
                <View
                  style={[
                    styles.muscleDot,
                    row.muscle
                      ? {
                          backgroundColor: MUSCLE_COLORS[row.muscle],
                          borderColor: MUSCLE_EDGE[row.muscle],
                        }
                      : { backgroundColor: colors.textMuted, borderColor: colors.textMuted },
                  ]}
                />
                <Text
                  style={[styles.exName, row.state !== 'done' && styles.exNameMuted]}
                  numberOfLines={1}
                >
                  {row.name}
                </Text>
                {row.badge === 'personal-best' && (
                  <View style={styles.pbPill}>
                    <Text style={styles.pbPillLabel}>PB</Text>
                  </View>
                )}
                {row.badge === 'beat-last-time' && (
                  <Ionicons name="trending-up-outline" size={14} color={colors.secondary} />
                )}
                <View style={styles.exValues}>
                  <Text style={[styles.exMain, row.state !== 'done' && styles.exValueMuted]}>
                    {row.main}
                  </Text>
                  <Text style={styles.exSub}>{row.sub}</Text>
                </View>
                {row.state === 'done' ? (
                  <Ionicons name="checkmark-circle" size={16} color={GOLD} />
                ) : (
                  <Ionicons name="remove-circle-outline" size={16} color={colors.textMuted} />
                )}
              </View>
            ))}
          </View>

          {/* saveDayAsWorkout saves the DAY'S prescriptions, so it needs a day
              to save. A history recap whose plan slot is gone (program ended,
              slot removed) has none — offering the button would only ever
              return "Couldn't save". */}
          {day.exercises.length > 0 && (
          <View style={styles.saveCard}>
            <Ionicons name="bookmark-outline" size={18} color={GOLD} />
            <View style={styles.saveTextCol}>
              <Text style={styles.saveTitle}>Save this workout</Text>
              <Text style={styles.saveSub} numberOfLines={2}>
                {saveState === 'saved'
                  ? 'Saved — find it in Saved workouts.'
                  : saveState === 'error'
                    ? 'Couldn’t save — check your connection.'
                    : `Run ${day.title} again anytime from your library.`}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.saveButton, saveState === 'saved' && styles.saveButtonDone]}
              activeOpacity={0.8}
              disabled={saveState === 'saving' || saveState === 'saved'}
              onPress={onSave}
              accessibilityRole="button"
              accessibilityLabel="Save this workout"
            >
              {saveState === 'saved' ? (
                <Ionicons name="checkmark" size={16} color={GOLD} />
              ) : (
                <Text style={styles.saveButtonLabel}>
                  {saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Retry' : 'Save'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
          )}
        </ScrollView>

        <View style={[styles.doneBar, { paddingBottom: tabBarInset + spacing.md }]}>
          <TouchableOpacity
            style={styles.doneButton}
            activeOpacity={0.85}
            onPress={backToDay}
            accessibilityRole="button"
            accessibilityLabel="Done"
          >
            <Text style={styles.doneLabel}>Done</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* ---- THE MOMENT (tap or swipe up to advance) ---- */}
      <GestureDetector gesture={swipeUp}>
        <Animated.View
          style={[styles.layer, momentStyle]}
          pointerEvents={phase === 'moment' ? 'auto' : 'none'}
        >
          <Pressable
            style={[
              styles.momentContent,
              {
                paddingTop: insets.top + spacing.md,
                // Clear the floating tab bar, or it overlaps the bottom hint.
                paddingBottom: tabBarInset + spacing.md,
              },
            ]}
            onPress={goLedger}
            accessibilityLabel="Show session details"
          >
            <View style={styles.momentHeaderRow}>
              <TouchableOpacity
                style={[styles.momentBackPill, { backgroundColor: pillBg }]}
                activeOpacity={0.8}
                onPress={backToDay}
                accessibilityRole="button"
                accessibilityLabel="Back to day"
              >
                <Ionicons name="chevron-back" size={16} color={ink} />
                <Text style={[styles.momentBackLabel, { color: ink }]}>Day</Text>
              </TouchableOpacity>
              <Text style={[styles.momentDate, { color: inkSoft }]}>{subtitle}</Text>
            </View>

            {/* The stamp target: an empty slot the overlay seal covers. */}
            <View style={styles.heroSealWrap}>
              <View
                ref={heroSlotRef}
                collapsable={false}
                onLayout={measureAnchor('hero')}
                style={{ width: HERO_SEAL, height: HERO_SEAL }}
              />
              {PARTICLES.map((p, i) => (
                <Animated.View
                  key={i}
                  style={[
                    styles.particle,
                    particleStyle,
                    {
                      left: p.dx,
                      top: p.dy,
                      width: p.size,
                      height: p.size,
                      backgroundColor: p.color,
                    },
                  ]}
                />
              ))}
            </View>

            <Rise timeline={entry} start={0.1} end={0.35} style={styles.momentTitleWrap}>
              <Text style={[styles.momentTitle, { color: ink }]}>Workout</Text>
              <Text style={[styles.momentTitle, { color: ink }]}>complete.</Text>
            </Rise>

            <Rise timeline={entry} start={0.25} end={0.5} style={styles.heroStatWrap}>
              <Text style={[styles.heroStatValue, { color: ink }]}>
                {heroSeconds != null ? formatClock(displaySeconds) : String(totals.exercisesWorked)}
              </Text>
              <Text style={[styles.heroStatLabel, { color: inkSoft }]}>
                {heroSeconds != null ? 'DURATION' : 'EXERCISES'}
              </Text>
            </Rise>

            {streak > 0 && (
              <Rise timeline={entry} start={0.4} end={0.65} style={styles.streakWrap}>
                <View style={dark ? styles.streakPill : [styles.streakPill, styles.streakPillLight]}>
                  <Ionicons name="flame" size={13} color={dark ? GOLD : '#E08D0C'} />
                  <Text style={[styles.streakLabel, !dark && styles.streakLabelLight]}>
                    {streak}-week streak
                  </Text>
                </View>
              </Rise>
            )}

            {momentClaims.length > 0 && (
              <Rise timeline={entry} start={0.55} end={0.85} style={styles.claimsWrap}>
                {momentClaims.map((a) => {
                  const pb = a.kind === 'personal-best';
                  return (
                    <View
                      key={`${a.kind}-${a.exerciseId}`}
                      style={[
                        styles.claimCard,
                        dark
                          ? pb
                            ? styles.claimCardGold
                            : styles.claimCardGreen
                          : styles.claimCardLight,
                      ]}
                    >
                      <Ionicons
                        name={pb ? 'trophy-outline' : 'trending-up-outline'}
                        size={20}
                        color={pb ? (dark ? GOLD : '#E08D0C') : colors.secondary}
                      />
                      <View style={styles.claimTextCol}>
                        <Text
                          style={[
                            styles.claimKicker,
                            { color: pb ? (dark ? GOLD : '#E08D0C') : colors.secondary },
                          ]}
                        >
                          {formatAchievementLabel(a.kind)}
                        </Text>
                        <Text
                          style={[styles.claimName, { color: dark ? '#FFFFFF' : '#1C1C1E' }]}
                          numberOfLines={1}
                        >
                          {a.exerciseName}
                        </Text>
                        <Text
                          style={[
                            styles.claimDetail,
                            { color: dark ? 'rgba(255,255,255,0.65)' : '#6B6B70' },
                          ]}
                        >
                          {formatAchievementDetail(a, unit)}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </Rise>
            )}

            {cutShort && (
              <Rise timeline={entry} start={0.6} end={0.85}>
                <Text style={[styles.cutShortNote, { color: inkFaint }]}>
                  {totals.completedSets} sets logged — cut short still counts.
                </Text>
              </Rise>
            )}

            <View style={styles.momentSpacer} />

            <Rise timeline={entry} start={0.8} end={1} style={styles.hintWrap}>
              <Animated.View style={bobStyle}>
                <Ionicons name="chevron-up" size={20} color={inkSoft} />
              </Animated.View>
              <Text style={[styles.hintLabel, { color: inkSoft }]}>SESSION DETAILS</Text>
            </Rise>
          </Pressable>
        </Animated.View>
      </GestureDetector>

      {/* The seal itself — one overlay gliding between its two anchors. */}
      <Animated.View style={[styles.sealOverlay, sealStyle]} pointerEvents="none">
        <RosetteSeal size={HERO_SEAL} />
      </Animated.View>
    </View>
  );
}

function createStyles(c: ColorPalette) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: c.background,
      overflow: 'hidden',
    },
    layer: {
      ...StyleSheet.absoluteFillObject,
    },
    glow: {
      position: 'absolute',
      top: 40,
      left: -78,
      borderRadius: radius.pill,
      backgroundColor: 'rgba(245,166,35,0.07)',
    },
    sealOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: HERO_SEAL,
      height: HERO_SEAL,
    },
    headerSealSlot: {
      width: HEADER_SEAL,
      height: HEADER_SEAL,
    },
    // The settled seal renders at HERO_SEAL and is scaled down by exactly the
    // factor the morph ends on, so the hand-off from the overlay is pixel-for-
    // pixel — a natively-drawn 26px rosette would rasterise differently and
    // pop. Absolute + centred on the slot: it must not resize the header row.
    headerSealInline: {
      position: 'absolute',
      left: -(HERO_SEAL - HEADER_SEAL) / 2,
      top: -(HERO_SEAL - HEADER_SEAL) / 2,
      width: HERO_SEAL,
      height: HERO_SEAL,
      transform: [{ scale: HEADER_SEAL / HERO_SEAL }],
    },

    // ---- Moment ----
    momentContent: {
      flex: 1,
      paddingHorizontal: spacing.xxl,
    },
    momentHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    momentBackPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderRadius: radius.pill,
      paddingVertical: spacing.sm - 2,
      paddingLeft: spacing.sm,
      paddingRight: spacing.md,
    },
    momentBackLabel: {
      ...sfPro,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: weight.semibold,
    },
    momentDate: {
      ...sfPro,
      fontSize: text.footnote,
      lineHeight: leading.footnote,
    },
    heroSealWrap: {
      marginTop: spacing.xxxl + spacing.md,
      width: HERO_SEAL,
      height: HERO_SEAL,
    },
    particle: {
      position: 'absolute',
      borderRadius: radius.pill,
    },
    momentTitleWrap: {
      marginTop: spacing.xxl + spacing.xs,
    },
    momentTitle: {
      ...sfPro,
      fontSize: 46,
      lineHeight: 50,
      fontWeight: weight.heavy,
      letterSpacing: -0.5,
    },
    heroStatWrap: {
      marginTop: spacing.xxxl,
    },
    heroStatValue: {
      ...sfPro,
      fontSize: 48,
      lineHeight: 52,
      fontWeight: weight.heavy,
    },
    heroStatLabel: {
      ...sfPro,
      marginTop: spacing.xxs,
      fontSize: text.caption,
      lineHeight: leading.caption,
      fontWeight: weight.semibold,
      letterSpacing: tracking.widest,
    },
    streakWrap: {
      marginTop: spacing.xl,
      alignSelf: 'flex-start',
    },
    streakPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs + 2,
      backgroundColor: 'rgba(245,166,35,0.15)',
      borderRadius: radius.pill,
      paddingVertical: spacing.sm - 1,
      paddingHorizontal: spacing.lg - 2,
    },
    streakPillLight: {
      backgroundColor: 'rgba(255,255,255,0.85)',
    },
    streakLabel: {
      ...sfPro,
      fontSize: text.footnote,
      lineHeight: leading.footnote,
      fontWeight: weight.semibold,
      color: GOLD,
    },
    streakLabelLight: {
      color: '#B36A00',
    },
    claimsWrap: {
      marginTop: spacing.xxl + spacing.xs,
      gap: spacing.sm,
    },
    claimCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      padding: spacing.lg - 2,
    },
    claimCardGold: {
      backgroundColor: 'rgba(245,166,35,0.1)',
      borderColor: 'rgba(245,166,35,0.35)',
    },
    claimCardGreen: {
      backgroundColor: 'rgba(76,195,138,0.1)',
      borderColor: 'rgba(76,195,138,0.35)',
    },
    claimCardLight: {
      backgroundColor: 'rgba(255,255,255,0.92)',
      borderColor: 'rgba(255,255,255,0.5)',
    },
    claimTextCol: {
      flex: 1,
    },
    claimKicker: {
      ...sfPro,
      fontSize: text.caption,
      lineHeight: leading.caption,
      fontWeight: weight.semibold,
      letterSpacing: tracking.wider,
      textTransform: 'uppercase',
    },
    claimName: {
      ...sfPro,
      fontSize: text.body,
      lineHeight: leading.body,
      fontWeight: weight.semibold,
    },
    claimDetail: {
      ...sfPro,
      fontSize: text.footnote,
      lineHeight: leading.footnote,
    },
    cutShortNote: {
      ...sfPro,
      marginTop: spacing.lg,
      fontSize: text.footnote,
      lineHeight: leading.footnote,
    },
    momentSpacer: {
      flex: 1,
    },
    hintWrap: {
      alignItems: 'center',
      gap: spacing.xxs,
    },
    hintLabel: {
      ...sfPro,
      fontSize: text.footnote,
      lineHeight: leading.footnote,
      fontWeight: weight.semibold,
      letterSpacing: tracking.wide,
    },

    // ---- Ledger ----
    ledgerScroll: {
      flex: 1,
    },
    ledgerContent: {
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xl,
    },
    backPill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.pill,
      paddingVertical: spacing.sm - 2,
      paddingLeft: spacing.sm,
      paddingRight: spacing.md,
      marginBottom: spacing.md,
    },
    backPillLabel: {
      ...sfPro,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: weight.semibold,
      color: c.primary,
    },
    ledgerHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 2,
    },
    ledgerTitle: {
      ...sfPro,
      fontSize: text.title,
      lineHeight: leading.title,
      fontWeight: weight.bold,
      color: c.text,
    },
    ledgerSub: {
      ...sfPro,
      marginTop: spacing.xs + 2,
      fontSize: text.footnote,
      lineHeight: leading.footnote,
      color: c.textMuted,
    },
    tileRow: {
      flexDirection: 'row',
      gap: spacing.md,
      marginTop: spacing.md,
    },
    tile: {
      flex: 1,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.sm,
      alignItems: 'center',
      gap: spacing.xxs,
    },
    tileLabel: {
      ...sfPro,
      fontSize: text.caption,
      lineHeight: leading.caption,
      fontWeight: weight.semibold,
      letterSpacing: tracking.wider,
      color: c.textMuted,
    },
    tileValue: {
      ...sfPro,
      fontSize: text.headline,
      lineHeight: leading.headline,
      fontWeight: weight.bold,
      color: c.text,
    },
    sectionLabel: {
      ...sfPro,
      marginTop: spacing.xl,
      marginBottom: spacing.sm,
      fontSize: text.caption,
      lineHeight: leading.caption,
      fontWeight: weight.semibold,
      letterSpacing: tracking.widest,
      color: c.textMuted,
    },
    rowsWrap: {
      gap: spacing.sm,
    },
    exRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 2,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.lg - 2,
    },
    muscleDot: {
      width: 10,
      height: 10,
      borderRadius: radius.pill,
      borderWidth: 1,
    },
    exName: {
      ...sfPro,
      flex: 1,
      fontSize: text.body,
      lineHeight: leading.body,
      fontWeight: weight.semibold,
      color: c.text,
    },
    exNameMuted: {
      color: c.textSecondary,
    },
    pbPill: {
      backgroundColor: 'rgba(245,166,35,0.15)',
      borderRadius: radius.pill,
      paddingVertical: 2,
      paddingHorizontal: spacing.sm,
    },
    pbPillLabel: {
      ...sfPro,
      fontSize: 10,
      lineHeight: 14,
      fontWeight: weight.bold,
      letterSpacing: tracking.wide,
      color: GOLD,
    },
    exValues: {
      alignItems: 'flex-end',
    },
    exMain: {
      ...sfPro,
      fontSize: text.footnote,
      lineHeight: leading.footnote,
      color: c.textSecondary,
    },
    exValueMuted: {
      color: c.textMuted,
    },
    exSub: {
      ...sfPro,
      fontSize: text.caption,
      lineHeight: leading.caption,
      color: c.textMuted,
    },
    saveCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.lg - 2,
      marginTop: spacing.lg,
    },
    saveTextCol: {
      flex: 1,
    },
    saveTitle: {
      ...sfPro,
      fontSize: text.body,
      lineHeight: leading.body,
      fontWeight: weight.semibold,
      color: c.text,
    },
    saveSub: {
      ...sfPro,
      fontSize: text.caption,
      lineHeight: leading.caption,
      color: c.textMuted,
    },
    saveButton: {
      height: 36,
      minWidth: 64,
      paddingHorizontal: spacing.lg,
      borderWidth: 1.5,
      borderColor: GOLD,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveButtonDone: {
      borderColor: 'rgba(245,166,35,0.4)',
    },
    saveButtonLabel: {
      ...sfPro,
      fontSize: text.body,
      lineHeight: leading.body,
      fontWeight: weight.semibold,
      color: GOLD,
    },
    doneBar: {
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.sm,
    },
    doneButton: {
      height: 50,
      borderRadius: radius.pill,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.shadow,
      ...elevation.level2,
    },
    doneLabel: {
      ...sfPro,
      fontSize: text.callout,
      lineHeight: leading.callout,
      fontWeight: weight.semibold,
      color: c.onPrimary,
    },
  });
}
