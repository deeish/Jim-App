import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Platform,
  ViewStyle,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
  InteractionManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import { ProfileAvatarDisc } from '../components/ProfileAvatarDisc';
import type { RootNavigatorParamList } from '../types/navigation';
import { RootTabParamList } from '../components/NavBar';
import { getCurrentPlanWithWeekly } from '../services/planService';
import type { ApiPlan, ApiPlanWorkout } from '../services/planService';
import { loadWorkoutDraft } from '../lib/workoutDraftStorage';
import type { Workout } from '../types/workout';
import type { PersistedWorkoutDraft } from '../lib/workoutDraftStorage';
import { resolveHomeToday, buildPlanByWeek, planSlotLinksWeeklyWorkout, type HomeTodayResult } from '../lib/homeToday';
import {
  programWeekForCalendarOffset,
  normalizeProgramWeekNumber,
  isRestPlanSlotTitle,
  PLAN_WEEKDAY_NAMES_MONDAY_FIRST,
} from '../lib/planCalendar';
import { getWorkoutDisplayEstimateMinutes } from '../lib/estimateWorkoutMinutes';

type HomeNavigation = BottomTabNavigationProp<RootTabParamList, 'Home'>;

function getGreeting(firstName?: string): string {
  const h = new Date().getHours();
  const time = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  return firstName ? `Good ${time}, ${firstName}!` : `Good ${time}`;
}

type DotStatus = 'completed' | 'today' | 'scheduled' | 'rest';

function formatTodayDateLine(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function buildTodayMetaLine(workout: Workout): string {
  const parts: string[] = [];
  const planned = workout.estimatedDuration ?? null;
  const displayMin = getWorkoutDisplayEstimateMinutes(workout.exercises, planned);
  const n = workout.exercises?.length ?? 0;
  if (displayMin != null) parts.push(`Est. ${displayMin} min`);
  const exercisePhrase = `${n} ${n === 1 ? 'exercise' : 'exercises'}`;
  const focusRaw = workout.focus?.trim();
  if (focusRaw) {
    const segments = focusRaw.split(/\s*·\s*/).map((s) => s.trim()).filter(Boolean);
    for (const seg of segments) {
      if (/^\d+\s*min$/i.test(seg)) {
        const m = parseInt(seg, 10);
        if (m === displayMin || m === planned) continue;
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
  const exerciseLike = slot.exercises?.map((e) => ({ sets: e.sets, reps: e.reps }));
  const displayMin = getWorkoutDisplayEstimateMinutes(exerciseLike, slot.durationMinutes);
  if (displayMin != null) parts.push(`${displayMin} min`);
  const detail = slot.detailLine?.trim();
  if (detail) parts.push(detail.replace(/·/g, '·'));
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
  const [homeToday, setHomeToday] = useState<HomeTodayResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<PersistedWorkoutDraft | null>(null);
  const [plan, setPlan] = useState<ApiPlan | null>(null);
  const [weeklyWorkouts, setWeeklyWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isFirstLoad = useRef(true);

  const openMenu = () => setMenuVisible(true);
  const closeMenu = () => setMenuVisible(false);

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

      const { plan: fetchedPlan, weeklyWorkouts: fetchedWeekly } = await getCurrentPlanWithWeekly();
      setPlan(fetchedPlan ?? null);
      setWeeklyWorkouts(fetchedWeekly ?? []);
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

  const onSignOut = () => {
    closeMenu();
    InteractionManager.runAfterInteractions(() => {
      Alert.alert(
        'Sign out?',
        '',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
        ]
      );
    });
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
      menuItemLabelDisabled: { color: colors.textMuted },
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
    const current = programWeekForCalendarOffset(0, plan.weekAnchorMonday, maxWeek);
    if (current == null) return null;
    return { current, total: maxWeek };
  }, [plan]);

  const weekDots = useMemo((): { status: DotStatus; name: string | null }[] => {
    if (!plan?.planWorkouts?.length) return [];
    const maxWeek = Math.max(...plan.planWorkouts.map((pw) => normalizeProgramWeekNumber(pw.weekNumber)));
    const currentWeek = programWeekForCalendarOffset(0, plan.weekAnchorMonday, maxWeek);
    if (currentWeek == null) return [];
    const byWeek = buildPlanByWeek(plan.planWorkouts);
    const thisWeek = byWeek[currentWeek] ?? {};
    const todayIdx = new Date().getDay();
    const todayName = PLAN_WEEKDAY_NAMES_MONDAY_FIRST[todayIdx === 0 ? 6 : todayIdx - 1];
    return PLAN_WEEKDAY_NAMES_MONDAY_FIRST.map((day) => {
      const slots = thisWeek[day] ?? [];
      const nonRest = slots.filter((s) => !isRestPlanSlotTitle(s.title));
      if (!nonRest.length) return { status: 'rest', name: null };
      const name = nonRest[0].title ?? null;
      const completed = nonRest.some((s) =>
        weeklyWorkouts.some((w) => planSlotLinksWeeklyWorkout(s.id, w.planWorkoutId))
      );
      if (completed) return { status: 'completed', name };
      if (day === todayName) return { status: 'today', name };
      return { status: 'scheduled', name };
    });
  }, [plan, weeklyWorkouts]);

  const scheduledWorkout = homeToday?.status === 'scheduled' ? homeToday.workout : null;
  const metaLine = scheduledWorkout ? buildTodayMetaLine(scheduledWorkout) : '';
  const hasExercises = (scheduledWorkout?.exercises?.length ?? 0) > 0;

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
        <TouchableOpacity
          style={styles.profileButton}
          onPress={openMenu}
          activeOpacity={0.7}
          accessibilityLabel="Profile menu"
        >
          <ProfileAvatarDisc avatarId={profileAvatarId} size={34} colors={colors} />
        </TouchableOpacity>
      </View>

      <View style={[styles.accentBar, themedStyles.accentHairline]} />

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
      >
        <Pressable style={[styles.menuBackdrop, { backgroundColor: colors.overlay }]} onPress={closeMenu}>
          <View style={styles.menuAnchor} />
          <Pressable style={[styles.menuCard, themedStyles.menuCard]} onPress={(e) => e.stopPropagation()}>
            <TouchableOpacity style={styles.menuItem} onPress={goToProfile} activeOpacity={0.7}>
              <Ionicons name="person-outline" size={22} color={colors.text} />
              <Text style={[styles.menuItemLabel, themedStyles.menuItemLabel]}>My profile</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
            <View style={[styles.menuDivider, themedStyles.menuDivider]} />
            <View style={[styles.menuItem, styles.menuItemDisabled]}>
              <Ionicons name="people-outline" size={22} color={colors.textMuted} />
              <Text style={[styles.menuItemLabelDisabled, themedStyles.menuItemLabelDisabled]}>Invite a friend</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </View>
            <View style={[styles.menuDivider, themedStyles.menuDivider]} />
            <TouchableOpacity style={styles.menuItem} onPress={onSignOut} activeOpacity={0.7}>
              <Ionicons name="log-out-outline" size={22} color={colors.text} />
              <Text style={[styles.menuItemLabel, themedStyles.menuItemLabel]}>Sign out</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
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
          {formatTodayDateLine()}{programWeekInfo ? ` · Week ${programWeekInfo.current} of ${programWeekInfo.total}` : ''}
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
                    Tap to resume on Workout
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
                    {hasExercises ? 'Open workout' : 'Open workout — add exercises'}
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
                      No session on your plan today — add one from Plan if you'd like.
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
                      Before your program start or after the last program week. Switch week on Plan or extend
                      your program.
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
                  Generate a personalised week with AI, or build your schedule manually.
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

            {!loadError && weekDots.length > 0 && (
              <View style={styles.weekDotsSection}>
                <Text style={[styles.sectionLabel, styles.sectionSpaced, themedStyles.sectionLabel]}>This week</Text>
                <View style={styles.dotsRow}>
                  {PLAN_WEEKDAY_NAMES_MONDAY_FIRST.map((day, i) => {
                    const { status, name } = weekDots[i] ?? { status: 'rest' as DotStatus, name: null };
                    const isToday = status === 'today';
                    return (
                      <View key={day} style={styles.dotWrapper}>
                        <Text style={[styles.dotDayLabel, { color: isToday ? colors.primary : colors.textMuted, fontWeight: isToday ? '700' : '500' }]}>
                          {day.slice(0, 2)}
                        </Text>
                        {status === 'rest' ? (
                          <View style={[styles.dot, { backgroundColor: colors.textMuted + '30', width: 6, height: 6, borderRadius: 3 }]} />
                        ) : (
                          <View
                            style={[
                              styles.dot,
                              status === 'completed' && { backgroundColor: colors.primary },
                              isToday && { backgroundColor: colors.primary, width: 12, height: 12, borderRadius: 6 },
                              status === 'scheduled' && { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.textMuted + '80' },
                            ]}
                          />
                        )}
                        <Text style={[styles.dotSessionName, { color: isToday ? colors.primary : colors.textMuted }]} numberOfLines={1}>
                          {name ?? '–'}
                        </Text>
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
  emptyTodayLink: {
    marginTop: 14,
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
  textLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 16,
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
  menuBackdrop: {
    flex: 1,
    paddingTop: PROFILE_BUTTON_TOP + 36,
    paddingRight: PROFILE_BUTTON_RIGHT,
    alignItems: 'flex-end',
    ...(Platform.OS === 'web' ? { cursor: 'default' } : {}),
  } as ViewStyle,
  menuAnchor: {
    position: 'absolute',
    top: PROFILE_BUTTON_TOP,
    right: PROFILE_BUTTON_RIGHT,
    width: 40,
    height: 40,
  },
  menuCard: {
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
  menuItemDisabled: {
    opacity: 0.6,
  },
  menuItemLabelDisabled: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  menuDivider: {
    height: 1,
    marginLeft: 16,
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
    gap: 6,
    flex: 1,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotDayLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
  },
  dotSessionName: {
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 40,
  },
});
