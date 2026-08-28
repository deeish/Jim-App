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
import SheetModal from '../components/SheetModal';
import { haptics } from '../lib/haptics';
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
  SUPPORT_EMAIL,
  TERMS_OF_SERVICE_URL,
} from '../constants/legalUrls';
import { exportMyData, deleteMyAccount } from '../services/userService';
import { listWeighIns, type BodyWeightEntry } from '../services/bodyWeightService';
import {
  getPersonalBests,
  getWorkoutLogs,
  getWorkoutStats,
} from '../services/workoutService';
import type { WorkoutStats } from '../types/workout';
import { formatWeightFromLb } from '../lib/weightDisplay';
import { formatLocalYmd } from '../lib/planCalendar';
import { formatWeekLabel } from '../lib/progressStats';
import { recentDayLabel } from '../lib/homeToday';
import {
  monthLabel,
  mostTrainedExercises,
  overallWeightDelta,
  pickBestLifts,
  resolveProfileBand,
  weeklyWeightSeries,
  weighInDelta30,
  weighInsWithin,
  type BestLift,
} from '../lib/profileBand';
import { MUSCLE_EDGE, MUSCLE_INK, muscleGradient } from '../lib/planCalendarPrototype';
import { muscleFromCatalog } from '../lib/planCalendarPrototypeStore';
import { SkeletonCard } from '../components/Skeleton';
import { LinearGradient } from 'expo-linear-gradient';
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

/** iOS-Settings row grammar: colored icon chip, label, value, chevron. */
function ChipRow({
  icon,
  tint,
  label,
  value,
  onPress,
  right,
  colors,
  labelColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  label: string;
  value?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  colors: ColorPalette;
  labelColor?: string;
}) {
  const content = (
    <View style={styles.chipRow}>
      <View style={[styles.chip, { backgroundColor: tint }]}>
        <Ionicons name={icon} size={16} color={colors.onPrimary} />
      </View>
      <Text
        style={[styles.chipRowLabel, { color: labelColor ?? colors.text }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <View style={styles.rowRight}>
        {value != null && (
          <Text
            style={[styles.rowValue, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {value}
          </Text>
        )}
        {right}
        {onPress ? (
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        ) : null}
      </View>
    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity
        onPress={() => {
          haptics.tap();
          onPress();
        }}
        activeOpacity={0.7}
      >
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

/**
 * A legal link that only exists when this build has a hosted page behind it.
 * There is no placeholder URL to fall back to any more, so an unconfigured build
 * renders nothing rather than sending users to someone else's parked domain. In
 * development the row stays visible but inert, so the missing env var surfaces
 * while working on the app instead of during App Store review.
 */
function LegalRow({
  icon,
  tint,
  label,
  url,
  onOpen,
  colors,
  divider,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  label: string;
  url: string | null;
  onOpen: (url: string, label: string) => void;
  colors: ColorPalette;
  divider: React.ReactNode;
}) {
  if (url) {
    return (
      <>
        {divider}
        <ChipRow
          icon={icon}
          tint={tint}
          label={label}
          onPress={() => onOpen(url, label)}
          colors={colors}
        />
      </>
    );
  }
  if (!__DEV__) return null;
  return (
    <>
      {divider}
      <ChipRow
        icon={icon}
        tint={colors.textMuted}
        label={label}
        value="Not configured"
        colors={colors}
      />
    </>
  );
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

const bandStyles = StyleSheet.create({
  // --- Identity (Apple-ID card) ---
  identityCard: {
    borderRadius: radius.md,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.xxl,
  },
  identityText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  identityName: {
    fontSize: text.title,
    fontWeight: weight.bold,
    letterSpacing: tracking.tight,
  },
  identityEmail: {
    fontSize: text.body,
    fontWeight: weight.medium,
  },
  identityCaption: {
    fontSize: text.footnote,
    fontWeight: weight.semibold,
    marginTop: spacing.xxs,
  },
  // --- iOS icon-chip rows ---
  chip: {
    width: 29,
    height: 29,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  chipRowLabel: {
    fontSize: text.callout,
    flex: 1,
  },
  // --- Best lifts ---
  liftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  liftDisc: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  liftText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  liftName: {
    fontSize: text.callout,
    fontWeight: weight.semibold,
  },
  liftDate: {
    fontSize: text.caption,
    fontWeight: weight.medium,
  },
  liftValue: {
    fontSize: text.callout,
    fontWeight: weight.bold,
  },
  // --- Body weight card ---
  weightCardPad: {
    padding: spacing.lg,
  },
  weightCardTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  weightCardValue: {
    fontSize: text.display,
    fontWeight: weight.heavy,
    letterSpacing: tracking.tight,
  },
  weightDeltaChip: {
    borderRadius: radius.pill,
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.sm,
  },
  weightDeltaChipText: {
    fontSize: text.caption,
    fontWeight: weight.heavy,
  },
  weightBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    height: 34,
    marginTop: spacing.md,
  },
  weightBar: {
    flex: 1,
    borderRadius: radius.xs,
  },
  weightCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  weightCardUpdated: {
    fontSize: text.caption,
    fontWeight: weight.medium,
  },
  weightCardLog: {
    fontSize: text.body,
    fontWeight: weight.bold,
  },
  // --- Best-lifts strip (the demoted form) ---
  stripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  stripText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  stripCaption: {
    fontSize: text.caption,
    fontWeight: weight.heavy,
    textTransform: 'uppercase',
    letterSpacing: tracking.wider,
  },
  stripLine: {
    fontSize: text.body,
    fontWeight: weight.semibold,
  },
  // --- Edit-profile sheet ---
  sheetNameField: {
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
});

const styles = { ...staticStyles, ...layoutStyles, ...bandStyles };

export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootNavigatorParamList>>();
  const { colors, mode, setMode } = useTheme();
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
  // The adaptive band's inputs — all load gracefully; the band degrades to
  // whatever arrived (worst case: a settings-only page, which still works).
  const [weighIns, setWeighIns] = useState<BodyWeightEntry[]>([]);
  const [stats, setStats] = useState<WorkoutStats | null>(null);
  const [bestLifts, setBestLifts] = useState<BestLift[]>([]);
  /**
   * ONE flag for the whole band, held until ALL THREE fetches settle.
   *
   * Two problems it solves, and they need the same fix:
   *
   * 1. The band resolves from empty inputs while loading, which collapses it
   *    to `weightRow` — so a user with years of weigh-ins was told "Body
   *    weight — Not set", and the row then vanished out from under their
   *    finger when the data landed.
   * 2. The three pieces each rendered `null` until their own request
   *    returned, and best-lifts is TWO sequential round trips, so the page
   *    inserted 150-300px in up to three separate jolts while the user was
   *    reaching for the settings rows below.
   *
   * Waiting for all three costs a little more time-to-content and buys a
   * page that arrives once, correct.
   */
  const [bandLoading, setBandLoading] = useState(true);
  /** Refetch on focus keeps what is already on screen — the band must never
   *  blink back to skeletons over data we have. Same rule ProgressScreen
   *  documents at its own load. */
  const bandLoadedOnce = useRef(false);
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

  // The band's data; refreshes on focus so returning from the tracker or a
  // finished workout updates what leads.
  useFocusEffect(
    useCallback(() => {
      if (!user) {
        setWeighIns([]);
        setStats(null);
        setBestLifts([]);
        setBandLoading(false);
        return;
      }
      let active = true;
      if (!bandLoadedOnce.current) setBandLoading(true);
      const weighInsDone = listWeighIns(180)
        .then((rows) => {
          if (active) setWeighIns(rows);
        })
        .catch(() => {});
      const statsDone = getWorkoutStats()
        .then((s) => {
          if (active) setStats(s);
        })
        .catch(() => {});
      const liftsDone = (async () => {
        try {
          // Frequency from a recent window; VALUES from the lifetime records —
          // a best must never be a recency artifact.
          const from = new Date();
          from.setDate(from.getDate() - 120);
          const logs = await getWorkoutLogs({
            from: formatLocalYmd(from),
            to: formatLocalYmd(new Date()),
          });
          const ranked = mostTrainedExercises(logs, 6);
          if (ranked.length === 0) {
            if (active) setBestLifts([]);
            return;
          }
          const bests = await getPersonalBests(ranked.map((r) => r.exerciseId));
          if (active) setBestLifts(pickBestLifts(ranked, bests, 3));
        } catch {
          // Leave whatever was shown before; the band handles absence.
        }
      })();
      // allSettled, not all: one failed request must still reveal the band,
      // which is built to degrade to whatever arrived.
      void Promise.allSettled([weighInsDone, statsDone, liftsDone]).then(() => {
        if (!active) return;
        bandLoadedOnce.current = true;
        setBandLoading(false);
      });
      return () => {
        active = false;
      };
    }, [user]),
  );

  const band = useMemo(
    () =>
      resolveProfileBand({
        goal,
        secondaryGoal: secondaryGoal ?? null,
        hasLiftRecords: bestLifts.length > 0,
        weighInsLast30: weighInsWithin(weighIns, 30, new Date()),
        hasAnyWeighIn: weighIns.length > 0,
      }),
    [goal, secondaryGoal, bestLifts.length, weighIns],
  );
  const latestWeighIn = useMemo(
    () =>
      weighIns.reduce<BodyWeightEntry | null>(
        (best, e) =>
          !best || Date.parse(e.loggedAt) > Date.parse(best.loggedAt) ? e : best,
        null,
      ),
    [weighIns],
  );
  const latestWeightLb = latestWeighIn?.weightLb ?? null;
  const weightDelta30 = useMemo(() => weighInDelta30(weighIns, new Date()), [weighIns]);
  const weightSeries = useMemo(
    () => weeklyWeightSeries(weighIns, 12, new Date()),
    [weighIns],
  );
  const overallDelta = useMemo(() => overallWeightDelta(weighIns), [weighIns]);

  // The identity card's gym-cred line (rule 5: it follows what leads).
  const identityCaption = useMemo(() => {
    const parts: string[] = [];
    const count = stats?.totals.sessionCount ?? 0;
    if (count > 0) parts.push(`${count} ${count === 1 ? 'workout' : 'workouts'}`);
    if (band.caption === 'weightDelta' && overallDelta) {
      const arrow = overallDelta.deltaLb <= 0 ? '▼' : '▲';
      parts.push(
        `${arrow} ${formatWeightFromLb(Math.abs(overallDelta.deltaLb), weightUnit)} since ${monthLabel(overallDelta.sinceIso, new Date())}`,
      );
    } else if (user?.created_at) {
      const since = monthLabel(user.created_at, new Date());
      if (since) parts.push(`training since ${since}`);
    }
    return parts.join(' · ');
  }, [stats, band.caption, overallDelta, user?.created_at, weightUnit]);

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
    haptics.select();
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
          // The server names the config it is missing; the user gets the
          // consequence and a way out. What they need to know is that the
          // login itself outlived the data, and who can finish the job.
          Alert.alert(
            'Data removed',
            `Your workouts, plans, and account data have been deleted. Signing in with this email may still work — email ${SUPPORT_EMAIL} if you want the login removed too.`,
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

  // --- The adaptive band's three building blocks -------------------------

  const bestLiftsCard =
    bestLifts.length > 0 ? (
      <>
        <SectionHeader title="Best lifts" colors={colors} />
        <View style={[styles.sectionCard, themedStyles.sectionCard]}>
          {bestLifts.map((l, i) => {
            const m = muscleFromCatalog(undefined, undefined, l.name);
            return (
              <View key={l.exerciseId}>
                {i > 0 ? <View style={[styles.rowDivider, themedStyles.rowDivider]} /> : null}
                <View style={styles.liftRow}>
                  <LinearGradient
                    colors={muscleGradient(m)}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.liftDisc, { borderWidth: 1, borderColor: MUSCLE_EDGE[m] }]}
                  >
                    <Ionicons name="barbell-outline" size={16} color={MUSCLE_INK[m]} />
                  </LinearGradient>
                  <View style={styles.liftText}>
                    <Text style={[styles.liftName, { color: colors.text }]} numberOfLines={1}>
                      {l.name}
                    </Text>
                    <Text style={[styles.liftDate, { color: colors.textMuted }]}>
                      {formatWeekLabel(l.best.performedAt.slice(0, 10))}
                    </Text>
                  </View>
                  <Text style={[styles.liftValue, { color: colors.text }]}>
                    {formatWeightFromLb(l.best.weightLb, weightUnit)} × {l.best.reps}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </>
    ) : null;

  const seriesVals = weightSeries.filter((v): v is number => v != null);
  const seriesMin = seriesVals.length ? Math.min(...seriesVals) : 0;
  const seriesMax = seriesVals.length ? Math.max(...seriesVals) : 0;
  const barHeightPct = (v: number | null): number =>
    v == null ? 0 : seriesMax === seriesMin ? 60 : 30 + 65 * ((v - seriesMin) / (seriesMax - seriesMin));

  const bodyWeightSection =
    latestWeightLb != null && latestWeighIn != null ? (
      <>
        <SectionHeader title="Body weight" colors={colors} />
        <View style={[styles.sectionCard, themedStyles.sectionCard, styles.weightCardPad]}>
          <View style={styles.weightCardTop}>
            <Text style={[styles.weightCardValue, { color: colors.text }]}>
              {formatWeightFromLb(latestWeightLb, weightUnit)}
            </Text>
            {weightDelta30 != null && Math.abs(weightDelta30) >= 0.5 ? (
              <View
                style={[
                  styles.weightDeltaChip,
                  { backgroundColor: weightDelta30 <= 0 ? colors.successSoft : colors.warningSoft },
                ]}
              >
                <Text
                  style={[
                    styles.weightDeltaChipText,
                    { color: weightDelta30 <= 0 ? colors.success : colors.warning },
                  ]}
                >
                  {weightDelta30 <= 0 ? '▼' : '▲'}{' '}
                  {formatWeightFromLb(Math.abs(weightDelta30), weightUnit)} this month
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.weightBarsRow}>
            {weightSeries.map((v, i) => (
              <View
                key={i}
                style={[
                  styles.weightBar,
                  {
                    height: `${barHeightPct(v)}%`,
                    backgroundColor:
                      i === weightSeries.length - 1 ? colors.primary : colors.segmentTrack,
                    opacity: v == null ? 0 : 1,
                  },
                ]}
              />
            ))}
          </View>
          <View style={styles.weightCardFooter}>
            <Text style={[styles.weightCardUpdated, { color: colors.textMuted }]}>
              {recentDayLabel(latestWeighIn.dayKey, formatLocalYmd(new Date()))}
            </Text>
            <TouchableOpacity
              onPress={() => {
                haptics.tap();
                navigation.navigate('WeightTracker');
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Log weight"
            >
              <Text style={[styles.weightCardLog, { color: colors.primary }]}>Log weight ›</Text>
            </TouchableOpacity>
          </View>
        </View>
      </>
    ) : null;

  const liftsStrip =
    bestLifts.length > 0 ? (
      <View style={[styles.sectionCard, themedStyles.sectionCard, styles.stripCard]}>
        <View style={[styles.liftDisc, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name="barbell-outline" size={15} color={colors.primary} />
        </View>
        <View style={styles.stripText}>
          <Text style={[styles.stripCaption, { color: colors.textMuted }]}>Best lifts</Text>
          <Text style={[styles.stripLine, { color: colors.text }]} numberOfLines={1}>
            {bestLifts
              // The LAST word is a lift's natural short name: "…Bench Press" →
              // "Press", "Back Squat" → "Squat", "Bent-Over Row" → "Row".
              .map(
                (l) =>
                  `${l.name.trim().split(/\s+/).pop()} ${formatWeightFromLb(l.best.weightLb, weightUnit)}`,
              )
              .join(' · ')}
          </Text>
        </View>
      </View>
    ) : null;

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
        {/* Identity, Apple-ID pattern: display, not a form — tap opens the edit sheet. */}
        <TouchableOpacity
          style={[styles.identityCard, themedStyles.sectionCard]}
          onPress={() => {
            haptics.tap();
            setAvatarSheetOpen(true);
          }}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
        >
          <ProfileAvatarDisc
            avatarId={profileAvatarId}
            size={56}
            colors={colors}
            initial={(profileDisplayName || namePlaceholder).trim()}
          />
          <View style={styles.identityText}>
            <Text style={[styles.identityName, { color: colors.text }]} numberOfLines={1}>
              {profileDisplayName.trim() || namePlaceholder}
            </Text>
            <Text style={[styles.identityEmail, { color: colors.textMuted }]} numberOfLines={1}>
              {user?.email ?? 'Not signed in'}
            </Text>
            {identityCaption ? (
              <Text
                style={[styles.identityCaption, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {identityCaption}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>

        {/* The goal-adaptive band (rules 1–5 live in lib/profileBand.ts).
            Skeletons stand in for BOTH slots at once: the band's shape is
            decided by data that has not arrived, so revealing either piece
            early is what produced the reflow. */}
        {bandLoading ? (
          <>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={2} />
          </>
        ) : (
          <>
            {band.lead === 'lifts' ? bestLiftsCard : band.lead === 'weight' ? bodyWeightSection : null}
            {band.second === 'weightCard'
              ? bodyWeightSection
              : band.second === 'liftsStrip'
                ? liftsStrip
                : null}
          </>
        )}

        <SectionHeader title="Training" colors={colors} />
        <View style={[styles.sectionCard, themedStyles.sectionCard]}>
          <ChipRow
            icon="locate-outline"
            tint={colors.primary}
            label="Goal"
            value={
              secondaryGoal
                ? `${GOAL_LABELS[goal]} · ${GOAL_LABELS[secondaryGoal]}`
                : GOAL_LABELS[goal]
            }
            onPress={pickGoal}
            colors={colors}
          />
          <View style={[styles.rowDivider, themedStyles.rowDivider]} />
          <ChipRow
            icon="stats-chart-outline"
            tint={colors.secondary}
            label="Experience"
            value={experience}
            onPress={pickExperience}
            colors={colors}
          />
          <View style={[styles.rowDivider, themedStyles.rowDivider]} />
          <ChipRow
            icon="barbell-outline"
            tint={colors.accent}
            label="Equipment"
            value={equipmentSummary}
            onPress={openEquipmentModal}
            colors={colors}
          />
        </View>

        <SectionHeader title="Preferences" colors={colors} />
        <View style={[styles.sectionCard, themedStyles.sectionCard]}>
          <View style={styles.chipRow}>
            <View style={[styles.chip, { backgroundColor: colors.workoutCardio }]}>
              <Ionicons name="scale-outline" size={16} color={colors.onPrimary} />
            </View>
            <Text style={[styles.chipRowLabel, { color: colors.text }]}>Units</Text>
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
                onPress={() => {
                  haptics.select();
                  setWeightUnit('lb');
                }}
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
                onPress={() => {
                  haptics.select();
                  setWeightUnit('kg');
                }}
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
          {/* Gated on the load, not just the band: with no weigh-ins yet
              fetched the band ALWAYS resolves to `weightRow`, so this row
              told a user with years of history that their body weight was
              "Not set". */}
          {!bandLoading && band.second === 'weightRow' ? (
            <>
              <View style={[styles.rowDivider, themedStyles.rowDivider]} />
              <ChipRow
                icon="body-outline"
                tint={colors.secondary}
                label="Body weight"
                value={
                  latestWeightLb != null
                    ? formatWeightFromLb(latestWeightLb, weightUnit)
                    : 'Not set'
                }
                onPress={() => navigation.navigate('WeightTracker')}
                colors={colors}
              />
            </>
          ) : null}
          <View style={[styles.rowDivider, themedStyles.rowDivider]} />
          <View style={styles.chipRow}>
            <View style={[styles.chip, { backgroundColor: colors.workoutRecovery }]}>
              <Ionicons name="moon-outline" size={16} color={colors.onPrimary} />
            </View>
            <Text style={[styles.chipRowLabel, { color: colors.text }]}>Theme</Text>
            <View
              style={[styles.weightSegment, { borderColor: colors.border }]}
              accessibilityRole="radiogroup"
              accessibilityLabel="App theme"
            >
              <TouchableOpacity
                style={[
                  styles.weightSegmentBtn,
                  {
                    backgroundColor: mode === 'light' ? colors.primary : colors.background,
                  },
                ]}
                onPress={() => {
                  haptics.select();
                  setMode('light');
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: mode === 'light' }}
                accessibilityLabel="Light theme"
              >
                <Text
                  style={[
                    styles.weightSegmentBtnText,
                    { color: mode === 'light' ? colors.onPrimary : colors.textSecondary },
                  ]}
                >
                  Light
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.weightSegmentBtn,
                  {
                    backgroundColor: mode === 'dark' ? colors.primary : colors.background,
                  },
                ]}
                onPress={() => {
                  haptics.select();
                  setMode('dark');
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: mode === 'dark' }}
                accessibilityLabel="Dark theme"
              >
                <Text
                  style={[
                    styles.weightSegmentBtnText,
                    { color: mode === 'dark' ? colors.onPrimary : colors.textSecondary },
                  ]}
                >
                  Dark
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <SectionHeader title="Account" colors={colors} />
        <View style={[styles.sectionCard, themedStyles.sectionCard]}>
          <ChipRow
            icon="gift-outline"
            tint={colors.primary}
            label="Redeem a share code"
            onPress={() => navigation.navigate('ShareRedeem')}
            colors={colors}
          />
          {user ? (
            <>
              <View style={[styles.rowDivider, themedStyles.rowDivider]} />
              <ChipRow
                icon="download-outline"
                tint={colors.textMuted}
                label="Export my data"
                onPress={() => {
                  void handleExportMyData();
                }}
                colors={colors}
                right={
                  dataExporting ? (
                    <ActivityIndicator color={colors.primary} size="small" />
                  ) : undefined
                }
              />
              <View style={[styles.rowDivider, themedStyles.rowDivider]} />
              <TouchableOpacity
                style={accountDeleting ? { opacity: 0.65 } : null}
                onPress={() => {
                  haptics.tap();
                  handleDeleteAccount();
                }}
                disabled={accountDeleting}
                accessibilityRole="button"
                accessibilityLabel="Delete account"
                activeOpacity={0.7}
              >
                <View style={styles.chipRow}>
                  <View style={[styles.chip, { backgroundColor: colors.error }]}>
                    <Ionicons name="trash-outline" size={16} color={colors.onPrimary} />
                  </View>
                  <Text style={[styles.chipRowLabel, { color: colors.error }]}>
                    Delete account
                  </Text>
                  <View style={styles.rowRight}>
                    {accountDeleting ? (
                      <ActivityIndicator color={colors.error} size="small" />
                    ) : null}
                  </View>
                </View>
              </TouchableOpacity>
            </>
          ) : null}
        </View>

        <SectionHeader title="About" colors={colors} />
        <View style={[styles.sectionCard, themedStyles.sectionCard]}>
          <Pressable
            onLongPress={() => setShowGlassDiagnostics((v) => !v)}
            delayLongPress={600}
          >
            <ChipRow
              icon="information-circle-outline"
              tint={colors.textMuted}
              label="App version"
              value={String(appVersion)}
              colors={colors}
            />
          </Pressable>
          <LegalRow
            icon="shield-checkmark-outline"
            tint={colors.workoutRecovery}
            label="Privacy policy"
            url={PRIVACY_POLICY_URL}
            onOpen={openUrl}
            colors={colors}
            divider={<View style={[styles.rowDivider, themedStyles.rowDivider]} />}
          />
          <LegalRow
            icon="document-text-outline"
            tint={colors.textMuted}
            label="Terms of service"
            url={TERMS_OF_SERVICE_URL}
            onOpen={openUrl}
            colors={colors}
            divider={<View style={[styles.rowDivider, themedStyles.rowDivider]} />}
          />
          <View style={[styles.rowDivider, themedStyles.rowDivider]} />
          <ChipRow
            icon="mail-outline"
            tint={colors.primary}
            label="Feedback & support"
            onPress={() => openUrl(FEEDBACK_MAILTO, 'Email')}
            colors={colors}
          />
        </View>

        {/* Sign out moved here from Home's avatar menu — the avatar now opens
            this screen directly, so this is its one home. Kept out of "Your
            data": signing out is routine, deleting an account is not. */}
        <View style={[styles.sectionCard, themedStyles.sectionCard]}>
          <TouchableOpacity
            style={styles.signOutRow}
            onPress={() => {
              haptics.tap();
              handleSignOut();
            }}
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
            accessibilityRole="button"
            accessibilityLabel="Close"
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
                    haptics.select();
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
            {listPicker === 'goal' ? (
              // The secondary goal folds into the Goal sheet — one Training row
              // outside, both choices reachable inside.
              <TouchableOpacity
                style={styles.equipRow}
                onPress={() => {
                  haptics.tap();
                  pickSecondaryGoal();
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Secondary goal"
              >
                <Text style={[styles.equipLabel, { color: colors.textSecondary }]}>
                  Secondary goal
                </Text>
                <Text style={[styles.equipLabel, { color: colors.primary }]}>
                  {secondaryGoal ? GOAL_LABELS[secondaryGoal] : 'None'} ›
                </Text>
              </TouchableOpacity>
            ) : null}
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setListPicker(null)}>
                <Text style={[styles.modalBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <SheetModal
        visible={avatarSheetOpen}
        onClose={() => setAvatarSheetOpen(false)}
        scrimColor={colors.scrim}
      >
          {/* The card guards its own taps; see SheetModal. */}
          <Pressable
            style={[styles.modalSheet, themedStyles.modalSheet]}
            accessible={false}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.modalTitle, themedStyles.modalTitle]}>Edit profile</Text>
            <View style={styles.sheetNameField}>
              <Text style={[styles.profileFieldLabel, { color: colors.textMuted }]}>
                Display name
              </Text>
              <TextInput
                style={[styles.profileNameInput, themedStyles.profileNameInputThemed]}
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
            </View>
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
                    onPress={() => {
                      haptics.select();
                      setProfileAvatarId(opt.id);
                    }}
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
                onPress={() => {
                  commitDisplayName();
                  setAvatarSheetOpen(false);
                }}
                accessibilityRole="button"
                accessibilityLabel="Done"
              >
                <Text style={[styles.modalBtnText, { color: colors.primary }]}>Done</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
      </SheetModal>

      <SheetModal
        visible={equipmentModalOpen}
        onClose={() => setEquipmentModalOpen(false)}
        scrimColor={colors.scrim}
      >
          <Pressable
            style={[styles.modalSheet, themedStyles.modalSheet]}
            accessible={false}
            onPress={(e) => e.stopPropagation()}
          >
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
                    accessibilityRole="switch"
                    accessibilityLabel={opt}
                    accessibilityState={{ checked: on }}
                  >
                    <Text style={[styles.equipLabel, themedStyles.equipLabel]}>{opt}</Text>
                    <Switch
                      // The row carries the semantics; keep this out of the
                      // tree so the state is not announced twice.
                      accessible={false}
                      importantForAccessibility="no-hide-descendants"
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
          </Pressable>
      </SheetModal>
    </SafeAreaView>
  );
}
