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
import { getCurrentPlanWithWeekly, planSlotForWorkout } from '../services/planService';
import type { ApiPlan, ApiPlanWorkout } from '../services/planService';
import { getWorkoutLogs } from '../services/workoutService';
import { loadWorkoutDraft } from '../lib/workoutDraftStorage';
import type { Workout, WorkoutLog } from '../types/workout';
import type { PersistedWorkoutDraft } from '../lib/workoutDraftStorage';
import {
  resolveHomeToday,
  buildHomeWeekDots,
  type HomeTodayResult,
  type HomeWeekDotStatus,
} from '../lib/homeToday';
import {
  resolveProgramWeekForCalendarOffset,
  lastContiguousProgramWeek,
  normalizeProgramWeekNumber,
  getCalendarWeekRange,
  formatLocalYmd,
  PLAN_WEEKDAY_NAMES_MONDAY_FIRST,
} from '../lib/planCalendar';
import { stripCoachAdviceBullets } from '../lib/planDetailLineDisplay';
import { leading, radius, spacing, text, tracking, weight } from '../theme';
import { useTabBarInset } from '../navigation/useTabBarInset';
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

function buildTodayMetaLine(workout: Workout, planSlot: ApiPlanWorkout | undefined): string {
  const parts: string[] = [];
  const displayMin = resolveWorkoutEtaMinutes(workout, planSlot ?? null);
  const plannedStrip = workout.estimatedDuration ?? planSlot?.durationMinutes ?? null;
  const n = workout.exercises?.length ?? 0;
  if (displayMin != null) parts.push(`Est. ${displayMin} min`);
  const exercisePhrase = `${n} ${n === 1 ? 'exercise' : 'exercises'}`;
  const focusCleaned = stripCoachAdviceBullets(workout.focus ?? '');
  if (focusCleaned) {
    const segments = focusCleaned.split(/\s*•\s*/).map((s) => s.trim()).filter(Boolean);
    for (const seg of segments) {
      if (/^\d+\s*min$/i.test(seg)) {
        const m = parseInt(seg, 10);
        if (m === displayMin || m === plannedStrip) continue;
      }
      if (/^\d+\s*exercises?$/i.test(seg)) continue;
      parts.push(seg);
    }
  }
  parts.push(exercisePhrase);
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
  const [seenNewsId, setSeenNewsId] = useState<string | null>(null);
  const whatsNewAutoShown = useRef(false);
  const [homeToday, setHomeToday] = useState<HomeTodayResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<PersistedWorkoutDraft | null>(null);
  const [plan, setPlan] = useState<ApiPlan | null>(null);
  const [weeklyWorkouts, setWeeklyWorkouts] = useState<Workout[]>([]);
  /** Completed logs for the current calendar week — the only valid "done" signal for week dots. */
  const [weekCompletedLogs, setWeekCompletedLogs] = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isFirstLoad = useRef(true);

  const openWhatsNew = () => setWhatsNewVisible(true);
  const closeWhatsNew = useCallback(() => {
    setWhatsNewVisible(false);
    setHasUnseenNews(false);
    if (LATEST_CHANGELOG_ID) {
      void setSeenChangelogId(LATEST_CHANGELOG_ID);
      // Now caught up: a reopen should show only the latest expanded.
      setSeenNewsId(LATEST_CHANGELOG_ID);
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
      // Capture what they'd seen before we mark the latest seen below, so the
      // modal knows which entries to keep expanded.
      setSeenNewsId(seen);
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
      try {
        const d = await loadWorkoutDraft(user?.id);
        setDraft(d);
      } catch {
        setDraft(null);
      }

      const { start, end } = getCalendarWeekRange(0);
      const [{ plan: fetchedPlan, weeklyWorkouts: fetchedWeekly }, logs] = await Promise.all([
        getCurrentPlanWithWeekly(),
        // Graceful degradation: on error the dots simply show no completion.
        getWorkoutLogs({ from: formatLocalYmd(start), to: formatLocalYmd(end) }).catch(
          (): WorkoutLog[] => [],
        ),
      ]);
      setPlan(fetchedPlan ?? null);
      setWeeklyWorkouts(fetchedWeekly ?? []);
      setWeekCompletedLogs(logs.filter((l) => l.completedAt != null));
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
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadHomeData();
    }, [loadHomeData])
  );

  // Avatar goes straight to the account screen (App Store pattern) — sign-out
  // and weight logging live there, so Home no longer needs its own menu.
  const goToProfile = () => {
    const parent = navigation.getParent();
    (parent as { navigate?: (name: keyof RootNavigatorParamList) => void })?.navigate?.('Profile');
  };

  // initial: false keeps PlanList as the stack's first route even when the Plan
  // tab hasn't been mounted yet, so Back on these screens pops to the plan page
  // instead of having nothing beneath.
  const goToHistory = () => {
    navigation.navigate('Plan', { screen: 'History', initial: false });
  };

  const goToProgress = () => {
    navigation.navigate('Plan', { screen: 'Progress', initial: false });
  };

  const goToPlan = () => {
    navigation.navigate('Plan');
  };

  const goToGeneratePlan = () => {
    navigation.navigate('Plan', { screen: 'GeneratePlan', initial: false });
  };

  const goToWorkout = () => {
    navigation.navigate('Workout', undefined);
  };

  const goToTodaysWorkoutSession = (workout: Workout) => {
    navigation.navigate('Workout', { workoutId: workout.id });
  };

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

  const weekDots = useMemo(
    () => buildHomeWeekDots(plan, weeklyWorkouts, weekCompletedLogs, programWeekInfo?.current ?? null),
    [plan, weeklyWorkouts, weekCompletedLogs, programWeekInfo],
  );

  const scheduledWorkout = homeToday?.status === 'scheduled' ? homeToday.workout : null;
  const homeTodayPlanSlot = useMemo(
    () =>
      scheduledWorkout?.planWorkoutId ? planSlotForWorkout(plan ?? null, scheduledWorkout.planWorkoutId) : undefined,
    [plan, scheduledWorkout?.planWorkoutId],
  );
  const metaLine = scheduledWorkout ? buildTodayMetaLine(scheduledWorkout, homeTodayPlanSlot) : '';
  const hasExercises = (scheduledWorkout?.exercises?.length ?? 0) > 0;
  // Monday-first weekday name for "today" (so the label/marker highlights even on rest days).
  const todayWeekdayName = PLAN_WEEKDAY_NAMES_MONDAY_FIRST[(new Date().getDay() + 6) % 7];

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

      <WhatsNewModal visible={whatsNewVisible} onClose={closeWhatsNew} seenId={seenNewsId} />

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
          // Shaped like the today-card that replaces it, so the page does not
          // jump when the plan lands.
          <SkeletonCard lines={3} />
        ) : (
          <>
            {homeToday?.status !== 'no_plan' && (
              <Text style={[styles.sectionLabel, themedStyles.sectionLabel]}>Today</Text>
            )}

            {draft ? (
              <TouchableOpacity
                style={[styles.card, styles.resumeCard, themedStyles.resumeCard]}
                onPress={goToWorkout}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityHint="Opens Train tab to resume"
              >
                <View style={[styles.cardIconCircle, { backgroundColor: colors.primary + '28' }]}>
                  <Ionicons name="play-circle" size={26} color={colors.primary} />
                </View>
                <View style={styles.cardTextBlock}>
                  <Text style={[styles.cardEyebrow, { color: colors.primary }]}>In progress</Text>
                  <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
                    {draft.workout.name}
                  </Text>
                  <Text style={[styles.cardMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                    Continue your session
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
              <View style={[styles.card, styles.todayHero, themedStyles.todayCard, themedStyles.heroRing]}>
                <View style={styles.todayHeroTop}>
                  <View style={[styles.cardIconCircle, { backgroundColor: colors.primary + '20' }]}>
                    <Ionicons name="barbell-outline" size={24} color={colors.primary} />
                  </View>
                  <View style={styles.cardTextBlock}>
                    <Text style={[styles.cardEyebrow, { color: colors.textMuted }]}>Today's session</Text>
                    <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
                      {scheduledWorkout.name}
                    </Text>
                    {metaLine ? (
                      <Text style={[styles.cardMeta, { color: colors.textSecondary }]} numberOfLines={2}>
                        {metaLine}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.primaryButton, themedStyles.primaryCta]}
                  onPress={() => goToTodaysWorkoutSession(scheduledWorkout)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.primaryButtonText, themedStyles.primaryCtaText]}>
                    Open workout
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color={colors.background} />
                </TouchableOpacity>
                {!hasExercises ? (
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

            {!loadError && weekDots.length > 0 && (
              <View style={styles.weekDotsSection}>
                <Text style={[styles.sectionLabel, styles.sectionSpaced, themedStyles.sectionLabel]}>This week</Text>
                <View style={styles.dotsRow}>
                  {PLAN_WEEKDAY_NAMES_MONDAY_FIRST.map((day, i) => {
                    const { status } = weekDots[i] ?? { status: 'rest' as HomeWeekDotStatus };
                    const isToday = day === todayWeekdayName;
                    const isTraining = status !== 'rest';
                    return (
                      <View key={day} style={styles.dotWrapper}>
                        <Text style={[styles.dotDayLabel, { color: isToday ? colors.primary : colors.textMuted, fontWeight: isToday ? '700' : '500' }]}>
                          {day.slice(0, 2)}
                        </Text>
                        <View style={styles.dotSlot}>
                          {isTraining ? (
                            // Training day. Hollow gold ring = planned; fills solid when completed.
                            <View
                              style={[
                                styles.dot,
                                status === 'scheduled'
                                  ? { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.primary }
                                  : { backgroundColor: colors.primary },
                                isToday && styles.dotToday,
                              ]}
                            />
                          ) : (
                            // Rest day — an intentional muted dash (gold-tinted if it's today).
                            <View
                              style={[
                                styles.restDash,
                                { backgroundColor: (isToday ? colors.primary : colors.textMuted) + (isToday ? 'CC' : '55') },
                              ]}
                            />
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            <Text style={[styles.sectionLabel, styles.sectionSpaced, themedStyles.sectionLabel]}>Shortcuts</Text>

            <TouchableOpacity
              style={[styles.card, styles.rowCard, themedStyles.secondaryCard]}
              onPress={goToPlan}
              activeOpacity={0.88}
            >
              <View style={[styles.cardIconCircle, { backgroundColor: colors.secondary + '22' }]}>
                <Ionicons name="calendar-outline" size={24} color={colors.secondary} />
              </View>
              <View style={styles.cardTextBlock}>
                <Text style={[styles.rowCardTitle, { color: colors.text }]}>Weekly plan</Text>
                <Text style={[styles.rowCardSub, { color: colors.textMuted }]}>Calendar, generate, edit days</Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.card, styles.rowCard, themedStyles.secondaryCard]}
              onPress={goToHistory}
              activeOpacity={0.88}
            >
              <View style={[styles.cardIconCircle, { backgroundColor: colors.primary + '20' }]}>
                <Ionicons name="time-outline" size={24} color={colors.primary} />
              </View>
              <View style={styles.cardTextBlock}>
                <Text style={[styles.rowCardTitle, { color: colors.text }]}>Workout history</Text>
                <Text style={[styles.rowCardSub, { color: colors.textMuted }]}>Past sessions and logs by day</Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.card, styles.rowCard, themedStyles.secondaryCard]}
              onPress={goToProgress}
              activeOpacity={0.88}
            >
              <View style={[styles.cardIconCircle, { backgroundColor: colors.secondary + '22' }]}>
                <Ionicons name="trending-up-outline" size={24} color={colors.secondary} />
              </View>
              <View style={styles.cardTextBlock}>
                <Text style={[styles.rowCardTitle, { color: colors.text }]}>Progress</Text>
                <Text style={[styles.rowCardSub, { color: colors.textMuted }]}>Streak, totals and weekly trend</Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
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
  weekDotsSection: {},
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.xs,
  },
  dotWrapper: {
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  dotSlot: {
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
  dotToday: {
    width: 13,
    height: 13,
    borderRadius: radius.pill,
  },
  restDash: {
    width: 12,
    height: 3,
    borderRadius: radius.xs,
  },
  dotDayLabel: {
    fontSize: text.caption,
    textTransform: 'uppercase',
  },
});
