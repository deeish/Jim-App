import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * Direct-manipulation pager for the calendar's day/week views (the WWDC
 * "fluid interfaces" recipe): three live panes in a strip, the pan drags the
 * strip 1:1, release projects the finger's velocity into a spring, and the
 * whole thing is interruptible — you can catch a page mid-flight.
 *
 * Pages are integer indices; the screen owns the index↔date mapping and keeps
 * the committed index in its route params. Panes are absolutely positioned at
 * `i * step` inside the translating strip, so when the render window shifts
 * after a commit nothing visible ever moves — no reset, no flicker.
 */

/** Gap of bare background between pages (the iOS home-screen grammar). */
const GUTTER = 20;
/** Any real flick commits, even a short one. */
const FLICK_VELOCITY = 500;
/** Position + velocity·factor decides intent (Apple's projection rule). */
const PROJECTION = 0.2;
/** The settle spring: quick, velocity-seeded, lands with a hint of weight. */
const SETTLE = { damping: 30, stiffness: 260, mass: 1 };
/** The one-time discoverability nudge: slide out, spring back. */
const HINT_DELAY_MS = 600;
const HINT_PEEK_PX = 28;

// Index math is UTC-pure on the ISO parts so DST can never skew a page.
// The epoch is a Monday, which makes week indices exact sevenths.
const EPOCH_UTC = Date.UTC(2020, 0, 6);
const DAY_MS = 86_400_000;

/** Days since the epoch Monday for a YYYY-MM-DD string. */
export function calendarDayIndex(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - EPOCH_UTC) / DAY_MS);
}

/** The YYYY-MM-DD string for a day index. */
export function calendarDayIso(index: number): string {
  const date = new Date(EPOCH_UTC + index * DAY_MS);
  const y = date.getUTCFullYear();
  const m = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const d = `${date.getUTCDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export type CalendarPagerHandle = {
  /** Page one step with the same slide a swipe makes (the chevron path). */
  goTo: (delta: 1 | -1) => void;
};

type Props = {
  /** The committed page (screen-owned, usually derived from route params). */
  index: number;
  /**
   * A page committed: update the route params. `fromGesture` marks swipes
   * (vs chevron taps / external jumps) for the screen's tap-swallow guard.
   */
  onIndexChange: (next: number, fromGesture: boolean) => void;
  renderPage: (index: number) => React.ReactNode;
  /** Fires the moment the settling page crosses the halfway line (haptics). */
  onBoundaryCross?: () => void;
  /**
   * Every pan release, committed or not — the web tap-swallow guard needs it:
   * a settled-back drag still delivers a browser click on release.
   */
  onGestureEnd?: () => void;
  /** Play the one-time "tomorrow peeks" nudge after mounting. */
  hint?: boolean;
};

const CalendarPager = forwardRef<CalendarPagerHandle, Props>(function CalendarPager(
  { index, onIndexChange, renderPage, onBoundaryCross, onGestureEnd, hint = false },
  ref,
) {
  const { width: windowWidth } = useWindowDimensions();
  const [width, setWidth] = useState(windowWidth);
  const step = width + GUTTER;

  const offset = useSharedValue(-index * step);
  // The strip's committed page, mirrored for the gesture worklet.
  const indexSV = useSharedValue(index);
  const lastIndexRef = useRef(index);
  // Armed by a commit: fire the tick once when `offset` crosses `buzzAt`.
  const buzzDir = useSharedValue(0);
  const buzzAt = useSharedValue(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== width) setWidth(w);
  };

  // Re-base on width changes (first layout, rotation): snap, don't animate.
  useEffect(() => {
    cancelAnimation(offset);
    offset.value = -lastIndexRef.current * step;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // External index changes (month → day jumps, "Week 1", a moved workout):
  // adjacent pages slide like a swipe, far jumps snap.
  useEffect(() => {
    if (index === lastIndexRef.current) return;
    const adjacent = Math.abs(index - lastIndexRef.current) === 1;
    lastIndexRef.current = index;
    indexSV.value = index;
    if (adjacent) {
      offset.value = withSpring(-index * step, SETTLE);
    } else {
      cancelAnimation(offset);
      offset.value = -index * step;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, step]);

  const tick = useCallback(() => {
    onBoundaryCross?.();
  }, [onBoundaryCross]);

  useAnimatedReaction(
    () => offset.value,
    (v) => {
      if (buzzDir.value === 1 && v <= buzzAt.value) {
        buzzDir.value = 0;
        runOnJS(tick)();
      } else if (buzzDir.value === -1 && v >= buzzAt.value) {
        buzzDir.value = 0;
        runOnJS(tick)();
      }
    },
  );

  const commitFromGesture = useCallback(
    (target: number) => {
      lastIndexRef.current = target;
      onIndexChange(target, true);
    },
    [onIndexChange],
  );

  const gestureEnded = useCallback(() => {
    onGestureEnd?.();
  }, [onGestureEnd]);

  const dragStart = useSharedValue(0);
  const pan = Gesture.Pan()
    .activeOffsetX([-24, 24])
    .failOffsetY([-16, 16])
    .onStart(() => {
      // Interruptible: grab the strip wherever it is, mid-spring included.
      cancelAnimation(offset);
      buzzDir.value = 0;
      dragStart.value = offset.value;
    })
    .onUpdate((e) => {
      offset.value = dragStart.value + e.translationX;
    })
    .onEnd((e) => {
      runOnJS(gestureEnded)();
      const page = indexSV.value;
      const rest = -page * step;
      const disp = offset.value - rest;
      const proj = disp + PROJECTION * e.velocityX;
      let delta = 0;
      if (proj < -step / 2 || (e.velocityX < -FLICK_VELOCITY && disp < 0)) delta = 1;
      else if (proj > step / 2 || (e.velocityX > FLICK_VELOCITY && disp > 0)) delta = -1;
      const target = page + delta;
      if (delta !== 0) {
        indexSV.value = target;
        buzzAt.value = -(page + delta / 2) * step;
        buzzDir.value = delta;
        runOnJS(commitFromGesture)(target);
      }
      offset.value = withSpring(-target * step, { ...SETTLE, velocity: e.velocityX });
    });

  useImperativeHandle(
    ref,
    () => ({
      goTo: (delta) => {
        const target = lastIndexRef.current + delta;
        buzzAt.value = -(lastIndexRef.current + delta / 2) * step;
        buzzDir.value = delta;
        lastIndexRef.current = target;
        indexSV.value = target;
        offset.value = withSpring(-target * step, SETTLE);
        onIndexChange(target, false);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step, onIndexChange],
  );

  // The one-time nudge: after the content settles, tomorrow peeks in and the
  // page springs back — the interface demonstrating its own gesture, once.
  // A pan starting mid-nudge cancels it (the real gesture teaches better).
  const hintPlayed = useRef(false);
  useEffect(() => {
    if (!hint || hintPlayed.current) return;
    hintPlayed.current = true;
    const rest = -lastIndexRef.current * step;
    offset.value = withDelay(
      HINT_DELAY_MS,
      withSequence(
        withTiming(rest - HINT_PEEK_PX, { duration: 300, easing: Easing.out(Easing.cubic) }),
        withSpring(rest, { damping: 14, stiffness: 170 }),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hint, step]);

  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.viewport} onLayout={onLayout}>
        <Animated.View style={[StyleSheet.absoluteFillObject, stripStyle]}>
          {[index - 1, index, index + 1].map((i) => (
            <Pane key={i} i={i} step={step} width={width} offset={offset} isCenter={i === index}>
              {renderPage(i)}
            </Pane>
          ))}
        </Animated.View>
      </View>
    </GestureDetector>
  );
});

function Pane({
  i,
  step,
  width,
  offset,
  isCenter,
  children,
}: {
  i: number;
  step: number;
  width: number;
  offset: SharedValue<number>;
  isCenter: boolean;
  children: React.ReactNode;
}) {
  // Depth garnish: a pane eases from 97% scale / 92% opacity at one page out
  // to full as it centers. One effect, kept subtle.
  const style = useAnimatedStyle(() => {
    const dist = Math.min(Math.abs(i * step + offset.value) / step, 1);
    return {
      transform: [{ scale: interpolate(dist, [0, 1], [1, 0.97]) }],
      opacity: interpolate(dist, [0, 1], [1, 0.92]),
    };
  }, [i, step]);

  return (
    <Animated.View
      style={[styles.pane, { left: i * step, width }, style]}
      importantForAccessibility={isCenter ? 'auto' : 'no-hide-descendants'}
      accessibilityElementsHidden={!isCenter}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    overflow: 'hidden',
  },
  pane: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
});

export default CalendarPager;
