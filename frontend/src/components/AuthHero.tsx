import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { leading, spacing, text, useTheme } from '../theme';
import Aurora from './Aurora';
import JimLogo from './JimLogo';
import JimMark from './JimMark';

/** Below this window height (iPhone SE) the lockup shrinks so the sheet keeps full-size controls. */
const COMPACT_MAX_HEIGHT = 700;

type Props = {
  /**
   * Keyboard is up: fold the lockup into a one-line brand row so the sheet's
   * controls ride up above the keyboard without the hero squeezing them.
   */
  collapsed?: boolean;
  /** One line under the wordmark (the account's benefit, per Apple's HIG). */
  tagline?: string;
  /** Extra content under the lockup (the welcome headline). */
  children?: React.ReactNode;
  /** Tap-to-flex easter egg on the mark (welcome only). */
  interactive?: boolean;
};

/**
 * The top half of every signed-out screen: aurora backdrop + brand lockup. It is
 * the part of the phone people look at but cannot comfortably reach one-handed,
 * so nothing here is tappable; the sheet below holds every control.
 */
export default function AuthHero({ collapsed = false, tagline, children, interactive = false }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compact = height < COMPACT_MAX_HEIGHT;

  return (
    <View style={styles.hero}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Aurora colors={colors} />
      </View>
      {collapsed ? (
        <Animated.View
          entering={FadeIn.duration(180)}
          style={[styles.brandRow, { paddingTop: insets.top + spacing.sm }]}
        >
          <JimMark size={30} />
          <Text style={[styles.miniWordmark, { color: colors.text }]}>Jim</Text>
        </Animated.View>
      ) : (
        <Animated.View
          entering={FadeInDown.duration(260)}
          style={[styles.lockup, { paddingTop: insets.top + spacing.lg }]}
        >
          {/* JimLogo has one size; on short screens shrink it in place rather than
              letting it push the sheet's controls under the home indicator. */}
          <View style={compact ? styles.compactBox : undefined}>
            <View style={compact ? styles.compactScale : undefined}>
              <JimLogo interactive={interactive} />
            </View>
          </View>
          {tagline ? (
            <Text style={[styles.tagline, { color: colors.textMuted }]}>{tagline}</Text>
          ) : null}
          {children}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flex: 1, minHeight: 0, overflow: 'hidden' },
  lockup: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xl,
  },
  compactBox: { height: 150, alignItems: 'center', justifyContent: 'center' },
  compactScale: { transform: [{ scale: 0.8 }] },
  tagline: {
    fontSize: text.callout,
    lineHeight: leading.callout,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 44,
    paddingHorizontal: spacing.xxl,
  },
  miniWordmark: { fontSize: text.title, fontWeight: '900', letterSpacing: 0.5 },
});
