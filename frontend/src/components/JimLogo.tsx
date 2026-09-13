import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { ColorPalette } from '../theme/colors';
import { useTheme } from '../theme';
import { haptics } from '../lib/haptics';
import type { SegmentCount } from '../lib/jimMark';
import JimMark from './JimMark';

/** Size the lockup's mark renders at, in points. */
export const JIM_LOGO_MARK_PT = 96;

/** Interval between segments when the mark "does a rep" on tap. */
const REP_STEP_MS = 90;

/**
 * The Jim brand lockup: the five-segment mark with the "Jim" wordmark beneath.
 * Shared by the signed-out hero and onboarding. The cold-start loader does NOT
 * use it: that screen is the bare splash frame (see `LoadingScreen`).
 *
 * - `showTagline` renders the "Workout plans, built around you" line.
 * - `interactive` makes the mark tappable: it empties and refills one segment
 *   at a time, a rep. Welcome/onboarding only. This is the one place a partial
 *   fill appears in the app, and it is a frame of motion, never a measure.
 */
export default function JimLogo({
  showTagline = false,
  interactive = false,
}: {
  showTagline?: boolean;
  interactive?: boolean;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const [filled, setFilled] = useState<SegmentCount>(5);
  const repTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const repping = useRef(false);

  useEffect(
    () => () => {
      repTimers.current.forEach(clearTimeout);
    },
    [],
  );

  const handleRep = () => {
    if (repping.current) return;
    repping.current = true;
    haptics.select();
    const steps: SegmentCount[] = [0, 1, 2, 3, 4, 5];
    repTimers.current = steps.map((k, i) =>
      setTimeout(() => {
        setFilled(k);
        if (k === 5) repping.current = false;
      }, i * REP_STEP_MS),
    );
  };

  const mark = <JimMark size={JIM_LOGO_MARK_PT} filled={filled} />;

  return (
    <View style={styles.col}>
      {interactive ? (
        <Pressable
          onPress={handleRep}
          style={styles.markBox}
          accessibilityRole="imagebutton"
          accessibilityLabel="Jim logo"
        >
          {mark}
        </Pressable>
      ) : (
        <View style={styles.markBox} accessible accessibilityRole="image" accessibilityLabel="Jim logo">
          {mark}
        </View>
      )}
      <Text style={styles.wordmark}>Jim</Text>
      {showTagline ? <Text style={styles.tagline}>Workout plans, built around you</Text> : null}
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    col: { alignItems: 'center' },
    markBox: {
      width: JIM_LOGO_MARK_PT,
      height: JIM_LOGO_MARK_PT,
      alignItems: 'center',
      justifyContent: 'center',
    },
    wordmark: {
      fontSize: 30,
      fontWeight: '900',
      letterSpacing: 0.5,
      color: colors.text,
      marginTop: 2,
    },
    tagline: { fontSize: 14, fontWeight: '500', marginTop: 2, color: colors.textMuted },
  });
}
