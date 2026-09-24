import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The one-line "New: tap Muscles to browse the body" hint on the Exercises
 * tab shows until the person dismisses it or opens Muscles once. Either way
 * it is gone for good on this device; failures fall back to showing nothing,
 * never to nagging.
 */
const SEEN_KEY = 'jim_muscles_hint_seen_v1';

export async function isMusclesHintSeen(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SEEN_KEY)) === '1';
  } catch {
    return true;
  }
}

export async function markMusclesHintSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* storage failure only risks showing the hint once more */
  }
}
