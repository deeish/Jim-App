import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Thin wrapper around expo-haptics. No-ops on web (haptics aren't supported
 * there) and swallows errors so a haptics failure never breaks an interaction.
 *
 * ⚠ Tiers calibrated on-device (2026-08-15 build 23, re-confirmed 2026-08-18):
 * the textbook `selectionAsync` tick and Light-for-steps mapping were reported
 * imperceptible in real use, so every role runs ONE TIER STRONGER than the
 * iOS textbook. Don't quietly walk these back without another device pass.
 * (Same rule as the calendar's buzz* helpers in lib/planCalendarPrototype.)
 */
const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

export const haptics = {
  /** Baseline tap for ANY interactive element — buttons, rows, cards, tabs.
   *  Light impact, not the selection tick (which doesn't register). */
  tap() {
    if (!enabled) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  /** Selecting an option / toggling a chip — same weight as `tap`. */
  select() {
    if (!enabled) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  /** Advancing a step / committing something small. */
  step() {
    if (!enabled) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  /** Success notification when finishing a flow. */
  success() {
    if (!enabled) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
};
