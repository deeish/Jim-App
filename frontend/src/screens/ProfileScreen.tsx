import React, { useState } from 'react';
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
import { colors } from '../theme/colors';
import { ProfileIcon } from '../components/TabIcons';

function SectionHeader({ title }: { title: string }) {
  return (
    <Text style={styles.sectionHeader}>{title}</Text>
  );
}

function Row({
  label,
  value,
  onPress,
  right,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  right?: React.ReactNode;
}) {
  const content = (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        {value != null && <Text style={styles.rowValue}>{value}</Text>}
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

export default function ProfileScreen() {
  const navigation = useNavigation();
  const [weightUnitKg, setWeightUnitKg] = useState(true);
  const [notificationsOn, setNotificationsOn] = useState(true);
  const [goal, setGoal] = useState<string>('Strength');
  const [experience, setExperience] = useState<string>('Intermediate');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backLabel}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile */}
        <SectionHeader title="Profile" />
        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <ProfileIcon color={colors.textSecondary} ringColor={colors.primary} size={64} />
          </View>
          <Text style={styles.profileName}>Your name</Text>
          <Text style={styles.profileHint}>Tap to add or edit (coming soon)</Text>
        </View>

        {/* Settings */}
        <SectionHeader title="Settings" />
        <View style={styles.sectionCard}>
          <Row
            label="Weight units"
            value={weightUnitKg ? 'kg' : 'lb'}
            right={
              <Switch
                value={weightUnitKg}
                onValueChange={setWeightUnitKg}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.text}
              />
            }
          />
          <View style={styles.rowDivider} />
          <Row
            label="Notifications"
            value={notificationsOn ? 'On' : 'Off'}
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
        <SectionHeader title="Preferences" />
        <View style={styles.sectionCard}>
          <Row label="Goal" value={goal} onPress={() => {}} />
          <View style={styles.rowDivider} />
          <Row label="Experience" value={experience} onPress={() => {}} />
          <View style={styles.rowDivider} />
          <Row label="Equipment" value="Tap to set (coming soon)" onPress={() => {}} />
        </View>

        {/* About */}
        <SectionHeader title="About" />
        <View style={styles.sectionCard}>
          <Row label="App version" value="1.0.0" />
          <View style={styles.rowDivider} />
          <Row label="Feedback & support" value="Coming soon" onPress={() => {}} />
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {},
  backLabel: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  headerRight: {
    width: 60,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 10,
    marginLeft: 4,
  },
  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 28,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarWrap: {
    marginBottom: 12,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  profileHint: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
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
    color: colors.text,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowValue: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 16,
  },
  bottomPad: {
    height: 40,
  },
});
