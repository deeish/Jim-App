import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import type { ColorPalette } from '../theme/colors';
import { leading, radius, spacing, text, tracking, weight } from '../theme';
import { haptics } from '../lib/haptics';
import {
  CHANGELOG,
  type ChangelogChange,
  type ChangelogChangeType,
  type ChangelogEntry,
} from '../constants/changelog';
import SheetModal from './SheetModal';

interface WhatsNewModalProps {
  visible: boolean;
  onClose: () => void;
  /** Defaults to the full CHANGELOG (newest first). */
  entries?: ChangelogEntry[];
}

const TYPE_META: Record<ChangelogChangeType, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  new: { icon: 'sparkles', label: 'New' },
  improved: { icon: 'trending-up', label: 'Improved' },
  fixed: { icon: 'construct', label: 'Fixed' },
};

function typeColor(type: ChangelogChangeType, colors: ColorPalette): string {
  if (type === 'new') return colors.success;
  if (type === 'improved') return colors.primary;
  return colors.warning;
}

function typeSoft(type: ChangelogChangeType, colors: ColorPalette): string {
  if (type === 'new') return colors.successSoft;
  if (type === 'improved') return colors.primarySoft;
  return colors.warningSoft;
}

// Hand-rolled month names: Hermes' Intl misses toLocaleDateString options.
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12 || !d) return iso;
  return `${MONTHS[m - 1]} ${d}`;
}

/**
 * The release sheet: one release in Apple's what's-new grammar — gift mark,
 * the release title as the headline, a feature row per change, one Continue.
 * Everything older sits behind a quiet "See earlier updates" door, capped by
 * the pruned CHANGELOG (docs/changelog-archive.md keeps the rest).
 */
export default function WhatsNewModal({ visible, onClose, entries = CHANGELOG }: WhatsNewModalProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const styles = useMemo(() => createStyles(colors), [colors]);

  const [view, setView] = useState<'release' | 'history'>('release');
  /**
   * Whether the release list is scrolled to its end.
   *
   * Drives the fade below. Starts true so a card whose content FITS never
   * flashes a fade for content that is not there — the first scroll event
   * turns it off when there really is an overflow.
   */
  const [atEnd, setAtEnd] = useState(true);
  /** Viewport height of the release list, for the fits-without-scrolling test. */
  const scrollHeightRef = useRef(0);
  // Which earlier releases the user expanded; collapses again on dismiss so
  // the next open starts focused on the latest release.
  const [openOlderIds, setOpenOlderIds] = useState<string[]>([]);
  useEffect(() => {
    if (!visible) {
      setView('release');
      setOpenOlderIds([]);
      setAtEnd(true);
    }
  }, [visible]);

  const latest = entries[0];
  const older = entries.slice(1);

  const toggleOlder = (id: string) => {
    haptics.tap();
    setOpenOlderIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const close = () => {
    haptics.tap();
    onClose();
  };

  if (!latest) return null;

  const footerPad = Math.max(insets.bottom, spacing.lg) + spacing.sm;

  const featureRow = (change: ChangelogChange, i: number) => {
    const meta = TYPE_META[change.type];
    const color = typeColor(change.type, colors);
    return (
      <View key={i} style={styles.featureRow}>
        <View style={[styles.featureIcon, { backgroundColor: typeSoft(change.type, colors) }]}>
          <Ionicons
            name={(change.icon as keyof typeof Ionicons.glyphMap) ?? meta.icon}
            size={20}
            color={color}
          />
        </View>
        <View style={styles.featureTextWrap}>
          <Text style={styles.featureHeadline}>{change.headline ?? meta.label}</Text>
          <Text style={styles.featureText}>{change.text}</Text>
        </View>
      </View>
    );
  };

  // Earlier releases keep the compact tag-less bullet look: their changes were
  // written before headlines existed, so a dot + sentence is all they need.
  const olderRow = (entry: ChangelogEntry) => {
    const open = openOlderIds.includes(entry.id);
    return (
      <View key={entry.id} style={styles.olderEntry}>
        <TouchableOpacity
          style={styles.olderRow}
          onPress={() => toggleOlder(entry.id)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${entry.title ?? `Version ${entry.version}`}, ${entry.changes.length} updates`}
        >
          <View style={styles.olderTextWrap}>
            <Text style={styles.olderTitle} numberOfLines={1}>
              {entry.title ?? `Version ${entry.version}`}
            </Text>
            <Text style={styles.olderDate}>{formatShortDate(entry.date)}</Text>
          </View>
          <Ionicons
            name={open ? 'chevron-down' : 'chevron-forward'}
            size={17}
            color={colors.textMuted}
          />
        </TouchableOpacity>
        {open ? (
          <View style={styles.olderBody}>
            {entry.changes.map((change, i) => (
              <View key={i} style={styles.bulletRow}>
                <View style={[styles.bulletDot, { backgroundColor: typeColor(change.type, colors) }]} />
                <Text style={styles.bulletText}>{change.text}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SheetModal visible={visible} onClose={close} scrimColor={colors.scrim}>
      {/* The card guards its own taps; see SheetModal. */}
      <Pressable style={styles.sheet} accessible={false} onPress={(e) => e.stopPropagation()}>
        <View style={styles.grabber} />

        {view === 'release' ? (
          <>
            {/* ⚠ The release card OVERFLOWS — measured at 1154pt of content in
                a 635pt window on a 844pt-tall phone, i.e. more than half of it
                below the fold at seven rows. It always scrolled; nothing said
                so. The indicator was hidden, and an iOS indicator only flashes
                while you drag, so on open there was no cue at all: the content
                simply stopped above the footer divider, which reads as the end
                of the list rather than the middle of it. Hence both the
                indicator AND a fade that persists until you reach the end. */}
            <View style={styles.scrollWrap}>
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.releaseContent}
                showsVerticalScrollIndicator
                scrollEventThrottle={16}
                onScroll={({ nativeEvent: e }) =>
                  setAtEnd(
                    e.layoutMeasurement.height + e.contentOffset.y >=
                      e.contentSize.height - 24,
                  )
                }
                onContentSizeChange={(_w, h) => setAtEnd(h <= scrollHeightRef.current + 1)}
                onLayout={({ nativeEvent: e }) => {
                  scrollHeightRef.current = e.layout.height;
                }}
              >
              <LinearGradient
                colors={[colors.brandGradientStart, colors.brandGradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.giftMark}
              >
                <Ionicons name="gift" size={30} color={colors.onPrimary} />
              </LinearGradient>
              <Text style={styles.eyebrow}>What's new</Text>
              <Text style={styles.releaseTitle}>{latest.title ?? `Version ${latest.version}`}</Text>
              <Text style={styles.releaseCaption}>
                {`Version ${latest.version} · ${formatShortDate(latest.date)}`}
              </Text>
              <View style={styles.featureList}>{latest.changes.map(featureRow)}</View>
              </ScrollView>
              {/* pointerEvents none: decoration must never eat a drag. */}
              {!atEnd ? (
                <LinearGradient
                  pointerEvents="none"
                  colors={[`${colors.surface}00`, colors.surface]}
                  style={styles.scrollFade}
                />
              ) : null}
            </View>

            <View style={[styles.footer, { paddingBottom: footerPad }]}>
              {older.length > 0 ? (
                <TouchableOpacity
                  style={styles.historyLink}
                  onPress={() => {
                    haptics.tap();
                    setView('history');
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="See earlier updates"
                >
                  <Text style={styles.historyLinkText}>See earlier updates</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.mainButton} onPress={close} activeOpacity={0.85}>
                <Text style={styles.mainButtonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <View style={styles.historyHeader}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => {
                  haptics.tap();
                  setView('release');
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Back to the latest update"
              >
                <Ionicons name="chevron-back" size={20} color={colors.primary} />
                <Text style={styles.backText}>Back</Text>
              </TouchableOpacity>
              <Text style={styles.historyTitle}>Earlier updates</Text>
              <View style={styles.backButton} />
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.historyContent}
              showsVerticalScrollIndicator
            >
              {older.map(olderRow)}
              <Text style={styles.archiveNote}>
                Older updates live in the App Store's version history.
              </Text>
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: footerPad }]}>
              <TouchableOpacity style={styles.mainButton} onPress={close} activeOpacity={0.85}>
                <Text style={styles.mainButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </Pressable>
    </SheetModal>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    sheet: {
      height: '92%',
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xxl,
      borderTopRightRadius: radius.xxl,
      overflow: 'hidden',
    },
    grabber: {
      width: 36,
      height: 5,
      borderRadius: radius.xs,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginTop: spacing.sm,
    },
    scrollWrap: {
      flex: 1,
    },
    scroll: {
      flex: 1,
    },
    /** Sits over the last ~44pt of the list, hidden once you reach the end. */
    scrollFade: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 44,
    },
    releaseContent: {
      paddingHorizontal: spacing.xxl,
      paddingTop: spacing.xxl,
      paddingBottom: spacing.lg,
    },
    giftMark: {
      width: 64,
      height: 64,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
    },
    eyebrow: {
      marginTop: spacing.lg,
      textAlign: 'center',
      fontSize: text.footnote,
      fontWeight: weight.heavy,
      letterSpacing: tracking.widest,
      textTransform: 'uppercase',
      color: colors.primary,
    },
    releaseTitle: {
      marginTop: spacing.sm,
      textAlign: 'center',
      fontSize: text.display - 2,
      lineHeight: leading.display,
      fontWeight: weight.heavy,
      letterSpacing: tracking.tight,
      color: colors.text,
    },
    releaseCaption: {
      marginTop: spacing.xs,
      textAlign: 'center',
      fontSize: text.footnote,
      fontWeight: weight.medium,
      color: colors.textMuted,
    },
    featureList: {
      marginTop: spacing.xxl + spacing.sm,
      gap: spacing.xl,
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.lg - 2,
    },
    featureIcon: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    featureTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    featureHeadline: {
      fontSize: text.callout,
      fontWeight: weight.bold,
      color: colors.text,
    },
    featureText: {
      marginTop: spacing.xxs,
      fontSize: text.body,
      lineHeight: leading.body,
      fontWeight: weight.medium,
      color: colors.textSecondary,
    },
    footer: {
      paddingHorizontal: spacing.xxl,
      paddingTop: spacing.sm,
    },
    historyLink: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.md,
    },
    historyLinkText: {
      fontSize: text.body,
      fontWeight: weight.semibold,
      color: colors.textMuted,
    },
    mainButton: {
      backgroundColor: colors.primary,
      paddingVertical: spacing.lg,
      borderRadius: radius.md,
      alignItems: 'center',
    },
    mainButtonText: {
      fontSize: text.callout,
      fontWeight: weight.heavy,
      color: colors.onPrimary,
    },
    historyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
    },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      width: 76,
    },
    backText: {
      fontSize: text.callout,
      fontWeight: weight.semibold,
      color: colors.primary,
    },
    historyTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: text.headline - 1,
      fontWeight: weight.bold,
      color: colors.text,
    },
    historyContent: {
      paddingHorizontal: spacing.xxl,
      paddingTop: spacing.sm,
      paddingBottom: spacing.lg,
    },
    olderEntry: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    olderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
    },
    olderTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    olderTitle: {
      fontSize: text.callout - 1,
      fontWeight: weight.bold,
      color: colors.text,
    },
    olderDate: {
      marginTop: spacing.xxs,
      fontSize: text.footnote,
      fontWeight: weight.medium,
      color: colors.textMuted,
    },
    olderBody: {
      paddingBottom: spacing.lg,
      gap: spacing.sm,
    },
    bulletRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    bulletDot: {
      width: 6,
      height: 6,
      borderRadius: radius.pill,
      marginTop: 6,
      flexShrink: 0,
    },
    bulletText: {
      flex: 1,
      fontSize: text.body - 1,
      lineHeight: leading.body - 2,
      fontWeight: weight.medium,
      color: colors.textSecondary,
    },
    archiveNote: {
      marginTop: spacing.lg,
      textAlign: 'center',
      fontSize: text.footnote,
      fontWeight: weight.medium,
      color: colors.textMuted,
    },
  });
}
