import React, { useState } from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useDevPreview } from '../contexts/DevPreviewContext';
import Button from '../components/Button';
import AuthInput from '../components/AuthInput';
import AuthNotice from '../components/AuthNotice';
import AuthScreenLayout from '../components/AuthScreenLayout';
import { validateEmail, mapAuthError } from '../lib/authValidation';

export default function LoginScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { signIn, recoveryLinkError, clearRecoveryLinkError } = useAuth();
  const { setPreviewOnboarding } = useDevPreview();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A failed/expired reset link routes the user here with an explanation rather
  // than trapping them on the set-new-password screen.
  const notice = error ?? recoveryLinkError;

  const dismissNotices = () => {
    if (error) setError(null);
    if (recoveryLinkError) clearRecoveryLinkError();
  };

  const handleSignIn = async () => {
    setError(null);
    clearRecoveryLinkError();
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }
    setLoading(true);
    const { error: err } = await signIn(email.trim(), password);
    setLoading(false);
    if (err) {
      setError(mapAuthError(err.message));
      return;
    }
  };

  return (
    <AuthScreenLayout
      title="Welcome to Jim"
      subtitle="Log in to continue, or create an account."
      footer={
        <>
          <Text style={[styles.footerText, { color: colors.textMuted }]}>
            New here?{' '}
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Signup' as never)}>
            <Text style={[styles.link, { color: colors.primary }]}>Create an account</Text>
          </TouchableOpacity>
        </>
      }
    >
      <Text style={[styles.label, { color: colors.textSecondary }]}>Email</Text>
      <AuthInput
        testID="e2e-login-email"
        containerStyle={styles.field}
        leadingIcon="mail-outline"
        value={email}
        onChangeText={(t) => {
          dismissNotices();
          setEmail(t);
        }}
        placeholder="you@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />

      <Text style={[styles.label, { color: colors.textSecondary }]}>Password</Text>
      <AuthInput
        testID="e2e-login-password"
        containerStyle={styles.field}
        leadingIcon="lock-closed-outline"
        secure
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        autoComplete="password"
      />

      <TouchableOpacity
        style={styles.forgotWrap}
        onPress={() => navigation.navigate('ForgotPassword' as never)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={[styles.forgotText, { color: colors.primary }]}>Forgot password?</Text>
      </TouchableOpacity>

      {notice ? <AuthNotice>{notice}</AuthNotice> : null}

      <Button
        title="Sign in"
        onPress={handleSignIn}
        loading={loading}
        style={styles.button}
        testID="e2e-login-submit"
      />

      {__DEV__ ? (
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
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  field: { marginBottom: 14 },
  forgotWrap: { alignSelf: 'flex-end', marginBottom: 16 },
  forgotText: { fontSize: 14, fontWeight: '600' },
  button: { marginTop: 4 },
  devLink: { alignSelf: 'center', marginTop: 16 },
  devLinkText: { fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  footerText: { fontSize: 15 },
  link: { fontSize: 15, fontWeight: '600' },
});
