import React, { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import Button from '../components/Button';
import AuthInput from '../components/AuthInput';
import AuthNotice from '../components/AuthNotice';
import AuthScreenLayout from '../components/AuthScreenLayout';
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

  return (
    <AuthScreenLayout
      title="Reset password"
      subtitle={
        sent
          ? 'If an account exists for that email, we sent a link. Open it on this device to choose a new password.'
          : 'We will email you a link to reset your password.'
      }
      centerContent
      onBack={() => navigation.goBack()}
      backLabel="Back to sign in"
    >
      {!sent ? (
        <>
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
          />

          {error ? <AuthNotice>{error}</AuthNotice> : null}

          <Button
            title="Send reset link"
            onPress={handleSend}
            loading={loading}
            style={styles.button}
          />
        </>
      ) : (
        <AuthNotice variant="success">
          Did not get it? Check spam, then try again with the same email.
        </AuthNotice>
      )}
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  field: { marginBottom: 14 },
  button: { marginTop: 4 },
});
