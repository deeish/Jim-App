import React, { useState } from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import Button from '../components/Button';
import AuthInput from '../components/AuthInput';
import AuthNotice from '../components/AuthNotice';
import AuthScreenLayout from '../components/AuthScreenLayout';
import {
  MIN_PASSWORD_LENGTH,
  validateEmail,
  validatePassword,
  mapAuthError,
} from '../lib/authValidation';

export default function SignupScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSignUp = async () => {
    setError(null);
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    setLoading(true);
    const { error: err } = await signUp(email.trim(), password);
    setLoading(false);
    if (err) {
      setError(mapAuthError(err.message));
      return;
    }
    setSuccess(true);
  };

  return (
    <AuthScreenLayout
      title="Create account"
      subtitle="Sign up to start planning workouts"
      footer={
        <>
          <Text style={[styles.footerText, { color: colors.textMuted }]}>
            Already have an account?{' '}
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login' as never)}>
            <Text style={[styles.link, { color: colors.primary }]}>Sign in</Text>
          </TouchableOpacity>
        </>
      }
    >
      <Text style={[styles.label, { color: colors.textSecondary }]}>Email</Text>
      <AuthInput
        containerStyle={styles.field}
        leadingIcon="mail-outline"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        editable={!success}
      />

      <Text style={[styles.label, { color: colors.textSecondary }]}>
        Password (min {MIN_PASSWORD_LENGTH} characters)
      </Text>
      <AuthInput
        containerStyle={styles.passwordField}
        leadingIcon="lock-closed-outline"
        secure
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        autoComplete="new-password"
        editable={!success}
      />
      {password.length > 0 && (
        <Text
          style={[
            styles.passwordHint,
            {
              color: password.length >= MIN_PASSWORD_LENGTH ? colors.success : colors.textMuted,
            },
          ]}
        >
          {password.length >= MIN_PASSWORD_LENGTH
            ? 'Password length looks good'
            : `${MIN_PASSWORD_LENGTH - password.length} more character${
                MIN_PASSWORD_LENGTH - password.length === 1 ? '' : 's'
              } needed`}
        </Text>
      )}

      {error ? <AuthNotice>{error}</AuthNotice> : null}
      {success ? (
        <AuthNotice variant="success">
          Check your email to confirm your account, then sign in.
        </AuthNotice>
      ) : null}

      <Button
        title="Sign up"
        onPress={handleSignUp}
        loading={loading}
        disabled={success}
        style={styles.button}
      />
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  field: { marginBottom: 14 },
  passwordField: { marginBottom: 8 },
  passwordHint: { fontSize: 12, marginBottom: 14 },
  button: { marginTop: 4 },
  footerText: { fontSize: 15 },
  link: { fontSize: 15, fontWeight: '600' },
});
