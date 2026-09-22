/**
 * The end-of-rest beep (GitHub #55): one short sound when the rest timer
 * reaches zero with the app open. The buzz still fires; this is on top of it.
 *
 * ⚠ Guarded `require`, not a static import, the way lib/keepAwake.ts and
 * lib/appleHealth.ts do it: `expo-audio` first ships in the binary after
 * build 35, and a JS bundle that evaluates its native module on an older
 * binary white-screens the app at launch (twice in this app's history).
 *
 * Respects the ringer switch: a phone on silent buzzes only. That is the
 * gym default for most people, and a beep that ignores the switch is the
 * kind of thing a toggle gets turned off for.
 */
import { Platform } from 'react-native';

type AudioModule = {
  createAudioPlayer: (source: unknown) => {
    play: () => void;
    seekTo: (seconds: number) => Promise<void>;
    remove: () => void;
  };
  setAudioModeAsync: (mode: { playsInSilentMode: boolean }) => Promise<void>;
};

const audio: AudioModule | null = (() => {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
    return require('expo-audio') as AudioModule;
  } catch {
    return null;
  }
})();

let player: ReturnType<AudioModule['createAudioPlayer']> | null = null;
let modeSet = false;

export function isRestBeepAvailable(): boolean {
  return audio != null;
}

/** Play the beep. Never throws; a missing module or a failed play is silent. */
export function playRestBeep(): void {
  if (!audio) return;
  try {
    if (!modeSet) {
      modeSet = true;
      void audio.setAudioModeAsync({ playsInSilentMode: false }).catch(() => {});
    }
    if (!player) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
      player = audio.createAudioPlayer(require('../../assets/sounds/rest-over.wav'));
    }
    void player.seekTo(0).catch(() => {});
    player.play();
  } catch {
    /* the buzz already fired */
  }
}
