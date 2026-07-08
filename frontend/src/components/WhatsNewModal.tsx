import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import type { ColorPalette } from '../theme/colors';
import {
  CHANGELOG,
  type ChangelogChangeType,
  type ChangelogEntry,
} from '../constants/changelog';

interface WhatsNewModalProps {
  visible: boolean;
  onClose: () => void;
  /** Defaults to the full CHANGELOG (newest first). */
  entries?: ChangelogEntry[];
  /**
   * Id of the most recent entry the user has already seen. Entries newer than
   * this stay expanded; the rest collapse behind a "Show earlier updates"
   * toggle. When omitted/unknown, only the newest entry expands by default.
   */
  seenId?: string | null;
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

function formatEntryDate(iso: string): string {
  // Anchor to midday so YYYY-MM-DD doesn't shift a day across time zones.
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function WhatsNewModal({ visible, onClose, entries = CHANGELOG, seenId = null }: WhatsNewModalProps) {
  const { colors } = useTheme();

  const styles = useMemo(() => createStyles(colors), [colors]);

  // Entries before the seen one are unseen -> keep them expanded. Fall back to
  // just the newest entry when nothing is newer (brand-new user, or already
  // caught up).
  const expandedCount = useMemo(() => {
    const seenIndex = seenId ? entries.findIndex((e) => e.id === seenId) : -1;
    return seenIndex > 0 ? seenIndex : 1;
  }, [entries, seenId]);

  const recent = entries.slice(0, expandedCount);
  const older = entries.slice(expandedCount);

  // Older entries collapse to a single row each; track which the user opened.
  const [openOlderIds, setOpenOlderIds] = useState<string[]>([]);
  // Collapse the history again whenever the modal is dismissed, so the next
  // open starts focused on what's new.
  useEffect(() => {
    if (!visible) setOpenOlderIds([]);
  }, [visible]);

  const toggleOlder = (id: string) =>
    setOpenOlderIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const renderChanges = (entry: ChangelogEntry) =>
    entry.changes.map((change, i) => {
      const meta = TYPE_META[change.type];
      const color = typeColor(change.type, colors);
      return (
        <View key={i} style={styles.changeRow}>
          <View style={[styles.changeIcon, { backgroundColor: color + '22' }]}>
            <Ionicons name={meta.icon} size={15} color={color} />
          </View>
          <View style={styles.changeTextWrap}>
            <Text style={[styles.changeTag, { color }]}>{meta.label}</Text>
            <Text style={styles.changeText}>{change.text}</Text>
          </View>
        </View>
      );
    });

  // Newest / unseen releases: shown in full.
  const renderEntry = (entry: ChangelogEntry) => (
    <View key={entry.id} style={styles.entry}>
      <View style={styles.entryHeader}>
        <Text style={styles.entryVersion}>Version {entry.version}</Text>
        <Text style={styles.entryDate}>{formatEntryDate(entry.date)}</Text>
      </View>
      {entry.title ? <Text style={styles.entryTitle}>{entry.title}</Text> : null}
      {renderChanges(entry)}
    </View>
  );

  // Older releases: one compact row that expands its changes inline on tap.
  const renderOlderRow = (entry: ChangelogEntry) => {
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
          <Ionicons
            name={open ? 'chevron-down' : 'chevron-forward'}
            size={16}
            color={colors.textMuted}
          />
          <Text style={styles.olderDate}>{formatEntryDate(entry.date)}</Text>
          {entry.title ? (
            <Text style={styles.olderTitle} numberOfLines={1}>
              {`· ${entry.title}`}
            </Text>
          ) : (
            <View style={styles.olderTitle} />
          )}
          <Text style={styles.olderCount}>{entry.changes.length}</Text>
        </TouchableOpacity>
        {open ? <View style={styles.olderBody}>{renderChanges(entry)}</View> : null}
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          accessibilityLabel="Dismiss what's new"
          accessibilityRole="button"
        />
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="gift" size={22} color={colors.primary} />
            </View>
            <Text style={styles.headerTitle}>What's New</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {recent.map(renderEntry)}

            {older.length > 0 ? (
              <>
                <View style={styles.olderDivider}>
                  <View style={styles.olderDividerLine} />
                  <Text style={styles.olderDividerLabel}>Earlier updates</Text>
                  <View style={styles.olderDividerLine} />
                </View>
                {older.map(renderOlderRow)}
              </>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.gotItButton} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.gotItText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 22,
    },
    card: {
      width: '100%',
      maxWidth: 460,
      maxHeight: '80%',
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary + '20',
    },
    headerTitle: {
      flex: 1,
      fontSize: 20,
      fontWeight: '800',
      letterSpacing: -0.3,
      color: colors.text,
    },
    closeButton: {
      padding: 4,
      marginRight: -4,
    },
    scroll: {
      flexGrow: 0,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 8,
    },
    entry: {
      marginBottom: 22,
    },
    entryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    entryVersion: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.primary,
    },
    entryDate: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
    },
    entryTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 14,
      letterSpacing: -0.2,
    },
    changeRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 14,
    },
    changeIcon: {
      width: 28,
      height: 28,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    changeTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    changeTag: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    changeText: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    olderDivider: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 2,
      marginBottom: 8,
    },
    olderDividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border,
    },
    olderDividerLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },
    olderEntry: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    olderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 13,
    },
    olderDate: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
    },
    olderTitle: {
      flex: 1,
      fontSize: 13,
      fontWeight: '500',
      color: colors.textMuted,
    },
    olderCount: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      minWidth: 22,
      textAlign: 'center',
      overflow: 'hidden',
      borderRadius: 9,
      paddingHorizontal: 7,
      paddingVertical: 2,
      backgroundColor: colors.primary + '18',
    },
    olderBody: {
      paddingTop: 2,
      paddingBottom: 6,
    },
    footer: {
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    gotItButton: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    gotItText: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.onPrimary,
    },
  });
}
