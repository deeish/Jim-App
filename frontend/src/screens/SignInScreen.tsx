import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { leading, radius, spacing, text, tracking, useTheme, weight } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { useDevPreview } from '../contexts/DevPreviewContext';
import AuthHero from '../components/AuthHero';
import AuthSheet from '../components/AuthSheet';
import AuthInput from '../components/AuthInput';
import AuthNotice from '../components/AuthNotice';
import Button from '../components/Button';
import { AUTH_BUTTON_HEIGHT, AppleSignInButton, GoogleSignInButton } from '../components/SignInButtons';
import { mapAuthError, validateEmail } from '../lib/authValidation';
import { mapCodeError, normalizeEmail } from '../lib/authIdentity';
import {
  isAppleSignInAvailable,
  isGoogleSignInAvailable,
  requestAppleCredential,
  requestGoogleCredential,
  type ProviderName,
} from '../lib/authProviders';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '../constants/legalUrls';
import type { AuthStackParamList } from '../types/navigation';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'SignIn'>;
type Busy = ProviderName | 'email' | null;

/**
 * One screen for both log in and sign up (identifier-first). Apple, then Google,
 * then an email that gets a 6-digit code. Brand in the hero, every control in
 * the bottom sheet; the sheet rides up over the keyboard and the hero folds.
 */
export default function SignInScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const { sendEmailCode, signInWithProvider, recoveryLinkError, clearRecoveryLinkError } = useAuth();
  const { setPreviewOnboarding } = useDevPreview();

  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const googleAvailable = useMemo(() => isGoogleSignInAvailable(), []);

  useEffect(() => {
    let cancelled = false;
    isAppleSignInAvailable().then((ok) => {
      if (!cancelled) setAppleAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // While typing, the hero folds into a brand row and the legal line hides, so the
  // sheet's controls sit directly above the keyboard (HIG keyboard layout guide).
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvent, () => setKeyboardOpen(true));
    const h = Keyboard.addListener(hideEvent, () => setKeyboardOpen(false));
    return () => {
      s.remove();
      h.remove();
    };
  }, []);

  const notice = error ?? recoveryLinkError;
  const dismissNotices = useCallback(() => {
    if (error) setError(null);
    if (recoveryLinkError) clearRecoveryLinkError();
  }, [error, recoveryLinkError, clearRecoveryLinkError]);

  const handleProvider = useCallback(
    async (provider: ProviderName) => {
      dismissNotices();
      setBusy(provider);
      const res = provider === 'apple' ? await requestAppleCredential() : await requestGoogleCredential();
      if (res.status === 'cancelled') {
        setBusy(null);
        return;
      }
      if (res.status === 'error') {
        setBusy(null);
        setError(mapAuthError(res.error.message));
        return;
      }
      const { error: err } = await signInWithProvider(res.credential);
      setBusy(null);
      if (err) setError(mapCodeError(err.message) ?? mapAuthError(err.message));
      // On success the session lands in AuthContext and App.tsx swaps stacks.
    },
    [dismissNotices, signInWithProvider],
  );

  const handleContinue = useCallback(async () => {
    dismissNotices();
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    const address = normalizeEmail(email);
    setBusy('email');
    const { error: err } = await sendEmailCode(address);
    setBusy(null);
    if (err) {
      setError(mapCodeError(err.message) ?? mapAuthError(err.message));
      return;
    }
    Keyboard.dismiss();
    navigation.navigate('EmailCode', { email: address });
  }, [dismissNotices, email, navigation, sendEmailCode]);

  const hasProviders = appleAvailable || googleAvailable;
  const showLegal = !keyboardOpen && (TERMS_OF_SERVICE_URL || PRIVACY_POLICY_URL);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.root}>
          <AuthHero collapsed={keyboardOpen} tagline="Your plan, your history, your crew." />

          <AuthSheet>
            {appleAvailable ? (
              <AppleSignInButton onPress={() => void handleProvider('apple')} disabled={busy !== null} />
            ) : null}
            {googleAvailable ? (
              <GoogleSignInButton
                onPress={() => void handleProvider('google')}
                disabled={busy !== null}
                loading={busy === 'google'}
              />
            ) : null}

            {hasProviders ? (
              <View style={styles.divider}>
                <View style={[styles.rule, { backgroundColor: colors.border }]} />
                <Text style={[styles.dividerText, { color: colors.textMuted }]}>or continue with email</Text>
                <View style={[styles.rule, { backgroundColor: colors.border }]} />
              </View>
            ) : (
              <Text style={[styles.label, { color: colors.textSecondary }]}>Email</Text>
            )}

            <AuthInput
              testID="e2e-login-email"
              containerStyle={styles.field}
              leadingIcon="mail-outline"
              value={email}
              onChangeText={(t) => {
                dismissNotices();
                setEmail(t);
              }}
              placeholder="Email address"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="username"
              returnKeyType="go"
              editable={busy === null}
              onSubmitEditing={() => void handleContinue()}
            />

            {notice ? <AuthNotice>{notice}</AuthNotice> : null}

            <Button
              title="Continue"
              onPress={() => void handleContinue()}
              loading={busy === 'email'}
              disabled={busy !== null && busy !== 'email'}
              style={styles.primary}
              testID="e2e-login-continue"
            />

            {showLegal ? (
              <Text style={[styles.legal, { color: colors.textMuted }]}>
                By continuing you agree to the{' '}
                <LegalLink label="Terms" url={TERMS_OF_SERVICE_URL} />
                {' '}and{' '}
                <LegalLink label="Privacy Policy" url={PRIVACY_POLICY_URL} />.
              </Text>
            ) : null}

            {__DEV__ && !keyboardOpen ? (
              <TouchableOpacity
                style={styles.devLink}
                onPress={() => setPreviewOnboarding(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.devLinkText, { color: colors.textMuted }]}>
                  Preview onboarding (dev)
                </Text>
              </TouchableOpacity>
            ) : null}
          </AuthSheet>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

function LegalLink({ label, url }: { label: string; url: string | null | undefined }) {
  const { colors } = useTheme();
  if (!url) return <Text>{label}</Text>;
  return (
    <Text
      style={{ color: colors.primary, fontWeight: weight.semibold }}
      onPress={() => void Linking.openURL(url)}
      accessibilityRole="link"
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  rule: { flex: 1, height: StyleSheet.hairlineWidth * 2 },
  dividerText: {
    fontSize: text.footnote,
    fontWeight: weight.semibold,
    letterSpacing: tracking.widest,
    textTransform: 'uppercase',
  },
  label: { fontSize: text.body, fontWeight: weight.semibold, marginBottom: spacing.sm },
  field: { marginBottom: spacing.md },
  primary: {
    height: AUTH_BUTTON_HEIGHT,
    paddingVertical: 0,
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  legal: {
    fontSize: text.footnote,
    lineHeight: leading.footnote,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  devLink: { alignSelf: 'center', marginTop: spacing.md },
  devLinkText: { fontSize: text.body, fontWeight: weight.semibold, textDecorationLine: 'underline' },
});
