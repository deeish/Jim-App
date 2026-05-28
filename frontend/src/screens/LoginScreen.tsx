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
import PasswordInput from '../components/PasswordInput';
import { validateEmail, mapAuthError } from '../lib/authValidation';

export default function LoginScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setError(null);
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

  const themed = {
    container: { backgroundColor: colors.background },
    wordmark: { color: colors.primary },
    tagline: { color: colors.textMuted },
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
    errorBox: { backgroundColor: colors.surface, borderColor: colors.error },
  };

  return (
    <SafeAreaView style={[styles.container, themed.container]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <View style={styles.content}>
          <View style={styles.brand}>
            <Text style={[styles.wordmark, themed.wordmark]}>Jim</Text>
            <Text style={[styles.tagline, themed.tagline]}>Train with intent</Text>
          </View>

          <Text style={[styles.title, themed.title]}>Welcome back</Text>
          <Text style={[styles.subtitle, themed.subtitle]}>Sign in to continue</Text>

          <View style={styles.form}>
            <Text style={[styles.label, themed.label]}>Email</Text>
            <TextInput
              testID="e2e-login-email"
              style={[styles.input, themed.input]}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />

            <Text style={[styles.label, themed.label]}>Password</Text>
            <PasswordInput
              testID="e2e-login-password"
              containerStyle={styles.passwordField}
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
              <Text style={[styles.forgotText, themed.link]}>Forgot password?</Text>
            </TouchableOpacity>

            {error ? (
              <View style={[styles.errorBox, themed.errorBox]}>
                <Text style={[styles.error, themed.error]}>{error}</Text>
              </View>
            ) : null}

            <Button
              title="Sign in"
              onPress={handleSignIn}
              loading={loading}
              style={styles.button}
              testID="e2e-login-submit"
            />
          </View>

          <View style={styles.footer}>
            <Text style={[styles.footerText, themed.subtitle]}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Signup' as never)}>
              <Text style={[styles.link, themed.link]}>Sign up</Text>
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
    paddingTop: 56,
  },
  brand: { alignItems: 'center', marginBottom: 36 },
  wordmark: { fontSize: 40, fontWeight: '800', letterSpacing: 1 },
  tagline: { fontSize: 14, fontWeight: '500', marginTop: 4 },
  title: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 28,
  },
  form: {},
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 14,
  },
  passwordField: { marginBottom: 12 },
  forgotWrap: { alignSelf: 'flex-end', marginBottom: 16 },
  forgotText: { fontSize: 14, fontWeight: '600' },
  errorBox: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  error: {
    fontSize: 14,
  },
  button: { marginTop: 4 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
  },
  footerText: { fontSize: 15 },
  link: { fontSize: 15, fontWeight: '600' },
});
