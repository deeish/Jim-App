import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { elevation, radius, spacing, text, tracking, useTheme, weight } from '../theme';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import { formatWeightFromLb, lbToKg } from '../lib/weightDisplay';
import LogWeightSheet from '../components/LogWeightSheet';
import {
  deleteWeighIn,
  listWeighIns,
  type BodyWeightEntry,
} from '../services/bodyWeightService';

/** Signed change between two pound values, formatted in the user's unit. */
function formatDeltaLb(deltaLb: number, unit: 'lb' | 'kg'): string {
  const v = unit === 'kg' ? lbToKg(deltaLb) : deltaLb;
  const rounded = Math.round(v * 10) / 10;
  if (rounded === 0) return `0 ${unit}`;
  const sign = rounded > 0 ? '+' : '−';
  return `${sign}${Math.abs(rounded)} ${unit}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function WeightTrackerScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { weightUnit, goal } = useUserPreferences();
  const [entries, setEntries] = useState<BodyWeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      // A year is plenty for the trend + history list; keeps the payload
      // bounded once daily logging accumulates.
      const rows = await listWeighIns(365);
      setEntries(rows);
    } catch (e) {
      console.warn('[WeightTracker] load failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // entries come back newest-first.
  const latest = entries[0] ?? null;
  const oldest = entries.length ? entries[entries.length - 1] : null;
  const sinceStartLb =
    latest && oldest ? latest.weightLb - oldest.weightLb : null;

  // Oldest -> newest for the left-to-right trend. Only the most recent
  // weigh-ins fit as readable bars; beyond that they shrink to slivers.
  const TREND_BARS = 30;
  const trend = useMemo(
    () => entries.slice(0, TREND_BARS).reverse(),
    [entries],
  );
  const { min, max } = useMemo(() => {
    if (!trend.length) return { min: 0, max: 0 };
    const ws = trend.map((e) => e.weightLb);
    return { min: Math.min(...ws), max: Math.max(...ws) };
  }, [trend]);
  const range = Math.max(max - min, 1);

  const handleDelete = useCallback((entry: BodyWeightEntry) => {
    Alert.alert('Delete weigh-in', `Remove the ${formatDate(entry.loggedAt)} entry?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setEntries((prev) => prev.filter((e) => e.id !== entry.id));
          deleteWeighIn(entry.id).catch((e) => {
            console.warn('[WeightTracker] delete failed:', e);
            void load();
          });
        },
      },
    ]);
  }, [load]);

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
        card: {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          padding: spacing.lg,
          marginHorizontal: spacing.lg,
          marginTop: spacing.lg,
        },
        latestLabel: { fontSize: text.body, color: colors.textMuted },
        latestValue: {
          fontSize: text.hero,
          fontWeight: weight.heavy,
          color: colors.text,
          marginTop: spacing.xxs,
        },
        deltaRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: spacing.sm },
        deltaText: { fontSize: text.body, fontWeight: weight.semibold },
        chart: {
          flexDirection: 'row',
          alignItems: 'flex-end',
          height: 90,
          gap: spacing.xs,
          marginTop: spacing.lg,
        },
        bar: { flex: 1, borderRadius: radius.xs, minHeight: 6 },
        sectionLabel: {
          fontSize: text.body,
          fontWeight: weight.semibold,
          color: colors.textMuted,
          marginHorizontal: spacing.lg,
          marginTop: spacing.xxl,
          marginBottom: spacing.sm,
          textTransform: 'uppercase',
          letterSpacing: tracking.wider,
        },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: spacing.lg,
          paddingHorizontal: spacing.lg,
          marginHorizontal: spacing.lg,
          backgroundColor: colors.surface,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        rowDate: { fontSize: text.body, color: colors.textSecondary },
        rowWeight: { fontSize: text.callout, fontWeight: weight.bold, color: colors.text },
        rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
        rowDelta: { fontSize: text.body, fontWeight: weight.semibold },
        empty: { alignItems: 'center', padding: 40, gap: spacing.sm },
        emptyText: { fontSize: text.callout, color: colors.textMuted, textAlign: 'center' },
        fab: {
          position: 'absolute',
          right: 20,
          bottom: 28,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: colors.primary,
          paddingVertical: spacing.lg,
          paddingHorizontal: spacing.xl,
          borderRadius: radius.xxl,
          shadowColor: colors.shadow,
          ...elevation.level2,
        },
        fabText: { color: colors.onPrimary, fontSize: text.callout, fontWeight: weight.bold },
      }),
    [colors],
  );

  // Only color the change green/orange when the goal implies a desired direction
  // (lose vs. gain). For strength/endurance/general goals weight has no "good"
  // direction, so the delta stays neutral.
  const favorableDirection: 'down' | 'up' | null =
    goal === 'Fat loss' ? 'down' : goal === 'Hypertrophy' ? 'up' : null;
  const deltaColor = (deltaLb: number) => {
    if (deltaLb === 0 || favorableDirection === null) return colors.textMuted;
    const favorable = favorableDirection === 'down' ? deltaLb < 0 : deltaLb > 0;
    return favorable ? colors.success : colors.warning;
  };

  const header = (
    <>
      <View style={styles.card}>
        <Text style={styles.latestLabel}>Current weight</Text>
        <Text style={styles.latestValue}>
          {latest ? formatWeightFromLb(latest.weightLb, weightUnit) : '—'}
        </Text>
        {sinceStartLb != null && oldest && entries.length > 1 ? (
          <View style={styles.deltaRow}>
            <MaterialCommunityIcons
              name={sinceStartLb < 0 ? 'arrow-down' : sinceStartLb > 0 ? 'arrow-up' : 'minus'}
              size={16}
              color={deltaColor(sinceStartLb)}
            />
            <Text style={[styles.deltaText, { color: deltaColor(sinceStartLb) }]}>
              {formatDeltaLb(sinceStartLb, weightUnit)} since{' '}
              {formatDate(oldest.loggedAt)}
            </Text>
          </View>
        ) : null}
        {trend.length > 1 ? (
          <View style={styles.chart}>
            {trend.map((e) => {
              const frac = (e.weightLb - min) / range;
              const heightPct = 25 + frac * 75; // keep bars visible even when flat
              return (
                <View
                  key={e.id}
                  style={[
                    styles.bar,
                    { height: `${heightPct}%`, backgroundColor: colors.primarySoft },
                  ]}
                />
              );
            })}
          </View>
        ) : null}
      </View>
      <Text style={styles.sectionLabel}>History</Text>
    </>
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
        <Text style={styles.headerTitle}>Weight</Text>
      </View>

      {loading ? (
        <View style={styles.empty}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingBottom: 120 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialCommunityIcons name="scale-bathroom" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>
                No weigh-ins yet. Tap “Log weight” to add your first entry.
              </Text>
            </View>
          }
          renderItem={({ item, index }) => {
            // entries are newest-first, so the next item is the previous weigh-in.
            const prev = entries[index + 1];
            const deltaLb = prev ? item.weightLb - prev.weightLb : null;
            return (
              <View style={styles.row}>
                <View>
                  <Text style={styles.rowWeight}>
                    {formatWeightFromLb(item.weightLb, weightUnit)}
                  </Text>
                  <Text style={styles.rowDate}>{formatDate(item.loggedAt)}</Text>
                </View>
                <View style={styles.rowRight}>
                  {deltaLb != null ? (
                    <Text style={[styles.rowDelta, { color: deltaColor(deltaLb) }]}>
                      {formatDeltaLb(deltaLb, weightUnit)}
                    </Text>
                  ) : null}
                  <TouchableOpacity
                    onPress={() => handleDelete(item)}
                    accessibilityRole="button"
                    accessibilityLabel="Delete weigh-in"
                    hitSlop={8}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setSheetOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Log weight"
      >
        <MaterialCommunityIcons name="plus" size={20} color={colors.onPrimary} />
        <Text style={styles.fabText}>Log weight</Text>
      </TouchableOpacity>

      <LogWeightSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        defaultWeightLb={latest?.weightLb ?? null}
        onLogged={() => void load()}
      />
    </SafeAreaView>
  );
}
