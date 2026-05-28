import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import Button from '../components/Button';
import AuthInput from '../components/AuthInput';
import BrandMark from '../components/BrandMark';
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
    <View style={styles.root}>
      <LinearGradient
        colors={[`${colors.primary}14`, colors.background] as const}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboard}
        >
          <View style={styles.content}>
            <View style={styles.brandWrap}>
              <BrandMark />
            </View>

            <Text style={[styles.title, { color: colors.text }]}>Create account</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Sign up to start planning workouts
            </Text>

            <View style={styles.form}>
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
                <View style={[styles.noticeBox, { backgroundColor: colors.surface, borderColor: colors.error }]}>
                  <Text style={[styles.notice, { color: colors.error }]}>{error}</Text>
                </View>
              ) : null}
              {success ? (
                <View style={[styles.noticeBox, { backgroundColor: colors.successSoft, borderColor: colors.success }]}>
                  <Text style={[styles.notice, { color: colors.success }]}>
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
              <Text style={[styles.footerText, { color: colors.textMuted }]}>
                Already have an account?{' '}
              </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login' as never)}>
                <Text style={[styles.link, { color: colors.primary }]}>Sign in</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1 },
  keyboard: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 48 },
  brandWrap: { marginBottom: 32 },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 15, textAlign: 'center', marginBottom: 28 },
  form: {},
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  field: { marginBottom: 14 },
  passwordField: { marginBottom: 8 },
  passwordHint: { fontSize: 12, marginBottom: 14 },
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
