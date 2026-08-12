import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  visible: boolean;
  /** Dismiss request (scrim tap, Android back). The parent clears its state. */
  onClose: () => void;
  /** Scrim color, e.g. `colors.overlay` / `colors.scrim`. */
  scrimColor: string;
  children: React.ReactNode;
};

/**
 * Bottom-sheet presenter that animates its two layers independently: the card
 * slides up/down while the scrim fades in place. React Native's built-in
 * `animationType="slide"` animates the whole modal subtree as one unit, so
 * the grey backdrop visibly rode down the screen together with the card on
 * dismiss.
 *
 * The slide transform lives on the flex positioner itself — inserting wrapper
 * views between it and the sheet card breaks percentage `maxHeight` styles on
 * cards (they resolve against a definite-height parent). For the same reason
 * the card must handle its own tap-guard: make the card a Pressable that
 * calls `e.stopPropagation()` so only true scrim taps dismiss.
 *
 * Stays mounted through the exit animation, rendering a snapshot of the last
 * visible children — parents can clear their sheet state immediately on close
 * without the content vanishing mid-slide.
 */
export default function SheetModal({ visible, onClose, scrimColor, children }: Props) {
  const { height } = useWindowDimensions();
  const [rendered, setRendered] = useState(visible);
  const lastChildrenRef = useRef<React.ReactNode>(children);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (visible) lastChildrenRef.current = children;
  });

  useEffect(() => {
    if (visible) {
      setRendered(true);
      progress.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
    } else {
      progress.value = withTiming(
        0,
        { duration: 200, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(setRendered)(false);
        },
      );
    }
  }, [visible, progress]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * height }],
  }));

  if (!rendered && !visible) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { backgroundColor: scrimColor }, scrimStyle]}
      />
      <AnimatedPressable
        style={[styles.positioner, slideStyle]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        {visible ? children : lastChildrenRef.current}
      </AnimatedPressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  positioner: { flex: 1, justifyContent: 'flex-end' },
});
