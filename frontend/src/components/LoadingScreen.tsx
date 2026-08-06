import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { ColorPalette } from '../theme/colors';
import { useTheme } from '../theme';
import Aurora from './Aurora';
import JimLogo from './JimLogo';

/**
 * Branded cold-start loader: the animated Jim brand mark over the aurora backdrop.
 * Shown by `App.tsx` while the Supabase session restores and preferences hydrate
 * (and for a short minimum so the mark's intro is seen). It does not speed up
 * startup — it just brands the wait. Reusing `JimLogo` keeps the cold start, auth,
 * and onboarding on one identity instead of inventing a separate launch visual.
 *
 * `entrance` plays a one-time staggered reveal (wordmark, then tagline) UNDER an
 * already-visible chip: the native splash image is this chip at rest, so the
 * loader takes over with the mark in place and the wordmark rising beneath it —
 * the splash "comes alive" instead of re-introducing itself. The mark stands on
 * its own — no status line — and `App.tsx` cross-fades the whole screen out once
 * the app is ready, so launch ends on a dissolve rather than a hard cut.
 */
export default function LoadingScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <View style={styles.root} accessibilityLabel="Loading">
      <Aurora colors={colors} />
      {/* Subtle theme-aware scrim: settles the aurora toward the base color so the
          mark keeps contrast in both the light and dark themes. */}
      <View style={styles.scrim} pointerEvents="none" />
      <View style={styles.center}>
        <JimLogo entrance />
      </View>
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    // `${colors.background}38` ≈ 22% of the base color (8-digit RRGGBBAA).
    scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: `${colors.background}38` },
    center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  });
}
