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
  const { colors, isDark } = useTheme();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [savingLike, setSavingLike] = useState(false);
  // Collapsed by default: most users go straight to the video, and the step
  // list is the longest block on the page.
  const [instructionsOpen, setInstructionsOpen] = useState(false);

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

  // Which bottom tab is "home" for this visit, when ExerciseDetail was opened cross-tab
  // from Plan/Workout. Null means a plain Search → ExerciseDetail visit (goBack suffices).
  const returnTabName: 'Plan' | 'Workout' | null =
    returnToPlanExerciseContext === 'workout'
      ? 'Workout'
      : leaveExerciseForPlanFlow
        ? 'Plan'
        : null;

  // Leaving this screen for ANY reason — the on-screen Back button, Android hardware back,
  // or an iOS swipe-back gesture — must reset the Exercises stack and refocus the tab the
  // user actually came from. A swipe pops the native stack directly, without running any
  // of our own back-press handling, so a focus-effect cleanup (the one hook that fires on
  // every one of those paths alike) is the single source of truth instead of duplicating
  // this per trigger and missing the gesture case.
  useFocusEffect(
    useCallback(() => {
      return (): void => {
        if (!returnTabName) return;
        resetSearchStackToSearchList(navigation);
        const tabNav = getBottomTabNavigator(navigation);
        tabNav?.navigate(returnTabName);
      };
    }, [returnTabName, navigation]),
  );

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

  const muscleVisual = getMuscleGroupVisual(exercise.primaryMuscleGroup, isDark);
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
