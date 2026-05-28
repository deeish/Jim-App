import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  type TextInputProps,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';

type Props = Omit<TextInputProps, 'secureTextEntry'> & {
  value: string;
  onChangeText: (text: string) => void;
  /** Margin/spacing overrides from the host screen (e.g. marginBottom). */
  containerStyle?: StyleProp<ViewStyle>;
};

/**
 * Password field with a show/hide toggle. Border + background live on the
 * wrapper so the toggle sits inside the input box. All other TextInput props
 * (testID, autoComplete, placeholder, editable, …) pass straight through.
 */
export default function PasswordInput({
  value,
  onChangeText,
  containerStyle,
  ...rest
}: Props) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.surface, borderColor: colors.border },
        containerStyle,
      ]}
    >
      <TextInput
        style={[styles.input, { color: colors.text }]}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={colors.textMuted}
        secureTextEntry={!visible}
        {...rest}
      />
      <TouchableOpacity
        onPress={() => setVisible((v) => !v)}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
      >
        <Text style={[styles.toggle, { color: colors.primary }]}>
          {visible ? 'Hide' : 'Show'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
  },
  toggle: {
    fontSize: 14,
    fontWeight: '600',
    paddingLeft: 12,
  },
});
