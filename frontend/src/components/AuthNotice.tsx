import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';

type Props = {
  children: React.ReactNode;
  variant?: 'error' | 'success';
  style?: StyleProp<ViewStyle>;
};

/**
 * Boxed inline notice for auth forms. One treatment for both error and success
 * states so every auth screen surfaces messages identically.
 */
export default function AuthNotice({ children, variant = 'error', style }: Props) {
  const { colors } = useTheme();
  const isError = variant === 'error';
  return (
    <View
      style={[
        styles.box,
        {
          backgroundColor: isError ? colors.surface : colors.successSoft,
          borderColor: isError ? colors.error : colors.success,
        },
        style,
      ]}
    >
      <Text style={[styles.text, { color: isError ? colors.error : colors.success }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  text: { fontSize: 14, lineHeight: 19 },
});
