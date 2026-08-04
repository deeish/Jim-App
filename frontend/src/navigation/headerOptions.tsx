import React, { useLayoutEffect } from 'react';
import { Platform, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import type { ColorPalette } from '../theme';
import { spacing, text, weight } from '../theme';

/**
 * Shared options for screens that use the real native header instead of a
 * hand-rolled one.
 *
 * Every navigator in this app used to pass `headerShown: false` and each screen
 * drew its own title row. That costs more than it looks: no large title, no
 * scroll-edge treatment, no automatic back-gesture affordance, and — on iOS 26 —
 * no Liquid Glass, because the system only applies it to real UINavigationBars.
 * Screens that opt in here get all of it for free.
 *
 * `headerTransparent` is deliberately NOT set. A transparent bar needs the screen
 * to manage its own content inset, which is exactly the manual bookkeeping this
 * is meant to remove.
 */
export function nativeHeaderOptions(colors: ColorPalette): NativeStackNavigationOptions {
  return {
    headerShown: true,
    headerTintColor: colors.primary,
    headerTitleStyle: {
      color: colors.text,
      fontSize: text.headline,
      fontWeight: weight.bold,
    },
    // iOS-only; Android quietly renders a standard header instead.
    headerLargeTitle: true,
    headerLargeTitleStyle: {
      color: colors.text,
      fontSize: text.display,
      fontWeight: weight.heavy,
    },
    // Opaque while scrolled, blending into the page at rest — the standard iOS
    // grouped-table look, and the surface the system glassifies on iOS 26.
    headerLargeTitleShadowVisible: false,
    headerStyle: { backgroundColor: colors.background },
    // v6 spelling; v7 renames this to headerBackButtonDisplayMode: 'minimal'.
    headerBackTitleVisible: false,
  };
}

/**
 * A native header only draws a back button when there is something to pop.
 *
 * `History` breaks that assumption: Home reaches it with
 * `navigate('Plan', { screen: 'History' })`, which can leave it as the only route
 * in the Plan stack. The hand-rolled header it replaced always showed an arrow and
 * fell back to the plan list in that case, so without this the screen would lose
 * its way out entirely. Same reasoning for `Progress`.
 *
 * Only installs a button when the stack really is empty behind us — otherwise the
 * platform's own back button (and its swipe gesture) is left alone.
 */
export function useStackBackFallback(
  navigation: {
    canGoBack: () => boolean;
    setOptions: (o: Partial<NativeStackNavigationOptions>) => void;
    navigate: (screen: never) => void;
  },
  fallbackRoute: string,
  colors: ColorPalette,
) {
  useLayoutEffect(() => {
    if (navigation.canGoBack()) return;
    navigation.setOptions({
      headerLeft: () => (
        <Pressable
          onPress={() => navigation.navigate(fallbackRoute as never)}
          accessibilityRole="button"
          accessibilityLabel="Back to plan"
          hitSlop={spacing.sm}
          style={{ paddingRight: spacing.sm }}
        >
          <Ionicons
            name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'}
            size={24}
            color={colors.primary}
          />
        </Pressable>
      ),
    });
  }, [navigation, fallbackRoute, colors.primary]);
}
