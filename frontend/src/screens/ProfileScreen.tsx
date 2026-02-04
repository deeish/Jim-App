import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ProfileIcon } from '../components/TabIcons';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import type { ColorPalette } from '../theme/colors';

function SectionHeader({ title, colors }: { title: string; colors: ColorPalette }) {
  return (
    <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>{title}</Text>
  );
}

function Row({
  label,
  value,
  onPress,
  right,
  colors,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  colors: ColorPalette;
}) {
  const content = (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      <View style={styles.rowRight}>
        {value != null && (
          <Text style={[styles.rowValue, { color: colors.textSecondary }]}>{value}</Text>
        )}
        {right}
      </View>
    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

const staticStyles = StyleSheet.create({
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
    marginLeft: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowLabel: {
    fontSize: 16,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowValue: {
    fontSize: 15,
  },
  rowDivider: {
    height: 1,
    marginLeft: 16,
  },
  bottomPad: {
    height: 40,
  },
});

const layoutStyles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {},
  backLabel: { fontSize: 16, fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerRight: { minWidth: 60, alignItems: 'flex-end' },
  headerSignOut: { fontSize: 15, fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 24 },
  profileCard: {
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 28,
    borderWidth: 1,
  },
  avatarWrap: { marginBottom: 12 },
  profileName: { fontSize: 20, fontWeight: '700' },
  profileHint: { fontSize: 13, marginTop: 4 },
  signOutButton: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderRadius: 10,
  },
  signOutText: { fontSize: 15, fontWeight: '600' },
  sectionCard: {
    borderRadius: 12,
    marginBottom: 28,
    borderWidth: 1,
    overflow: 'hidden',
  },
});

const styles = { ...staticStyles, ...layoutStyles };

export default function ProfileScreen() {
  const navigation = useNavigation();
  const { colors, isDark, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const [weightUnitKg, setWeightUnitKg] = useState(true);
  const [notificationsOn, setNotificationsOn] = useState(true);
  const [goal, setGoal] = useState<string>('Strength');
  const [experience, setExperience] = useState<string>('Intermediate');

  const themedStyles = useMemo(
    () => ({
      container: { backgroundColor: colors.background },
      header: { borderBottomColor: colors.border },
      backLabel: { color: colors.primary },
      headerTitle: { color: colors.text },
      profileCard: {
        backgroundColor: colors.surface,
        borderColor: colors.border,
      },
      profileName: { color: colors.text },
      profileHint: { color: colors.textMuted },
      sectionCard: {
        backgroundColor: colors.surface,
        borderColor: colors.border,
      },
      rowDivider: { backgroundColor: colors.border },
    }),
    [colors]
  );

  const handleSignOut = useCallback(async () => {
    await signOut();
    // Session is now null; AppContent will render AuthStack (Login screen)
  }, [signOut]);

  return (
    <SafeAreaView style={[styles.container, themedStyles.container]} edges={['top']}>
      <View style={[styles.header, themedStyles.header]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={[styles.backLabel, themedStyles.backLabel]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, themedStyles.headerTitle]}>Profile</Text>
        <View style={styles.headerRight}>
          {user ? (
            <TouchableOpacity
              onPress={handleSignOut}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={[styles.headerSignOut, { color: colors.error }]}>Sign out</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile */}
        <SectionHeader title="Profile" colors={colors} />
        <View style={[styles.profileCard, themedStyles.profileCard]}>
          <View style={styles.avatarWrap}>
            <ProfileIcon
              color={colors.textSecondary}
              ringColor={colors.primary}
              size={64}
            />
          </View>
          <Text style={[styles.profileName, themedStyles.profileName]}>
            {user?.email ?? 'Your name'}
          </Text>
          <Text style={[styles.profileHint, themedStyles.profileHint]}>
            {user?.email ? 'Signed in with Supabase' : 'Tap to add or edit (coming soon)'}
          </Text>
          {user ? (
            <TouchableOpacity
              onPress={handleSignOut}
              style={[styles.signOutButton, { borderColor: colors.error }]}
            >
              <Text style={[styles.signOutText, { color: colors.error }]}>Sign out</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Settings */}
        <SectionHeader title="Settings" colors={colors} />
        <View style={[styles.sectionCard, themedStyles.sectionCard]}>
          <Row
            label="Dark mode"
            value={isDark ? 'On' : 'Off'}
            colors={colors}
            right={
              <Switch
                value={isDark}
                onValueChange={(v) => setTheme(v ? 'dark' : 'light')}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.text}
              />
            }
          />
          <View style={[styles.rowDivider, themedStyles.rowDivider]} />
          <Row
            label="Weight units"
            value={weightUnitKg ? 'kg' : 'lb'}
            colors={colors}
            right={
              <Switch
                value={weightUnitKg}
                onValueChange={setWeightUnitKg}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.text}
              />
            }
          />
          <View style={[styles.rowDivider, themedStyles.rowDivider]} />
          <Row
            label="Notifications"
            value={notificationsOn ? 'On' : 'Off'}
            colors={colors}
            right={
              <Switch
                value={notificationsOn}
                onValueChange={setNotificationsOn}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.text}
              />
            }
          />
        </View>

        {/* Preferences */}
        <SectionHeader title="Preferences" colors={colors} />
        <View style={[styles.sectionCard, themedStyles.sectionCard]}>
          <Row label="Goal" value={goal} onPress={() => {}} colors={colors} />
          <View style={[styles.rowDivider, themedStyles.rowDivider]} />
          <Row label="Experience" value={experience} onPress={() => {}} colors={colors} />
          <View style={[styles.rowDivider, themedStyles.rowDivider]} />
          <Row
            label="Equipment"
            value="Tap to set (coming soon)"
            onPress={() => {}}
            colors={colors}
          />
        </View>

        {/* About */}
        <SectionHeader title="About" colors={colors} />
        <View style={[styles.sectionCard, themedStyles.sectionCard]}>
          <Row label="App version" value="1.0.0" colors={colors} />
          <View style={[styles.rowDivider, themedStyles.rowDivider]} />
          <Row
            label="Feedback & support"
            value="Coming soon"
            onPress={() => {}}
            colors={colors}
          />
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

