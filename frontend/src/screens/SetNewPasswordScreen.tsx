import React, { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import Button from '../components/Button';
import AuthInput from '../components/AuthInput';
import AuthNotice from '../components/AuthNotice';
import AuthScreenLayout from '../components/AuthScreenLayout';
import { supabase } from '../lib/supabase';
import { validatePassword, mapAuthError } from '../lib/authValidation';

import { spacing, text, weight } from '../theme';
/**
 * Shown after the user opens the password-reset link from email (PASSWORD_RECOVERY session).
 */
export default function SetNewPasswordScreen() {
  const { colors } = useTheme();
  const { signOut, clearPasswordRecoveryMode } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) {
      setError(mapAuthError(err.message));
      return;
    }
    clearPasswordRecoveryMode();
  };

  return (
    <AuthScreenLayout
      title="Choose a new password"
      subtitle="Your email link was verified. Set a new password to continue."
    >
      <Text style={[styles.label, { color: colors.textSecondary }]}>New password</Text>
      <AuthInput
        containerStyle={styles.field}
        leadingIcon="lock-closed-outline"
        secure
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        autoComplete="new-password"
      />

      <Text style={[styles.label, { color: colors.textSecondary }]}>Confirm password</Text>
      <AuthInput
        containerStyle={styles.field}
        leadingIcon="lock-closed-outline"
        secure
        value={confirm}
        onChangeText={setConfirm}
        placeholder="••••••••"
        autoComplete="new-password"
      />

      {error ? <AuthNotice>{error}</AuthNotice> : null}

      <Button
        title="Update password"
        onPress={handleSubmit}
        loading={loading}
        style={styles.button}
      />

      <Text style={[styles.hint, { color: colors.textMuted }]}>
        Wrong person? Sign out and use another account.
      </Text>
      <Button
        title="Sign out"
        onPress={() => signOut()}
        variant="secondary"
        disabled={loading}
      />
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: text.body, fontWeight: weight.semibold, marginBottom: spacing.sm },
  field: { marginBottom: spacing.lg },
  button: { marginTop: spacing.xs },
  hint: { fontSize: text.body, marginTop: spacing.xxl, marginBottom: spacing.sm, textAlign: 'center' },
});
