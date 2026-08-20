import React, { useCallback, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { spacing, useTheme } from '../theme';
import PlanCalendarScopeBar, {
  SCOPE_BAR_HEIGHT,
  type CalendarScope,
} from './PlanCalendarScopeBar';

/**
 * The FROZEN Month | Week | Day selector (Dylan's ask: the bar must not move
 * while flipping between the three scopes).
 *
 * The three scopes are separate native-stack screens, so a bar rendered
 * inside each screen rides the push/pop animation — two bars visibly cross
 * during every flip. Instead the navigator renders ONE bar in an overlay
 * above the stack, and each scope screen registers itself while focused
 * (its scope, its header height, and its navigation handler). Screens slide
 * beneath the stationary bar; non-scope screens (Workout, Templates, …)
 * never register, so the bar fades away when the stack goes past the three
 * scope levels.
 *
 * Screens reserve the bar's strip with `marginTop: SCOPE_BAR_SPACE` on their
 * ScrollView, keeping scrolling content, the pull-to-refresh spinner and the
 * swipe pagers below the bar instead of under it.
 */

type ScopeRegistration = {
  key: number;
  scope: CalendarScope;
  headerHeight: number;
  onNavigate: (scope: CalendarScope) => void;
};

/** Gap between header and bar; the bar; screens reserve exactly this. */
export const SCOPE_BAR_SPACE = spacing.lg + SCOPE_BAR_HEIGHT;
/** Soft clip: content fades out under the reserved strip instead of slicing. */
const EDGE_FADE_HEIGHT = 12;

let current: ScopeRegistration | null = null;
let nextKey = 1;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Scope screens call this to own the frozen bar while focused. `onNavigate`
 * must be referentially stable (useCallback) — it re-registers on change.
 */
export function useFrozenScopeBar(
  scope: CalendarScope,
  onNavigate: (scope: CalendarScope) => void,
): void {
  const headerHeight = useHeaderHeight();
  useFocusEffect(
    useCallback(() => {
      const key = nextKey++;
      current = { key, scope, headerHeight, onNavigate };
      emit();
      return () => {
        // Only clear our own registration — on a scope flip the next screen
        // may have registered before this cleanup runs.
        if (current?.key === key) {
          current = null;
          emit();
        }
      };
    }, [scope, headerHeight, onNavigate]),
  );
}

/** Rendered by PlanCalendarNavigator as a sibling AFTER the stack. */
export function PlanCalendarScopeBarOverlay() {
  const { colors } = useTheme();
  // useSyncExternalStore (not a manual listener effect): the scope screens
  // register during the stack subtree's effect phase, BEFORE a later-sibling
  // overlay's own effects run — a subscribe-in-effect overlay misses that
  // first registration and renders nothing.
  const reg = useSyncExternalStore(subscribe, () => current);
  return (
    // box-none: only the bar itself catches touches — everything else falls
    // through to the screens (incl. their horizontal swipe pagers).
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {reg && (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(120)}
          pointerEvents="box-none"
          style={{ position: 'absolute', left: 0, right: 0, top: reg.headerHeight }}
        >
          <View pointerEvents="box-none" style={styles.barWrap}>
            <PlanCalendarScopeBar active={reg.scope} onNavigate={reg.onNavigate} />
          </View>
          <LinearGradient
            pointerEvents="none"
            colors={[colors.background, `${colors.background}00`]}
            style={styles.edgeFade}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  barWrap: {
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  edgeFade: {
    height: EDGE_FADE_HEIGHT,
  },
});
