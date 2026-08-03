import React, { useState, forwardRef } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  type TextInputProps,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * Pinned on secure fields so the keyboard's shape does not change when the
 * show/hide eye flips `secureTextEntry`.
 *
 * iOS suppresses the QuickType predictive strip for a secure field and restores
 * it for a plain one. RN passes `autoCorrect` through as an unset optional, so
 * UIKit's per-mode default applies and the keyboard grows ~44pt taller the
 * moment the password is revealed. That height change is what visibly moves the
 * auth screens. Fixing both states to the same behaviour removes the delta.
 *
 * Setting `autoCapitalize` also fixes an unrelated papercut: with the password
 * revealed, iOS was auto-capitalising newly typed characters.
 */
const SECURE_KEYBOARD_PROPS = {
  autoCorrect: false,
  spellCheck: false,
  autoCapitalize: 'none',
} as const;

type Props = Omit<TextInputProps, 'secureTextEntry'> & {
  value: string;
  onChangeText: (text: string) => void;
  leadingIcon?: IconName;
  /** Adds secure entry + a show/hide toggle. */
  secure?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
};

/**
 * Auth form field: bordered row with an optional leading icon and, for
 * passwords, a show/hide toggle. The border + leading icon highlight in the
 * primary color while focused. Email and password fields share this so they're
 * visually identical. All other TextInput props pass through.
 */
const AuthInput = forwardRef<TextInput, Props>(function AuthInput(
  {
    value,
    onChangeText,
    leadingIcon,
    secure = false,
    containerStyle,
    onFocus,
    onBlur,
    ...rest
  },
  ref,
) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.surface, borderColor: focused ? colors.primary : colors.border },
        containerStyle,
      ]}
    >
      {leadingIcon ? (
        <Ionicons
          name={leadingIcon}
          size={20}
          color={focused ? colors.primary : colors.textMuted}
          style={styles.leading}
        />
      ) : null}
      <TextInput
        ref={ref}
        style={[styles.input, { color: colors.text }]}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={colors.textMuted}
        secureTextEntry={secure && !visible}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...(secure ? SECURE_KEYBOARD_PROPS : null)}
        {...rest}
      />
      {secure ? (
        <TouchableOpacity
          onPress={() => setVisible((v) => !v)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          style={styles.toggle}
        >
          <Ionicons
            name={visible ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            color={colors.textMuted}
          />
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

export default AuthInput;

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  leading: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 14, fontSize: 16 },
  toggle: { paddingLeft: 12 },
});
