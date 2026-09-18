import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SPLASH, SPLASH_DARK } from '../lib/jimMark';
import { useTheme } from '../theme/ThemeContext';
import JimMark from './JimMark';

/**
 * Cold-start loader: the native splash frame, redrawn in JS. Flat ground, the
 * solid mark at the splash's exact size and position, nothing else: no
 * aurora, no wordmark. The native splash hides the moment this paints, so the
 * only way the handoff is invisible is for this to be the same picture (see
 * `SPLASH` / `SPLASH_DARK` in lib/jimMark.ts and `brand/tools/generate.js`).
 *
 * Two frames, one per theme (2026-09-18): the light splash frame on the light
 * theme, the dark one on the dark theme. The theme is known synchronously at
 * launch (lib/themeStore.ts), so a dark-theme user never sees the light
 * frame. The native splash itself follows the PHONE's appearance (iOS draws
 * it before the app runs), so a phone set to light with the app set to dark
 * still opens on the light native splash and crosses to dark here.
 *
 * There is deliberately no launch animation: apps that launch well show a
 * static mark for exactly as long as they need and then get out of the way,
 * and that is the bar here (decided with Dylan, 2026-09-13; the eight
 * prototyped candidates are in the worklog). `App.tsx` holds this only until
 * the session and preferences are ready, then dissolves it over the app. On
 * the dark theme that dissolve is also where the ground crosses from the light
 * splash to the dark app.
 */
export default function LoadingScreen() {
  const { mode } = useTheme();
  const frame = mode === 'dark' ? SPLASH_DARK : SPLASH;
  return (
    <View style={[styles.root, { backgroundColor: frame.background }]} accessibilityLabel="Loading">
      <JimMark size={frame.markPt} color={frame.mark} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
