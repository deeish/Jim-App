import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CommonActions, RouteProp, useFocusEffect } from '@react-navigation/native';
import type { RootStackParamList } from '../types/navigation';
import { getExerciseById, Exercise, getSavedExerciseIds, saveExercise, unsaveExercise } from '../services/exerciseService';
import { useTheme } from '../theme/ThemeContext';
import { getMuscleGroupVisual } from '../constants/muscleGroupMeta';
import MuscleBodyTile from '../components/MuscleBodyTile';
import MuscleBodyMap from '../components/bodymap/MuscleBodyMap';
import { exerciseToHighlights } from '../lib/exerciseToHighlights';
import ExerciseLikeButton from '../components/ExerciseLikeButton';
import { getExerciseHistory } from '../services/workoutService';
import { isLinkableLibraryExerciseId } from '../lib/exerciseNavigation';
import {
  formatBestSetValue,
  formatHistoryDate,
  formatHistoryRowMain,
  summarizeExerciseHistory,
  type ExerciseHistory,
} from '../lib/exerciseHistory';
import { exerciseUsesTimeDisplay } from '../lib/exercisePrescription';
import { formatWeightCompactFromLb } from '../lib/weightDisplay';
import { useUserPreferences } from '../contexts/UserPreferencesContext';

import { leading, radius, spacing, text, tracking, weight } from '../theme';
import { useTabBarInset } from '../navigation/useTabBarInset';
import { Skeleton, SkeletonCard } from '../components/Skeleton';
// Enable LayoutAnimation on Android (same guard as SearchScreen)
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const YOUTUBE_SEARCH_BASE = 'https://www.youtube.com/results?search_query=';

function getYouTubeSearchUrl(exerciseName: string): string {
  const query = `${exerciseName.trim()} Demo`;
  return YOUTUBE_SEARCH_BASE + encodeURIComponent(query);
}

/** Bottom tab navigator that hosts Plan / Search / Home (layout can add wrappers, so walk parents). */
function getBottomTabNavigator(navigation: { getParent?: () => any }): any {
  let parent = navigation?.getParent?.();
  while (parent) {
    const st = parent.getState?.();
    const names: string[] | undefined = st?.routeNames;
    if (st?.type === 'tab' || (names?.includes?.('Plan') && names?.includes?.('Search') && names?.includes?.('Home'))) {
      return parent;
    }
    parent = parent.getParent?.();
  }
  return null;
}

/**
 * Find the native stack that hosts SearchList + ExerciseDetail and reset it so Exercises tab
 * shows the browse list (avoids goBack() hitting the wrong navigator after switching tabs).
 */
function resetSearchStackToSearchList(navigation: { getParent?: () => any }): void {
  let parent: any = navigation?.getParent?.();
  for (let i = 0; i < 8 && parent; i++) {
    const st = parent.getState?.();
    const names: string[] | undefined = st?.routeNames;
    if (Array.isArray(names) && names.includes('SearchList') && names.includes('ExerciseDetail')) {
      parent.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'SearchList' }],
        }),
      );
      return;
    }
    parent = parent.getParent?.();
  }
  if (__DEV__) {
    console.warn(
      '[ExerciseDetail] resetSearchStackToSearchList: no navigator with SearchList + ExerciseDetail (parent walk exhausted). Exercises tab may stay on ExerciseDetail.',
    );
  }
}

type ExerciseDetailScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'ExerciseDetail'>;
type ExerciseDetailScreenRouteProp = RouteProp<RootStackParamList, 'ExerciseDetail'>;

type Props = {
  navigation: ExerciseDetailScreenNavigationProp;
  route: ExerciseDetailScreenRouteProp;
};

export default function ExerciseDetailScreen({ navigation, route }: Props) {
  const { exerciseId, returnToPlanPreview } = route.params || {};
  const returnToPlanExerciseContext =
    route.params?.returnToPlanExerciseContext ??
    (returnToPlanPreview ? ('preview' as const) : undefined);
  const leaveExerciseForPlanFlow = returnToPlanExerciseContext != null;
  const { colors } = useTheme();
  const { weightUnit } = useUserPreferences();
  // The tab bar floats over this screen; keep the last sections clear of it.
  const tabBarInset = useTabBarInset();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [savingLike, setSavingLike] = useState(false);
  // Collapsed by default: most users go straight to the video, and the step
  // list is the longest block on the page.
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [history, setHistory] = useState<ExerciseHistory | null>(null);

  /**
   * The user's own history with this lift. Only asked for when the id is a real
   * library id — placeholders and the `'manual'` fallback have no history to
   * fetch — and a failure is silent, since this is an extra on a page that has
   * to work without it.
   */
  useEffect(() => {
    // Cleared first so a reused screen instance can never show the previous
    // exercise's history while the new one is in flight.
    setHistory(null);
    if (!isLinkableLibraryExerciseId(exerciseId)) return;
    let cancelled = false;
    getExerciseHistory(exerciseId as string)
      .then((data) => {
        if (!cancelled) setHistory(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [exerciseId]);

  // Timed work (planks, carries, treadmill blocks) logs duration seconds in
  // the reps field; the summary must know or it would read them as reps.
  const isTimeBased =
    exercise != null &&
    exerciseUsesTimeDisplay(
      exercise.prescriptionType,
      exercise.name,
      exercise.primaryMuscleGroup,
    );
  const historySummary = useMemo(
    () => summarizeExerciseHistory(history, isTimeBased),
    [history, isTimeBased],
  );
  // Scales the bars only. The headline figure is `e1rmBestLb`, which also
  // accounts for an all-time best set older than the plotted window.
  const e1rmChartPeak = useMemo(
    () => Math.max(0, ...historySummary.e1rmTrend.map((p) => p.e1rmLb)),
    [historySummary.e1rmTrend],
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        skeletonWrap: {
          flex: 1,
          padding: spacing.xl,
        },
        emptyContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: spacing.xl,
          backgroundColor: colors.background,
        },
        emptyText: { fontSize: text.headline, color: colors.textTertiary, marginBottom: spacing.xl },
        header: {
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        },
        backButtonContainer: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
        backButtonText: { fontSize: text.callout, color: colors.primary, fontWeight: weight.semibold },
        videoSection: {
          padding: spacing.xl,
          paddingTop: spacing.none,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        },
        videoSectionTitle: { fontSize: text.headline, fontWeight: weight.semibold, color: colors.text, marginBottom: spacing.sm },
        videoSectionHint: { fontSize: text.body, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: leading.body },
        youtubeButton: {
          backgroundColor: colors.primary + '25',
          paddingVertical: spacing.lg,
          paddingHorizontal: spacing.xl,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.primary,
        },
        youtubeButtonText: { fontSize: text.callout, color: colors.primary, fontWeight: weight.semibold },
        backButton: { fontSize: text.callout, color: colors.primary, fontWeight: weight.semibold },
        content: { flex: 1, backgroundColor: colors.background },
        titleSection: {
          padding: spacing.xl,
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        },
        exerciseName: { fontSize: text.display, fontWeight: weight.bold, color: colors.text, flex: 1, marginRight: spacing.md },
        titleLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
        difficultyBadge: {
          backgroundColor: colors.primary + '20',
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: radius.md,
        },
        difficultyText: { fontSize: text.footnote, fontWeight: weight.semibold, color: colors.primary, textTransform: 'capitalize' },
        section: {
          padding: spacing.xl,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        },
        sectionTitle: { fontSize: text.headline, fontWeight: weight.semibold, color: colors.text, marginBottom: spacing.md },
        progressionLabel: { fontSize: text.footnote, fontWeight: weight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
        progressionGroup: { marginTop: spacing.md },
        description: { fontSize: text.callout, color: colors.textSecondary, lineHeight: leading.callout },
        tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
        bodyMapRow: {
          flexDirection: 'row',
          justifyContent: 'center',
          gap: spacing.xxxl,
          marginTop: spacing.xs,
          marginBottom: spacing.lg,
        },
        tag: {
          backgroundColor: colors.primary + '15',
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.primary + '30',
        },
        primaryTag: { backgroundColor: colors.primary + '25', borderColor: colors.primary },
        secondaryTag: { backgroundColor: colors.background, borderColor: colors.border },
        equipmentTag: { backgroundColor: colors.background, borderColor: colors.border },
        movementTag: { backgroundColor: colors.background, borderColor: colors.border },
        historyHeadline: {
          flexDirection: 'row',
          gap: spacing.md,
          marginBottom: spacing.lg,
        },
        historyStat: {
          flex: 1,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.md,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.background,
        },
        historyStatLabel: { fontSize: text.caption, color: colors.textMuted, marginBottom: spacing.xs },
        historyStatValue: { fontSize: text.headline, fontWeight: weight.bold, color: colors.text },
        historyChartLabel: {
          fontSize: text.caption,
          fontWeight: weight.semibold,
          letterSpacing: tracking.wider,
          textTransform: 'uppercase',
          color: colors.textMuted,
          marginBottom: spacing.sm,
        },
        historyChart: {
          flexDirection: 'row',
          alignItems: 'flex-end',
          height: 64,
          gap: spacing.xs,
          marginBottom: spacing.lg,
        },
        historyBar: { flex: 1, borderRadius: radius.xs, minHeight: 4 },
        historyRow: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: spacing.md,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        historyRowDate: { width: 62, fontSize: text.body, color: colors.textMuted },
        historyRowMain: { flex: 1, fontSize: text.body, color: colors.text, fontWeight: weight.semibold },
        historyRowEst: { fontSize: text.footnote, color: colors.textSecondary },
        tagText: { fontSize: text.body, fontWeight: weight.medium, color: colors.textSecondary },
        collapseHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        collapseTitle: { marginBottom: spacing.none },
        collapseMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
        collapseCount: { fontSize: text.body, color: colors.textSecondary },
        instructionsList: { marginTop: spacing.lg },
        instructionItem: { flexDirection: 'row', marginBottom: spacing.lg, alignItems: 'flex-start' },
        instructionNumber: {
          width: 28,
          height: 28,
          borderRadius: radius.pill,
          backgroundColor: colors.primary,
          justifyContent: 'center',
          alignItems: 'center',
          marginRight: spacing.md,
          marginTop: spacing.xxs,
        },
        instructionNumberText: { fontSize: text.body, fontWeight: weight.bold, color: colors.onPrimary },
        instructionText: { flex: 1, fontSize: text.callout, color: colors.textSecondary, lineHeight: leading.callout },
        aliasesText: { fontSize: text.callout, color: colors.textSecondary, fontStyle: 'italic' },
      }),
    [colors]
  );

  const loadExercise = useCallback(async () => {
    if (!exerciseId) return;
    try {
      setLoading(true);
      const [data, savedIds] = await Promise.all([
        getExerciseById(exerciseId),
        getSavedExerciseIds().catch((e) => {
          if (__DEV__) console.warn('[ExerciseDetail] getSavedExerciseIds failed', e);
          return [] as string[];
        }),
      ]);
      setExercise(data);
      const isSaved = savedIds.includes(exerciseId);
      if (__DEV__) console.log('[ExerciseDetail] loadExercise', exerciseId, 'saved:', isSaved, 'savedIds:', savedIds);
      setSaved(isSaved);
    } catch (error) {
      if (__DEV__) console.error('[ExerciseDetail] Error loading exercise:', error);
    } finally {
      setLoading(false);
    }
  }, [exerciseId]);

  // Refetch saved state when screen gains focus so heart stays in sync with list (e.g. user liked on list then opened detail)
  useFocusEffect(
    useCallback(() => {
      if (exerciseId && !loading && exercise) {
        getSavedExerciseIds()
          .then((ids) => {
            const isSaved = ids.includes(exerciseId);
            if (__DEV__) console.log('[ExerciseDetail] focus: refreshed saved state', exerciseId, 'saved:', isSaved);
            setSaved(isSaved);
          })
          .catch((e) => { if (__DEV__) console.warn('[ExerciseDetail] focus: getSavedExerciseIds failed', e); });
      }
    }, [exerciseId, loading, exercise])
  );

  // Plan/Workout → ExerciseDetail (cross-tab): leaving this screen for any reason (tab
  // change, nested nav) must not leave ExerciseDetail on top of the Search stack, or the
  // Exercises tab stays "stuck" on detail. Safe to run unconditionally on every blur —
  // resetting the (possibly backgrounded) Search stack never affects whichever screen the
  // user actually navigated to.
  useFocusEffect(
    useCallback(() => {
      return (): void => {
        if (!leaveExerciseForPlanFlow) return;
        resetSearchStackToSearchList(navigation);
      };
    }, [leaveExerciseForPlanFlow, navigation]),
  );

  // Which bottom tab is "home" for this visit, when ExerciseDetail was opened cross-tab
  // from Plan/Workout. Null means a plain Search → ExerciseDetail visit (goBack suffices).
  const returnTabName: 'Plan' | 'Workout' | null =
    returnToPlanExerciseContext === 'workout'
      ? 'Workout'
      : leaveExerciseForPlanFlow
        ? 'Plan'
        : null;

  // Refocus the originating tab, but ONLY on a genuine "going back" — the on-screen Back
  // button, Android hardware back, and an iOS swipe-back gesture all dispatch a GO_BACK
  // action (that uniform shape across trigger types, including gestures, is what
  // beforeRemove is for). This must NOT fire for every blur: e.g. re-tapping the Exercises
  // tab while viewing a cross-tab-opened exercise deliberately pops to the browse list
  // without changing tabs (see NavBar's Search tabPress listener), and tapping a different
  // tab directly should go to that tab — either would be silently overridden back to
  // Plan/Workout by a blanket "any blur redirects" check, which is exactly what a first
  // pass at this fix got wrong.
  useEffect(() => {
    if (!returnTabName) return undefined;
    const sub = navigation.addListener('beforeRemove', (e) => {
      // GeneratePlanScreen's beforeRemove guard (the only other one in this
      // codebase) checks both — matching it here rather than assuming this
      // stack's swipe/back-gesture path only ever produces GO_BACK.
      const actionType = e.data.action.type;
      if (actionType !== 'GO_BACK' && actionType !== 'POP') return;
      const tabNav = getBottomTabNavigator(navigation);
      tabNav?.navigate(returnTabName);
    });
    return sub;
  }, [returnTabName, navigation]);

  useEffect(() => {
    if (exerciseId) loadExercise();
  }, [exerciseId, loadExercise]);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleToggleLike = async () => {
    if (!exerciseId || savingLike) return;
    if (__DEV__) console.log('[ExerciseDetail] handleToggleLike', exerciseId, 'currently saved:', saved);
    setSavingLike(true);
    try {
      if (saved) {
        await unsaveExercise(exerciseId);
        setSaved(false);
        if (__DEV__) console.log('[ExerciseDetail] unsaved', exerciseId);
      } else {
        await saveExercise(exerciseId);
        setSaved(true);
        if (__DEV__) console.log('[ExerciseDetail] saved', exerciseId);
      }
    } catch (e) {
      if (__DEV__) console.warn('[ExerciseDetail] handleToggleLike failed', exerciseId, e);
    } finally {
      setSavingLike(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.skeletonWrap}>
          <Skeleton width="65%" height={26} />
          <Skeleton width="40%" height={14} style={{ marginTop: spacing.md }} />
          <Skeleton
            width="100%"
            height={180}
            borderRadius={radius.md}
            style={{ marginTop: spacing.xl }}
          />
          <SkeletonCard lines={3} style={{ marginTop: spacing.xl }} />
        </View>
      </SafeAreaView>
    );
  }

  if (!exercise) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Exercise not found</Text>
          <TouchableOpacity onPress={handleBack}>
            <Text style={styles.backButton}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const muscleVisual = getMuscleGroupVisual(exercise.primaryMuscleGroup);
  // Body-map hero: null for cardio/unknown metadata, in which case the section
  // keeps its tags-only layout (the disc stays the fallback mark).
  const bodyMap = exerciseToHighlights(exercise);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backButtonContainer}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={18} color={colors.primary} />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: spacing.xxl + tabBarInset }}
        showsVerticalScrollIndicator={false}
      >
        {/* Exercise Name + Like + Difficulty */}
        <View style={styles.titleSection}>
          <View style={styles.titleLeft}>
            {/* Same mini body-map tile as the list rows, at hero size — the
                mark the user tapped carries through to the screen they land on. */}
            <MuscleBodyTile exercise={exercise} size={48} />
            <Text style={styles.exerciseName}>{exercise.name}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <ExerciseLikeButton
              exerciseId={exercise.id}
              saved={saved}
              onSave={handleToggleLike}
              onUnsave={handleToggleLike}
              disabled={savingLike}
              size={26}
            />
            {exercise.difficulty && (
              <View style={styles.difficultyBadge}>
                <Text style={styles.difficultyText}>{exercise.difficulty}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Description */}
        {exercise.description && (
          <View style={styles.section}>
            <Text style={styles.description}>{exercise.description}</Text>
          </View>
        )}

        {/*
          The user's own history with this lift.

          Hidden entirely when they have never logged it, rather than shown as
          an empty state: this page is reached by browsing a 1,299-exercise
          library, and an empty history block on every unfamiliar movement is
          noise. Load claims are gated on weight data existing, so a bodyweight
          movement shows its reps and no invented numbers. Timed movements
          render durations, and no one-rep max is projected from time — so
          their estimate tile, per-row estimates, and trend never appear.
        */}
        {historySummary.sessions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your history</Text>

            {historySummary.hasWeightedWork && (
              <View style={styles.historyHeadline}>
                {historySummary.best && (
                  <View style={styles.historyStat}>
                    <Text style={styles.historyStatLabel}>Best set</Text>
                    <Text style={styles.historyStatValue}>
                      {formatBestSetValue(
                        historySummary.best,
                        weightUnit,
                        historySummary.isTimeBased,
                      )}
                    </Text>
                  </View>
                )}
                {historySummary.e1rmBestLb != null && (
                  <View style={styles.historyStat}>
                    <Text style={styles.historyStatLabel}>Best est. 1RM</Text>
                    <Text style={styles.historyStatValue}>
                      {formatWeightCompactFromLb(
                        historySummary.e1rmBestLb,
                        weightUnit,
                      )}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {historySummary.e1rmTrend.length > 1 && (
              <>
                <Text style={styles.historyChartLabel}>Estimated 1RM</Text>
                <View style={styles.historyChart}>
                  {historySummary.e1rmTrend.map((point) => {
                    // Scaled from zero would flatten every real change into a
                    // row of near-identical bars, so the floor sits at 40%.
                    const heightPct =
                      e1rmChartPeak > 0
                        ? 40 + (point.e1rmLb / e1rmChartPeak) * 60
                        : 40;
                    return (
                      // Keyed by log id: performedAt is client-supplied and a
                      // double-save can stamp two logs with the same instant.
                      <View
                        key={point.workoutLogId}
                        style={[
                          styles.historyBar,
                          {
                            height: `${heightPct}%`,
                            backgroundColor: colors.primary,
                          },
                        ]}
                      />
                    );
                  })}
                </View>
              </>
            )}

            {historySummary.sessions.map((s) => (
              <View key={s.workoutLogId} style={styles.historyRow}>
                <Text style={styles.historyRowDate}>
                  {formatHistoryDate(s.performedAt)}
                </Text>
                <Text style={styles.historyRowMain}>
                  {formatHistoryRowMain(s, weightUnit, historySummary.isTimeBased)}
                </Text>
                {s.e1rmLb != null && (
                  <Text style={styles.historyRowEst}>
                    {`est. ${formatWeightCompactFromLb(s.e1rmLb, weightUnit)}`}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Primary Muscle Group */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Target Muscles</Text>
          {bodyMap && (
            <View style={styles.bodyMapRow}>
              {/* Lead with the view holding the primary work so the lit figure is read first. */}
              {(bodyMap.view === 'back' ? (['back', 'front'] as const) : (['front', 'back'] as const)).map(
                (mapView) => (
                  <MuscleBodyMap
                    key={mapView}
                    highlights={bodyMap.highlights}
                    view={mapView}
                    size={180}
                    frame="focus"
                  />
                ),
              )}
            </View>
          )}
          <View style={styles.tagsContainer}>
            <View
              style={[
                styles.tag,
                styles.primaryTag,
                { backgroundColor: muscleVisual.softColor, borderColor: muscleVisual.color },
              ]}
            >
              <Text style={[styles.tagText, { color: muscleVisual.color, fontWeight: weight.semibold }]}>
                {exercise.primaryMuscleGroup}
              </Text>
            </View>
            {exercise.subMuscles.map((muscle, index) => (
              <View key={index} style={styles.tag}>
                <Text style={styles.tagText}>{muscle}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Secondary Muscles */}
        {exercise.secondaryMuscleGroups.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Secondary Muscles</Text>
            <View style={styles.tagsContainer}>
              {exercise.secondaryMuscleGroups.map((muscle, index) => (
                <View key={index} style={[styles.tag, styles.secondaryTag]}>
                  <Text style={styles.tagText}>{muscle}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Equipment */}
        {exercise.equipment.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Equipment</Text>
            <View style={styles.tagsContainer}>
              {exercise.equipment.map((eq, index) => (
                <View key={index} style={[styles.tag, styles.equipmentTag]}>
                  <Text style={styles.tagText}>{eq}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Movement Patterns */}
        {exercise.movementPatterns.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Movement Pattern</Text>
            <View style={styles.tagsContainer}>
              {exercise.movementPatterns.map((pattern, index) => (
                <View key={index} style={[styles.tag, styles.movementTag]}>
                  <Text style={styles.tagText}>{pattern}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Progressions — easier/harder ladder neighbors, tappable */}
        {(exercise.progressions?.easier?.length || exercise.progressions?.harder?.length) ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Progressions</Text>
            {exercise.progressions?.easier?.length ? (
              <View>
                <Text style={styles.progressionLabel}>Easier</Text>
                <View style={styles.tagsContainer}>
                  {exercise.progressions.easier.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.tag, styles.secondaryTag]}
                      onPress={() => navigation.push('ExerciseDetail', { exerciseId: p.id })}
                      accessibilityRole="button"
                      accessibilityLabel={`Easier variation: ${p.name}`}
                    >
                      <Text style={styles.tagText}>{p.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}
            {exercise.progressions?.harder?.length ? (
              <View style={exercise.progressions?.easier?.length ? styles.progressionGroup : undefined}>
                <Text style={styles.progressionLabel}>Harder</Text>
                <View style={styles.tagsContainer}>
                  {exercise.progressions.harder.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.tag, styles.secondaryTag]}
                      onPress={() => navigation.push('ExerciseDetail', { exerciseId: p.id })}
                      accessibilityRole="button"
                      accessibilityLabel={`Harder variation: ${p.name}`}
                    >
                      <Text style={styles.tagText}>{p.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Instructions — collapsed by default; the video below covers most users */}
        {exercise.instructions && exercise.instructions.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.collapseHeader}
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setInstructionsOpen((open) => !open);
              }}
              accessibilityRole="button"
              accessibilityState={{ expanded: instructionsOpen }}
              accessibilityLabel="How to Perform"
            >
              <Text style={[styles.sectionTitle, styles.collapseTitle]}>How to Perform</Text>
              <View style={styles.collapseMeta}>
                <Text style={styles.collapseCount}>
                  {exercise.instructions.length} steps
                </Text>
                <Ionicons
                  name={instructionsOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.textSecondary}
                />
              </View>
            </TouchableOpacity>
            {instructionsOpen && (
              <View style={styles.instructionsList}>
                {exercise.instructions.map((instruction, index) => (
                  <View key={index} style={styles.instructionItem}>
                    <View style={styles.instructionNumber}>
                      <Text style={styles.instructionNumberText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.instructionText}>{instruction}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Watch demo: opens YouTube search so user can pick a video */}
        <View style={styles.videoSection}>
          <Text style={styles.videoSectionTitle}>Watch demo</Text>
          <Text style={styles.videoSectionHint}>
            Search YouTube for demo videos and pick one that works for you.
          </Text>
          <TouchableOpacity
            style={styles.youtubeButton}
            onPress={() => Linking.openURL(getYouTubeSearchUrl(exercise.name))}
          >
            <Text style={styles.youtubeButtonText}>Watch demo on YouTube</Text>
          </TouchableOpacity>
        </View>

        {/* Aliases */}
        {exercise.aliases && exercise.aliases.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Also Known As</Text>
            <Text style={styles.aliasesText}>{exercise.aliases.join(', ')}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
