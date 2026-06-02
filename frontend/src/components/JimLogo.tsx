import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withDelay,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import type { ColorPalette } from '../theme/colors';
import { useTheme } from '../theme';
import { haptics } from '../lib/haptics';
import JGlyph from './JGlyph';

/**
 * The Jim brand mark: a gradient "glass chip" tile with the custom gym-themed
 * Skia "J" monogram, a glossy highlight + sweeping sheen, breathing pulse rings,
 * and the "Jim" wordmark. Shared across onboarding and the auth screens.
 *
 * - `showTagline` renders the "Workout plans, built around you" line (auth screens).
 * - `interactive` enables the tap-to-flex easter egg (the J flexes its abs).
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

  const breath = useSharedValue(0);
  const pulseA = useSharedValue(0);
  const pulseB = useSharedValue(0);
  const shimmer = useSharedValue(0);
  const flex = useSharedValue(0);
  const pop = useSharedValue(0);

  useEffect(() => {
    breath.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    const pulse = () =>
      withRepeat(withTiming(1, { duration: 2800, easing: Easing.out(Easing.ease) }), -1, false);
    pulseA.value = pulse();
    pulseB.value = withDelay(1400, pulse());
    shimmer.value = withRepeat(
      withDelay(1200, withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) })),
      -1,
      false,
    );
  }, [breath, pulseA, pulseB, shimmer]);

  const handleFlex = () => {
    haptics.select();
    pop.value = withSequence(
      withTiming(1, { duration: 130, easing: Easing.out(Easing.ease) }),
      withTiming(0, { duration: 240, easing: Easing.inOut(Easing.ease) }),
    );
    flex.value = withSequence(
      withTiming(1, { duration: 200, easing: Easing.out(Easing.ease) }),
      withDelay(700, withTiming(0, { duration: 360, easing: Easing.in(Easing.ease) })),
    );
  };

  const tileStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breath.value * 0.05 + pop.value * 0.12 }],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + breath.value * 0.3,
    transform: [{ scale: 0.96 + breath.value * 0.08 }],
  }));
  const ringAStyle = useAnimatedStyle(() => ({
    opacity: (1 - pulseA.value) * 0.5,
    transform: [{ scale: 0.7 + pulseA.value * 0.9 }],
  }));
  const ringBStyle = useAnimatedStyle(() => ({
    opacity: (1 - pulseB.value) * 0.5,
    transform: [{ scale: 0.7 + pulseB.value * 0.9 }],
  }));
  const sheenStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -38 + shimmer.value * 150 }, { rotate: '18deg' }],
  }));

  const badge = (
    <>
      <Animated.View style={[styles.pulseHalo, haloStyle]} pointerEvents="none" />
      <Animated.View style={[styles.pulseRing, ringAStyle]} pointerEvents="none" />
      <Animated.View
        style={[styles.pulseRing, styles.pulseRingAccent, ringBStyle]}
        pointerEvents="none"
      />
      <Animated.View style={[styles.logoTile, tileStyle]}>
        <View style={styles.logoTileClip}>
          <LinearGradient
            colors={[colors.primary, colors.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['rgba(255,255,255,0.24)', 'rgba(255,255,255,0)']}
            locations={[0, 0.6]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <Animated.View style={[styles.sheenBand, sheenStyle]} pointerEvents="none">
            <LinearGradient
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.sheenFill}
            />
          </Animated.View>
          <JGlyph
            size={72}
            colors={colors}
            fallbackStyle={styles.glyphFallback}
            flex={interactive ? flex : undefined}
          />
        </View>
      </Animated.View>
    </>
  );

  return (
    <View style={styles.col}>
      {interactive ? (
        <Pressable
          onPress={handleFlex}
          style={styles.pulseBox}
          accessibilityRole="imagebutton"
          accessibilityLabel="Jim logo"
        >
          {badge}
        </Pressable>
      ) : (
        <View style={styles.pulseBox}>{badge}</View>
      )}
      <Text style={styles.wordmark}>Jim</Text>
      {showTagline ? <Text style={styles.tagline}>Workout plans, built around you</Text> : null}
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    col: { alignItems: 'center' },
    pulseBox: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center' },
    pulseRing: {
      position: 'absolute',
      width: 88,
      height: 88,
      borderRadius: 44,
      borderWidth: 2,
      borderColor: colors.primary,
    },
    pulseRingAccent: { borderColor: colors.accent },
    pulseHalo: {
      position: 'absolute',
      width: 132,
      height: 132,
      borderRadius: 66,
      backgroundColor: colors.primarySoft,
    },
    logoTile: {
      width: 72,
      height: 72,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.18,
      shadowRadius: 10,
      elevation: 6,
    },
    logoTileClip: {
      width: 72,
      height: 72,
      borderRadius: 20,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheenBand: { position: 'absolute', top: -30, left: 0, width: 26, height: 132 },
    sheenFill: { flex: 1 },
    glyphFallback: {
      fontSize: 42,
      fontWeight: '900',
      fontStyle: 'italic',
      lineHeight: 48,
      letterSpacing: -1,
      color: colors.onPrimary,
      includeFontPadding: false,
      textAlignVertical: 'center',
    },
    wordmark: {
      fontSize: 30,
      fontWeight: '900',
      fontStyle: 'italic',
      letterSpacing: 0.5,
      color: colors.text,
      marginTop: 2,
    },
    tagline: { fontSize: 14, fontWeight: '500', marginTop: 2, color: colors.textMuted },
  });
}
