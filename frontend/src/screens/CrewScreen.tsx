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
import { useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native';
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
import { buildCrewInviteMessage } from '../lib/shareLinks';
import { markCrewSeen } from '../lib/crewBadgeStore';
import { formatWeightFromLb } from '../lib/weightDisplay';
import type { RootTabParamList } from '../components/NavBar';
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
  removeCrewMember,
  renameCrew,
  rotateCrewCode,
  toggleCrewKudos,
  type CrewMemberDay,
  type CrewMemberSummary,
  type CrewMoment,
  type CrewSummary,
} from '../services/crewService';
import { syncProfileToServer } from '../services/userService';
import type { ProfileAvatarId } from '../constants/profileAvatars';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
/** Spoken form of the same seven columns — 'T' tells a screen reader nothing. */
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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
 * The Crew tab: a small accountability group, ONE HERO AND ONE LIST.
 *
 * The list is the whole screen. It is sorted by each person's completion
 * ratio, so the list IS the race; the seven muscle tiles ARE their week; the
 * `done/planned` at the row's end is their score. One row per person, one 💪
 * per person, and you are ranked in it like everyone else.
 *
 * WHY IT IS SHAPED THIS WAY. The screen used to carry a stories row, a
 * moments feed, a member card each and a race card — four parallel drawings
 * of the same ten people, two of them redrawing the same seven days in two
 * different visual languages. Worse, the member chip and the moment chip
 * pounded DIFFERENT refs while showing different counts for one workout.
 * Collapsing to one row per person is what makes that class of bug
 * impossible: a person exists once, so their 💪 can only mean one thing.
 *
 * Moments did not disappear, they moved. A personal record takes over its
 * owner's subtitle (gold) and retargets that row's 💪 at the PR. Crew-wide
 * moments — a streak milestone, the Monday recap — become the hero's caption,
 * which costs no new surface at all.
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
  /** Story-row tap → the member's mini profile sheet. */
  const [memberSheetId, setMemberSheetId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  /** Clash-of-Clans grammar: creating is a form, not a tap — a crew is named
   *  before it exists, so an accidental tap just dismisses the sheet. */
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [createName, setCreateName] = useState('');

  // A jimapp://crew/CODE deep link lands here with the code — prefill only;
  // joining stays an explicit tap.
  const route = useRoute<RouteProp<RootTabParamList, 'Crew'>>();
  const joinCodeParam = route.params?.joinCode;
  React.useEffect(() => {
    if (joinCodeParam) setJoinInput(formatShareCodeInput(joinCodeParam));
  }, [joinCodeParam]);

  const load = useCallback(async () => {
    try {
      const today = todayIso();
      const monday = toIso(mondayOf(fromIso(today)));
      const s = await getCrewSummary(today, monday);
      setSummary(s);
      setNameDraft(s.crew?.name ?? '');
      setOffline(false);
      // The tab has now shown everything — clear the badge fingerprint.
      void markCrewSeen(s);
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
    const name = createName.trim();
    if (busy || name.length < 2) return;
    haptics.tap();
    setBusy(true);
    try {
      await createCrew(name);
      // Load BEFORE dismissing. Closing first unmounted the only spinner and
      // dropped the user onto "Your crew starts with one code" — the empty
      // state — while the crew they had just made was being fetched.
      await load();
      setCreateSheetOpen(false);
      setCreateName('');
    } catch {
      // A 409 (already in a crew, e.g. joined on another device) resolves
      // itself on reload; anything else reads as offline.
      setCreateSheetOpen(false);
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
          'Couldn’t join. Check the code and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmLeave = () => {
    haptics.tap();
    // The last member out deletes the crew, so a solo "leave" IS a delete —
    // say so, and keep the accidental-tap escape one honest confirm away.
    const solo = (summary?.members.length ?? 0) <= 1;
    const title = solo ? 'Delete this crew?' : 'Leave this crew?';
    const body = solo
      ? 'It only has you in it, so it goes away entirely.'
      : 'The crew keeps going without you, and you can rejoin anytime with the code.';
    const confirmLabel = solo ? 'Delete' : 'Leave';
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
      if (typeof window !== 'undefined' && window.confirm(title)) {
        void doLeave();
      }
      return;
    }
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: confirmLabel, style: 'destructive', onPress: () => void doLeave() },
    ]);
  };

  /** Crew lead only. The server rejects it from anyone else regardless. */
  const confirmRemove = (m: CrewMemberSummary) => {
    haptics.tap();
    const name = firstNameOf(m);
    const title = `Remove ${name}?`;
    const body = `They stop seeing the crew's training days, and their pounds go with them. They can rejoin with the code — mint a new one if you don't want them to.`;
    const doRemove = async () => {
      setMemberSheetId(null);
      setBusy(true);
      try {
        await removeCrewMember(m.userId);
        await load();
      } catch {
        setOffline(true);
      } finally {
        setBusy(false);
      }
    };
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(title)) void doRemove();
      return;
    }
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void doRemove() },
    ]);
  };

  /** The only way to un-share a code that ended up in the wrong group chat. */
  const confirmRotateCode = () => {
    haptics.tap();
    const title = 'Mint a new code?';
    const body =
      'The old code stops working immediately. Everyone already in the crew stays in it.';
    const doRotate = async () => {
      setBusy(true);
      try {
        await rotateCrewCode();
        haptics.select();
        await load();
      } catch {
        setOffline(true);
      } finally {
        setBusy(false);
      }
    };
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(title)) void doRotate();
      return;
    }
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'New code', onPress: () => void doRotate() },
    ]);
  };

  const commitRename = async () => {
    const current = summary?.crew?.name ?? '';
    if (nameDraft.trim() === current.trim()) return;
    try {
      const { name } = await renameCrew(nameDraft);
      setSummary((s) => (s?.crew ? { ...s, crew: { ...s.crew, name } } : s));
      setNameDraft(name ?? '');
      haptics.select();
    } catch {
      setNameDraft(current);
    }
  };

  const shareCode = async (code: string) => {
    haptics.tap();
    const message = buildCrewInviteMessage({
      crewName: summary?.crew?.name ?? null,
      code,
    });
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
        // One ref can be on screen twice for the same member — their row chip
        // AND the day tile it belongs to — so a single tap has to move both.
        members: s.members.map((m) => {
          if (m.userId !== toUserId) return m;
          const week = m.week.map((d) =>
            d.poundRef === eventRef
              ? {
                  ...d,
                  iPounded: !d.iPounded,
                  kudos: Math.max(0, d.kudos + (d.iPounded ? -1 : 1)),
                }
              : d,
          );
          if (m.latestSessionRef !== eventRef) return { ...m, week };
          return {
            ...m,
            week,
            iPoundedLatest: !m.iPoundedLatest,
            kudosLatest: Math.max(0, m.kudosLatest + (m.iPoundedLatest ? -1 : 1)),
            kudosWeek: Math.max(0, m.kudosWeek + (m.iPoundedLatest ? -1 : 1)),
          };
        }),
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
          members: s.members.map((m) => {
            if (m.userId !== toUserId) return m;
            const week = m.week.map((d) =>
              d.poundRef === eventRef
                ? { ...d, iPounded: result.pounded, kudos: result.count }
                : d,
            );
            return m.latestSessionRef === eventRef
              ? { ...m, week, iPoundedLatest: result.pounded, kudosLatest: result.count }
              : { ...m, week };
          }),
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
  const memberSheet = memberSheetId
    ? (members.find((m) => m.userId === memberSheetId) ?? null)
    : null;
  /** Only the longest-standing member can remove people or mint a new code. */
  const iAmLead = !!summary && summary.leadUserId === summary.meUserId;

  /** A member's most recent personal record, if they set one this week. It
   *  takes over their row's subtitle AND retargets their 💪 at the PR, so the
   *  record and the chip beside it can never disagree. */
  const prByUser = useMemo(() => {
    const map = new Map<string, CrewMoment>();
    for (const mo of summary?.moments ?? []) {
      if (mo.kind === 'pr' && mo.userId && !map.has(mo.userId)) {
        map.set(mo.userId, mo);
      }
    }
    return map;
  }, [summary?.moments]);

  /**
   * The ONE event a person's 💪 targets: their record if they set one this
   * week, otherwise their latest session — with the count and pressed state
   * belonging to THAT ref and nothing else.
   *
   * Every surface that draws a chip for a member derives it here. Two
   * surfaces picking their own ref, or labelling a single-ref chip with a
   * week-wide total, is the exact bug this screen was rebuilt to kill; it
   * survived in the member sheet until it was pulled into one place.
   */
  const chipTargetFor = (m: CrewMemberSummary) => {
    const pr = prByUser.get(m.userId) ?? null;
    return {
      pr,
      ref: pr ? pr.ref : m.latestSessionRef,
      count: pr ? pr.kudos : m.kudosLatest,
      active: pr ? pr.iPounded : m.iPoundedLatest,
    };
  };

  /** "225 lb × 3" — the set as lifted, never the 1RM estimate that detected it. */
  const prSetLabel = (mo: CrewMoment) =>
    `${formatWeightFromLb(mo.weight ?? 0, weightUnit)}${mo.reps ? ` × ${mo.reps}` : ''}`;

  /** Every record a member set this week, newest first. The row can only show
   *  their latest one, so without this the second and third records of a good
   *  week were invisible AND unpoundable. */
  const recordsOf = (userId: string) =>
    (summary?.moments ?? []).filter((mo) => mo.kind === 'pr' && mo.userId === userId);

  /** Crew-wide moments have no single recipient, so they have no card: they
   *  ride the hero's caption instead. The Monday recap keeps a pound, because
   *  its winner IS a recipient — and it is the only chip the hero ever has. */
  const recapMoment = summary?.moments.find((mo) => mo.kind === 'recap') ?? null;
  const milestoneMoment = summary?.moments.find((mo) => mo.kind === 'streak') ?? null;

  const scheduledNow = members.filter((m) => m.todayState === 'scheduled');
  /**
   * THE CREW'S WEEK — the one number on this screen that is OURS.
   *
   * Everything else here is individual: four people's weeks listed side by
   * side, each racing their own plan. The only shared thing was the streak,
   * which is binary and (before the make-up window) usually dead, so the tab
   * had no headline that was alive most of the time.
   *
   * `planned` counts only members who actually have a plan this week —
   * `race.planned` counts any day with a slot OR a log, so a planless member
   * would otherwise add their own sessions to the target and drag the ratio
   * toward 100% for doing nothing extra. `done` counts EVERYONE, so their
   * work still pushes the crew forward. That asymmetry is deliberate: it can
   * put the crew past its own target, which is a good state to be able to
   * reach and something a streak has no equivalent of.
   */
  const crewWeek = useMemo(() => {
    const done = members.reduce((n, m) => n + m.race.done, 0);
    const planned = members.reduce(
      (n, m) => n + (m.hasPlanThisWeek ? m.race.planned : 0),
      0,
    );
    return { done, planned, remaining: Math.max(0, planned - done) };
  }, [members]);

  /** Nobody in the crew has a plan yet, so there is no target to measure. */
  const noTarget = crewWeek.planned === 0;

  const heroTitle = noTarget
    ? `${crewWeek.done} ${crewWeek.done === 1 ? 'session' : 'sessions'} this week`
    : `${crewWeek.done} of ${crewWeek.planned} sessions`;

  const streakCaption = (() => {
    if (recapMoment) {
      const first = firstNameOf({
        name: recapMoment.name,
        isMe: recapMoment.userId === summary?.meUserId,
      });
      return `${first} won last week with ${recapMoment.winnerDone ?? 0} of ${
        recapMoment.winnerPlanned ?? 0
      } sessions. The crew went ${recapMoment.crewDone ?? 0}/${recapMoment.crewPlanned ?? 0}.`;
    }
    const who =
      scheduledNow.length > 0
        ? ` ${scheduledNow.map(firstNameOf).join(' and ')} train${
            scheduledNow.length === 1 && !scheduledNow[0].isMe ? 's' : ''
          } today.`
        : '';
    if (noTarget) {
      return `Add a plan and the crew gets a target to hit together.${who}`;
    }
    // What is LEFT, not what is done: the number that gets someone off the
    // sofa on a Sunday is the one still owed.
    if (crewWeek.remaining > 0) {
      return `${crewWeek.remaining} to go.${who}`;
    }
    return crewWeek.done > crewWeek.planned
      ? `Past the target, with ${crewWeek.done - crewWeek.planned} to spare.${who}`
      : `The crew hit its week.${who}`;
  })();

  /**
   * The race ordering IS the list ordering, so it has to be honest.
   *
   * `race.planned` counts any day with a log OR a slot, which means someone
   * with no plan who trained once reads 1/1 — a perfect ratio, and top of the
   * leaderboard above a person who went 4/5 against a real program. Gating on
   * `hasPlanThisWeek` is the same rule the Monday recap already used to pick
   * its winner; the live list was the one place that disagreed.
   *
   * Planless members sort below everyone racing, by sessions done, so putting
   * in work still moves you up among them.
   */
  const raceRatio = (m: CrewMemberSummary) =>
    m.hasPlanThisWeek && m.race.planned > 0 ? m.race.done / m.race.planned : 0;
  const ranked = useMemo(
    () =>
      [...members].sort(
        (a, b) => raceRatio(b) - raceRatio(a) || b.race.done - a.race.done,
      ),
    [members],
  );

  /** Which column is today. Read off the week the server built rather than
   *  recomputed here, so the header letters can never drift from the tiles. */
  const todayIndex = members[0]?.week.findIndex((d) => d.isToday) ?? -1;

  const storyRing = (m: CrewMemberSummary) =>
    m.todayState === 'trained'
      ? { borderColor: GOLD, borderWidth: 3, opacity: 1 }
      : m.todayState === 'scheduled'
        ? { borderColor: colors.primary, borderWidth: 3, opacity: 1 }
        : // Same 3pt geometry, drawn in nothing: a rest day has no ring, and
        // an equal-width ring is what keeps every row's avatar in column.
        { borderColor: 'transparent', borderWidth: 3, opacity: 0.5 };

  /**
   * One day of a member's week. `withLetter` is false in the list, where the
   * day letters are drawn ONCE in the card's header strip instead of under
   * every member's tiles — the same seven letters repeated per row was itself
   * a small piece of the clutter.
   */
  /**
   * The face of one day. Both weeks on this screen render through here, so a
   * state fixed in one is fixed in both — the list and the sheet drawing the
   * same day differently is how `missed` stayed invisible in the first place.
   */
  const tileFace = (day: CrewMemberDay, w: number, h: number) => {
    const muscle = muscleOfDay(day);
    // A MISSED day paints too. It is a day that was on the plan and did not
    // happen, so drawing it exactly like a rest day is a lie — and now that
    // these tiles are the only drawing of the week, an invisible miss leaves
    // the score beside them ("0/4" against two visible tiles) unexplainable.
    const showGradient = muscle && day.state !== 'rest';
    const missed = day.state === 'missed' && muscle;
    const base = muscle ? muscleGradient(muscle) : null;
    const seal = Math.max(11, Math.round(h * 0.375));
    return (
      <View
        style={[
          styles.tile,
          { width: w, height: h },
          !showGradient && styles.tileRest,
          day.state === 'scheduled' && styles.tileFuture,
          day.state === 'scheduled' && day.isToday && { borderColor: colors.primary, borderWidth: 1.5, opacity: 0.7 },
          // Outlined in its own colour, hollow inside: the shape of the
          // session survives, the work does not. Distinct from rest (a
          // neutral hairline, no colour at all) without a dashed border,
          // which RN silently renders solid once a borderRadius is set.
          missed && base ? { borderWidth: 1.5, borderColor: `${base[0]}8C` } : null,
        ]}
      >
        {showGradient && base ? (
          <LinearGradient
            colors={missed ? [`${base[0]}2E`, `${base[1]}2E`] : base}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        ) : null}
        {day.state === 'trained' ? (
          <View style={[styles.tileSeal, { width: seal, height: seal }]}>
            <Ionicons name="checkmark" size={Math.round(seal * 0.62)} color="#1C1C1E" />
          </View>
        ) : null}
      </View>
    );
  };

  const dayLetter = (day: CrewMemberDay, i: number, extra?: object) => (
    <Text
      style={[
        styles.tileDay,
        extra,
        day.isToday && { color: colors.primary, fontWeight: weight.heavy },
      ]}
    >
      {DAY_LETTERS[i]}
    </Text>
  );

  /** The list row's compact week; letters come from the card's header strip. */
  const rowTile = (day: CrewMemberDay, i: number) => (
    <View key={day.dateIso} style={styles.tileColumn}>
      {tileFace(day, 30, 36)}
    </View>
  );

  /**
   * The member sheet's week, where each day a crewmate TRAINED is its own tap
   * target: this is the only place you can pound one specific session rather
   * than whatever they did last. The letter moves above the tile to leave the
   * space beneath it for the pound.
   *
   * The row's own chip is deliberately kept: it is the one-tap path for the
   * common case, and it targets the same ref as the tile it belongs to.
   */
  const sheetDayTile = (m: CrewMemberSummary) => (day: CrewMemberDay, i: number) => {
    const ref = day.poundRef;
    // The record's day wears gold, like the row chip pointing at the same
    // ref — they are one toggle, so they should not look like two.
    const isRecordDay = !!ref && prByUser.get(m.userId)?.ref === ref;
    return (
      <View key={day.dateIso} style={styles.tileColumn}>
        {dayLetter(day, i, styles.sheetTileDay)}
        {ref ? (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => void pound(m.userId, ref)}
            // The tile is 34x40; the slop takes the real target past 44.
            hitSlop={{ top: 6, bottom: 4, left: 5, right: 5 }}
            accessibilityRole="button"
            accessibilityLabel={`${day.iPounded ? 'Remove your pound from' : 'Pound'} ${firstNameOf(m)}'s ${day.title ?? 'workout'} on ${DAY_NAMES[i]}`}
          >
            {tileFace(day, 34, 40)}
          </TouchableOpacity>
        ) : (
          tileFace(day, 34, 40)
        )}
        {/* Shown when the day can be pounded OR already has been. The second
            case is how you see your own cheering: your days are not tappable,
            but they still say what they collected. */}
        {ref || day.kudos > 0 ? (
          <View
            style={[
              styles.dayPound,
              // Your own days show what they collected but cannot be tapped,
              // so they must not wear a button's fill.
              !ref && styles.dayPoundReadOnly,
              ref && isRecordDay && styles.dayPoundGold,
              ref &&
                day.iPounded &&
                (isRecordDay ? styles.dayPoundGoldActive : styles.dayPoundActive),
            ]}
          >
            <Text style={styles.dayPoundEmoji}>💪</Text>
            {day.kudos > 0 ? (
              <Text
                style={[
                  styles.dayPoundCount,
                  day.iPounded &&
                    (isRecordDay ? styles.dayPoundCountGoldActive : styles.dayPoundCountActive),
                ]}
              >
                {day.kudos}
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.dayPoundSpacer} />
        )}
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
      {/* No "0". An untouched chip is an invitation, not a score of nil. */}
      {count > 0 ? (
        <Text
          style={[
            styles.pumpCount,
            active && (gold ? styles.pumpCountActiveGold : styles.pumpCountActive),
          ]}
        >
          {count}
        </Text>
      ) : null}
    </TouchableOpacity>
  );

  return (
    // SafeAreaView (Home's grammar): the header clears the notch on every
    // device instead of trusting a hardcoded inset.
    <SafeAreaView style={styles.container} edges={['top']} testID="e2e-crew-root">
      <View style={styles.header}>
        {/* The crew's name IS the page title (clan-page grammar), and tapping
            it opens the sheet. There is deliberately NO second header button:
            the icon that used to sit here opened the very same sheet the
            title already opens, and the list's own "Invite" row is the
            visible way in. The chevron is what makes the title read tappable. */}
        {crew ? (
          <TouchableOpacity
            style={styles.titleTap}
            onPress={() => {
              haptics.tap();
              setSheetOpen(true);
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Crew settings"
          >
            <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {crew.name || 'Crew'}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        ) : (
          <Text style={[styles.title, styles.titleTap]} numberOfLines={1}>
            Crew
          </Text>
        )}
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
          {/* Stale data with no warning is worse than an empty screen: you
              cannot tell yesterday's week from today's. */}
          {offline ? (
            <Text style={styles.footerNote}>
              {summary
                ? 'Offline. Showing the last update.'
                : 'Offline. Can’t reach the server.'}
            </Text>
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
                    training days, and nobody wants to be the empty ring.
                  </Text>
                </LinearGradient>
                <View style={styles.inviteFooter}>
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() => {
                      haptics.tap();
                      setCreateSheetOpen(true);
                    }}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Start a crew"
                  >
                    <Text style={styles.primaryButtonLabel}>Start a crew</Text>
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
                  {/* `busy` reached `disabled` but never the label, so two
                      round trips ran with no feedback at all on the one screen
                      where the user is waiting to find out if a code worked. */}
                  {busy ? (
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                  ) : (
                    <Text style={styles.primaryButtonLabel}>Join</Text>
                  )}
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
              {/* The hero. One shared number, and the crew-wide moments ride
                  its caption rather than earning cards of their own. */}
              <View style={styles.heroCard}>
                <View style={styles.heroTopRow}>
                  <Text style={styles.heroLabel}>This week</Text>
                  {/* The streak, demoted. It is a real number again now that
                      a miss can be paid back, but it is not what this tab
                      rests on — a headline that is dead most of the time
                      teaches people to stop reading it. */}
                  {summary!.streakDays > 0 ? (
                    <View style={styles.heroStreakChip}>
                      <Ionicons name="flame" size={13} color="#E08D0C" />
                      <Text style={styles.heroStreakLabel}>
                        {`${summary!.streakDays}-day streak`}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.heroTitle}>{heroTitle}</Text>
                {!noTarget ? (
                  <View style={styles.heroTrack}>
                    <LinearGradient
                      colors={['#FF9F0A', '#FF3B30']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[
                        styles.heroFill,
                        {
                          width: `${Math.min(100, Math.round((crewWeek.done / crewWeek.planned) * 100))}%`,
                        },
                      ]}
                    />
                  </View>
                ) : null}
                <View style={styles.streakTextWrap}>
                  <Text style={styles.streakCaption}>{streakCaption}</Text>
                </View>
                {/* The recap's winner is a real recipient, so it keeps its
                    pound. It is the only chip that ever sits on the hero. */}
                {recapMoment && recapMoment.userId && recapMoment.userId !== summary!.meUserId
                  ? pumpChip(
                      recapMoment.kudos,
                      recapMoment.iPounded,
                      () => void pound(recapMoment.userId!, recapMoment.ref),
                      true,
                    )
                  : null}
              </View>

              {/* An invite link used to do nothing at all here: the code was
                  stored in state the no-crew branch renders, so tapping a
                  friend's link while already in a crew opened the tab and
                  showed no sign anything had happened. */}
              {joinCodeParam ? (
                <View style={styles.noticeCard}>
                  <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
                  <Text style={styles.noticeText}>
                    {`That invite is for code ${formatShareCode(joinCodeParam)}. You're in ${
                      crew.name || 'a crew'
                    } already — leave it first to join another.`}
                  </Text>
                </View>
              ) : null}

              {/* Not "This week" — the hero above owns that phrase now, and
                  the two stacked read as a mistake. This label names the LIST. */}
              <Text style={styles.sectionLabel}>The crew</Text>

              {/* THE LIST. Sorted by completion ratio, so it is also the race.
                  Every person is drawn exactly once. */}
              <View style={styles.listCard}>
                {/* Day letters, once — not once per member. */}
                <View style={styles.listHead}>
                  <View style={styles.listHeadTiles}>
                    {DAY_LETTERS.map((letter, i) => (
                      <Text
                        key={`${letter}-${i}`}
                        style={[
                          styles.tileDay,
                          styles.listHeadDay,
                          i === todayIndex && { color: colors.primary, fontWeight: weight.heavy },
                        ]}
                      >
                        {letter}
                      </Text>
                    ))}
                  </View>
                  <View style={styles.rowScoreSpacer} />
                </View>

                {ranked.map((m, idx) => {
                  const complete =
                    m.hasPlanThisWeek && m.race.planned > 0 && m.race.done >= m.race.planned;
                  const { pr, ref: chipRef, count: chipCount, active: chipActive } =
                    chipTargetFor(m);
                  // The lift's name lives in the sheet, where there is room
                  // for it. Here it only ever truncated ("…Flat Barbell Benc…")
                  // and pushed the number that matters out of view.
                  const subtitle = pr
                    ? `PR · ${prSetLabel(pr)}`
                    : m.lastSession
                      ? `${m.lastSession.title} · ${recentDayLabel(m.lastSession.dateIso, today)}`
                      : 'No sessions yet this week';
                  const openSheet = () => {
                    haptics.select();
                    setMemberSheetId(m.userId);
                  };
                  const rowLabel = `${firstNameOf(m)}, ${m.race.done} of ${m.race.planned} sessions this week`;
                  // The row is a plain View with TWO sibling touch targets, not
                  // one Touchable wrapping everything: the 💪 must never nest
                  // inside the row's own press target. Nested pressables are
                  // invalid DOM on web and double-fire on native.
                  return (
                    <View
                      key={m.userId}
                      style={[styles.personRow, idx < ranked.length - 1 && styles.personRowDivider]}
                    >
                      <View style={styles.personTop}>
                        <TouchableOpacity
                          style={styles.personIdentity}
                          activeOpacity={0.7}
                          onPress={openSheet}
                          accessibilityRole="button"
                          accessibilityLabel={rowLabel}
                        >
                          <View style={[styles.storyRing, storyRing(m)]}>
                            <ProfileAvatarDisc
                              avatarId={(m.avatarId ?? 'default') as ProfileAvatarId}
                              size={44}
                              colors={colors}
                              initial={initialOf(m)}
                            />
                          </View>
                          <View style={styles.personNameWrap}>
                            <Text style={styles.personName} numberOfLines={1}>
                              {firstNameOf(m)}
                            </Text>
                            <Text
                              style={[styles.personSub, pr && styles.personSubPr]}
                              numberOfLines={1}
                            >
                              {subtitle}
                            </Text>
                          </View>
                        </TouchableOpacity>
                        {!m.isMe && chipRef
                          ? pumpChip(
                              chipCount,
                              chipActive,
                              () => void pound(m.userId, chipRef),
                              !!pr,
                            )
                          : null}
                      </View>
                      <TouchableOpacity
                        style={styles.personBottom}
                        activeOpacity={0.7}
                        onPress={openSheet}
                        accessibilityRole="button"
                        accessibilityLabel={rowLabel}
                      >
                        <View style={styles.tileRowFlush}>{m.week.map(rowTile)}</View>
                        {/* No plan means no denominator: "3/3" would claim a
                            perfect week against a target that does not exist. */}
                        <Text style={[styles.rowScore, complete && styles.rowScoreGold]}>
                          {!m.hasPlanThisWeek
                            ? m.race.done > 0
                              ? `${m.race.done}`
                              : '—'
                            : `${m.race.done}/${m.race.planned}`}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}

                {/* The empty seat. The ONLY invite affordance on this screen. */}
                {members.length < 10 ? (
                  <TouchableOpacity
                    style={styles.inviteRow}
                    activeOpacity={0.7}
                    onPress={() => {
                      haptics.tap();
                      setSheetOpen(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Invite a friend"
                  >
                    <View style={styles.invitePlus}>
                      <Ionicons name="add" size={20} color={colors.textMuted} />
                    </View>
                    <Text style={styles.inviteLabel}>Invite a friend</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>

              <Text style={styles.footerNote}>
                Resets Monday · measured against each person’s own plan
              </Text>

              {/* A crew of one is usually an accident. Keep the escape in
                  plain sight — the code itself lives in the sheet. */}
              {members.length < 2 ? (
                <TouchableOpacity
                  style={styles.undoRow}
                  onPress={confirmLeave}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Delete this crew"
                >
                  <Text style={styles.undoLabel}>Delete crew</Text>
                </TouchableOpacity>
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
          <Text style={styles.sheetTitle}>{crew?.name || 'Your crew'}</Text>
          <Text style={styles.fieldLabel}>Crew name</Text>
          <TextInput
            style={styles.nameInput}
            value={nameDraft}
            onChangeText={setNameDraft}
            onBlur={() => void commitRename()}
            onSubmitEditing={() => void commitRename()}
            returnKeyType="done"
            placeholder="Name your crew"
            placeholderTextColor={colors.textMuted}
            maxLength={40}
            accessibilityLabel="Crew name"
          />
          {crew ? (
            <>
              {/* Two channels, because there are exactly two situations:
                  someone standing next to you reads the code off the screen,
                  and someone who isn't gets the share sheet. The QR that used
                  to sit here beat neither and cost ~190pt of sheet — and the
                  jimapp://crew/CODE deep link still rides inside the shared
                  message, so no entry path went with it. */}
              <View style={styles.codeCard}>
                <View style={styles.codeTextWrap}>
                  <Text style={styles.codeValue} selectable>
                    {formatShareCode(crew.code)}
                  </Text>
                  <Text style={styles.codeCaption}>
                    {`${members.length} of 10 · anyone with the code can join`}
                  </Text>
                </View>
              </View>
              {iAmLead ? (
                <TouchableOpacity
                  style={styles.linkRow}
                  onPress={confirmRotateCode}
                  disabled={busy}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Mint a new crew code"
                >
                  <Ionicons name="refresh-outline" size={16} color={colors.primary} />
                  <Text style={styles.linkLabel}>Mint a new code</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.shareButton}
                onPress={() => void shareCode(crew.code)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Share crew invite"
              >
                <Ionicons name="share-outline" size={18} color={colors.onPrimary} />
                <Text style={styles.primaryButtonLabel}>Share invite</Text>
              </TouchableOpacity>
            </>
          ) : null}
          <TouchableOpacity
            style={styles.leaveRow}
            onPress={confirmLeave}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={members.length <= 1 ? 'Delete crew' : 'Leave crew'}
          >
            <Ionicons name="exit-outline" size={18} color={colors.error} />
            <Text style={styles.leaveLabel}>
              {members.length <= 1 ? 'Delete crew' : 'Leave crew'}
            </Text>
          </TouchableOpacity>
        </Pressable>
      </SheetModal>

      {/* Creating is a form (Clash-of-Clans grammar): name it into existence.
          Dismissing this sheet creates nothing. */}
      <SheetModal
        visible={createSheetOpen}
        onClose={() => setCreateSheetOpen(false)}
        scrimColor={colors.scrim}
      >
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>Start your crew</Text>
          <Text style={styles.fieldLabel}>Crew name</Text>
          <TextInput
            style={styles.nameInput}
            value={createName}
            onChangeText={setCreateName}
            placeholder="The 5AM Club"
            placeholderTextColor={colors.textMuted}
            maxLength={40}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => void startCrew()}
            accessibilityLabel="New crew name"
          />
          <TouchableOpacity
            style={[
              styles.primaryButton,
              createName.trim().length < 2 && styles.joinButtonDisabled,
            ]}
            onPress={() => void startCrew()}
            disabled={busy || createName.trim().length < 2}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Create crew"
          >
            {busy ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <Text style={styles.primaryButtonLabel}>Create crew</Text>
            )}
          </TouchableOpacity>
        </Pressable>
      </SheetModal>

      {/* The story-tap mini profile. */}
      <SheetModal
        visible={memberSheet !== null}
        onClose={() => setMemberSheetId(null)}
        scrimColor={colors.scrim}
      >
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grabber} />
          {memberSheet ? (
            <>
              <View style={styles.memberSheetHeader}>
                <ProfileAvatarDisc
                  avatarId={(memberSheet.avatarId ?? 'default') as ProfileAvatarId}
                  size={56}
                  colors={colors}
                  initial={initialOf(memberSheet)}
                />
                <View style={styles.memberSheetNameWrap}>
                  <Text style={styles.memberSheetName}>{firstNameOf(memberSheet)}</Text>
                  <Text
                    style={[
                      styles.memberSheetToday,
                      memberSheet.todayState === 'trained' && { color: GOLD },
                      memberSheet.todayState === 'scheduled' && { color: colors.primary },
                    ]}
                  >
                    {memberSheet.todayState === 'trained'
                      ? 'Trained today'
                      : memberSheet.todayState === 'scheduled'
                        ? 'Scheduled today, hasn’t trained yet'
                        : 'Rest day'}
                  </Text>
                </View>
                {/* Same target as the row that opened this sheet — see
                    chipTargetFor. It used to pound `day:latest` while showing
                    `kudosWeek`, so it disagreed with the row on BOTH the
                    number and the event. */}
                {(() => {
                  const t = chipTargetFor(memberSheet);
                  return !memberSheet.isMe && t.ref
                    ? pumpChip(t.count, t.active, () => void pound(memberSheet.userId, t.ref!), !!t.pr)
                    : null;
                })()}
              </View>
              <View style={styles.tileRow}>{memberSheet.week.map(sheetDayTile(memberSheet))}</View>
              {/* Every record this week, not just the newest. The row can
                  only carry one, so the rest used to be invisible AND
                  unpoundable — a session where you PR two lifts lost one. */}
              {recordsOf(memberSheet.userId).length > 0 ? (
                <>
                  <Text style={[styles.fieldLabel, styles.recordsLabel]}>
                    {recordsOf(memberSheet.userId).length > 1
                      ? 'Records this week'
                      : 'Record this week'}
                  </Text>
                  {recordsOf(memberSheet.userId).map((mo) => (
                    <View key={mo.ref} style={styles.recordRow}>
                      <View style={styles.recordTextWrap}>
                        <Text style={styles.recordLift} numberOfLines={1}>
                          {mo.exerciseName ?? 'a lift'}
                        </Text>
                        <Text style={styles.recordSet}>
                          {`${prSetLabel(mo)} · ${recentDayLabel(mo.dateIso, today)}`}
                        </Text>
                      </View>
                      {memberSheet.isMe
                        ? null
                        : pumpChip(mo.kudos, mo.iPounded, () =>
                            void pound(memberSheet.userId, mo.ref),
                          true,
                        )}
                    </View>
                  ))}
                </>
              ) : null}

              <View style={styles.memberSheetStats}>
                {memberSheet.weekStreak > 0 ? (
                  <View style={styles.memberSheetStatRow}>
                    <Ionicons name="flame" size={14} color="#FF9F0A" />
                    <Text style={styles.memberSheetStat}>
                      {`${memberSheet.weekStreak}-week streak`}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.memberSheetStatRow}>
                  <Ionicons name="checkmark-circle-outline" size={14} color={colors.textMuted} />
                  <Text style={styles.memberSheetStat}>
                    {`${memberSheet.race.done} of ${Math.max(memberSheet.race.planned, memberSheet.race.done)} sessions this week`}
                  </Text>
                </View>
                {memberSheet.lastSession ? (
                  <View style={styles.memberSheetStatRow}>
                    <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                    <Text style={styles.memberSheetStat}>
                      {`${memberSheet.lastSession.title} · ${recentDayLabel(memberSheet.lastSession.dateIso, today)}`}
                    </Text>
                  </View>
                ) : null}
              </View>
              {/* Before this, a code in the wrong group chat meant a stranger
                  watched your week forever and leaving your own crew was the
                  only way out. */}
              {iAmLead && !memberSheet.isMe ? (
                <TouchableOpacity
                  style={styles.leaveRow}
                  onPress={() => confirmRemove(memberSheet)}
                  disabled={busy}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${firstNameOf(memberSheet)} from the crew`}
                >
                  <Ionicons name="person-remove-outline" size={18} color={colors.error} />
                  <Text style={styles.leaveLabel}>
                    {`Remove ${firstNameOf(memberSheet)}`}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </>
          ) : null}
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
    titleTap: {
      flex: 1,
      marginRight: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    title: {
      fontSize: text.display,
      fontWeight: weight.heavy,
      letterSpacing: tracking.tight,
      color: c.text,
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
    storyRing: {
      padding: 3,
      borderRadius: radius.pill,
    },
    heroCard: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.lg,
      padding: spacing.lg,
    },
    heroTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    heroLabel: {
      fontSize: text.caption,
      fontWeight: weight.heavy,
      letterSpacing: tracking.widest,
      textTransform: 'uppercase',
      color: c.textMuted,
    },
    heroStreakChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: c.warningSoft,
      borderRadius: radius.pill,
      paddingVertical: 3,
      paddingHorizontal: spacing.sm,
    },
    heroStreakLabel: {
      fontSize: text.caption,
      fontWeight: weight.bold,
      color: c.warning,
    },
    heroTitle: {
      fontSize: text.display,
      fontWeight: weight.heavy,
      letterSpacing: tracking.tight,
      color: c.text,
      marginTop: spacing.sm,
      fontVariant: ['tabular-nums'],
    },
    /** The bar is the point: a number that only ever goes up, all week. */
    heroTrack: {
      height: 10,
      borderRadius: radius.pill,
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
      marginTop: spacing.md,
    },
    heroFill: {
      height: '100%',
      borderRadius: radius.pill,
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
      marginTop: spacing.sm,
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
    /** Ink on a FILLED chip. The gold fill is bright in both themes, so it
     *  always takes dark ink. The primary fill flips (deep #0061C2 on light,
     *  electric #3D8CFF on dark), so it takes `onPrimary` — the token that
     *  exists precisely for a label sitting on a primary fill. One hardcoded
     *  dark ink for both put #1C1C1E on #0061C2 at ~1.9:1 in light mode. */
    pumpCountActive: {
      color: c.onPrimary,
    },
    pumpCountActiveGold: {
      color: '#1C1C1E',
    },
    tileRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: spacing.md,
    },

    /* ---- THE LIST. One card, one row per person, sorted by ratio. ---- */
    listCard: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.lg,
    },
    /** Day letters live here ONCE. Its tile block and every row's tile block
     *  are both `flex: 1` beside a 44pt sibling with the same gap, so the
     *  letters stay in column with the tiles at any width. */
    listHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    listHeadTiles: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    listHeadDay: {
      width: 30,
      marginTop: 0,
      textAlign: 'center',
    },
    personRow: {
      paddingVertical: spacing.md + 2,
    },
    personRowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    personTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    /** The identity half of the row: its own press target, so the 💪 beside
     *  it stays a SIBLING rather than a pressable inside a pressable. */
    personIdentity: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    personNameWrap: {
      flex: 1,
      minWidth: 0,
    },
    personName: {
      fontSize: text.callout,
      fontWeight: weight.bold,
      color: c.text,
    },
    personSub: {
      fontSize: text.footnote,
      fontWeight: weight.medium,
      color: c.textMuted,
      marginTop: 1,
    },
    /** A PR reads amber, but GOLD itself is ~2.1:1 on a white card and cannot
     *  carry 12px text. `warning` is the palette's amber that clears 4.5:1 in
     *  BOTH modes by construction (deep #9C4E00 on light, bright #FFB340 on
     *  the dark card) — a hardcoded light-mode brown would vanish on
     *  Blackout. The chip beside it is the one that gets to be actual gold. */
    personSubPr: {
      color: c.warning,
      fontWeight: weight.semibold,
    },
    personBottom: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginTop: spacing.md,
    },
    tileRowFlush: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    rowScore: {
      width: 44,
      textAlign: 'right',
      fontSize: text.body,
      fontWeight: weight.heavy,
      color: c.textSecondary,
      fontVariant: ['tabular-nums'],
    },
    rowScoreGold: {
      color: GOLD,
    },
    rowScoreSpacer: {
      width: 44,
    },
    inviteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md + 2,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    /** 44 avatar + 3pt ring padding + 3pt ring border = 56, so the empty seat
     *  sits in the same column as every face above it. */
    invitePlus: {
      width: 56,
      height: 56,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.border,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
    },
    inviteLabel: {
      flex: 1,
      minWidth: 0,
      fontSize: text.callout,
      fontWeight: weight.semibold,
      color: c.textSecondary,
    },
    shareButton: {
      height: 48,
      borderRadius: radius.md,
      backgroundColor: c.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
    tileColumn: {
      alignItems: 'center',
    },
    tile: {
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
    /** In the sheet the letter sits ABOVE its tile, so the space underneath
     *  belongs to that day's pound. */
    sheetTileDay: {
      marginTop: 0,
      marginBottom: spacing.xs,
    },
    /** One day's 💪. Small on purpose — seven of them share a row, and the
     *  tile above is the actual tap target (with hitSlop past 44). */
    dayPound: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      minWidth: 26,
      height: 18,
      marginTop: spacing.xs,
      paddingHorizontal: 5,
      borderRadius: radius.pill,
      backgroundColor: c.primarySoft,
    },
    dayPoundActive: {
      backgroundColor: c.primary,
    },
    /** A count with no action behind it: no fill, no button affordance. */
    dayPoundReadOnly: {
      backgroundColor: 'transparent',
    },
    dayPoundGold: {
      backgroundColor: GOLD + '29',
    },
    dayPoundGoldActive: {
      backgroundColor: GOLD,
    },
    dayPoundEmoji: {
      fontSize: 9,
    },
    dayPoundCount: {
      fontSize: 9,
      fontWeight: weight.heavy,
      color: c.textSecondary,
    },
    dayPoundCountActive: {
      color: c.onPrimary,
    },
    /** Gold is bright in both themes, so its ink is dark in both. */
    dayPoundCountGoldActive: {
      color: '#1C1C1E',
    },
    /** Keeps untrained columns the same height as poundable ones, so the
     *  tiles stay on one baseline instead of stepping up and down. */
    dayPoundSpacer: {
      height: 18,
      marginTop: spacing.xs,
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
    noticeCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      backgroundColor: c.primarySoft,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    noticeText: {
      flex: 1,
      minWidth: 0,
      fontSize: text.footnote,
      lineHeight: leading.footnote,
      fontWeight: weight.medium,
      color: c.textSecondary,
    },
    recordsLabel: {
      marginTop: spacing.lg,
    },
    recordRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.sm,
    },
    recordTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    recordLift: {
      fontSize: text.body,
      fontWeight: weight.bold,
      color: c.text,
    },
    recordSet: {
      fontSize: text.footnote,
      fontWeight: weight.medium,
      color: c.warning,
      marginTop: 1,
    },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.md,
      marginTop: spacing.sm,
    },
    linkLabel: {
      fontSize: text.body,
      fontWeight: weight.semibold,
      color: c.primary,
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
    undoRow: {
      alignItems: 'center',
      paddingVertical: spacing.xs,
    },
    undoLabel: {
      fontSize: text.footnote,
      fontWeight: weight.semibold,
      color: c.error,
    },
    fieldLabel: {
      fontSize: text.caption,
      fontWeight: weight.heavy,
      letterSpacing: tracking.widest,
      textTransform: 'uppercase',
      color: c.textMuted,
      marginBottom: spacing.xs,
    },
    nameInput: {
      height: 44,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.background,
      paddingHorizontal: spacing.lg,
      fontSize: text.callout,
      fontWeight: weight.semibold,
      color: c.text,
      marginBottom: spacing.md,
    },
    memberSheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingTop: spacing.lg,
      marginBottom: spacing.md,
    },
    memberSheetNameWrap: {
      flex: 1,
      minWidth: 0,
    },
    memberSheetName: {
      fontSize: text.title,
      fontWeight: weight.heavy,
      letterSpacing: tracking.tight,
      color: c.text,
    },
    memberSheetToday: {
      fontSize: text.footnote,
      fontWeight: weight.semibold,
      color: c.textMuted,
      marginTop: spacing.xxs,
    },
    memberSheetStats: {
      marginTop: spacing.lg,
      gap: spacing.sm,
    },
    memberSheetStatRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    memberSheetStat: {
      fontSize: text.body,
      fontWeight: weight.medium,
      color: c.textSecondary,
    },
  });
}
