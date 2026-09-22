/**
 * The rest-over nudge for a locked phone (GitHub #55): one local notification
 * scheduled for the instant the rest ends, cancelled when the rest is cleared
 * or the app sees the end itself. No sound from the app can play with the
 * screen off, so this is the only way a rest can end in a pocket.
 *
 * ⚠ Guarded `require`, not a static import (lib/keepAwake.ts explains why):
 * `expo-notifications` first ships in the binary after build 35.
 *
 * Permission is asked ONCE, from the card the workout screen shows the first
 * time a rest ends while the app is away (lib/restNudgeRules.ts decides
 * when); never at launch, never for anything else. Nothing here sends a
 * push: local notifications only.
 */
import { Platform } from 'react-native';

type NotificationsModule = {
  setNotificationHandler: (handler: {
    handleNotification: () => Promise<{
      shouldShowBanner: boolean;
      shouldShowList: boolean;
      shouldPlaySound: boolean;
      shouldSetBadge: boolean;
    }>;
  }) => void;
  getPermissionsAsync: () => Promise<{ granted: boolean; status: string }>;
  requestPermissionsAsync: (p?: unknown) => Promise<{ granted: boolean; status: string }>;
  scheduleNotificationAsync: (req: {
    content: { title: string; body?: string; sound?: boolean | string };
    trigger: { type: 'date'; date: Date | number };
  }) => Promise<string>;
  cancelScheduledNotificationAsync: (id: string) => Promise<void>;
};

const notifications: NotificationsModule | null = (() => {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
    const mod = require('expo-notifications') as NotificationsModule;
    // With the app in front, the screen's own buzz and beep cover it: the
    // banner would be a second, louder announcement of the same second.
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    return mod;
  } catch {
    return null;
  }
})();

export function isRestNudgeAvailable(): boolean {
  return notifications != null;
}

export type RestNudgePermission = 'granted' | 'declined';

/** The one system ask. Resolves 'declined' when the module is absent. */
export async function requestRestNudgePermission(): Promise<RestNudgePermission> {
  if (!notifications) return 'declined';
  try {
    const current = await notifications.getPermissionsAsync();
    if (current.granted) return 'granted';
    const asked = await notifications.requestPermissionsAsync();
    return asked.granted ? 'granted' : 'declined';
  } catch {
    return 'declined';
  }
}

let scheduledId: string | null = null;
let scheduledFor = 0;

/**
 * Schedule the nudge for `endsAtMs`, replacing any earlier one. Skips a
 * rest that is already over or under a few seconds away: by the time the
 * system delivered it the user would be looking at the tile anyway.
 */
export async function scheduleRestNudge(endsAtMs: number, body: string): Promise<void> {
  if (!notifications) return;
  await cancelRestNudge();
  if (endsAtMs - Date.now() < 3_000) return;
  try {
    scheduledFor = endsAtMs;
    scheduledId = await notifications.scheduleNotificationAsync({
      content: { title: 'Rest is over', body, sound: true },
      trigger: { type: 'date', date: endsAtMs },
    });
  } catch {
    scheduledId = null;
    scheduledFor = 0;
  }
}

export async function cancelRestNudge(): Promise<void> {
  if (!notifications || !scheduledId) return;
  const id = scheduledId;
  scheduledId = null;
  scheduledFor = 0;
  try {
    await notifications.cancelScheduledNotificationAsync(id);
  } catch {
    /* already delivered or gone */
  }
}

/** For the screen's own bookkeeping: what is scheduled right now. */
export function scheduledRestNudgeEndsAt(): number {
  return scheduledId ? scheduledFor : 0;
}
