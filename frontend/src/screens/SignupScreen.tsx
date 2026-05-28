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
    success: { color: colors.success },
    successBox: { backgroundColor: colors.successSoft, borderColor: colors.success },
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

          <Text style={[styles.title, themed.title]}>Create account</Text>
          <Text style={[styles.subtitle, themed.subtitle]}>
            Sign up to start planning workouts
          </Text>

          <View style={styles.form}>
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

            <Text style={[styles.label, themed.label]}>
              Password (min {MIN_PASSWORD_LENGTH} characters)
            </Text>
            <PasswordInput
              containerStyle={styles.passwordField}
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
                    color:
                      password.length >= MIN_PASSWORD_LENGTH ? colors.success : colors.textMuted,
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

            {error ? (
              <View style={[styles.noticeBox, themed.errorBox]}>
                <Text style={[styles.notice, themed.error]}>{error}</Text>
              </View>
            ) : null}
            {success ? (
              <View style={[styles.noticeBox, themed.successBox]}>
                <Text style={[styles.notice, themed.success]}>
                  Check your email to confirm your account, then sign in.
                </Text>
              </View>
            ) : null}

            <Button
              title="Sign up"
              onPress={handleSignUp}
              loading={loading}
              disabled={success}
              style={styles.button}
            />
          </View>

          <View style={styles.footer}>
            <Text style={[styles.footerText, themed.subtitle]}>Already have an account? </Text>
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
  passwordField: { marginBottom: 8 },
  passwordHint: {
    fontSize: 12,
    marginBottom: 14,
  },
  noticeBox: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  notice: { fontSize: 14, lineHeight: 19 },
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
