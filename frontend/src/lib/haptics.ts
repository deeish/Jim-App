import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Thin wrapper around expo-haptics. No-ops on web (haptics aren't supported
 * there) and swallows errors so a haptics failure never breaks an interaction.
 */
const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

export const haptics = {
  /** Light tick for selecting an option / toggling a chip. */
  select() {
    if (!enabled) return;
    void Haptics.selectionAsync().catch(() => {});
  },
  /** Medium tap when advancing a step. */
  step() {
    if (!enabled) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  /** Success notification when finishing onboarding. */
  success() {
    if (!enabled) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
};
