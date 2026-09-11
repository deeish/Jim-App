import React, { useCallback, useState } from 'react';
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
import AuthInput from '../components/AuthInput';
import AuthNotice from '../components/AuthNotice';
import Button from '../components/Button';
import { AUTH_BUTTON_HEIGHT } from '../components/SignInButtons';
import { mapAuthError } from '../lib/authValidation';
import { mapCodeError } from '../lib/authIdentity';
import type { AuthStackParamList } from '../types/navigation';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Password'>;
type Route = RouteProp<AuthStackParamList, 'Password'>;

/**
 * Password fallback for accounts created before emailed codes. One field with a
 * show/hide toggle (no confirm field); "Email me a code" is the recovery path,
 * so there is no separate forgot-password screen any more.
 */
export default function PasswordScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const email = params.email;
  const { colors } = useTheme();
  const { signIn, sendEmailCode } = useAuth();

  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'signin' | 'code' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = useCallback(async () => {
    setError(null);
    if (!password) {
      setError('Password is required');
      return;
    }
    setBusy('signin');
    const { error: err } = await signIn(email, password);
    setBusy(null);
    if (err) setError(mapAuthError(err.message));
  }, [email, password, signIn]);

  const handleEmailCode = useCallback(async () => {
    setError(null);
    setBusy('code');
    const { error: err } = await sendEmailCode(email);
    setBusy(null);
    if (err) {
      setError(mapCodeError(err.message) ?? mapAuthError(err.message));
      return;
    }
    Keyboard.dismiss();
    navigation.replace('EmailCode', { email });
  }, [email, navigation, sendEmailCode]);

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

              <Text style={[styles.title, { color: colors.text }]}>Enter your password</Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                Signing in as{' '}
                <Text style={[styles.subtitleStrong, { color: colors.textSecondary }]}>{email}</Text>.{' '}
                <Text
                  style={[styles.inlineLink, { color: colors.primary }]}
                  onPress={() => navigation.popToTop()}
                  accessibilityRole="link"
                >
                  Change
                </Text>
              </Text>

              <AuthInput
                testID="e2e-login-password"
                leadingIcon="lock-closed-outline"
                secure
                value={password}
                onChangeText={(t) => {
                  if (error) setError(null);
                  setPassword(t);
                }}
                placeholder="Password"
                autoComplete="password"
                textContentType="password"
                returnKeyType="go"
                autoFocus
                editable={busy === null}
                onSubmitEditing={() => void handleSignIn()}
              />

              <TouchableOpacity
                style={styles.forgotWrap}
                onPress={() => void handleEmailCode()}
                disabled={busy !== null}
                hitSlop={8}
                testID="e2e-password-email-code"
              >
                <Text style={[styles.forgotText, { color: colors.primary }]}>
                  {busy === 'code' ? 'Sending a code…' : 'Forgot it? Email me a code'}
                </Text>
              </TouchableOpacity>

              {error ? <AuthNotice>{error}</AuthNotice> : null}

              <View style={styles.spacer} />

              <Button
                title="Sign in"
                onPress={() => void handleSignIn()}
                loading={busy === 'signin'}
                disabled={busy === 'code'}
                style={styles.primary}
                testID="e2e-login-submit"
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
  forgotWrap: { alignSelf: 'flex-end', marginTop: spacing.lg, marginBottom: spacing.lg },
  forgotText: { fontSize: text.body, fontWeight: weight.semibold },
  spacer: { flex: 1 },
  primary: {
    height: AUTH_BUTTON_HEIGHT,
    paddingVertical: 0,
    justifyContent: 'center',
    borderRadius: radius.md,
  },
});
