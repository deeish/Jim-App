import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../types/navigation';
import type { ExerciseDraft, GoalId, Weekday } from '../types/plan';
import { leading, radius, spacing, text, tracking, type ColorPalette, useTheme, weight } from '../theme';
import { useTabBarInset } from '../navigation/useTabBarInset';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import { formatAtWeightFromLb } from '../lib/weightDisplay';
import { formatEffortTarget, formatRestSecondsForPreview } from '../lib/exercisePrescription';
import { formatExercisePrescriptionCompact } from '../lib/workoutExerciseDisplay';
import { bodyTagChipColors, shortBodyTagLabel } from '../lib/previewExerciseMeta';
import { isLinkableLibraryExerciseId } from '../lib/exerciseNavigation';
import { getExerciseById } from '../services/exerciseService';
import { applyRecordedSwaps, regeneratePipelineDay } from '../lib/planPipeline';
import {
  findSession,
  minutesLabel,
  progressionLine,
  removeDayFromDraft,
  swapExerciseInDraft,
} from '../lib/planPreviewEdits';
import {
  getPreviewSession,
  setPreviewSession,
  subscribePreviewSession,
  type PreviewSession,
} from '../lib/planPreviewSession';
import { getWeekStartMonday, parseLocalYmd } from '../lib/planCalendar';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PlanPreviewDay'>;
  route: RouteProp<RootStackParamList, 'PlanPreviewDay'>;
};

const DAYS: Weekday[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** First sentence of a catalog description, fetched once per id for the "how to" line. */
const howToCache = new Map<string, string>();
async function howToFor(id: string): Promise<string> {
  const cached = howToCache.get(id);
  if (cached != null) return cached;
  try {
    const ex = await getExerciseById(id);
    const src = (ex.description?.trim() || ex.instructions?.[0] || '').trim();
    const first = src.split(/(?<=[.!?])\s+/)[0] ?? '';
    const line = first.length > 140 ? `${first.slice(0, 137).trimEnd()}…` : first;
    howToCache.set(id, line);
    return line;
  } catch {
    howToCache.set(id, '');
    return '';
  }
}

/**
 * One day of the generated preview, pushed from the plan (2026-09-17
 * redesign). Rows first, the rest of the day's prose collapsed under them.
 * Reads and writes the shared preview session, so a swap or a rebuild here
 * lands on the list the user came from, and an exercise opens as a pushed
 * screen with Back returning to this day.
 */
export default function PlanPreviewDayScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const tabBarInset = useTabBarInset();
  const { weightUnit } = useUserPreferences();
  const { weekNumber, day } = route.params;

  const [session, setSession] = useState<PreviewSession>(() => getPreviewSession());
  useEffect(() => subscribePreviewSession(setSession), []);
  const { planDraft, planInputs, draftId, recordedSwaps, regenerating } = session;
  const draftSession = findSession(planDraft, weekNumber, day);
  const rebuildKey = `day-${weekNumber}-${day}`;
  const busy = regenerating === rebuildKey;
  const anyBusy = regenerating != null;
  const goal: GoalId = planInputs?.goal ?? 'strength';

  const dateLabel = useMemo(() => {
    const start = planInputs?.startDateISO;
    const idx = DAYS.indexOf(day as Weekday);
    if (!start || idx < 0) return day;
    const monday = getWeekStartMonday(parseLocalYmd(start));
    const d = new Date(monday);
    d.setDate(monday.getDate() + (weekNumber - 1) * 7 + idx);
    return `${day} ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  }, [planInputs?.startDateISO, day, weekNumber]);

  // "How to" lines, one fetch per linkable row, cached across days.
  const [howTo, setHowTo] = useState<Record<string, string>>({});
  const wanted = useRef(new Set<string>());
  useEffect(() => {
    const ids = (draftSession?.exercises ?? [])
      .map((e) => e.exerciseId)
      .filter((id): id is string => !!id && isLinkableLibraryExerciseId(id) && !wanted.current.has(id));
    for (const id of ids) {
      wanted.current.add(id);
      void howToFor(id).then((line) => {
        if (line) setHowTo((prev) => ({ ...prev, [id]: line }));
      });
    }
  }, [draftSession]);

  const [open, setOpen] = useState<Record<'warmup' | 'why' | 'cooldown', boolean>>({
    warmup: false,
    why: false,
    cooldown: false,
  });
  const [swapping, setSwapping] = useState<string | null>(null);

  const openExercise = useCallback(
    (e: ExerciseDraft) => {
      const id = e.exerciseId?.trim() ?? '';
      if (!isLinkableLibraryExerciseId(id)) {
        Alert.alert('Exercise details', `“${e.name}” isn’t linked to the library yet. Open the Exercises tab and search by name.`);
        return;
      }
      navigation.navigate('ExerciseDetail', { exerciseId: id });
    },
    [navigation],
  );

  const doSwap = useCallback(
    async (exerciseName: string, scope: 'week' | 'all') => {
      const s = getPreviewSession();
      if (!s.planDraft || !s.planInputs) return;
      setSwapping(exerciseName);
      try {
        const out = await swapExerciseInDraft({
          draft: s.planDraft,
          planInputs: s.planInputs,
          weekIndex: weekNumber,
          weekday: day as Weekday,
          exerciseName,
          scope,
        });
        if (!out) {
          Alert.alert('No replacement found', "Couldn't find a different exercise that fits this day. Try again.");
          return;
        }
        setPreviewSession({ planDraft: out.draft, recordedSwaps: [...s.recordedSwaps, out.swap] });
      } catch (e) {
        Alert.alert('Swap failed', (e as Error)?.message ?? "Couldn't swap this exercise. Try again.");
      } finally {
        setSwapping(null);
      }
    },
    [weekNumber, day],
  );

  const askSwap = useCallback(
    (exerciseName: string) => {
      const weeks = getPreviewSession().planDraft?.weeks.length ?? 1;
      if (weeks <= 1) {
        void doSwap(exerciseName, 'week');
        return;
      }
      Alert.alert(`Swap ${exerciseName}`, 'Swap it in this week only, or in every week of the plan?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'This week', onPress: () => void doSwap(exerciseName, 'week') },
        { text: 'Every week', onPress: () => void doSwap(exerciseName, 'all') },
      ]);
    },
    [doSwap],
  );

  const rebuildDay = useCallback(async () => {
    const s = getPreviewSession();
    if (!s.planDraft || !s.planInputs || s.regenerating) return;
    setPreviewSession({ regenerating: rebuildKey });
    try {
      const result = await regeneratePipelineDay(s.planInputs, draftId, s.planDraft, weekNumber, day as Weekday, {
        repairIfInvalid: true,
      });
      if (!result.ok) {
        Alert.alert("Couldn't rebuild this day", result.error || 'Try again.');
        return;
      }
      // The rebuilt day is meant to be fresh; every other day keeps its swaps.
      const kept = s.recordedSwaps.filter((sw) => !(sw.weekday === day && (sw.weeks === 'all' || sw.weeks === weekNumber)));
      const draft = applyRecordedSwaps(result.draft, kept, { skip: { weekIndex: weekNumber, weekday: day as Weekday } });
      setPreviewSession({ planDraft: draft, recordedSwaps: kept });
    } finally {
      setPreviewSession({ regenerating: null });
    }
  }, [draftId, weekNumber, day, rebuildKey]);

  const removeDay = useCallback(() => {
    Alert.alert('Remove this day?', `${day} becomes a rest day in week ${weekNumber}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          const s = getPreviewSession();
          if (!s.planDraft) return;
          setPreviewSession({ planDraft: removeDayFromDraft(s.planDraft, weekNumber, day) });
          navigation.goBack();
        },
      },
    ]);
  }, [day, weekNumber, navigation]);

  if (!planDraft) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.muted}>This preview is no longer open.</Text>
      </View>
    );
  }

  if (!draftSession) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.title}>{day}</Text>
        <Text style={styles.muted}>
          No session on this day yet. A day whose type you swapped is built when you apply the plan; a rest day stays a rest
          day.
        </Text>
      </View>
    );
  }

  const rows = draftSession.exercises.filter((e) => (e.name ?? '').trim());
  const count = rows.length;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: tabBarInset + spacing.xl }} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title}>{draftSession.title}</Text>
            <Text style={styles.subtitle}>
              {dateLabel} · {minutesLabel(draftSession)} · {count} exercise{count === 1 ? '' : 's'}
              {draftSession.isHardDay ? ' · hard day' : ''}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.pill, anyBusy && styles.pillDisabled]}
            onPress={() => void rebuildDay()}
            disabled={anyBusy}
            accessibilityRole="button"
            accessibilityLabel={`Rebuild ${day}`}
          >
            {busy ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.pillText}>Rebuild day</Text>}
          </TouchableOpacity>
        </View>

        <View style={[styles.rows, busy && styles.rowsBusy]} pointerEvents={busy ? 'none' : 'auto'}>
          {rows.map((e, idx) => {
            const tag = shortBodyTagLabel(e.primaryMuscleGroup, e.name);
            const chip = bodyTagChipColors(tag, colors);
            const rx = formatExercisePrescriptionCompact(
              {
                name: e.name,
                sets: e.sets,
                reps: e.repsRaw ?? e.reps,
                prescriptionType: e.prescriptionType,
                primaryMuscleGroup: e.primaryMuscleGroup,
                repsMin: e.repsMin,
                repsMax: e.repsMax,
                durationSeconds: e.durationSeconds,
              },
              goal,
            );
            const how = e.exerciseId ? howTo[e.exerciseId] : undefined;
            const isSwapping = swapping === e.name;
            return (
              <View key={`${e.exerciseId ?? e.name}-${idx}`} style={styles.row}>
                <View style={[styles.chip, { backgroundColor: chip.backgroundColor }]} accessibilityElementsHidden>
                  <Text style={[styles.chipText, { color: chip.color }]} numberOfLines={1}>
                    {tag}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.rowBody}
                  onPress={() => openExercise(e)}
                  activeOpacity={0.65}
                  accessibilityRole="button"
                  accessibilityLabel={`${e.name}, ${rx}. Opens the exercise.`}
                >
                  <Text style={styles.rowName}>{e.name}</Text>
                  {how ? (
                    <Text style={styles.rowHow} numberOfLines={2}>
                      {how}
                    </Text>
                  ) : null}
                  <Text style={styles.rowRx}>
                    {rx}
                    {typeof e.weight === 'number' && e.weight > 0 ? formatAtWeightFromLb(e.weight, weightUnit) : ''}
                    {typeof e.restSeconds === 'number' && e.restSeconds > 0
                      ? ` · ${formatRestSecondsForPreview(e.restSeconds)} rest`
                      : ''}
                    {typeof e.targetRir === 'number' ? ` · ${formatEffortTarget(e.targetRir)}` : ''}
                  </Text>
                  {e.notes?.trim() ? <Text style={styles.rowNote}>{e.notes.trim()}</Text> : null}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.swapBtn}
                  onPress={() => askSwap(e.name)}
                  disabled={!!swapping || anyBusy}
                  accessibilityRole="button"
                  accessibilityLabel={`Swap ${e.name}`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {isSwapping ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="refresh-outline" size={22} color={colors.textSecondary} />
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {(
          [
            ['warmup', 'Warm-up', draftSession.warmup],
            ['why', 'Why this workout', draftSession.whyThisWorkout],
            ['cooldown', 'Cool-down', draftSession.cooldown],
          ] as Array<['warmup' | 'why' | 'cooldown', string, string | undefined]>
        )
          .filter(([, , body]) => !!body?.trim())
          .map(([key, label, body]) => (
            <View key={key} style={styles.acc}>
              <TouchableOpacity
                style={styles.accHead}
                onPress={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
                accessibilityRole="button"
                accessibilityState={{ expanded: open[key] }}
                accessibilityLabel={label}
              >
                <Text style={styles.accTitle}>{label}</Text>
                <Ionicons name={open[key] ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
              </TouchableOpacity>
              {open[key] ? <Text style={styles.accBody}>{body!.trim()}</Text> : null}
            </View>
          ))}

        <Text style={styles.foot}>{progressionLine(planInputs)}</Text>
        {recordedSwaps.some((sw) => sw.weekday === day && (sw.weeks === 'all' || sw.weeks === weekNumber)) ? (
          <Text style={styles.foot}>Your swaps on this day are kept if you rebuild the week.</Text>
        ) : null}

        <TouchableOpacity style={styles.remove} onPress={removeDay} accessibilityRole="button" disabled={anyBusy}>
          <Ionicons name="trash-outline" size={16} color={colors.error} />
          <Text style={styles.removeText}>Remove this day</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function createStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    center: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
    head: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    title: { fontSize: text.title, lineHeight: leading.title, fontWeight: weight.bold, color: c.text },
    subtitle: { marginTop: spacing.xxs, fontSize: text.footnote, lineHeight: leading.footnote, color: c.textSecondary },
    muted: { marginTop: spacing.sm, fontSize: text.body, lineHeight: leading.body, color: c.textSecondary, textAlign: 'center' },
    pill: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.border,
      minWidth: 100,
      alignItems: 'center',
      marginTop: 2,
    },
    pillDisabled: { opacity: 0.5 },
    pillText: { fontSize: text.footnote, fontWeight: weight.semibold, color: c.primary },
    rows: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
    rowsBusy: { opacity: 0.45 },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      paddingVertical: spacing.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    chip: { minWidth: 48, paddingHorizontal: spacing.xs, paddingVertical: 5, borderRadius: radius.sm, alignItems: 'center', marginTop: 2 },
    chipText: { fontSize: 10, fontWeight: weight.bold, letterSpacing: tracking.wider, textTransform: 'uppercase' },
    rowBody: { flex: 1, minWidth: 0 },
    rowName: { fontSize: text.body, lineHeight: leading.body, fontWeight: weight.semibold, color: c.text },
    rowHow: { fontSize: text.caption, lineHeight: leading.caption, color: c.textMuted, marginTop: 1 },
    rowRx: { fontSize: text.footnote, lineHeight: leading.footnote, color: c.textSecondary, marginTop: 2 },
    rowNote: { fontSize: text.footnote, lineHeight: leading.footnote, color: c.text, opacity: 0.85, marginTop: 4 },
    swapBtn: { padding: spacing.xs, marginTop: 2 },
    acc: { marginHorizontal: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
    accHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md },
    accTitle: { fontSize: text.body, fontWeight: weight.semibold, color: c.text },
    accBody: { fontSize: text.body, lineHeight: leading.body, color: c.textSecondary, paddingBottom: spacing.md },
    foot: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, fontSize: text.footnote, lineHeight: leading.footnote, color: c.textMuted },
    remove: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      alignSelf: 'flex-start',
      marginHorizontal: spacing.lg,
      marginTop: spacing.lg,
      paddingVertical: spacing.sm,
    },
    removeText: { fontSize: text.footnote, fontWeight: weight.semibold, color: c.error },
  });
}
