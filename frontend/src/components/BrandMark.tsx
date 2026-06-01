import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';

/**
 * App logo lockup for the auth screens: a rounded primary tile with a barbell
 * glyph, the "Jim" wordmark, and a tagline.
 */
export default function BrandMark({ showTagline = true }: { showTagline?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.tile,
          {
            backgroundColor: colors.primary,
            shadowColor: colors.shadow,
          },
        ]}
      >
        <Ionicons name="barbell" size={34} color={colors.onPrimary} />
      </View>
      <Text style={[styles.wordmark, { color: colors.text }]}>Jim</Text>
      {showTagline ? (
        <Text style={[styles.tagline, { color: colors.textMuted }]}>Train with intent</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  tile: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  wordmark: { fontSize: 30, fontWeight: '800', letterSpacing: 1 },
  tagline: { fontSize: 14, fontWeight: '500', marginTop: 2 },
});
