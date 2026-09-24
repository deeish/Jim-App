import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  fatiguedForToday,
  muscleNamesSentence,
  MuscleRecovery,
  RECOVERY_SCALE,
  RecoveryRegion,
} from '../lib/muscleRecovery';
import { getMuscleRecovery } from '../services/workoutService';
import { radius, spacing, text, useTheme, weight } from '../theme';

/**
 * Pre-workout card: the moment the recovery estimate can change something.
 * Shows only when a session is about to start AND one of its muscles is still
 * at "working hard" or above; otherwise renders nothing, so it is never a nag.
 * Guidance is a range, never a silent cut: "shoot for the range, go by feel".
 * "See on the body" opens the Muscles section with the Recovery layer on.
 */
export default function RecoveryCard({
  exerciseIds,
  onSeeOnBody,
}: {
  /** Exercise ids of the session about to start. */
  exerciseIds: string[];
  /** Opens Muscles with the Recovery layer on, framed on `region` when given. */
  onSeeOnBody: (region: string | null) => void;
}) {
  const { colors } = useTheme();
  const [recovery, setRecovery] = useState<MuscleRecovery | null>(null);
  const idsKey = exerciseIds.join(',');
  useEffect(() => {
    let cancelled = false;
    if (!idsKey) return undefined;
    getMuscleRecovery(exerciseIds)
      .then((data) => {
        if (!cancelled) setRecovery(data);
      })
      .catch(() => {
        /* offline or not signed in: no card */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const tired = useMemo(() => fatiguedForToday(recovery), [recovery]);
  // One chip per catalog muscle, hottest region of each.
  const chips = useMemo(() => {
    const seen = new Map<string, RecoveryRegion>();
    for (const r of tired) if (!seen.has(r.muscle)) seen.set(r.muscle, r);
    return [...seen.values()];
  }, [tired]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          marginHorizontal: spacing.lg,
          marginTop: spacing.md,
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          padding: spacing.md,
          gap: spacing.sm,
        },
        title: { fontSize: text.callout, fontWeight: weight.bold, color: colors.text },
        sub: { fontSize: text.footnote, color: colors.textSecondary, marginTop: 2 },
        chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
        chip: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs + 2,
          paddingVertical: spacing.xs,
          paddingHorizontal: spacing.sm + 2,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.background,
        },
        swatch: { width: 10, height: 10, borderRadius: 3 },
        chipText: { fontSize: text.footnote, fontWeight: weight.semibold, color: colors.text },
        chipMeta: { color: colors.textSecondary, fontWeight: weight.regular },
        link: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', marginTop: 2 },
        linkText: { fontSize: text.footnote, fontWeight: weight.semibold, color: colors.primary },
      }),
    [colors],
  );

  if (chips.length === 0) return null;
  const names = muscleNamesSentence(chips);

  return (
    <View style={styles.card} accessibilityRole="summary">
      <View>
        <Text style={styles.title}>
          {names} {chips.length === 1 ? 'is' : 'are'} still recovering
        </Text>
        <Text style={styles.sub}>Estimated from your last sessions · shoot for the range, go by feel</Text>
      </View>
      <View style={styles.chips}>
        {chips.map((r) => (
          <View key={r.region} style={styles.chip}>
            <View style={[styles.swatch, { backgroundColor: RECOVERY_SCALE[Math.min(5, r.step) - 1] }]} />
            <Text style={styles.chipText}>
              {r.muscle} <Text style={styles.chipMeta}>· {r.label.toLowerCase()}</Text>
            </Text>
          </View>
        ))}
      </View>
      <Pressable
        onPress={() => onSeeOnBody(chips[0]?.region ?? null)}
        style={styles.link}
        accessibilityRole="button"
        hitSlop={8}
      >
        <Text style={styles.linkText}>Not how it feels? See on the body</Text>
        <Ionicons name="chevron-forward" size={14} color={colors.primary} />
      </Pressable>
    </View>
  );
}
