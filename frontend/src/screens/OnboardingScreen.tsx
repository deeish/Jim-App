import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, ActivityIndicator } from 'react-native';
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
  MAX_INJURY_NOTES,
  type GoalOption,
  type ExperienceOption,
  type StoredInjuryTagId,
} from '../contexts/UserPreferencesContext';
import { EQUIPMENT_OPTIONS, type EquipmentOption } from '../constants/equipment';
import {
  DAYS_OF_WEEK_PREF,
  TRAINING_FREQUENCY_OPTIONS,
  type DayOfWeekPreference,
  type TrainingFrequencyOption,
} from '../constants/trainingSchedule';
import { PROFILE_INJURY_TAG_OPTIONS } from '../constants/injuryTags';
import PressableScale from '../components/PressableScale';
import Button from '../components/Button';
import Aurora from '../components/Aurora';
import JimLogo from '../components/JimLogo';
import { haptics } from '../lib/haptics';
import { kgToLb, type WeightUnit } from '../lib/weightDisplay';
import { logWeighIn } from '../services/bodyWeightService';
import { listPlanTemplates, type PlanTemplateCard } from '../services/templateService';
import { recommendTemplate } from '../lib/templateRecommendation';
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

const STEP_HEADINGS: { title: string; subtitle: string }[] = [
  { title: "What's your main goal?", subtitle: "We'll tailor your plan around this" },
  { title: 'Your experience level?', subtitle: 'Helps us set the right intensity and volume' },
  { title: 'How often do you train?', subtitle: "We'll shape your weekly split around this" },
  { title: 'What equipment do you have?', subtitle: 'Select all that apply — change it anytime in Profile' },
  { title: 'Anything to work around?', subtitle: 'Optional — most people skip this. Not medical advice.' },
  { title: "What's your current weight?", subtitle: 'Optional — sets your first weigh-in so you can track progress.' },
  { title: 'Looks good?', subtitle: 'Review your setup — you can change anything later in Profile.' },
];

const TOTAL_STEPS = STEP_HEADINGS.length;
const LAST_STEP = TOTAL_STEPS - 1;

const GYM_PRESET: EquipmentOption[] = [...EQUIPMENT_OPTIONS];
const HOME_PRESET: EquipmentOption[] = ['Bodyweight', 'Dumbbell', 'Pull-up Bar', 'Resistance Band'];

export default function OnboardingScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const {
    setGoal,
    setSecondaryGoal,
    setWeightUnit,
    setExperience,
    setEquipment,
    setTrainingFrequency,
    setTrainingDaysFlexible,
    setPreferredTrainingDays,
    setInjuryTagIds,
    setInjuryNotes,
    setProfileDisplayName,
    completeOnboarding,
  } = useUserPreferences();

  const [step, setStep] = useState(0);
  const [showWelcome, setShowWelcome] = useState(true);
  // Post-review payoff: the recommended-program screen. Answers are persisted
  // and onboarding is marked complete on entry, so all three exits are plain
  // navigations and a killed app relaunches into Main, not back into questions.
  const [showPayoff, setShowPayoff] = useState(false);
  const [templates, setTemplates] = useState<PlanTemplateCard[] | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<GoalOption | null>(null);
  const [selectedSecondaryGoal, setSelectedSecondaryGoal] = useState<GoalOption | null>(null);
  const [selectedExperience, setSelectedExperience] = useState<ExperienceOption | null>(null);
  const [selectedFrequency, setSelectedFrequency] = useState<TrainingFrequencyOption>(4);
  const [flexibleDays, setFlexibleDays] = useState(true);
  const [selectedWeekdays, setSelectedWeekdays] = useState<DayOfWeekPreference[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentOption[]>([]);
  const [injuryTags, setInjuryTags] = useState<StoredInjuryTagId[]>([]);
  const [injuryNotes, setInjuryNotesDraft] = useState('');
  const [weightInput, setWeightInput] = useState('');
  const [weightEntryUnit, setWeightEntryUnit] = useState<WeightUnit>('lb');
  const [displayName, setDisplayName] = useState('');

  const progress = useSharedValue((1) / TOTAL_STEPS);
  useEffect(() => {
    progress.value = withTiming((step + 1) / TOTAL_STEPS, { duration: 300 });
  }, [step, progress]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  // Prefetch the catalog while the user reviews their answers, so the payoff
  // screen shows its recommendation instantly. Failure degrades to the
  // browse-programs card — it must never block finishing onboarding.
  useEffect(() => {
    if (step !== LAST_STEP || templates !== null) return;
    let active = true;
    listPlanTemplates()
      .then((list) => {
        if (active) setTemplates(list);
      })
      .catch(() => {
        if (active) setTemplates([]);
      });
    return () => {
      active = false;
    };
  }, [step, templates]);

  const recommended =
    templates && templates.length
      ? recommendTemplate(templates, {
          goal: selectedGoal,
          daysPerWeek: selectedFrequency,
          experience: selectedExperience,
        })
      : null;

  const scheduleOk = flexibleDays || selectedWeekdays.length === selectedFrequency;
  const canProceed =
    step === 0
      ? selectedGoal !== null
      : step === 1
        ? selectedExperience !== null
        : step === 2
          ? scheduleOk
          : step === 3
            ? selectedEquipment.length > 0
            : true;

  // One list, up to two picks: first tap sets the main goal, the next tap
  // sets (or replaces) the second focus. Tapping a selected card deselects
  // it; deselecting the main goal promotes the second focus so the primary
  // slot is never empty while anything is selected.
  function handleSelectGoal(g: GoalOption) {
    haptics.select();
    if (selectedGoal === g) {
      setSelectedGoal(selectedSecondaryGoal);
      setSelectedSecondaryGoal(null);
      return;
    }
    if (selectedSecondaryGoal === g) {
      setSelectedSecondaryGoal(null);
      return;
    }
    if (!selectedGoal) {
      setSelectedGoal(g);
      return;
    }
    setSelectedSecondaryGoal(g);
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
    setTrainingDaysFlexible(flexibleDays);
    setPreferredTrainingDays(flexibleDays ? [] : selectedWeekdays);
    setEquipment(selectedEquipment);
    setInjuryTagIds(injuryTags);
    setInjuryNotes(injuryNotes.trim());
    if (displayName.trim()) setProfileDisplayName(displayName.trim());
    // Optional starting weigh-in. The user is already authenticated here, so this
    // is a best-effort POST that must never block finishing onboarding.
    const parsedWeight = Number.parseFloat(weightInput.replace(',', '.'));
    if (Number.isFinite(parsedWeight) && parsedWeight > 0) {
      setWeightUnit(weightEntryUnit);
      const weightLb = weightEntryUnit === 'kg' ? kgToLb(parsedWeight) : parsedWeight;
      if (weightLb >= 1 && weightLb <= 1500) {
        void logWeighIn({ weightLb: Math.round(weightLb * 10) / 10 }).catch(() => {});
      }
    }
    completeOnboarding();
    // No more generate-and-wait finale: land on the payoff screen, which
    // recommends a coach-built template (instant apply) with AI generation and
    // free exploration as the other two exits.
    setShowPayoff(true);
  }

  function openRecommendedTemplate(t: PlanTemplateCard) {
    haptics.select();
    navigation.replace('Main', {
      screen: 'Plan',
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
      screen: 'Plan',
      params: { screen: 'Templates', initial: false },
    });
  }

  function openAIGenerate() {
    haptics.select();
    navigation.replace('Main', {
      screen: 'Plan',
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
    ? `${selectedFrequency} days/week · flexible`
    : `${selectedFrequency} days · ${selectedWeekdays.map((d) => d.slice(0, 3)).join(', ')}`;
  const injuryValue =
    injuryTags.length === 0
      ? injuryNotes.trim()
        ? injuryNotes.trim()
        : 'Nothing to note'
      : injuryTags.map((id) => INJURY_LABEL[id]).join(', ');

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[`${colors.primary}22`, colors.background] as const}
        style={StyleSheet.absoluteFill}
      />
      {/* Full-bleed backdrop behind the safe-area-inset content, so the welcome
          aurora reaches the very top/bottom edges instead of being boxed into the
          inset region. */}
      {showWelcome || showPayoff ? <Aurora colors={colors} /> : null}
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
        ) : showPayoff ? (
          <View style={styles.payoffContent}>
            <View style={styles.payoffTop}>
              <Rise delay={60} style={styles.block}>
                <Text style={styles.payoffTitle}>Here's your program</Text>
                <Text style={styles.payoffSubtitle}>
                  Matched to your answers. Ready in one tap.
                </Text>
              </Rise>
              <Rise delay={180} style={styles.block}>
                {templates === null ? (
                  <View style={[styles.payoffCard, styles.payoffCardLoading]}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                ) : recommended ? (
                  <View style={styles.payoffCard}>
                    <Text style={styles.payoffEyebrow}>Recommended for you</Text>
                    <Text style={styles.payoffCardTitle}>{recommended.name}</Text>
                    <Text style={styles.payoffCardTagline}>{recommended.tagline}</Text>
                    <Text style={styles.payoffCardMeta}>
                      {recommended.weeksCount} weeks ·{' '}
                      {recommended.supportedDaysPerWeek &&
                      recommended.supportedDaysPerWeek.min <
                        recommended.supportedDaysPerWeek.max
                        ? `${recommended.supportedDaysPerWeek.min}–${recommended.supportedDaysPerWeek.max}`
                        : recommended.daysPerWeek}{' '}
                      days/week · {recommended.sessionMinutes.min}–
                      {recommended.sessionMinutes.max} min
                    </Text>
                    <Button
                      title="View program"
                      onPress={() => openRecommendedTemplate(recommended)}
                      style={styles.payoffCta}
                    />
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
          </View>
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

          {step === 0 && (
            <>
              {GOAL_OPTIONS.map((g) => (
                <SelectableCard
                  key={g}
                  colors={colors}
                  icon={GOAL_META[g].icon}
                  selected={selectedGoal === g || selectedSecondaryGoal === g}
                  badge={
                    selectedGoal === g
                      ? 'Main goal'
                      : selectedSecondaryGoal === g
                        ? '2nd focus'
                        : undefined
                  }
                  title={GOAL_LABELS[g]}
                  subtitle={GOAL_META[g].desc}
                  onPress={() => handleSelectGoal(g)}
                />
              ))}
              <Text style={styles.helperText}>
                Pick up to two — your first pick is the main goal. You can change this anytime in
                Profile.
              </Text>
            </>
          )}

          {step === 1 &&
            EXPERIENCE_OPTIONS.map((e) => (
              <SelectableCard
                key={e}
                colors={colors}
                icon={EXPERIENCE_META[e].icon}
                selected={selectedExperience === e}
                title={e}
                subtitle={EXPERIENCE_META[e].desc}
                onPress={() => {
                  haptics.select();
                  setSelectedExperience(e);
                }}
              />
            ))}

          {step === 2 && (
            <>
              {TRAINING_FREQUENCY_OPTIONS.map((n) => (
                <SelectableCard
                  key={n}
                  colors={colors}
                  icon="calendar-outline"
                  selected={selectedFrequency === n}
                  title={`${n} days per week`}
                  subtitle={
                    n <= 4
                      ? 'Balanced progression for busy schedules'
                      : 'Higher frequency — suits experienced lifters'
                  }
                  onPress={() => selectFrequency(n)}
                />
              ))}

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
            </>
          )}

          {step === 3 && (
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

          {step === 4 && (
            <>
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
              <Text style={styles.sectionLabel}>Other notes</Text>
              <TextInput
                style={styles.textarea}
                value={injuryNotes}
                onChangeText={setInjuryNotesDraft}
                placeholder='e.g. "No deep squats this month — physio"'
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={MAX_INJURY_NOTES}
              />
            </>
          )}

          {step === 5 && (
            <>
              <Text style={styles.sectionLabel}>Current weight</Text>
              <View style={styles.weightEntryRow}>
                <TextInput
                  style={[styles.nameInput, styles.weightInput]}
                  value={weightInput}
                  onChangeText={setWeightInput}
                  placeholder="Optional"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  maxLength={6}
                />
                <View style={styles.weightUnitToggle}>
                  {(['lb', 'kg'] as WeightUnit[]).map((u) => {
                    const active = weightEntryUnit === u;
                    return (
                      <PressableScale
                        key={u}
                        style={[styles.segment, active ? styles.segmentActive : null]}
                        onPress={() => {
                          haptics.select();
                          setWeightEntryUnit(u);
                        }}
                      >
                        <Text
                          style={[styles.segmentText, active ? styles.segmentTextActive : null]}
                        >
                          {u}
                        </Text>
                      </PressableScale>
                    );
                  })}
                </View>
              </View>
              <Text style={styles.helperText}>
                We'll save this as your first weigh-in. Skip if you'd rather not.
              </Text>
            </>
          )}

          {step === 6 && (
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
                value={selectedExperience ?? '—'}
              />
              <SummaryRow colors={colors} icon="calendar-outline" label="Schedule" value={scheduleValue} />
              <SummaryRow colors={colors} icon="barbell-outline" label="Equipment" value={equipmentValue} />
              <SummaryRow colors={colors} icon="medkit-outline" label="Working around" value={injuryValue} />
              <SummaryRow
                colors={colors}
                icon="scale-outline"
                label="Starting weight"
                value={weightInput.trim() ? `${weightInput.trim()} ${weightEntryUnit}` : 'Skipped'}
              />
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
          style={[styles.nextBtn, !canProceed && styles.nextBtnDisabled]}
        >
          <Text style={[styles.nextBtnText, !canProceed && styles.nextBtnTextDisabled]}>
            {step === LAST_STEP ? 'Finish' : 'Continue'}
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
    payoffContent: {
      flex: 1,
      paddingHorizontal: spacing.xxl,
      paddingBottom: spacing.lg,
    },
    payoffTop: { flex: 1, justifyContent: 'center' },
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
    payoffCta: { marginTop: spacing.lg },
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
    textarea: {
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      fontSize: text.callout,
      minHeight: 88,
      textAlignVertical: 'top',
      marginTop: spacing.xs,
      color: colors.text,
    },
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
    weightEntryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs },
    weightInput: { flex: 1, marginBottom: spacing.none },
    weightUnitToggle: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.xs,
      gap: spacing.xs,
      width: 112,
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
    nextBtnDisabled: { backgroundColor: colors.border },
    nextBtnText: { fontSize: text.headline, fontWeight: weight.semibold, color: colors.onPrimary },
    nextBtnTextDisabled: { color: colors.textMuted },
  });
}
