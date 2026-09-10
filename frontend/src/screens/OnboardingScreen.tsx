import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInDown,
  ZoomIn,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ColorPalette } from '../theme/colors';
import { elevation, leading, radius, spacing, text, tracking, useTheme, weight } from '../theme';
import {
  useUserPreferences,
  GOAL_OPTIONS,
  GOAL_LABELS,
  EXPERIENCE_OPTIONS,
  type GoalOption,
  type ExperienceOption,
  type StoredInjuryTagId,
} from '../contexts/UserPreferencesContext';
import { EQUIPMENT_OPTIONS, type EquipmentOption } from '../constants/equipment';
import {
  DAYS_OF_WEEK_PREF,
  SESSION_MINUTES_OPTIONS,
  TRAINING_FREQUENCY_OPTIONS,
  type DayOfWeekPreference,
  type SessionMinutesOption,
  type TrainingFrequencyOption,
} from '../constants/trainingSchedule';
import { PROFILE_INJURY_TAG_OPTIONS, storedInjuryTagsToAvoidList } from '../constants/injuryTags';
import PressableScale from '../components/PressableScale';
import Button from '../components/Button';
import Aurora from '../components/Aurora';
import JimLogo from '../components/JimLogo';
import { haptics } from '../lib/haptics';
import {
  getPlanTemplate,
  listPlanTemplates,
  type PlanTemplateCard,
  type PlanTemplateDetail,
  type TemplateExercise,
} from '../services/templateService';
import { createPlan } from '../services/planService';
import { recommendTemplate, recommendationMatch } from '../lib/templateRecommendation';
import {
  defaultWeekdaysForCount,
  estimateTemplateSessionMinutes,
  firstSessionDateISO,
  materializeTemplatePlan,
  orderWeekdays,
  suggestedTemplateStartDateISO,
  supportedDayRange,
} from '../lib/templatePlan';
import {
  experienceFactLine,
  goalFactLine,
  matchingMomentLines,
  scheduleFitLine,
} from '../lib/onboardingPayoff';
import { formatRestSecondsForPreview } from '../lib/exercisePrescription';
import { parseLocalYmd } from '../lib/planCalendar';
import { refreshLiveCalendarData } from '../lib/planCalendarPrototypeStore';
import type { Weekday } from '../types/plan';
import type { RootNavigatorParamList } from '../types/navigation';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Props = {
  navigation: NativeStackNavigationProp<RootNavigatorParamList, 'Onboarding'>;
};

const GOAL_META: Record<GoalOption, { icon: IconName; desc: string }> = {
  Strength: { icon: 'barbell-outline', desc: 'Build a stronger, more powerful body' },
  Hypertrophy: { icon: 'fitness-outline', desc: 'Grow muscle size and definition' },
  'Fat loss': { icon: 'flame-outline', desc: 'Burn fat and improve body composition' },
  'General fitness': { icon: 'heart-outline', desc: 'Stay healthy and active' },
  Endurance: { icon: 'bicycle-outline', desc: 'Build cardiovascular fitness' },
};

const EXPERIENCE_META: Record<ExperienceOption, { icon: IconName; desc: string }> = {
  Beginner: { icon: 'leaf-outline', desc: 'New to structured training or returning after a break' },
  Intermediate: { icon: 'trending-up-outline', desc: 'Training consistently for 6+ months' },
  Advanced: { icon: 'trophy-outline', desc: 'Years of focused training with a solid foundation' },
};

const INJURY_LABEL: Record<StoredInjuryTagId, string> = PROFILE_INJURY_TAG_OPTIONS.reduce(
  (acc, { id, label }) => ({ ...acc, [id]: label }),
  {} as Record<StoredInjuryTagId, string>,
);

/**
 * Six questions. A question is here only if the plan is wrong without it
 * (goal, experience, schedule, equipment) or changes it when given
 * (work-arounds). Weight moved to the tracker, where it is used; the
 * free-text "other notes" left — it only ever reached the AI prompt.
 */
const STEP_HEADINGS: { title: string; subtitle: string }[] = [
  { title: "What's your main goal?", subtitle: "We'll tailor your plan around this" },
  { title: 'Your experience level?', subtitle: 'Helps us set the right intensity and volume' },
  { title: 'How often, and how long?', subtitle: "We'll shape your split and each session around this" },
  { title: 'What equipment do you have?', subtitle: 'Select all that apply — change it anytime in Profile' },
  {
    title: 'Anything to work around?',
    subtitle: "Optional. We'll swap exercises that load these joints. Not medical advice.",
  },
  {
    title: 'Looks good?',
    // Profile edits goal, experience and equipment today; the schedule and
    // work-arounds have no editor yet, so the line must not promise one.
    subtitle: 'Review your setup. Goal, experience and equipment can be changed later in Profile.',
  },
];

const STEP_GOAL = 0;
const STEP_EXPERIENCE = 1;
const STEP_SCHEDULE = 2;
const STEP_EQUIPMENT = 3;
const STEP_WORKAROUNDS = 4;
const STEP_REVIEW = 5;
const TOTAL_STEPS = STEP_HEADINGS.length;
const LAST_STEP = TOTAL_STEPS - 1;

/** The matching moment shows its three lines for at least this long, so the
 *  work is readable and an instant catalog answer does not flash it. */
const MATCHING_MIN_MS = 1800;

const GYM_PRESET: EquipmentOption[] = [...EQUIPMENT_OPTIONS];
const HOME_PRESET: EquipmentOption[] = ['Bodyweight', 'Dumbbell', 'Pull-up Bar', 'Resistance Band'];

const MINUTES_LABEL: Record<SessionMinutesOption, string> = {
  30: '30 min',
  45: '45 min',
  60: '60 min',
  75: '75+',
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Week-1 prescription of a template row, the way the program screen prints it. */
function repDisplay(ex: TemplateExercise): string {
  const week = ex.weekly[0];
  if (!week) return '';
  if (ex.prescriptionType === 'time') {
    return `${week.sets} × ${formatRestSecondsForPreview(week.durationSeconds ?? 0)}`;
  }
  const lo = week.repsMin ?? 0;
  const hi = week.repsMax ?? lo;
  return `${week.sets} × ${hi > lo ? `${lo}–${hi}` : `${lo}`}`;
}

/** "Today", "Tomorrow", or "Thursday, Sep 11": the day the first session lands. */
function firstSessionLabel(iso: string, todayIso: string): string {
  if (iso === todayIso) return 'Today';
  const d = parseLocalYmd(iso);
  const tomorrow = parseLocalYmd(todayIso);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.getTime() === tomorrow.getTime()) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function OnboardingScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const {
    setGoal,
    setSecondaryGoal,
    setExperience,
    setEquipment,
    setTrainingFrequency,
    setSessionMinutes: persistSessionMinutes,
    setTrainingDaysFlexible,
    setPreferredTrainingDays,
    setInjuryTagIds,
    setProfileDisplayName,
    completeOnboarding,
  } = useUserPreferences();

  const [step, setStep] = useState(0);
  const [showWelcome, setShowWelcome] = useState(true);
  // After Finish: the matching moment (the work that was done, readable),
  // then the payoff. Answers are persisted and onboarding is marked complete
  // on entry, so every exit is a plain navigation and a killed app relaunches
  // into Main, not back into the questions.
  const [showMatching, setShowMatching] = useState(false);
  const [showPayoff, setShowPayoff] = useState(false);
  const matchingStartedAt = useRef(0);

  const [templates, setTemplates] = useState<PlanTemplateCard[] | null>(null);
  // A failed catalog fetch keeps `templates` null (so no line pretends to
  // know how many programs fit) and lets the matching moment end.
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [detail, setDetail] = useState<PlanTemplateDetail | null>(null);
  // 'loading' holds the matching moment open; 'failed' lets it end with the
  // card in summary form (Start becomes View program).
  const [detailStatus, setDetailStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const [applying, setApplying] = useState(false);

  const [selectedGoal, setSelectedGoal] = useState<GoalOption | null>(null);
  const [selectedSecondaryGoal, setSelectedSecondaryGoal] = useState<GoalOption | null>(null);
  // The second focus is an explicit mode the user enters from a link, never
  // a side effect of tapping a second card (that used to be how you changed
  // your mind, and you got two goals instead).
  const [pickingSecondary, setPickingSecondary] = useState(false);
  const [selectedExperience, setSelectedExperience] = useState<ExperienceOption | null>(null);
  const [experienceNotSure, setExperienceNotSure] = useState(false);
  const [selectedFrequency, setSelectedFrequency] = useState<TrainingFrequencyOption>(4);
  const [sessionMinutes, setSessionMinutes] = useState<SessionMinutesOption>(45);
  const [flexibleDays, setFlexibleDays] = useState(true);
  const [selectedWeekdays, setSelectedWeekdays] = useState<DayOfWeekPreference[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentOption[]>([]);
  const [injuryTags, setInjuryTags] = useState<StoredInjuryTagId[]>([]);
  const [displayName, setDisplayName] = useState('');

  const progress = useSharedValue((1) / TOTAL_STEPS);
  useEffect(() => {
    progress.value = withTiming((step + 1) / TOTAL_STEPS, { duration: 300 });
  }, [step, progress]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  // The catalog is fetched once, up front: the schedule step's fit line and
  // the matching moment both count programs against the answers. Failure
  // degrades to the browse-programs card — it must never block finishing.
  useEffect(() => {
    let active = true;
    listPlanTemplates()
      .then((list) => {
        if (active) setTemplates(list);
      })
      .catch(() => {
        if (active) setCatalogFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const answers = {
    goal: selectedGoal,
    daysPerWeek: selectedFrequency,
    experience: selectedExperience,
    sessionMinutes,
  };
  const recommended = templates && templates.length ? recommendTemplate(templates, answers) : null;
  const match = recommended ? recommendationMatch(recommended, answers) : null;

  // The recommended program's detail (its sessions) backs the payoff card's
  // first-session list and the one-tap apply. Fetched once the answers are
  // final (Finish tapped), under the matching moment, so the card is ready
  // when it ends. A failure degrades the card to its summary form.
  const finished = showMatching || showPayoff;
  useEffect(() => {
    if (!finished || !recommended) return;
    let active = true;
    setDetail(null);
    setDetailStatus('loading');
    getPlanTemplate(recommended.id)
      .then((d) => {
        if (!active) return;
        setDetail(d);
        setDetailStatus('ready');
      })
      .catch(() => {
        if (active) setDetailStatus('failed');
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, recommended?.id]);

  // The matching moment ends when the catalog and the program have answered
  // and the minimum display time has passed — whichever is later. An empty
  // catalog has nothing to show, so it goes straight to the payoff. A tap
  // skips the wait at any point.
  const detailPending = recommended !== null && (detailStatus === 'idle' || detailStatus === 'loading');
  useEffect(() => {
    if (!showMatching || detailPending) return;
    if (templates === null && !catalogFailed) return;
    const remaining =
      !templates || templates.length === 0
        ? 0
        : Math.max(0, MATCHING_MIN_MS - (Date.now() - matchingStartedAt.current));
    const t = setTimeout(() => {
      setShowMatching(false);
      setShowPayoff(true);
    }, remaining);
    return () => clearTimeout(t);
  }, [showMatching, templates, catalogFailed, detailPending]);

  const scheduleOk = flexibleDays || selectedWeekdays.length === selectedFrequency;
  const canProceed =
    step === STEP_GOAL
      ? selectedGoal !== null
      : step === STEP_EXPERIENCE
        ? selectedExperience !== null
        : step === STEP_SCHEDULE
          ? scheduleOk
          : step === STEP_EQUIPMENT
            ? selectedEquipment.length > 0
            : true;

  function handleSelectGoal(g: GoalOption) {
    haptics.select();
    if (pickingSecondary) {
      if (g === selectedGoal) return;
      setSelectedSecondaryGoal(selectedSecondaryGoal === g ? null : g);
      setPickingSecondary(false);
      return;
    }
    if (selectedGoal === g) return;
    setSelectedGoal(g);
    if (selectedSecondaryGoal === g) setSelectedSecondaryGoal(null);
  }

  function selectExperience(e: ExperienceOption | 'not-sure') {
    haptics.select();
    if (e === 'not-sure') {
      setSelectedExperience('Beginner');
      setExperienceNotSure(true);
      return;
    }
    setSelectedExperience(e);
    setExperienceNotSure(false);
  }

  function toggleEquipment(item: EquipmentOption) {
    haptics.select();
    setSelectedEquipment((prev) =>
      prev.includes(item) ? prev.filter((e) => e !== item) : [...prev, item],
    );
  }

  function isPresetActive(preset: EquipmentOption[]) {
    return preset.length === selectedEquipment.length && preset.every((i) => selectedEquipment.includes(i));
  }

  function selectFrequency(n: TrainingFrequencyOption) {
    haptics.select();
    setSelectedFrequency(n);
    setSelectedWeekdays((prev) => (prev.length > n ? prev.slice(0, n) : prev));
  }

  function togglePreferredDay(day: DayOfWeekPreference) {
    haptics.select();
    setSelectedWeekdays((prev) => {
      if (prev.includes(day)) return prev.filter((d) => d !== day);
      if (prev.length >= selectedFrequency) return prev;
      return [...prev, day].sort(
        (a, b) => DAYS_OF_WEEK_PREF.indexOf(a) - DAYS_OF_WEEK_PREF.indexOf(b),
      );
    });
  }

  function toggleInjuryTag(id: StoredInjuryTagId) {
    haptics.select();
    setInjuryTags((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleNext() {
    if (!canProceed) return;
    if (step < LAST_STEP) {
      haptics.step();
      setStep((s) => s + 1);
      return;
    }
    haptics.success();
    if (selectedGoal) setGoal(selectedGoal);
    setSecondaryGoal(selectedSecondaryGoal);
    if (selectedExperience) setExperience(selectedExperience);
    setTrainingFrequency(selectedFrequency);
    persistSessionMinutes(sessionMinutes);
    setTrainingDaysFlexible(flexibleDays);
    setPreferredTrainingDays(flexibleDays ? [] : selectedWeekdays);
    setEquipment(selectedEquipment);
    setInjuryTagIds(injuryTags);
    if (displayName.trim()) setProfileDisplayName(displayName.trim());
    completeOnboarding();
    matchingStartedAt.current = Date.now();
    setShowMatching(true);
  }

  function skipMatching() {
    if (!showMatching) return;
    setShowMatching(false);
    setShowPayoff(true);
  }

  /** The schedule the recommended program is applied with: the answers,
   *  clamped into the program's supported range. */
  function scheduleFor(program: Pick<PlanTemplateDetail, 'daysPerWeek' | 'supportedDaysPerWeek' | 'defaultWeekdays'>) {
    const { min, max } = supportedDayRange(program);
    const count = clamp(selectedFrequency, min, max);
    const weekdays: Weekday[] =
      !flexibleDays && selectedWeekdays.length === count
        ? orderWeekdays(selectedWeekdays as Weekday[])
        : defaultWeekdaysForCount(program, count);
    return { count, weekdays };
  }

  async function applyRecommended() {
    if (!detail || applying) return;
    haptics.select();
    setApplying(true);
    try {
      const { weekdays } = scheduleFor(detail);
      await createPlan(
        materializeTemplatePlan(detail, {
          weekdays,
          startDateISO: suggestedTemplateStartDateISO(),
          limitations: storedInjuryTagsToAvoidList(injuryTags),
          equipment: selectedEquipment,
        }),
      );
      haptics.success();
      refreshLiveCalendarData(true);
      navigation.replace('Main', {
        screen: 'Calendar',
        params: { screen: 'PlanList' },
      });
    } catch (e) {
      console.warn('[Onboarding] apply failed:', e);
      setApplying(false);
      Alert.alert(
        'Could not save the program',
        'Check your connection and try again, or open the program and start it from there.',
      );
    }
  }

  function openRecommendedTemplate(t: PlanTemplateCard) {
    haptics.select();
    navigation.replace('Main', {
      screen: 'Calendar',
      params: {
        screen: 'TemplateDetail',
        params: { templateId: t.id, templateName: t.name },
        // Keep PlanList beneath so the native header draws its back button.
        initial: false,
      },
    });
  }

  function openTemplatesList() {
    haptics.select();
    navigation.replace('Main', {
      screen: 'Calendar',
      params: { screen: 'Templates', initial: false },
    });
  }

  function openAIGenerate() {
    haptics.select();
    navigation.replace('Main', {
      screen: 'Calendar',
      params: { screen: 'GeneratePlan' },
    });
  }

  function exploreApp() {
    haptics.select();
    navigation.replace('Main', { screen: 'Home' });
  }

  const heading = STEP_HEADINGS[step];
  const equipmentValue =
    selectedEquipment.length === 0
      ? 'None selected'
      : selectedEquipment.length === EQUIPMENT_OPTIONS.length
        ? 'Full gym'
        : selectedEquipment.join(' · ');
  const scheduleValue = flexibleDays
    ? `${selectedFrequency} days · ${MINUTES_LABEL[sessionMinutes]} · flexible`
    : `${selectedFrequency} days · ${MINUTES_LABEL[sessionMinutes]} · ${selectedWeekdays.map((d) => d.slice(0, 3)).join(', ')}`;
  const injuryValue =
    injuryTags.length === 0 ? 'Nothing to note' : injuryTags.map((id) => INJURY_LABEL[id]).join(', ');
  const workaroundLabels = injuryTags.map((id) => INJURY_LABEL[id].toLowerCase()).join(', ');
  const experienceValue = experienceNotSure
    ? 'Beginner · starting easy'
    : (selectedExperience ?? '—');

  const goalLine = goalFactLine(selectedGoal);
  const experienceLine = experienceFactLine(
    experienceNotSure ? 'not-sure' : selectedExperience,
  );
  const scheduleLine = scheduleFitLine(templates, {
    daysPerWeek: selectedFrequency,
    sessionMinutes,
  });

  // The work-arounds step is optional: with nothing entered the button says
  // so, instead of "Continue" under a subtitle that says optional.
  const skippable = step === STEP_WORKAROUNDS && injuryTags.length === 0;
  const nextLabel = step === LAST_STEP ? 'Finish' : skippable ? 'Skip' : 'Continue';

  // Payoff card facts: the program's first session on the day it will land.
  const todayIso = suggestedTemplateStartDateISO();
  const payoffSchedule = detail ? scheduleFor(detail) : recommended ? scheduleFor(recommended) : null;
  const firstSessionIso =
    payoffSchedule ? firstSessionDateISO(todayIso, payoffSchedule.weekdays) : null;
  const firstSession = detail?.sessions[0] ?? null;
  const firstSessionMinutes = firstSession ? estimateTemplateSessionMinutes(firstSession, 0) : null;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[`${colors.primary}22`, colors.background] as const}
        style={StyleSheet.absoluteFill}
      />
      {/* Full-bleed backdrop behind the safe-area-inset content, so the welcome
          aurora reaches the very top/bottom edges instead of being boxed into the
          inset region. */}
      {showWelcome || showMatching || showPayoff ? <Aurora colors={colors} /> : null}
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {showWelcome ? (
          <View style={styles.welcomeContent}>
            <View style={styles.welcomeTop}>
              <Rise delay={60} style={styles.brandWrap}>
                <JimLogo interactive />
              </Rise>
              <Rise delay={140} style={styles.block}>
                <Text style={styles.welcomeTitle}>
                  Let's build <Text style={styles.welcomeTitleAccent}>your plan</Text>
                </Text>
              </Rise>
              <Rise delay={200} style={styles.block}>
                <Text style={styles.welcomeSubtitle}>
                  A few quick questions and we'll tailor a program to your goals, schedule, and
                  equipment.
                </Text>
              </Rise>
              <View style={styles.featureList}>
                <Rise delay={280}>
                  <FeatureRow colors={colors} icon="barbell-outline" text="Matched to your goal" />
                </Rise>
                <Rise delay={350}>
                  <FeatureRow
                    colors={colors}
                    icon="calendar-outline"
                    text="Fits your weekly schedule"
                  />
                </Rise>
                <Rise delay={420}>
                  <FeatureRow
                    colors={colors}
                    icon="construct-outline"
                    text="Uses only your equipment"
                  />
                </Rise>
              </View>
            </View>
            <Rise delay={520} style={styles.welcomeFooter}>
              <Text style={styles.welcomeCaption}>Takes about a minute</Text>
              <Button
                title="Get started"
                onPress={() => {
                  haptics.step();
                  setShowWelcome(false);
                }}
              />
            </Rise>
          </View>
        ) : showMatching ? (
          // The matching moment: the work that was done, printed as it was
          // done. Real counts, never a spinner; a tap skips it.
          <Pressable
            style={styles.matchingContent}
            onPress={skipMatching}
            accessibilityRole="button"
            accessibilityLabel="Skip to your program"
          >
            <View style={styles.matchingTop}>
              <Rise delay={40} style={styles.block}>
                <View style={styles.matchingBadge}>
                  <Ionicons name="sparkles-outline" size={26} color={colors.primary} />
                </View>
                <Text style={styles.payoffTitle}>Matching you to a program</Text>
              </Rise>
              <Rise delay={160} style={styles.block}>
                <View style={styles.matchingCard}>
                  {templates === null || templates.length === 0 ? (
                    <View style={styles.matchingLine}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={styles.matchingLineText}>Checking the coach-built programs…</Text>
                    </View>
                  ) : (
                    matchingMomentLines(templates, answers, recommended).map((line, i) => (
                      <Rise key={line} delay={220 + i * 260} style={styles.matchingLine}>
                        <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                        <Text style={styles.matchingLineText}>{line}</Text>
                      </Rise>
                    ))
                  )}
                </View>
              </Rise>
            </View>
            <Text style={styles.matchingSkip}>Tap to skip</Text>
          </Pressable>
        ) : showPayoff ? (
          <ScrollView
            contentContainerStyle={styles.payoffScroll}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.payoffTop}>
              <Rise delay={60} style={styles.block}>
                <Text style={styles.payoffTitle}>
                  {recommended ? 'Your first week is ready' : "Here's how to start"}
                </Text>
                <Text style={styles.payoffSubtitle}>
                  {recommended
                    ? 'Matched to your goal and schedule.'
                    : 'Coach-built programs, or a custom plan.'}
                </Text>
              </Rise>
              <Rise delay={180} style={styles.block}>
                {templates === null && !catalogFailed ? (
                  <View style={[styles.payoffCard, styles.payoffCardLoading]}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                ) : recommended ? (
                  <View style={styles.payoffCard}>
                    <Text style={styles.payoffEyebrow}>
                      {match === 'exact' ? 'Recommended for you' : 'Closest program to your goal'}
                    </Text>
                    <Text style={styles.payoffCardTitle}>{recommended.name}</Text>
                    <Text style={styles.payoffCardTagline}>{recommended.tagline}</Text>
                    <Text style={styles.payoffCardMeta}>
                      {recommended.weeksCount} weeks · {payoffSchedule?.count ?? recommended.daysPerWeek}{' '}
                      days/week
                      {payoffSchedule && payoffSchedule.count !== selectedFrequency
                        ? payoffSchedule.count < selectedFrequency
                          ? ' (the most it supports)'
                          : ' (the fewest it supports)'
                        : ''}{' '}
                      ·{' '}
                      {firstSessionMinutes != null
                        ? `about ${firstSessionMinutes} min`
                        : `${recommended.sessionMinutes.min}–${recommended.sessionMinutes.max} min`}
                    </Text>

                    {firstSession && firstSessionIso ? (
                      <>
                        <View style={styles.payoffSessionHeader}>
                          <Text style={styles.payoffSessionLabel}>
                            First session · {firstSessionLabel(firstSessionIso, todayIso)}
                          </Text>
                          <Text style={styles.payoffSessionTitle} numberOfLines={1}>
                            {firstSession.title}
                          </Text>
                        </View>
                        {firstSession.exercises.slice(0, 5).map((ex) => (
                          <View key={ex.exerciseId} style={styles.payoffExerciseRow}>
                            <Text style={styles.payoffExerciseName} numberOfLines={1}>
                              {ex.name}
                            </Text>
                            <Text style={styles.payoffExerciseRx}>{repDisplay(ex)}</Text>
                          </View>
                        ))}
                        {firstSession.exercises.length > 5 ? (
                          <Text style={styles.payoffMore}>
                            + {firstSession.exercises.length - 5} more
                          </Text>
                        ) : null}
                        {workaroundLabels ? (
                          <Text style={styles.payoffMore}>
                            Exercises that load your {workaroundLabels} will be swapped for
                            alternatives.
                          </Text>
                        ) : null}
                      </>
                    ) : null}

                    <Button
                      title={applying ? 'Saving…' : detail ? 'Start this program' : 'View program'}
                      onPress={() => {
                        if (detail) void applyRecommended();
                        else openRecommendedTemplate(recommended);
                      }}
                      disabled={applying}
                      style={styles.payoffCta}
                    />
                    {detail ? (
                      <PressableScale
                        onPress={() => openRecommendedTemplate(recommended)}
                        style={styles.payoffCardLink}
                      >
                        <Text style={styles.payoffCardLinkText}>View the full program</Text>
                      </PressableScale>
                    ) : null}
                  </View>
                ) : (
                  <View style={styles.payoffCard}>
                    <Text style={styles.payoffEyebrow}>Coach-built programs</Text>
                    <Text style={styles.payoffCardTagline}>
                      Eight-week plans with every set and rep already decided.
                    </Text>
                    <Button
                      title="Browse programs"
                      onPress={openTemplatesList}
                      style={styles.payoffCta}
                    />
                  </View>
                )}
              </Rise>
            </View>
            <Rise delay={300} style={styles.payoffFooter}>
              <PressableScale onPress={openAIGenerate} style={styles.payoffSecondaryBtn}>
                <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
                <Text style={styles.payoffSecondaryText}>Build a custom plan with AI</Text>
              </PressableScale>
              <PressableScale onPress={exploreApp} style={styles.payoffLink}>
                <Text style={styles.payoffLinkText}>I'll explore the app first</Text>
              </PressableScale>
            </Rise>
          </ScrollView>
        ) : (
          <>
        <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, fillStyle]} />
        </View>
        <Text style={styles.stepCaption}>
          Step {step + 1} of {TOTAL_STEPS}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View key={step} entering={FadeInDown.duration(260)}>
          <Text style={styles.title}>{heading.title}</Text>
          <Text style={styles.subtitle}>{heading.subtitle}</Text>

          {step === STEP_GOAL && (
            <>
              {GOAL_OPTIONS.map((g) => (
                <SelectableCard
                  key={g}
                  colors={colors}
                  icon={GOAL_META[g].icon}
                  selected={selectedGoal === g || selectedSecondaryGoal === g}
                  badge={
                    selectedGoal === g
                      ? selectedSecondaryGoal
                        ? 'Main goal'
                        : undefined
                      : selectedSecondaryGoal === g
                        ? '2nd focus'
                        : undefined
                  }
                  title={GOAL_LABELS[g]}
                  subtitle={GOAL_META[g].desc}
                  onPress={() => handleSelectGoal(g)}
                />
              ))}
              {goalLine ? <FactLine colors={colors} text={goalLine} /> : null}
              {selectedGoal && pickingSecondary ? (
                <View style={styles.inlineRow}>
                  <Text style={styles.helperTextInline}>Tap a second goal to add it as a focus.</Text>
                  <PressableScale
                    onPress={() => {
                      haptics.select();
                      setPickingSecondary(false);
                    }}
                    style={styles.inlineLink}
                  >
                    <Text style={styles.inlineLinkText}>Cancel</Text>
                  </PressableScale>
                </View>
              ) : selectedGoal && selectedSecondaryGoal ? (
                <View style={styles.inlineRow}>
                  <Text style={styles.helperTextInline}>
                    {GOAL_LABELS[selectedSecondaryGoal]} is your second focus.
                  </Text>
                  <PressableScale
                    onPress={() => {
                      haptics.select();
                      setSelectedSecondaryGoal(null);
                    }}
                    style={styles.inlineLink}
                  >
                    <Text style={styles.inlineLinkText}>Remove</Text>
                  </PressableScale>
                </View>
              ) : selectedGoal ? (
                <PressableScale
                  onPress={() => {
                    haptics.select();
                    setPickingSecondary(true);
                  }}
                  style={styles.inlineLink}
                >
                  <Text style={styles.inlineLinkText}>Add a second focus</Text>
                </PressableScale>
              ) : null}
            </>
          )}

          {step === STEP_EXPERIENCE && (
            <>
              {EXPERIENCE_OPTIONS.map((e) => (
                <SelectableCard
                  key={e}
                  colors={colors}
                  icon={EXPERIENCE_META[e].icon}
                  selected={selectedExperience === e && !experienceNotSure}
                  title={e}
                  subtitle={EXPERIENCE_META[e].desc}
                  onPress={() => selectExperience(e)}
                />
              ))}
              <SelectableCard
                colors={colors}
                icon="help-circle-outline"
                selected={experienceNotSure}
                title="Not sure"
                subtitle="Start easy — change it in Profile any time"
                onPress={() => selectExperience('not-sure')}
              />
              {experienceLine ? <FactLine colors={colors} text={experienceLine} /> : null}
            </>
          )}

          {step === STEP_SCHEDULE && (
            <>
              <Text style={styles.sectionLabel}>Days per week</Text>
              <View style={styles.segmentRow}>
                {TRAINING_FREQUENCY_OPTIONS.map((n) => {
                  const active = selectedFrequency === n;
                  return (
                    <PressableScale
                      key={n}
                      style={[styles.segment, active ? styles.segmentActive : null]}
                      onPress={() => selectFrequency(n)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`${n} days per week`}
                    >
                      <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>
                        {n}
                      </Text>
                    </PressableScale>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>Time per session</Text>
              <View style={styles.segmentRow}>
                {SESSION_MINUTES_OPTIONS.map((m) => {
                  const active = sessionMinutes === m;
                  return (
                    <PressableScale
                      key={m}
                      style={[styles.segment, active ? styles.segmentActive : null]}
                      onPress={() => {
                        haptics.select();
                        setSessionMinutes(m);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`${MINUTES_LABEL[m]} per session`}
                    >
                      <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>
                        {MINUTES_LABEL[m]}
                      </Text>
                    </PressableScale>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>Preferred days</Text>
              <View style={styles.segmentRow}>
                {(
                  [
                    { label: 'Flexible', value: true },
                    { label: 'Pick days', value: false },
                  ] as const
                ).map(({ label, value }) => {
                  const active = flexibleDays === value;
                  return (
                    <PressableScale
                      key={label}
                      style={[styles.segment, active ? styles.segmentActive : null]}
                      onPress={() => {
                        haptics.select();
                        setFlexibleDays(value);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>
                        {label}
                      </Text>
                    </PressableScale>
                  );
                })}
              </View>

              {flexibleDays ? (
                <Text style={styles.helperText}>We'll spread your sessions evenly across the week.</Text>
              ) : (
                <>
                  <Text style={styles.helperText}>
                    Tap {selectedFrequency} days ({selectedWeekdays.length}/{selectedFrequency} chosen)
                  </Text>
                  <View style={styles.chipGrid}>
                    {DAYS_OF_WEEK_PREF.map((day) => {
                      const sel = selectedWeekdays.includes(day);
                      const atCap = !sel && selectedWeekdays.length >= selectedFrequency;
                      return (
                        <Chip
                          key={day}
                          colors={colors}
                          selected={sel}
                          dimmed={atCap}
                          label={day.slice(0, 3)}
                          onPress={() => togglePreferredDay(day)}
                        />
                      );
                    })}
                  </View>
                </>
              )}
              {scheduleLine ? <FactLine colors={colors} text={scheduleLine} /> : null}
            </>
          )}

          {step === STEP_EQUIPMENT && (
            <>
              <View style={styles.presetRow}>
                {(
                  [
                    { label: 'Gym', sub: 'Full equipment', icon: 'business-outline' as IconName, preset: GYM_PRESET },
                    { label: 'Home', sub: 'Minimal setup', icon: 'home-outline' as IconName, preset: HOME_PRESET },
                  ] as const
                ).map(({ label, sub, icon, preset }) => {
                  const active = isPresetActive(preset);
                  return (
                    <PressableScale
                      key={label}
                      style={[
                        styles.presetCard,
                        styles.cardShadow,
                        {
                          backgroundColor: active ? colors.primarySoft : colors.surface,
                          borderColor: active ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => {
                        haptics.select();
                        setSelectedEquipment([...preset]);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Ionicons
                        name={icon}
                        size={24}
                        color={active ? colors.primary : colors.textSecondary}
                      />
                      <Text style={[styles.presetLabel, { color: colors.text }]}>{label}</Text>
                      <Text style={[styles.presetSub, { color: colors.textMuted }]}>{sub}</Text>
                    </PressableScale>
                  );
                })}
              </View>
              <Text style={styles.sectionLabel}>Or pick individually</Text>
              <View style={styles.chipGrid}>
                {EQUIPMENT_OPTIONS.map((eq) => (
                  <Chip
                    key={eq}
                    colors={colors}
                    selected={selectedEquipment.includes(eq)}
                    label={eq}
                    onPress={() => toggleEquipment(eq)}
                  />
                ))}
              </View>
            </>
          )}

          {step === STEP_WORKAROUNDS && (
            <View style={styles.chipGrid}>
              {PROFILE_INJURY_TAG_OPTIONS.map(({ id, label }) => (
                <Chip
                  key={id}
                  colors={colors}
                  selected={injuryTags.includes(id)}
                  label={label}
                  onPress={() => toggleInjuryTag(id)}
                />
              ))}
            </View>
          )}

          {step === STEP_REVIEW && (
            <>
              <Text style={styles.sectionLabel}>What should we call you?</Text>
              <TextInput
                style={styles.nameInput}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="First name (optional)"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
                returnKeyType="done"
                maxLength={40}
              />
              <View style={styles.summaryWrap}>
              <SummaryRow
                colors={colors}
                icon={selectedGoal ? GOAL_META[selectedGoal].icon : 'help-outline'}
                label="Goal"
                value={
                  selectedGoal
                    ? `${GOAL_LABELS[selectedGoal]}${
                        selectedSecondaryGoal ? ` + ${GOAL_LABELS[selectedSecondaryGoal]}` : ''
                      }`
                    : '—'
                }
              />
              <SummaryRow
                colors={colors}
                icon={selectedExperience ? EXPERIENCE_META[selectedExperience].icon : 'help-outline'}
                label="Experience"
                value={experienceValue}
              />
              <SummaryRow colors={colors} icon="calendar-outline" label="Schedule" value={scheduleValue} />
              <SummaryRow colors={colors} icon="barbell-outline" label="Equipment" value={equipmentValue} />
              <SummaryRow colors={colors} icon="medkit-outline" label="Working around" value={injuryValue} />
              </View>
            </>
          )}
        </Animated.View>
      </ScrollView>

      <View style={styles.footer}>
        <PressableScale
          onPress={() => (step > 0 ? setStep((s) => s - 1) : setShowWelcome(true))}
          style={styles.backBtn}
        >
          <Text style={styles.backText}>Back</Text>
        </PressableScale>
        <PressableScale
          onPress={handleNext}
          disabled={!canProceed}
          style={[
            styles.nextBtn,
            skippable && styles.nextBtnSecondary,
            !canProceed && styles.nextBtnDisabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel={nextLabel}
        >
          <Text
            style={[
              styles.nextBtnText,
              skippable && styles.nextBtnTextSecondary,
              !canProceed && styles.nextBtnTextDisabled,
            ]}
          >
            {nextLabel}
          </Text>
        </PressableScale>
      </View>
          </>
        )}
      </SafeAreaView>
    </View>
  );
}

/**
 * Mount entrance for the welcome screen. Uses a plain style animation
 * (opacity + translateY) rather than a layout `entering` animation, which on
 * react-native-web breaks flex centering when the subtree re-mounts (e.g. when
 * navigating back to the welcome step).
 */
function Rise({
  delay = 0,
  style,
  children,
}: {
  delay?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration: 420, easing: Easing.out(Easing.ease) }));
  }, [p, delay]);
  const aStyle = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * 16 }],
  }));
  return <Animated.View style={[style, aStyle]}>{children}</Animated.View>;
}

/** One true sentence the answer just earned — computed or factual, never copy. */
function FactLine({ colors, text: line }: { colors: ColorPalette; text: string }) {
  const styles = makeStyles(colors);
  return (
    <View style={styles.factLine}>
      <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
      <Text style={styles.factLineText}>{line}</Text>
    </View>
  );
}

function SelectableCard({
  colors,
  icon,
  selected,
  badge,
  title,
  subtitle,
  onPress,
}: {
  colors: ColorPalette;
  icon: IconName;
  selected: boolean;
  /** Small pill shown instead of the checkmark (e.g. "Main goal"). */
  badge?: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  const styles = makeStyles(colors);
  return (
    <PressableScale
      style={[
        styles.card,
        styles.cardShadow,
        {
          backgroundColor: selected ? colors.primarySoft : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
    >
      <View
        style={[
          styles.iconTile,
          { backgroundColor: selected ? colors.primary : colors.primarySoft },
        ]}
      >
        <Ionicons name={icon} size={22} color={selected ? colors.onPrimary : colors.primary} />
      </View>
      <View style={styles.cardTextWrap}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>{subtitle}</Text>
        ) : null}
      </View>
      {selected && badge ? (
        <Animated.View
          entering={ZoomIn.duration(180)}
          style={[styles.badgePill, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.badgePillText, { color: colors.onPrimary }]}>{badge}</Text>
        </Animated.View>
      ) : selected ? (
        <Animated.View
          entering={ZoomIn.duration(180)}
          style={[styles.check, { backgroundColor: colors.primary, borderColor: colors.primary }]}
        >
          <Ionicons name="checkmark" size={15} color={colors.onPrimary} />
        </Animated.View>
      ) : (
        <View style={[styles.check, { borderColor: colors.border }]} />
      )}
    </PressableScale>
  );
}

function Chip({
  colors,
  selected,
  label,
  onPress,
  dimmed = false,
}: {
  colors: ColorPalette;
  selected: boolean;
  label: string;
  onPress: () => void;
  dimmed?: boolean;
}) {
  const styles = makeStyles(colors);
  return (
    <PressableScale
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
          opacity: dimmed ? 0.4 : 1,
        },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      {selected ? (
        <Ionicons name="checkmark" size={14} color={colors.onPrimary} style={styles.chipCheck} />
      ) : null}
      <Text style={[styles.chipLabel, { color: selected ? colors.onPrimary : colors.text }]}>
        {label}
      </Text>
    </PressableScale>
  );
}

function FeatureRow({
  colors,
  icon,
  text,
}: {
  colors: ColorPalette;
  icon: IconName;
  text: string;
}) {
  const styles = makeStyles(colors);
  return (
    <View style={styles.featureRow}>
      <View style={[styles.iconTile, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <Text style={[styles.featureText, { color: colors.text }]}>{text}</Text>
    </View>
  );
}

function SummaryRow({
  colors,
  icon,
  label,
  value,
}: {
  colors: ColorPalette;
  icon: IconName;
  label: string;
  value: string;
}) {
  const styles = makeStyles(colors);
  return (
    <View style={styles.summaryRow}>
      <View style={[styles.iconTile, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <View style={styles.cardTextWrap}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={[styles.summaryValue, { color: colors.text }]}>{value}</Text>
      </View>
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1 },
    container: { flex: 1, backgroundColor: 'transparent' },
    progressWrap: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.sm },
    progressTrack: {
      height: 6,
      borderRadius: radius.xs,
      backgroundColor: colors.border,
      overflow: 'hidden',
    },
    progressFill: { height: 6, borderRadius: radius.xs, backgroundColor: colors.primary },
    stepCaption: { fontSize: text.footnote, fontWeight: weight.semibold, marginTop: spacing.md, color: colors.textMuted },
    scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
    title: { fontSize: text.display, fontWeight: weight.bold, marginBottom: spacing.sm, color: colors.text },
    subtitle: { fontSize: text.callout, lineHeight: leading.callout, marginBottom: spacing.xl, color: colors.textSecondary },
    welcomeContent: {
      flex: 1,
      paddingHorizontal: spacing.xxl,
      paddingTop: spacing.xxxl,
      paddingBottom: spacing.lg,
      overflow: 'hidden',
    },
    welcomeTop: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    brandWrap: { alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
    welcomeTitle: {
      fontSize: text.display,
      fontWeight: weight.heavy,
      letterSpacing: tracking.tight,
      textAlign: 'center',
      marginTop: spacing.lg,
      color: colors.text,
    },
    welcomeTitleAccent: { color: colors.primary },
    welcomeSubtitle: {
      fontSize: text.callout,
      lineHeight: leading.callout,
      textAlign: 'center',
      marginTop: spacing.sm,
      marginBottom: spacing.xxl,
      paddingHorizontal: spacing.xs,
      color: colors.textSecondary,
    },
    block: { alignSelf: 'stretch' },
    featureList: { alignSelf: 'stretch', gap: spacing.md },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      shadowColor: colors.shadow,
      ...elevation.level1,
    },
    featureText: { flex: 1, fontSize: text.callout, fontWeight: weight.semibold },
    welcomeFooter: {},
    welcomeCaption: {
      fontSize: text.body,
      textAlign: 'center',
      marginBottom: spacing.md,
      color: colors.textMuted,
    },
    // --- Matching moment ---
    matchingContent: {
      flex: 1,
      paddingHorizontal: spacing.xxl,
      paddingBottom: spacing.lg,
    },
    matchingTop: { flex: 1, justifyContent: 'center' },
    matchingBadge: {
      width: 56,
      height: 56,
      borderRadius: radius.pill,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: spacing.lg,
    },
    matchingCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xl,
      marginTop: spacing.xxl,
      shadowColor: colors.shadow,
      ...elevation.level2,
    },
    matchingLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
    },
    matchingLineText: {
      flex: 1,
      fontSize: text.callout,
      lineHeight: leading.callout,
      color: colors.text,
    },
    matchingSkip: {
      fontSize: text.body,
      textAlign: 'center',
      color: colors.textMuted,
      paddingVertical: spacing.md,
    },
    // --- Payoff ---
    payoffScroll: {
      flexGrow: 1,
      paddingHorizontal: spacing.xxl,
      paddingBottom: spacing.lg,
    },
    payoffTop: { flex: 1, justifyContent: 'center', paddingVertical: spacing.lg },
    payoffTitle: {
      fontSize: text.display,
      lineHeight: leading.display,
      fontWeight: weight.heavy,
      letterSpacing: tracking.tight,
      color: colors.text,
      textAlign: 'center',
    },
    payoffSubtitle: {
      fontSize: text.callout,
      lineHeight: leading.callout,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: spacing.sm,
      marginBottom: spacing.xxl,
    },
    payoffCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.xl,
      shadowColor: colors.shadow,
      ...elevation.level2,
    },
    payoffCardLoading: { alignItems: 'center', paddingVertical: spacing.xxxl },
    payoffEyebrow: {
      fontSize: text.caption,
      fontWeight: weight.heavy,
      letterSpacing: tracking.wider,
      textTransform: 'uppercase',
      color: colors.primary,
    },
    payoffCardTitle: {
      fontSize: text.title,
      lineHeight: leading.title,
      fontWeight: weight.bold,
      color: colors.text,
      marginTop: spacing.sm,
    },
    payoffCardTagline: {
      fontSize: text.body,
      lineHeight: leading.body,
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },
    payoffCardMeta: {
      fontSize: text.footnote,
      color: colors.textMuted,
      marginTop: spacing.md,
    },
    payoffSessionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      marginTop: spacing.lg,
      marginBottom: spacing.xs,
    },
    payoffSessionLabel: {
      fontSize: text.footnote,
      fontWeight: weight.bold,
      textTransform: 'uppercase',
      letterSpacing: tracking.wider,
      color: colors.textMuted,
    },
    payoffSessionTitle: {
      flexShrink: 1,
      fontSize: text.footnote,
      fontWeight: weight.semibold,
      color: colors.textSecondary,
    },
    payoffExerciseRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingVertical: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    payoffExerciseName: {
      flex: 1,
      minWidth: 0,
      fontSize: text.body,
      lineHeight: leading.body,
      color: colors.text,
    },
    payoffExerciseRx: {
      fontSize: text.body,
      color: colors.textMuted,
      fontVariant: ['tabular-nums'],
    },
    payoffMore: { fontSize: text.footnote, color: colors.textMuted, marginTop: spacing.xs },
    payoffCta: { marginTop: spacing.lg },
    payoffCardLink: { alignItems: 'center', paddingTop: spacing.md },
    payoffCardLinkText: { fontSize: text.body, fontWeight: weight.semibold, color: colors.primary },
    payoffFooter: { gap: spacing.xs },
    payoffSecondaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.lg,
    },
    payoffSecondaryText: {
      fontSize: text.callout,
      fontWeight: weight.semibold,
      color: colors.primary,
    },
    payoffLink: { alignItems: 'center', paddingVertical: spacing.md },
    payoffLinkText: { fontSize: text.body, color: colors.textMuted },
    // --- Steps ---
    cardShadow: {
      shadowColor: colors.shadow,
      ...elevation.level1,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: radius.md,
      borderWidth: 1.5,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.md,
    },
    iconTile: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.lg,
    },
    cardTextWrap: { flex: 1, paddingRight: spacing.md },
    cardTitle: { fontSize: text.headline, fontWeight: weight.semibold },
    cardSubtitle: { fontSize: text.body, marginTop: spacing.xs, lineHeight: leading.body },
    check: {
      width: 24,
      height: 24,
      borderRadius: radius.md,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgePill: {
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    badgePillText: {
      fontSize: text.caption,
      fontWeight: weight.bold,
    },
    factLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.primarySoft,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      marginTop: spacing.xs,
      marginBottom: spacing.md,
    },
    factLineText: {
      flex: 1,
      fontSize: text.body,
      lineHeight: leading.body,
      fontWeight: weight.semibold,
      color: colors.primary,
    },
    inlineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    helperTextInline: {
      flex: 1,
      fontSize: text.body,
      lineHeight: leading.body,
      color: colors.textMuted,
    },
    inlineLink: { paddingVertical: spacing.sm, alignSelf: 'flex-start' },
    inlineLinkText: { fontSize: text.body, fontWeight: weight.semibold, color: colors.primary },
    sectionLabel: {
      fontSize: text.body,
      fontWeight: weight.bold,
      textTransform: 'uppercase',
      letterSpacing: tracking.wider,
      marginTop: spacing.lg,
      marginBottom: spacing.md,
      color: colors.textMuted,
    },
    helperText: { fontSize: text.body, lineHeight: leading.body, marginBottom: spacing.md, color: colors.textMuted },
    segmentRow: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.xs,
      gap: spacing.xs,
    },
    segment: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.sm, alignItems: 'center' },
    segmentActive: { backgroundColor: colors.primary },
    segmentText: { fontSize: text.callout, fontWeight: weight.semibold, color: colors.textSecondary },
    segmentTextActive: { color: colors.onPrimary },
    presetRow: { flexDirection: 'row', gap: spacing.md },
    presetCard: { flex: 1, borderRadius: radius.md, borderWidth: 1.5, paddingVertical: spacing.lg, paddingHorizontal: spacing.lg, alignItems: 'flex-start' },
    presetLabel: { fontSize: text.callout, fontWeight: weight.bold, marginTop: spacing.md },
    presetSub: { fontSize: text.body, marginTop: spacing.xs },
    chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: radius.pill,
      borderWidth: 1.5,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    chipCheck: { marginRight: spacing.sm },
    chipLabel: { fontSize: text.body, fontWeight: weight.semibold },
    nameInput: {
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      fontSize: text.callout,
      marginTop: spacing.xs,
      marginBottom: spacing.sm,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    summaryWrap: { gap: spacing.md },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
    },
    summaryLabel: {
      fontSize: text.footnote,
      fontWeight: weight.bold,
      textTransform: 'uppercase',
      letterSpacing: tracking.wider,
      color: colors.textMuted,
    },
    summaryValue: { fontSize: text.callout, fontWeight: weight.semibold, marginTop: spacing.xxs },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    backBtn: { minWidth: 64, paddingVertical: spacing.md },
    backText: { fontSize: text.callout, fontWeight: weight.semibold, color: colors.textSecondary },
    nextBtn: {
      flex: 1,
      marginLeft: spacing.md,
      borderRadius: radius.md,
      paddingVertical: spacing.lg,
      alignItems: 'center',
      backgroundColor: colors.primary,
      shadowColor: colors.shadow,
      ...elevation.level2,
    },
    nextBtnSecondary: {
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.border,
      shadowOpacity: 0,
      elevation: 0,
    },
    nextBtnDisabled: { backgroundColor: colors.border },
    nextBtnText: { fontSize: text.headline, fontWeight: weight.semibold, color: colors.onPrimary },
    nextBtnTextSecondary: { color: colors.primary },
    nextBtnTextDisabled: { color: colors.textMuted },
  });
}
