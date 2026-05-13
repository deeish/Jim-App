import { Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

/** Writes JSON and opens the share sheet (native); falls back to RN Share. */
export async function shareJsonExport(json: string, dialogTitle: string): Promise<void> {
  if (Platform.OS !== 'web' && FileSystem.cacheDirectory) {
    const path = `${FileSystem.cacheDirectory}jim-data-export-${Date.now()}.json`;
    await FileSystem.writeAsStringAsync(path, json);
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(path, {
        mimeType: 'application/json',
        dialogTitle,
      });
      return;
    }
  }

  await Share.share({
    title: dialogTitle,
    message:
      json.length < 950_000 ? json : `${json.slice(0, 500_000)}\n\n… [truncated]`,
  });
}
