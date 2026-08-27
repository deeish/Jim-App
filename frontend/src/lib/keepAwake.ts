/**
 * Keep-awake, wrapped so an absent native module cannot take the app down.
 *
 * ⚠ IT MUST STAY WRAPPED. `expo-keep-awake`'s module file is one line —
 * `export default requireNativeModule('ExpoKeepAwake')` — evaluated at the TOP
 * LEVEL, and `requireNativeModule` THROWS rather than returning null when the
 * module is missing from the binary. That throw lands during module evaluation
 * of whatever imported it: `PlanCalendarWorkoutScreen`, which the calendar
 * navigator imports, which App imports. It fires before any React tree exists,
 * so no error boundary catches it and no try/catch at the call site helps —
 * the app white-screens on launch.
 *
 * The repo has been here before. `GlassSurface` carries the identical guard,
 * added after an unwrapped `isLiquidGlassAvailable()` shipped a crash over the
 * air to a binary built before its package existed. `expo-keep-awake` is a core
 * `expo` dependency and is in the lockfile as far back as build 25, so the risk
 * today is low — but "low" is the confidence that produced that incident, and a
 * JS-only update reaching an older binary is precisely the shape of it.
 *
 * ⚠ `require`, not a static `import`: ES imports are hoisted and would evaluate
 * the native module before the try block could run.
 */

type KeepAwakeModule = {
  activateKeepAwakeAsync: (tag?: string) => Promise<void>;
  deactivateKeepAwake: (tag?: string) => Promise<void>;
};

const keepAwakeModule: KeepAwakeModule | null = (() => {
  try {
    return require('expo-keep-awake') as KeepAwakeModule;
  } catch {
    return null;
  }
})();

/**
 * Take the wake lock. Resolves `true` only if it was actually taken, which is
 * what the caller needs to know: releasing a lock that never activated throws
 * its own error. Never rejects — the lock is denied on web without a user
 * gesture and on any platform with no wake lock at all, and neither is worth
 * failing a workout over.
 */
export async function activateKeepAwake(tag: string): Promise<boolean> {
  if (!keepAwakeModule) return false;
  try {
    await keepAwakeModule.activateKeepAwakeAsync(tag);
    return true;
  } catch {
    return false;
  }
}

/** Release it. Never rejects. Only call this when activation returned true. */
export async function releaseKeepAwake(tag: string): Promise<void> {
  if (!keepAwakeModule) return;
  try {
    await keepAwakeModule.deactivateKeepAwake(tag);
  } catch {
    /* never activated, or already gone */
  }
}
