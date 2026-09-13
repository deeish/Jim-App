import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SPLASH } from '../lib/jimMark';
import JimMark from './JimMark';

/**
 * Cold-start loader: the native splash frame, redrawn in JS. Flat light ground,
 * the solid mark at the splash's exact size and position, nothing else: no
 * aurora, no wordmark, no theme colours. The native splash hides the moment
 * this paints, so the only way the handoff is invisible is for this to be the
 * same picture (see `SPLASH` in lib/jimMark.ts and `brand/tools/generate.js`).
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
  return (
    <View style={styles.root} accessibilityLabel="Loading">
      <JimMark size={SPLASH.markPt} color={SPLASH.mark} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SPLASH.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
