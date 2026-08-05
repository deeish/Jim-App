import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, text, tracking, useTheme, weight, type ColorPalette } from '../theme';
import { useTabBarInset } from '../navigation/useTabBarInset';
import { SkeletonCard } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import type { RootStackParamList } from '../types/navigation';
import { listPlanTemplates, type PlanTemplateCard } from '../services/templateService';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Templates'>;

const GOAL_LABEL: Record<PlanTemplateCard['goal'], string> = {
  strength: 'Strength',
  'fat loss': 'Fat loss',
  hybrid: 'Hypertrophy',
};

const LEVEL_LABEL: Record<PlanTemplateCard['experienceLevel'], string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

function weekdayShort(day: string): string {
  return day.slice(0, 3);
}

/**
 * Coach-written 8-week programs. Cards only — the full week-by-week program
 * lives on TemplateDetail. Content is static server data, so a load failure
 * is rare; it still gets a retry state like Progress/History.
 */
export default function TemplatesScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // The tab bar floats over this screen; the last card must clear it.
  const tabBarInset = useTabBarInset();

  const [templates, setTemplates] = useState<PlanTemplateCard[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setTemplates(await listPlanTemplates());
    } catch (e) {
      console.warn('[Templates] load failed:', e);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading && !templates) {
    return (
      <View style={styles.container}>
        <View style={styles.skeletonWrap}>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} style={{ marginTop: spacing.lg }} />
          <SkeletonCard lines={3} style={{ marginTop: spacing.lg }} />
        </View>
      </View>
    );
  }

  if (failed && !templates) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="cloud-offline-outline"
          title="Could not load templates"
          body="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => void load()}
          tone="error"
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: spacing.xxxl + tabBarInset }]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.lede}>
        Coach-written 8-week programs. Pick one, choose your training days, and
        it lands on your plan — every set, rep and rest already decided.
      </Text>

      {(templates ?? []).map((t) => (
        <TouchableOpacity
          key={t.id}
          style={styles.card}
          activeOpacity={0.85}
          onPress={() =>
            navigation.navigate('TemplateDetail', {
              templateId: t.id,
              templateName: t.name,
            })
          }
          accessibilityRole="button"
          accessibilityLabel={`Open ${t.name} template`}
        >
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>{t.name}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </View>
          <Text style={styles.cardTagline}>{t.tagline}</Text>

          <View style={styles.chipRow}>
            <View style={[styles.chip, { backgroundColor: colors.primarySoft }]}>
              <Text style={[styles.chipText, { color: colors.primary }]}>
                {GOAL_LABEL[t.goal]}
              </Text>
            </View>
            <View style={styles.chip}>
              <Text style={styles.chipText}>{t.split}</Text>
            </View>
            <View style={styles.chip}>
              <Text style={styles.chipText}>{t.daysPerWeek} days/wk</Text>
            </View>
            <View style={styles.chip}>
              <Text style={styles.chipText}>{t.weeksCount} weeks</Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            <Ionicons name="body-outline" size={13} color={colors.textTertiary} />
            <Text style={styles.metaText}>{t.muscleFocus.join(' · ')}</Text>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={13} color={colors.textTertiary} />
            <Text style={styles.metaText}>
              {t.sessionMinutes.min === t.sessionMinutes.max
                ? `~${t.sessionMinutes.max} min sessions`
                : `${t.sessionMinutes.min}–${t.sessionMinutes.max} min sessions`}
              {' · '}
              {LEVEL_LABEL[t.experienceLevel]}
              {' · '}
              {t.defaultWeekdays.map(weekdayShort).join(' ')}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function createStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    skeletonWrap: {
      padding: spacing.lg,
    },
    content: {
      padding: spacing.lg,
      paddingBottom: spacing.xxxl,
    },
    lede: {
      fontSize: text.body,
      lineHeight: 20,
      color: c.textSecondary,
      marginBottom: spacing.lg,
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    cardTitle: {
      flex: 1,
      fontSize: text.headline,
      fontWeight: weight.bold,
      color: c.text,
      marginRight: spacing.sm,
    },
    cardTagline: {
      fontSize: text.body,
      lineHeight: 20,
      color: c.textSecondary,
      marginTop: spacing.xs,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      backgroundColor: c.background,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    chipText: {
      fontSize: text.footnote,
      fontWeight: weight.semibold,
      color: c.textSecondary,
      letterSpacing: tracking.normal,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    metaText: {
      flex: 1,
      fontSize: text.footnote,
      color: c.textTertiary,
    },
  });
}
