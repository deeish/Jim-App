import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { leading, radius, spacing, text, tracking, useTheme, weight, type ColorPalette } from '../theme';
import { useTabBarInset } from '../navigation/useTabBarInset';
import { useAuth } from '../contexts/AuthContext';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import { ProfileAvatarDisc } from '../components/ProfileAvatarDisc';
import SheetModal from '../components/SheetModal';
import { haptics } from '../lib/haptics';
import { recentDayLabel } from '../lib/homeToday';
import { formatShareCode, formatShareCodeInput, isValidShareCode } from '../lib/shareCode';
import { formatWeightFromLb } from '../lib/weightDisplay';
import {
  GOLD,
  fromIso,
  mondayOf,
  muscleGradient,
  todayIso,
  toIso,
  type PrototypeMuscle,
} from '../lib/planCalendarPrototype';
import { muscleFromCatalog } from '../lib/planCalendarPrototypeStore';
import {
  createCrew,
  getCrewSummary,
  joinCrew,
  leaveCrew,
  toggleCrewKudos,
  type CrewMemberDay,
  type CrewMemberSummary,
  type CrewSummary,
} from '../services/crewService';
import { syncProfileToServer } from '../services/userService';
import type { ProfileAvatarId } from '../constants/profileAvatars';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function firstNameOf(member: { name: string | null; isMe: boolean }): string {
  if (member.isMe) return 'You';
  const name = member.name?.trim();
  return name ? name.split(/\s+/)[0] : 'Crewmate';
}

function initialOf(member: { name: string | null }): string {
  return (member.name?.trim() || 'J')[0].toUpperCase();
}

function muscleOfDay(day: CrewMemberDay): PrototypeMuscle | null {
  const tag = day.muscles[0];
  if (!tag) return null;
  return muscleFromCatalog(tag.group, undefined, tag.name);
}

/**
 * The Crew tab: a small accountability group, one scroll. Stories row (gold
 * ring = trained today), the shared crew streak, PR moments, member cards
 * with their week in muscle colors, and the consistency race. 💪 is the
 * entire social vocabulary — no feed, no comments.
 */
export default function CrewScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const tabBarInset = useTabBarInset();
  const { user } = useAuth();
  const { profileAvatarId, profileDisplayName, weightUnit } = useUserPreferences();

  const [summary, setSummary] = useState<CrewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [joinInput, setJoinInput] = useState('');
  const [joinError, setJoinError] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const today = todayIso();
      const monday = toIso(mondayOf(fromIso(today)));
      const s = await getCrewSummary(today, monday);
      setSummary(s);
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Crewmates see the name/avatar you last synced — keep it fresh.
      void syncProfileToServer({
        name: profileDisplayName || user?.email?.split('@')[0] || undefined,
        avatarId: profileAvatarId,
      });
      void load();
    }, [load, profileDisplayName, profileAvatarId, user?.email]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const startCrew = async () => {
    if (busy) return;
    haptics.tap();
    setBusy(true);
    try {
      await createCrew();
      await load();
    } catch {
      // A 409 (already in a crew, e.g. joined on another device) resolves
      // itself on reload; anything else reads as offline.
      await load();
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    if (busy || !isValidShareCode(joinInput)) return;
    haptics.tap();
    setBusy(true);
    setJoinError('');
    try {
      await joinCrew(joinInput);
      haptics.select();
      setJoinInput('');
      await load();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string | string[] } } })?.response
          ?.data?.message;
      setJoinError(
        (Array.isArray(message) ? message[0] : message) ??
          'Couldn’t join — check the code and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmLeave = () => {
    haptics.tap();
    const doLeave = async () => {
      setSheetOpen(false);
      setBusy(true);
      try {
        await leaveCrew();
        await load();
      } catch {
        setOffline(true);
      } finally {
        setBusy(false);
      }
    };
    if (Platform.OS === 'web') {
      // RN Alert renders nothing on web — the browser confirm stands in.
      if (typeof window !== 'undefined' && window.confirm('Leave this crew?')) {
        void doLeave();
      }
      return;
    }
    Alert.alert('Leave this crew?', 'Your crewmates will no longer see your training days.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => void doLeave() },
    ]);
  };

  const shareCode = async (code: string) => {
    haptics.tap();
    const message = `Join my crew on Jim — open the Crew tab and enter code ${formatShareCode(code)}.`;
    try {
      await Share.share({ message });
    } catch {
      // Desktop web has no share sheet — the clipboard is the fallback.
      if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
        void navigator.clipboard?.writeText(message).catch(() => {});
      }
    }
  };

  // One pound in flight per event: a rapid double-tap must not fire twice.
  const poundsInFlight = useRef(new Set<string>());
  const pound = async (toUserId: string, eventRef: string) => {
    const flightKey = `${toUserId}|${eventRef}`;
    if (poundsInFlight.current.has(flightKey)) return;
    poundsInFlight.current.add(flightKey);
    haptics.select();
    // Optimistic flip now; the server's response is the truth we settle on.
    setSummary((s) => {
      if (!s) return s;
      return {
        ...s,
        members: s.members.map((m) =>
          m.userId === toUserId && m.latestSessionRef === eventRef
            ? {
                ...m,
                iPoundedLatest: !m.iPoundedLatest,
                kudosWeek: m.kudosWeek + (m.iPoundedLatest ? -1 : 1),
              }
            : m,
        ),
        moments: s.moments.map((mo) =>
          mo.userId === toUserId && mo.ref === eventRef
            ? { ...mo, iPounded: !mo.iPounded, kudos: mo.kudos + (mo.iPounded ? -1 : 1) }
            : mo,
        ),
      };
    });
    try {
      const result = await toggleCrewKudos(toUserId, eventRef);
      // Reconcile with what the server actually did — an optimistic guess
      // that diverged (another device, an old kudos) corrects itself here.
      setSummary((s) => {
        if (!s) return s;
        return {
          ...s,
          members: s.members.map((m) =>
            m.userId === toUserId && m.latestSessionRef === eventRef
              ? { ...m, iPoundedLatest: result.pounded }
              : m,
          ),
          moments: s.moments.map((mo) =>
            mo.userId === toUserId && mo.ref === eventRef
              ? { ...mo, iPounded: result.pounded, kudos: result.count }
              : mo,
          ),
        };
      });
    } catch {
      void load(); // roll back to the server's truth
    } finally {
      poundsInFlight.current.delete(flightKey);
    }
  };

  const crew = summary?.crew ?? null;
  const members = summary?.members ?? [];
  const others = members.filter((m) => !m.isMe);
  const today = todayIso();

  const scheduledNow = members.filter((m) => m.todayState === 'scheduled');
  const streakCaption =
    summary && summary.streakDays > 0
      ? `Nobody has missed a scheduled workout in ${summary.streakDays} ${
          summary.streakDays === 1 ? 'day' : 'days'
        }.${
          scheduledNow.length > 0
            ? ` ${scheduledNow.map(firstNameOf).join(' and ')} train${
                scheduledNow.length === 1 && !scheduledNow[0].isMe ? 's' : ''
              } today.`
            : ''
        }`
      : 'Train on your scheduled days and the whole crew builds one streak together.';

  const storyRing = (m: CrewMemberSummary) =>
    m.todayState === 'trained'
      ? { borderColor: GOLD, borderWidth: 3, opacity: 1 }
      : m.todayState === 'scheduled'
        ? { borderColor: colors.primary, borderWidth: 3, opacity: 1 }
        : { borderColor: colors.border, borderWidth: 1, opacity: 0.55 };

  const miniTile = (day: CrewMemberDay, i: number) => {
    const muscle = muscleOfDay(day);
    const showGradient = muscle && (day.state === 'trained' || day.state === 'scheduled');
    return (
      <View key={day.dateIso} style={styles.tileColumn}>
        <View
          style={[
            styles.tile,
            !showGradient && styles.tileRest,
            day.state === 'scheduled' && styles.tileFuture,
            day.state === 'scheduled' && day.isToday && { borderColor: colors.primary, borderWidth: 1.5, opacity: 0.7 },
          ]}
        >
          {showGradient ? (
            <LinearGradient
              colors={muscleGradient(muscle)}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
          ) : null}
          {day.state === 'trained' ? (
            <View style={styles.tileSeal}>
              <Ionicons name="checkmark" size={9} color="#1C1C1E" />
            </View>
          ) : null}
        </View>
        <Text
          style={[
            styles.tileDay,
            day.isToday && { color: colors.primary, fontWeight: weight.heavy },
          ]}
        >
          {DAY_LETTERS[i]}
        </Text>
      </View>
    );
  };

  const pumpChip = (
    count: number,
    active: boolean,
    onPress: (() => void) | null,
    gold = false,
  ) => (
    <TouchableOpacity
      style={[
        styles.pump,
        gold && styles.pumpGold,
        active && (gold ? styles.pumpGoldActive : styles.pumpActive),
      ]}
      onPress={onPress ?? undefined}
      disabled={!onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={active ? 'Remove your pound' : 'Pound it'}
    >
      <Text style={styles.pumpEmoji}>💪</Text>
      <Text style={[styles.pumpCount, active && styles.pumpCountActive]}>{count}</Text>
    </TouchableOpacity>
  );

  return (
    // SafeAreaView (Home's grammar): the header clears the notch on every
    // device instead of trusting a hardcoded inset.
    <SafeAreaView style={styles.container} edges={['top']} testID="e2e-crew-root">
      <View style={styles.header}>
        <Text style={styles.title}>Crew</Text>
        {crew ? (
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => {
              haptics.tap();
              setSheetOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Crew settings"
          >
            <Ionicons name="person-add-outline" size={19} color={colors.primary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + tabBarInset }]}
          showsVerticalScrollIndicator={false}
          // The Join button must work on the first tap while the keyboard is
          // up (same as the share-redeem screen).
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />
          }
        >
          {offline && !summary ? (
            <Text style={styles.footerNote}>Offline — can’t reach the server</Text>
          ) : null}

          {!crew && summary ? (
            <>
              {/* Empty state: the invite IS the screen. */}
              <View style={styles.inviteCard}>
                <LinearGradient
                  colors={['#0047B3', '#2B6BE0', '#6A48E8']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.inviteHero}
                >
                  <Text style={styles.inviteTitle}>Your crew starts with one code</Text>
                  <Text style={styles.inviteBody}>
                    Send it to your gym friends. When they join, you see each other’s
                    training days — and nobody wants to be the empty ring.
                  </Text>
                </LinearGradient>
                <View style={styles.inviteFooter}>
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() => void startCrew()}
                    disabled={busy}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Start a crew"
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color={colors.onPrimary} />
                    ) : (
                      <Text style={styles.primaryButtonLabel}>Start a crew</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.sectionLabel}>Have a code?</Text>
              <View style={styles.joinCard}>
                <TextInput
                  style={styles.joinInput}
                  value={joinInput}
                  onChangeText={(t) => {
                    setJoinInput(formatShareCodeInput(t));
                    setJoinError('');
                  }}
                  placeholder="XXXX-XXXX"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  accessibilityLabel="Crew code"
                />
                <TouchableOpacity
                  style={[styles.joinButton, !isValidShareCode(joinInput) && styles.joinButtonDisabled]}
                  onPress={() => void join()}
                  disabled={busy || !isValidShareCode(joinInput)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Join crew"
                >
                  <Text style={styles.primaryButtonLabel}>Join</Text>
                </TouchableOpacity>
              </View>
              {joinError ? <Text style={styles.errorText}>{joinError}</Text> : null}

              <View style={styles.privacyCard}>
                <Text style={styles.sectionLabelInner}>What your crew sees</Text>
                <View style={styles.privacyRow}>
                  <Ionicons name="checkmark" size={15} color={colors.success} />
                  <Text style={styles.privacyText}>Which days you trained, your streak, your split colors</Text>
                </View>
                <View style={styles.privacyRow}>
                  <Ionicons name="checkmark" size={15} color={colors.success} />
                  <Text style={styles.privacyText}>PRs you set (they get to pound them 💪)</Text>
                </View>
                <View style={styles.privacyRow}>
                  <Ionicons name="close" size={15} color={colors.error} />
                  <Text style={styles.privacyText}>Never your full log, working sets, or body data</Text>
                </View>
              </View>
              <Text style={styles.footerNote}>A crew holds up to 10 people. Leave anytime.</Text>
            </>
          ) : null}

          {crew ? (
            <>
              {/* Today: the stories row. */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.storiesScroll}>
                <View style={styles.storiesRow}>
                  {members.map((m) => (
                    <View key={m.userId} style={styles.storyColumn}>
                      <View style={[styles.storyRing, storyRing(m)]}>
                        <ProfileAvatarDisc
                          avatarId={(m.avatarId ?? 'default') as ProfileAvatarId}
                          size={52}
                          colors={colors}
                          initial={initialOf(m)}
                        />
                      </View>
                      <Text style={[styles.storyName, m.isMe && styles.storyNameMe]} numberOfLines={1}>
                        {firstNameOf(m)}
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>

              {/* The crew streak. */}
              <View style={styles.streakCard}>
                <LinearGradient
                  colors={['#FF9F0A', '#FF3B30']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.streakChip}
                >
                  <Ionicons name="flame" size={22} color="#FFFFFF" />
                </LinearGradient>
                <View style={styles.streakTextWrap}>
                  <Text style={styles.streakTitle}>
                    {summary!.streakDays > 0
                      ? `${summary!.streakDays}-day crew streak`
                      : 'Start the crew streak'}
                  </Text>
                  <Text style={styles.streakCaption}>{streakCaption}</Text>
                </View>
              </View>

              {/* One-person crew: surface the code until friends arrive. */}
              {members.length < 2 ? (
                <View style={styles.codeCard}>
                  <View style={styles.codeTextWrap}>
                    <Text style={styles.codeValue}>{formatShareCode(crew.code)}</Text>
                    <Text style={styles.codeCaption}>Your crew code — send it to your gym friends</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.codeShareButton}
                    onPress={() => void shareCode(crew.code)}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Share crew code"
                  >
                    <Ionicons name="share-outline" size={18} color={colors.onPrimary} />
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* Moments: computed, never composed. */}
              {summary!.moments.length > 0 ? (
                <>
                  <Text style={styles.sectionLabel}>Moments</Text>
                  {summary!.moments.map((mo) => (
                    <View key={`${mo.userId}-${mo.ref}`} style={styles.momentCard}>
                      <ProfileAvatarDisc
                        avatarId={(mo.avatarId ?? 'default') as ProfileAvatarId}
                        size={38}
                        colors={colors}
                        initial={(mo.name?.trim() || 'J')[0].toUpperCase()}
                      />
                      <View style={styles.momentTextWrap}>
                        <Text style={styles.momentTitle} numberOfLines={2}>
                          {`${firstNameOf({ name: mo.name, isMe: mo.userId === summary!.meUserId })} hit ${formatWeightFromLb(mo.weight, weightUnit)} on ${mo.exerciseName}`}
                        </Text>
                        <Text style={styles.momentCaption}>
                          {`New personal record · ${recentDayLabel(mo.dateIso, today)}`}
                        </Text>
                      </View>
                      {pumpChip(
                        mo.kudos,
                        mo.iPounded,
                        mo.userId === summary!.meUserId ? null : () => void pound(mo.userId, mo.ref),
                        true,
                      )}
                    </View>
                  ))}
                </>
              ) : null}

              {/* The crew, one card each. */}
              {others.length > 0 ? <Text style={styles.sectionLabel}>This week</Text> : null}
              {others.map((m) => (
                <View key={m.userId} style={styles.memberCard}>
                  <View style={styles.memberHeader}>
                    <ProfileAvatarDisc
                      avatarId={(m.avatarId ?? 'default') as ProfileAvatarId}
                      size={38}
                      colors={colors}
                      initial={initialOf(m)}
                    />
                    <View style={styles.memberNameWrap}>
                      <Text style={styles.memberName}>{firstNameOf(m)}</Text>
                      {m.weekStreak > 0 ? (
                        <View style={styles.memberStreakRow}>
                          <Ionicons name="flame" size={11} color="#FF9F0A" />
                          <Text style={styles.memberStreak}>
                            {`${m.weekStreak}-week streak`}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    {pumpChip(
                      m.kudosWeek,
                      m.iPoundedLatest,
                      m.latestSessionRef ? () => void pound(m.userId, m.latestSessionRef!) : null,
                    )}
                  </View>
                  <View style={styles.tileRow}>{m.week.map(miniTile)}</View>
                  {m.lastSession ? (
                    <Text style={styles.memberFooter}>
                      {`${m.lastSession.title} · ${recentDayLabel(m.lastSession.dateIso, today)}`}
                      {m.hasPlanThisWeek && m.race.planned > 0 && m.race.done >= m.race.planned
                        ? ' · done for the week'
                        : ''}
                    </Text>
                  ) : (
                    <Text style={styles.memberFooter}>No sessions yet this week</Text>
                  )}
                </View>
              ))}

              {/* The week's race: consistency against your own plan. */}
              {members.length > 1 ? (
                <>
                  <Text style={styles.sectionLabel}>This week’s race</Text>
                  <View style={styles.raceCard}>
                    {[...members]
                      .sort((a, b) => {
                        const ra = a.race.planned > 0 ? a.race.done / a.race.planned : 0;
                        const rb = b.race.planned > 0 ? b.race.done / b.race.planned : 0;
                        return rb - ra;
                      })
                      .map((m, idx, arr) => {
                        const complete =
                          m.hasPlanThisWeek && m.race.planned > 0 && m.race.done >= m.race.planned;
                        return (
                          <View
                            key={m.userId}
                            style={[styles.raceRow, idx < arr.length - 1 && styles.raceRowDivider]}
                          >
                            <ProfileAvatarDisc
                              avatarId={(m.avatarId ?? 'default') as ProfileAvatarId}
                              size={34}
                              colors={colors}
                              initial={initialOf(m)}
                            />
                            <View style={styles.raceBarWrap}>
                              <View style={styles.raceNameRow}>
                                <Text style={styles.raceName}>{firstNameOf(m)}</Text>
                                {complete ? (
                                  <Text style={styles.raceDone}>done for the week</Text>
                                ) : null}
                              </View>
                              {m.race.planned > 0 ? (
                                <View style={styles.raceSegments}>
                                  {Array.from({ length: m.race.planned }).map((_, i) => (
                                    <View
                                      key={i}
                                      style={[
                                        styles.raceSegment,
                                        i < m.race.done &&
                                          (complete ? styles.raceSegmentGold : styles.raceSegmentDone),
                                      ]}
                                    />
                                  ))}
                                </View>
                              ) : (
                                <Text style={styles.raceNoPlan}>no plan this week</Text>
                              )}
                            </View>
                            <Text style={[styles.raceScore, complete && styles.raceScoreGold]}>
                              {`${m.race.done}/${m.race.planned}`}
                            </Text>
                          </View>
                        );
                      })}
                  </View>
                  <Text style={styles.footerNote}>
                    Resets Monday · measured against each person’s own plan
                  </Text>
                </>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      )}

      {/* Crew settings sheet: the code + leave. */}
      {/* (sheet below renders over the SafeAreaView) */}
      <SheetModal visible={sheetOpen} onClose={() => setSheetOpen(false)} scrimColor={colors.scrim}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>Your crew</Text>
          {crew ? (
            <View style={styles.codeCard}>
              <View style={styles.codeTextWrap}>
                <Text style={styles.codeValue}>{formatShareCode(crew.code)}</Text>
                <Text style={styles.codeCaption}>
                  {`${members.length} of 10 · anyone with the code can join`}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.codeShareButton}
                onPress={() => void shareCode(crew.code)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Share crew code"
              >
                <Ionicons name="share-outline" size={18} color={colors.onPrimary} />
              </TouchableOpacity>
            </View>
          ) : null}
          <TouchableOpacity
            style={styles.leaveRow}
            onPress={confirmLeave}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Leave crew"
          >
            <Ionicons name="exit-outline" size={18} color={colors.error} />
            <Text style={styles.leaveLabel}>Leave crew</Text>
          </TouchableOpacity>
        </Pressable>
      </SheetModal>
    </SafeAreaView>
  );
}

function createStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
    },
    title: {
      fontSize: text.display,
      fontWeight: weight.heavy,
      letterSpacing: tracking.tight,
      color: c.text,
    },
    headerButton: {
      width: 34,
      height: 34,
      borderRadius: radius.pill,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingBox: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.sm,
      gap: spacing.md,
    },
    sectionLabel: {
      fontSize: text.caption,
      fontWeight: weight.heavy,
      letterSpacing: tracking.widest,
      textTransform: 'uppercase',
      color: c.textMuted,
      marginTop: spacing.sm,
    },
    sectionLabelInner: {
      fontSize: text.caption,
      fontWeight: weight.heavy,
      letterSpacing: tracking.widest,
      textTransform: 'uppercase',
      color: c.textMuted,
      marginBottom: spacing.sm,
    },
    storiesScroll: {
      flexGrow: 0,
    },
    storiesRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    storyColumn: {
      alignItems: 'center',
      gap: spacing.xs,
      width: 66,
    },
    storyRing: {
      padding: 3,
      borderRadius: radius.pill,
    },
    storyName: {
      fontSize: text.caption,
      fontWeight: weight.semibold,
      color: c.textSecondary,
    },
    storyNameMe: {
      color: c.text,
      fontWeight: weight.bold,
    },
    streakCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.lg,
      padding: spacing.lg,
    },
    streakChip: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    streakTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    streakTitle: {
      fontSize: text.headline,
      fontWeight: weight.heavy,
      letterSpacing: tracking.tight,
      color: c.text,
    },
    streakCaption: {
      fontSize: text.footnote,
      lineHeight: leading.footnote,
      fontWeight: weight.medium,
      color: c.textMuted,
      marginTop: spacing.xxs,
    },
    codeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.lg,
      padding: spacing.lg,
    },
    codeTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    codeValue: {
      fontSize: text.title,
      fontWeight: weight.heavy,
      letterSpacing: 2,
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    codeCaption: {
      fontSize: text.footnote,
      fontWeight: weight.medium,
      color: c.textMuted,
      marginTop: spacing.xxs,
    },
    codeShareButton: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    momentCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: c.warningSoft,
      borderWidth: 1,
      borderColor: GOLD + '73',
      borderRadius: radius.lg,
      padding: spacing.md,
    },
    momentTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    momentTitle: {
      fontSize: text.body,
      fontWeight: weight.bold,
      color: c.text,
    },
    momentCaption: {
      fontSize: text.footnote,
      fontWeight: weight.medium,
      color: c.textMuted,
      marginTop: 1,
    },
    memberCard: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.lg,
      padding: spacing.md,
    },
    memberHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    memberNameWrap: {
      flex: 1,
      minWidth: 0,
    },
    memberName: {
      fontSize: text.callout,
      fontWeight: weight.bold,
      color: c.text,
    },
    memberStreakRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginTop: 1,
    },
    memberStreak: {
      fontSize: text.caption,
      fontWeight: weight.semibold,
      color: '#FF9F0A',
    },
    pump: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: c.primarySoft,
      borderRadius: radius.pill,
      paddingVertical: 5,
      paddingHorizontal: spacing.md,
    },
    pumpActive: {
      backgroundColor: c.primary,
    },
    pumpGold: {
      backgroundColor: GOLD + '29',
    },
    pumpGoldActive: {
      backgroundColor: GOLD,
    },
    pumpEmoji: {
      fontSize: 12,
    },
    pumpCount: {
      fontSize: text.footnote,
      fontWeight: weight.bold,
      color: c.textSecondary,
    },
    pumpCountActive: {
      color: '#1C1C1E',
    },
    tileRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: spacing.md,
    },
    tileColumn: {
      alignItems: 'center',
    },
    tile: {
      width: 34,
      height: 40,
      borderRadius: radius.sm + 2,
      overflow: 'hidden',
      backgroundColor: c.surface,
    },
    tileRest: {
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.border,
    },
    tileFuture: {
      opacity: 0.5,
    },
    tileSeal: {
      position: 'absolute',
      right: 2,
      top: 2,
      width: 15,
      height: 15,
      borderRadius: radius.pill,
      backgroundColor: GOLD,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tileDay: {
      fontSize: 9,
      fontWeight: weight.bold,
      color: c.textMuted,
      marginTop: spacing.xs,
    },
    memberFooter: {
      fontSize: text.footnote,
      fontWeight: weight.medium,
      color: c.textMuted,
      marginTop: spacing.md,
    },
    raceCard: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xs,
    },
    raceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
    },
    raceRowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    raceBarWrap: {
      flex: 1,
      minWidth: 0,
    },
    raceNameRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: spacing.sm,
    },
    raceName: {
      fontSize: text.body,
      fontWeight: weight.bold,
      color: c.text,
    },
    raceDone: {
      fontSize: text.caption,
      fontWeight: weight.bold,
      color: GOLD,
    },
    raceSegments: {
      flexDirection: 'row',
      gap: spacing.xs,
      marginTop: spacing.xs,
    },
    raceSegment: {
      flex: 1,
      height: 9,
      borderRadius: radius.xs,
      backgroundColor: c.border,
    },
    raceSegmentDone: {
      backgroundColor: c.primary,
    },
    raceSegmentGold: {
      backgroundColor: GOLD,
    },
    raceNoPlan: {
      fontSize: text.caption,
      fontWeight: weight.medium,
      color: c.textMuted,
      marginTop: spacing.xs,
    },
    raceScore: {
      fontSize: text.footnote,
      fontWeight: weight.heavy,
      color: c.textSecondary,
    },
    raceScoreGold: {
      color: GOLD,
    },
    inviteCard: {
      borderRadius: radius.xl,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    inviteHero: {
      padding: spacing.xl,
    },
    inviteTitle: {
      fontSize: text.title,
      fontWeight: weight.heavy,
      letterSpacing: tracking.tight,
      color: '#FFFFFF',
    },
    inviteBody: {
      fontSize: text.body,
      lineHeight: leading.body,
      fontWeight: weight.medium,
      color: 'rgba(255,255,255,0.85)',
      marginTop: spacing.sm,
    },
    inviteFooter: {
      padding: spacing.lg,
    },
    primaryButton: {
      height: 48,
      borderRadius: radius.md,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonLabel: {
      fontSize: text.callout,
      fontWeight: weight.heavy,
      color: c.onPrimary,
    },
    joinCard: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    joinInput: {
      flex: 1,
      height: 48,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      paddingHorizontal: spacing.lg,
      fontSize: text.callout,
      fontWeight: weight.bold,
      letterSpacing: 1.5,
      color: c.text,
    },
    joinButton: {
      height: 48,
      borderRadius: radius.md,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
    },
    joinButtonDisabled: {
      opacity: 0.4,
    },
    errorText: {
      fontSize: text.footnote,
      fontWeight: weight.medium,
      color: c.error,
    },
    privacyCard: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginTop: spacing.sm,
    },
    privacyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    privacyText: {
      flex: 1,
      fontSize: text.footnote,
      lineHeight: leading.footnote,
      fontWeight: weight.medium,
      color: c.textSecondary,
    },
    footerNote: {
      fontSize: text.caption,
      fontWeight: weight.medium,
      color: c.textMuted,
      textAlign: 'center',
      marginTop: spacing.xs,
    },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xxl,
    },
    grabber: {
      width: 36,
      height: 5,
      borderRadius: radius.xs,
      backgroundColor: c.border,
      alignSelf: 'center',
      marginTop: spacing.sm,
    },
    sheetTitle: {
      fontSize: text.headline,
      fontWeight: weight.bold,
      color: c.text,
      paddingVertical: spacing.lg,
    },
    leaveRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.lg,
      marginTop: spacing.sm,
    },
    leaveLabel: {
      fontSize: text.callout,
      fontWeight: weight.semibold,
      color: c.error,
    },
  });
}
