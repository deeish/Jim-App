import { Alert, Platform } from 'react-native';

export type ConfirmDialogOptions = {
  title: string;
  message?: string;
  confirmText: string;
  cancelText?: string;
  /** Maps to `destructive` on native; ignored on web (`window.confirm` has no styling). */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
};

/**
 * Confirmation dialog that works on native and on web.
 * `react-native-web` implements `Alert.alert` as a no-op; browsers need `window.confirm`.
 */
export function showConfirmDialog(opts: ConfirmDialogOptions): void {
  const {
    title,
    message = '',
    confirmText,
    cancelText = 'Cancel',
    destructive,
    onConfirm,
    onCancel,
  } = opts;

  if (Platform.OS === 'web') {
    const combined = message.trim()
      ? `${title}\n\n${message}`
      : title;
    if (typeof window !== 'undefined' && window.confirm(combined)) {
      onConfirm();
    } else {
      onCancel?.();
    }
    return;
  }

  Alert.alert(title, message || undefined, [
    { text: cancelText, style: 'cancel', onPress: onCancel },
    {
      text: confirmText,
      style: destructive ? 'destructive' : 'default',
      onPress: onConfirm,
    },
  ]);
}
