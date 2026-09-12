import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import type { ColorPalette } from '../theme/colors';
import { useTheme } from '../theme';
import { haptics } from '../lib/haptics';
import type { SegmentCount } from '../lib/jimMark';
import JimMark from './JimMark';

/**
 * Size the lockup's mark renders at, in points. The native splash image
 * (`frontend/assets/splash.png`) draws the same mark at this size so the
 * splash -> LoadingScreen handoff does not jump; `SPLASH_MARK_PT` in
 * `brand/tools/generate.js` must stay equal to this.
 */
export const JIM_LOGO_MARK_PT = 96;

/** Interval between segments when the mark "does a rep" on tap. */
const REP_STEP_MS = 90;

/**
 * The Jim brand lockup: the five-segment mark with the "Jim" wordmark beneath.
 * Shared by the cold-start loader, the signed-out hero, and onboarding.
 *
 * - `showTagline` renders the "Workout plans, built around you" line.
 * - `interactive` makes the mark tappable: it empties and refills one segment
 *   at a time, a rep. Welcome/onboarding only.
 * - `entrance` plays a one-time reveal of the wordmark and tagline UNDER an
 *   already-visible mark; the mark itself is never faded in because the native
 *   splash shows it at rest and any fade would read as a blink at the handoff.
 */
export default function JimLogo({
  showTagline = false,
  interactive = false,
  entrance = false,
}: {
  showTagline?: boolean;
  interactive?: boolean;
  entrance?: boolean;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const [filled, setFilled] = useState<SegmentCount>(5);
  const repTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const repping = useRef(false);

  const enterWord = useSharedValue(entrance ? 0 : 1);
  const enterTag = useSharedValue(entrance ? 0 : 1);

  useEffect(() => {
    if (!entrance) return;
    enterWord.value = withDelay(150, withTiming(1, { duration: 420, easing: Easing.out(Easing.ease) }));
    enterTag.value = withDelay(280, withTiming(1, { duration: 420, easing: Easing.out(Easing.ease) }));
  }, [entrance, enterWord, enterTag]);

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

  const wordStyle = useAnimatedStyle(() => ({
    opacity: enterWord.value,
    transform: [{ translateY: (1 - enterWord.value) * 10 }],
  }));
  const tagStyle = useAnimatedStyle(() => ({
    opacity: enterTag.value,
    transform: [{ translateY: (1 - enterTag.value) * 8 }],
  }));

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
      <Animated.Text style={[styles.wordmark, wordStyle]}>Jim</Animated.Text>
      {showTagline ? (
        <Animated.Text style={[styles.tagline, tagStyle]}>
          Workout plans, built around you
        </Animated.Text>
      ) : null}
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
