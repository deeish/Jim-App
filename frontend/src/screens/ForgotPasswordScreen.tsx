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
import { validateEmail, mapAuthError } from '../lib/authValidation';

export default function ForgotPasswordScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    setError(null);
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    setLoading(true);
    const { error: err } = await requestPasswordReset(email.trim());
    setLoading(false);
    if (err) {
      setError(mapAuthError(err.message));
      return;
    }
    setSent(true);
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
    success: { color: colors.textSecondary },
  };

  return (
    <SafeAreaView style={[styles.container, themed.container]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <View style={styles.content}>
          <TouchableOpacity
            style={styles.backLink}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={[styles.backLinkText, themed.link]}>← Back to sign in</Text>
          </TouchableOpacity>

          <Text style={[styles.title, themed.title]}>Reset password</Text>
          <Text style={[styles.subtitle, themed.subtitle]}>
            {sent
              ? 'If an account exists for that email, we sent a link. Open it on this device to choose a new password.'
              : 'We will email you a link to reset your password.'}
          </Text>

          {!sent ? (
            <>
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
              />

              {error ? (
                <Text style={[styles.error, themed.error]}>{error}</Text>
              ) : null}

              <Button
                title="Send reset link"
                onPress={handleSend}
                loading={loading}
                style={styles.button}
              />
            </>
          ) : (
            <Text style={[styles.successNote, themed.success]}>
              Did not get it? Check spam, then try again with the same email.
            </Text>
          )}
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
    paddingTop: 16,
  },
  backLink: { alignSelf: 'flex-start', marginBottom: 24 },
  backLinkText: { fontSize: 16, fontWeight: '600' },
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
  successNote: { fontSize: 15, lineHeight: 22, marginTop: 8 },
});
