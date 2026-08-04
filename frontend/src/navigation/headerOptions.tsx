import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import type { ColorPalette } from '../theme';
import { text, weight } from '../theme';

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
 *
 * THE BACK BUTTON DEPENDS ON AN INVARIANT HELD ELSEWHERE. A native header only
 * draws one when the route has something beneath it in its own stack, so any
 * screen using these options must never be the first route in the Plan stack.
 * That is already guaranteed: `HomeScreen`'s `goToHistory`/`goToProgress` pass
 * `initial: false`, which keeps `PlanList` as the stack's first route even when
 * the Plan tab has not been mounted yet. Dropping that flag would silently strip
 * the back button off every screen configured here.
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
