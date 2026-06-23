import AsyncStorage from '@react-native-async-storage/async-storage';

// Tracks the most recent changelog entry id the user has already seen, so the
// What's New popup auto-shows once per release and the header badge clears.
const STORAGE_KEY = 'jim_whatsnew_seen_v1';

/** Returns the id of the most recent changelog entry the user has seen, or null. */
export async function getSeenChangelogId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Records that the user has seen up to the given changelog entry id. */
export async function setSeenChangelogId(id: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}
