import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ColorPalette } from '../theme/colors';
import { useTheme } from '../theme';
import {
  useUserPreferences,
  GOAL_OPTIONS,
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
import type { RootNavigatorParamList } from '../types/navigation';

type Props = {
  navigation: NativeStackNavigationProp<RootNavigatorParamList, 'Onboarding'>;
};

const GOAL_DESCRIPTIONS: Record<GoalOption, string> = {
  Strength: 'Build a stronger, more powerful body',
  Hypertrophy: 'Grow muscle size and definition',
  'Fat loss': 'Burn fat and improve body composition',
  'General fitness': 'Stay healthy and active',
  Endurance: 'Build cardiovascular fitness',
};

const EXPERIENCE_DESCRIPTIONS: Record<ExperienceOption, string> = {
  Beginner: 'New to structured training or returning after a long break',
  Intermediate: 'Training consistently for 6+ months',
  Advanced: 'Years of focused training with a solid foundation',
};

const STEP_HEADINGS: { title: string; subtitle: string }[] = [
  { title: "What's your main goal?", subtitle: "We'll tailor your plan around this" },
  { title: 'Your experience level?', subtitle: 'Helps us set the right intensity and volume' },
  { title: 'How often do you train?', subtitle: "We'll shape your weekly split around this" },
  { title: 'What equipment do you have?', subtitle: 'Select all that apply — change it anytime in Profile' },
  { title: 'Anything to work around?', subtitle: 'Optional — most people skip this. Not medical advice.' },
];

const TOTAL_STEPS = STEP_HEADINGS.length;

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
    completeOnboarding,
  } = useUserPreferences();

  const [step, setStep] = useState(0);
  const [selectedGoal, setSelectedGoal] = useState<GoalOption | null>(null);
  const [selectedExperience, setSelectedExperience] = useState<ExperienceOption | null>(null);
  const [selectedFrequency, setSelectedFrequency] = useState<TrainingFrequencyOption>(4);
  const [flexibleDays, setFlexibleDays] = useState(true);
  const [selectedWeekdays, setSelectedWeekdays] = useState<DayOfWeekPreference[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentOption[]>([]);
  const [injuryTags, setInjuryTags] = useState<StoredInjuryTagId[]>([]);
  const [injuryNotes, setInjuryNotesDraft] = useState('');

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

  const isLastStep = step === TOTAL_STEPS - 1;

  function toggleEquipment(item: EquipmentOption) {
    setSelectedEquipment((prev) =>
      prev.includes(item) ? prev.filter((e) => e !== item) : [...prev, item],
    );
  }

  function isPresetActive(preset: EquipmentOption[]) {
    return preset.length === selectedEquipment.length && preset.every((i) => selectedEquipment.includes(i));
  }

  function selectFrequency(n: TrainingFrequencyOption) {
    setSelectedFrequency(n);
    setSelectedWeekdays((prev) => (prev.length > n ? prev.slice(0, n) : prev));
  }

  function togglePreferredDay(day: DayOfWeekPreference) {
    setSelectedWeekdays((prev) => {
      if (prev.includes(day)) return prev.filter((d) => d !== day);
      if (prev.length >= selectedFrequency) return prev;
      return [...prev, day].sort(
        (a, b) => DAYS_OF_WEEK_PREF.indexOf(a) - DAYS_OF_WEEK_PREF.indexOf(b),
      );
    });
  }

  function toggleInjuryTag(id: StoredInjuryTagId) {
    setInjuryTags((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleNext() {
    if (!canProceed) return;
    if (!isLastStep) {
      setStep((s) => s + 1);
      return;
    }
    if (selectedGoal) setGoal(selectedGoal);
    if (selectedExperience) setExperience(selectedExperience);
    setTrainingFrequency(selectedFrequency);
    setTrainingDaysFlexible(flexibleDays);
    setPreferredTrainingDays(flexibleDays ? [] : selectedWeekdays);
    setEquipment(selectedEquipment);
    setInjuryTagIds(injuryTags);
    setInjuryNotes(injuryNotes.trim());
    completeOnboarding();
    navigation.replace('Main');
  }

  const heading = STEP_HEADINGS[step];
  const ctaLabel = isLastStep
    ? injuryTags.length === 0 && !injuryNotes.trim()
      ? 'Skip & get my plan'
      : 'Get my plan'
    : 'Continue';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressSeg,
                { backgroundColor: i <= step ? colors.primary : colors.border },
              ]}
            />
          ))}
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
        <Text style={styles.title}>{heading.title}</Text>
        <Text style={styles.subtitle}>{heading.subtitle}</Text>

        {step === 0 &&
          GOAL_OPTIONS.map((g) => (
            <SelectableCard
              key={g}
              colors={colors}
              selected={selectedGoal === g}
              title={g}
              subtitle={GOAL_DESCRIPTIONS[g]}
              onPress={() => setSelectedGoal(g)}
            />
          ))}

        {step === 1 &&
          EXPERIENCE_OPTIONS.map((e) => (
            <SelectableCard
              key={e}
              colors={colors}
              selected={selectedExperience === e}
              title={e}
              subtitle={EXPERIENCE_DESCRIPTIONS[e]}
              onPress={() => setSelectedExperience(e)}
            />
          ))}

        {step === 2 && (
          <>
            {TRAINING_FREQUENCY_OPTIONS.map((n) => (
              <SelectableCard
                key={n}
                colors={colors}
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
                  <TouchableOpacity
                    key={label}
                    style={[styles.segment, active ? styles.segmentActive : null]}
                    onPress={() => setFlexibleDays(value)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
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
                  { label: 'Gym', sub: 'Full equipment', preset: GYM_PRESET },
                  { label: 'Home', sub: 'Minimal setup', preset: HOME_PRESET },
                ] as const
              ).map(({ label, sub, preset }) => {
                const active = isPresetActive(preset);
                return (
                  <TouchableOpacity
                    key={label}
                    style={[
                      styles.presetCard,
                      {
                        backgroundColor: active ? colors.primarySoft : colors.surface,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => setSelectedEquipment([...preset])}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.presetLabel, { color: colors.text }]}>{label}</Text>
                    <Text style={[styles.presetSub, { color: colors.textMuted }]}>{sub}</Text>
                  </TouchableOpacity>
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
      </ScrollView>

      <View style={styles.footer}>
        {step > 0 ? (
          <TouchableOpacity onPress={() => setStep((s) => s - 1)} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
        <TouchableOpacity
          onPress={handleNext}
          disabled={!canProceed}
          style={[styles.nextBtn, !canProceed && styles.nextBtnDisabled]}
          activeOpacity={0.85}
        >
          <Text style={[styles.nextBtnText, !canProceed && styles.nextBtnTextDisabled]}>
            {ctaLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function SelectableCard({
  colors,
  selected,
  title,
  subtitle,
  onPress,
}: {
  colors: ColorPalette;
  selected: boolean;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  const styles = makeStyles(colors);
  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: selected ? colors.primarySoft : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.cardTextWrap}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>{subtitle}</Text>
        ) : null}
      </View>
      <View
        style={[
          styles.check,
          {
            borderColor: selected ? colors.primary : colors.border,
            backgroundColor: selected ? colors.primary : 'transparent',
          },
        ]}
      >
        {selected ? <Text style={[styles.checkMark, { color: colors.onPrimary }]}>✓</Text> : null}
      </View>
    </TouchableOpacity>
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
    <TouchableOpacity
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
          opacity: dimmed ? 0.4 : 1,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={[styles.chipLabel, { color: selected ? colors.onPrimary : colors.text }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    progressWrap: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
    progressTrack: { flexDirection: 'row', gap: 6 },
    progressSeg: { flex: 1, height: 4, borderRadius: 2 },
    stepCaption: { fontSize: 12, fontWeight: '600', marginTop: 10, color: colors.textMuted },
    scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
    title: { fontSize: 27, fontWeight: '700', marginBottom: 6, color: colors.text },
    subtitle: { fontSize: 15, lineHeight: 21, marginBottom: 22, color: colors.textSecondary },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 14,
      borderWidth: 1.5,
      paddingVertical: 16,
      paddingHorizontal: 16,
      marginBottom: 12,
    },
    cardTextWrap: { flex: 1, paddingRight: 12 },
    cardTitle: { fontSize: 17, fontWeight: '600' },
    cardSubtitle: { fontSize: 13, marginTop: 4, lineHeight: 18 },
    check: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkMark: { fontSize: 14, fontWeight: '800', lineHeight: 16 },
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
    presetCard: { flex: 1, borderRadius: 14, borderWidth: 1.5, paddingVertical: 18, paddingHorizontal: 16 },
    presetLabel: { fontSize: 16, fontWeight: '700' },
    presetSub: { fontSize: 13, marginTop: 3 },
    chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    chip: { borderRadius: 22, borderWidth: 1.5, paddingVertical: 10, paddingHorizontal: 16 },
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
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    backBtn: { minWidth: 64, paddingVertical: 8 },
    backText: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
    nextBtn: {
      flex: 1,
      marginLeft: 12,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      backgroundColor: colors.primary,
    },
    nextBtnDisabled: { backgroundColor: colors.border },
    nextBtnText: { fontSize: 16, fontWeight: '700', color: colors.onPrimary },
    nextBtnTextDisabled: { color: colors.textMuted },
  });
}
