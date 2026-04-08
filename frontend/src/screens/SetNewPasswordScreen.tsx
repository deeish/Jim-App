import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import Button from '../components/Button';
import { supabase } from '../lib/supabase';

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
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters');
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
      setError(err.message ?? 'Could not update password');
      return;
    }
    clearPasswordRecoveryMode();
  };

  const themed = {
    container: { backgroundColor: colors.background },
    title: { color: colors.text },
    subtitle: { color: colors.textMuted },
    input: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      color: colors.text,
    },
    label: { color: colors.textSecondary },
    error: { color: colors.error },
    muted: { color: colors.textMuted },
  };

  return (
    <SafeAreaView style={[styles.container, themed.container]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <View style={styles.content}>
          <Text style={[styles.title, themed.title]}>Choose a new password</Text>
          <Text style={[styles.subtitle, themed.subtitle]}>
            Your email link was verified. Set a new password to continue.
          </Text>

          <Text style={[styles.label, themed.label]}>New password</Text>
          <TextInput
            style={[styles.input, themed.input]}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoComplete="new-password"
          />

          <Text style={[styles.label, themed.label]}>Confirm password</Text>
          <TextInput
            style={[styles.input, themed.input]}
            value={confirm}
            onChangeText={setConfirm}
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoComplete="new-password"
          />

          {error ? (
            <Text style={[styles.error, themed.error]}>{error}</Text>
          ) : null}

          <Button
            title="Update password"
            onPress={handleSubmit}
            loading={loading}
            style={styles.button}
          />

          <Text style={[styles.hint, themed.muted]}>
            Wrong person? Sign out and use another account.
          </Text>
          <Button
            title="Sign out"
            onPress={() => signOut()}
            variant="secondary"
            style={styles.secondaryBtn}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboard: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 28,
    lineHeight: 22,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 20,
  },
  error: {
    fontSize: 14,
    marginBottom: 12,
  },
  button: { marginTop: 8 },
  hint: { fontSize: 14, marginTop: 24, marginBottom: 8, textAlign: 'center' },
  secondaryBtn: { marginTop: 0 },
});
