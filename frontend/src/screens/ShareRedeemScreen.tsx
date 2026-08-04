import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootNavigatorParamList } from '../types/navigation';
import { useTheme } from '../theme/ThemeContext';
import Button from '../components/Button';
import {
  acceptShare,
  getShareByCode,
  type SharePreview,
  type SharePreviewExercise,
} from '../services/shareService';
import {
  formatShareCode,
  formatShareCodeInput,
  isValidShareCode,
  normalizeShareCode,
} from '../lib/shareCode';
import { formatRepRange } from '../lib/formatExerciseRepsDisplay';
import { parseShareCodeFromUrl } from '../lib/shareLinks';
import { apiErrorMessage } from '../lib/apiErrorMessage';

import { leading, radius, spacing, text, tracking, weight } from '../theme';
type Navigation = NativeStackNavigationProp<RootNavigatorParamList>;
type Route = RouteProp<RootNavigatorParamList, 'ShareRedeem'>;

const INVALID_CODE_MESSAGE = "That code doesn't look right.";

function replacePlanWarning(currentPlanName: string): string {
  return `Accepting replaces your current plan "${currentPlanName}". Your workout history is kept.`;
}

/** "4 × 8–12" / "3 × 45 sec" second line for a preview exercise row. */
function exerciseMeta(e: SharePreviewExercise): string {
  if (e.durationSeconds != null && e.durationSeconds > 0) {
    const secs = e.durationSeconds;
    const time =
      secs >= 120 && secs % 60 === 0 ? `${secs / 60} min` : `${secs} sec`;
    return `${e.sets} × ${time}`;
  }
  const range = formatRepRange(e.repsMin, e.repsMax);
  return `${e.sets} × ${range ?? e.reps}`;
}

/**
 * Redeem a share code: manual entry (Profile > Redeem a share code) or a
 * jimapp://share/CODE deep link. Shows a preview of the shared plan/workout,
 * then clones it into this account on Accept.
 */
export default function ShareRedeemScreen() {
  const navigation = useNavigation<Navigation>();
  const route = useRoute<Route>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SharePreview | null>(null);
  const [previewCode, setPreviewCode] = useState<string | null>(null);

  const fetchPreview = useCallback(async (code: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getShareByCode(code);
      setPreview(result);
      setPreviewCode(code);
    } catch (err) {
      setPreview(null);
      setPreviewCode(null);
      setError(apiErrorMessage(err, 'Could not look up that code.'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Deep link entry; also reacts when a second link arrives while open.
  useEffect(() => {
    const raw = route.params?.code;
    if (!raw) return;
    const code = normalizeShareCode(raw);
    if (!code) {
      setError(INVALID_CODE_MESSAGE);
      return;
    }
    setInput(formatShareCode(code));
    void fetchPreview(code);
  }, [route.params?.code, fetchPreview]);

  const handleSubmit = () => {
    const code = normalizeShareCode(input);
    if (!code) {
      setError(INVALID_CODE_MESSAGE);
      return;
    }
    void fetchPreview(code);
  };

  const handleInputChange = (text: string) => {
    // Buddies often paste the whole "jimapp://share/CODE" link or message text
    // rather than just the code; pull the code out of a link when present.
    const fromUrl = parseShareCodeFromUrl(text.trim());
    setInput(formatShareCodeInput(fromUrl ?? text));
    setError(null);
  };

  // Offer the lookup button until a preview exists, and again whenever the
  // typed code differs from the one being previewed.
  const normalizedInput = normalizeShareCode(input);
  const showLookupButton =
    !loading && (!preview || (normalizedInput !== null && normalizedInput !== previewCode));

  const goToPlanTab = useCallback(() => {
    navigation.navigate('Main', {
      screen: 'Plan',
      params: { screen: 'PlanList', params: undefined },
    });
  }, [navigation]);

  const goToWorkout = useCallback(
    (workoutId: string) => {
      navigation.navigate('Main', {
        screen: 'Plan',
        params: { screen: 'WorkoutDetail', params: { workoutId } },
      });
    },
    [navigation],
  );

  const doAccept = useCallback(async () => {
    if (!previewCode) return;
    setAccepting(true);
    try {
      const result = await acceptShare(previewCode);
      if (result.kind === 'plan') {
        goToPlanTab();
      } else if (result.workoutId) {
        goToWorkout(result.workoutId);
      }
    } catch (err) {
      Alert.alert(
        'Could not accept',
        apiErrorMessage(err, 'Something went wrong. Please try again.'),
      );
    } finally {
      setAccepting(false);
    }
  }, [previewCode, goToPlanTab, goToWorkout]);

  const handleAccept = () => {
    if (!preview) return;
    if (preview.kind === 'plan' && preview.recipientActivePlanName) {
      Alert.alert(
        'Replace your current plan?',
        replacePlanWarning(preview.recipientActivePlanName),
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Replace', style: 'destructive', onPress: () => void doAccept() },
        ],
      );
      return;
    }
    void doAccept();
  };

  const handleOpenExisting = () => {
    if (!preview) return;
    if (preview.kind === 'plan') {
      goToPlanTab();
    } else if (preview.redeemedWorkoutId) {
      goToWorkout(preview.redeemedWorkoutId);
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        backBar: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.sm,
          paddingBottom: spacing.md,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        },
        backButton: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.md,
        },
        backButtonText: { fontSize: text.callout, fontWeight: weight.semibold, color: colors.primary },
        headerTitle: {
          fontSize: text.callout,
          fontWeight: weight.bold,
          color: colors.text,
          marginLeft: spacing.xs,
        },
        content: { padding: spacing.xl, paddingBottom: 40, gap: spacing.lg },
        promptText: {
          fontSize: text.callout,
          color: colors.textSecondary,
          lineHeight: leading.callout,
        },
        codeInput: {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.md,
          backgroundColor: colors.surface,
          color: colors.text,
          fontSize: text.display,
          fontWeight: weight.bold,
          letterSpacing: tracking.widest,
          textAlign: 'center',
          paddingVertical: spacing.lg,
          fontVariant: ['tabular-nums'],
        },
        errorText: {
          fontSize: text.body,
          color: colors.error,
          textAlign: 'center',
        },
        loadingBox: { paddingVertical: 40, alignItems: 'center' },
        sharedByText: { fontSize: text.body, color: colors.textSecondary },
        previewTitle: {
          fontSize: text.title,
          fontWeight: weight.bold,
          color: colors.text,
        },
        previewMeta: { fontSize: text.body, color: colors.textSecondary },
        warningBox: {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.md,
          backgroundColor: colors.surface,
          padding: spacing.lg,
        },
        warningText: { fontSize: text.body, color: colors.text, lineHeight: leading.body },
        bannerText: {
          fontSize: text.body,
          color: colors.textSecondary,
          textAlign: 'center',
        },
        weekHeader: {
          fontSize: text.body,
          fontWeight: weight.bold,
          color: colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: tracking.wider,
          marginTop: spacing.sm,
        },
        slotCard: {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.md,
          backgroundColor: colors.surface,
          padding: spacing.lg,
          gap: spacing.xs,
        },
        slotTitle: { fontSize: text.callout, fontWeight: weight.semibold, color: colors.text },
        slotMeta: { fontSize: text.body, color: colors.textSecondary },
        exerciseRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingVertical: spacing.sm,
        },
        exerciseName: { fontSize: text.callout, color: colors.text, flex: 1, paddingRight: spacing.md },
        exerciseMeta: { fontSize: text.body, color: colors.textSecondary },
        acceptButton: { minHeight: 48, marginTop: spacing.sm },
      }),
    [colors],
  );

  const previewBody = () => {
    if (!preview) return null;

    const acceptDisabled = preview.isOwnShare || accepting;

    return (
      <>
        <Text style={styles.sharedByText}>
          Shared by {preview.sharedByName}
        </Text>

        {preview.kind === 'plan' && preview.plan ? (
          <>
            <Text style={styles.previewTitle}>{preview.plan.name}</Text>
            <Text style={styles.previewMeta}>
              {preview.plan.weekCount}{' '}
              {preview.plan.weekCount === 1 ? 'week' : 'weeks'} ·{' '}
              {preview.plan.slots.length}{' '}
              {preview.plan.slots.length === 1 ? 'session' : 'sessions'}
            </Text>
            {preview.recipientActivePlanName && !preview.isOwnShare ? (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  {replacePlanWarning(preview.recipientActivePlanName)}
                </Text>
              </View>
            ) : null}
            {Array.from(
              new Set(preview.plan.slots.map((s) => s.weekNumber)),
            ).map((week) => (
              <View key={week} style={{ gap: spacing.sm }}>
                {(preview.plan?.weekCount ?? 0) > 1 ? (
                  <Text style={styles.weekHeader}>Week {week}</Text>
                ) : null}
                {preview.plan?.slots
                  .filter((s) => s.weekNumber === week)
                  .map((slot, i) => {
                    const names = slot.exercises
                      .map((e) => e.name)
                      .filter((n): n is string => !!n);
                    const summary =
                      names.length <= 3
                        ? names.join(' · ')
                        : `${names.slice(0, 3).join(' · ')} +${names.length - 3} more`;
                    return (
                      <View key={`${week}-${slot.dayOfWeek}-${i}`} style={styles.slotCard}>
                        <Text style={styles.slotTitle}>
                          {slot.dayOfWeek}: {slot.title}
                        </Text>
                        <Text style={styles.slotMeta}>
                          {slot.durationMinutes} min ·{' '}
                          {slot.exerciseCount}{' '}
                          {slot.exerciseCount === 1 ? 'exercise' : 'exercises'}
                        </Text>
                        {summary ? (
                          <Text style={styles.slotMeta} numberOfLines={2}>
                            {summary}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })}
              </View>
            ))}
          </>
        ) : null}

        {preview.kind === 'workout' && preview.workout ? (
          <>
            <Text style={styles.previewTitle}>{preview.workout.name}</Text>
            <Text style={styles.previewMeta}>
              {[
                preview.workout.day,
                preview.workout.estimatedDuration
                  ? `${preview.workout.estimatedDuration} min`
                  : null,
                preview.workout.focus,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <View style={styles.slotCard}>
              {preview.workout.exercises.map((e, i) => (
                <View key={i} style={styles.exerciseRow}>
                  <Text style={styles.exerciseName} numberOfLines={2}>
                    {e.name ?? 'Exercise'}
                  </Text>
                  <Text style={styles.exerciseMeta}>{exerciseMeta(e)}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {preview.isOwnShare ? (
          <Text style={styles.bannerText}>
            This is your own share code. Send it to a gym buddy!
          </Text>
        ) : preview.alreadyRedeemed ? (
          <>
            <Text style={styles.bannerText}>
              You already added this to your account.
            </Text>
            <Button
              title="Open"
              onPress={handleOpenExisting}
              style={styles.acceptButton}
            />
          </>
        ) : (
          <Button
            title={
              preview.kind === 'plan' ? 'Add to my plans' : 'Add to my workouts'
            }
            onPress={handleAccept}
            loading={accepting}
            disabled={acceptDisabled}
            style={styles.acceptButton}
          />
        )}
      </>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.backBar, { paddingTop: Math.max(insets.top, 6) + 6 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Redeem a share code</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.promptText}>
          Enter the code your gym buddy sent you, or scan their QR code with
          your phone camera.
        </Text>
        <TextInput
          style={styles.codeInput}
          value={input}
          onChangeText={handleInputChange}
          placeholder="XXXX-XXXX"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
          accessibilityLabel="Share code"
          testID="e2e-share-code-input"
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {showLookupButton ? (
          <Button
            title="Look up code"
            onPress={handleSubmit}
            disabled={!isValidShareCode(input)}
          />
        ) : null}

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          previewBody()
        )}
      </ScrollView>
    </View>
  );
}
