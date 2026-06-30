import React, { useState, useMemo, useCallback, useEffect, type ComponentProps } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ProfileIcon } from '../components/TabIcons';
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
import { PROFILE_AVATARS, type ProfileAvatarId } from '../constants/profileAvatars';

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
          <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
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

function PickerAvatarGlyph({
  opt,
  colors,
}: {
  opt: (typeof PROFILE_AVATARS)[number];
  colors: ColorPalette;
}) {
  if (opt.mci == null) {
    return (
      <ProfileIcon color={colors.textSecondary} ringColor="transparent" size={24} />
    );
  }
  return (
    <MaterialCommunityIcons
      name={opt.mci as ComponentProps<typeof MaterialCommunityIcons>['name']}
      size={24}
      color={opt.color}
    />
  );
}

const staticStyles = StyleSheet.create({
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 2,
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
    gap: 10,
    flexShrink: 1,
    justifyContent: 'flex-end',
  },
  rowValue: {
    fontSize: 15,
    textAlign: 'right',
    maxWidth: 200,
  },
  chevron: {
    fontSize: 22,
    fontWeight: '300',
    marginLeft: 4,
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
  backButton: { minWidth: 72 },
  backLabel: { fontSize: 16, fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },
  headerRight: { minWidth: 72 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 20 },
  profileCard: {
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 22,
    borderWidth: 1,
  },
  avatarWrap: { marginBottom: 4 },
  nameFieldWrap: {
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: 4,
  },
  profileFieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginBottom: 4,
    alignSelf: 'flex-start',
    width: '100%',
    maxWidth: 240,
    paddingLeft: 1,
  },
  profileNameInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
    maxWidth: 240,
    minHeight: 36,
  },
  profileEmailBlock: {
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 8,
    gap: 2,
  },
  profileEmail: { fontSize: 14, textAlign: 'center' },
  profileHint: { fontSize: 12, textAlign: 'center' },
  profileCardDivider: {
    alignSelf: 'stretch',
    height: StyleSheet.hairlineWidth,
    marginTop: 14,
    marginBottom: 2,
  },
  avatarPickerStrip: {
    alignSelf: 'stretch',
    width: '100%',
    marginTop: 10,
  },
  avatarPickerLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginBottom: 6,
  },
  avatarPickerClip: {
    alignSelf: 'stretch',
    overflow: 'hidden',
    borderRadius: 8,
  },
  avatarPickerScroll: {
    flexGrow: 0,
    width: '100%',
  },
  avatarPickerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
    paddingLeft: 0,
    paddingRight: 8,
  },
  avatarOptionOuter: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  deleteAccountRow: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  deleteAccountRowText: { fontSize: 16, fontWeight: '600' },
  sectionCard: {
    borderRadius: 14,
    marginBottom: 28,
    borderWidth: 1,
    overflow: 'hidden',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 28,
    maxHeight: '85%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  equipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  equipLabel: { fontSize: 16 },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  modalBtnText: { fontSize: 16, fontWeight: '600' },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  weightRowLabelCol: {
    flex: 1,
    minWidth: 0,
  },
  weightSegment: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  weightSegmentBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 88,
    alignItems: 'center',
  },
  weightSegmentBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

const styles = { ...staticStyles, ...layoutStyles };

export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootNavigatorParamList>>();
  const { colors, isDark, setTheme } = useTheme();
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
  const [equipmentModalOpen, setEquipmentModalOpen] = useState(false);
  const [equipmentDraft, setEquipmentDraft] = useState<EquipmentOption[]>([]);
  const [listPicker, setListPicker] = useState<
    'goal' | 'secondaryGoal' | 'experience' | null
  >(null);
  const [dataExporting, setDataExporting] = useState(false);
  const [accountDeleting, setAccountDeleting] = useState(false);
  const [latestWeightLb, setLatestWeightLb] = useState<number | null>(null);

  const appVersion =
    Constants.expoConfig?.version ??
    (Constants as { nativeAppVersion?: string }).nativeAppVersion ??
    '—';

  useEffect(() => {
    if (prefsHydrated) setNameDraft(profileDisplayName);
  }, [prefsHydrated, profileDisplayName]);

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
      header: { borderBottomColor: colors.border },
      backLabel: { color: colors.primary },
      headerTitle: { color: colors.text },
      profileCard: {
        backgroundColor: colors.surface,
        borderColor: colors.border,
      },
      profileNameInputThemed: {
        color: colors.text,
        borderColor: colors.border,
        /** Inset field: stay on the card surface family (avoid near-black `background`). */
        backgroundColor: colors.primary + '14',
      },
      profileEmail: { color: colors.textSecondary },
      profileHint: { color: colors.textMuted },
      sectionCard: {
        backgroundColor: colors.surface,
        borderColor: colors.border,
      },
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
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <SectionHeader title="Account" colors={colors} />
        <View style={[styles.profileCard, themedStyles.profileCard]}>
          <View style={styles.avatarWrap}>
            <ProfileAvatarDisc avatarId={profileAvatarId} size={64} colors={colors} />
          </View>
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
                onBlur={() => setProfileDisplayName(nameDraft)}
                placeholder={namePlaceholder}
                placeholderTextColor={colors.textMuted}
                maxLength={80}
                autoCapitalize="words"
                autoCorrect
                accessibilityLabel="Display name"
              />
              {nameDraft.length > 0 && (
                <Text style={{ color: colors.textMuted, fontSize: 11, textAlign: 'right', marginTop: 2 }}>
                  {nameDraft.length}/80
                </Text>
              )}
            </View>
          </View>
          <View style={styles.profileEmailBlock}>
            {user?.email ? (
              <Text style={[styles.profileEmail, themedStyles.profileEmail]}>{user.email}</Text>
            ) : null}
            <Text style={[styles.profileHint, themedStyles.profileHint]}>
              {user?.email ? 'Signed in with email' : 'Not signed in'}
            </Text>
          </View>
          <View
            style={[styles.profileCardDivider, { backgroundColor: colors.border }]}
            accessible={false}
          />
          <View style={styles.avatarPickerStrip}>
            <Text style={[styles.avatarPickerLabel, { color: colors.textMuted }]}>
              Avatar
            </Text>
            <View style={styles.avatarPickerClip}>
              <ScrollView
                horizontal
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                style={styles.avatarPickerScroll}
                contentContainerStyle={styles.avatarPickerContent}
                keyboardShouldPersistTaps="handled"
              >
                {PROFILE_AVATARS.map((opt) => {
                  const selected = profileAvatarId === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      onPress={() => setProfileAvatarId(opt.id)}
                      style={[
                        styles.avatarOptionOuter,
                        {
                          borderWidth: selected ? 3 : 2,
                          borderColor: selected ? opt.color : colors.border,
                          backgroundColor: selected
                            ? opt.color + '22'
                            : opt.color + '0C',
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Profile picture ${opt.id}`}
                      accessibilityState={{ selected }}
                    >
                      <PickerAvatarGlyph opt={opt} colors={colors} />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </View>

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
          <View style={styles.weightRow}>
            <View style={styles.weightRowLabelCol}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Weight units</Text>
              <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>
                Tap to choose how weights are shown when you log workouts.
              </Text>
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
                      color: weightUnit === 'lb' ? colors.background : colors.textSecondary,
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
                      color: weightUnit === 'kg' ? colors.background : colors.textSecondary,
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

        <SectionHeader title="Preferences" colors={colors} />
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
          <Row label="App version" value={String(appVersion)} colors={colors} />
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
              { maxHeight: '50%', marginHorizontal: 24, alignSelf: 'center', width: '100%' },
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
                fontSize: 14,
                color: colors.textMuted,
                paddingHorizontal: 20,
                marginBottom: 8,
              }}
            >
              Used as the default filter in Find Workouts. Toggle what you have access to.
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
