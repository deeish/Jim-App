import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { leading, radius, spacing, text, tracking, useTheme, weight } from '../theme';
import AuthHero from '../components/AuthHero';
import AuthSheet from '../components/AuthSheet';
import Button from '../components/Button';
import { AUTH_BUTTON_HEIGHT } from '../components/SignInButtons';
import { haptics } from '../lib/haptics';
import type { AuthStackParamList } from '../types/navigation';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Welcome'>;
type IconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * Shown once per install, before any account is asked for: what the app does,
 * in three lines, then one button. A device that has ever held a session skips
 * straight to Sign in (App.tsx reads `hasSignedInBefore`).
 */
export default function WelcomeScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const go = () => {
    haptics.step();
    navigation.navigate('SignIn');
  };

  return (
    <View style={styles.root}>
      <AuthHero interactive>
        <Text style={[styles.title, { color: colors.text }]}>
          Let&apos;s build <Text style={{ color: colors.primary }}>your plan</Text>
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          A few quick questions and we&apos;ll tailor a program to your goals, schedule, and
          equipment.
        </Text>
      </AuthHero>

      <AuthSheet>
        <View style={styles.features}>
          <Feature icon="barbell-outline" label="Matched to your goal" />
          <Feature icon="calendar-outline" label="Fits your weekly schedule" />
          <Feature icon="construct-outline" label="Uses only your equipment" />
        </View>
        <Button title="Get started" onPress={go} style={styles.primary} testID="e2e-welcome-start" />
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textMuted }]}>Already have an account? </Text>
          <TouchableOpacity onPress={go} hitSlop={8} testID="e2e-welcome-login">
            <Text style={[styles.footerLink, { color: colors.primary }]}>Log in</Text>
          </TouchableOpacity>
        </View>
      </AuthSheet>
    </View>
  );
}

function Feature({ icon, label }: { icon: IconName; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.feature}>
      <View style={[styles.featureIcon, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <Text style={[styles.featureText, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: {
    fontSize: text.display,
    lineHeight: leading.display,
    fontWeight: weight.heavy,
    letterSpacing: tracking.tight,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  subtitle: {
    fontSize: text.callout,
    lineHeight: leading.callout,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  features: { gap: spacing.sm, marginBottom: spacing.xl },
  feature: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, height: 44 },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: { fontSize: text.callout, lineHeight: leading.callout, fontWeight: weight.semibold },
  primary: {
    height: AUTH_BUTTON_HEIGHT,
    paddingVertical: 0,
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.lg,
    height: 22,
  },
  footerText: { fontSize: text.callout, lineHeight: leading.callout },
  footerLink: { fontSize: text.callout, lineHeight: leading.callout, fontWeight: weight.semibold },
});
