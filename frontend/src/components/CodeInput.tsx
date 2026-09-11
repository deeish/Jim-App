import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { radius, spacing, text, useTheme, weight } from '../theme';
import { OTP_LENGTH, digitsOnly } from '../lib/authIdentity';

type Props = {
  value: string;
  onChange: (code: string) => void;
  /** Called once the last digit lands, with the full code. */
  onComplete?: (code: string) => void;
  autoFocus?: boolean;
  /** Draws every box in the error colour (a wrong code). */
  error?: boolean;
  disabled?: boolean;
  testID?: string;
};

/**
 * Six boxes over one invisible TextInput. Keeping a single real input is what
 * makes iOS offer the code from Mail / Messages above the keyboard
 * (`textContentType="oneTimeCode"`) and lets a pasted "482 913" land in one go.
 */
export default function CodeInput({
  value,
  onChange,
  onComplete,
  autoFocus = true,
  error = false,
  disabled = false,
  testID,
}: Props) {
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const completedRef = useRef<string | null>(null);

  useEffect(() => {
    if (value.length === OTP_LENGTH && completedRef.current !== value) {
      completedRef.current = value;
      onComplete?.(value);
    }
    if (value.length < OTP_LENGTH) completedRef.current = null;
  }, [value, onComplete]);

  const activeIndex = Math.min(value.length, OTP_LENGTH - 1);

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      accessibilityRole="none"
      style={styles.wrap}
      testID={testID}
    >
      <View style={styles.row} pointerEvents="none">
        {Array.from({ length: OTP_LENGTH }, (_, i) => {
          const digit = value[i] ?? '';
          const isActive = focused && i === activeIndex && value.length < OTP_LENGTH;
          const borderColor = error ? colors.error : isActive ? colors.primary : colors.border;
          return (
            <View
              key={i}
              style={[styles.box, { backgroundColor: colors.surface, borderColor }]}
            >
              {digit ? (
                <Text style={[styles.digit, { color: colors.text }]}>{digit}</Text>
              ) : isActive ? (
                <View style={[styles.caret, { backgroundColor: colors.primary }]} />
              ) : null}
            </View>
          );
        })}
      </View>
      <TextInput
        ref={inputRef}
        style={styles.hidden}
        value={value}
        onChangeText={(t) => onChange(digitsOnly(t))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
        maxLength={OTP_LENGTH}
        autoFocus={autoFocus}
        editable={!disabled}
        caretHidden
        accessibilityLabel="Six-digit code"
        testID={testID ? `${testID}-input` : undefined}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  row: { flexDirection: 'row', gap: spacing.sm },
  box: {
    flex: 1,
    height: 60,
    borderWidth: 1.5,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: { fontSize: 24, lineHeight: 30, fontWeight: weight.semibold },
  caret: { width: 2, height: 26, borderRadius: 1 },
  // Present for focus + autofill, invisible to the eye. Full-size so a tap anywhere
  // on the row lands on it (the Pressable also focuses it explicitly).
  hidden: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
    fontSize: text.callout,
    color: 'transparent',
  },
});
