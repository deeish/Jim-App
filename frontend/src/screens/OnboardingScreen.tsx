import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme';
import {
  useUserPreferences,
  GOAL_OPTIONS,
  EXPERIENCE_OPTIONS,
  type GoalOption,
  type ExperienceOption,
} from '../contexts/UserPreferencesContext';
import { EQUIPMENT_OPTIONS, type EquipmentOption } from '../constants/equipment';
import type { RootNavigatorParamList } from '../types/navigation';

type Props = {
  navigation: NativeStackNavigationProp<RootNavigatorParamList, 'Onboarding'>;
};

const GOAL_DESCRIPTIONS: Record<GoalOption, string> = {
  'Strength': 'Build a stronger, more powerful body',
  'Hypertrophy': 'Grow muscle size and definition',
  'Fat loss': 'Burn fat and improve body composition',
  'General fitness': 'Stay healthy and active',
  'Endurance': 'Build cardiovascular fitness',
};

const EXPERIENCE_DESCRIPTIONS: Record<ExperienceOption, string> = {
  'Beginner': 'New to structured training or returning after a long break',
  'Intermediate': 'Training consistently for 6+ months',
  'Advanced': 'Years of focused training with a solid foundation',
};

const TOTAL_STEPS = 3;

const GYM_PRESET: EquipmentOption[] = [...EQUIPMENT_OPTIONS];
const HOME_PRESET: EquipmentOption[] = ['Bodyweight', 'Dumbbell', 'Pull-up Bar', 'Resistance Band'];

export default function OnboardingScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { setGoal, setExperience, setEquipment, completeOnboarding } = useUserPreferences();

  const [step, setStep] = useState(0);
  const [selectedGoal, setSelectedGoal] = useState<GoalOption | null>(null);
  const [selectedExperience, setSelectedExperience] = useState<ExperienceOption | null>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentOption[]>([]);

  const canProceed =
    step === 0 ? selectedGoal !== null :
    step === 1 ? selectedExperience !== null :
    true;

  function isPresetActive(preset: EquipmentOption[]) {
    return preset.every(item => selectedEquipment.includes(item));
  }

  function toggleEquipment(item: EquipmentOption) {
    setSelectedEquipment(prev =>
      prev.includes(item) ? prev.filter(e => e !== item) : [...prev, item],
    );
  }

  function handleNext() {
    if (!canProceed) return;
    if (step < TOTAL_STEPS - 1) {
      setStep(s => s + 1);
      return;
    }
    if (selectedGoal) setGoal(selectedGoal);
    if (selectedExperience) setExperience(selectedExperience);
    setEquipment(selectedEquipment);
    completeOnboarding();
    navigation.replace('Main');
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.dotsRow}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { backgroundColor: i <= step ? colors.primary : colors.border },
            ]}
          />
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === 0 && (
          <>
            <Text style={[styles.title, { color: colors.text }]}>What's your main goal?</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              We'll tailor your plan around this
            </Text>
            {GOAL_OPTIONS.map(g => (
              <TouchableOpacity
                key={g}
                style={[
                  styles.card,
                  { backgroundColor: colors.surface, borderColor: selectedGoal === g ? colors.primary : colors.border },
                ]}
                onPress={() => setSelectedGoal(g)}
                activeOpacity={0.8}
              >
                <Text style={[styles.cardTitle, { color: colors.text }]}>{g}</Text>
                <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
                  {GOAL_DESCRIPTIONS[g]}
                </Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        {step === 1 && (
          <>
            <Text style={[styles.title, { color: colors.text }]}>Your experience level?</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Helps us set the right intensity and volume
            </Text>
            {EXPERIENCE_OPTIONS.map(e => (
              <TouchableOpacity
                key={e}
                style={[
                  styles.card,
                  { backgroundColor: colors.surface, borderColor: selectedExperience === e ? colors.primary : colors.border },
                ]}
                onPress={() => setSelectedExperience(e)}
                activeOpacity={0.8}
              >
                <Text style={[styles.cardTitle, { color: colors.text }]}>{e}</Text>
                <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
                  {EXPERIENCE_DESCRIPTIONS[e]}
                </Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        {step === 2 && (
          <>
            <Text style={[styles.title, { color: colors.text }]}>What equipment do you have?</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Select all that apply — you can update this in Profile anytime
            </Text>
            <View style={styles.presetRow}>
              {(
                [
                  { label: 'I train at a gym', sub: 'Full equipment access', preset: GYM_PRESET },
                  { label: 'I train at home', sub: 'Minimal home setup', preset: HOME_PRESET },
                ] as const
              ).map(({ label, sub, preset }) => {
                const active = isPresetActive(preset);
                return (
                  <TouchableOpacity
                    key={label}
                    style={[
                      styles.presetCard,
                      {
                        backgroundColor: active ? colors.primary : colors.surface,
                        borderColor: active ? colors.primary : colors.border,
                        flex: 1,
                      },
                    ]}
                    onPress={() => setSelectedEquipment([...preset])}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.presetLabel, { color: active ? '#fff' : colors.text }]}>
                      {label}
                    </Text>
                    <Text style={[styles.presetSub, { color: active ? 'rgba(255,255,255,0.75)' : colors.textMuted }]}>
                      {sub}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[styles.orLabel, { color: colors.textMuted }]}>or pick individually</Text>
            <View style={styles.chipGrid}>
              {EQUIPMENT_OPTIONS.map(eq => {
                const selected = selectedEquipment.includes(eq);
                return (
                  <TouchableOpacity
                    key={eq}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? colors.primary : colors.surface,
                        borderColor: selected ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => toggleEquipment(eq)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipLabel, { color: selected ? '#fff' : colors.text }]}>
                      {eq}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        {step > 0 ? (
          <TouchableOpacity
            onPress={() => setStep(s => s - 1)}
            style={styles.backBtn}
            activeOpacity={0.7}
          >
            <Text style={[styles.backText, { color: colors.textSecondary }]}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
        <TouchableOpacity
          onPress={handleNext}
          style={[
            styles.nextBtn,
            { backgroundColor: canProceed ? colors.primary : colors.border },
          ]}
          activeOpacity={canProceed ? 0.8 : 1}
        >
          <Text style={styles.nextBtnText}>
            {step === TOTAL_STEPS - 1 ? 'Get my plan' : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 16,
    paddingBottom: 4,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 6 },
  subtitle: { fontSize: 15, marginBottom: 20 },
  card: {
    borderRadius: 12,
    borderWidth: 2,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 17, fontWeight: '600' },
  cardSubtitle: { fontSize: 13, marginTop: 4 },
  presetRow: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  presetCard: { borderRadius: 12, borderWidth: 2, padding: 14 },
  presetLabel: { fontSize: 14, fontWeight: '600' },
  presetSub: { fontSize: 12, marginTop: 3 },
  orLabel: { fontSize: 13, marginBottom: 12, marginTop: 8 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    borderRadius: 8,
    borderWidth: 1.5,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  chipLabel: { fontSize: 14, fontWeight: '500' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { minWidth: 60 },
  backText: { fontSize: 16 },
  nextBtn: { borderRadius: 10, paddingVertical: 14, paddingHorizontal: 28 },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
