import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { radius, spacing, text, tracking, useTheme, weight } from '../theme';
import { SkeletonList } from '../components/Skeleton';
import { getDislikedExercises, undislikeExercise, type Exercise } from '../services/exerciseService';

/**
 * Profile → Hidden exercises (2026-09-17). Lifts the user said "don't show me
 * this" to, from an exercise page or a preview swap. The server keeps them
 * out of every plan, repair and swap; this page is where one comes back.
 */
export default function HiddenExercisesScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const [rows, setRows] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await getDislikedExercises();
      setRows(list);
    } catch (e) {
      console.warn('[HiddenExercises] load failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const showAgain = useCallback(
    async (exercise: Exercise) => {
      if (busy) return;
      setBusy(exercise.id);
      // Optimistic: the row leaves at once; a failed call brings it back.
      setRows((prev) => prev.filter((r) => r.id !== exercise.id));
      try {
        await undislikeExercise(exercise.id);
      } catch (e) {
        console.warn('[HiddenExercises] undislike failed:', e);
        void load();
      } finally {
        setBusy(null);
      }
    },
    [busy, load],
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        backBtn: { padding: spacing.sm, marginRight: spacing.xs },
        headerTitle: { fontSize: text.headline, fontWeight: weight.bold, color: colors.text },
        intro: {
          fontSize: text.body,
          color: colors.textSecondary,
          marginHorizontal: spacing.lg,
          marginTop: spacing.lg,
          marginBottom: spacing.sm,
        },
        sectionLabel: {
          fontSize: text.body,
          fontWeight: weight.semibold,
          color: colors.textMuted,
          marginHorizontal: spacing.lg,
          marginTop: spacing.lg,
          marginBottom: spacing.sm,
          textTransform: 'uppercase',
          letterSpacing: tracking.wider,
        },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          marginHorizontal: spacing.lg,
          backgroundColor: colors.surface,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          gap: spacing.md,
        },
        rowText: { flex: 1 },
        rowName: { fontSize: text.callout, fontWeight: weight.semibold, color: colors.text },
        rowMeta: { fontSize: text.footnote, color: colors.textSecondary, marginTop: 2 },
        showBtn: {
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.xs,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: colors.primary,
        },
        showBtnText: { fontSize: text.footnote, fontWeight: weight.semibold, color: colors.primary },
        skeletonWrap: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
        empty: { alignItems: 'center', padding: 40, gap: spacing.sm },
        emptyText: { fontSize: text.callout, color: colors.textMuted, textAlign: 'center' },
      }),
    [colors],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Hidden exercises</Text>
      </View>

      {loading ? (
        <View style={styles.skeletonWrap}>
          <SkeletonList count={4} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            rows.length ? (
              <>
                <Text style={styles.intro}>
                  These never go into a plan, a rebuilt day or a swap. Show one again and it can come back next time.
                </Text>
                <Text style={styles.sectionLabel}>Never shown</Text>
              </>
            ) : null
          }
          contentContainerStyle={{ paddingBottom: 120 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialCommunityIcons name="eye-off-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>
                Nothing hidden. On any exercise page, or when swapping one in a plan preview, choose “Don’t show me this” and it lands here.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowName} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {[item.primaryMuscleGroup, item.equipment?.[0]].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.showBtn}
                onPress={() => void showAgain(item)}
                disabled={busy === item.id}
                accessibilityRole="button"
                accessibilityLabel={`Show ${item.name} again`}
              >
                <Text style={styles.showBtnText}>Show again</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
