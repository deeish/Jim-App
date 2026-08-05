import { useContext } from 'react';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';

/**
 * Height of the floating tab bar — the bottom inset every tab screen must add
 * to its scrollable content (or bottom-anchored footer) so nothing hides
 * behind the bar.
 *
 * The bar is `position: 'absolute'` (see NavBar.tsx), so screens no longer
 * stop above it: content scrolls underneath, which is the whole point — the
 * iOS 26 glass material only reads as glass when there is real content moving
 * behind it. The price is that the last rows of every scroll view, and any
 * in-flow footer, would land under the bar without this inset.
 *
 * Reads the context directly instead of calling `useBottomTabBarHeight()`
 * because that hook THROWS when rendered outside a tab navigator, and shared
 * components (WorkoutSession, detail sheets) also render from places with no
 * tab bar — there the correct inset is simply 0.
 */
export function useTabBarInset(): number {
  return useContext(BottomTabBarHeightContext) ?? 0;
}
