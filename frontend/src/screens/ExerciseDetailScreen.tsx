import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
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
        loadingContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.background,
        },
        emptyContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
          backgroundColor: colors.background,
        },
        emptyText: { fontSize: 18, color: colors.textTertiary, marginBottom: 20 },
        header: {
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        },
        backButtonContainer: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 2 },
        backButtonText: { fontSize: 16, color: colors.primary, fontWeight: '600' },
        videoSection: {
          padding: 20,
          paddingTop: 0,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        },
        videoSectionTitle: { fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 8 },
        videoSectionHint: { fontSize: 14, color: colors.textSecondary, marginBottom: 12, lineHeight: 20 },
        youtubeButton: {
          backgroundColor: colors.primary + '25',
          paddingVertical: 14,
          paddingHorizontal: 20,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.primary,
        },
        youtubeButtonText: { fontSize: 16, color: colors.primary, fontWeight: '600' },
        backButton: { fontSize: 16, color: colors.primary, fontWeight: '600' },
        content: { flex: 1, backgroundColor: colors.background },
        titleSection: {
          padding: 20,
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        },
        exerciseName: { fontSize: 28, fontWeight: 'bold', color: colors.text, flex: 1, marginRight: 12 },
        titleLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
        difficultyBadge: {
          backgroundColor: colors.primary + '20',
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 12,
        },
        difficultyText: { fontSize: 12, fontWeight: '600', color: colors.primary, textTransform: 'capitalize' },
        section: {
          padding: 20,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        },
        sectionTitle: { fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 12 },
        description: { fontSize: 16, color: colors.textSecondary, lineHeight: 24 },
        tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
        bodyMapRow: {
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 32,
          marginTop: 4,
          marginBottom: 18,
        },
        tag: {
          backgroundColor: colors.primary + '15',
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.primary + '30',
        },
        primaryTag: { backgroundColor: colors.primary + '25', borderColor: colors.primary },
        secondaryTag: { backgroundColor: colors.background, borderColor: colors.border },
        equipmentTag: { backgroundColor: colors.background, borderColor: colors.border },
        movementTag: { backgroundColor: colors.background, borderColor: colors.border },
        historyHeadline: {
          flexDirection: 'row',
          gap: 10,
          marginBottom: 14,
        },
        historyStat: {
          flex: 1,
          paddingVertical: 12,
          paddingHorizontal: 10,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.background,
        },
        historyStatLabel: { fontSize: 11, color: colors.textMuted, marginBottom: 4 },
        historyStatValue: { fontSize: 17, fontWeight: '700', color: colors.text },
        historyChartLabel: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          color: colors.textMuted,
          marginBottom: 8,
        },
        historyChart: {
          flexDirection: 'row',
          alignItems: 'flex-end',
          height: 64,
          gap: 4,
          marginBottom: 16,
        },
        historyBar: { flex: 1, borderRadius: 3, minHeight: 4 },
        historyRow: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 10,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        historyRowDate: { width: 62, fontSize: 13, color: colors.textMuted },
        historyRowMain: { flex: 1, fontSize: 14, color: colors.text, fontWeight: '600' },
        historyRowEst: { fontSize: 12, color: colors.textSecondary },
        tagText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
        collapseHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        collapseTitle: { marginBottom: 0 },
        collapseMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
        collapseCount: { fontSize: 13, color: colors.textSecondary },
        instructionsList: { marginTop: 16 },
        instructionItem: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-start' },
        instructionNumber: {
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: colors.primary,
          justifyContent: 'center',
          alignItems: 'center',
          marginRight: 12,
          marginTop: 2,
        },
        instructionNumberText: { fontSize: 14, fontWeight: 'bold', color: '#FFFFFF' },
        instructionText: { flex: 1, fontSize: 15, color: colors.textSecondary, lineHeight: 22 },
        aliasesText: { fontSize: 15, color: colors.textSecondary, fontStyle: 'italic' },
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
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
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

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Exercise Name + Like + Difficulty */}
        <View style={styles.titleSection}>
          <View style={styles.titleLeft}>
            {/* Same mini body-map tile as the list rows, at hero size — the
                mark the user tapped carries through to the screen they land on. */}
            <MuscleBodyTile exercise={exercise} size={48} />
            <Text style={styles.exerciseName}>{exercise.name}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
              <Text style={[styles.tagText, { color: muscleVisual.color, fontWeight: '600' }]}>
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
