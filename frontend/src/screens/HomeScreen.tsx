import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import { ProfileAvatarDisc } from '../components/ProfileAvatarDisc';
import WhatsNewModal from '../components/WhatsNewModal';
import { LATEST_CHANGELOG_ID } from '../constants/changelog';
import { getSeenChangelogId, setSeenChangelogId } from '../lib/whatsNewStorage';
import type { RootNavigatorParamList } from '../types/navigation';
import { RootTabParamList } from '../components/NavBar';
import { LinearGradient } from 'expo-linear-gradient';
import { getCurrentPlanWithWeekly, planSlotForWorkout } from '../services/planService';
import type { ApiPlan, ApiPlanWorkout } from '../services/planService';
import { getWorkoutStats } from '../services/workoutService';
import {
  MUSCLE_EDGE,
  MUSCLE_INK,
  addDays,
  dayMuscles,
  mondayOf,
  muscleGradient,
  todayIso,
  toIso,
} from '../lib/planCalendarPrototype';
import {
  calendarDataMode,
  ensureLiveCalendarData,
  ensureLogsForMonth,
  inProgressSession,
  isDayCompleted,
  isDaySkipped,
  plannedDayForDate,
  subscribePlanCalendar,
} from '../lib/planCalendarPrototypeStore';
import type { Workout, WorkoutStats } from '../types/workout';
import {
  latestCompletedSession,
  recentDayLabel,
  resolveHomeToday,
  weekTileLabel,
  type HomeTodayResult,
} from '../lib/homeToday';
import { formatTotalDuration, sessionLocalDay, summarizeProgress } from '../lib/progressStats';
import {
  resolveProgramWeekForCalendarOffset,
  lastContiguousProgramWeek,
  normalizeProgramWeekNumber,
  PLAN_WEEKDAY_NAMES_MONDAY_FIRST,
} from '../lib/planCalendar';
import RosetteSeal from '../components/RosetteSeal';
import QuickWorkoutSheet from '../components/QuickWorkoutSheet';
import { stripCoachAdviceBullets } from '../lib/planDetailLineDisplay';
import { leading, radius, spacing, text, tracking, weight } from '../theme';
import { useTabBarInset } from '../navigation/useTabBarInset';
import { haptics } from '../lib/haptics';
import { SkeletonCard } from '../components/Skeleton';
import {
  exercisesLikeFromPrescription,
  getPlanSlotDisplayMinutes,
  resolveWorkoutEtaMinutes,
} from '../lib/estimateWorkoutMinutes';

type HomeNavigation = BottomTabNavigationProp<RootTabParamList, 'Home'>;

function getGreeting(firstName?: string): string {
  const h = new Date().getHours();
  const time = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  return firstName ? `Good ${time}, ${firstName}!` : `Good ${time}`;
}

function formatTodayDateLine(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

// Time + count only: the muscle chips above the title now carry what the
// plan's focus text used to say, and glanceability research caps a card at
// one short meta line — the hero must read in three beats (what / how much / go).
function buildTodayMetaLine(workout: Workout, planSlot: ApiPlanWorkout | undefined): string {
  const parts: string[] = [];
  const displayMin = resolveWorkoutEtaMinutes(workout, planSlot ?? null);
  const n = workout.exercises?.length ?? 0;
  if (displayMin != null) parts.push(`Est. ${displayMin} min`);
  parts.push(`${n} ${n === 1 ? 'exercise' : 'exercises'}`);
  return parts.join(' · ');
}

function buildPendingSlotMeta(slot: ApiPlanWorkout): string {
  const parts: string[] = [];
  const displayMin = getPlanSlotDisplayMinutes(
    slot.durationMinutes,
    exercisesLikeFromPrescription(slot.exercises),
    undefined,
  );
  if (displayMin != null) parts.push(`${displayMin} min`);
  const detail = stripCoachAdviceBullets(slot.detailLine ?? '');
  if (detail) parts.push(detail);
  return parts.length ? parts.join(' · ') : 'Set up exercises from your plan';
}

function homeLoadErrorMessage(err: unknown): string {
  const e = err as { response?: { status?: number }; message?: string };
  const status = e.response?.status;
  if (status === 401) {
    return 'Session expired. Tap your avatar to sign in again.';
  }
  if (e.message === 'Network Error' || !e.response) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  return 'Could not load your plan. Pull down to refresh or try again in a moment.';
}

export default function HomeScreen() {
  const navigation = useNavigation<HomeNavigation>();
  const { colors } = useTheme();
  // The tab bar floats over this screen; keep the last cards clear of it.
  const tabBarInset = useTabBarInset();
  const { user } = useAuth();
  const { profileAvatarId, profileDisplayName } = useUserPreferences();
  const displayName = (profileDisplayName || user?.email?.split('@')[0] || '').split(' ')[0];

  const [whatsNewVisible, setWhatsNewVisible] = useState(false);
  const [hasUnseenNews, setHasUnseenNews] = useState(false);
  const whatsNewAutoShown = useRef(false);
  const [homeToday, setHomeToday] = useState<HomeTodayResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Calendar in-progress session (crash-safe store) → the Resume state.
  const [resumeSession, setResumeSession] = useState<ReturnType<typeof inProgressSession>>(null);
  // Bumped on every calendar-store emit so the week strip re-derives from it.
  const [calVersion, setCalVersion] = useState(0);
  useEffect(() => {
    ensureLiveCalendarData();
    // The strip's "done" seals come from logged days; the current week can
    // straddle a month boundary, so warm both months.
    const monday = mondayOf(new Date());
    ensureLogsForMonth(monday);
    ensureLogsForMonth(addDays(monday, 6));
    setResumeSession(inProgressSession(todayIso()));
    return subscribePlanCalendar(() => {
      setResumeSession(inProgressSession(todayIso()));
      setCalVersion((v) => v + 1);
    });
  }, []);
  const [plan, setPlan] = useState<ApiPlan | null>(null);
  const [weeklyWorkouts, setWeeklyWorkouts] = useState<Workout[]>([]);
  /** Session history summary — powers the streak, sessions and last-workout cards. */
  const [stats, setStats] = useState<WorkoutStats | null>(null);
  const [quickVisible, setQuickVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isFirstLoad = useRef(true);

  const openWhatsNew = () => {
    haptics.tap();
    setWhatsNewVisible(true);
  };
  const closeWhatsNew = useCallback(() => {
    setWhatsNewVisible(false);
    setHasUnseenNews(false);
    if (LATEST_CHANGELOG_ID) {
      void setSeenChangelogId(LATEST_CHANGELOG_ID);
    }
  }, []);

  // Surface unseen release notes. New / just-onboarded users (no seen record
  // yet) only get the discreet header badge — never an auto-popup. Returning
  // users who've opened What's New before get the popup once for a newer
  // release, and we mark it seen the moment it shows so quitting the app
  // (without dismissing) won't make it reappear.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!LATEST_CHANGELOG_ID) return;
      const seen = await getSeenChangelogId();
      if (!active) return;
      if (seen === LATEST_CHANGELOG_ID) return;
      setHasUnseenNews(true);
      if (seen !== null && !whatsNewAutoShown.current) {
        whatsNewAutoShown.current = true;
        setWhatsNewVisible(true);
        void setSeenChangelogId(LATEST_CHANGELOG_ID);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const loadHomeData = useCallback(async (opts?: { pull?: boolean }) => {
    const pull = opts?.pull ?? false;
    if (pull) setRefreshing(true);
    else if (isFirstLoad.current) setLoading(true);
    try {
      setResumeSession(inProgressSession(todayIso()));

      const [{ plan: fetchedPlan, weeklyWorkouts: fetchedWeekly }, fetchedStats] = await Promise.all([
        getCurrentPlanWithWeekly(),
        // Same endpoint and window as the Progress screen, so the streak on
        // Home can never disagree with it. Graceful: on error the momentum
        // and last-workout cards simply don't render.
        getWorkoutStats().catch((): WorkoutStats | null => null),
      ]);
      setPlan(fetchedPlan ?? null);
      setWeeklyWorkouts(fetchedWeekly ?? []);
      setStats(fetchedStats);
      setHomeToday(resolveHomeToday(fetchedPlan, fetchedWeekly ?? []));
      setLoadError(null);
    } catch (err) {
      setLoadError(homeLoadErrorMessage(err));
      setHomeToday(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
      isFirstLoad.current = false;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadHomeData();
    }, [loadHomeData])
  );

  // Avatar goes straight to the account screen (App Store pattern) — sign-out
  // and weight logging live there, so Home no longer needs its own menu.
  const goToProfile = () => {
    haptics.tap();
    const parent = navigation.getParent();
    (parent as { navigate?: (name: keyof RootNavigatorParamList) => void })?.navigate?.('Profile');
  };

  // PROTOTYPE — the Calendar tab replaced the Plan and Train tabs, so every
  // Home entry point routes into it: overview links land on the month or week,
  // anything workout-shaped lands on today's day view. `initial: false` on the
  // day view mounts the week landing beneath it, so Back reads Day → Week.
  // Progress is the REAL screen, re-homed into the Calendar stack.
  const goToProgress = () => {
    haptics.tap();
    navigation.navigate('Calendar', { screen: 'Progress', initial: false });
  };

  const goToPlan = () => {
    haptics.tap();
    navigation.navigate('Calendar');
  };

  const goToGeneratePlan = () => {
    haptics.tap();
    navigation.navigate('Calendar');
  };

  const goToDay = (dateIso: string) => {
    haptics.tap();
    navigation.navigate('Calendar', {
      screen: 'PlanCalendarDay',
      params: { dateIso },
      initial: false,
    });
  };

  const goToWorkout = () => goToDay(todayIso());

  const themedStyles = useMemo(
    () => ({
      container: { backgroundColor: colors.background },
      title: { color: colors.text },
      accentHairline: { backgroundColor: colors.primary },
      heroRing: { borderColor: colors.primary + '55' },
      resumeCard: {
        backgroundColor: colors.primary + '1c',
        borderColor: colors.primary + '50',
      },
      todayCard: {
        backgroundColor: colors.surface,
        borderColor: colors.border,
      },
      secondaryCard: {
        backgroundColor: colors.surface,
        borderColor: colors.border,
      },
      primaryCta: { backgroundColor: colors.primary },
      primaryCtaText: { color: colors.background },
      sectionLabel: { color: colors.textMuted },
    }),
    [colors]
  );

  const programWeekInfo = useMemo(() => {
    if (!plan?.planWorkouts?.length) return null;
    const maxWeek = Math.max(...plan.planWorkouts.map((pw) => normalizeProgramWeekNumber(pw.weekNumber)));
    const repeatWeek = lastContiguousProgramWeek(plan.planWorkouts.map((pw) => pw.weekNumber));
    const r = resolveProgramWeekForCalendarOffset(0, plan.weekAnchorMonday, maxWeek, repeatWeek);
    if (r.status !== 'in_program') return null;
    return { current: r.week, total: maxWeek, repeating: r.repeatingLastWeek };
  }, [plan]);

  const scheduledWorkout = homeToday?.status === 'scheduled' ? homeToday.workout : null;
  const homeTodayPlanSlot = useMemo(
    () =>
      scheduledWorkout?.planWorkoutId ? planSlotForWorkout(plan ?? null, scheduledWorkout.planWorkoutId) : undefined,
    [plan, scheduledWorkout?.planWorkoutId],
  );
  const metaLine = scheduledWorkout ? buildTodayMetaLine(scheduledWorkout, homeTodayPlanSlot) : '';
  const hasExercises = (scheduledWorkout?.exercises?.length ?? 0) > 0;

  // One tile per day of the current calendar week, derived from the SAME store
  // the Calendar tab renders — Home and Calendar can never disagree. The store
  // getters read module state, so `calVersion` (bumped on every store emit) is
  // the memo's change signal.
  const weekTiles = useMemo(() => {
    if (loading || calendarDataMode() !== 'live') return [];
    const monday = mondayOf(new Date());
    return Array.from({ length: 7 }, (_, i) => {
      const iso = toIso(addDays(monday, i));
      const day = plannedDayForDate(iso);
      const rest = day.exercises.length === 0;
      const completed = !rest && isDayCompleted(iso);
      const muscles = rest ? [] : dayMuscles(day);
      return {
        iso,
        label: PLAN_WEEKDAY_NAMES_MONDAY_FIRST[i].slice(0, 2),
        rest,
        muscle: muscles[0] ?? null,
        // Split code from the muscle SET (Push/Pull/Legs/Upper/Full/Arms, or a
        // muscle code for single-muscle days) — never the free-text title.
        title: weekTileLabel(muscles),
        completed,
        skipped: !rest && !completed && isDaySkipped(iso),
        today: iso === todayIso(),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calVersion, loading]);
  const weekPlannedCount = weekTiles.filter((t) => !t.rest && !t.skipped).length;
  const weekDoneCount = weekTiles.filter((t) => t.completed).length;
  const showWeekStrip = weekTiles.some((t) => !t.rest);

  // Today's day from the calendar store: it carries replacements/additions the
  // API's weekly rows don't, so the hero's chips + preview stay honest.
  const todayPlanned = useMemo(() => {
    if (loading || calendarDataMode() !== 'live') return null;
    const day = plannedDayForDate(todayIso());
    return day.exercises.length > 0 ? day : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calVersion, loading]);
  const heroMuscles = todayPlanned ? dayMuscles(todayPlanned).slice(0, 4) : [];

  const summary = useMemo(() => (stats ? summarizeProgress(stats, new Date()) : null), [stats]);
  const lastSession = useMemo(() => (stats ? latestCompletedSession(stats.sessions) : null), [stats]);
  const lastSessionDay = lastSession ? sessionLocalDay(lastSession) : null;
  // Duration, not sets/volume: raw tonnage means little to a general-population
  // user days later — time trained is the number everyone understands.
  const lastMeta = useMemo(() => {
    const secs = lastSession?.totalTimeSeconds ?? 0;
    return secs > 0 ? formatTotalDuration(secs) : '';
  }, [lastSession]);

  return (
    <SafeAreaView
      testID="e2e-home-root"
      style={[styles.container, themedStyles.container]}
      edges={['top']}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.title, themedStyles.title]}>Jim</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.whatsNewButton}
            onPress={openWhatsNew}
            activeOpacity={0.7}
            accessibilityLabel="What's new"
          >
            <Ionicons name="gift-outline" size={24} color={colors.text} />
            {hasUnseenNews ? (
              <View style={[styles.whatsNewBadge, { backgroundColor: colors.accent, borderColor: colors.background }]} />
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.profileButton}
            onPress={goToProfile}
            activeOpacity={0.7}
            accessibilityLabel="Profile"
            accessibilityRole="button"
          >
            <ProfileAvatarDisc
              avatarId={profileAvatarId}
              size={34}
              colors={colors}
              initial={displayName}
            />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.accentBar, themedStyles.accentHairline]} />

      <WhatsNewModal visible={whatsNewVisible} onClose={closeWhatsNew} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: spacing.xxl + tabBarInset }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadHomeData({ pull: true })}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <Text style={[styles.greeting, { color: colors.text }]}>{getGreeting(displayName || undefined)}</Text>
        <Text style={[styles.dateLine, { color: colors.textMuted }]}>
          {formatTodayDateLine()}
          {programWeekInfo
            ? programWeekInfo.repeating
              ? ` · Repeating week ${programWeekInfo.current}`
              : ` · Week ${programWeekInfo.current} of ${programWeekInfo.total}`
            : ''}
        </Text>

        {loading ? (
          // Shaped like the page that replaces it, not just the today-card.
          // One card stood in for the hero, the week strip, two momentum
          // tiles, the recap and the quick-workout row, so the body roughly
          // quadrupled in height the moment the plan landed.
          <>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={1} />
            <SkeletonCard lines={2} />
          </>
        ) : (
          <>
            {homeToday?.status !== 'no_plan' && (
              <Text style={[styles.sectionLabel, themedStyles.sectionLabel]}>Today</Text>
            )}

            {resumeSession && homeToday?.status !== 'scheduled' ? (
              <TouchableOpacity
                style={[styles.card, styles.resumeCard, themedStyles.resumeCard]}
                onPress={goToWorkout}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityHint="Opens today's workout in the Calendar to resume"
              >
                <View style={[styles.cardIconCircle, { backgroundColor: colors.primary + '28' }]}>
                  <Ionicons name="play-circle" size={26} color={colors.primary} />
                </View>
                <View style={styles.cardTextBlock}>
                  <Text style={[styles.cardEyebrow, { color: colors.primary }]}>In progress</Text>
                  <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
                    {resumeSession.title}
                  </Text>
                  <Text style={[styles.cardMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                    {resumeSession.loggedSets} of {resumeSession.totalSets} sets logged · keep going
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}

            {loadError ? (
              <View style={[styles.card, styles.todayHero, themedStyles.secondaryCard]}>
                <View style={styles.todayHeroTop}>
                  <View style={[styles.cardIconCircle, { backgroundColor: colors.textMuted + '22' }]}>
                    <Ionicons name="cloud-offline-outline" size={24} color={colors.textMuted} />
                  </View>
                  <View style={styles.cardTextBlock}>
                    <Text style={[styles.cardEyebrow, { color: colors.textMuted }]}>Could not load</Text>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>Plan data unavailable</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>{loadError}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.primaryButton, themedStyles.primaryCta]}
                  onPress={() => loadHomeData()}
                  activeOpacity={0.85}
                >
                  <Ionicons name="refresh" size={18} color={colors.background} />
                  <Text style={[styles.primaryButtonText, themedStyles.primaryCtaText]}>Try again</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {!loadError && homeToday?.status === 'scheduled' && scheduledWorkout ? (
              <View
                style={[
                  styles.card,
                  styles.todayHero,
                  themedStyles.todayCard,
                  themedStyles.heroRing,
                  resumeSession ? themedStyles.resumeCard : null,
                ]}
              >
                {heroMuscles.length > 0 ? (
                  <View style={styles.heroChipRow}>
                    {heroMuscles.map((m) => (
                      <LinearGradient
                        key={m}
                        colors={muscleGradient(m)}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.heroChip, { borderColor: MUSCLE_EDGE[m] }]}
                      >
                        <Text style={[styles.heroChipLabel, { color: MUSCLE_INK[m] }]}>{m}</Text>
                      </LinearGradient>
                    ))}
                  </View>
                ) : null}
                <Text style={[styles.heroTitle, { color: colors.text }]} numberOfLines={2}>
                  {todayPlanned?.title ?? scheduledWorkout.name}
                </Text>
                {metaLine ? (
                  <Text style={[styles.cardMeta, { color: colors.textSecondary }]} numberOfLines={2}>
                    {metaLine}
                  </Text>
                ) : null}
                {resumeSession ? (
                  <Text style={[styles.heroPreview, { color: colors.primary, fontWeight: weight.bold }]}>
                    {resumeSession.loggedSets} of {resumeSession.totalSets} sets logged · keep going
                  </Text>
                ) : null}
                <TouchableOpacity
                  style={[styles.primaryButton, styles.heroButton, themedStyles.primaryCta]}
                  onPress={goToWorkout}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.primaryButtonText, themedStyles.primaryCtaText]}>
                    {resumeSession ? 'Resume workout' : 'Start workout'}
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color={colors.background} />
                </TouchableOpacity>
                {!hasExercises && !resumeSession ? (
                  <Text style={[styles.hintBelow, { color: colors.textMuted }]}>
                    Your list is empty. Add movements on the next screen or from Plan.
                  </Text>
                ) : null}
              </View>
            ) : null}

            {!loadError && homeToday?.status === 'planned_pending' ? (
              <View style={[styles.card, styles.todayHero, themedStyles.todayCard, themedStyles.heroRing]}>
                <View style={styles.todayHeroTop}>
                  <View style={[styles.cardIconCircle, { backgroundColor: colors.primary + '20' }]}>
                    <Ionicons name="calendar-outline" size={24} color={colors.primary} />
                  </View>
                  <View style={styles.cardTextBlock}>
                    <Text style={[styles.cardEyebrow, { color: colors.textMuted }]}>Up next</Text>
                    <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
                      {homeToday.slot.title}
                    </Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]} numberOfLines={2}>
                      {buildPendingSlotMeta(homeToday.slot)}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.hintBelow, { color: colors.textMuted, marginBottom: spacing.lg }]}>
                  Open Plan and start this session to load it into your workout.
                </Text>
                <TouchableOpacity
                  style={[styles.primaryButton, themedStyles.primaryCta]}
                  onPress={goToPlan}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.primaryButtonText, themedStyles.primaryCtaText]}>Open Plan</Text>
                  <Ionicons name="arrow-forward" size={18} color={colors.background} />
                </TouchableOpacity>
              </View>
            ) : null}

            {!loadError && homeToday?.status === 'rest' ? (
              <View style={[styles.card, styles.todayHero, themedStyles.secondaryCard]}>
                <View style={styles.todayHeroTop}>
                  <View style={[styles.cardIconCircle, { backgroundColor: colors.secondary + '22' }]}>
                    <Ionicons name="moon-outline" size={24} color={colors.secondary} />
                  </View>
                  <View style={styles.cardTextBlock}>
                    <Text style={[styles.cardEyebrow, { color: colors.textMuted }]}>Today</Text>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>Rest day</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                      Nothing active on your plan — recovery counts.
                    </Text>
                  </View>
                </View>
                <TouchableOpacity style={[styles.secondaryOutlineBtn, { borderColor: colors.border }]} onPress={goToPlan} activeOpacity={0.85}>
                  <Text style={[styles.secondaryOutlineBtnText, { color: colors.primary }]}>View schedule</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {!loadError && homeToday?.status === 'empty_day' ? (
              <View style={[styles.card, styles.todayHero, themedStyles.secondaryCard]}>
                <View style={styles.todayHeroTop}>
                  <View style={[styles.cardIconCircle, { backgroundColor: colors.textMuted + '22' }]}>
                    <Ionicons name="calendar-outline" size={24} color={colors.textMuted} />
                  </View>
                  <View style={styles.cardTextBlock}>
                    <Text style={[styles.cardEyebrow, { color: colors.textMuted }]}>Today</Text>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>Nothing scheduled</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                      No session on your plan today.
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.secondaryOutlineBtn, { borderColor: colors.border }]}
                  onPress={goToPlan}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.secondaryOutlineBtnText, { color: colors.primary }]}>Open Plan</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {!loadError && homeToday?.status === 'out_of_program' ? (
              <View style={[styles.card, styles.todayHero, themedStyles.secondaryCard]}>
                <View style={styles.todayHeroTop}>
                  <View style={[styles.cardIconCircle, { backgroundColor: colors.textMuted + '33' }]}>
                    <Ionicons name="calendar-clear-outline" size={24} color={colors.textMuted} />
                  </View>
                  <View style={styles.cardTextBlock}>
                    <Text style={[styles.cardEyebrow, { color: colors.textMuted }]}>This calendar week</Text>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>Outside your program</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                      Your date falls outside the program weeks. Open Plan to extend or switch weeks.
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.primaryButton, themedStyles.primaryCta]}
                  onPress={goToPlan}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.primaryButtonText, themedStyles.primaryCtaText]}>Open weekly plan</Text>
                  <Ionicons name="arrow-forward" size={18} color={colors.background} />
                </TouchableOpacity>
              </View>
            ) : null}

            {!loadError && homeToday?.status === 'no_plan' ? (
              <View style={styles.noPlanEmpty}>
                <View style={[styles.noPlanIconWrap, { backgroundColor: colors.primary + '18' }]}>
                  <Ionicons name="sparkles-outline" size={36} color={colors.primary} />
                </View>
                <Text style={[styles.noPlanTitle, { color: colors.text }]}>No plan yet</Text>
                <Text style={[styles.noPlanSub, { color: colors.textSecondary }]}>
                  Generate a personalized week with AI, or build your schedule manually.
                </Text>
                <TouchableOpacity
                  style={[styles.primaryButton, styles.noPlanCta, themedStyles.primaryCta]}
                  onPress={goToGeneratePlan}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityHint="Opens AI plan generator"
                >
                  <Ionicons name="flash-outline" size={18} color={colors.background} />
                  <Text style={[styles.primaryButtonText, themedStyles.primaryCtaText]}>Generate my plan</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.noPlanLink} onPress={goToPlan} activeOpacity={0.7}>
                  <Text style={[styles.textLink, { color: colors.primary }]}>Build manually instead</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>
            ) : null}

            {!loadError && homeToday?.repeatingWeek != null ? (
              <TouchableOpacity
                style={[styles.card, styles.repeatBanner, themedStyles.secondaryCard]}
                onPress={goToGeneratePlan}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityHint="Opens AI plan generator"
              >
                <Ionicons name="repeat" size={18} color={colors.primary} />
                <Text style={[styles.repeatBannerText, { color: colors.textSecondary }]}>
                  Your plan ended, so you're repeating week {homeToday.repeatingWeek}. Generate a
                  fresh block to keep progressing.
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}

            {!loadError && showWeekStrip && (
              <View>
                <View style={[styles.weekHeaderRow, styles.sectionSpaced]}>
                  <Text style={[styles.sectionLabel, styles.sectionLabelInRow, themedStyles.sectionLabel]}>
                    This week
                  </Text>
                  {weekPlannedCount > 0 ? (
                    <Text style={[styles.weekCount, { color: colors.textMuted }]}>
                      {weekDoneCount} of {weekPlannedCount} done
                    </Text>
                  ) : null}
                </View>
                <View style={styles.tileRow}>
                  {weekTiles.map((t) => (
                    <TouchableOpacity
                      key={t.iso}
                      style={[styles.tileTap, t.today && { borderColor: colors.primary }]}
                      activeOpacity={0.8}
                      onPress={() => goToDay(t.iso)}
                      accessibilityRole="button"
                      accessibilityLabel={`${t.label}${t.rest ? ', rest day' : `, ${t.title}${t.completed ? ', completed' : ''}`}`}
                    >
                      {t.rest || t.skipped || !t.muscle ? (
                        <View style={[styles.weekTile, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                          <Text style={[styles.tileDay, { color: colors.textMuted }]}>{t.label}</Text>
                          <View style={[styles.tileDash, { backgroundColor: colors.textMuted + '55' }]} />
                        </View>
                      ) : (
                        <LinearGradient
                          colors={muscleGradient(t.muscle)}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={[styles.weekTile, { borderWidth: 1, borderColor: MUSCLE_EDGE[t.muscle] }]}
                        >
                          <Text style={[styles.tileDay, { color: MUSCLE_INK[t.muscle] }]}>{t.label}</Text>
                          {t.completed ? (
                            <Ionicons name="checkmark-sharp" size={14} color={MUSCLE_INK[t.muscle]} />
                          ) : (
                            <Text
                              style={[styles.tileTitle, { color: MUSCLE_INK[t.muscle] }]}
                              numberOfLines={1}
                              adjustsFontSizeToFit
                              minimumFontScale={0.7}
                            >
                              {t.title}
                            </Text>
                          )}
                        </LinearGradient>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {!loadError && summary && summary.sessionCount > 0 && (
              <View style={styles.momentumRow}>
                <TouchableOpacity
                  style={[styles.card, styles.momentumTile, themedStyles.secondaryCard]}
                  onPress={goToProgress}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityHint="Opens Progress"
                >
                  <Text style={[styles.momentumCaption, themedStyles.sectionLabel]}>Week streak</Text>
                  <View style={styles.momentumValueRow}>
                    <Ionicons name="flame" size={22} color={colors.accent} />
                    <Text style={[styles.momentumValue, { color: colors.text }]}>{summary.weekStreak}</Text>
                    <Text style={[styles.momentumUnit, { color: colors.textMuted }]}>
                      {summary.weekStreak === 1 ? 'week' : 'weeks'}
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.card, styles.momentumTile, themedStyles.secondaryCard]}
                  onPress={goToProgress}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityHint="Opens Progress"
                >
                  <Text style={[styles.momentumCaption, themedStyles.sectionLabel]}>Sessions</Text>
                  <View style={styles.momentumValueRow}>
                    <Text style={[styles.momentumValue, { color: colors.text }]}>{summary.sessionsThisWeek}</Text>
                    <Text style={[styles.momentumUnit, { color: colors.textMuted }]}>
                      {weekPlannedCount > 0 ? `of ${weekPlannedCount} this week` : 'this week'}
                    </Text>
                  </View>
                  {weekPlannedCount > 0 ? (
                    <View style={[styles.momentumBarTrack, { backgroundColor: colors.segmentTrack }]}>
                      <View
                        style={[
                          styles.momentumBarFill,
                          {
                            backgroundColor: colors.success,
                            width: `${Math.min(100, (summary.sessionsThisWeek / weekPlannedCount) * 100)}%`,
                          },
                        ]}
                      />
                    </View>
                  ) : null}
                </TouchableOpacity>
              </View>
            )}

            {!loadError && lastSession && lastSessionDay ? (
              <TouchableOpacity
                style={[styles.card, styles.rowCard, themedStyles.secondaryCard]}
                onPress={() => goToDay(lastSessionDay)}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityHint="Opens that day in the Calendar"
              >
                <View style={[styles.cardIconCircle, { backgroundColor: colors.warningSoft }]}>
                  <RosetteSeal size={30} />
                </View>
                <View style={styles.cardTextBlock}>
                  <Text style={[styles.rowEyebrow, { color: colors.textMuted }]}>
                    Last workout · {recentDayLabel(lastSessionDay, todayIso())}
                  </Text>
                  <Text style={[styles.rowCardTitle, { color: colors.text }]} numberOfLines={1}>
                    {lastSession.workoutName ?? 'Workout'}
                  </Text>
                  {lastMeta ? (
                    <Text style={[styles.rowCardSub, { color: colors.textMuted }]}>{lastMeta}</Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}

            {!loadError ? (
              <TouchableOpacity
                style={[styles.card, styles.rowCard, themedStyles.secondaryCard]}
                onPress={() => {
                  haptics.tap();
                  setQuickVisible(true);
                }}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityHint="Builds a session for today"
              >
                <View style={[styles.cardIconCircle, { backgroundColor: colors.primarySoft }]}>
                  <Ionicons name="flash-outline" size={24} color={colors.primary} />
                </View>
                <View style={styles.cardTextBlock}>
                  <Text style={[styles.rowCardTitle, { color: colors.text }]}>Quick workout</Text>
                  <Text style={[styles.rowCardSub, { color: colors.textMuted }]}>Build a session for right now</Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </ScrollView>

      <QuickWorkoutSheet
        visible={quickVisible}
        onClose={() => setQuickVisible(false)}
        onLanded={(dateIso) => {
          setQuickVisible(false);
          goToDay(dateIso);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  headerLeft: {},
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  whatsNewButton: {
    padding: spacing.xs,
  },
  whatsNewBadge: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: radius.sm,
    borderWidth: 2,
  },
  accentBar: {
    marginHorizontal: spacing.xl,
    height: 2,
    borderRadius: radius.xs,
    opacity: 0.65,
    marginBottom: spacing.xs,
  },
  profileButton: {
    padding: spacing.xs,
    marginRight: -4,
  },
  title: {
    fontSize: text.display,
    fontWeight: weight.heavy,
    letterSpacing: tracking.tight,
  },
  greeting: {
    fontSize: text.title,
    fontWeight: weight.bold,
    marginTop: spacing.sm,
    letterSpacing: tracking.tight,
  },
  dateLine: {
    fontSize: text.body,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    fontWeight: weight.medium,
  },
  sectionLabel: {
    fontSize: text.footnote,
    fontWeight: weight.heavy,
    letterSpacing: tracking.widest,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  sectionSpaced: {
    marginTop: spacing.xl,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  resumeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.lg,
  },
  todayHero: {
    padding: spacing.lg,
  },
  heroRing: {
    borderWidth: 1,
  },
  todayHeroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  cardIconCircle: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  cardEyebrow: {
    fontSize: text.caption,
    fontWeight: weight.heavy,
    textTransform: 'uppercase',
    letterSpacing: tracking.wider,
    marginBottom: spacing.xs,
  },
  cardTitle: {
    fontSize: text.headline,
    fontWeight: weight.bold,
    lineHeight: leading.headline,
  },
  cardMeta: {
    fontSize: text.body,
    marginTop: spacing.sm,
    lineHeight: leading.body,
    fontWeight: weight.medium,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
  },
  primaryButtonText: {
    fontSize: text.callout,
    fontWeight: weight.heavy,
  },
  secondaryOutlineBtn: {
    alignSelf: 'stretch',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  secondaryOutlineBtnText: {
    fontSize: text.callout,
    fontWeight: weight.bold,
  },
  hintBelow: {
    fontSize: text.body,
    marginTop: spacing.md,
    textAlign: 'center',
    fontWeight: weight.medium,
  },
  noPlanEmpty: {
    alignItems: 'center',
    paddingTop: 52,
    paddingBottom: spacing.xxxl,
    paddingHorizontal: spacing.sm,
  },
  noPlanIconWrap: {
    width: 80,
    height: 80,
    borderRadius: radius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxl,
  },
  noPlanTitle: {
    fontSize: text.display,
    fontWeight: weight.heavy,
    letterSpacing: tracking.tight,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  noPlanSub: {
    fontSize: text.callout,
    lineHeight: leading.callout,
    textAlign: 'center',
    fontWeight: weight.medium,
    marginBottom: spacing.xxxl,
  },
  noPlanCta: {
    alignSelf: 'stretch',
  },
  noPlanLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  textLink: {
    fontSize: text.callout,
    fontWeight: weight.bold,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.lg,
  },
  rowCardTitle: {
    fontSize: text.headline,
    fontWeight: weight.bold,
  },
  rowCardSub: {
    fontSize: text.body,
    marginTop: spacing.xs,
    fontWeight: weight.medium,
  },
  repeatBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  repeatBannerText: {
    flex: 1,
    fontSize: text.body,
    lineHeight: leading.body,
    fontWeight: weight.medium,
  },
  // --- Today hero (design A: muscle chips + preview line) ---
  heroChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  heroChip: {
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
  },
  heroChipLabel: {
    fontSize: text.caption,
    fontWeight: weight.bold,
  },
  heroTitle: {
    fontSize: text.title,
    fontWeight: weight.bold,
    lineHeight: leading.title,
  },
  heroPreview: {
    fontSize: text.footnote,
    marginTop: spacing.xs,
    fontWeight: weight.medium,
  },
  heroButton: {
    marginTop: spacing.lg,
  },
  // --- This-week strip: mini day tiles in the calendar day-card language ---
  weekHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionLabelInRow: {
    marginBottom: 0,
  },
  weekCount: {
    fontSize: text.footnote,
    fontWeight: weight.semibold,
  },
  tileRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  // The ring wrapper carries a transparent border on EVERY tile so today's
  // blue ring never changes the tile's size next to its neighbours.
  tileTap: {
    flex: 1,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: radius.lg,
    padding: 2,
  },
  weekTile: {
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  tileDay: {
    fontSize: text.caption,
    fontWeight: weight.bold,
  },
  tileTitle: {
    fontSize: text.caption,
    fontWeight: weight.heavy,
    maxWidth: '92%',
  },
  tileDash: {
    width: 12,
    height: 3,
    borderRadius: radius.xs,
    marginBottom: spacing.xs,
  },
  // --- Momentum tiles (streak + sessions) ---
  momentumRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  momentumTile: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.sm,
    marginBottom: 0,
  },
  momentumCaption: {
    fontSize: text.caption,
    fontWeight: weight.heavy,
    letterSpacing: tracking.widest,
    textTransform: 'uppercase',
  },
  momentumValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  momentumValue: {
    fontSize: text.title,
    fontWeight: weight.heavy,
    letterSpacing: tracking.tight,
  },
  momentumUnit: {
    fontSize: text.footnote,
    fontWeight: weight.semibold,
    flexShrink: 1,
  },
  momentumBarTrack: {
    height: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  momentumBarFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  rowEyebrow: {
    fontSize: text.caption,
    fontWeight: weight.heavy,
    textTransform: 'uppercase',
    letterSpacing: tracking.wider,
    marginBottom: spacing.xxs,
  },
});
