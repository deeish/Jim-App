import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
  Linking,
  TextInput,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { ProfileAvatarDisc } from '../components/ProfileAvatarDisc';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import {
  useUserPreferences,
  GOAL_OPTIONS,
  GOAL_LABELS,
  EXPERIENCE_OPTIONS,
} from '../contexts/UserPreferencesContext';
import type { ColorPalette } from '../theme/colors';
import { EQUIPMENT_OPTIONS, type EquipmentOption } from '../constants/equipment';
import {
  FEEDBACK_MAILTO,
  PRIVACY_POLICY_URL,
  TERMS_OF_SERVICE_URL,
} from '../constants/legalUrls';
import { exportMyData, deleteMyAccount } from '../services/userService';
import { listWeighIns } from '../services/bodyWeightService';
import { formatWeightFromLb } from '../lib/weightDisplay';
import type { RootNavigatorParamList } from '../types/navigation';
import { shareJsonExport } from '../lib/shareDataExport';
import { showConfirmDialog } from '../lib/confirmAlert';
import { getProfileAvatar, OFFERED_PROFILE_AVATARS } from '../constants/profileAvatars';
import GlassDiagnostics from '../components/GlassDiagnostics';

import { radius, spacing, text, tracking, weight } from '../theme';
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
  showChevron,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  colors: ColorPalette;
  showChevron?: boolean;
}) {
  const content = (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      <View style={styles.rowRight}>
        {value != null && (
          <Text
            style={[styles.rowValue, { color: colors.textSecondary }]}
            numberOfLines={2}
          >
            {value}
          </Text>
        )}
        {right}
        {showChevron ? (
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        ) : null}
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

/** Shown as placeholder when display name is empty */
function fallbackAccountName(
  email: string | undefined,
  meta: Record<string, unknown> | undefined,
): string {
  if (meta) {
    const full = meta.full_name ?? meta.name;
    if (typeof full === 'string' && full.trim()) return full.trim();
  }
  if (email && email.includes('@')) {
    return email.split('@')[0] ?? email;
  }
  return email ?? 'Your name';
}

const staticStyles = StyleSheet.create({
  sectionHeader: {
    fontSize: text.caption,
    fontWeight: weight.bold,
    letterSpacing: tracking.wider,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginLeft: spacing.xxs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  rowLabel: {
    fontSize: text.callout,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexShrink: 1,
    justifyContent: 'flex-end',
  },
  rowValue: {
    fontSize: text.callout,
    textAlign: 'right',
    maxWidth: 200,
  },
  rowDivider: {
    height: 1,
    marginLeft: spacing.lg,
  },
});

const layoutStyles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: { minWidth: 72, flexDirection: 'row', alignItems: 'center' },
  backLabel: { fontSize: text.callout, fontWeight: weight.regular },
  headerTitle: { fontSize: text.headline, fontWeight: weight.semibold, flex: 1, textAlign: 'center' },
  headerRight: { minWidth: 72 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  profileCard: {
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  avatarWrap: { marginBottom: spacing.xs },
  nameFieldWrap: {
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  profileFieldLabel: {
    fontSize: text.footnote,
    fontWeight: weight.semibold,
    letterSpacing: tracking.wide,
    marginBottom: spacing.xs,
    alignSelf: 'flex-start',
    width: '100%',
    maxWidth: 240,
    paddingLeft: spacing.xxs,
  },
  profileNameInput: {
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: text.callout,
    fontWeight: weight.semibold,
    textAlign: 'center',
    width: '100%',
    maxWidth: 240,
    minHeight: 36,
  },
  profileEmailBlock: {
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: spacing.xxs,
  },
  profileEmail: { fontSize: text.body, textAlign: 'center' },
  avatarEditBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSheetPreview: {
    alignItems: 'center',
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    rowGap: spacing.lg,
  },
  avatarCell: {
    width: '33.33%',
    alignItems: 'center',
  },
  avatarCellRing: {
    padding: 3,
    borderWidth: 2,
    borderRadius: radius.pill,
  },
  avatarCellName: {
    fontSize: text.caption,
    fontWeight: weight.semibold,
    marginTop: spacing.xs,
  },
  signOutRow: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  signOutText: { fontSize: text.callout, fontWeight: weight.semibold },
  sectionCard: {
    borderRadius: radius.md,
    marginBottom: spacing.xxl,
    overflow: 'hidden',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: spacing.xxl,
    maxHeight: '85%',
  },
  modalTitle: {
    fontSize: text.headline,
    fontWeight: weight.bold,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  equipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  equipLabel: { fontSize: text.callout },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  modalBtnText: { fontSize: text.callout, fontWeight: weight.semibold },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  weightRowLabelCol: {
    flex: 1,
    minWidth: 0,
  },
  weightSegment: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  weightSegmentBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minWidth: 88,
    alignItems: 'center',
  },
  weightSegmentBtnText: {
    fontSize: text.callout,
    fontWeight: weight.semibold,
  },
});

const styles = { ...staticStyles, ...layoutStyles };

export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootNavigatorParamList>>();
  const { colors } = useTheme();
  const { user, signOut } = useAuth();
  const {
    hydrated: prefsHydrated,
    weightUnit,
    setWeightUnit,
    goal,
    setGoal,
    secondaryGoal,
    setSecondaryGoal,
    experience,
    setExperience,
    equipment,
    setEquipment,
    profileDisplayName,
    setProfileDisplayName,
    profileAvatarId,
    setProfileAvatarId,
  } = useUserPreferences();
  const [nameDraft, setNameDraft] = useState('');
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false);
  const [equipmentModalOpen, setEquipmentModalOpen] = useState(false);
  const [equipmentDraft, setEquipmentDraft] = useState<EquipmentOption[]>([]);
  const [listPicker, setListPicker] = useState<
    'goal' | 'secondaryGoal' | 'experience' | null
  >(null);
  const [dataExporting, setDataExporting] = useState(false);
  const [accountDeleting, setAccountDeleting] = useState(false);
  const [latestWeightLb, setLatestWeightLb] = useState<number | null>(null);
  // Hidden support tool: long-press the App version row to toggle the Liquid
  // Glass diagnostic. Deliberately undiscoverable — it exists so a TestFlight
  // screenshot can report, from the device itself, whether the glass module is
  // in the binary and which render path each surface took.
  const [showGlassDiagnostics, setShowGlassDiagnostics] = useState(false);

  const appVersion =
    Constants.expoConfig?.version ??
    (Constants as { nativeAppVersion?: string }).nativeAppVersion ??
    '—';

  // Seed the editable draft from the stored name once prefs hydrate. Guarded so a
  // later re-render / re-hydration (e.g. a Supabase token refresh) can't reset the
  // field while the user is mid-edit, which looked like "can't change my name".
  const nameSeeded = useRef(false);
  useEffect(() => {
    if (prefsHydrated && !nameSeeded.current) {
      nameSeeded.current = true;
      setNameDraft(profileDisplayName);
    }
  }, [prefsHydrated, profileDisplayName]);

  // Persist the name on blur/submit. Trimming here (not on each keystroke) keeps
  // spaces typeable, and saving on submit guarantees it sticks even when a
  // keyboard dismissal doesn't reliably fire onBlur (common on Android).
  const commitDisplayName = useCallback(() => {
    const trimmed = nameDraft.trim();
    if (trimmed !== nameDraft) setNameDraft(trimmed);
    setProfileDisplayName(trimmed);
  }, [nameDraft, setProfileDisplayName]);

  // Latest weigh-in for the Body weight row; refreshes when returning from the tracker.
  useFocusEffect(
    useCallback(() => {
      if (!user) {
        setLatestWeightLb(null);
        return;
      }
      let active = true;
      listWeighIns(1)
        .then((rows) => {
          if (active) setLatestWeightLb(rows[0]?.weightLb ?? null);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, [user]),
  );

  const themedStyles = useMemo(
    () => ({
      container: { backgroundColor: colors.background },
      backLabel: { color: colors.primary },
      headerTitle: { color: colors.text },
      profileCard: { backgroundColor: colors.surface },
      profileNameInputThemed: {
        color: colors.text,
        // Quiet grey inset on the white card — the standard form-field fill.
        backgroundColor: colors.background,
      },
      profileEmail: { color: colors.textSecondary },
      sectionCard: { backgroundColor: colors.surface },
      rowDivider: { backgroundColor: colors.border },
      modalSheet: { backgroundColor: colors.surface },
      modalTitle: { color: colors.text },
      equipLabel: { color: colors.text },
      modalOverlay: { backgroundColor: colors.scrim },
    }),
    [colors],
  );

  const namePlaceholder = fallbackAccountName(
    user?.email,
    user?.user_metadata as Record<string, unknown> | undefined,
  );

  const openEquipmentModal = useCallback(() => {
    setEquipmentDraft([...equipment]);
    setEquipmentModalOpen(true);
  }, [equipment]);

  const toggleEquipmentDraft = useCallback((opt: EquipmentOption) => {
    setEquipmentDraft((prev) =>
      prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt],
    );
  }, []);

  const saveEquipmentDraft = useCallback(() => {
    setEquipment(equipmentDraft);
    setEquipmentModalOpen(false);
  }, [equipmentDraft, setEquipment]);

  const openUrl = useCallback(async (url: string, label: string) => {
    try {
      const ok = await Linking.canOpenURL(url);
      if (!ok) {
        Alert.alert('Unavailable', `Could not open ${label}.`);
        return;
      }
      await Linking.openURL(url);
    } catch (e) {
      console.warn('[ProfileScreen] openUrl failed:', e);
      Alert.alert('Unavailable', `Could not open ${label}.`);
    }
  }, []);

  const pickGoal = useCallback(() => setListPicker('goal'), []);
  const pickSecondaryGoal = useCallback(() => setListPicker('secondaryGoal'), []);
  const pickExperience = useCallback(() => setListPicker('experience'), []);

  const handleExportMyData = useCallback(async () => {
    if (!user || dataExporting) return;
    setDataExporting(true);
    try {
      const bundle = await exportMyData();
      const json = JSON.stringify(bundle, null, 2);
      await shareJsonExport(json, 'Export my data');
    } catch (e) {
      console.warn('[ProfileScreen] export failed:', e);
      const message =
        e && typeof e === 'object' && 'message' in e && typeof (e as Error).message === 'string'
          ? (e as Error).message
          : 'Could not export your data.';
      Alert.alert('Export failed', message);
    } finally {
      setDataExporting(false);
    }
  }, [user, dataExporting]);

  const runDeleteAccount = useCallback(async () => {
    if (!user) return;
    setAccountDeleting(true);
    try {
      const result = await deleteMyAccount();
      if (!result.supabaseAuthDeleted) {
        await new Promise<void>((resolve) => {
          Alert.alert(
            'Data removed',
            'Your app data was deleted. Sign-in may still work until the server is configured with SUPABASE_SERVICE_ROLE_KEY for full removal, or you delete the user in the Supabase dashboard.',
            [{ text: 'OK', onPress: () => resolve() }],
          );
        });
      }
      await signOut();
    } catch (e) {
      console.warn('[ProfileScreen] delete account failed:', e);
      const message =
        e && typeof e === 'object' && 'message' in e && typeof (e as Error).message === 'string'
          ? (e as Error).message
          : 'Could not delete your account.';
      Alert.alert('Deletion failed', message);
    } finally {
      setAccountDeleting(false);
    }
  }, [user, signOut]);

  const handleSignOut = useCallback(() => {
    showConfirmDialog({
      title: 'Sign out?',
      confirmText: 'Sign out',
      destructive: true,
      onConfirm: () => void signOut(),
    });
  }, [signOut]);

  const handleDeleteAccount = useCallback(() => {
    if (!user?.email) {
      Alert.alert('Unavailable', 'Sign in to delete your account.');
      return;
    }
    Alert.alert(
      'Delete account?',
      'This permanently deletes your workouts, plans, and logs from our servers. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'Delete forever?',
              'Are you sure? All your app data will be removed.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete my account',
                  style: 'destructive',
                  onPress: () => {
                    void runDeleteAccount();
                  },
                },
              ],
            ),
        },
      ],
    );
  }, [user?.email, runDeleteAccount]);

  const equipmentSummary =
    equipment.length === 0
      ? 'All equipment'
      : equipment.join(', ');

  // The sheet's grid: the nine on-offer auroras, plus the user's current one
  // pinned first if it's retired — a stored choice must never look deselected.
  const avatarChoices = OFFERED_PROFILE_AVATARS.some((o) => o.id === profileAvatarId)
    ? OFFERED_PROFILE_AVATARS
    : [getProfileAvatar(profileAvatarId), ...OFFERED_PROFILE_AVATARS];

  return (
    <SafeAreaView style={[styles.container, themedStyles.container]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
          <Text style={[styles.backLabel, themedStyles.backLabel]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, themedStyles.headerTitle]}>Profile</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <SectionHeader title="Account" colors={colors} />
        <View style={[styles.profileCard, themedStyles.profileCard]}>
          {/* Contacts/Apple ID pattern: the avatar itself is the edit affordance. */}
          <TouchableOpacity
            style={styles.avatarWrap}
            onPress={() => setAvatarSheetOpen(true)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Edit avatar"
          >
            <ProfileAvatarDisc
              avatarId={profileAvatarId}
              size={64}
              colors={colors}
              initial={nameDraft.trim() || namePlaceholder}
            />
            <View style={[styles.avatarEditBadge, { backgroundColor: colors.primary, borderColor: colors.surface }]}>
              <Ionicons name="pencil" size={11} color={colors.onPrimary} />
            </View>
          </TouchableOpacity>
          <View style={styles.nameFieldWrap}>
            <View style={{ width: '100%', maxWidth: 240 }}>
              <Text style={[styles.profileFieldLabel, { color: colors.textMuted }]}>
                Display name
              </Text>
              <TextInput
                style={[
                  styles.profileNameInput,
                  themedStyles.profileNameInputThemed,
                ]}
                value={nameDraft}
                onChangeText={setNameDraft}
                onBlur={commitDisplayName}
                onEndEditing={commitDisplayName}
                onSubmitEditing={commitDisplayName}
                returnKeyType="done"
                placeholder={namePlaceholder}
                placeholderTextColor={colors.textMuted}
                maxLength={80}
                autoCapitalize="words"
                autoCorrect
                accessibilityLabel="Display name"
              />
              {nameDraft.length > 0 && (
                <Text style={{ color: colors.textMuted, fontSize: text.caption, textAlign: 'right', marginTop: spacing.xxs }}>
                  {nameDraft.length}/80
                </Text>
              )}
            </View>
          </View>
          <View style={styles.profileEmailBlock}>
            <Text style={[styles.profileEmail, themedStyles.profileEmail]}>
              {user?.email ?? 'Not signed in'}
            </Text>
          </View>
        </View>

        <SectionHeader title="Weight" colors={colors} />
        <View style={[styles.sectionCard, themedStyles.sectionCard]}>
          <View style={styles.weightRow}>
            <View style={styles.weightRowLabelCol}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Units</Text>
            </View>
            <View
              style={[styles.weightSegment, { borderColor: colors.border }]}
              accessibilityRole="radiogroup"
              accessibilityLabel="Weight units"
            >
              <TouchableOpacity
                style={[
                  styles.weightSegmentBtn,
                  {
                    backgroundColor:
                      weightUnit === 'lb' ? colors.primary : colors.background,
                  },
                ]}
                onPress={() => setWeightUnit('lb')}
                accessibilityRole="radio"
                accessibilityState={{ checked: weightUnit === 'lb' }}
                accessibilityLabel="Pounds"
              >
                <Text
                  style={[
                    styles.weightSegmentBtnText,
                    {
                      color: weightUnit === 'lb' ? colors.onPrimary : colors.textSecondary,
                    },
                  ]}
                >
                  lb
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.weightSegmentBtn,
                  {
                    backgroundColor:
                      weightUnit === 'kg' ? colors.primary : colors.background,
                  },
                ]}
                onPress={() => setWeightUnit('kg')}
                accessibilityRole="radio"
                accessibilityState={{ checked: weightUnit === 'kg' }}
                accessibilityLabel="Kilograms"
              >
                <Text
                  style={[
                    styles.weightSegmentBtnText,
                    {
                      color: weightUnit === 'kg' ? colors.onPrimary : colors.textSecondary,
                    },
                  ]}
                >
                  kg
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={[styles.rowDivider, themedStyles.rowDivider]} />
          <Row
            label="Body weight"
            value={
              latestWeightLb != null
                ? formatWeightFromLb(latestWeightLb, weightUnit)
                : 'Not set'
            }
            onPress={() => navigation.navigate('WeightTracker')}
            colors={colors}
            showChevron
          />
        </View>

        <SectionHeader title="Sharing" colors={colors} />
        <View style={[styles.sectionCard, themedStyles.sectionCard]}>
          <Row
            label="Redeem a share code"
            onPress={() => navigation.navigate('ShareRedeem')}
            colors={colors}
            showChevron
          />
        </View>

        <SectionHeader title="Training" colors={colors} />
        <View style={[styles.sectionCard, themedStyles.sectionCard]}>
          <Row
            label="Goal"
            value={GOAL_LABELS[goal]}
            onPress={pickGoal}
            colors={colors}
            showChevron
          />
          <View style={[styles.rowDivider, themedStyles.rowDivider]} />
          <Row
            label="Secondary goal"
            value={secondaryGoal ? GOAL_LABELS[secondaryGoal] : 'None'}
            onPress={pickSecondaryGoal}
            colors={colors}
            showChevron
          />
          <View style={[styles.rowDivider, themedStyles.rowDivider]} />
          <Row
            label="Experience"
            value={experience}
            onPress={pickExperience}
            colors={colors}
            showChevron
          />
          <View style={[styles.rowDivider, themedStyles.rowDivider]} />
          <Row
            label="Equipment"
            value={equipmentSummary}
            onPress={openEquipmentModal}
            colors={colors}
            showChevron
          />
        </View>

        <SectionHeader title="Your data" colors={colors} />
        {user ? (
          <View style={[styles.sectionCard, themedStyles.sectionCard]}>
            <Row
              label="Export my data"
              onPress={() => {
                void handleExportMyData();
              }}
              colors={colors}
              showChevron
              right={
                dataExporting ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : undefined
              }
            />
            <View style={[styles.rowDivider, themedStyles.rowDivider]} />
            <TouchableOpacity
              style={[styles.row, accountDeleting ? { opacity: 0.65 } : null]}
              onPress={handleDeleteAccount}
              disabled={accountDeleting}
              accessibilityRole="button"
              accessibilityLabel="Delete account"
              activeOpacity={0.7}
            >
              <Text style={[styles.rowLabel, { color: colors.error }]}>Delete account</Text>
              <View style={styles.rowRight}>
                {accountDeleting ? (
                  <ActivityIndicator color={colors.error} size="small" />
                ) : null}
              </View>
            </TouchableOpacity>
          </View>
        ) : null}

        <SectionHeader title="About" colors={colors} />
        <View style={[styles.sectionCard, themedStyles.sectionCard]}>
          <Pressable
            onLongPress={() => setShowGlassDiagnostics((v) => !v)}
            delayLongPress={600}
          >
            <Row label="App version" value={String(appVersion)} colors={colors} />
          </Pressable>
          <View style={[styles.rowDivider, themedStyles.rowDivider]} />
          <Row
            label="Privacy policy"
            onPress={() => openUrl(PRIVACY_POLICY_URL, 'Privacy policy')}
            colors={colors}
            showChevron
          />
          <View style={[styles.rowDivider, themedStyles.rowDivider]} />
          <Row
            label="Terms of service"
            onPress={() => openUrl(TERMS_OF_SERVICE_URL, 'Terms')}
            colors={colors}
            showChevron
          />
          <View style={[styles.rowDivider, themedStyles.rowDivider]} />
          <Row
            label="Feedback & support"
            onPress={() => openUrl(FEEDBACK_MAILTO, 'Email')}
            colors={colors}
            showChevron
          />
        </View>

        {/* Sign out moved here from Home's avatar menu — the avatar now opens
            this screen directly, so this is its one home. Kept out of "Your
            data": signing out is routine, deleting an account is not. */}
        <View style={[styles.sectionCard, themedStyles.sectionCard]}>
          <TouchableOpacity
            style={styles.signOutRow}
            onPress={handleSignOut}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <Text style={[styles.signOutText, { color: colors.primary }]}>Sign out</Text>
          </TouchableOpacity>
        </View>

        {showGlassDiagnostics && <GlassDiagnostics />}

      </ScrollView>

      <Modal
        visible={listPicker != null}
        animationType="fade"
        transparent
        onRequestClose={() => setListPicker(null)}
      >
        <View style={[styles.modalOverlay, themedStyles.modalOverlay]}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setListPicker(null)}
          />
          <View
            style={[
              styles.modalSheet,
              themedStyles.modalSheet,
              { maxHeight: '50%', marginHorizontal: spacing.xxl, alignSelf: 'center', width: '100%' },
            ]}
          >
            <Text style={[styles.modalTitle, themedStyles.modalTitle]}>
              {listPicker === 'goal'
                ? 'Training goal'
                : listPicker === 'secondaryGoal'
                  ? 'Secondary goal'
                  : 'Experience level'}
            </Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {(listPicker === 'experience'
                ? [...EXPERIENCE_OPTIONS]
                : listPicker === 'secondaryGoal'
                  ? ['__none__', ...GOAL_OPTIONS.filter((g) => g !== goal)]
                  : [...GOAL_OPTIONS]
              ).map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={styles.equipRow}
                  onPress={() => {
                    if (listPicker === 'goal') {
                      setGoal(opt as (typeof GOAL_OPTIONS)[number]);
                    } else if (listPicker === 'secondaryGoal') {
                      setSecondaryGoal(
                        opt === '__none__'
                          ? null
                          : (opt as (typeof GOAL_OPTIONS)[number]),
                      );
                    } else {
                      setExperience(opt as (typeof EXPERIENCE_OPTIONS)[number]);
                    }
                    setListPicker(null);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.equipLabel, themedStyles.equipLabel]}>
                    {opt === '__none__'
                      ? 'None'
                      : listPicker === 'experience'
                        ? opt
                        : GOAL_LABELS[opt as keyof typeof GOAL_LABELS]}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setListPicker(null)}>
                <Text style={[styles.modalBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={avatarSheetOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setAvatarSheetOpen(false)}
      >
        <View style={[styles.modalOverlay, themedStyles.modalOverlay]}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setAvatarSheetOpen(false)}
          />
          <View style={[styles.modalSheet, themedStyles.modalSheet]}>
            <Text style={[styles.modalTitle, themedStyles.modalTitle]}>Avatar</Text>
            <View style={styles.avatarSheetPreview}>
              <ProfileAvatarDisc
                avatarId={profileAvatarId}
                size={72}
                colors={colors}
                initial={nameDraft.trim() || namePlaceholder}
              />
            </View>
            <View style={styles.avatarGrid}>
              {avatarChoices.map((opt) => {
                const selected = profileAvatarId === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={styles.avatarCell}
                    onPress={() => setProfileAvatarId(opt.id)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`Avatar ${opt.name}`}
                    accessibilityState={{ selected }}
                  >
                    <View
                      style={[
                        styles.avatarCellRing,
                        { borderColor: selected ? colors.primary : 'transparent' },
                      ]}
                    >
                      <ProfileAvatarDisc avatarId={opt.id} size={56} colors={colors} />
                    </View>
                    <Text
                      style={[
                        styles.avatarCellName,
                        { color: selected ? colors.primary : colors.textMuted },
                      ]}
                    >
                      {opt.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setAvatarSheetOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Done"
              >
                <Text style={[styles.modalBtnText, { color: colors.primary }]}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={equipmentModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setEquipmentModalOpen(false)}
      >
        <View style={[styles.modalOverlay, themedStyles.modalOverlay]}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setEquipmentModalOpen(false)}
          />
          <View style={[styles.modalSheet, themedStyles.modalSheet]}>
            <Text style={[styles.modalTitle, themedStyles.modalTitle]}>Your equipment</Text>
            <Text
              style={{
                fontSize: text.footnote,
                color: colors.textMuted,
                paddingHorizontal: spacing.xl,
                marginBottom: spacing.sm,
              }}
            >
              Used to filter exercises and suggested workouts.
            </Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {EQUIPMENT_OPTIONS.map((opt) => {
                const on = equipmentDraft.includes(opt);
                return (
                  <TouchableOpacity
                    key={opt}
                    style={styles.equipRow}
                    onPress={() => toggleEquipmentDraft(opt)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.equipLabel, themedStyles.equipLabel]}>{opt}</Text>
                    <Switch
                      value={on}
                      onValueChange={() => toggleEquipmentDraft(opt)}
                      trackColor={{ false: colors.border, true: colors.primary }}
                      thumbColor={colors.text}
                    />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setEquipmentModalOpen(false)}>
                <Text style={[styles.modalBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveEquipmentDraft}>
                <Text style={[styles.modalBtnText, { color: colors.primary }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
