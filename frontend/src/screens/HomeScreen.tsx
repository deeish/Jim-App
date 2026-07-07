import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Platform,
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
import LogWeightSheet from '../components/LogWeightSheet';
import { LATEST_CHANGELOG_ID } from '../constants/changelog';
import { getSeenChangelogId, setSeenChangelogId } from '../lib/whatsNewStorage';
import type { RootNavigatorParamList } from '../types/navigation';
import { RootTabParamList } from '../components/NavBar';
import { showConfirmDialog } from '../lib/confirmAlert';
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
    return 'Session expired. Sign in again from the profile menu.';
  }
  if (e.message === 'Network Error' || !e.response) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  return 'Could not load your plan. Pull down to refresh or try again in a moment.';
}

export default function HomeScreen() {
  const navigation = useNavigation<HomeNavigation>();
  const { colors } = useTheme();
  const { user, signOut } = useAuth();
  const { profileAvatarId, profileDisplayName } = useUserPreferences();
  const displayName = (profileDisplayName || user?.email?.split('@')[0] || '').split(' ')[0];

  const [menuVisible, setMenuVisible] = useState(false);
  const [pendingSignOutConfirm, setPendingSignOutConfirm] = useState(false);
  const [logWeightOpen, setLogWeightOpen] = useState(false);
  const [pendingLogWeight, setPendingLogWeight] = useState(false);
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

  const openMenu = () => setMenuVisible(true);
  const closeMenu = () => setMenuVisible(false);

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
        const d = await loadWorkoutDraft();
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
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadHomeData();
    }, [loadHomeData])
  );

  const goToProfile = () => {
    closeMenu();
    const parent = navigation.getParent();
    (parent as { navigate?: (name: keyof RootNavigatorParamList) => void })?.navigate?.('Profile');
  };

  const goToHistory = () => {
    navigation.navigate('Plan', { screen: 'History' });
  };

  const goToPlan = () => {
    navigation.navigate('Plan');
  };

  const goToGeneratePlan = () => {
    navigation.navigate('Plan', { screen: 'GeneratePlan' });
  };

  const goToWorkout = () => {
    navigation.navigate('Workout', undefined);
  };

  const goToTodaysWorkoutSession = (workout: Workout) => {
    navigation.navigate('Workout', { workoutId: workout.id });
  };

  const confirmSignOut = () => {
    showConfirmDialog({
      title: 'Sign out?',
      confirmText: 'Sign out',
      destructive: true,
      onConfirm: () => void signOut(),
    });
  };

  const onSignOut = () => {
    // iOS refuses to present an Alert while another modal (the menu) is still
    // dismissing, so defer the confirm to the Modal's onDismiss instead of a
    // fragile fixed delay. On Android/web there's no such conflict — show it now.
    if (Platform.OS === 'ios') {
      setPendingSignOutConfirm(true);
      closeMenu();
    } else {
      closeMenu();
      confirmSignOut();
    }
  };

  const onLogWeight = () => {
    // Same iOS modal-over-modal constraint as sign-out: defer presenting the
    // log-weight sheet until the menu has fully dismissed.
    if (Platform.OS === 'ios') {
      setPendingLogWeight(true);
      closeMenu();
    } else {
      closeMenu();
      setLogWeightOpen(true);
    }
  };

  const themedStyles = useMemo(
    () => ({
      container: { backgroundColor: colors.background },
      title: { color: colors.text },
      menuCard: {
        backgroundColor: colors.surface,
        borderColor: colors.border,
        shadowColor: colors.shadow,
      },
      menuItemLabel: { color: colors.text },
      menuDivider: { backgroundColor: colors.border },
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
            onPress={openMenu}
            activeOpacity={0.7}
            accessibilityLabel="Profile menu"
          >
            <ProfileAvatarDisc avatarId={profileAvatarId} size={34} colors={colors} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.accentBar, themedStyles.accentHairline]} />

      <WhatsNewModal visible={whatsNewVisible} onClose={closeWhatsNew} seenId={seenNewsId} />

      <LogWeightSheet visible={logWeightOpen} onClose={() => setLogWeightOpen(false)} />

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
        onDismiss={() => {
          // iOS-only: fires once the menu has fully dismissed, so it's now safe
          // to present the sign-out confirm Alert.
          if (pendingSignOutConfirm) {
            setPendingSignOutConfirm(false);
            confirmSignOut();
          }
          if (pendingLogWeight) {
            setPendingLogWeight(false);
            setLogWeightOpen(true);
          }
        }}
      >
        {/* Backdrop and menu card are siblings — do not nest the card inside backdrop Pressable
            or wrapping View with responder capture; that blocks menu row presses (Android / some web). */}
        <View style={styles.menuModalRoot}>
          <Pressable
            style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.overlay }]}
            onPress={closeMenu}
            accessibilityLabel="Dismiss profile menu"
            accessibilityRole="button"
          />
          <View
            style={[styles.menuCardWrap, themedStyles.menuCard]}
            pointerEvents="box-none"
          >
            <TouchableOpacity style={styles.menuItem} onPress={goToProfile} activeOpacity={0.7}>
              <Ionicons name="person-outline" size={22} color={colors.text} />
              <Text style={[styles.menuItemLabel, themedStyles.menuItemLabel]}>My profile</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
            <View style={[styles.menuDivider, themedStyles.menuDivider]} />
            <TouchableOpacity style={styles.menuItem} onPress={onLogWeight} activeOpacity={0.7}>
              <Ionicons name="scale-outline" size={22} color={colors.text} />
              <Text style={[styles.menuItemLabel, themedStyles.menuItemLabel]}>Log weight</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
            <View style={[styles.menuDivider, themedStyles.menuDivider]} />
            <TouchableOpacity style={styles.menuItem} onPress={onSignOut} activeOpacity={0.7}>
              <Ionicons name="log-out-outline" size={22} color={colors.text} />
              <Text style={[styles.menuItemLabel, themedStyles.menuItemLabel]}>Sign out</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
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
          <View style={styles.loadingBlock}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingHint, { color: colors.textMuted }]}>Loading your day…</Text>
          </View>
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
                accessibilityHint="Opens Workout tab to resume"
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
                <Text style={[styles.hintBelow, { color: colors.textMuted, marginBottom: 14 }]}>
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
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const PROFILE_BUTTON_TOP = 24 + 16;
const PROFILE_BUTTON_RIGHT = 24;
const MENU_WIDTH = 200;

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 6,
    paddingBottom: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 12,
  },
  headerLeft: {},
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  whatsNewButton: {
    padding: 4,
  },
  whatsNewBadge: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    borderWidth: 2,
  },
  accentBar: {
    marginHorizontal: 22,
    height: 2,
    borderRadius: 2,
    opacity: 0.65,
    marginBottom: 4,
  },
  profileButton: {
    padding: 4,
    marginRight: -4,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 8,
    letterSpacing: -0.3,
  },
  dateLine: {
    fontSize: 14,
    marginTop: 4,
    marginBottom: 18,
    fontWeight: '500',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  sectionSpaced: {
    marginTop: 22,
  },
  loadingBlock: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 12,
  },
  loadingHint: {
    fontSize: 14,
    fontWeight: '500',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  resumeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  todayHero: {
    padding: 18,
  },
  heroRing: {
    borderWidth: 1,
  },
  todayHeroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 16,
  },
  cardIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  cardEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  cardMeta: {
    fontSize: 14,
    marginTop: 6,
    lineHeight: 20,
    fontWeight: '500',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryOutlineBtn: {
    alignSelf: 'stretch',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  secondaryOutlineBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  hintBelow: {
    fontSize: 13,
    marginTop: 10,
    textAlign: 'center',
    fontWeight: '500',
  },
  noPlanEmpty: {
    alignItems: 'center',
    paddingTop: 52,
    paddingBottom: 36,
    paddingHorizontal: 8,
  },
  noPlanIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  noPlanTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
    marginBottom: 10,
  },
  noPlanSub: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    fontWeight: '500',
    marginBottom: 32,
  },
  noPlanCta: {
    alignSelf: 'stretch',
  },
  noPlanLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 18,
  },
  textLink: {
    fontSize: 16,
    fontWeight: '700',
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  rowCardTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  rowCardSub: {
    fontSize: 13,
    marginTop: 3,
    fontWeight: '500',
  },
  menuModalRoot: {
    flex: 1,
  },
  /** Same vertical offset as legacy layout: below header profile control */
  menuCardWrap: {
    position: 'absolute',
    top: PROFILE_BUTTON_TOP + 36,
    right: PROFILE_BUTTON_RIGHT,
    width: MENU_WIDTH,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  menuItemLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  menuDivider: {
    height: 1,
    marginLeft: 16,
  },
  repeatBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  repeatBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  weekDotsSection: {},
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  dotWrapper: {
    alignItems: 'center',
    gap: 8,
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
    borderRadius: 5,
  },
  dotToday: {
    width: 13,
    height: 13,
    borderRadius: 6.5,
  },
  restDash: {
    width: 12,
    height: 3,
    borderRadius: 2,
  },
  dotDayLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
  },
});
