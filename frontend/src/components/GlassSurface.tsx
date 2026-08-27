import React from 'react';
import { View, type ViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useTheme } from '../theme';

/**
 * A surface that renders as real Liquid Glass where the platform has it, and as
 * an ordinary opaque panel everywhere else.
 *
 * `isLiquidGlassAvailable()` is true only on iOS 26 and up, in a binary built
 * against the iOS 26 SDK. Older iOS, Android and web all take the fallback, so
 * every call site needs a `fallbackColor` that looks right on its own — glass is
 * an enhancement here, never the thing holding a layout together.
 *
 * The check is a module-level constant on purpose. It cannot change during a
 * session, and calling it per render would put a native bridge hop in the path
 * of every tab-bar frame.
 *
 * IT MUST STAY WRAPPED. `isLiquidGlassAvailable()` is not a safe probe — on iOS
 * it calls `requireNativeModule('ExpoGlassEffect')`, which *throws* rather than
 * returning false when the module is absent from the binary. Unwrapped, that
 * throw happens during module evaluation of this file, which NavBar imports,
 * which App imports: it fires before any React tree exists, so no error boundary
 * and no fallback can catch it. The app would white-screen on launch.
 *
 * That is not hypothetical. Any JS-only update delivered to a binary built
 * before this package was added would hit exactly that path, which is why the
 * app version is also bumped in this change — a native dependency and an
 * unchanged runtimeVersion is the combination that ships a crash over the air.
 *
 * COLOUR SCHEME FOLLOWS THE APP'S THEME, never the device's. The material
 * defaults to `'auto'`, which reads the *device* appearance — and this app's
 * theme is a manual choice in Profile, not a mirror of the system setting, so
 * `'auto'` is wrong in both directions: a light glass bar under a dark app, or
 * a dark one under a light app, depending on the phone rather than the choice
 * the user made. Passing `mode` is what keeps the bar with the app.
 *
 * (This was pinned to `'light'` while the app shipped a single light theme,
 * with a note to switch when a dark theme returned. It returned; the switch is
 * this. `userInterfaceStyle: "light"` in app.json is a separate lever — it
 * still governs the native surfaces this app does not paint, keyboards and
 * system alerts among them.)
 */
export const glassAvailable = ((): boolean => {
  try {
    return isLiquidGlassAvailable();
  } catch {
    // Native module missing: an older binary running a newer JS bundle. Fall
    // back rather than take the whole app down.
    return false;
  }
})();

type Props = ViewProps & {
  /** Opaque colour used wherever glass is unavailable. Defaults to the card surface. */
  fallbackColor?: string;
  /** 'regular' for chrome that must stay legible; 'clear' for decorative overlays. */
  glassEffectStyle?: 'regular' | 'clear';
  style?: StyleProp<ViewStyle>;
};

export default function GlassSurface({
  fallbackColor,
  glassEffectStyle = 'regular',
  style,
  children,
  ...rest
}: Props) {
  const { colors, mode } = useTheme();

  if (!glassAvailable) {
    return (
      <View style={[{ backgroundColor: fallbackColor ?? colors.surface }, style]} {...rest}>
        {children}
      </View>
    );
  }

  return (
    <GlassView style={style} glassEffectStyle={glassEffectStyle} colorScheme={mode} {...rest}>
      {children}
    </GlassView>
  );
}
