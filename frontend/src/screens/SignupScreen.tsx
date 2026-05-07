import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import Button from '../components/Button';

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
    if (!email.trim() || !password) {
      setError('Email and password are required');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    const { error: err } = await signUp(email.trim(), password);
    setLoading(false);
    if (err) {
      setError(err.message ?? 'Sign up failed');
      return;
    }
    setSuccess(true);
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
    link: { color: colors.primary },
    error: { color: colors.error },
    success: { color: colors.success },
  };

  return (
    <SafeAreaView style={[styles.container, themed.container]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <View style={styles.content}>
          <Text style={[styles.title, themed.title]}>Create account</Text>
          <Text style={[styles.subtitle, themed.subtitle]}>
            Sign up to start planning workouts
          </Text>

          <Text style={[styles.label, themed.label]}>Email</Text>
          <TextInput
            style={[styles.input, themed.input]}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            editable={!success}
          />

          <Text style={[styles.label, themed.label]}>Password (min 6 characters)</Text>
          <TextInput
            style={[styles.input, themed.input]}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoComplete="new-password"
            editable={!success}
          />
          {password.length > 0 && (
            <Text style={{ fontSize: 12, marginTop: 4, color: password.length >= 6 ? colors.success : colors.error }}>
              {password.length >= 6 ? 'Password length OK' : `${6 - password.length} more character${6 - password.length === 1 ? '' : 's'} needed`}
            </Text>
          )}

          {error ? (
            <Text style={[styles.error, themed.error]}>{error}</Text>
          ) : null}
          {success ? (
            <Text style={[styles.success, themed.success]}>
              Check your email to confirm your account, then sign in.
            </Text>
          ) : null}

          <Button
            title="Sign up"
            onPress={handleSignUp}
            loading={loading}
            disabled={success}
            style={styles.button}
          />

          <View style={styles.footer}>
            <Text style={[styles.footerText, themed.subtitle]}>
              Already have an account?{' '}
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login' as never)}>
              <Text style={[styles.link, themed.link]}>Sign in</Text>
            </TouchableOpacity>
          </View>
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
    marginBottom: 32,
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
  success: {
    fontSize: 14,
    marginBottom: 12,
  },
  button: { marginTop: 8 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerText: { fontSize: 15 },
  link: { fontSize: 15, fontWeight: '600' },
});
