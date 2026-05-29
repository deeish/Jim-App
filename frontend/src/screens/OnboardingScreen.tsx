import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInDown,
  ZoomIn,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withDelay,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ColorPalette } from '../theme/colors';
import { useTheme } from '../theme';
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
  TRAINING_FREQUENCY_OPTIONS,
  type DayOfWeekPreference,
  type TrainingFrequencyOption,
} from '../constants/trainingSchedule';
import { PROFILE_INJURY_TAG_OPTIONS } from '../constants/injuryTags';
import PressableScale from '../components/PressableScale';
import Button from '../components/Button';
import Aurora from '../components/Aurora';
import JGlyph from '../components/JGlyph';
import { haptics } from '../lib/haptics';
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
  const [selectedGoal, setSelectedGoal] = useState<GoalOption | null>(null);
  const [selectedExperience, setSelectedExperience] = useState<ExperienceOption | null>(null);
  const [selectedFrequency, setSelectedFrequency] = useState<TrainingFrequencyOption>(4);
  const [flexibleDays, setFlexibleDays] = useState(true);
  const [selectedWeekdays, setSelectedWeekdays] = useState<DayOfWeekPreference[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentOption[]>([]);
  const [injuryTags, setInjuryTags] = useState<StoredInjuryTagId[]>([]);
  const [injuryNotes, setInjuryNotesDraft] = useState('');
  const [displayName, setDisplayName] = useState('');

  const progress = useSharedValue((1) / TOTAL_STEPS);
  useEffect(() => {
    progress.value = withTiming((step + 1) / TOTAL_STEPS, { duration: 300 });
  }, [step, progress]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

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
    if (selectedExperience) setExperience(selectedExperience);
    setTrainingFrequency(selectedFrequency);
    setTrainingDaysFlexible(flexibleDays);
    setPreferredTrainingDays(flexibleDays ? [] : selectedWeekdays);
    setEquipment(selectedEquipment);
    setInjuryTagIds(injuryTags);
    setInjuryNotes(injuryNotes.trim());
    if (displayName.trim()) setProfileDisplayName(displayName.trim());
    completeOnboarding();
    navigation.replace('Main', {
      screen: 'Plan',
      params: {
        screen: 'GeneratePlan',
        params: { autoGenerate: true, fromOnboarding: true },
      },
    });
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
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {showWelcome ? (
          <View style={styles.welcomeContent}>
            <Aurora colors={colors} />
            <View style={styles.welcomeTop}>
              <Rise delay={60} style={styles.brandWrap}>
                <AnimatedLogo colors={colors} />
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
                  selected={selectedGoal === g}
                  title={GOAL_LABELS[g]}
                  subtitle={GOAL_META[g].desc}
                  onPress={() => {
                    haptics.select();
                    setSelectedGoal(g);
                  }}
                />
              ))}
              <Text style={styles.helperText}>You can change this anytime in Profile.</Text>
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
              />
            </>
          )}

          {step === 5 && (
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
                value={selectedGoal ? GOAL_LABELS[selectedGoal] : '—'}
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
            {step === LAST_STEP ? 'Get my plan' : 'Continue'}
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

function AnimatedLogo({ colors }: { colors: ColorPalette }) {
  const styles = makeStyles(colors);
  const breath = useSharedValue(0);
  const pulseA = useSharedValue(0);
  const pulseB = useSharedValue(0);
  const shimmer = useSharedValue(0);
  // Tap-to-flex easter egg: `flex` etches abs onto the J, `pop` bounces the tile.
  const flex = useSharedValue(0);
  const pop = useSharedValue(0);

  const handleFlex = () => {
    haptics.select();
    pop.value = withSequence(
      withTiming(1, { duration: 130, easing: Easing.out(Easing.ease) }),
      withTiming(0, { duration: 240, easing: Easing.inOut(Easing.ease) }),
    );
    flex.value = withSequence(
      withTiming(1, { duration: 200, easing: Easing.out(Easing.ease) }),
      withDelay(700, withTiming(0, { duration: 360, easing: Easing.in(Easing.ease) })),
    );
  };

  useEffect(() => {
    breath.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    const pulse = () =>
      withRepeat(withTiming(1, { duration: 2800, easing: Easing.out(Easing.ease) }), -1, false);
    pulseA.value = pulse();
    pulseB.value = withDelay(1400, pulse());
    // Specular sheen sweeps across the tile, then pauses, on a loop.
    shimmer.value = withRepeat(
      withDelay(1200, withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) })),
      -1,
      false,
    );
  }, [breath, pulseA, pulseB, shimmer]);

  const tileStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breath.value * 0.05 + pop.value * 0.12 }],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + breath.value * 0.3,
    transform: [{ scale: 0.96 + breath.value * 0.08 }],
  }));
  const ringAStyle = useAnimatedStyle(() => ({
    opacity: (1 - pulseA.value) * 0.5,
    transform: [{ scale: 0.7 + pulseA.value * 0.9 }],
  }));
  const ringBStyle = useAnimatedStyle(() => ({
    opacity: (1 - pulseB.value) * 0.5,
    transform: [{ scale: 0.7 + pulseB.value * 0.9 }],
  }));
  const sheenStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -38 + shimmer.value * 150 }, { rotate: '18deg' }],
  }));

  return (
    <View style={styles.logoCol}>
      <Pressable
        onPress={handleFlex}
        style={styles.pulseBox}
        accessibilityRole="imagebutton"
        accessibilityLabel="Jim logo"
      >
        <Animated.View style={[styles.pulseHalo, haloStyle]} pointerEvents="none" />
        <Animated.View style={[styles.pulseRing, ringAStyle]} pointerEvents="none" />
        <Animated.View
          style={[styles.pulseRing, styles.pulseRingAccent, ringBStyle]}
          pointerEvents="none"
        />
        <Animated.View style={[styles.logoTile, tileStyle]}>
          <View style={styles.logoTileClip}>
            <LinearGradient
              colors={[colors.primary, colors.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              colors={['rgba(255,255,255,0.24)', 'rgba(255,255,255,0)']}
              locations={[0, 0.6]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <Animated.View style={[styles.sheenBand, sheenStyle]} pointerEvents="none">
              <LinearGradient
                colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.sheenFill}
              />
            </Animated.View>
            <JGlyph size={72} colors={colors} fallbackStyle={styles.logoGlyph} flex={flex} />
          </View>
        </Animated.View>
      </Pressable>
      <Text style={styles.logoWordmark}>Jim</Text>
    </View>
  );
}

function SelectableCard({
  colors,
  icon,
  selected,
  title,
  subtitle,
  onPress,
}: {
  colors: ColorPalette;
  icon: IconName;
  selected: boolean;
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
      {selected ? (
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
    progressWrap: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
    progressTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
      overflow: 'hidden',
    },
    progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
    stepCaption: { fontSize: 12, fontWeight: '600', marginTop: 10, color: colors.textMuted },
    scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
    title: { fontSize: 27, fontWeight: '700', marginBottom: 6, color: colors.text },
    subtitle: { fontSize: 15, lineHeight: 21, marginBottom: 22, color: colors.textSecondary },
    welcomeContent: {
      flex: 1,
      paddingHorizontal: 24,
      paddingTop: 32,
      paddingBottom: 16,
      overflow: 'hidden',
    },
    welcomeTop: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    brandWrap: { alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
    logoCol: { alignItems: 'center' },
    pulseBox: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center' },
    pulseRing: {
      position: 'absolute',
      width: 88,
      height: 88,
      borderRadius: 44,
      borderWidth: 2,
      borderColor: colors.primary,
    },
    pulseRingAccent: { borderColor: colors.accent },
    pulseHalo: {
      position: 'absolute',
      width: 132,
      height: 132,
      borderRadius: 66,
      backgroundColor: colors.primarySoft,
    },
    logoTile: {
      width: 72,
      height: 72,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.18,
      shadowRadius: 10,
      elevation: 6,
    },
    logoTileClip: {
      width: 72,
      height: 72,
      borderRadius: 20,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheenBand: { position: 'absolute', top: -30, left: 0, width: 26, height: 132 },
    sheenFill: { flex: 1 },
    logoGlyph: {
      fontSize: 42,
      fontWeight: '900',
      fontStyle: 'italic',
      lineHeight: 48,
      letterSpacing: -1,
      color: colors.onPrimary,
      includeFontPadding: false,
      textAlignVertical: 'center',
    },
    logoWordmark: {
      fontSize: 30,
      fontWeight: '900',
      fontStyle: 'italic',
      letterSpacing: 0.5,
      color: colors.text,
      marginTop: 2,
    },
    welcomeTitle: {
      fontSize: 32,
      fontWeight: '800',
      letterSpacing: -0.5,
      textAlign: 'center',
      marginTop: 16,
      color: colors.text,
    },
    welcomeTitleAccent: { color: colors.primary },
    welcomeSubtitle: {
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
      marginTop: 8,
      marginBottom: 28,
      paddingHorizontal: 4,
      color: colors.textSecondary,
    },
    block: { alignSelf: 'stretch' },
    featureList: { alignSelf: 'stretch', gap: 12 },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 12,
      paddingHorizontal: 14,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 2,
    },
    featureText: { flex: 1, fontSize: 15, fontWeight: '600' },
    welcomeFooter: {},
    welcomeCaption: {
      fontSize: 13,
      textAlign: 'center',
      marginBottom: 12,
      color: colors.textMuted,
    },
    cardShadow: {
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
      elevation: 2,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 14,
      borderWidth: 1.5,
      paddingVertical: 14,
      paddingHorizontal: 14,
      marginBottom: 12,
    },
    iconTile: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    cardTextWrap: { flex: 1, paddingRight: 12 },
    cardTitle: { fontSize: 17, fontWeight: '600' },
    cardSubtitle: { fontSize: 13, marginTop: 3, lineHeight: 18 },
    check: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: 18,
      marginBottom: 12,
      color: colors.textMuted,
    },
    helperText: { fontSize: 13, lineHeight: 18, marginBottom: 12, color: colors.textMuted },
    segmentRow: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 4,
      gap: 4,
    },
    segment: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
    segmentActive: { backgroundColor: colors.primary },
    segmentText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
    segmentTextActive: { color: colors.onPrimary },
    presetRow: { flexDirection: 'row', gap: 12 },
    presetCard: { flex: 1, borderRadius: 14, borderWidth: 1.5, paddingVertical: 18, paddingHorizontal: 16, alignItems: 'flex-start' },
    presetLabel: { fontSize: 16, fontWeight: '700', marginTop: 10 },
    presetSub: { fontSize: 13, marginTop: 3 },
    chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 22,
      borderWidth: 1.5,
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    chipCheck: { marginRight: 6 },
    chipLabel: { fontSize: 14, fontWeight: '600' },
    textarea: {
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      minHeight: 88,
      textAlignVertical: 'top',
      marginTop: 4,
      color: colors.text,
    },
    nameInput: {
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      marginTop: 4,
      marginBottom: 8,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    summaryWrap: { gap: 12 },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
    },
    summaryLabel: {
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      color: colors.textMuted,
    },
    summaryValue: { fontSize: 16, fontWeight: '600', marginTop: 2 },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    backBtn: { minWidth: 64, paddingVertical: 12 },
    backText: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
    nextBtn: {
      flex: 1,
      marginLeft: 12,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      backgroundColor: colors.primary,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 3.84,
      elevation: 5,
    },
    nextBtnDisabled: { backgroundColor: colors.border },
    nextBtnText: { fontSize: 18, fontWeight: '600', color: colors.onPrimary },
    nextBtnTextDisabled: { color: colors.textMuted },
  });
}
