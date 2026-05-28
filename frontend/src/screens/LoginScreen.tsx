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

            <Text style={[styles.title, { color: colors.text }]}>Welcome back</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>Sign in to continue</Text>

            <View style={styles.form}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Email</Text>
              <AuthInput
                testID="e2e-login-email"
                containerStyle={styles.field}
                leadingIcon="mail-outline"
                value={email}
                onChangeText={setEmail}
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

              {error ? (
                <View style={[styles.errorBox, { backgroundColor: colors.surface, borderColor: colors.error }]}>
                  <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
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
              <Text style={[styles.footerText, { color: colors.textMuted }]}>
                Don't have an account?{' '}
              </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Signup' as never)}>
                <Text style={[styles.link, { color: colors.primary }]}>Sign up</Text>
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
  forgotWrap: { alignSelf: 'flex-end', marginBottom: 16 },
  forgotText: { fontSize: 14, fontWeight: '600' },
  errorBox: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  error: { fontSize: 14 },
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
