import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { leading, radius, spacing, text, tracking, useTheme, weight } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import CodeInput from '../components/CodeInput';
import AuthNotice from '../components/AuthNotice';
import Button from '../components/Button';
import { AUTH_BUTTON_HEIGHT } from '../components/SignInButtons';
import { mapAuthError } from '../lib/authValidation';
import { OTP_RESEND_SECONDS, formatCountdown, isCompleteOtp, mapCodeError } from '../lib/authIdentity';
import { haptics } from '../lib/haptics';
import type { AuthStackParamList } from '../types/navigation';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'EmailCode'>;
type Route = RouteProp<AuthStackParamList, 'EmailCode'>;

/**
 * Second step of the email path: the 6-digit code from the inbox. Submits itself
 * on the last digit (iOS offers the code from Mail above the keyboard). "Use
 * password instead" is the fallback for accounts that still have one.
 */
export default function EmailCodeScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const email = params.email;
  const { colors } = useTheme();
  const { verifyEmailCode, sendEmailCode } = useAuth();

  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentNotice, setSentNotice] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(OTP_RESEND_SECONDS);

  // One interval for the resend countdown; restarted after each successful resend.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  const verifyingRef = useRef(false);
  const submit = useCallback(
    async (value: string) => {
      if (verifyingRef.current || !isCompleteOtp(value)) return;
      verifyingRef.current = true;
      setVerifying(true);
      setError(null);
      setSentNotice(false);
      const { error: err } = await verifyEmailCode(email, value);
      verifyingRef.current = false;
      setVerifying(false);
      if (err) {
        haptics.tap();
        setError(mapCodeError(err.message) ?? mapAuthError(err.message));
        setCode('');
        return;
      }
      haptics.success();
      // Session is live; App.tsx swaps to the signed-in stack.
    },
    [email, verifyEmailCode],
  );

  const resend = useCallback(async () => {
    if (secondsLeft > 0 || resending) return;
    setResending(true);
    setError(null);
    const { error: err } = await sendEmailCode(email);
    setResending(false);
    if (err) {
      setError(mapCodeError(err.message) ?? mapAuthError(err.message));
      return;
    }
    setCode('');
    setSentNotice(true);
    setSecondsLeft(OTP_RESEND_SECONDS);
  }, [email, resending, secondsLeft, sendEmailCode]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.root}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <Animated.View entering={FadeInDown.duration(260)} style={styles.content}>
              <TouchableOpacity
                style={styles.back}
                onPress={() => navigation.goBack()}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Back"
              >
                <Ionicons name="chevron-back" size={22} color={colors.primary} />
                <Text style={[styles.backText, { color: colors.primary }]}>Back</Text>
              </TouchableOpacity>

              <Text style={[styles.title, { color: colors.text }]}>Enter the code</Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                We sent a 6-digit code to{' '}
                <Text style={[styles.subtitleStrong, { color: colors.textSecondary }]}>{email}</Text>.{' '}
                <Text
                  style={[styles.inlineLink, { color: colors.primary }]}
                  onPress={() => navigation.goBack()}
                  accessibilityRole="link"
                >
                  Change
                </Text>
              </Text>

              <CodeInput
                value={code}
                onChange={(v) => {
                  if (error) setError(null);
                  setCode(v);
                }}
                onComplete={(v) => void submit(v)}
                error={!!error}
                disabled={verifying}
                testID="e2e-login-code"
              />

              <View style={styles.metaRow}>
                {secondsLeft > 0 ? (
                  <Text style={[styles.meta, { color: colors.textMuted }]}>
                    Resend code in {formatCountdown(secondsLeft)}
                  </Text>
                ) : (
                  <TouchableOpacity onPress={() => void resend()} disabled={resending} hitSlop={8}>
                    <Text style={[styles.metaLink, { color: colors.primary }]}>
                      {resending ? 'Sending…' : 'Resend code'}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => navigation.navigate('Password', { email })}
                  hitSlop={8}
                  testID="e2e-code-use-password"
                >
                  <Text style={[styles.metaLink, { color: colors.primary }]}>Use password instead</Text>
                </TouchableOpacity>
              </View>

              {error ? <AuthNotice style={styles.notice}>{error}</AuthNotice> : null}
              {sentNotice && !error ? (
                <AuthNotice variant="success" style={styles.notice}>
                  New code sent. It replaces the previous one.
                </AuthNotice>
              ) : null}

              <View style={styles.spacer} />

              <Button
                title="Continue"
                onPress={() => void submit(code)}
                loading={verifying}
                disabled={!isCompleteOtp(code)}
                style={styles.primary}
                testID="e2e-code-submit"
              />
            </Animated.View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, paddingHorizontal: spacing.xxl, paddingBottom: spacing.md },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    height: 44,
    marginLeft: -spacing.xs,
  },
  backText: { fontSize: text.callout, fontWeight: weight.semibold },
  title: {
    fontSize: text.display,
    lineHeight: leading.display,
    fontWeight: weight.bold,
    letterSpacing: tracking.tight,
    marginTop: spacing.sm,
  },
  subtitle: {
    fontSize: text.callout,
    lineHeight: leading.callout,
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
  },
  subtitleStrong: { fontWeight: weight.semibold },
  inlineLink: { fontWeight: weight.semibold },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  meta: { fontSize: text.body, lineHeight: leading.body },
  metaLink: { fontSize: text.body, lineHeight: leading.body, fontWeight: weight.semibold },
  notice: { marginBottom: spacing.lg },
  spacer: { flex: 1 },
  primary: {
    height: AUTH_BUTTON_HEIGHT,
    paddingVertical: 0,
    justifyContent: 'center',
    borderRadius: radius.md,
  },
});
